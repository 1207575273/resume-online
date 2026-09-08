// claude -p 的常驻会话桥（A2 地盘，详见 docs/ai-chat-plan.md §3.1）
//
// 每个会话 spawn 一个常驻 claude 进程跑：
//   claude -p --input-format stream-json --output-format stream-json --verbose \
//          --max-turns N --model M --disallowed-tools Bash,Edit,Write,NotebookEdit,WebFetch
// 输出（stdout）全部交给 createStreamParser 解析；输入（sendUserMessage）向 stdin
// 写一行 stream-json user 消息。会话结束 kill()：SIGTERM 整个进程组 → 3s 后 SIGKILL 兜底。
//
// —— stdio 管道而非 PTY（真机踩坑记录，2026-09-07）——
// 原方案用 node-pty（终端语义），真机验证发现 claude CLI 在「stdin 是 TTY」时，
// 启动早期即报 "Input must be provided either through stdin or as a prompt
// argument" 退出（无论 canonical/raw、无论注入时机——它在任何输出帧之前做同步检查，
// TTY 缓冲里的数据它读不到）。而 stdin 是管道时完全正常，且已验证多轮常驻：
// 连续写两条 user 消息得到两个 result 帧、进程持续存活。
// 附带收益：管道没有 4096 字节行限制（12KB 开场免分块）、stderr 可单独捕获进日志。
// detached:true 让 claude 成为进程组长，process.kill(-pid) 仍可整组收割。

import { spawn } from 'node:child_process';
import { createStreamParser, formatUserMessage } from './claude-protocol.mjs';

/** 僵尸进程巡检间隔（契约：内部 5s 轮询检查进程活着）。 */
const ZOMBIE_CHECK_MS = 5000;
/** kill() 后 SIGKILL 强杀的宽限期。 */
const KILL_GRACE_MS = 3000;

/**
 * 创建一个常驻 claude -p 会话。
 * @param {{
 *   sessionId: string,             // 会话 ID（仅用于日志前缀）
 *   openingMessage?: string,       // 首条注入的 user 消息（prompt.mjs 生成的系统指令 + 简历上下文）
 *   claudeCmd?: string,            // claude 可执行命令（测试可用 CHAT_CLAUDE_CMD / mock 脚本覆盖）
 *   model?: string,                // 默认 sonnet
 *   maxTurns?: number,             // 默认 24
 *   env?: object,                  // 子进程环境（默认 process.env，透传 ANTHROPIC_* 鉴权）
 *   onDelta?: (netText: string) => void,
 *   onAskUser?: (ask: object) => void,
 *   onLead?: (lead: object) => void,
 *   onResult?: (fullText: string) => void,
 *   onExit?: (code: number|null, reason: 'exit'|'signal'|'killed'|'error') => void,
 * }} opts
 * @returns {{sendUserMessage(text: string): boolean, kill(): void, pid: number|null}}
 */
export function createClaudeSession({
  sessionId,
  openingMessage,
  claudeCmd = 'claude',
  model = 'sonnet',
  maxTurns = 24,
  env = process.env,
  onDelta,
  onAskUser,
  onLead,
  onResult,
  onExit,
}) {
  const log = (...args) => console.error(`[pty-bridge ${sessionId}]`, ...args);

  // 契约锁定的启动参数（一字不改）
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-turns',
    String(maxTurns),
    '--model',
    model,
    '--disallowed-tools',
    'Bash,Edit,Write,NotebookEdit,WebFetch',
  ];

  const parser = createStreamParser({ onDelta, onAskUser, onLead, onResult });

  let child;
  try {
    child = spawn(claudeCmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true, // claude 成为新进程组长：process.kill(-pid) 可整组收割
      cwd: env?.HOME ?? process.env.HOME ?? process.cwd(),
      env,
    });
  } catch (err) {
    // 同步兜底：spawn 本身失败（如 env 非法）。命令不存在的情况走异步 onExit（非零 code）。
    log('spawn 同步失败:', err?.message ?? err);
    try {
      onExit?.(-1, 'error');
    } catch {
      /* 调用方回调异常不再兜底 */
    }
    return { sendUserMessage: () => false, kill: () => {}, pid: null };
  }

  let exited = false; // onExit 是否已派发（保证恰好一次）
  let killedByUs = false; // kill() 是否已发起
  let zombieTimer = null;
  let killTimer = null;

  const stopTimers = () => {
    if (zombieTimer) {
      clearInterval(zombieTimer);
      zombieTimer = null;
    }
    if (killTimer) {
      clearTimeout(killTimer);
      killTimer = null;
    }
  };

  /** 收尾：恰好一次地 flush 解析器并派发 onExit。 */
  const finish = (code, reason) => {
    if (exited) return;
    exited = true;
    stopTimers();
    try {
      parser.flush(); // 契约：进程退出时 flush，吐掉无换行结尾的尾巴
    } catch (err) {
      log('parser.flush 异常（已吞）:', err?.message ?? err);
    }
    try {
      onExit?.(code, reason);
    } catch (err) {
      log('onExit 回调异常（已吞）:', err?.message ?? err);
    }
  };

  // —— 输出侧：stdout → 解析器；stderr → 日志（claude 的报错全部留痕）——
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (data) => {
    if (exited) return;
    try {
      parser.push(data);
    } catch (err) {
      // 解析器内部已自带容错，这里再兜一层：单帧解析 bug 不允许杀死整个会话
      log('parser.push 异常（已吞，会话继续）:', err?.message ?? err);
    }
  });
  child.stderr.setEncoding('utf8');
  let stderrTail = '';
  child.stderr.on('data', (data) => {
    stderrTail = (stderrTail + data).slice(-2000);
    process.stderr.write(`[claude ${sessionId}] ${data}`);
  });

  // —— 退出侧：正常/信号退出 ——
  child.on('exit', (code, signal) => {
    if (signal) log('claude 被信号终止:', signal, '| stderr 尾部:', stderrTail.slice(-400));
    else if (code !== 0) log('claude 非零退出:', code, '| stderr 尾部:', stderrTail.slice(-400));
    finish(signal != null ? (code ?? -1) : (code ?? 0), killedByUs ? 'killed' : signal != null ? 'signal' : 'exit');
  });
  child.on('error', (err) => {
    // spawn 异步失败（如命令不存在）
    log('claude 进程 error:', err?.message ?? err);
    finish(-1, 'error');
  });

  // —— 防僵尸：5s 轮询探测进程是否还活着（exit 偶发丢失时的兜底；定时器由 finish 清理）——
  zombieTimer = setInterval(() => {
    try {
      process.kill(child.pid, 0); // 探活信号 0：能返回即存活
    } catch (err) {
      if (err?.code === 'EPERM') return; // 进程存在只是无权查看，不算死
      if (err?.code === 'ESRCH') {
        // 进程已消失但 exit 没触发 → 异常路径兜底
        log('僵尸探测：进程已消失但未收到 exit，走 error 兜底, pid =', child.pid);
        finish(-1, 'error');
      }
    }
  }, ZOMBIE_CHECK_MS);
  zombieTimer.unref?.();

  // —— 输入侧：写一行 stream-json user 消息到 stdin（管道无行宽限制，直接整行写）——
  const sendUserMessage = (text) => {
    if (exited) return false;
    try {
      child.stdin.write(formatUserMessage(text));
      return true;
    } catch (err) {
      log('write stdin 失败（已吞）:', err?.message ?? err);
      return false;
    }
  };

  // —— 首条注入：stdin 是管道，spawn 后立即写入即可——
  // 数据在管道缓冲里等着，claude 启动后的首次读取就能拿到（这正是它在 TTY 上做不到的）。
  if (openingMessage != null && openingMessage !== '') {
    sendUserMessage(openingMessage);
  }

  // —— 终止：先 SIGTERM 进程组，3s 后 SIGKILL 强杀 ——
  const kill = () => {
    if (killedByUs) return;
    killedByUs = true;
    try {
      child.stdin.end(); // 先优雅收口 stdin（claude 处理完当前轮可自然收尾）
    } catch {
      /* stdin 已关 */
    }
    try {
      process.kill(-child.pid, 'SIGTERM'); // claude 是组长：组杀连带其子孙进程
    } catch {
      /* 组杀失败（如组长已退）则依赖下方直接杀 */
    }
    killTimer = setTimeout(() => {
      killTimer = null;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* 已死 */
      }
      try {
        child.kill('SIGKILL');
      } catch {
        /* 已死 */
      }
    }, KILL_GRACE_MS);
    killTimer.unref?.();
    // 被杀进程随后退出 → exit 事件 → finish(..., 'killed') → flush + onExit
  };

  return { sendUserMessage, kill, pid: child.pid };
}
