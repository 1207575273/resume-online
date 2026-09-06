#!/usr/bin/env node
/**
 * 一键本地开发：
 *   1. 确保 .env 存在（没有则从 .env.example 复制并提示）
 *   2. 起数据库容器（deploy/compose.yaml 的 db 服务，仅回环端口）
 *   3. prisma migrate deploy + 幂等 seed
 *   4. 并行启动 server(:3001) 与 web(:3000) 的 dev 模式，带前缀日志
 * 退出：Ctrl+C 一并结束子进程。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const log = (msg) => console.log(`\x1b[36m[dev]\x1b[0m ${msg}`);
const fail = (msg) => {
  console.error(`\x1b[31m[dev]\x1b[0m ${msg}`);
  process.exit(1);
};

// 1. .env
if (!existsSync(join(ROOT, ".env"))) {
  copyFileSync(join(ROOT, ".env.example"), join(ROOT, ".env"));
  log("已从 .env.example 生成 .env（建议跑 ./script/gen-env.sh 换成随机密钥）");
}

// 2. 数据库
log("启动 PostgreSQL 容器…");
const compose = ["compose", "--env-file", ".env", "-f", "deploy/compose.yaml"];
const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
if (run("docker", [...compose, "up", "-d", "db"]).status !== 0) fail("数据库容器启动失败");

log("等待数据库就绪…");
for (let i = 0; i < 30; i++) {
  const probe = spawnSync(
    "docker",
    [...compose, "exec", "-T", "db", "pg_isready", "-U", process.env.POSTGRES_USER ?? "resume"],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (probe.status === 0) break;
  if (i === 29) fail("数据库 30 次探测未就绪");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// 3. 迁移 + 种子
log("执行数据库迁移…");
if (run("pnpm", ["db:deploy"]).status !== 0) fail("迁移失败");
log("写入种子数据（幂等）…");
run("pnpm", ["db:seed"]);

// 4. 并行 dev
log("启动 server(:3001) 与 web(:3000)…");
const children = [
  spawn("pnpm", ["--filter", "@resume/server", "dev"], { cwd: ROOT, shell: process.platform === "win32" }),
  spawn("pnpm", ["--filter", "@resume/web", "dev"], { cwd: ROOT, shell: process.platform === "win32" }),
];
const colors = ["\x1b[35m[server]\x1b[0m ", "\x1b[33m[web]\x1b[0m   "];
children.forEach((child, index) => {
  child.stdout.on("data", (chunk) =>
    process.stdout.write(String(chunk).replace(/^/gm, colors[index])),
  );
  child.stderr.on("data", (chunk) =>
    process.stderr.write(String(chunk).replace(/^/gm, colors[index])),
  );
  child.on("exit", (code) => {
    log(`子进程退出（code=${code}），关闭其余进程`);
    children.filter((other) => other !== child && !other.killed).forEach((other) => other.kill("SIGINT"));
  });
});

const shutdown = () => {
  log("收到退出信号，结束子进程…");
  children.forEach((child) => !child.killed && child.kill("SIGINT"));
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log("就绪：web http://localhost:3000 · api http://localhost:3001/api/v1/health");
