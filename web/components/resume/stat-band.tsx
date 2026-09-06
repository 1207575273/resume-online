"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/resume/reveal";

interface Stat {
  value: number;
  suffix: string;
  label: string;
}

const STATS: Stat[] = [
  { value: 6, suffix: " 年", label: "后端与架构工程" },
  { value: 20, suffix: "亿+", label: "Token / 日（可观测体系覆盖）" },
  { value: 8000, suffix: " 万+", label: "文档渲染 / 年（讯飞智学网）" },
  { value: 2500, suffix: "+", label: "学校承载（业务营收 2.1亿 → 9亿）" },
];

/** 单个数字：进入视口后一次性 count-up（reduced-motion 直接显示终值） */
function StatNumber({ stat, delay }: { stat: Stat; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(stat.value);
      return;
    }

    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();

        const duration = 1300;
        const start = performance.now() + delay;
        const tick = (now: number) => {
          const elapsed = now - start;
          if (elapsed < 0) {
            raf = requestAnimationFrame(tick);
            return;
          }
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(stat.value * eased));
          if (progress < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [stat.value, delay]);

  return (
    <span ref={ref} className="stat-number aurora-text">
      {display.toLocaleString("zh-Hans-CN")}
      <span className="text-[0.5em] font-semibold">{stat.suffix}</span>
    </span>
  );
}

/** Keynote 数字带：简历里最硬的四个数字 */
export function StatBand() {
  return (
    <section aria-label="关键数字" className="border-y border-[var(--hairline)]">
      <div className="mx-auto grid max-w-[1080px] grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat, index) => (
          <div
            key={stat.label}
            className="px-6 py-10 sm:py-12 [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(-n+2)]:border-b lg:[&:not(:last-child)]:border-r lg:[&:not(:last-child)]:border-b-0"
          >
            <Reveal delay={index * 90}>
              <StatNumber stat={stat} delay={index * 120} />
              <p className="stat-label">{stat.label}</p>
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}
