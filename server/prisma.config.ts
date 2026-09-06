import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "prisma/config";

/**
 * 自包含配置：不 import 应用源码（运行层镜像里没有 src/）。
 * 本地开发时 .env 在仓库根（cwd=server → ../.env）；容器内由 compose 注入环境变量。
 */
function loadDotEnv(): void {
  for (const file of [join(process.cwd(), "..", ".env"), join(process.cwd(), ".env")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  }
}

loadDotEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts", // 本地开发用；容器内不执行 seed
  },
  // Prisma 7：连接串不再写在 schema.prisma，统一走这里
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://resume:resume@localhost:5432/resume",
  },
});
