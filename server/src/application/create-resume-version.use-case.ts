import { NotFoundError } from "@/domain/shared/domain-error";
import type { ResumeRepository } from "@/domain/resume/resume.repository";
import { createResumeContent } from "@/domain/resume/resume-content";
import type { VersionSummary } from "@/domain/resume/resume-version.model";

export interface CreateResumeVersionInput {
  slug: string;
  /** 原始内容（未校验）；缺省时基于当前发布版本派生 */
  content?: unknown;
  label?: string | null;
  note?: string | null;
}

/** 版本管理：新建草稿版本（内容经领域校验后成为不可变快照） */
export class CreateResumeVersionUseCase {
  constructor(private readonly resumes: ResumeRepository) {}

  async execute(input: CreateResumeVersionInput): Promise<VersionSummary> {
    const resume = await this.resumes.findBySlug(input.slug);
    if (!resume) throw new NotFoundError(`简历「${input.slug}」不存在`);

    const content = input.content === undefined ? undefined : createResumeContent(input.content);
    const version = resume.createNextVersion({
      content,
      label: input.label,
      note: input.note,
    });

    await this.resumes.addVersion(resume, version);
    return version.summary();
  }
}
