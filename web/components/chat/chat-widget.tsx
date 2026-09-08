"use client";

import { Check, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  useChatSession,
  MAX_INPUT,
  type AskAnswerPayload,
  type AskMessage,
  type ChatState,
} from "./use-chat-session";

/**
 * 简历页 AI 聊天入口：右下角浮动圆钮 + 聊天窗（桌面 380×560 卡片 / 移动端底部全宽抽屉）。
 * 会话与 WS 逻辑在 use-chat-session；首次点击才建会话，不影响首屏。
 * 动画仅用 animate-in / animate-pulse（globals.css 已在 prefers-reduced-motion 下禁用）。
 */

const SUGGESTIONS = [
  "他符合 AI 应用工程师的岗位要求吗？",
  "介绍一下他的 AI Agent 项目经验",
  "他的 Kubernetes 与可观测体系经验如何？",
];

/** 聊天输入框 / 发送按钮的共享样式（主输入与 AskCard 自定义输入同款） */
const INPUT_CLS =
  "min-h-[44px] flex-1 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3.5 text-sm text-[var(--text)] transition-colors duration-200 outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]";
const SEND_CLS =
  "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[var(--accent-solid)] text-white transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

const STATUS: Record<ChatState, { label: string; dot: string }> = {
  idle: { label: "待开启", dot: "bg-[var(--text-dim)]" },
  connecting: { label: "连接中…", dot: "bg-[#ffd60a]" },
  ready: { label: "在线 · 可提问", dot: "bg-[#30d158]" },
  asking: { label: "回复中…", dot: "bg-[var(--accent)]" },
  ended: { label: "会话已结束", dot: "bg-[var(--text-dim)]" },
  error: { label: "连接异常", dot: "bg-[#ff453a]" },
};

export function ChatWidget() {
  const { visible, state, messages, pendingAsk, open, close, send, answer } = useChatSession();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canSend = state === "ready" && !pendingAsk;
  const terminal = state === "ended" || state === "error";

  // 打开时聚焦输入框；Esc 收起
  useEffect(() => {
    if (!visible) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close]);

  // 新消息/流式增量时贴底滚动（用户上翻查看历史时不打扰）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages, visible]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    send(text);
    setDraft("");
  }

  const status = STATUS[state];
  const lastMsg = messages[messages.length - 1];
  const waitingFirstDelta =
    state === "asking" && !(lastMsg?.role === "assistant" && lastMsg.streaming);

  return (
    <>
      {!visible && (
        <button
          type="button"
          onClick={open}
          aria-label="问 AI：他符合你的 JD 吗？打开聊天窗"
          aria-expanded={false}
          className="no-print fixed bottom-5 right-5 z-50 flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-[var(--accent-solid)] px-5 text-sm font-medium text-white shadow-[var(--card-lift)] transition-opacity duration-200 hover:opacity-90"
        >
          <MessageCircle className="size-4" aria-hidden />
          <span>问 AI · 符合你的 JD 吗？</span>
        </button>
      )}

      {visible && (
        <section
          role="dialog"
          aria-label="AI 简历助手聊天窗"
          className="no-print animate-in fade-in-0 slide-in-from-bottom-2 duration-200 fixed inset-x-0 bottom-0 z-50 flex h-[min(640px,88dvh)] flex-col overflow-hidden rounded-t-3xl border border-[var(--hairline)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--card-lift)] sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[380px]"
        >
          <header className="flex items-center justify-between gap-2 border-b border-[var(--hairline)] px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`size-2 shrink-0 rounded-full ${status.dot}`} aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">AI 简历助手</p>
                <p className="truncate text-xs leading-tight text-[var(--text-dim)]">
                  {status.label}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="收起聊天窗"
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--text-dim)] transition-colors duration-200 hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div
            ref={scrollRef}
            aria-label="对话消息流"
            className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
          >
            {messages.length === 0 && !terminal ? (
              <Welcome busy={state === "connecting"} onPick={send} />
            ) : (
              messages.map(m => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent-solid)] px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words text-white">
                        {m.text}
                      </p>
                    </div>
                  );
                }
                if (m.role === "assistant") {
                  return (
                    <div key={m.id} className="flex justify-start">
                      <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-[var(--surface-2)] px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {m.text}
                        {m.streaming && (
                          <span
                            aria-hidden
                            className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-[var(--accent)]"
                          />
                        )}
                      </p>
                    </div>
                  );
                }
                if (m.role === "ask") {
                  return <AskCard key={m.id} msg={m} onAnswer={answer} />;
                }
                return (
                  <div key={m.id} className="flex justify-center">
                    <p
                      className={
                        m.tone === "error"
                          ? "max-w-[92%] rounded-lg border border-[rgba(255,69,58,0.4)] bg-[rgba(255,69,58,0.08)] px-3 py-1.5 text-center text-xs leading-relaxed text-[#d70015] dark:text-[#ff6961]"
                          : "max-w-[92%] rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-1.5 text-center text-xs leading-relaxed text-[var(--text-dim)]"
                      }
                    >
                      {m.text}
                    </p>
                  </div>
                );
              })
            )}

            {waitingFirstDelta && <TypingDots />}
          </div>

          <footer className="border-t border-[var(--hairline)]">
            {pendingAsk ? (
              <p className="px-4 py-3 text-xs leading-relaxed text-[var(--text-dim)]">
                请先在上方选择或输入回答，再继续对话
              </p>
            ) : terminal ? (
              <div className="p-3">
                <button
                  type="button"
                  onClick={open}
                  className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--accent)] transition-colors duration-200 hover:bg-[var(--chip-bg)]"
                >
                  <RotateCcw className="size-4" aria-hidden />
                  开启新对话
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="flex items-end gap-2 p-3">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  maxLength={MAX_INPUT}
                  disabled={!canSend}
                  aria-label="输入问题"
                  placeholder={
                    state === "connecting"
                      ? "连接中…"
                      : state === "asking"
                        ? "AI 正在回复…"
                        : "例如：贴一段 JD，问匹配度"
                  }
                  className={`${INPUT_CLS} disabled:cursor-not-allowed disabled:opacity-55`}
                />
                <button
                  type="submit"
                  disabled={!canSend || !draft.trim()}
                  aria-label="发送"
                  className={SEND_CLS}
                >
                  <Send className="size-4" aria-hidden />
                </button>
              </form>
            )}
            <p className="border-t border-[var(--hairline)] px-4 py-2 text-center text-[11px] leading-snug text-[var(--text-dim)]">
              AI 助手基于公开简历回答，仅供参考
            </p>
          </footer>
        </section>
      )}
    </>
  );
}

/** 空态：欢迎语 + 快捷提问 */
function Welcome({ busy, onPick }: { busy: boolean; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex justify-start">
        <p className="max-w-[92%] rounded-2xl rounded-bl-md bg-[var(--surface-2)] px-3.5 py-2.5 text-sm leading-relaxed">
          你好，我是 AI 简历助手。可以问我关于杨胜的经历、技能与项目，也可以直接贴一段 JD，让我评估匹配度。
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => onPick(s)}
            className="flex min-h-[44px] w-full cursor-pointer items-center rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-2 text-left text-sm text-[var(--text-dim)] transition-colors duration-200 hover:border-[var(--card-border-hover)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** ask_user：选项按钮组（提交后禁用，选中项高亮）；allowCustom 时附自定义输入 */
function AskCard({ msg, onAnswer }: { msg: AskMessage; onAnswer: (p: AskAnswerPayload) => void }) {
  const [custom, setCustom] = useState("");
  const done = msg.answered || msg.expired;

  function submitCustom(e: FormEvent) {
    e.preventDefault();
    const text = custom.trim();
    if (!text || done) return;
    onAnswer({ answer: text });
    setCustom("");
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-3.5">
        <p className="mb-2.5 text-sm font-medium leading-relaxed">{msg.question}</p>
        <div className="flex flex-col gap-2">
          {msg.options.map(opt => {
            const chosen = msg.chosen === opt;
            return (
              <button
                key={opt}
                type="button"
                disabled={done}
                aria-pressed={msg.answered && chosen}
                onClick={() => onAnswer({ option: opt, answer: opt })}
                className={`flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3.5 py-2 text-left text-sm leading-relaxed transition-colors duration-200 ${
                  msg.answered && chosen
                    ? "border-[var(--accent)] bg-[var(--chip-bg)] text-[var(--accent)]"
                    : "border-[var(--hairline)] bg-[var(--surface)] hover:border-[var(--card-border-hover)] hover:bg-[var(--surface-2)] disabled:opacity-55"
                } ${done ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                {msg.answered && chosen && <Check className="size-4 shrink-0" aria-hidden />}
                <span>{opt}</span>
              </button>
            );
          })}
          {msg.allowCustom && !done && (
            <form onSubmit={submitCustom} className="flex items-end gap-2 pt-1">
              <input
                value={custom}
                onChange={e => setCustom(e.target.value)}
                maxLength={MAX_INPUT}
                aria-label="自定义回答"
                placeholder="或输入你的回答…"
                className={`min-w-0 ${INPUT_CLS}`}
              />
              <button
                type="submit"
                disabled={!custom.trim()}
                aria-label="提交自定义回答"
                className={SEND_CLS}
              >
                <Send className="size-4" aria-hidden />
              </button>
            </form>
          )}
          {msg.expired && !msg.answered && (
            <p className="pt-0.5 text-xs leading-relaxed text-[var(--text-dim)]">
              该问题已超时跳过
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** 等待首个 delta 的输入中提示（reduced-motion 下由 globals.css 停掉弹跳） */
function TypingDots() {
  return (
    <div className="flex justify-start" aria-label="AI 正在输入">
      <div
        aria-hidden
        className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-[var(--surface-2)] px-3.5 py-3"
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-[var(--text-dim)]"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
