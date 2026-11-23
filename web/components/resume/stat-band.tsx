"use client";

import { useEffect, useRef, useState } from "react";

interface Stat {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  decimals?: number;
}

/** 数字证据池:整份简历的关键数字,两行芯片墙滚动呈现 */
const ROW_A: Stat[] = [
  { value: 100, suffix: " 亿+", label: "Token / 日 · 五层可观测" },
  { value: 8000, suffix: " 万+", label: "文档渲染 / 年 · 讯飞" },
  { value: 9, prefix: "2.1亿 → ", suffix: " 亿", label: "支撑业务营收" },
  { value: 120, suffix: " 人", label: "Teamspace 日常使用" },
  { value: 40, suffix: "%+", label: "研发人效提升" },
  { value: 2500, suffix: "+", label: "学校承载 · 智学网" },
];
const ROW_B: Stat[] = [
  { value: 400, suffix: "+", label: "企业员工影响面" },
  { value: 100, suffix: "+", label: "团队 Skill 沉淀" },
  { value: 72, suffix: " ★", label: "开源 CCode" },
  { value: 3, prefix: "¥", suffix: " 万+", label: "自费 Claude Code 投入" },
  { value: 5, suffix: " 年+", label: "Java 与架构" },
  { value: 99.9, suffix: "%", label: "渲染引擎可用性", decimals: 1 },
];

/** 单片数字证据:初值即终值(打印不经过动画就不会打出 0),整墙进入视口后 count-up */
function StatChip({ stat, armed, index }: { stat: Stat; armed: boolean; index: number }) {
  const [display, setDisplay] = useState(stat.value);

  useEffect(() => {
    if (!armed) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(stat.value);
      return;
    }

    let raf = 0;
    const duration = 1300;
    const start = performance.now() + index * 110;
    const decimals = stat.decimals ?? 0;
    const scale = Math.pow(10, decimals);
    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(stat.value * eased * scale) / scale);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [armed, stat.value, stat.decimals, index]);

  const decimals = stat.decimals ?? 0;
  const full = `${stat.prefix ?? ""}${stat.value.toFixed(decimals)}${stat.suffix ?? ""}`;

  return (
    <div
      aria-label={`${full}，${stat.label}`}
      className="flex w-[172px] shrink-0 flex-col gap-1 rounded-[14px] border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 sm:w-[192px]"
    >
      <span className="stat-chip-num" aria-hidden="true">
        {stat.prefix && <span className="stat-unit">{stat.prefix}</span>}
        {display.toLocaleString("zh-Hans-CN", { useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
        {stat.suffix && <span className="stat-unit">{stat.suffix}</span>}
      </span>
      <span className="text-[11.5px] whitespace-nowrap text-[var(--text-dim)]" aria-hidden="true">
        {stat.label}
      </span>
    </div>
  );
}

/**
 * 关键数字带 → 数字证据芯片墙:两行反向无限滚动,整墙进视口统一 count-up。
 * 滚动骨架复用 .project-marquee(悬停暂停 / reduced-motion 可横滑 / 打印退化 wrap 全保留)。
 */
export function StatBand() {
  const ref = useRef<HTMLElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setArmed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rows = [
    { stats: ROW_A, reverse: false },
    { stats: ROW_B, reverse: true },
  ];

  return (
    <section
      ref={ref}
      aria-label="关键数字"
      className="stat-marquee space-y-2.5 border-y border-[var(--hairline)] py-7"
    >
      {rows.map((row) => (
        <div key={row.stats[0].label} className={`project-marquee${row.reverse ? " stat-rev" : ""}`}>
          <div className="marquee-track stat-track">
            {[0, 1].map((dup) => (
              <ul
                key={dup}
                className="marquee-group"
                aria-hidden={dup === 1 || undefined}
              >
                {row.stats.map((stat, index) => (
                  <li key={stat.label} className="shrink-0">
                    <StatChip stat={stat} armed={armed} index={index} />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
