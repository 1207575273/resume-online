"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/resume/reveal";

interface Stat {
  value: number;
  suffix: string;
  label: string;
}

const STATS: Stat[] = [
  { value: 5, suffix: " 年+", label: "后端与架构工程" },
  { value: 20, suffix: "亿+", label: "Token / 日（可观测体系覆盖）" },
  { value: 8000, suffix: " 万+", label: "文档渲染 / 年（讯飞智学网）" },
  { value: 2500, suffix: "+", label: "学校承载（业务营收 2.1亿 → 9亿）" },
];

/** 单个数字：初值即终值（打印/Ctrl+P 不经过动画就不会打出 0），进入视口后从 0 count-up 一次 */
function StatNumber({ stat, delay }: { stat: Stat; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(stat.value);

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
    <span ref={ref} className="stat-number aurora-text" aria-hidden="true">
      {display.toLocaleString("zh-Hans-CN", { useGrouping: false })}
      <span className="text-[0.5em] font-semibold">{stat.suffix}</span>
    </span>
  );
}

/** 关键数字带：移动 2×2、桌面 1×4；发丝分隔线由 gap-px 网格精确绘制 */
export function StatBand() {
  return (
    <section aria-label="关键数字" className="border-y border-[var(--hairline)]">
      <div className="mx-auto grid max-w-[1080px] grid-cols-2 gap-px bg-[var(--hairline)] lg:grid-cols-4">
        {STATS.map((stat, index) => (
          <div
            key={stat.label}
            aria-label={`${stat.value}${stat.suffix}，${stat.label}`}
            className="bg-[var(--bg)] px-5 py-8 sm:px-6 sm:py-12"
          >
            <Reveal delay={index * 90}>
              <StatNumber stat={stat} delay={index * 120} />
              <p className="stat-label" aria-hidden="true">
                {stat.label}
              </p>
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}
