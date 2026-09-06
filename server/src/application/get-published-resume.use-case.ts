import { NotFoundError } from "@/domain/shared/domain-error";
import type { ResumeRepository } from "@/domain/resume/resume.repository";
import type { ResumeContent } from "@/domain/resume/resume-content";
import type { VersionSummary } from "@/domain/resume/resume-version.model";

export interface PublishedResumeResult {
  resume: { slug: string; title: string; updatedAt: Date };
  version: VersionSummary;
  content: ResumeContent;
}

/** 对外读接口：取某份简历当前发布版本的内容 */
export class GetPublishedResumeUseCase {
  constructor(private readonly resumes: ResumeRepository) {}

  async execute(slug: string): Promise<PublishedResumeResult> {
    const resume = await this.resumes.findBySlug(slug);
    if (!resume) throw new NotFoundError(`简历「${slug}」不存在`);

    const version = resume.getPublished();
    if (!version) throw new NotFoundError(`简历「${slug}」尚无发布版本`);

    return {
      resume: resume.meta,
      version: version.summary(),
      content: version.content,
    };
  }
}
