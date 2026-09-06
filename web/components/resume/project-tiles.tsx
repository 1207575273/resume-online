import { ArrowUpRight } from "lucide-react";
import { ProjectArt } from "@/components/resume/project-art";
import type { ProjectItem } from "@/lib/resume-types";

/** 项目瓷片：Apple 产品卡形态——视觉图打头，hover 轻浮起 */
export function ProjectTiles({ projects }: { projects: ProjectItem[] }) {
  return (
    <section id="projects" className="py-24 md:py-32" aria-labelledby="projects-heading">
      <div className="mx-auto max-w-[1080px] px-6">
        <h2
          id="projects-heading"
          className="mb-14 text-4xl font-semibold tracking-tight md:text-[2.75rem]"
        >
          项目
        </h2>

        <div className="grid gap-6 md:grid-cols-2">
          {projects.map((project, index) => (
            <div
              key={project.name}
              data-slot="card"
              className="tile group h-full border border-[var(--hairline)]"
            >
              <ProjectArt index={index} />
              <div className="px-7 pb-7">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg leading-snug font-semibold">{project.name}</h3>
                  {project.link && (
                    <a
                      href={project.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`打开 ${project.name}`}
                      className="mt-1 shrink-0 text-[var(--text-dim)] transition-colors duration-200 hover:text-[var(--accent)]"
                    >
                      <ArrowUpRight className="size-4" aria-hidden />
                    </a>
                  )}
                </div>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-dim)]">
                  {project.description}
                </p>
                {project.highlights && project.highlights.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {project.highlights.map((highlight) => (
                      <li key={highlight} className="flex gap-2.5 text-[14.5px] leading-relaxed">
                        <span
                          aria-hidden
                          className="mt-[0.6em] size-1 shrink-0 rounded-full bg-[var(--text-dim)]/50"
                        />
                        <span className="text-[var(--text)]/80">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-[12.5px] text-[var(--text-dim)]/60">
                  {project.tech?.join(" / ")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
