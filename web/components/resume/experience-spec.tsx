import { formatPeriod } from "@/lib/api";
import { Chip } from "@/components/resume/chip";
import { Highlights } from "@/components/resume/highlights";
import type { ExperienceItem } from "@/lib/resume-types";

/**
 * 经历：规格表形态——左列公司与时间，右列叙事与成果，发丝线分节。
 * 经历是真实时序，发丝线上放时间线节点；移动端单列堆叠。
 */
export function ExperienceSpec({ experiences }: { experiences: ExperienceItem[] }) {
  return (
    <section
      id="experience"
      className="tint bg-[var(--surface-2)] py-20 md:py-28"
      aria-labelledby="experience-heading"
    >
      <div className="mx-auto max-w-[1080px] px-5 sm:px-6">
        <h2
          id="experience-heading"
          className="mb-10 text-4xl font-semibold tracking-tight md:mb-14 md:text-[2.6rem]"
        >
          经历
        </h2>

        <div className="space-y-14">
          {experiences.map((exp) => (
            <article
              key={`${exp.company}-${exp.start}`}
              className="spec-grid relative border-t border-[var(--hairline)] pt-8"
            >
              <span className="tl-dot" aria-hidden />
              <div>
                <p className="spec-time">{formatPeriod(exp.start, exp.end)}</p>
                <h3 className="mt-2 flex flex-wrap items-center gap-2 text-lg leading-snug font-semibold">
                  {exp.company}
                  {exp.companyTag && <span className="chip font-normal">{exp.companyTag}</span>}
                </h3>
                <p className="mt-1.5 text-[15px] text-[var(--text-dim)]">{exp.role}</p>
                {exp.tech.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {exp.tech.map((item) => (
                      <Chip key={item}>{item}</Chip>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                {exp.summary && (
                  <p className="mb-5 leading-relaxed text-[var(--text)]/90">{exp.summary}</p>
                )}
                <Highlights items={exp.highlights} className="mt-0" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
