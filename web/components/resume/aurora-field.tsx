"use client";

import { useEffect, useRef } from "react";

/**
 * Hero 极光背景 · WebGL 流体着色器版：
 * 分形噪声（fbm）双重域扭曲 → 三条流动极光带（蓝/紫/品红），
 * 滚动进度与主题切换作为 uniform 平滑注入（绸缎随滚动漂移、明暗渐变过渡）。
 * 降级链：WebGL 不可用/上下文丢失 → CSS blob 层兜底；reduced-motion 只渲一帧静态。
 * 性能：移动端 0.75x 分辨率渲染再拉伸（画面本就柔和，无损观感），离屏/后台暂停。
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_scroll;
uniform float u_dark;
uniform float u_seed;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = rot * p * 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv; p.x *= u_res.x / u_res.y;
  float t = u_time * 0.055 + u_scroll * 0.9 + u_seed;

  // 双重域扭曲：q 扭 r，r 再扭 fbm —— 绸缎流动感的来源
  vec2 q = vec2(fbm(p * 1.6 + vec2(0.0, t)), fbm(p * 1.6 + vec2(5.2, t * 1.3)));
  vec2 r = vec2(fbm(p * 1.9 + 3.4 * q + vec2(1.7, 9.2) + t * 0.25),
                fbm(p * 1.9 + 3.4 * q + vec2(8.3, 2.8) - t * 0.2));
  float f = fbm(p * 1.4 + 4.0 * r);

  float band1 = smoothstep(0.35, 0.95, f + q.x * 0.35);
  float band2 = smoothstep(0.30, 0.90, fbm(p * 1.1 - r * 2.2 + t * 0.15));
  float glow  = smoothstep(0.25, 0.85, r.y);

  // 双主题调色板（u_dark 0→1 平滑过渡）
  vec3 blue   = mix(vec3(0.02, 0.36, 0.80), vec3(0.16, 0.55, 1.00), u_dark);
  vec3 violet = mix(vec3(0.42, 0.34, 0.95), vec3(0.49, 0.37, 1.00), u_dark);
  vec3 magenta= mix(vec3(0.72, 0.30, 0.90), vec3(0.75, 0.35, 0.95), u_dark);

  vec3 col = blue * band1 * 0.60 + violet * band2 * 0.50 + magenta * glow * 0.34;
  float intensity = mix(0.62, 0.85, u_dark); // 亮色收敛些，暗色放开些

  // 中心压暗保正文可读 + 上下渐隐 + 轻微噪点去色带
  float center = distance(uv, vec2(0.5, 0.46));
  col *= mix(1.0, 0.42, smoothstep(0.12, 0.55, center));
  col *= smoothstep(0.0, 0.40, uv.y) * smoothstep(1.0, 0.60, uv.y);
  col += (hash(gl_FragCoord.xy + u_seed) - 0.5) * 0.012;

  float alpha = clamp(max(max(col.r, col.g), col.b) * 1.35, 0.0, 0.9) * intensity;
  gl_FragColor = vec4(col * intensity, alpha);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function AuroraField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) return; // WebGL 不可用：CSS blob 层兜底

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    // 全屏三角形
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uScroll = gl.getUniformLocation(program, "u_scroll");
    const uDark = gl.getUniformLocation(program, "u_dark");
    const uSeed = gl.getUniformLocation(program, "u_seed");
    const seed = Math.random() * 100;

    // 移动端 0.75x 渲染再拉伸：画面柔和，省填充率
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    const renderScale = isCoarse ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.25);
    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width * renderScale));
      height = Math.max(1, Math.round(rect.height * renderScale));
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    };
    resize();
    window.addEventListener("resize", resize);

    const darkTarget0 = document.documentElement.classList.contains("dark") ? 1 : 0;
    /** 画一帧：全部 uniform + 提交绘制 */
    const paint = (timeSec: number, scrollV: number, darkV: number) => {
      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, timeSec);
      gl.uniform1f(uScroll, scrollV);
      gl.uniform1f(uDark, darkV);
      gl.uniform1f(uSeed, seed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // reduced-motion：静态一帧即止（时间冻结在随机相位），不注册主题/滚动监听与渲染循环
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      paint(40 + seed, 0, darkTarget0);
      return () => window.removeEventListener("resize", resize);
    }

    // 主题与滚动：目标值 + 每帧插值 = 平滑过渡
    let darkTarget = darkTarget0;
    let dark = darkTarget;
    let scrollTarget = 0;
    let scroll = 0;
    const themeObserver = new MutationObserver(() => {
      darkTarget = document.documentElement.classList.contains("dark") ? 1 : 0;
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const onScroll = () => {
      scrollTarget = Math.min(Math.max(window.scrollY / window.innerHeight, 0), 1);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const start = performance.now();

    let frame = 0;
    let running = false;
    let intersecting = true;
    const draw = (now: number) => {
      if (!running) return;
      dark += (darkTarget - dark) * 0.05;
      scroll += (scrollTarget - scroll) * 0.08;
      paint((now - start) / 1000, scroll, dark);
      frame = requestAnimationFrame(draw);
    };
    const startLoop = () => {
      if (running || !intersecting || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(draw);
    };
    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting;
        if (intersecting && !document.hidden) startLoop();
        else stopLoop();
      },
      { threshold: 0 },
    );
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? stopLoop() : startLoop());
    document.addEventListener("visibilitychange", onVisibility);
    startLoop();

    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        stopLoop();
        io.disconnect();
      },
      { once: true },
    );
    // 着色器就位：CSS blob 降为衬托层
    canvas.parentElement?.classList.add("webgl-on");

    return () => {
      stopLoop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <div aria-hidden className="aurora-field">
      <div className="aurora-blob ab-1" />
      <div className="aurora-blob ab-2" />
      <div className="aurora-blob ab-3" />
      <canvas ref={canvasRef} className="aurora-canvas" />
      <div className="aurora-grid" />
    </div>
  );
}
