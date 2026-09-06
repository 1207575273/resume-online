import { formatPeriod } from "@/lib/api";
import type { ExperienceItem } from "@/lib/resume-types";

/**
 * 经历：Apple「技术规格页」形态——左列公司与时间，右列叙事与成果，
 * 发丝线分节，不做卡片堆。
 */
export function ExperienceSpec({ experiences }: { experiences: ExperienceItem[] }) {
  return (
    <section
      id="experience"
      className="bg-[var(--surface-2)] py-24 md:py-32"
      aria-labelledby="experience-heading"
    >
      <div className="mx-auto max-w-[1080px] px-6">
        <h2
          id="experience-heading"
          className="mb-14 text-4xl font-semibold tracking-tight md:text-[2.75rem]"
        >
          经历
        </h2>

        <div className="space-y-16">
          {experiences.map((exp, index) => (
            <article
            key={`${exp.company}-${exp.start}`}
            className="spec-grid border-t border-[var(--hairline)] pt-8"
          >
              <div>
                <p className="spec-time">{formatPeriod(exp.start, exp.end)}</p>
                <h3 className="mt-2 text-lg leading-snug font-semibold">{exp.company}</h3>
                <p className="mt-1.5 text-[15px] text-[var(--text-dim)]">{exp.role}</p>
                <p className="mt-4 text-[13px] leading-relaxed text-[var(--text-dim)]/70">
                  {exp.tech.join(" / ")}
                </p>
              </div>
              <div>
                {exp.summary && (
                  <p className="mb-5 leading-relaxed text-[var(--text)]/90">{exp.summary}</p>
                )}
                <ul className="space-y-3.5">
                  {exp.highlights.map((highlight) => (
                    <li key={highlight} className="flex gap-3 leading-relaxed">
                      <span
                        aria-hidden
                        className="mt-[0.65em] size-1 shrink-0 rounded-full bg-[var(--accent)]/70"
                      />
                      <span className="text-[15.5px] text-[var(--text)]/85">{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
