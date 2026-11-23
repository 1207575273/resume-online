import { ArrowUpRight } from "lucide-react";
import { formatPeriod } from "@/lib/api";
import { Chip } from "@/components/resume/chip";
import { Highlights } from "@/components/resume/highlights";
import type { ExperienceItem, ExperienceReference } from "@/lib/resume-types";

/** 经历头部的官网链接:与项目区「官网 ↗」同语言;缺省不渲染 */
function CompanyLink({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="打开公司官网"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--hairline)] px-3 py-1 text-[12px] font-medium text-[var(--text-dim)] transition-colors duration-200 hover:border-[var(--card-border-hover)] hover:text-[#5a7a00]"
    >
      官网
      <ArrowUpRight className="size-3.5" aria-hidden />
    </a>
  );
}

/** 背调联系人:电话中间四位掩码(完整号码仅线下背调流程提供) */
const maskPhone = (phone: string) => phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");

function ReferenceLine({ reference }: { reference?: ExperienceReference }) {
  if (!reference) return null;
  const parts = [
    "证明人",
    reference.name,
    reference.title,
    reference.phone ? maskPhone(reference.phone) : undefined,
  ].filter(Boolean);
  return (
    <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--text-dim)]">
      {parts.slice(0, 2).join("：")}
      {reference.title && <span className="opacity-80"> · {reference.title}</span>}
      {reference.phone && <span className="opacity-80"> · {maskPhone(reference.phone)}</span>}
    </p>
  );
}

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
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="spec-time">{formatPeriod(exp.start, exp.end)}</p>
                  <CompanyLink url={exp.companyUrl} />
                </div>
                <h3 className="mt-2 text-lg leading-snug font-semibold">{exp.company}</h3>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[15px] text-[var(--text-dim)]">
                  <span>{exp.role}</span>
                  {exp.companyTag && (
                    <span className="chip font-normal">{exp.companyTag}</span>
                  )}
                </p>
                {exp.tech.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {exp.tech.map((item) => (
                      <Chip key={item}>{item}</Chip>
                    ))}
                  </ul>
                )}
                <ReferenceLine reference={exp.reference} />
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
