import { ArrowUpRight } from "lucide-react";
import { Chip } from "@/components/resume/chip";
import { Highlights } from "@/components/resume/highlights";
import { ProjectArt } from "@/components/resume/project-art";
import type { ProjectItem } from "@/lib/resume-types";

/**
 * 项目档案：首个项目升级为 featured 全宽横排卡（文字左、视觉图右），
 * 其余紧凑卡两列排布；奇数张时末卡横向通铺，杜绝孤儿卡。
 */
export function ProjectTiles({ projects }: { projects: ProjectItem[] }) {
  const [featured, ...rest] = projects;
  const lastIsOrphan = rest.length % 2 === 1;

  return (
    <section
      id="projects"
      className="border-t border-[var(--hairline)] py-20 md:py-28"
      aria-labelledby="projects-heading"
    >
      <div className="mx-auto max-w-[1080px] px-5 sm:px-6">
        <h2
          id="projects-heading"
          className="mb-10 text-4xl font-semibold tracking-tight md:mb-14 md:text-[2.6rem]"
        >
          项目
        </h2>

        <div className="grid gap-5">
          {featured && <FeaturedCard project={featured} />}
          {rest.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              {rest.map((project, index) => (
                <CompactCard
                  key={project.name}
                  project={project}
                  index={index + 1}
                  wide={lastIsOrphan && index === rest.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** 卡片右上角的圆形外链按钮：44px 触达区，压在整卡拉伸链接之上 */
function CardLink({ name, link }: { name: string; link?: string }) {
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`打开 ${name}`}
      className="relative z-10 mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] text-[var(--text-dim)] transition-colors duration-200 group-hover:border-[var(--card-border-hover)] group-hover:text-[var(--accent)] hover:border-[var(--card-border-hover)] hover:text-[var(--accent)]"
    >
      <ArrowUpRight className="size-[18px]" aria-hidden />
    </a>
  );
}

/** 标题即整卡链接：after 拉伸命中区覆盖全卡（CardLink 用 z-10 保持独立可点） */
function CardTitle({ name, link, className }: { name: string; link?: string; className?: string }) {
  if (!link) return <h3 className={className}>{name}</h3>;
  return (
    <h3 className={className}>
      <a
        href={link}
        target="_blank"
        rel="noreferrer noopener"
        className="after:absolute after:inset-0"
      >
        {name}
      </a>
    </h3>
  );
}

function TechChips({ tech }: { tech?: string[] }) {
  if (!tech || tech.length === 0) return null;
  return (
    <ul className="mt-5 flex flex-wrap gap-1.5">
      {tech.map((item) => (
        <Chip key={item}>{item}</Chip>
      ))}
    </ul>
  );
}

function FeaturedCard({ project }: { project: ProjectItem }) {
  return (
    <article
      data-slot="card"
      className="card group overflow-hidden md:grid md:grid-cols-[1.05fr_1fr]"
    >
      <div className="relative order-1 md:order-2">
        <ProjectArt name={project.name} index={0} side />
      </div>
      <div className="order-2 flex flex-col p-7 md:order-1 md:justify-center md:p-10">
        <div className="flex items-start justify-between gap-4">
          <CardTitle
            name={project.name}
            link={project.link}
            className="text-[1.35rem] leading-snug font-semibold tracking-tight md:text-[1.65rem]"
          />
          <CardLink name={project.name} link={project.link} />
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-dim)]">
          {project.description}
        </p>
        <Highlights items={project.highlights ?? []} />
        <TechChips tech={project.tech} />
      </div>
    </article>
  );
}

function CompactCard({
  project,
  index,
  wide = false,
}: {
  project: ProjectItem;
  index: number;
  wide?: boolean;
}) {
  if (wide) {
    // 奇数张的末卡：横向通铺（视觉图右置），避免孤儿卡与超高的全宽视觉图
    return (
      <article
        data-slot="card"
        className="card group overflow-hidden sm:col-span-2 md:grid md:grid-cols-[1fr_0.85fr]"
      >
        <div className="flex flex-col p-7 md:justify-center">
          <div className="flex items-start justify-between gap-4">
            <CardTitle
              name={project.name}
              link={project.link}
              className="text-[1.2rem] leading-snug font-semibold"
            />
            <CardLink name={project.name} link={project.link} />
          </div>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-dim)]">
            {project.description}
          </p>
          <Highlights items={project.highlights ?? []} />
          <TechChips tech={project.tech} />
        </div>
        <div className="relative">
          <ProjectArt name={project.name} index={index} side />
        </div>
      </article>
    );
  }

  return (
    <article data-slot="card" className="card group flex h-full flex-col overflow-hidden">
      <ProjectArt name={project.name} index={index} />
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <CardTitle
            name={project.name}
            link={project.link}
            className="text-[1.1rem] leading-snug font-semibold"
          />
          <CardLink name={project.name} link={project.link} />
        </div>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--text-dim)]">
          {project.description}
        </p>
        <div className="flex-1">
          <Highlights items={project.highlights ?? []} />
        </div>
        <TechChips tech={project.tech} />
      </div>
    </article>
  );
}
