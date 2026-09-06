import { NotFoundError } from "@/domain/shared/domain-error";
import type { ResumeRepository } from "@/domain/resume/resume.repository";
import type { VersionSummary } from "@/domain/resume/resume-version.model";

export interface PublishResumeVersionInput {
  slug: string;
  versionId: string;
}

/** 版本管理：发布指定版本（领域保证指针一致性，仓储落库） */
export class PublishResumeVersionUseCase {
  constructor(private readonly resumes: ResumeRepository) {}

  async execute(input: PublishResumeVersionInput): Promise<VersionSummary> {
    const resume = await this.resumes.findBySlug(input.slug);
    if (!resume) throw new NotFoundError(`简历「${input.slug}」不存在`);

    const { published, previous } = resume.publishVersion(input.versionId);
    await this.resumes.persistPublish(resume, published, previous);
    return published.summary();
  }
}
