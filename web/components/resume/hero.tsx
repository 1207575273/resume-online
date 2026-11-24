import { ArrowUpRight } from "lucide-react";
import { HeroName } from "@/components/resume/hero-name";
import { HeroParallax } from "@/components/resume/hero-parallax";
import { ParticleField } from "@/components/resume/particle-field";
import { PrintButton } from "@/components/resume/print-button";
import type { ResumeProfile } from "@/lib/resume-types";

interface HeroProps {
  profile: ResumeProfile;
}

/** 简介取前两句作为一句话陈述，控制 Hero 信息量 */
function firstSentences(summary: string, count = 2): string {
  return summary
    .split(/(?<=[。；])/)
    .slice(0, count)
    .join("")
    .trim();
}

export function Hero({ profile }: HeroProps) {
  return (
    <header className="hero-shell" id="top">
      <HeroParallax>
        <ParticleField />

        <div className="hero-content relative z-10 mx-auto max-w-[880px] px-6 text-center">
        <h1
          className="animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both mt-5 text-[clamp(3.4rem,9vw,5.6rem)] leading-none font-bold tracking-normal"
          style={{ animationDelay: "160ms" }}
        >
          <HeroName>{profile.name}</HeroName>
        </h1>

        <p
          className="animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both mt-6 text-xl font-medium text-[var(--text)] md:text-2xl"
          style={{ animationDelay: "280ms" }}
        >
          {profile.headline}
        </p>

        {profile.tags && profile.tags.length > 0 && (
          <div
            className="animate-in fade-in slide-in-from-bottom-4 duration-1000 fill-mode-both mt-5 flex flex-wrap items-center justify-center gap-2"
            style={{ animationDelay: "360ms" }}
          >
            {profile.tags.map((tag) => (
              <span key={tag} className={`hero-tag ${/¥/.test(tag) ? "hero-tag-hot" : ""}`}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {profile.location && (
          <p
            className="animate-in fade-in duration-1000 fill-mode-both mt-4 text-[14px] text-[var(--text-dim)]"
            style={{ animationDelay: "400ms" }}
          >
            {profile.location}
          </p>
        )}

        <p
          className="animate-in fade-in duration-1000 fill-mode-both mx-auto mt-6 max-w-[34em] leading-relaxed text-[var(--text-dim)]"
          style={{ animationDelay: "400ms" }}
        >
          {firstSentences(profile.summary)}
        </p>

        <div
          className="animate-in fade-in duration-1000 fill-mode-both mt-10 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "520ms" }}
        >
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("resume:contact"))}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--accent-solid)] px-6 py-2.5 text-[15px] font-semibold text-[#0e0e0e] transition-opacity duration-200 hover:opacity-85"
          >
            联系方式
          </button>
          {profile.links
            .filter((link) => /github/i.test(link.url))
            .map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] px-5 py-2.5 text-[15px] text-[var(--text-dim)] transition-colors duration-200 hover:border-[var(--text-dim)] hover:text-[var(--text)]"
              >
                {link.label.split(" ")[0]}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            ))}
          <PrintButton />
        </div>

        <p
          className="animate-in fade-in duration-1000 fill-mode-both mt-14 text-[13px] text-[var(--text-dim)]"
          style={{ animationDelay: "680ms" }}
        >
          向下滚动查看经历与项目
          <span className="ml-2 inline-block" aria-hidden>↓</span>
        </p>
        </div>
      </HeroParallax>
    </header>
  );
}
