#!/usr/bin/env node
/**
 * 简历内容回滚：列出历史版本，或以指定版本的内容派生并发布新版本。
 * 领域规则：archived 版本不可直接复活，回滚 = 复制旧内容为最新版本。
 * 用法:
 *   node .claude/skills/deploy/scripts/rollback.mjs          # 列出版本
 *   node .claude/skills/deploy/scripts/rollback.mjs 4        # 回滚到 #4 的内容
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_BASE = process.env.PUBLIC_BASE ?? "http://8.218.79.152";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");

const log = (message) => console.log(`\x1b[36m[rollback]\x1b[0m ${message}`);
const fail = (message) => {
  console.error(`\x1b[31m[rollback]\x1b[0m ${message}`);
  process.exit(1);
};

const target = process.argv[2];

// ---- 列表模式 ----
if (!target) {
  const response = await fetch(`${PUBLIC_BASE}/api/v1/resume/codeyang/versions`);
  if (!response.ok) fail(`版本 API 不可读（${response.status}）`);
  const { items } = await response.json();
  for (const item of items) {
    const mark = item.status === "published" ? " ← 当前发布" : "";
    console.log(`  #${String(item.number).padStart(2)}  ${item.status.padEnd(10)} ${item.label ?? ""}${mark}`);
  }
  console.log("\n回滚: node rollback.mjs <版本号>");
  process.exit(0);
}

if (!/^\d+$/.test(target)) fail("版本号必须是数字");

const inspect = spawnSync("docker", ["inspect", "codeyang-resume-server-1"], { encoding: "utf8" });
if (inspect.status !== 0) fail("server 容器未运行");

log(`读取版本 #${target} 的内容…`);
const query = spawnSync(
  "docker",
  [
    "exec",
    "codeyang-resume-db-1",
    "psql",
    "-U",
    "resume",
    "-d",
    "resume",
    "-t",
    "-A",
    "-c",
    `SELECT json_build_object('content', content, 'label', '回滚自 #' || number, 'note', 'rollback from v' || number) FROM resume_versions WHERE "resumeId" = (SELECT id FROM resumes WHERE slug = 'codeyang') AND number = ${target};`,
  ],
  { cwd: ROOT, encoding: "utf8" },
);
const contentJson = query.stdout?.trim() ?? "";
if (!contentJson.startsWith("{")) fail(`版本 #${target} 不存在或读取失败`);

const tempFile = "/tmp/rollback-content.json";
writeFileSync(tempFile, contentJson);

log("以旧内容派生新版本并发布…");
const release = spawnSync(process.execPath, [join(HERE, "release.mjs"), tempFile], {
  cwd: ROOT,
  stdio: "inherit",
});
process.exit(release.status ?? 1);
