"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** 名字背后滚动的数字证据池(与数字芯片墙同源的关键数字) */
const NUMBERS = [
  "20亿+",
  "8000万",
  "120人",
  "400+",
  "72★",
  "100+",
  "99.9%",
  "2.1→9亿",
];

/**
 * Hero 名字 + 背后的 lime 数字动效(hicreator 式):
 * 名字层背后一行大号数字 ticker 持续低调滚动;指针划过/点按名字瞬间点亮
 * (亮柠檬绿 + 3.7 倍速 + 辉光),2.4s 后回落;进视口 0.8s 自动演示一次,
 * 保证不交互的访客(含截图/PDF 渲染器)也能看到一次点亮。
 */
export function HeroName({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [lit, setLit] = useState(false);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let demoTimer = 0;
    let fadeTimer = 0;
    const light = () => {
      setLit(true);
      window.clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(() => setLit(false), 2400);
    };

    wrap.addEventListener("pointerenter", light);
    wrap.addEventListener("pointerdown", light);

    // 首次滚进视口自动演示一次
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          io.disconnect();
          demoTimer = window.setTimeout(light, 800);
        }
      },
      { threshold: 0.6 },
    );
    io.observe(wrap);

    return () => {
      wrap.removeEventListener("pointerenter", light);
      wrap.removeEventListener("pointerdown", light);
      io.disconnect();
      window.clearTimeout(demoTimer);
      window.clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <span ref={wrapRef} className={`hero-name-wrap${lit ? " lit" : ""}`}>
      <span className="num-back" aria-hidden="true">
        <span className="num-track">
          {[0, 1].map((dup) => (
            <span key={dup} className="flex gap-[0.5em]" aria-hidden={dup === 1 || undefined}>
              {NUMBERS.map((num) => (
                <span key={`${dup}-${num}`}>{num}</span>
              ))}
            </span>
          ))}
        </span>
      </span>
      {children}
    </span>
  );
}
