/**
 * 部署脚本共享工具（release / verify / baidu-push 经 ESM 相对导入，不受执行时 cwd 影响）。
 * 纯 Node 22，无第三方依赖。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 仓库根（scripts/ → deploy/ → skills/ → .claude/ → 根） */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 从 .env 读生产域名作为默认验证入口（裸 IP+80 会被 301 到 HTTPS 且证书不匹配） */
export function resolvePublicBase() {
  if (process.env.PUBLIC_BASE) return process.env.PUBLIC_BASE;
  try {
    const domain = readFileSync(join(ROOT, ".env"), "utf8").match(/^DOMAIN=(.+)$/m)?.[1]?.trim();
    if (domain && !domain.includes("example.com")) return `https://${domain}`;
  } catch {
    /* .env 缺失时走兜底 */
  }
  return "http://8.218.79.152";
}

/** compose 双文件参数：nginx runtime 配置已渲染（= 走过 setup-https）时叠加 prod 文件 */
export function composeFileArgs() {
  return existsSync(join(ROOT, "deploy/nginx/runtime/default.conf"))
    ? ["-f", "deploy/compose.yaml", "-f", "deploy/compose.prod.yaml"]
    : ["-f", "deploy/compose.yaml"];
}

/** .env 解析为 KV 对象（忽略注释行） */
export function readEnv() {
  try {
    return Object.fromEntries(
      readFileSync(join(ROOT, ".env"), "utf8")
        .split("\n")
        .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter(Boolean)
        .map(([, k, v]) => [k, v.trim()]),
    );
  } catch {
    return {};
  }
}
