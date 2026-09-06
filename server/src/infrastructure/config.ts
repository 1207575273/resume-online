import { loadRootEnv } from "@/infrastructure/env";

loadRootEnv(); // 幂等；容器内无 .env 文件，等价空操作

/** 基础设施配置：唯一允许读 process.env 的地方 */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ?? "postgresql://resume:resume@localhost:5432/resume",
  /** 写接口（创建/发布版本）保护令牌；为空表示拒绝一切写请求 */
  internalApiToken: process.env.INTERNAL_API_TOKEN ?? "",
} as const;

export function assertWriteSafety(): void {
  if (!config.internalApiToken) {
    // 不抛错阻止启动（读接口应当可用），但写接口会全部 401
    console.warn("[config] INTERNAL_API_TOKEN 未设置，所有写接口将返回 401");
  }
}
