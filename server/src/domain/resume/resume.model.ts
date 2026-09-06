import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "../shared/domain-error";
import type { ResumeContent } from "./resume-content";
import { ResumeVersion } from "./resume-version.model";

/**
 * 简历实体：持有版本集合与发布指针。
 * 注意：刻意不搞聚合根边界（Resume 与 ResumeVersion 是普通 1-N 实体），
 * 但发布一致性（指针指向的版本必须 status=published、旧版本必须归档）
 * 作为不变量收敛在本实体的 publishVersion 里。
 */
export class Resume {
  private versions: ResumeVersion[];
  private publishedVersionId: string | null;

  private constructor(
    readonly id: string,
    readonly slug: string,
    private title: string,
    publishedVersionId: string | null,
    readonly createdAt: Date,
    private updatedAt: Date,
    versions: ResumeVersion[],
  ) {
    this.publishedVersionId = publishedVersionId;
    this.versions = versions;
  }

  /** 初始化一份新简历（无版本） */
  static create(input: { id: string; slug: string; title: string }): Resume {
    return new Resume(input.id, input.slug, input.title, null, new Date(), new Date(), []);
  }

  /** 仓储还原 */
  static reconstitute(input: {
    id: string;
    slug: string;
    title: string;
    publishedVersionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    versions: ResumeVersion[];
  }): Resume {
    return new Resume(
      input.id,
      input.slug,
      input.title,
      input.publishedVersionId,
      input.createdAt,
      input.updatedAt,
      input.versions,
    );
  }

  get meta(): { id: string; slug: string; title: string; updatedAt: Date } {
    return { id: this.id, slug: this.slug, title: this.title, updatedAt: this.updatedAt };
  }

  getPublished(): ResumeVersion | null {
    if (!this.publishedVersionId) return null;
    return this.versions.find((version) => version.id === this.publishedVersionId) ?? null;
  }

  allVersions(): ResumeVersion[] {
    return [...this.versions].sort((a, b) => b.number - a.number);
  }

  getVersion(versionId: string): ResumeVersion | null {
    return this.versions.find((version) => version.id === versionId) ?? null;
  }

  nextVersionNumber(): number {
    return this.versions.reduce((max, version) => Math.max(max, version.number), 0) + 1;
  }

  /**
   * 基于现有内容派生下一个草稿版本（“复制一份再改”是版本管理的唯一改法）。
   * 无现有版本时要求显式传入初始内容。
   */
  createNextVersion(input: { content?: ResumeContent; label?: string | null; note?: string | null }): ResumeVersion {
    const content = input.content ?? this.getPublished()?.content;
    if (!content) throw new ValidationError("没有任何可依据的内容，请显式传入初始内容");
    const version = ResumeVersion.create({
      id: randomUUID(),
      resumeId: this.id,
      number: this.nextVersionNumber(),
      content,
      label: input.label ?? null,
      note: input.note ?? null,
    });
    this.versions.push(version);
    this.updatedAt = new Date();
    return version;
  }

  /**
   * 发布指定版本并维护一致性不变量：
   * 1) 版本必须属于本简历；2) 旧发布版本自动归档；3) 指针指向新版本。
   * 幂等：重复发布当前版本为 no-op。
   */
  publishVersion(versionId: string, now: Date = new Date()): { published: ResumeVersion; previous: ResumeVersion | null } {
    const target = this.getVersion(versionId);
    if (!target) throw new NotFoundError("版本不存在或不属于该简历");

    const previous = this.getPublished();
    if (previous?.id === target.id) return { published: target, previous: null };

    if (previous) previous.archive();
    target.publish(now);
    this.publishedVersionId = target.id;
    this.updatedAt = now;
    return { published: target, previous };
  }
}
