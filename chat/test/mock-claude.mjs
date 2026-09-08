#!/usr/bin/env node
/**
 * mock-claude.mjs —— 脚本化假 claude CLI（A9，docs/ai-chat-plan.md §9）
 *
 * 用途：在无 API key、无真实 claude CLI 的环境里替代
 *   claude -p --input-format stream-json --output-format stream-json --verbose
 * 跑通 chat 服务全链路（PTY 桥 → 协议解析 → ASK_USER 人在环 → LEAD 落库 → admin 查询）。
 *
 * 契约（与 chat/src/claude-protocol.mjs 的解析约定一致，见文档 §3.1）：
 *   stdin  ：逐行读取 stream-json user 消息
 *            {"type":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
 *   stdout ：逐行输出 stream-json 帧（parser 只需关注两类，其余帧应被忽略）：
 *            - {"type":"stream_event","event":{"type":"content_block_delta","index":0,
 *               "delta":{"type":"text_delta","text":"增量文本"}}}
 *            - {"type":"result","subtype":"success",...,"result":"净文本（剥掉协议行）"}
 *            另外进程启动时先发一帧 {"type":"system","subtype":"init",...}（模仿真实 CLI
 *            的首帧，顺带考验 parser 对非关注帧的容错）。
 *
 * 轮次状态机（按收到的 user 消息条数）：
 *   第 1 条（开场注入）→ 欢迎 delta + 把 ASK_USER_JSON 行拆成两段 delta 输出
 *                        （"ASK_US" / "ER_JSON {...}"，制造跨 chunk 切割场景，考验
 *                          parser 对不完整行的缓冲拼接，见文档 §3.2）+ result（净文本）
 *   第 2 条（访客贴 JD）→ 匹配分析 delta（含「匹配度：高」）+ LEAD_JSON 整行 + result（净文本）
 *   第 3 条起           → 简单回显 + result
 *
 * 注意：第 1 轮欢迎文本刻意不含「匹配」二字——run-tests.mjs 依靠「匹配」关键词区分
 * 第 2 轮的 assistant_done，避免第 1 轮（若实现选择在 ask_user 后也发 done）造成误判。
 */

import { createInterface } from 'node:readline';

// ---------- 各轮次脚本常量 ----------

/** 第 1 轮欢迎文本（净文本，无协议行） */
const ROUND1_INTRO = '你好！我是基于 CodeYang 公开简历的 AI 助手。\n把想咨询的岗位告诉我，我来帮你评估。';

/** 第 1 轮：ASK_USER_JSON 整行（将拆成 "ASK_US" + 后半段 两个 delta 输出） */
const ASK_LINE =
  'ASK_USER_JSON {"question":"方便贴一下 JD 原文吗？","options":["我贴 JD 原文","先按岗位名粗评"],"allowCustom":true}';

/** ASK_USER_JSON 行的前半段（跨 chunk 切割点） */
const ASK_LINE_HEAD = 'ASK_US';

/** 第 2 轮分析正文（含「匹配度：高」；result 帧取此净文本） */
const ROUND2_BODY =
  '收到 JD，初步评估：\n- 匹配度：高\n- Java 后端与 AI Agent 双线经验与该岗位高度契合\n- 需要关注的点：团队规模';

/** 第 2 轮：LEAD_JSON 整行（A3 用正则提取后写入 chat_leads） */
const LEAD_LINE =
  'LEAD_JSON {"jd_title":"AI 应用工程师","match":"high","summary":"Java+Agent 双线匹配","concerns":["团队规模"],"jd_digest":"Java/Agent/可观测"}';

/** 回显轮的输入截断上限 */
const ECHO_MAX_CHARS = 200;

/** 帧间隔（ms）：模拟流式输出节奏，也便于观察 delta 粒度 */
const FRAME_DELAY_MS = 12;

// ---------- 帧输出 ----------

/** 会话标识（模仿 claude CLI 的 session_id，仅装饰用） */
const SESSION_ID = `mock-${process.pid}-${Date.now().toString(36)}`;

/** 帧输出统一走 stdout；忽略 EPIPE（对端提前关闭时不至于崩溃） */
process.stdout.on('error', (err) => {
  if (err && err.code === 'EPIPE') return;
  throw err;
});

const writeFrame = (frame) => process.stdout.write(`${JSON.stringify(frame)}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 输出一个 text_delta 增量帧 */
async function emitDelta(text) {
  writeFrame({
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    },
  });
  await sleep(FRAME_DELAY_MS);
}

/** 输出 result 终帧（result 为剥掉协议行之后的净文本） */
function emitResult(netText, turns) {
  writeFrame({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 100,
    duration_api_ms: 80,
    num_turns: turns,
    result: netText,
    session_id: SESSION_ID,
    total_cost_usd: 0,
    usage: {
      input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 0,
    },
  });
}

/** 依次输出若干 delta 后跟一个 result 终帧 */
async function emitTurn(deltas, netText, turns) {
  for (const text of deltas) await emitDelta(text);
  emitResult(netText, turns);
}

// ---------- 轮次状态机 ----------

/** 已处理的 user 轮次（1 起） */
let turnCount = 0;

/** 从 stream-json user 消息里提取文本（兼容 content 为字符串或块数组两种形态） */
function extractText(msg) {
  const content = msg && msg.message ? msg.message.content : null;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');
  }
  return '';
}

/** 第 1 条：欢迎文本 + 跨 chunk 的 ASK_USER_JSON 行 + result（净文本） */
async function roundOne() {
  await emitTurn(
    [
      `${ROUND1_INTRO}\n`,
      ASK_LINE_HEAD, // 半行："ASK_US"
      `${ASK_LINE.slice(ASK_LINE_HEAD.length)}\n`, // 后半行："ER_JSON {...}"
    ],
    ROUND1_INTRO,
    1,
  );
}

/** 第 2 条：匹配度分析（含「匹配度：高」）+ LEAD_JSON 行 + result（净文本） */
async function roundTwo() {
  await emitTurn(
    [
      '收到 JD，初步评估：\n- ',
      '匹配度：高\n- Java 后端与 AI Agent 双线经验与该岗位高度契合\n- 需要关注的点：团队规模\n',
      `${LEAD_LINE}\n`,
    ],
    ROUND2_BODY,
    2,
  );
}

/** 第 3 条起：简单回显 + result */
async function roundEcho(text) {
  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, ECHO_MAX_CHARS);
  const reply = `[mock 回显] 已收到你的消息：${snippet}`;
  await emitTurn([reply], reply, turnCount);
}

/** 处理一行 stdin：解析为 user 消息后按轮次分发 */
async function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return; // 忽略空行

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    process.stderr.write(`[mock-claude] 忽略无法解析的行：${trimmed.slice(0, 120)}\n`);
    return;
  }
  if (!msg || msg.type !== 'user') return; // 只响应 user 消息，其余类型忽略

  turnCount += 1;
  const text = extractText(msg);

  if (turnCount === 1) await roundOne();
  else if (turnCount === 2) await roundTwo();
  else await roundEcho(text);
}

// ---------- 主循环：串行处理 stdin 的每行 user 消息 ----------

// 用 promise 链保证轮次严格串行（避免极端时序下两轮 delta 交错）
let queue = Promise.resolve();
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  queue = queue.then(() => handleLine(line)).catch((err) => {
    process.stderr.write(`[mock-claude] 处理输入出错：${err && err.stack ? err.stack : err}\n`);
  });
});

// 进程启动即发出 system/init 帧（模仿真实 CLI 首帧；parser 按文档 §3.1 应忽略）
writeFrame({
  type: 'system',
  subtype: 'init',
  session_id: SESSION_ID,
  model: process.env.CHAT_MODEL || 'mock',
  slash_commands: [],
  mcp_servers: [],
});
