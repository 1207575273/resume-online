// claude -p stream-json 流协议解析器（A2 地盘，详见 docs/ai-chat-plan.md §3.1–§3.3）
//
// 职责：
//   1. 协议层 A（字节流 → JSON 帧）：按行缓冲 onData 输出（跨 chunk 半行要拼接），
//      每行尝试 JSON.parse，只关注两类帧：
//        - `stream_event`：只取 event.type === "content_block_delta"
//          且 event.delta.type === "text_delta" 的 event.delta.text 文本增量；
//        - `result`：本轮终帧（PTY 常驻复用上下文：每轮 user 消息对应一个 result，
//          不是全会话终帧），先吐净文本尾巴，再回调 onResult(result.result)。
//      其余帧（system/init、user 回显等）与 JSON.parse 失败的杂散行（CLI 噪音、
//      stderr 混流）一律静默忽略——访客绝不该看到裸协议。
//   2. 协议层 B（assistant 文本 → 净文本）：从累积文本里提取协议行：
//        - ASK_USER_JSON {…}（§3.2 人在环）→ onAskUser(obj)，整行从下发文本中剔除；
//        - LEAD_JSON {…}（§3.3 线索）→ onLead(obj)，同样整行剔除（避免前端看到裸 JSON）。
//      onDelta 只收“净增量”：一行文本在看到结尾换行之前无法判定是否协议行，
//      因此按行粒度下发（聊天场景下延迟可忽略）。
//   3. 一切解析错误就地吞掉（含 JSON.parse 失败、尾逗号容错、回调抛异常），绝不向上抛。
//
// 注意：PTY 的 ONLCR 会把子进程输出的 "\n" 变成 "\r\n"，行分割按 "\n"、行内容剥尾部 "\r"。

// —— 契约正则（§3.2 / §3.3 原文；用于单行匹配，m 标志在行内无换行时无副作用）——
const RE_ASK_LINE = /^\s*ASK_USER_JSON\s*(\{.*\})\s*$/m;
const RE_LEAD_LINE = /^\s*LEAD_JSON\s*(\{.*\})\s*$/m;

// 快路径预筛：一批文本里压根没出现协议关键字时，免去逐行慢路径
const RE_PROTOCOL_HINT = /ASK_USER_JSON|LEAD_JSON/;

/**
 * 宽松 JSON 解析：
 * 1. 直接 JSON.parse；
 * 2. 失败则剥掉 JSON5 风格尾逗号（{"a":1,} → {"a":1}，§3.3 容错要求）再试一次；
 * 3. 仍失败返回 undefined（调用方负责吞行 + 记日志，绝不抛）。
 */
function lenientJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    /* 第一次失败，尝试尾逗号容错 */
  }
  try {
    return JSON.parse(text.replace(/,\s*([}\]])/g, '$1'));
  } catch {
    return undefined;
  }
}

/**
 * 判定一行 assistant 文本是否协议行。
 * @param {string} line 单行文本（不含换行）
 * @returns {{kind:'ask_user'|'lead', json:string}|null} 命中返回 kind 与捕获的 JSON 串
 */
function matchProtocolLine(line) {
  let m = RE_ASK_LINE.exec(line);
  if (m) return { kind: 'ask_user', json: m[1] };
  m = RE_LEAD_LINE.exec(line);
  if (m) return { kind: 'lead', json: m[1] };
  return null;
}

/**
 * 组一行 stream-json user 消息（含结尾换行），用于写入 claude -p 的 stdin。
 * 文本经 JSON.stringify 转义，内嵌换行会变成 \n 字面量，整体仍是一行。
 * @param {string} text 用户消息原文
 * @returns {string} 形如 {"type":"user","message":{"role":"user","content":[{"type":"text","text":…}]}}\n
 */
export function formatUserMessage(text) {
  return (
    JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: String(text ?? '') }],
      },
    }) + '\n'
  );
}

/**
 * 创建 claude -p --output-format stream-json 的流解析器。
 * @param {{
 *   onDelta?: (netText: string) => void,   // 净文本增量（协议行已剔除）
 *   onAskUser?: (ask: object) => void,      // 命中 ASK_USER_JSON，参数为解析出的对象
 *   onLead?: (lead: object) => void,        // 命中 LEAD_JSON，参数为解析出的对象
 *   onResult?: (fullText: string) => void,  // result 帧（每轮一个），参数为 result.result 全文
 * }} handlers
 * @returns {{push(chunkText: string): void, flush(): void}}
 *          push 喂 onData 的原始输出；flush 在进程退出时调用，吐掉无换行结尾的尾巴。
 */
export function createStreamParser({ onDelta, onAskUser, onLead, onResult } = {}) {
  // 协议层 A 缓冲：原始字节流中尚未凑成完整行（没见到 \n）的部分
  let lineBuffer = '';
  // 协议层 B 缓冲：assistant 文本中尚未判定为“安全净文本”的尾巴（最后一个 \n 之后）
  let pendingOut = '';
  /** 本轮流已触发过的协议行原文（增量路径先触发后，result 兜底提取时去重防双发） */
  const thisTurnFired = new Set();
  let flushed = false; // flush() 幂等

  // 回调统一兜底：调用方 bug 不允许打断整条流
  const safeCall = (fn, arg) => {
    if (typeof fn !== 'function') return;
    try {
      fn(arg);
    } catch (err) {
      console.error('[claude-protocol] 回调抛异常（已吞）:', err?.message ?? err);
    }
  };

  const emitDelta = (netText) => {
    if (netText) safeCall(onDelta, netText);
  };

  /** 协议行命中：解析 JSON 并触发 onAskUser / onLead；解析失败则整行吞掉 + 记日志。 */
  const fireProtocol = ({ kind, json }) => {
    const data = lenientJsonParse(json);
    if (!data || typeof data !== 'object') {
      console.error(
        `[claude-protocol] ${kind} 行 JSON 解析失败，整行已吞（不下发）: ${json.slice(0, 200)}`
      );
      return;
    }
    if (kind === 'ask_user') safeCall(onAskUser, data);
    else safeCall(onLead, data);
  };

  /**
   * 把 pendingOut 中“最后一个换行之前”的部分判定为安全净文本并下发：
   * 无协议关键字 → 整段直发（快路径）；否则逐行剔除协议行后下发（慢路径）。
   * 换行之后的尾巴仍可能是半条协议行，留待后续 delta / flush() 判定。
   */
  const drainTextLines = () => {
    let nl;
    while ((nl = pendingOut.lastIndexOf('\n')) >= 0) {
      const ready = pendingOut.slice(0, nl + 1); // 含结尾换行的完整若干行
      pendingOut = pendingOut.slice(nl + 1); // 无换行尾巴继续缓冲
      if (!RE_PROTOCOL_HINT.test(ready)) {
        emitDelta(ready); // 快路径：与协议无关的普通文本
        continue;
      }
      // 慢路径：逐行检查协议行。"a\nb\n".split("\n") 末尾必有一个空串
      const segs = ready.split('\n');
      let net = '';
      for (let i = 0; i < segs.length - 1; i++) {
        const proto = matchProtocolLine(segs[i]);
        if (proto) {
          thisTurnFired.add(segs[i]); // 登记：result 兜底提取时去重
          fireProtocol(proto); // 命中：吞整行（含换行），触发回调
        } else {
          net += segs[i] + '\n'; // 普通行：原样保留（含换行）
        }
      }
      emitDelta(net);
    }
  };

  /** 处理一条完整的 JSON 帧（已剥 \r 的单行）。 */
  const handleFrameLine = (line) => {
    if (!line) return;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      return; // 杂散输出（CLI 噪音 / stderr 混流），静默忽略
    }
    if (!obj || typeof obj !== 'object') return;

    if (obj.type === 'stream_event') {
      const ev = obj.event;
      // 契约：只处理 content_block_delta 的 text_delta
      if (
        ev?.type === 'content_block_delta' &&
        ev?.delta?.type === 'text_delta' &&
        typeof ev.delta.text === 'string'
      ) {
        pendingOut += ev.delta.text;
        drainTextLines();
      }
      return;
    }

    if (obj.type === 'result') {
      // result 是“每轮”的终帧（PTY 常驻复用上下文：下一轮 user 消息后还有新 delta），
      // 不是全会话终帧，因此每轮各回调一次 onResult。
      // 先吐净文本尾巴：保证上层时序为 delta → result。
      flushPendingTail();
      let raw = typeof obj.result === 'string' ? obj.result : '';
      // 关键兜底：并非所有 provider/模型都会吐 stream_event 增量（本机 glm 实测
      // 只有终帧 result）——协议行提取与清洗必须在 result 文本上再跑一遍，
      // 否则 ASK_USER_JSON / LEAD_JSON 会整行漏给前端且不触发回调。
      if (raw && RE_PROTOCOL_HINT.test(raw)) {
        const segs = raw.split('\n');
        const netLines = [];
        for (const seg of segs) {
          const proto = matchProtocolLine(seg);
          if (proto && !thisTurnFired.has(seg)) {
            thisTurnFired.add(seg);
            fireProtocol(proto);
          } else {
            netLines.push(seg);
          }
        }
        raw = netLines.join('\n');
      }
      thisTurnFired.clear(); // 每轮终帧后重置：下一轮允许相同协议行再次触发
      safeCall(onResult, raw);
      return;
    }

    // 其余帧（system/init、user 回显等）忽略
  };

  /**
   * 吐掉 pendingOut 里无换行结尾的尾巴：整体视为一行做协议判定，
   * 命中协议行则吞 + 触发回调，否则作为净增量下发。
   */
  const flushPendingTail = () => {
    if (!pendingOut) return;
    const tail = pendingOut;
    pendingOut = '';
    const proto = matchProtocolLine(tail);
    if (proto) fireProtocol(proto);
    else emitDelta(tail);
  };

  return {
    /** 喂入 PTY onData 的原始输出（任意切割粒度，内部按行缓冲拼接）。 */
    push(chunkText) {
      if (flushed || typeof chunkText !== 'string' || chunkText === '') return;
      lineBuffer += chunkText;
      let nl;
      while ((nl = lineBuffer.indexOf('\n')) >= 0) {
        const line = lineBuffer.slice(0, nl);
        lineBuffer = lineBuffer.slice(nl + 1);
        handleFrameLine(line.replace(/\r$/, '')); // PTY 行尾 \r\n → 剥 \r
      }
    },

    /**
     * 进程退出时调用（幂等）：
     * 1. lineBuffer 里可能残留一条无换行结尾的最后一帧，兜底按整帧处理；
     * 2. pendingOut 的净文本尾巴下发 / 协议行提取。
     */
    flush() {
      if (flushed) return;
      flushed = true;
      if (lineBuffer) {
        const rest = lineBuffer;
        lineBuffer = '';
        handleFrameLine(rest.replace(/\r$/, ''));
      }
      flushPendingTail();
    },
  };
}
