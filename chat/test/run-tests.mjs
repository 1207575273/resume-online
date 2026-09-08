#!/usr/bin/env node
/**
 * run-tests.mjs —— chat 服务全链路自测（A9，docs/ai-chat-plan.md §9）
 *
 * 前提：chat/src 各模块就绪（A1 骨架/HTTP/WS、A2 PTY 桥、A3 数据层、A6 提示词、A8 安全）。
 * 若模块尚未交付（src/server.mjs 缺失），前置检查会给出明确的 blocked 报错。
 *
 * 流程：
 *   1. 准备 env：CHAT_CLAUDE_CMD=./test/mock-claude.mjs（相对 chat/）、CHAT_MODEL=test、
 *      CHAT_ADMIN_TOKEN=test-token、CHAT_PORT=3211、DATABASE_URL=本机 PostgreSQL
 *   2. 子进程启动 src/server.mjs，轮询 /chat/api/health 就绪（10s 超时，报错带子进程日志）
 *   3. 全链路（全局 fetch + ws 包）：
 *      POST /chat/api/sessions → WS 连接 → 收 assistant_delta（断言增量非空且无协议行泄漏）
 *      → 收 ask_user（断言 question/options）→ 回 ask_answer（贴一段含「AI 应用工程师」的假 JD）
 *      → 收 assistant_done（断言含「匹配」）
 *   4. 等 1s 后走 admin API（x-admin-token）断言：会话落库、消息数 ≥4、
 *      leads 里有 jd_title=AI 应用工程师 / match=high、stats 总数 ≥1
 *   5. 清理：删除本次测试会话的全部落库数据 + 杀子进程；任何失败都先杀进程再 exit 1
 *
 * 运行：node test/run-tests.mjs（等价 pnpm --filter @resume/chat test）
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { accessSync, constants, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import pg from 'pg';

// ---------- 路径与常量 ----------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHAT_DIR = path.resolve(HERE, '..');
const ROOT_DIR = path.resolve(CHAT_DIR, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
/** 被测服务入口：默认 src/server.mjs；可用 CHAT_TEST_SERVER_ENTRY 覆盖（联调期以适配驱动验证全链路） */
const SERVER_ENTRY = process.env.CHAT_TEST_SERVER_ENTRY
  ? path.resolve(process.env.CHAT_TEST_SERVER_ENTRY)
  : path.join(CHAT_DIR, 'src', 'server.mjs');
const MOCK_PATH = path.join(HERE, 'mock-claude.mjs');

/** 测试端口：刻意避开正式 3210，避免与开发实例冲突 */
const PORT = Number(process.env.CHAT_TEST_PORT || 3211);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN = 'test-token';
/** WS 握手带的 Origin：A8 白名单应包含 localhost 系来源 */
const WS_ORIGIN = `http://127.0.0.1:${PORT}`;

/** 假 JD（ask_answer 的回答，含「AI 应用工程师」） */
const FAKE_JD = [
  '岗位：AI 应用工程师',
  '职责：负责基于大模型的智能应用与 Agent 工作流开发，参与 Java 核心服务建设。',
  '要求：5 年以上 Java 后端经验；熟悉 LLM 应用 / Agent 开发；有可观测性建设经验优先。',
].join('\n');

// ---------- 基础工具 ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 从对象里按候选字段名取第一个非空值（宽容 admin API 的字段命名差异） */
function pick(obj, names) {
  for (const name of names) {
    if (obj && obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return undefined;
}

/** 日志脱敏：抹掉连接串里的密码段 */
function maskUrl(url) {
  return String(url).replace(/:[^:@/]+@/, ':***@');
}

// ---------- 环境准备 ----------

/** 从仓库根 .env 读 POSTGRES_PASSWORD，拼出本机测试用 DATABASE_URL */
async function resolveDatabaseUrl() {
  let raw;
  try {
    raw = await readFile(ENV_PATH, 'utf8');
  } catch {
    assert.fail(`无法读取 ${ENV_PATH}（本测试依赖根目录 .env 里的 POSTGRES_PASSWORD）`);
  }
  const matched = raw.match(/^POSTGRES_PASSWORD=(.*)$/m);
  const password = matched ? matched[1].trim().replace(/^["']|["']$/g, '') : '';
  assert.ok(password, `在 ${ENV_PATH} 中未找到非空的 POSTGRES_PASSWORD`);
  return `postgresql://resume:${encodeURIComponent(password)}@127.0.0.1:5432/resume`;
}

/** 组装子进程 env（覆盖 chat/src/config.mjs 读取的全部关键变量） */
function buildEnv(databaseUrl) {
  return {
    CHAT_CLAUDE_CMD: './test/mock-claude.mjs', // 相对 chat/ 解析（见下方 HOME 覆盖）
    CHAT_MODEL: 'test',
    CHAT_ADMIN_TOKEN: ADMIN_TOKEN,
    CHAT_PORT: String(PORT),
    DATABASE_URL: databaseUrl,
    // pty-bridge（A2）以 env.HOME 作为 claude 子进程的 spawn cwd——把 HOME 指到 chat/，
    // 保证相对路径 ./test/mock-claude.mjs 能被正确解析（不影响 mock 脚本自身的运行）
    HOME: CHAT_DIR,
  };
}

// ---------- server 子进程封装 ----------

/** 启动 src/server.mjs 子进程，收集 stdout/stderr 供失败时排错 */
function startServer(envOverrides) {
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: CHAT_DIR,
    env: { ...process.env, ...envOverrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const outChunks = [];
  const errChunks = [];
  proc.stdout.on('data', (chunk) => outChunks.push(chunk));
  proc.stderr.on('data', (chunk) => errChunks.push(chunk));
  const state = { exited: false, code: null, signal: null };
  proc.once('exit', (code, signal) => {
    state.exited = true;
    state.code = code;
    state.signal = signal;
  });
  const tail = (bytes = 4000) => {
    const text = (chunks) => Buffer.concat(chunks).toString('utf8');
    return `--- server stdout 尾部 ---\n${text(outChunks).slice(-bytes)}\n--- server stderr 尾部 ---\n${text(errChunks).slice(-bytes)}`;
  };
  return {
    proc,
    tail,
    hasExited: () => state.exited,
    exitDetail: () => `code=${state.code} signal=${state.signal}\n${tail()}`,
  };
}

/** 优雅停止子进程：SIGTERM，超时（4s）后 SIGKILL；幂等 */
function stopServer(srv) {
  if (!srv || srv.hasExited()) return Promise.resolve();
  return new Promise((resolve) => {
    const killer = setTimeout(() => {
      try { srv.proc.kill('SIGKILL'); } catch { /* 已退出则无需处理 */ }
    }, 4000);
    srv.proc.once('exit', () => {
      clearTimeout(killer);
      resolve();
    });
    try {
      srv.proc.kill('SIGTERM');
    } catch {
      clearTimeout(killer);
      resolve();
    }
  });
}

/** 轮询 /chat/api/health 直到就绪；子进程提前退出或超时都给出清晰报错（附子进程日志） */
async function waitHealthy(srv, base, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '（尚无请求记录）';
  while (Date.now() < deadline) {
    if (srv.hasExited()) {
      throw new Error(`chat 服务进程提前退出，${srv.exitDetail()}`);
    }
    try {
      const res = await fetch(`${base}/chat/api/health`);
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (!body.status || body.status === 'ok') return body;
        lastError = `health 返回异常 status=${body.status}`;
      } else {
        lastError = `health HTTP ${res.status}`;
      }
    } catch (err) {
      lastError = err.message;
    }
    await sleep(250);
  }
  throw new Error(
    `等待 ${base}/chat/api/health 就绪超时（${timeoutMs}ms），最后错误：${lastError}\n${srv.tail()}`,
  );
}

// ---------- WS 通道封装 ----------

/** 薄封装：收帧入队 + 按条件等待/收集（错误帧一律视为失败） */
class WsChannel {
  constructor(url, origin) {
    this.frames = []; // 已到达的全部帧（保序）
    this.waiters = []; // 等新帧的唤醒回调
    this.closedInfo = null;
    this.ws = new WebSocket(url, { origin, handshakeTimeout: 8000 });
    this.openPromise = new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', (err) => reject(new Error(`WS 连接失败（${url}）：${err.message}`)));
    });
    this.ws.on('message', (data) => {
      let frame;
      try {
        frame = JSON.parse(data.toString());
      } catch {
        frame = { type: 'raw', text: data.toString() };
      }
      this.frames.push(frame);
      const wake = this.waiters.shift();
      if (wake) wake();
    });
    this.ws.on('close', (code, reason) => {
      this.closedInfo = { code, reason: reason ? reason.toString() : '' };
      const wake = this.waiters.shift();
      if (wake) wake();
    });
    this.ws.on('error', () => { /* 握手期错误已由 once 捕获，其后错误跟随 close 事件处理 */ });
  }

  frameTypes() {
    return this.frames.map((f) => f.type).join(' → ') || '（无）';
  }

  /**
   * 顺序扫描已到达的帧：收集满足 pickFn 的帧，直到出现满足 stopFn 的帧为止。
   * 途中遇到 {"type":"error"} 直接抛错；连接关闭或超时也抛错。
   */
  async collectUntil(pickFn, stopFn, label, timeoutMs = 20000) {
    const picked = [];
    const deadline = Date.now() + timeoutMs;
    let cursor = 0;
    for (;;) {
      while (cursor < this.frames.length) {
        const frame = this.frames[cursor];
        cursor += 1;
        if (frame.type === 'error') {
          throw new Error(`等待「${label}」途中收到 error 帧：${frame.message ?? JSON.stringify(frame)}`);
        }
        if (stopFn(frame)) return { picked, stopFrame: frame };
        if (pickFn(frame)) picked.push(frame);
      }
      if (this.closedInfo) {
        throw new Error(`等待「${label}」时 WS 已关闭（code=${this.closedInfo.code} ${this.closedInfo.reason}），已收帧：${this.frameTypes()}`);
      }
      const remain = deadline - Date.now();
      if (remain <= 0) {
        throw new Error(`等待「${label}」超时（${timeoutMs}ms），已收帧：${this.frameTypes()}`);
      }
      // 等下一帧到达或超时，二者谁先到都回到循环重查
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          const idx = this.waiters.indexOf(wake);
          if (idx >= 0) this.waiters.splice(idx, 1);
          resolve();
        }, remain);
        const wake = () => {
          clearTimeout(timer);
          resolve();
        };
        this.waiters.push(wake);
      });
    }
  }

  send(frame) {
    if (this.closedInfo) throw new Error(`WS 已关闭，无法发送：${JSON.stringify(frame)}`);
    this.ws.send(JSON.stringify(frame));
  }

  close() {
    try { this.ws.close(); } catch { /* 幂等收尾 */ }
  }
}

// ---------- admin API 工具 ----------

/** 带 x-admin-token 的 GET；非 200 直接断言失败 */
async function adminGet(pathname) {
  const res = await fetch(`${BASE}${pathname}`, { headers: { 'x-admin-token': ADMIN_TOKEN } });
  assert.equal(res.status, 200, `GET ${pathname} 期望 200，实际 ${res.status}`);
  return res.json();
}

// ---------- 共享上下文与测试计划 ----------

/** 全流程共享状态（会话 id、WS 通道等） */
const ctx = { srv: null, databaseUrl: null, sessionId: null, ch: null, askFrame: null, round1Deltas: [] };

/** 测试计划：顺序执行，某步失败后其余记 SKIP */
const plan = [
  ['前置检查（server 入口 / mock 可执行 / 数据库连通）', async () => {
    assert.ok(
      existsSync(SERVER_ENTRY),
      `src/server.mjs 尚不存在（A1 未交付？），全链路测试被 blocked。期望路径：${SERVER_ENTRY}`,
    );
    assert.ok(existsSync(MOCK_PATH), `缺少 mock 脚本：${MOCK_PATH}`);
    try {
      accessSync(MOCK_PATH, constants.X_OK);
    } catch {
      assert.fail(`mock-claude.mjs 缺少可执行权限，请执行：chmod +x ${MOCK_PATH}`);
    }
    ctx.databaseUrl = await resolveDatabaseUrl();
    // 数据库连通性预检：把「DB 连不上」与「服务起不来」区分开，报错更可定位
    const client = new pg.Client({ connectionString: ctx.databaseUrl });
    try {
      await client.connect();
      await client.query('SELECT 1');
    } catch (err) {
      assert.fail(`本机 PostgreSQL 连接失败（${maskUrl(ctx.databaseUrl)}）：${err.message}`);
    } finally {
      await client.end().catch(() => {});
    }
  }],

  ['子进程启动 src/server.mjs + /chat/api/health 就绪', async () => {
    ctx.srv = startServer(buildEnv(ctx.databaseUrl));
    await waitHealthy(ctx.srv, BASE);
  }],

  ['POST /chat/api/sessions 创建会话', async () => {
    const res = await fetch(`${BASE}/chat/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ referrer: 'chat-e2e-test' }),
    });
    // 文档 §3.5 未锁定状态码：201（Created）或 200 均视为契约内
    assert.ok(res.status === 200 || res.status === 201, `期望 HTTP 200/201，实际 ${res.status}`);
    const body = await res.json().catch(() => ({}));
    const sessionId = pick(body, ['sessionId', 'id']) ?? pick(body.session ?? {}, ['id', 'sessionId']);
    assert.ok(
      typeof sessionId === 'string' && sessionId.length >= 8,
      `响应缺少 sessionId：${JSON.stringify(body)}`,
    );
    ctx.sessionId = sessionId;
  }],

  ['第 1 轮：assistant_delta 流式下发且无协议行泄漏', async () => {
    ctx.ch = new WsChannel(`ws://127.0.0.1:${PORT}/chat/ws/${ctx.sessionId}`, WS_ORIGIN);
    await ctx.ch.openPromise;
    // 开场注入触发 mock 第 1 轮：收集 delta 与 session_ready，直到 ask_user 出现
    const { picked, stopFrame } = await ctx.ch.collectUntil(
      (f) => f.type === 'assistant_delta' || f.type === 'session_ready',
      (f) => f.type === 'ask_user',
      '第 1 轮：assistant_delta → ask_user',
    );
    ctx.askFrame = stopFrame;
    ctx.round1Deltas = picked.filter((f) => f.type === 'assistant_delta');
    // session_ready 帧若存在则校验会话 id 一致（时机未约定，故不强制其存在）
    const ready = picked.find((f) => f.type === 'session_ready');
    if (ready && ready.sessionId != null) {
      assert.equal(String(ready.sessionId), String(ctx.sessionId), 'session_ready 的 sessionId 与建会话结果不一致');
    }
    // 断言：至少一条非空增量
    assert.ok(ctx.round1Deltas.length >= 1, `应至少收到 1 条 assistant_delta，已收帧：${ctx.ch.frameTypes()}`);
    assert.ok(
      ctx.round1Deltas.some((f) => typeof f.text === 'string' && f.text.length > 0),
      'assistant_delta 增量应非空',
    );
    // 断言：协议行不泄漏给前端（含跨 chunk 半行，见文档 §3.2 的行缓冲要求）
    const joined = ctx.round1Deltas.map((f) => f.text ?? '').join('');
    assert.ok(!joined.includes('ASK_USER_JSON'), `ASK_USER_JSON 协议行泄漏到了前端 delta：${joined}`);
    assert.ok(!joined.includes('ASK_US'), `协议行半行「ASK_US」泄漏（跨 chunk 行未缓冲拼接，见文档 §3.2）：${joined}`);
  }],

  ['第 1 轮：ask_user 帧含 question 与 options', () => {
    const f = ctx.askFrame;
    assert.ok(typeof f.question === 'string' && f.question.includes('JD'),
      `question 应为提及 JD 的字符串，实际：${JSON.stringify(f.question)}`);
    assert.ok(Array.isArray(f.options) && f.options.length >= 1
      && f.options.every((o) => typeof o === 'string'),
      `options 应为非空字符串数组，实际：${JSON.stringify(f.options)}`);
  }],

  ['第 2 轮：ask_answer 贴 JD → assistant_done 含匹配结论', async () => {
    ctx.ch.send({ type: 'ask_answer', answer: FAKE_JD, option: '我贴 JD 原文' });
    const { stopFrame } = await ctx.ch.collectUntil(
      (f) => f.type === 'assistant_delta',
      (f) => f.type === 'assistant_done' && String(f.text ?? '').includes('匹配'),
      '第 2 轮：ask_answer → assistant_done（含「匹配」）',
    );
    assert.ok(String(stopFrame.text ?? '').includes('匹配'),
      `assistant_done 应包含「匹配」，实际：${JSON.stringify(stopFrame.text)}`);
    // 文档未强制 LEAD_JSON 行不下发前端，这里只提示不判失败
    if (String(stopFrame.text ?? '').includes('LEAD_JSON')) {
      console.log('  [提示] assistant_done 中含 LEAD_JSON 原文（文档未要求拦截，仅提示）');
    }
    ctx.ch.close();
  }],

  ['admin：会话已落库且消息数 ≥4', async () => {
    await sleep(1000); // 留出异步落库的窗口
    const body = await adminGet(`/chat/api/admin/sessions/${ctx.sessionId}`);
    const session = body.session ?? body;
    const sid = pick(session, ['id', 'sessionId']) ?? pick(body, ['id']);
    assert.ok(sid, `admin 会话详情缺少 id：${JSON.stringify(body).slice(0, 200)}`);
    assert.equal(String(sid).toLowerCase(), String(ctx.sessionId).toLowerCase(),
      'admin 会话详情的 id 与建会话结果不一致');
    const messages = body.messages ?? session.messages ?? [];
    assert.ok(messages.length >= 4,
      `落库消息数应 ≥4（一轮对话的 user/assistant/ask_user/ask_answer 至少各一），实际 ${messages.length}`);
  }],

  ['admin：leads 里有 jd_title=AI 应用工程师 / match=high', async () => {
    const body = await adminGet('/chat/api/admin/leads');
    const leads = Array.isArray(body) ? body : (body.items ?? body.leads ?? []);
    assert.ok(Array.isArray(leads), `leads 响应应为数组：${JSON.stringify(body).slice(0, 200)}`);
    // 优先按会话 id 定位本测试的线索；字段名不一致时按 jd_title 兜底
    let mine = leads.filter((l) => {
      const sid = pick(l, ['sessionId', 'session_id']) ?? pick(l.session ?? {}, ['id']);
      return sid != null && String(sid) === String(ctx.sessionId);
    });
    if (mine.length === 0) {
      mine = leads.filter((l) => pick(l, ['jdTitle', 'jd_title']) === 'AI 应用工程师');
    }
    assert.ok(mine.length >= 1, 'leads 中未找到本会话的线索（jd_title=AI 应用工程师）');
    const lead = mine[0];
    assert.equal(pick(lead, ['jdTitle', 'jd_title']), 'AI 应用工程师');
    const match = pick(lead, ['matchLevel', 'match_level', 'match']);
    assert.equal(match, 'high', `match 应为 high，实际：${JSON.stringify(match)}`);
  }],

  ['admin：stats 总会话数 ≥1', async () => {
    const stats = await adminGet('/chat/api/admin/stats');
    const total = pick(stats, ['totalSessions', 'total_sessions', 'total']) ?? pick(stats.sessions ?? {}, ['total']);
    assert.ok(Number(total) >= 1, `stats 总会话数应 ≥1，实际：${JSON.stringify(total)}`);
    // 匹配分布若提供则顺带校验 high 档（字段缺失不算失败）
    const high = pick(stats.matchDistribution ?? stats.match ?? {}, ['high']);
    if (high !== undefined) {
      assert.ok(Number(high) >= 1, `stats 匹配分布 high 应 ≥1，实际：${JSON.stringify(high)}`);
    }
  }],
].map(([name, fn]) => ({
  name,
  fn,
  // admin 三项断言互不依赖且都只依赖「会话已建立」：单项失败不连坐跳过其余两项
  isolated: name.startsWith('admin：'),
}));

// ---------- 清理（任何路径都必须执行） ----------

async function teardown() {
  // 1. 关 WS（若有）
  if (ctx.ch) ctx.ch.close();
  // 2. 停 server 子进程（先于删数据，避免并发写入竞争）
  if (ctx.srv) {
    await stopServer(ctx.srv);
    console.log(`清理：server 子进程已停止（pid=${ctx.srv.proc.pid}）`);
  }
  // 3. 删除本次测试会话的全部落库数据（按外键顺序：messages/leads → sessions）
  if (ctx.sessionId && ctx.databaseUrl) {
    const client = new pg.Client({ connectionString: ctx.databaseUrl });
    try {
      await client.connect();
      const messages = await client.query('DELETE FROM chat_messages WHERE session_id = $1', [ctx.sessionId]);
      const leads = await client.query('DELETE FROM chat_leads WHERE session_id = $1', [ctx.sessionId]);
      const sessions = await client.query('DELETE FROM chat_sessions WHERE id = $1', [ctx.sessionId]);
      console.log(`清理：已删除测试会话 ${ctx.sessionId}（messages=${messages.rowCount} leads=${leads.rowCount} session=${sessions.rowCount}）`);
    } finally {
      await client.end().catch(() => {});
    }
  }
}

// ---------- 主流程 ----------

const results = [];
let fatal = null;
let aborted = false;

console.log('chat 全链路自测（mock claude）');
console.log(`  chat 目录：${CHAT_DIR}`);
console.log(`  BASE      ：${BASE}`);
console.log(`  数据库    ：${maskUrl('postgresql://resume:***@127.0.0.1:5432/resume')}`);
console.log('');

for (const { name, fn, isolated } of plan) {
  if (aborted) {
    results.push({ name, ok: null });
    console.log(`[SKIP] ${name}（前置步骤失败，未执行）`);
    continue;
  }
  const startedAt = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`[PASS] ${name}（${Date.now() - startedAt}ms）`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`[FAIL] ${name} —— ${err.message}`);
    fatal = err;
    if (!isolated) aborted = true; // 非独立步骤失败：后续依赖步骤全部跳过
  }
}

// 失败时附上 server 日志尾部，方便定位是服务端还是测试侧的问题
if (fatal && ctx.srv && !ctx.srv.hasExited()) {
  console.log(`\n${ctx.srv.tail()}`);
}

try {
  await teardown();
} catch (err) {
  console.log(`[WARN] 清理阶段出错：${err.message}`);
}

// ---------- 汇总 ----------

const passCount = results.filter((r) => r.ok === true).length;
const failCount = results.filter((r) => r.ok === false).length;
const skipCount = results.filter((r) => r.ok === null).length;

console.log('\n==================== 测试汇总 ====================');
for (const r of results) {
  const tag = r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'SKIP';
  console.log(`  ${tag}  ${r.name}`);
}
console.log('==================================================');
console.log(`${passCount} 通过 / ${failCount} 失败 / ${skipCount} 跳过`);

process.exit(failCount > 0 ? 1 : 0);
