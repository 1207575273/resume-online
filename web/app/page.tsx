import type { Metadata } from "next";
import { fetchPublishedResume } from "@/lib/api";
import { EducationSection, SiteFooter } from "@/components/resume/education-footer";
import { ExperienceSpec } from "@/components/resume/experience-spec";
import { Hero } from "@/components/resume/hero";
import { ProjectTiles } from "@/components/resume/project-tiles";
import { SkillSpec } from "@/components/resume/skill-spec";
import { StatBand } from "@/components/resume/stat-band";

/**
 * 每请求渲染（SSR，SEO 友好）。注意：force-dynamic 下 fetch 的 revalidate=300
 * 数据缓存会被旁路（等价 force-no-store），即每次请求都会回源 server；
 * DB 抖动时页面走 ServiceUnavailable 兜底，而非 5 分钟陈旧缓存。
 * 保持 force-dynamic 是因为容器构建期无数据库，无法静态预渲染。
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { content } = await fetchPublishedResume();
    return {
      title: `${content.profile.name} · ${content.profile.headline}`,
      description: content.profile.summary,
    };
  } catch {
    return {};
  }
}

export default async function HomePage() {
  let data: Awaited<ReturnType<typeof fetchPublishedResume>>;
  try {
    data = await fetchPublishedResume();
  } catch (error) {
    return <ServiceUnavailable detail={error instanceof Error ? error.message : "未知错误"} />;
  }

  const { content, version, resume } = data;

  return (
    <>
      <main>
        <Hero profile={content.profile} versionNumber={version.number} versionLabel={version.label} />
        <StatBand />
        {content.skillGroups.length > 0 && <SkillSpec groups={content.skillGroups} />}
        {content.projects.length > 0 && <ProjectTiles projects={content.projects} />}
        {content.experiences.length > 0 && <ExperienceSpec experiences={content.experiences} />}
        <EducationSection education={content.education} />
      </main>

      <SiteFooter
        profile={content.profile}
        versionNumber={version.number}
        versionLabel={version.label}
        updatedAt={resume.updatedAt}
      />

      {/* SEO：Person 结构化数据 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name: content.profile.name,
            jobTitle: content.profile.headline,
            description: content.profile.summary,
            email: content.profile.email ? `mailto:${content.profile.email}` : undefined,
            url: "/",
            sameAs: content.profile.links.map((link) => link.url),
          }),
        }}
      />
    </>
  );
}

/** API 不可用时的兜底页：数据层取数失败时展示 */
function ServiceUnavailable({ detail }: { detail: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">简历服务暂时不可用</h1>
      <p className="text-sm leading-relaxed text-[var(--text-dim)]">
        内容服务没有响应，稍后会自动恢复。你是站长？检查 server 容器与数据库：
        <code className="mx-1 rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-xs">docker compose ps</code>
      </p>
      <p className="font-mono text-xs text-[var(--text-dim)]">{detail}</p>
    </main>
  );
}
