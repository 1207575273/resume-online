import { NotFoundError } from "@/domain/shared/domain-error";
import type { ResumeRepository } from "@/domain/resume/resume.repository";
import type { VersionSummary } from "@/domain/resume/resume-version.model";

/** 版本管理：列出某份简历的全部版本（仅元信息，不含内容） */
export class ListResumeVersionsUseCase {
  constructor(private readonly resumes: ResumeRepository) {}

  async execute(slug: string): Promise<{ resume: { slug: string; title: string }; items: VersionSummary[] }> {
    const resume = await this.resumes.findBySlug(slug);
    if (!resume) throw new NotFoundError(`简历「${slug}」不存在`);

    return {
      resume: { slug: resume.meta.slug, title: resume.meta.title },
      items: resume.allVersions().map((version) => version.summary()),
    };
  }
}
