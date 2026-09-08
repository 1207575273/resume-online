import { formatPeriod } from "@/lib/api";
import type { EducationItem, ResumeProfile } from "@/lib/resume-types";

/** 教育区：单行规格记录——学校 · 专业在左，时间靠右 */
export function EducationSection({ education }: { education: EducationItem[] }) {
  if (education.length === 0) return null;

  return (
    <section id="education" className="pb-20 md:pb-28" aria-labelledby="education-heading">
      <div className="mx-auto max-w-[1080px] px-5 sm:px-6">
        <h2
          id="education-heading"
          className="mb-10 text-4xl font-semibold tracking-tight md:mb-14 md:text-[2.6rem]"
        >
          教育
        </h2>
        {education.map((item) => (
          <div
            key={`${item.school}-${item.start}`}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-[var(--hairline)] py-6"
          >
            <p>
              <span className="text-[15px] font-semibold">{item.school}</span>
              <span aria-hidden className="mx-2 text-[var(--text-dim)]">·</span>
              <span className="text-[15px] text-[var(--text-dim)]">
                {item.major}
                {item.degree ? ` · ${item.degree}` : ""}
              </span>
            </p>
            <p className="spec-time">{formatPeriod(item.start, item.end)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 页脚：contentinfo 地标（渲染在 main 之外）；对招聘方只给更新时间，不泄内部版本号 */
export function SiteFooter({ profile, updatedAt }: { profile: ResumeProfile; updatedAt: string }) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--hairline)] py-10">
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-4 px-5 text-[13.5px] text-[var(--text-dim)] sm:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {profile.email && (
            <a
              href={`mailto:${profile.email}`}
              className="inline-block py-2 transition-colors duration-200 hover:text-[var(--accent)]"
            >
              {profile.email}
            </a>
          )}
          {profile.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-block py-2 transition-colors duration-200 hover:text-[var(--accent)]"
            >
              {link.label}
            </a>
          ))}
        </div>
        <p className="text-[var(--text-dim)]">
          © {year} {profile.name} · 更新于 {new Date(updatedAt).toLocaleDateString("zh-CN")}
        </p>
      </div>
    </footer>
  );
}
