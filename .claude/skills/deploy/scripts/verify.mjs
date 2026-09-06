#!/usr/bin/env node
/**
 * 线上健康验证：全链路断言（容器 → API → 首页 → 安全）。
 * 用法: node .claude/skills/deploy/scripts/verify.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 从 .env 读生产域名：HTTPS 栈的默认验证入口（IP+80 会被 301 到 HTTPS） */
function resolvePublicBase() {
  if (process.env.PUBLIC_BASE) return process.env.PUBLIC_BASE;
  try {
    const domain = readFileSync(join(ROOT, ".env"), "utf8").match(/^DOMAIN=(.+)$/m)?.[1]?.trim();
    if (domain && !domain.includes("example.com")) return `https://${domain}`;
  } catch {
    /* .env 缺失时走下面的兜底 */
  }
  return "http://8.218.79.152";
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const PUBLIC_BASE = resolvePublicBase();
console.log(`目标: ${PUBLIC_BASE}`);

let pass = 0;
let failCount = 0;

async function check(name, run) {
  try {
    const ok = await run();
    console.log(`${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}`);
    ok ? pass++ : failCount++;
  } catch {
    console.log(`\x1b[31m✗\x1b[0m ${name}`);
    failCount++;
  }
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

console.log("--- 部署验证 ---");

await check("容器服务在线", () => {
  if (!existsSync(join(ROOT, ".env"))) return false;
  // 生产栈（含 prod 叠加 + certbot）5 个；本地栈 4 个
  const hasProdOverlay = existsSync(join(ROOT, "deploy/nginx/runtime/default.conf"));
  const composeFiles = hasProdOverlay
    ? ["-f", "deploy/compose.yaml", "-f", "deploy/compose.prod.yaml"]
    : ["-f", "deploy/compose.yaml"];
  const expected = hasProdOverlay ? 5 : 4;
  const result = spawnSync(
    "docker",
    ["compose", "--env-file", ".env", ...composeFiles, "ps", "-a", "--status", "running", "-q"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return result.stdout.trim().split("\n").filter(Boolean).length >= expected;
});

await check("server 健康", async () => {
  const data = await getJson(`${PUBLIC_BASE}/api/v1/health`);
  return data.status === "ok";
});

await check("首页 200", async () => {
  const response = await fetch(PUBLIC_BASE);
  return response.ok;
});

await check("简历 API 可读", async () => {
  const data = await getJson(`${PUBLIC_BASE}/api/v1/resume/codeyang`);
  return data.version?.status === "published" && Boolean(data.content?.profile?.name);
});

await check("写接口被 nginx 拦截（403）", async () => {
  const response = await fetch(`${PUBLIC_BASE}/api/v1/resume/codeyang/versions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  return response.status === 403;
});

console.log("---");
try {
  const data = await getJson(`${PUBLIC_BASE}/api/v1/resume/codeyang`);
  console.log(`当前发布: #${data.version.number} ${data.version.label ?? ""}`);
} catch {
  console.log("简历 API 不可读");
}
console.log(`通过 ${pass} / 失败 ${failCount}`);
process.exit(failCount === 0 ? 0 : 1);
