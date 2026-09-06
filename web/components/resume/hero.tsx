import { ArrowUpRight } from "lucide-react";
import { AuroraField } from "@/components/resume/aurora-field";
import { PrintButton } from "@/components/resume/print-button";
import type { ResumeProfile } from "@/lib/resume-types";

interface HeroProps {
  profile: ResumeProfile;
  versionNumber: number;
  versionLabel: string | null;
}

/** 简介取前两句作为一句话陈述，控制 Hero 信息量 */
function firstSentences(summary: string, count = 2): string {
  return summary
    .split(/(?<=[。；])/)
    .slice(0, count)
    .join("")
    .trim();
}

export function Hero({ profile, versionNumber, versionLabel }: HeroProps) {
  return (
    <header className="hero-shell" id="top">
      <AuroraField />
      <div className="hero-glow" />

      <div className="relative z-10 mx-auto max-w-[880px] px-6 text-center">
        <p
          className="animate-in fade-in duration-1000 fill-mode-both text-sm text-[var(--text-dim)]"
          style={{ animationDelay: "80ms" }}
        >
          在线简历{versionLabel ? ` · v${versionNumber}` : ""}
        </p>

        <h1
          className="animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both mt-5 text-[clamp(3.4rem,9vw,5.6rem)] leading-none font-bold tracking-tight"
          style={{ animationDelay: "160ms" }}
        >
          {profile.name}
        </h1>

        <p
          className="animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both mt-6 text-xl text-[var(--text-dim)] md:text-2xl"
          style={{ animationDelay: "280ms" }}
        >
          {profile.headline}
        </p>

        <p
          className="animate-in fade-in duration-1000 fill-mode-both mx-auto mt-6 max-w-[34em] leading-relaxed text-[var(--text-dim)]/80"
          style={{ animationDelay: "400ms" }}
        >
          {firstSentences(profile.summary)}
        </p>

        <div
          className="animate-in fade-in duration-1000 fill-mode-both mt-10 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "520ms" }}
        >
          <a
            href={`mailto:${profile.email}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-5 py-2 text-[15px] font-medium text-white transition-opacity duration-200 hover:opacity-85"
          >
            联系我
          </a>
          {profile.links
            .filter((link) => /github/i.test(link.url))
            .map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] px-5 py-2 text-[15px] text-[var(--text-dim)] transition-colors duration-200 hover:border-[var(--text-dim)] hover:text-[var(--text)]"
              >
                {link.label.split(" ")[0]}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            ))}
          <PrintButton />
        </div>

        <p
          className="animate-in fade-in duration-1000 fill-mode-both mt-14 text-[13px] text-[var(--text-dim)]/50"
          style={{ animationDelay: "680ms" }}
        >
          向下滚动查看经历与项目
          <span className="ml-2 inline-block animate-bounce" aria-hidden>↓</span>
        </p>
      </div>
    </header>
  );
}
