import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/infrastructure/config";

/**
 * Prisma 7 + driver adapter（无引擎二进制，alpine 容器友好）。
 * 模块级单例：Next.js 开发热重载/多 route handler 共享同一个连接池。
 */
const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prismaClient) {
    const adapter = new PrismaPg({
      connectionString: config.databaseUrl,
      max: 5, // 简历项目连接数需求极低
    });
    globalForPrisma.prismaClient = new PrismaClient({ adapter, log: ["warn", "error"] });
  }
  return globalForPrisma.prismaClient;
}

export async function disconnectPrisma(): Promise<void> {
  await globalForPrisma.prismaClient?.$disconnect();
}
