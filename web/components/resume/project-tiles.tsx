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

/** 副本卡（interactive=false）内的链接移出 Tab 序：键盘用户不重复命中 */
type LinkProps = { interactive: boolean };
const tabIndex = ({ interactive }: LinkProps) => (interactive ? undefined : -1);

/** 链接语义化:公司项目 → 「官网」(产品官网),个人项目 → 「源码」(GitHub 仓库);
 *  没有链接的项目不渲染按钮 */
function CardLink({
  kind,
  url,
  interactive,
}: { kind?: ProjectItem["kind"]; url?: string } & LinkProps) {
  if (!url) return null;
  const label = kind === "company" ? "官网" : "源码";
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`打开${label}`}
      tabIndex={tabIndex({ interactive })}
      className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--hairline)] px-3 py-1 text-[12px] font-medium text-[var(--text-dim)] transition-colors duration-200 group-hover:border-[var(--card-border-hover)] group-hover:text-[#5a7a00] hover:border-[var(--card-border-hover)] hover:text-[#5a7a00]"
    >
      {label}
      <ArrowUpRight className="size-3.5" aria-hidden />
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
        tabIndex={tabIndex({ interactive })}
        className="after:absolute after:inset-0"
      >
        {name}
      </a>
    </h3>
  );
}

/** 项目归属角标:个人项目 lime / 公司项目辅助蓝(hicreator 双品牌色),缺省不渲染 */
function KindTag({ kind }: { kind?: ProjectItem["kind"] }) {
  if (kind !== "personal" && kind !== "company") return null;
  const personal = kind === "personal";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold tracking-wide ${
        personal
          ? "bg-[rgba(208,249,59,0.18)] text-[#5a7a00] shadow-[inset_0_0_0_1px_rgba(145,230,0,0.45)]"
          : "bg-[rgba(131,189,230,0.18)] text-[#3a6491] shadow-[inset_0_0_0_1px_rgba(75,113,156,0.4)]"
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
      className="card group flex h-full w-[300px] flex-col overflow-hidden p-5 sm:w-[340px]"
    >
      {/* 行1:标题 + 语义化链接(官网/源码,无链接则不渲染) */}
      <div className="flex items-start justify-between gap-3">
        <CardTitle
          name={project.name}
          link={project.link}
          interactive={interactive}
          className="text-[1.02rem] leading-snug font-semibold"
        />
        <CardLink
          kind={project.kind}
          url={project.link}
          interactive={interactive}
        />
      </div>
      {/* 行2:归属标签 + 技术栈合并一行,压掉单独区块的空白 */}
      {(project.kind || (project.tech?.length ?? 0) > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <KindTag kind={project.kind} />
          {project.tech?.map((item) => <Chip key={item}>{item}</Chip>)}
        </div>
      )}
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--text-dim)]">
        {project.description}
      </p>
      <Highlights items={project.highlights ?? []} className="mt-3" />
    </article>
  );
}
