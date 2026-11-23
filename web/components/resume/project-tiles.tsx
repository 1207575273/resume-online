import { ArrowUpRight } from "lucide-react";
import { Chip } from "@/components/resume/chip";
import { Highlights } from "@/components/resume/highlights";
import type { ProjectItem } from "@/lib/resume-types";

/**
 * 项目档案：横向无限滚动（marquee）。
 * 所有项目平权为统一紧凑卡，一行从左到右匀速滚动；轨道复制一份实现无缝循环
 * （副本 aria-hidden 且链接移出 Tab 序，屏幕阅读器/键盘只命中正本）。
 * hover / 键盘焦点进入时暂停；prefers-reduced-motion 退化为可横滑；
 * 打印时副本隐藏、正本换行为网格——PDF 保真不丢项目。
 */
export function ProjectTiles({ projects }: { projects: ProjectItem[] }) {
  if (projects.length === 0) return null;

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
      </div>
      <div className="project-marquee">
        <div className="marquee-track">
          {[0, 1].map((dup) => (
            <ul
              key={dup}
              className="marquee-group"
              aria-hidden={dup === 1 || undefined}
            >
              {projects.map((project, index) => (
                <li key={project.name} className="shrink-0">
                  <MarqueeCard
                    project={project}
                    index={index}
                    interactive={dup === 0}
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 副本卡（interactive=false）内的链接移出 Tab 序：键盘用户不重复命中同一目标 */
type LinkProps = { interactive: boolean };
const linkTabIndex = ({ interactive }: LinkProps) => (interactive ? undefined : -1);

/** 卡片右上角的圆形外链按钮：44px 触达区，压在整卡拉伸链接之上 */
function CardLink({ name, link, interactive }: { name: string; link?: string } & LinkProps) {
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`打开 ${name}`}
      tabIndex={linkTabIndex({ interactive })}
      className="relative z-10 mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] text-[var(--text-dim)] transition-colors duration-200 group-hover:border-[var(--card-border-hover)] group-hover:text-[var(--accent)] hover:border-[var(--card-border-hover)] hover:text-[var(--accent)]"
    >
      <ArrowUpRight className="size-[18px]" aria-hidden />
    </a>
  );
}

/** 标题即整卡链接：after 拉伸命中区覆盖全卡（CardLink 用 z-10 保持独立可点） */
function CardTitle({
  name,
  link,
  interactive,
  className,
}: { name: string; link?: string; className?: string } & LinkProps) {
  if (!link) return <h3 className={className}>{name}</h3>;
  return (
    <h3 className={className}>
      <a
        href={link}
        target="_blank"
        rel="noreferrer noopener"
        tabIndex={linkTabIndex({ interactive })}
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
    <ul className="flex flex-wrap gap-1.5">
      {tech.map((item) => (
        <Chip key={item}>{item}</Chip>
      ))}
    </ul>
  );
}

/** 项目归属角标:个人项目 lime 描边 / 公司项目中性灰;缺省不渲染 */
function KindTag({ kind }: { kind?: ProjectItem["kind"] }) {
  if (kind !== "personal" && kind !== "company") return null;
  const personal = kind === "personal";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold tracking-wide ${
        personal
          ? "bg-[rgba(208,249,59,0.18)] text-[#5a7a00] shadow-[inset_0_0_0_1px_rgba(145,230,0,0.45)]"
          : "bg-[var(--chip-bg)] text-[var(--text-dim)] shadow-[inset_0_0_0_1px_var(--hairline)]"
      }`}
    >
      {personal ? "个人项目" : "公司项目"}
    </span>
  );
}

function MarqueeCard({
  project,
  index,
  interactive,
}: { project: ProjectItem; index: number } & LinkProps) {
  return (
    <article
      data-slot="card"
      className="card group flex h-full w-[300px] flex-col overflow-hidden p-6 sm:w-[340px]"
    >
      <div className="flex items-start justify-between gap-3">
        <KindTag kind={project.kind} />
        <CardLink name={project.name} link={project.link} interactive={interactive} />
      </div>
      <CardTitle
        name={project.name}
        link={project.link}
        interactive={interactive}
        className="mt-2 text-[1.05rem] leading-snug font-semibold"
      />
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-dim)]">
        {project.description}
      </p>
      <Highlights items={project.highlights ?? []} className="mt-3" />
      <div className="mt-auto pt-4">
        <TechChips tech={project.tech} />
      </div>
    </article>
  );
}
