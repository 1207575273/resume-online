/**
 * resume-chat 服务入口（A1 地盘）
 *
 * 职责：
 *   1. 组装各模块（依赖注入：db/guards/claudeFactory 均在此接线，A9 测试可整体替换）
 *   2. http 路由分发：REST（http-api）→ admin 静态托管（src/admin/）→ 404
 *   3. WS upgrade 分流：/chat/ws/* 交给 ws-gateway，其余 destroy
 *   4. 启动时 db.init()；SIGTERM/SIGINT 优雅退出（先结束全部会话再关库）
 *
 * 依赖（他人地盘，import 契约见各文件头注释）：
 *   db.mjs(A3: createDb) security.mjs(A8: createGuards) pty-bridge.mjs(A2: createClaudeSession)
 *   http-api.mjs / ws-gateway.mjs / config.mjs（本包 A1）
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { createDb } from "./db.mjs";
import { createGuards } from "./security.mjs";
import { createHttpApi } from "./http-api.mjs";
import { createGateway } from "./ws-gateway.mjs";
import { createClaudeSession } from "./pty-bridge.mjs";

// ---------- 配置与依赖组装 ----------
const config = loadConfig();

// A3 契约：createDb(config) 取 config.DATABASE_URL
const db = createDb(config);

// A8 契约：createGuards(config) 读 env 风格 key（CHAT_RATE_* 等），此处显式映射
// （IDLE_MS / MAX_TURNS 由 ws-gateway 直接读 config，不经 guards）
const guards = createGuards({
  SITE_URL: config.SITE_URL,
  CHAT_RATE_PER_HOUR: config.RATE_PER_HOUR,
  CHAT_RATE_PER_DAY: config.RATE_PER_DAY,
  CHAT_MAX_INPUT_CHARS: config.MAX_INPUT_CHARS,
});

try {
  await db.init(); // 建表幂等（schema.sql IF NOT EXISTS）
} catch (err) {
  console.error("[chat] 数据库初始化失败，服务拒绝启动：", err);
  process.exit(1);
}

const api = createHttpApi({ config, db, guards });
const gateway = createGateway({ config, db, guards, claudeFactory: createClaudeSession });

// ---------- admin 静态托管（A5 的 src/admin/，/chat/admin/* → index.html，无则 404） ----------
// 注意相对层级：本文件在 src/ 下，admin 目录是 src/admin（"./admin"，写成 "../admin" 会指到 chat/admin）
const ADMIN_DIR = fileURLToPath(new URL("./admin", import.meta.url));
const ADMIN_PREFIX = "/chat/admin";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};

async function serveAdminStatic(req, res) {
  if (req.method !== "GET") return false;
  let pathname = "";
  try {
    pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    return false;
  }
  if (pathname !== ADMIN_PREFIX && !pathname.startsWith(ADMIN_PREFIX + "/")) return false;

  // /chat/admin 与 /chat/admin/ 都落到 index.html；其余按相对路径取文件
  const rel = pathname.slice(ADMIN_PREFIX.length).replace(/^\/+/, "");
  const relFile = rel === "" ? "index.html" : rel;
  // 目录穿越防护：归一化后必须仍在 admin 目录内
  const target = path.normalize(path.join(ADMIN_DIR, relFile));
  if (target !== ADMIN_DIR && !target.startsWith(ADMIN_DIR + path.sep)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" }).end("forbidden");
    return true;
  }
  try {
    const data = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(data);
  } catch {
    // 文件不存在（A5 未就绪或路径拼写错误）→ 404
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
  }
  return true;
}

// ---------- http server ----------
const server = http.createServer(async (req, res) => {
  try {
    if (await api.handle(req, res)) return; // REST：/chat/api/*
    if (await serveAdminStatic(req, res)) return; // 管理界面：/chat/admin/*
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
  } catch (err) {
    console.error("[chat] 请求处理异常：", err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" }).end(
        JSON.stringify({ error: "服务器内部错误" }),
      );
    } else {
      res.destroy();
    }
  }
});

// ---------- WS upgrade 分流 ----------
server.on("upgrade", (req, socket, head) => {
  // gateway 只认 /chat/ws/ 前缀；其余一律断开
  if (!gateway.handleUpgrade(req, socket, head)) socket.destroy();
});

server.listen(config.PORT, config.HOST, () => {
  console.log(
    `[chat] listening on ${config.HOST}:${config.PORT} model=${config.MODEL} claude=${config.CLAUDE_CMD} maxTurns=${config.MAX_TURNS}`,
  );
});

// ---------- 优雅退出 ----------
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[chat] 收到 ${signal}，开始优雅退出（活跃会话 ${gateway.getStats().sessions} 个）`);

  // 兜底强退：结束流程最多等 8s，避免 db/PTY 卡死拖住容器停止
  const forceTimer = setTimeout(() => {
    console.error("[chat] 优雅退出超时，强制退出");
    process.exit(0);
  }, 8000);
  forceTimer.unref();

  try {
    server.close(); // 停止接收新连接
    await gateway.shutdown(); // 结束全部会话：session_end + db.endSession + 杀 PTY
    await db.close();
  } catch (err) {
    console.error("[chat] 退出过程出错：", err);
  }
  console.log("[chat] 已退出");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// 兜底：单点异常不应拖死整个服务（会话级错误已在各层捕获，这里是最后防线）
process.on("uncaughtException", (err) => {
  console.error("[chat] uncaughtException：", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[chat] unhandledRejection：", err);
});
