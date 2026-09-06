import type { Resume } from "./resume.model";
import type { ResumeVersion } from "./resume-version.model";

/**
 * 仓储端口（domain 只定义接口，infrastructure/prisma 提供实现）。
 * 方法按用例需要收窄，刻意不做通用 CRUD。
 */
export const RESUME_REPOSITORY = "ResumeRepository";

export interface ResumeRepository {
  /** 按 slug 加载简历（含全部版本；简历体量小，整载足够） */
  findBySlug(slug: string): Promise<Resume | null>;

  /** 幂等初始化：不存在则创建空简历并返回，存在则返回已有 */
  ensureCreated(init: { slug: string; title: string }): Promise<Resume>;

  /** 持久化新版本（draft 状态整行插入，含内容快照） */
  addVersion(resume: Resume, version: ResumeVersion): Promise<void>;

  /**
   * 持久化一次发布事务：
   * previous（若有）置 archived、target 置 published、更新 Resume 发布指针。
   */
  persistPublish(
    resume: Resume,
    target: ResumeVersion,
    previous: ResumeVersion | null,
  ): Promise<void>;
}
