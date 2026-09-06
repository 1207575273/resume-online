/**
 * 组合根：全应用唯一的依赖装配点（代替 Nest 的 DI 容器）。
 * 它不属于任何一层，因此允许同时 import application 与 infrastructure。
 * 依赖方向不变：application/domain 对 infra 一无所知。
 */
import { PrismaResumeRepository } from "@/infrastructure/prisma/resume.repository";
import { GetPublishedResumeUseCase } from "@/application/get-published-resume.use-case";
import { ListResumeVersionsUseCase } from "@/application/list-resume-versions.use-case";
import { CreateResumeVersionUseCase } from "@/application/create-resume-version.use-case";
import { PublishResumeVersionUseCase } from "@/application/publish-resume-version.use-case";
import { assertWriteSafety } from "@/infrastructure/config";

export interface UseCases {
  getPublishedResume: GetPublishedResumeUseCase;
  listResumeVersions: ListResumeVersionsUseCase;
  createResumeVersion: CreateResumeVersionUseCase;
  publishResumeVersion: PublishResumeVersionUseCase;
}

const globalForComposition = globalThis as unknown as { useCases?: UseCases };

export function useCases(): UseCases {
  if (!globalForComposition.useCases) {
    assertWriteSafety();
    const resumes = new PrismaResumeRepository();
    globalForComposition.useCases = {
      getPublishedResume: new GetPublishedResumeUseCase(resumes),
      listResumeVersions: new ListResumeVersionsUseCase(resumes),
      createResumeVersion: new CreateResumeVersionUseCase(resumes),
      publishResumeVersion: new PublishResumeVersionUseCase(resumes),
    };
  }
  return globalForComposition.useCases;
}
