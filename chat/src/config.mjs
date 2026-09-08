/**
 * resume-chat 配置装载（A1 地盘）
 *
 * 全部配置来自环境变量，字段与默认值见 docs/ai-chat-plan.md §6，外加：
 *   CHAT_CLAUDE_CMD   claude 启动命令（A9 测试用 ./test/mock-claude.mjs 覆盖）
 *   CHAT_RATE_*       每 IP 新会话限流（A8 消费）
 *
 * 必填：CHAT_ADMIN_TOKEN、DATABASE_URL —— 缺失直接抛错，服务拒绝启动（fail fast）。
 */

/** 解析正整数 env，非法或缺失回退默认值 */
function toInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** 解析非空字符串 env，缺失回退默认值（空串视为缺失） */
function toStr(value, fallback) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

/**
 * 读取并校验配置。
 * @param {NodeJS.ProcessEnv} env 环境变量（默认 process.env，便于测试注入）
 * @returns {object} 冻结后的配置对象
 * @throws {Error} 必填项缺失时
 */
export function loadConfig(env = process.env) {
  const config = {
    // 服务
    PORT: toInt(env.CHAT_PORT, 3210),
    HOST: toStr(env.CHAT_HOST, "0.0.0.0"),

    // 数据层（A3 db.mjs 消费）
    DATABASE_URL: toStr(env.DATABASE_URL, ""),

    // 简历上下文（A6 resume-context.mjs 消费）
    RESUME_API_BASE: toStr(env.RESUME_API_BASE, "http://server:3001/api/v1"),

    // claude 桥（A2 pty-bridge.mjs 消费）
    CLAUDE_CMD: toStr(env.CHAT_CLAUDE_CMD, "claude"),
    MODEL: toStr(env.CHAT_MODEL, "sonnet"),
    MAX_TURNS: toInt(env.CHAT_MAX_TURNS, 40),

    // 会话生命周期（ws-gateway 消费）
    IDLE_MS: toInt(env.CHAT_IDLE_MS, 20 * 60 * 1000), // 空闲 20min 结束
    ASK_TIMEOUT_MS: toInt(env.CHAT_ASK_TIMEOUT_MS, 120 * 1000), // ask_user 120s 未答

    // 安全护栏（A8 security.mjs 消费；ws-gateway/http-api 也做防御性截断）
    RATE_PER_HOUR: toInt(env.CHAT_RATE_PER_HOUR, 3),
    RATE_PER_DAY: toInt(env.CHAT_RATE_PER_DAY, 20),
    MAX_INPUT_CHARS: toInt(env.CHAT_MAX_INPUT_CHARS, 4000), // 单条输入 ≤4000 字符
    MAX_OUTPUT_CHARS: toInt(env.CHAT_MAX_OUTPUT_CHARS, 8000), // 单轮 assistant 输出 ≤8k 字符截断
    SITE_URL: toStr(env.SITE_URL, ""), // origin 白名单基准（A8）

    // 管理后台鉴权（http-api 消费）
    ADMIN_TOKEN: toStr(env.CHAT_ADMIN_TOKEN, ""),

    // claude CLI 鉴权透传（spawn 默认继承 process.env，此处仅集中留档便于排查）
    ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL ?? "",
    ANTHROPIC_AUTH_TOKEN: env.ANTHROPIC_AUTH_TOKEN ?? "",
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ?? "",
  };

  const missing = [];
  if (!config.ADMIN_TOKEN) missing.push("CHAT_ADMIN_TOKEN");
  if (!config.DATABASE_URL) missing.push("DATABASE_URL");
  if (missing.length > 0) {
    throw new Error(`[chat] 缺少必填环境变量：${missing.join("、")}（见 docs/ai-chat-plan.md §6）`);
  }

  return Object.freeze(config);
}
