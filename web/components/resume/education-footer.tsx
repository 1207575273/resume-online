import { formatPeriod } from "@/lib/api";
import type { EducationItem, ResumeProfile } from "@/lib/resume-types";

export function EducationFooter({
  education,
  profile,
  versionNumber,
  versionLabel,
  updatedAt,
}: {
  education: EducationItem[];
  profile: ResumeProfile;
  versionNumber: number;
  versionLabel: string | null;
  updatedAt: string;
}) {
  const year = new Date().getFullYear();

  return (
    <>
      {education.length > 0 && (
        <section className="pb-24" aria-labelledby="education-heading">
          <div className="mx-auto max-w-[1080px] px-6">
            <h2 id="education-heading" className="mb-6 text-2xl font-semibold tracking-tight">
              教育
            </h2>
            {education.map((item) => (
              <div key={`${item.school}-${item.start}`} className="spec-grid border-t border-[var(--hairline)] py-5">
                <div>
                  <span className="text-[15px] font-semibold">{item.school}</span>
                  <span className="text-[var(--text-dim)]">
                    　{item.major}
                    {item.degree ? ` · ${item.degree}` : ""}
                  </span>
                </div>
                <p className="spec-time text-right sm:text-left">{formatPeriod(item.start, item.end)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-[var(--hairline)] py-10">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-4 px-6 text-[13.5px] text-[var(--text-dim)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="transition-colors duration-200 hover:text-[var(--accent)]"
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
                className="transition-colors duration-200 hover:text-[var(--accent)]"
              >
                {link.label}
              </a>
            ))}
          </div>
          <p className="text-[var(--text-dim)]/60">
            © {year} {profile.name} · 内容版本 v{versionNumber}
            {versionLabel ? `（${versionLabel}）` : ""} · 更新于{" "}
            {new Date(updatedAt).toLocaleDateString("zh-CN")}
          </p>
        </div>
      </footer>
    </>
  );
}
