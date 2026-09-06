import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

/**
 * 极简 .env 加载（零依赖）：本地开发时 .env 在仓库根，而命令的 cwd 在 server/。
 * 容器内不存在 .env 文件，环境变量由 compose 直接注入，此函数为空操作。
 * 已存在的真实环境变量永远优先（不覆盖）。
 */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;

  const candidates = [
    join(process.cwd(), "..", ".env"), // cwd = server/（pnpm --filter exec / tsx seed）
    join(process.cwd(), ".env"), // cwd = 仓库根 或自定义
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || match[1].startsWith("#")) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[match[1]] === undefined) {
        process.env[match[1]] = value;
      }
    }
  }
}
