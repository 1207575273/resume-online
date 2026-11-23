"use client";

import { useEffect, useRef } from "react";

/**
 * WebGL 点阵消融涟漪(移植自 hicreator hero 的粒子背景):
 * 全屏 fragment 把 hero 分成点阵,fbm 噪声压暗为隐场;
 * 指针滑过/点击处落下高斯环带涟漪,环带经过处点亮成柠檬绿颗粒点,
 * 2s 内衰减消散——「滑动时粒子扩散」的真相即此,并非真实粒子系统。
 * 降级链:无 WebGL2 / reduced-motion → 完全不渲染(安静空 canvas)。
 */

const VERT = `#version 300 es
void main() {
  // 全屏大三角形(无需 VBO 数据)
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uColor;
uniform vec2  uPos[8];     // 涟漪落点(像素坐标,-1 = 空)
uniform float uTimes[8];   // 各落点时刻(秒)

out vec4 fragColor;

/* ---------- 值噪声 + fbm(hicreator 同构) ---------- */
float hash11(float n) { return fract(sin(n) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 ip = floor(p), fp = fract(p);
  float n000 = hash11(dot(ip + vec3(0., 0., 0.), vec3(1., 57., 113.)));
  float n100 = hash11(dot(ip + vec3(1., 0., 0.), vec3(1., 57., 113.)));
  float n010 = hash11(dot(ip + vec3(0., 1., 0.), vec3(1., 57., 113.)));
  float n110 = hash11(dot(ip + vec3(1., 1., 0.), vec3(1., 57., 113.)));
  float n001 = hash11(dot(ip + vec3(0., 0., 1.), vec3(1., 57., 113.)));
  float n101 = hash11(dot(ip + vec3(1., 0., 1.), vec3(1., 57., 113.)));
  float n011 = hash11(dot(ip + vec3(0., 1., 1.), vec3(1., 57., 113.)));
  float n111 = hash11(dot(ip + vec3(1., 1., 1.), vec3(1., 57., 113.)));
  vec3 w = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(n000, n100, w.x), mix(n010, n110, w.x), w.y),
    mix(mix(n001, n101, w.x), mix(n011, n111, w.x), w.y), w.z) * 2.0 - 1.0;
}
float fbm(vec2 uv, float t) {
  vec3 p = vec3(uv * 2.2, t);
  float sum = 1.0, amp = 1.0, freq = 1.0;
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise(p * freq);
    freq *= 1.25; amp *= 1.0;
  }
  return sum * 0.5 + 0.5;
}

/* ---------- Bayer 8x8 有序抖动(颗粒感的来源) ---------- */
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2. + a.y * a.y * .75); }
#define bayer4(a) (bayer2(.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(.5 * (a)) * 0.25 + bayer2(a))

const float SPEED = 0.26;      // 涟漪扩散速度(uv/s)
const float THICK = 0.07;      // 环带厚度
const float LIFE = 2.4;        // 涟漪寿命(s)

void main() {
  float pixelSize = 8.0;
  vec2 fragCoord = gl_FragCoord.xy - uResolution * 0.5;
  float aspect = uResolution.x / uResolution.y;

  float cellSize = 8.0 * pixelSize;
  vec2 cellId = floor(fragCoord / cellSize);
  vec2 uv = (cellId * cellSize) / uResolution * vec2(aspect, 1.0);

  /* 基础暗场:慢速演化的噪声,压到负值 → 平时点几乎不显 */
  float base = fbm(uv, uTime * 0.05) * 0.5 - 0.68;
  float feed = base;

  /* 指针涟漪:高斯环带向外跑,时间与距离双重衰减 */
  for (int i = 0; i < 8; i++) {
    if (uPos[i].x < 0.0) continue;
    vec2 cuv = (uPos[i] - uResolution * 0.5 - cellSize * 0.5) / uResolution * vec2(aspect, 1.0);
    float t = max(uTime - uTimes[i], 0.0);
    if (t > LIFE) continue;
    float r = distance(uv, cuv);
    float waveR = SPEED * t;
    float ring = exp(-pow((r - waveR) / THICK, 2.0));
    float atten = exp(-0.8 * t) * exp(-5.0 * r);
    feed = max(feed, ring * atten * 5.0);
  }

  /* 抖动量化 → 稀疏点阵;圆点形;每点随机大小;边缘渐隐 */
  float b = bayer8(fragCoord / pixelSize) - 0.5;
  float bw = step(0.5, feed + b);
  float h = fract(sin(dot(floor(fragCoord / pixelSize), vec2(127.1, 311.7))) * 43758.5453);
  float coverage = bw * (1.0 + (h - 0.5) * 0.5);

  vec2 pUV = fract(fragCoord / pixelSize);
  float rr = sqrt(coverage) * 0.25;
  float dd = length(pUV - 0.5) - rr;
  float aa = 0.5 * fwidth(dd);
  float mask = coverage * (1.0 - smoothstep(-aa, aa, dd * 2.0));

  vec2 norm = gl_FragCoord.xy / uResolution;
  float edge = min(min(norm.x, norm.y), min(1.0 - norm.x, 1.0 - norm.y));
  mask *= smoothstep(0.0, 0.08, edge);

  float alpha = clamp(mask, 0.0, 1.0);
  fragColor = vec4(uColor * alpha, alpha); // 预乘 alpha
}`;

const MAX_RIPPLES = 8;

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const uRes = gl.getUniformLocation(program, "uResolution");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uColor = gl.getUniformLocation(program, "uColor");
    const uPos = gl.getUniformLocation(program, "uPos[0]");
    const uTimes = gl.getUniformLocation(program, "uTimes[0]");

    gl.uniform3f(uColor, 0.658, 1.0, 0.102); // 亮柠檬绿 #a8ff1a

    // 涟漪槽(环形复用)
    const posX = new Float32Array(MAX_RIPPLES).fill(-1);
    const posY = new Float32Array(MAX_RIPPLES).fill(-1);
    const times = new Float32Array(MAX_RIPPLES);
    let slot = 0;

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, Math.round(rect.width * dpr));
      height = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uRes, width, height);
    };
    resize();
    window.addEventListener("resize", resize);

    const parent = canvas.parentElement!;
    const start = performance.now();
    let lastX = -999;
    let lastY = -999;
    let lastDrop = 0;

    const drop = (x: number, y: number, now: number) => {
      // 移动距离/时间双阈值:慢移不断点、快移拖出一串涟漪
      const moved = Math.hypot(x - lastX, y - lastY);
      if (moved < 26 && now - lastDrop < 110) return;
      lastX = x;
      lastY = y;
      lastDrop = now;
      posX[slot] = x;
      posY[slot] = y;
      times[slot] = (now - start) / 1000;
      slot = (slot + 1) % MAX_RIPPLES;
    };

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / Math.max(rect.width, 1);
      drop((event.clientX - rect.left) * dpr, (event.clientY - rect.top) * dpr, performance.now());
    };
    const onTouch = (event: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / Math.max(rect.width, 1);
      const touch = event.touches[0];
      if (touch) drop((touch.clientX - rect.left) * dpr, (touch.clientY - rect.top) * dpr, performance.now());
    };
    parent.addEventListener("pointermove", onPointer, { passive: true });
    parent.addEventListener("pointerdown", onPointer, { passive: true });
    parent.addEventListener("touchmove", onTouch, { passive: true });

    let frame = 0;
    let running = false;
    const draw = (now: number) => {
      if (!running) return;
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2fv(uPos, interleave(posX, posY));
      gl.uniform1fv(uTimes, times);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(draw);
    };
    const interleave = (xs: Float32Array, ys: Float32Array) => {
      const out = new Float32Array(MAX_RIPPLES * 2);
      for (let i = 0; i < MAX_RIPPLES; i++) {
        out[i * 2] = xs[i];
        out[i * 2 + 1] = ys[i];
      }
      return out;
    };

    const startLoop = () => {
      if (running || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(draw);
    };
    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? startLoop() : stopLoop()),
      { threshold: 0 },
    );
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? stopLoop() : startLoop());
    document.addEventListener("visibilitychange", onVisibility);
    startLoop();

    return () => {
      stopLoop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      parent.removeEventListener("pointermove", onPointer);
      parent.removeEventListener("pointerdown", onPointer);
      parent.removeEventListener("touchmove", onTouch);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
    />
  );
}
