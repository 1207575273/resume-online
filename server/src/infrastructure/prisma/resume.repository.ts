import type { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/infrastructure/prisma/client";
import { Resume } from "@/domain/resume/resume.model";
import { ResumeVersion, type VersionStatus } from "@/domain/resume/resume-version.model";
import { createResumeContent } from "@/domain/resume/resume-content";
import type { ResumeRepository } from "@/domain/resume/resume.repository";
import { randomUUID } from "node:crypto";

type ResumeRow = Prisma.ResumeGetPayload<{ include: { versions: true } }>;
type VersionRow = ResumeRow["versions"][number];

/** 仓储实现：domain 端口 ↔ Prisma 行 的双向映射 */
export class PrismaResumeRepository implements ResumeRepository {
  private get db() {
    return getPrismaClient();
  }

  async findBySlug(slug: string): Promise<Resume | null> {
    const row = await this.db.resume.findUnique({
      where: { slug },
      include: { versions: { orderBy: { number: "asc" } } },
    });
    return row ? this.toDomain(row) : null;
  }

  async ensureCreated(init: { slug: string; title: string }): Promise<Resume> {
    const existing = await this.db.resume.findUnique({
      where: { slug: init.slug },
      include: { versions: { orderBy: { number: "asc" } } },
    });
    if (existing) return this.toDomain(existing);

    const created = await this.db.resume.create({
      data: { id: randomUUID(), slug: init.slug, title: init.title },
      include: { versions: true },
    });
    return this.toDomain(created);
  }

  async addVersion(resume: Resume, version: ResumeVersion): Promise<void> {
    await this.db.$transaction([
      this.db.resumeVersion.create({
        data: {
          id: version.id,
          resumeId: version.resumeId,
          number: version.number,
          content: version.content as unknown as Prisma.InputJsonValue,
          label: version.label,
          note: version.note,
          status: "draft",
        },
      }),
      this.db.resume.update({
        where: { id: resume.meta.id },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  async persistPublish(
    resume: Resume,
    target: ResumeVersion,
    previous: ResumeVersion | null,
  ): Promise<void> {
    await this.db.$transaction([
      ...(previous
        ? [
            this.db.resumeVersion.update({
              where: { id: previous.id },
              data: { status: "archived" },
            }),
          ]
        : []),
      this.db.resumeVersion.update({
        where: { id: target.id },
        data: { status: "published", publishedAt: target.lifecycle.publishedAt },
      }),
      this.db.resume.update({
        where: { id: resume.meta.id },
        data: { publishedVersionId: target.id, updatedAt: new Date() },
      }),
    ]);
  }

  // ---------- 映射 ----------

  private toDomain(row: ResumeRow): Resume {
    return Resume.reconstitute({
      id: row.id,
      slug: row.slug,
      title: row.title,
      publishedVersionId: row.publishedVersionId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      versions: row.versions.map(toVersionDomain),
    });
  }
}

function toVersionDomain(row: VersionRow): ResumeVersion {
  return ResumeVersion.reconstitute({
    id: row.id,
    resumeId: row.resumeId,
    number: row.number,
    label: row.label,
    content: createResumeContent(row.content),
    note: row.note,
    createdAt: row.createdAt,
    status: row.status as VersionStatus,
    publishedAt: row.publishedAt,
  });
}
