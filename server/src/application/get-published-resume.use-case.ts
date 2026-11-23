import { NotFoundError } from "@/domain/shared/domain-error";
import type { ResumeRepository } from "@/domain/resume/resume.repository";
import type { ResumeContent } from "@/domain/resume/resume-content";
import type { VersionSummary } from "@/domain/resume/resume-version.model";

export interface PublishedResumeResult {
  resume: { slug: string; title: string; updatedAt: Date };
  version: VersionSummary;
  content: ResumeContent;
}

/** 电话掩码:公开读接口输出 PII 脱敏(完整号码仅线下背调流程提供,库内保留原文供版本管理) */
const maskPhone = (phone: string) => phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");

/** 对外读接口：取某份简历当前发布版本的内容(证明人电话在响应层脱敏) */
export class GetPublishedResumeUseCase {
  constructor(private readonly resumes: ResumeRepository) {}

  async execute(slug: string): Promise<PublishedResumeResult> {
    const resume = await this.resumes.findBySlug(slug);
    if (!resume) throw new NotFoundError(`简历「${slug}」不存在`);

    const version = resume.getPublished();
    if (!version) throw new NotFoundError(`简历「${slug}」尚无发布版本`);

    const original = version.content;
    // deepFreeze 冻结对象不可变:构造浅拷贝替换 experiences 引用(不触碰冻结的子对象)
    const content = original.experiences.some((e) => e.reference?.phone)
      ? {
          ...original,
          experiences: original.experiences.map((e) =>
            e.reference?.phone
              ? { ...e, reference: { ...e.reference, phone: maskPhone(e.reference.phone) } }
              : e,
          ),
        }
      : original;

    return {
      resume: resume.meta,
      version: version.summary(),
      content,
    };
  }
}
