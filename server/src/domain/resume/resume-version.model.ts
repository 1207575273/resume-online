import { ConflictError } from "../shared/domain-error";
import type { ResumeContent } from "./resume-content";

/** 版本生命周期：draft --publish--> published --archive--> archived（不可逆） */
export type VersionStatus = "draft" | "published" | "archived";

export interface VersionSummary {
  id: string;
  resumeId: string;
  number: number;
  label: string | null;
  status: VersionStatus;
  note: string | null;
  createdAt: Date;
  publishedAt: Date | null;
}

/**
 * 简历版本实体：内容快照不可变——要改简历就新建版本，不存在“编辑某个版本”。
 * 状态迁移规则收敛在实体内，仓储与应用层不负责判断。
 */
export class ResumeVersion {
  private status: VersionStatus;
  private publishedAt: Date | null;

  private constructor(
    readonly id: string,
    readonly resumeId: string,
    readonly number: number,
    readonly label: string | null,
    readonly content: ResumeContent,
    readonly note: string | null,
    readonly createdAt: Date,
    status: VersionStatus,
    publishedAt: Date | null,
  ) {
    this.status = status;
    this.publishedAt = publishedAt;
  }

  /** 创建全新版本（初始为 draft） */
  static create(input: {
    id: string;
    resumeId: string;
    number: number;
    content: ResumeContent;
    label?: string | null;
    note?: string | null;
  }): ResumeVersion {
    return new ResumeVersion(
      input.id,
      input.resumeId,
      input.number,
      input.label ?? null,
      input.content,
      input.note ?? null,
      new Date(),
      "draft",
      null,
    );
  }

  /** 仓储还原：按持久化状态重建实体 */
  static reconstitute(input: {
    id: string;
    resumeId: string;
    number: number;
    label: string | null;
    content: ResumeContent;
    note: string | null;
    createdAt: Date;
    status: VersionStatus;
    publishedAt: Date | null;
  }): ResumeVersion {
    return new ResumeVersion(
      input.id,
      input.resumeId,
      input.number,
      input.label,
      input.content,
      input.note,
      input.createdAt,
      input.status,
      input.publishedAt,
    );
  }

  get lifecycle(): { status: VersionStatus; publishedAt: Date | null } {
    return { status: this.status, publishedAt: this.publishedAt };
  }

  get isPublished(): boolean {
    return this.status === "published";
  }

  summary(): VersionSummary {
    return {
      id: this.id,
      resumeId: this.resumeId,
      number: this.number,
      label: this.label,
      status: this.status,
      note: this.note,
      createdAt: this.createdAt,
      publishedAt: this.publishedAt,
    };
  }

  /** 发布：draft → published。幂等；archived 版本不允许复活（保证对外一致性语义） */
  publish(now: Date = new Date()): void {
    if (this.status === "archived") {
      throw new ConflictError("已归档的版本不能再次发布");
    }
    if (this.status === "published") return;
    this.status = "published";
    this.publishedAt = now;
  }

  /** 归档：published → archived。draft 版本从未对外，无需归档 */
  archive(): void {
    if (this.status !== "published") return;
    this.status = "archived";
  }
}
