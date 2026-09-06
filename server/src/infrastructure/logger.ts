import { createWriteStream, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import pino from "pino";
import { prettyFactory } from "pino-pretty";

/**
 * 日志基础设施：
 * - 控制台：JSONL（pino 原生，容器/docker logs 的标准形态）
 * - 文件：pino-pretty 人类可读格式，按天轮转，默认保留 14 天
 * 刻意不用 pino transport（worker 线程）：Next standalone 打包下不可靠。
 */

const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
const LOG_DIR = process.env.LOG_DIR ?? "logs";
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS ?? 14);
const FILE_LOGGING = process.env.LOG_FILE !== "false";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 按天轮转的可写流：{base}-{YYYY-MM-DD}.log，过期自动清理。任何故障自动降级为丢弃（绝不影响业务） */
class DailyRotateFileStream extends Writable {
  private day = today();
  private stream: ReturnType<typeof createWriteStream> | null = null;
  private disabled = false;

  constructor(
    private readonly dir: string,
    private readonly base: string,
    private readonly retentionDays: number,
  ) {
    super();
    this.open();
  }

  private fileName(day: string): string {
    return join(this.dir, `${this.base}-${day}.log`);
  }

  private open(): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      this.stream = createWriteStream(this.fileName(this.day), { flags: "a" });
      // 写入失败（权限/磁盘满等）→ 静默降级，只提示一次
      this.stream.on("error", (error) => {
        if (!this.disabled) {
          this.disabled = true;
          console.warn("[logger] 文件日志已禁用（写入失败）:", error.message);
        }
        this.stream = null;
      });
    } catch (error) {
      this.disabled = true;
      this.stream = null;
      console.warn("[logger] 文件日志已禁用（无法打开）:", error instanceof Error ? error.message : error);
    }
  }

  private cleanup(): void {
    if (this.retentionDays <= 0) return;
    const cutoff = Date.now() - this.retentionDays * 86_400_000;
    try {
      for (const file of readdirSync(this.dir)) {
        const day = file.slice(-14, -4); // server-2026-09-02.log → 2026-09-02
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        if (Date.parse(`${day}T00:00:00Z`) < cutoff) {
          unlinkSync(join(this.dir, file));
        }
      }
    } catch {
      /* 清理失败不影响主流程 */
    }
  }

  _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (this.disabled) {
      callback();
      return;
    }
    const current = today();
    if (this.stream && current !== this.day) {
      // 跨天：关旧开新，顺带清理过期日志
      const previous = this.stream;
      this.day = current;
      this.open();
      previous.end();
      this.cleanup();
    }
    if (this.stream) {
      try {
        this.stream.write(chunk as Buffer, encoding, callback);
      } catch {
        // 流已销毁等异常：降级丢弃，保业务平安
        this.disabled = true;
        this.stream = null;
        callback();
      }
    } else {
      callback();
    }
  }
}

const globalForLogger = globalThis as unknown as { logger?: pino.Logger };

function createLogger(): pino.Logger {
  const destinations: pino.DestinationStream[] = [
    { write(line: string) { process.stdout.write(line); } }, // 控制台：JSONL
  ];

  if (FILE_LOGGING) {
    // 文件流：每行经 pino-pretty 同步格式化（人类可读）后写入按天轮转文件
    const prettyLine = prettyFactory({
      colorize: false,
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
      ignore: "pid,hostname",
    });
    const rotate = new DailyRotateFileStream(LOG_DIR, "server", LOG_RETENTION_DAYS);
    destinations.push({
      write(line: string) {
        const formatted = prettyLine(line);
        rotate.write(formatted.endsWith("\n") ? formatted : `${formatted}\n`);
      },
    });
  }

  return pino(
    {
      level: LOG_LEVEL,
      base: { service: "resume-server" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(destinations),
  );
}

export const logger: pino.Logger = globalForLogger.logger ?? createLogger();

if (process.env.NODE_ENV !== "production") {
  globalForLogger.logger = logger;
}
