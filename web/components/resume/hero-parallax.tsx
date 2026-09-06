"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Apple 式滚动视差：滚动进度（0→1，一个视口高内）写入 --p CSS 变量，
 * 由 CSS 消费——内容上浮淡出、极光背景反向下沉，形成纵深。
 * reduced-motion 直接不挂监听（静态 Hero）。
 */
export function HeroParallax({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const element = ref.current;
    if (!element) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const progress = Math.min(Math.max(window.scrollY / window.innerHeight, 0), 1);
      element.style.setProperty("--p", progress.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="hero-parallax" style={{ "--p": 0 } as React.CSSProperties}>
      {children}
    </div>
  );
}
