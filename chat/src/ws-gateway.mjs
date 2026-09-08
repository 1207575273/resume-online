/**
 * resume-chat WS 网关（A1 地盘）—— 每个会话的核心状态机
 *
 * 连接：/chat/ws/:sessionId
 *   1. origin 校验（guards.checkOrigin，A8）→ 会话存在性校验（db.getSession）
 *   2. 该会话若无 PTY 则懒启动：getResumeContext() → buildOpeningMessage() →
 *      claudeFactory({ sessionId, openingMessage, claudeCmd, model, maxTurns, on* })
 *   3. 首个连接成功即下发 session_ready
 *
 * WS 协议（docs/ai-chat-plan.md §3.4）：
 *   收：user_message / ask_answer / ping
 *   发：session_ready / assistant_delta / assistant_done / ask_user / ask_user_timeout /
 *       session_end(reason=idle_timeout|max_turns|server|claude_exit) / error
 *
 * 生命周期要点：
 *   - 空闲计时器（CHAT_IDLE_MS）：任何收发活动都会重置；超时结束会话
 *   - ask_user 120s 未答：下发 ask_user_timeout，会话回到普通输入态
 *   - 断开时 PTY 保留至空闲超时 → 短暂断线可用同一 sessionId 重连恢复
 *     （恢复后可继续收后续 delta，但已错过的历史 delta 不重放）
 *   - 单轮 assistant 输出攒稿并截断（MAX_OUTPUT_CHARS，§5.3）
 *
 * 依赖契约（已与 A2/A3/A6/A8 产出对表）：
 *   A2 pty-bridge：createClaudeSession(opts) → { sendUserMessage(text): boolean, kill(), pid }，
 *     回调 onDelta(text) / onAskUser({question,options,allowCustom}) / onLead(lead) /
 *          onResult(text) / onExit(code, reason: 'exit'|'signal'|'killed'|'error')
 *   A3 db（createDb 实例）：getSessionWithMessages(id) → {session, messages} | null /
 *     appendMessage / bumpTurn / endSession(sessionId, reason) /
 *     insertLead({sessionId, jdTitle, matchLevel, summary, concerns, jdDigest})；行字段驼峰
 *   A6 prompt/resume-context：getResumeContext(fetch, apiBase) → string；
 *     buildOpeningMessage(resumeText) → string（惰性动态 import，缺文件时降级）
 *   A8 security（createGuards 实例）：checkMessage(text) → {ok, reason?}、sanitize(text)、
 *     originAllowed(origin, host) → boolean、registerSessionEnd(ip)（均可选）
 */
import { WebSocketServer, WebSocket } from "ws";
import { clientIp, maskIp } from "./security.mjs";

const WS_PREFIX = "/chat/ws/";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A8 返回的英文 reason 码 → 面向访客的中文提示（未命中原样透传） */
const GUARD_REASONS = {
  empty: "消息不能为空",
  too_long: "消息过长，请精简后重试",
  rate_limit_hour: "提问太频繁了，请稍后再试",
  rate_limit_day: "今日会话次数已用完，明天再来吧",
};

/** 结束 PTY：A2 契约为 kill()（SIGTERM 进程组 + 3s SIGKILL 兜底） */
function stopClaude(claude) {
  if (!claude) return;
  try {
    claude.kill();
  } catch (err) {
    console.warn(`[chat] 停止 claude 会话出错（忽略）：${err?.message ?? err}`);
  }
}

/** 惰性加载 A6 模块（ESM 模块注册表自带缓存，重复 import 无额外开销）；文件暂缺时返回空对象 */
async function loadModule(specifier, label) {
  try {
    return await import(specifier);
  } catch (err) {
    console.warn(`[chat] ${label} 加载失败（A6 未就绪？将降级）：${err?.message ?? err}`);
    return {};
  }
}

/**
 * 创建网关（依赖注入风格，A9 测试用 stub 替换 claudeFactory/db/guards）。
 * @param {{ config: object, db: object, guards?: object, claudeFactory: Function }} deps
 */
export function createGateway({ config, db, guards, claudeFactory }) {
  const wss = new WebSocketServer({ noServer: true, clientTracking: true });
  /** sessionId → 会话状态 */
  const sessions = new Map();

  function createState(sessionId, ip, turnCount = 0) {
    const state = {
      sessionId,
      ip: ip ?? "",
      sockets: new Set(), // 同一会话允许先后多个 ws（断线重连）
      claude: null, // PTY 句柄（懒启动）
      starting: false, // PTY 启动中（此时用户消息先排队）
      pending: [], // PTY 就绪前排队的用户输入
      assistantBuffer: "", // 当前轮 delta 攒稿（终稿用于 assistant_done + 入库）
      turnCount, // 累计轮次（达 MAX_TURNS 后拒绝新输入并结束）
      idleTimer: null,
      askTimer: null,
      ended: false,
      endReason: null,
    };
    touch(state); // 创建即开始空闲计时
    return state;
  }

  /** 重置空闲计时器：任何活动（收到消息/delta/ask）后调用 */
  function touch(state) {
    if (state.ended) return;
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      console.log(`[chat] 会话空闲超时结束 id=${state.sessionId}`);
      endSessionInternal(state, "idle_timeout");
    }, config.IDLE_MS);
  }

  /** 向该会话所有打开中的连接广播一帧 */
  function broadcast(state, frame) {
    const payload = JSON.stringify(frame);
    for (const ws of state.sockets) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  function sendError(state, message) {
    broadcast(state, { type: "error", message });
  }

  // ---------- claude 回调（由 A2 桥调用） ----------

  function makeClaudeCallbacks(state) {
    return {
      /** 增量文本：转发前端 + 攒终稿（超 8k 截断） */
      onDelta(text) {
        if (state.ended) return;
        touch(state);
        broadcast(state, { type: "assistant_delta", text: String(text ?? "") });
        if (state.assistantBuffer.length < config.MAX_OUTPUT_CHARS) {
          state.assistantBuffer = (state.assistantBuffer + String(text ?? "")).slice(0, config.MAX_OUTPUT_CHARS);
        }
      },

      /** 人在环提问：下发 ask_user、落库（全量收集的一部分）并启动 120s 答题计时 */
      onAskUser(payload = {}) {
        if (state.ended) return;
        touch(state);
        broadcast(state, {
          type: "ask_user",
          question: String(payload.question ?? ""),
          options: Array.isArray(payload.options) ? payload.options.map(String) : [],
          allowCustom: payload.allowCustom !== false,
        });
        db.appendMessage({
          sessionId: state.sessionId,
          role: "ask_user",
          content: String(payload.question ?? ""),
          raw: payload,
        }).catch((err) => {
          console.warn(`[chat] ask_user 落库失败（不阻塞）：${err?.message ?? err}`);
        });
        if (state.askTimer) clearTimeout(state.askTimer);
        state.askTimer = setTimeout(() => {
          state.askTimer = null;
          broadcast(state, { type: "ask_user_timeout" });
        }, config.ASK_TIMEOUT_MS);
      },

      /** 线索（LEAD_JSON，字段为 prompt.mjs 锁定的下划线命名）：入库，失败只记日志不阻塞对话 */
      async onLead(lead = {}) {
        const matchLevel = lead.match_level ?? lead.match ?? null; // match 短名兜底：模型偶发跑偏
        try {
          await db.insertLead({
            sessionId: state.sessionId,
            jdTitle: lead.jd_title ?? null,
            matchLevel,
            summary: lead.summary ?? null,
            concerns: Array.isArray(lead.concerns) ? lead.concerns : [],
            jdDigest: lead.jd_digest ?? null,
          });
          console.log(`[chat] lead 入库 session=${state.sessionId} match=${matchLevel ?? "?"}`);
        } catch (err) {
          console.warn(`[chat] lead 入库失败（不阻塞对话）：${err?.message ?? err}`);
        }
      },

      /** 一轮回答完成：下发完整文本 + 入库 */
      async onResult(text) {
        if (state.ended) return;
        if (state.askTimer) {
          clearTimeout(state.askTimer);
          state.askTimer = null;
        }
        const full = (typeof text === "string" && text.trim() !== "" ? text : state.assistantBuffer).slice(
          0,
          config.MAX_OUTPUT_CHARS,
        );
        broadcast(state, { type: "assistant_done", text: full });
        state.assistantBuffer = "";
        try {
          await db.appendMessage({ sessionId: state.sessionId, role: "assistant", content: full });
        } catch (err) {
          console.warn(`[chat] assistant 消息入库失败：${err?.message ?? err}`);
        }
      },

      /** claude 进程退出（A2 契约：code + 'exit'|'signal'|'killed'|'error'）：结束会话（幂等） */
      onExit(code, reason) {
        console.log(`[chat] claude 进程退出 id=${state.sessionId} code=${code} reason=${reason}`);
        endSessionInternal(state, "server");
      },
    };
  }

  /** 懒启动 PTY：简历上下文获取失败则降级为空上下文，不中断服务 */
  async function ensureClaude(state) {
    if (state.claude || state.starting || state.ended) return;
    state.starting = true;
    try {
      let resumeContext = "";
      try {
        const mod = await loadModule("./resume-context.mjs", "resume-context.mjs");
        if (typeof mod.getResumeContext === "function") {
          // A6 契约：getResumeContext(fetchImpl?, apiBase?)，apiBase 用 config 单一来源
          resumeContext = await mod.getResumeContext(fetch, config.RESUME_API_BASE);
        }
      } catch (err) {
        console.warn(`[chat] 简历上下文获取失败，降级为空上下文：${err?.message ?? err}`);
      }
      let openingMessage;
      try {
        const mod = await loadModule("./prompt.mjs", "prompt.mjs");
        if (typeof mod.buildOpeningMessage === "function") {
          openingMessage = mod.buildOpeningMessage(resumeContext);
        }
      } catch (err) {
        console.warn(`[chat] 开场消息构建失败，退回原始上下文：${err?.message ?? err}`);
      }
      if (typeof openingMessage !== "string") openingMessage = resumeContext;
      const callbacks = makeClaudeCallbacks(state);
      state.claude = await claudeFactory({
        sessionId: state.sessionId,
        openingMessage,
        claudeCmd: config.CLAUDE_CMD,
        model: config.MODEL,
        maxTurns: config.MAX_TURNS,
        ...callbacks,
      });
    } catch (err) {
      state.starting = false;
      console.error(`[chat] claude 会话启动失败 id=${state.sessionId}：${err?.message ?? err}`);
      sendError(state, "AI 会话启动失败，请稍后重试");
      endSessionInternal(state, "server");
      return;
    }
    state.starting = false;
    console.log(`[chat] claude 会话已启动 id=${state.sessionId} model=${config.MODEL}`);
    // PTY 启动前排队的用户输入按序补发
    const queued = state.pending.splice(0);
    for (const text of queued) sendToPty(state, text);
  }

  /** 向 PTY 注入用户输入；未就绪则排队 */
  function sendToPty(state, text) {
    if (state.ended) return;
    if (!state.claude) {
      state.pending.push(text);
      void ensureClaude(state);
      return;
    }
    const fn = state.claude.sendUserMessage;
    if (typeof fn !== "function") {
      console.error(`[chat] PTY 句柄缺少 sendUserMessage 方法，消息被丢弃`);
      sendError(state, "AI 会话内部错误，请刷新重试");
      return;
    }
    try {
      const ok = fn.call(state.claude, text);
      if (ok === false) {
        // A2 契约：sendUserMessage 返回 false 表示进程已退出
        console.warn(`[chat] PTY 已退出，消息未送达 id=${state.sessionId}`);
        sendError(state, "AI 会话已结束，请刷新页面重新开始");
      }
    } catch (err) {
      console.error(`[chat] 向 PTY 写入失败：${err?.message ?? err}`);
      sendError(state, "AI 会话通信失败，请稍后重试");
    }
  }

  // ---------- 浏览器消息 ----------

  /** A8 消息检查（契约：checkMessage(text) 位置参数）：未实现时放行，抛错视为拒绝 */
  async function guardMessage(text) {
    const fn = guards?.checkMessage;
    if (typeof fn !== "function") return { ok: true };
    try {
      const verdict = await fn(text);
      return verdict ?? { ok: true };
    } catch (err) {
      return { ok: false, reason: err?.message || "消息被拒绝" };
    }
  }

  /** A8 清洗（契约：sanitize(text) 截断 + 剥控制字符）；未实现时原样返回 */
  function sanitizeText(text) {
    const fn = guards?.sanitize;
    if (typeof fn !== "function") return text;
    try {
      const out = fn(text);
      return typeof out === "string" && out !== "" ? out : text;
    } catch {
      return text;
    }
  }

  /** 处理一条浏览器消息（JSON 文本帧） */
  async function onClientMessage(state, ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString("utf8"));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "消息格式错误（需要 JSON）" }));
      return;
    }
    if (typeof msg?.type !== "string") {
      ws.send(JSON.stringify({ type: "error", message: "缺少 type 字段" }));
      return;
    }
    touch(state);

    if (msg.type === "ping") {
      // 应用层 ping 忽略：传输层心跳由 ws 协议自带 pong 承担
      return;
    }

    if (msg.type === "user_message" || msg.type === "ask_answer") {
      const isAskAnswer = msg.type === "ask_answer";
      let text = String(isAskAnswer ? (msg.answer ?? "") : (msg.text ?? "")).trim();
      if (text === "") {
        sendError(state, isAskAnswer ? "回答不能为空" : "消息不能为空");
        return;
      }
      // 防御性长度硬顶：2 倍上限直接拒（正式 4000 字符限制由 A8 checkMessage 执行）
      if (text.length > config.MAX_INPUT_CHARS * 2) {
        sendError(state, `消息过长（上限 ${config.MAX_INPUT_CHARS} 字符）`);
        return;
      }
      const verdict = await guardMessage(text);
      if (!verdict.ok) {
        sendError(state, GUARD_REASONS[verdict.reason] ?? verdict.reason ?? "消息被拒绝");
        return;
      }
      text = sanitizeText(text);
      // 轮次上限：达到后不再接受输入，直接结束
      if (state.turnCount >= config.MAX_TURNS) {
        endSessionInternal(state, "max_turns");
        return;
      }
      state.turnCount += 1;
      if (isAskAnswer && state.askTimer) {
        clearTimeout(state.askTimer);
        state.askTimer = null;
      }
      try {
        await db.appendMessage({
          sessionId: state.sessionId,
          role: isAskAnswer ? "ask_answer" : "user",
          content: text,
          raw: isAskAnswer && typeof msg.option === "string" ? { option: msg.option } : null,
        });
        await db.bumpTurn(state.sessionId);
      } catch (err) {
        console.warn(`[chat] 用户消息入库失败（继续转发）：${err?.message ?? err}`);
      }
      sendToPty(state, text);
      return;
    }

    sendError(state, `未知消息类型：${msg.type}`);
  }

  // ---------- 会话结束（唯一出口，幂等） ----------

  async function endSessionInternal(state, reason) {
    if (state.ended) return;
    state.ended = true;
    state.endReason = reason;
    if (state.idleTimer) clearTimeout(state.idleTimer);
    if (state.askTimer) clearTimeout(state.askTimer);
    state.pending = [];

    broadcast(state, { type: "session_end", reason });
    stopClaude(state.claude);
    state.claude = null;
    sessions.delete(state.sessionId);

    for (const ws of state.sockets) {
      try {
        ws.close(1000, `session_end:${reason}`);
      } catch {
        /* 忽略个别连接关闭异常 */
      }
    }
    state.sockets.clear();

    console.log(`[chat] 会话结束 id=${state.sessionId} reason=${reason} turns=${state.turnCount}`);
    // A8 契约：会话结束时回收该 IP 一次新会话配额（提前结束返还额度）
    try {
      guards?.registerSessionEnd?.(state.ip);
    } catch {
      /* 回收失败不影响主流程 */
    }
    try {
      await db.endSession(state.sessionId, reason);
    } catch (err) {
      console.error(`[chat] 会话结束落库失败 id=${state.sessionId}：${err?.message ?? err}`);
    }
  }

  // ---------- upgrade 与连接 ----------

  /** origin 校验（A8 契约：originAllowed(origin, host)）：未实现时放行（本地/联调） */
  function originOk(req) {
    const fn = guards?.originAllowed;
    if (typeof fn !== "function") return true;
    try {
      return Boolean(fn(req.headers.origin, req.headers.host));
    } catch {
      return false;
    }
  }

  /** 拒绝 upgrade：回 HTTP 错误并断开 */
  function rejectUpgrade(socket, status, message) {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }

  /**
   * 处理 http server 的 upgrade 事件（server.mjs 调用）。
   * @returns {boolean} 匹配 /chat/ws/ 前缀则接管（无论成败）并返回 true；否则返回 false 由调用方 destroy。
   */
  function handleUpgrade(req, socket, head) {
    let pathname = "";
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      return false;
    }
    if (!pathname.startsWith(WS_PREFIX)) return false;

    void (async () => {
      const sessionId = decodeURIComponent(pathname.slice(WS_PREFIX.length));
      if (!UUID_RE.test(sessionId)) {
        rejectUpgrade(socket, 404, "Not Found");
        return;
      }
      if (!originOk(req)) {
        console.warn(`[chat] WS origin 校验失败，已拒绝 session=${sessionId}`);
        rejectUpgrade(socket, 403, "Forbidden");
        return;
      }
      let row = null;
      try {
        // A3 契约：getSessionWithMessages 返回 {session, messages} | null（这里只需要 session 行）
        const data = await db.getSessionWithMessages(sessionId);
        row = data?.session ?? null;
      } catch (err) {
        console.error(`[chat] 会话查询失败：${err?.message ?? err}`);
        rejectUpgrade(socket, 500, "Internal Server Error");
        return;
      }
      if (!row) {
        rejectUpgrade(socket, 404, "Not Found");
        return;
      }
      const ip = clientIp(req);
      wss.handleUpgrade(req, socket, head, (ws) => {
        void onConnection(ws, sessionId, row, ip);
      });
    })();
    return true;
  }

  /** 首帧发送：推迟到握手 101 flush 之后，避免与握手响应合段到达导致客户端丢帧 */
  function sendFirstFrame(ws, frame) {
    setImmediate(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
    });
  }

  /** 首帧后再关闭连接（sendFirstFrame 是延迟发送，同步 close 会抢在帧之前生效） */
  function closeAfterFirstFrame(ws) {
    setImmediate(() => {
      try {
        ws.close(1000, "session_end");
      } catch {
        /* 忽略 */
      }
    });
  }

  /** 新连接：绑定会话状态、懒启动 PTY、挂消息/关闭处理 */
  async function onConnection(ws, sessionId, sessionRow, ip = "") {
    // 已结束的会话不允许恢复：告知前端后即关闭（A3 行字段驼峰 endReason）
    if (sessionRow?.status === "ended") {
      sendFirstFrame(ws, { type: "session_end", reason: sessionRow.endReason ?? "ended" });
      closeAfterFirstFrame(ws);
      return;
    }

    let state = sessions.get(sessionId);
    if (!state) {
      state = createState(sessionId, ip, Number(sessionRow?.turnCount ?? sessionRow?.turn_count ?? 0));
      sessions.set(sessionId, state);
      console.log(`[chat] WS 会话建立 id=${sessionId} ip=${maskIp(state.ip)}`);
    }

    state.sockets.add(ws);
    sendFirstFrame(ws, { type: "session_ready", sessionId });

    if (state.ended) {
      // 竞态兜底：连接瞬间刚好被结束
      sendFirstFrame(ws, { type: "session_end", reason: state.endReason ?? "server" });
      closeAfterFirstFrame(ws);
      return;
    }

    ws.on("message", (raw) => {
      void onClientMessage(state, ws, raw).catch((err) => {
        console.error(`[chat] 处理客户端消息异常：${err?.stack ?? err}`);
      });
    });

    // 断开：PTY 保留至空闲超时（支持同一 sessionId 短暂断线重连恢复）
    ws.on("close", () => {
      state.sockets.delete(ws);
    });
    ws.on("error", () => {
      state.sockets.delete(ws);
      try {
        ws.terminate();
      } catch {
        /* 忽略 */
      }
    });

    void ensureClaude(state);
  }

  /** 优雅退出：结束全部会话（session_end + 落库 + 杀 PTY）并关闭 ws 服务器 */
  async function shutdown() {
    const endings = [];
    for (const state of [...sessions.values()]) {
      endings.push(endSessionInternal(state, "server"));
    }
    await Promise.allSettled(endings);
    await new Promise((resolve) => {
      wss.close(() => resolve());
    });
    console.log("[chat] 网关已关闭");
  }

  return {
    handleUpgrade,
    shutdown,
    /** 运行时概览（日志/诊断用） */
    getStats() {
      return { sessions: sessions.size };
    },
  };
}
