"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * AI 聊天会话状态机（浏览器侧，协议见 docs/ai-chat-plan.md §3.4）
 *
 * idle ──open()──▶ connecting ──session_ready/open──▶ ready ⇄ asking ──▶ ended
 *   │                                                │
 *   └────────────── 异常（建会失败 / 重连失败）──────────────▶ error
 *
 * - open()：POST /chat/api/sessions 建会话 → 连 WS（同 sessionId 幂等；ended/error 时重开新会话）
 * - close()：仅收起 UI，不断 WS（重开恢复同一会话）；beforeunload 不主动断，服务端空闲超时兜底
 * - 异常断线：同 sessionId 静默重连一次，再失败才进 error
 */

/** 会话状态 */
export type ChatState = "idle" | "connecting" | "ready" | "asking" | "ended" | "error";

/** ask_user 帧（人在环提问） */
export interface AskMessage {
  id: number;
  role: "ask";
  question: string;
  options: string[];
  allowCustom: boolean;
  answered: boolean;
  chosen: string | null;
  expired: boolean;
}

export type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; streaming: boolean }
  | AskMessage
  | { id: number; role: "notice"; tone: "info" | "error"; text: string };

/** ask_answer 载荷：option 为选中的预设选项原文；answer 为实际回答文本 */
export interface AskAnswerPayload {
  option?: string;
  answer: string;
}

/** server→client 帧（§3.4，字段宽松解析，坏帧一律丢弃） */
type ServerFrame =
  | { type: "session_ready" }
  | { type: "assistant_delta"; text?: string }
  | { type: "assistant_done"; text?: string }
  | { type: "ask_user"; question?: string; options?: unknown; allowCustom?: boolean }
  | { type: "ask_user_timeout" }
  | { type: "session_end"; reason?: string }
  | { type: "error"; message?: string };

export interface ChatSessionApi {
  visible: boolean;
  state: ChatState;
  messages: ChatMessage[];
  /** 当前待回答的 ask_user（无则 null） */
  pendingAsk: AskMessage | null;
  open(): void;
  close(): void;
  send(text: string): void;
  answer(payload: AskAnswerPayload): void;
}

/** 单条输入上限（§5：≤4000 字符/条）；chat-widget 的输入框 maxLength 同源引用 */
export const MAX_INPUT = 4000;
/** 应用层心跳：中间设备常在 30~60s 掐空闲连接，25s 一拍 */
const PING_MS = 25_000;
/** 断线后静默重连的退避 */
const RECONNECT_DELAY_MS = 800;

export function useChatSession(): ChatSessionApi {
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<ChatState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // 同步镜像：WS 回调里不能依赖 state/messages 的闭包值（避免竞态，如 session_end 与 onclose 先后）
  const stateRef = useRef<ChatState>("idle");
  const messagesRef = useRef<ChatMessage[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const idRef = useRef(0);
  const startLockRef = useRef(false);
  const reconnectTriedRef = useRef(false);
  const unmountedRef = useRef(false);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const applyState = useCallback((next: ChatState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const applyMessages = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessages(prev => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const nextId = () => ++idRef.current;

  const stopPing = useCallback(() => {
    if (pingTimerRef.current !== null) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const detachWs = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    stopPing();
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* 已在关闭中则忽略 */
      }
    }
  }, [stopPing]);

  const handleFrame = useCallback(
    (frame: ServerFrame) => {
      switch (frame.type) {
        // session_ready：onopen 已做 connecting→ready 兜底，此帧无需处理（落入空分支即丢弃）

        case "assistant_delta": {
          const delta = frame.text ?? "";
          if (!delta) break;
          const id = nextId();
          applyMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.streaming) {
              return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
            }
            return [...prev, { id, role: "assistant", text: delta, streaming: true }];
          });
          if (stateRef.current !== "asking") applyState("asking");
          break;
        }

        case "assistant_done": {
          const full = typeof frame.text === "string" ? frame.text : null;
          const id = nextId();
          applyMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.streaming) {
              // done 帧带全量文本，以其为准（无则保留已累积的增量）
              return [...prev.slice(0, -1), { ...last, text: full ?? last.text, streaming: false }];
            }
            return full ? [...prev, { id, role: "assistant", text: full, streaming: false }] : prev;
          });
          if (stateRef.current === "asking") applyState("ready");
          break;
        }

        case "ask_user": {
          const options = Array.isArray(frame.options)
            ? frame.options.filter((o): o is string => typeof o === "string")
            : [];
          const id = nextId();
          applyMessages(prev => [
            ...prev,
            {
              id,
              role: "ask",
              question: frame.question ?? "",
              options,
              allowCustom: frame.allowCustom === true,
              answered: false,
              chosen: null,
              expired: false,
            },
          ]);
          // 本轮输出暂停，等访客作答
          if (stateRef.current === "asking") applyState("ready");
          break;
        }

        case "ask_user_timeout": {
          const id = nextId();
          applyMessages(prev => [
            ...prev.map(m => (m.role === "ask" && !m.answered ? { ...m, expired: true } : m)),
            { id, role: "notice", tone: "info", text: "该问题长时间未作答，已跳过，可继续提问" },
          ]);
          break;
        }

        case "session_end": {
          applyState("ended");
          stopPing();
          const reason = frame.reason;
          const text =
            reason === "idle_timeout"
              ? "会话因长时间未操作已结束，可开启新对话继续"
              : reason === "max_turns"
                ? "已达本轮会话对话上限，可开启新对话继续"
                : "会话已结束";
          const id = nextId();
          applyMessages(prev => [...prev, { id, role: "notice", tone: "info", text }]);
          break;
        }

        case "error": {
          // 单轮出错：提示后回到可输入态，不终结会话
          const id = nextId();
          applyMessages(prev => [
            ...prev,
            { id, role: "notice", tone: "error", text: frame.message || "服务处理出错，请换个问法重试" },
          ]);
          if (stateRef.current === "asking") applyState("ready");
          break;
        }
      }
    },
    [applyMessages, applyState, stopPing],
  );

  const startPing = useCallback((ws: WebSocket) => {
    stopPing();
    pingTimerRef.current = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          /* 发送失败交给 onclose 处理 */
        }
      }
    }, PING_MS);
  }, [stopPing]);

  const connectWs = useCallback(
    (sessionId: string) => {
      if (unmountedRef.current) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/chat/ws/${sessionId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        // 服务端随后推 session_ready；这里兜底切 ready（重连场景服务端可能不重发）
        if (stateRef.current === "connecting") applyState("ready");
        startPing(ws);
      };

      ws.onmessage = (ev: MessageEvent) => {
        if (wsRef.current !== ws) return;
        let frame: ServerFrame;
        try {
          frame = JSON.parse(String(ev.data)) as ServerFrame;
        } catch {
          return; // 非 JSON 帧直接丢弃
        }
        if (!frame || typeof frame.type !== "string") return;
        handleFrame(frame);
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        stopPing();
        // 正常结束 / 从未开始：不动
        if (stateRef.current === "ended" || stateRef.current === "idle") return;
        // 异常断线：同 sessionId 静默重连一次
        if (!reconnectTriedRef.current && sessionIdRef.current) {
          reconnectTriedRef.current = true;
          applyState("connecting");
          reconnectTimerRef.current = window.setTimeout(() => {
            if (!unmountedRef.current && sessionIdRef.current) {
              connectWs(sessionIdRef.current);
            }
          }, RECONNECT_DELAY_MS);
          return;
        }
        applyState("error");
        const id = nextId();
        applyMessages(prev => [
          ...prev,
          { id, role: "notice", tone: "error", text: "连接已中断，请开启新对话重试" },
        ]);
      };
      // onerror 不单独处理：其后必触发 onclose
    },
    [applyMessages, applyState, handleFrame, startPing, stopPing],
  );

  const startSession = useCallback(async () => {
    if (startLockRef.current) return;
    startLockRef.current = true;
    applyState("connecting");
    try {
      const res = await fetch("/chat/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ referrer: document.referrer || "" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { sessionId?: string };
      if (!data.sessionId) throw new Error("响应缺少 sessionId");
      sessionIdRef.current = data.sessionId;
      reconnectTriedRef.current = false;
      connectWs(data.sessionId);
    } catch {
      applyState("error");
      const id = nextId();
      applyMessages(prev => [
        ...prev,
        { id, role: "notice", tone: "error", text: "连接 AI 助手失败，请稍后重试" },
      ]);
    } finally {
      startLockRef.current = false;
    }
  }, [applyMessages, applyState, connectWs]);

  const open = useCallback(() => {
    setVisible(true);
    const st = stateRef.current;
    if (st === "ended" || st === "error") {
      // 旧会话已死：清屏重开新会话
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      detachWs();
      sessionIdRef.current = null;
      reconnectTriedRef.current = false;
      applyMessages(() => []);
      void startSession();
      return;
    }
    if (st === "idle" && !sessionIdRef.current) {
      void startSession(); // 首次点击才建会话，不影响首屏
    }
    // connecting/ready/asking：会话仍活，重开即恢复（同 sessionId）
  }, [applyMessages, detachWs, startSession]);

  const close = useCallback(() => {
    // 只收起 UI；WS 与会话保留，重开恢复
    setVisible(false);
  }, []);

  /** 活跃 ask 判定（协议不变式：同时至多一个未答未过期的 ask） */
  const isActiveAsk = (m: ChatMessage): m is AskMessage =>
    m.role === "ask" && !m.answered && !m.expired;

  const hasPendingAsk = () => messagesRef.current.some(isActiveAsk);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim().slice(0, MAX_INPUT);
      const ws = wsRef.current;
      if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return;
      if (stateRef.current !== "ready" || hasPendingAsk()) return;
      applyMessages(prev => [...prev, { id: nextId(), role: "user", text: trimmed }]);
      applyState("asking");
      ws.send(JSON.stringify({ type: "user_message", text: trimmed }));
    },
    [applyMessages, applyState],
  );

  const answer = useCallback(
    (payload: AskAnswerPayload) => {
      const trimmed = payload.answer.trim().slice(0, MAX_INPUT);
      const ws = wsRef.current;
      if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return;
      if (stateRef.current === "ended" || stateRef.current === "error") return;
      if (!hasPendingAsk()) return;
      applyMessages(prev => [
        ...prev.map(m =>
          m.role === "ask" && !m.answered && !m.expired
            ? { ...m, answered: true, chosen: payload.option ?? trimmed }
            : m,
        ),
        { id: nextId(), role: "user", text: trimmed },
      ]);
      applyState("asking");
      const frame: { type: "ask_answer"; answer: string; option?: string } = {
        type: "ask_answer",
        answer: trimmed,
      };
      if (payload.option) frame.option = payload.option;
      ws.send(JSON.stringify(frame));
    },
    [applyMessages, applyState],
  );

  const pendingAsk = useMemo(() => messages.find(isActiveAsk) ?? null, [messages]);

  // 组件卸载（页内路由跳转）时才收尾；beforeunload 不主动断（服务端空闲超时兜底）
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      detachWs();
    };
  }, [detachWs]);

  return { visible, state, messages, pendingAsk, open, close, send, answer };
}
