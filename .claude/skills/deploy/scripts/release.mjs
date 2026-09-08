#!/usr/bin/env node
/**
 * 发布简历新版本：content.json → 容器内 API 建版本+发布 → 强刷 web 缓存 → 公网验证。
 * 用法: node .claude/skills/deploy/scripts/release.mjs <content.json>
 * 纯 Node 22（原生 fetch / spawnSync），跨平台无第三方依赖。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, composeFileArgs, resolvePublicBase } from "./lib.mjs";

const PUBLIC_BASE = resolvePublicBase();
const SERVER_CONTAINER = "codeyang-resume-server-1";

const log = (message) => console.log(`\x1b[36m[release]\x1b[0m ${message}`);
const fail = (message) => {
  console.error(`\x1b[31m[release]\x1b[0m ${message}`);
  process.exit(1);
};

const contentFile = process.argv[2];
if (!contentFile) fail("用法: node release.mjs <content.json>");
if (!existsSync(contentFile)) fail(`内容文件不存在: ${contentFile}`);
if (!existsSync(join(ROOT, ".env"))) fail("缺少 .env（script/gen-env.sh）");

// 容器与内容合法性预检
const docker = (...args) =>
  spawnSync("docker", args, { cwd: ROOT, encoding: "utf8" });
if (docker("inspect", SERVER_CONTAINER).status !== 0) {
  fail("server 容器未运行（先 ./deploy/deploy.sh local）");
}
try {
  JSON.parse(readFileSync(contentFile, "utf8"));
} catch {
  fail("内容文件不是合法 JSON（应为 {content, label, note} 结构）");
}

log("推送内容到 server 容器…");
if (docker("cp", contentFile, `${SERVER_CONTAINER}:/tmp/release-content.json`).status !== 0) {
  fail("docker cp 失败");
}

log("创建版本并发布…");
const published = spawnSync(
  "docker",
  [
    "exec",
    SERVER_CONTAINER,
    "node",
    "-e",
    `const fs = require("fs");
const token = process.env.INTERNAL_API_TOKEN;
fetch("http://localhost:3001/api/v1/resume/codeyang/versions", {
  method: "POST",
  headers: { "content-type": "application/json", "x-internal-token": token },
  body: fs.readFileSync("/tmp/release-content.json", "utf8"),
})
  .then((r) => r.json())
  .then((created) => {
    if (!created.id) throw new Error(JSON.stringify(created));
    return fetch(
      "http://localhost:3001/api/v1/resume/codeyang/versions/" + created.id + "/publish",
      { method: "POST", headers: { "x-internal-token": token } },
    ).then((r) => r.json());
  })
  .then((d) => console.log("OK #" + d.number + " " + (d.label ?? "")))
  .catch((e) => { console.error("FAILED " + e.message); process.exit(1); });`,
  ],
  { cwd: ROOT, encoding: "utf8" },
);
if (published.status !== 0 || !published.stdout.includes("OK #")) {
  fail(`发布失败: ${published.stdout.trim()} ${published.stderr.trim()}`);
}
console.log(published.stdout.trim());

log("强刷 web 数据缓存（fetch 缓存在容器可写层，restart 无效）…");
const recreate = spawnSync(
  "docker",
  ["compose", "--env-file", ".env", ...composeFileArgs(), "up", "-d", "--force-recreate", "web"],
  { cwd: ROOT, stdio: "inherit" },
);
if (recreate.status !== 0) fail("web 容器重建失败");
await sleep(8000);

log("公网验证…");
try {
  const response = await fetch(`${PUBLIC_BASE}/api/v1/resume/codeyang`);
  const data = await response.json();
  console.log(
    `线上版本: #${data.version.number} ${data.version.label} · 姓名: ${data.content.profile.name}`,
  );
} catch (error) {
  fail(`公网验证失败（查 docker logs codeyang-resume-web-1）: ${error.message}`);
}

// 百度收录推送（best-effort：.env 没配 BAIDU_PUSH_TOKEN 时脚本自己安静跳过）
spawnSync("node", [join(ROOT, ".claude/skills/deploy/scripts/baidu-push.mjs"), "--quiet"], {
  cwd: ROOT,
  stdio: "inherit",
});

log("完成 ✅");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
