import { formatPeriod } from "@/lib/api";
import type { ExperienceItem } from "@/lib/resume-types";

/**
 * 职业路径时间线:三段经历横向串联(移动端纵向),数据实时来自简历 API。
 * 每节点 = 时间段 + 公司 + 角色 + 一句核心战绩(取首条 highlight 压缩到主句)。
 */

/** 压缩到第一个分号/句号前的主句,再截 34 字保证单行 */
const oneLiner = (h: string) => {
  const head = h.split(/[;；。]/)[0].trim();
  const s = head.length >= 12 ? head : h;
  return s.length > 36 ? `${s.slice(0, 36)}…` : s;
};

export function CareerTimeline({ experiences }: { experiences: ExperienceItem[] }) {
  if (experiences.length === 0) return null;

  return (
    <section aria-label="职业路径" className="border-y border-[var(--hairline)] py-14 md:py-16">
      <div className="mx-auto max-w-[1080px] px-5 sm:px-6">
        <h2 className="mb-8 text-[13px] font-semibold tracking-[0.18em] text-[var(--text-dim)] uppercase">
          职业路径 · {experiences.length} 段
        </h2>

        {/* 桌面:横向时间线(lime 主线贯穿节点);移动:纵向堆叠 */}
        <ol className="timeline relative grid gap-8 md:grid-cols-3 md:gap-6">
          {experiences.map((e) => {
            const company = e.company.split("（")[0].split("·")[0].trim();
            return (
              <li key={`${e.company}-${e.start}`} className="timeline-item relative">
                <div className="timeline-card rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5 transition-colors duration-300 hover:border-[rgba(145,230,0,0.45)]">
                  <p className="text-[12px] font-semibold tracking-wide text-[#5a7a00]">
                    {formatPeriod(e.start, e.end)}
                  </p>
                  <h3 className="mt-1.5 text-[16px] leading-snug font-bold text-[var(--text)]">
                    {company}
                  </h3>
                  <p className="mt-0.5 text-[12.5px] text-[var(--text-dim)]">{e.role.split("·")[0].trim()}</p>
                  {e.highlights[0] && (
                    <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--text-dim)]">
                      {oneLiner(e.highlights[0])}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
