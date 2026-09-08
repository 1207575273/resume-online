/**
 * resume-chat REST 层（A1 地盘）
 *
 * 路由（docs/ai-chat-plan.md §3.5）：
 *   POST /chat/api/sessions                     创建会话（限流校验 + 落库）→ {sessionId}
 *   GET  /chat/api/health                       存活探针（compose healthcheck 用）
 *   GET  /chat/api/admin/sessions?limit&offset&q&hasLead   管理端会话列表
 *   GET  /chat/api/admin/sessions/:id           管理端会话详情（含全部消息）
 *   GET  /chat/api/admin/leads?limit            管理端线索列表
 *   GET  /chat/api/admin/stats                  管理端统计
 *   GET  /chat/api/admin/export                 JSONL 导出下载
 *
 * admin 鉴权：请求头 x-admin-token 恒时比较 config.ADMIN_TOKEN；
 *   校验失败返回 401（admin 已公网开放，前端据此重弹密码框）。
 *
 * 依赖契约（已与 A3/A8 产出对表）：
 *   db（createDb(config) 实例）：
 *     createSession({ id, ip, userAgent, referrer })
 *     listSessions({ limit, offset, q, hasLead }) → 行数组（附 leadCount 等聚合字段）
 *     getSessionWithMessages(id) → { session, messages } | null
 *     listLeads({ limit }) → 行数组
 *     stats() → 统计对象（总数/匹配分布/近 7 日曲线）
 *     exportJsonl() → 全量 JSONL 字符串（每行一个会话，含消息与线索）
 *   guards（createGuards(config) 实例，均可选）：
 *     checkNewSession(ip) → { ok, reason: 'rate_limit_hour'|'rate_limit_day'|... }
 *     originAllowed(origin, host) → boolean
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import { clientIp, maskIp } from "./security.mjs";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.writableEnded) return;
  res.writeHead(status, { ...JSON_HEADERS, ...extraHeaders });
  res.end(JSON.stringify(payload));
}

/** 读取 JSON body（带大小上限；空 body / 坏 JSON 由调用方决定是否容忍） */
function readJsonBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (raw === "") return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** A8 的英文 reason 码 → 面向访客的中文提示（未命中原样透传） */
const GUARD_REASONS = {
  rate_limit_hour: "开启会话太频繁，请稍后再试",
  rate_limit_day: "今日会话次数已用完，明天再来吧",
};

/** 调用 A8 新会话限流检查（契约：checkNewSession(ip) 位置参数）：未实现时放行，抛错视为拒绝 */
async function guardNewSession(guards, ip) {
  const fn = guards?.checkNewSession;
  if (typeof fn !== "function") return { ok: true };
  try {
    const verdict = await fn(ip);
    return verdict ?? { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "请求被拒绝" };
  }
}

/** A8 origin 校验（契约：originAllowed(origin, host)）：未实现时放行 */
function originOk(guards, req) {
  const fn = guards?.originAllowed;
  if (typeof fn !== "function") return true;
  try {
    return Boolean(fn(req.headers.origin, req.headers.host));
  } catch {
    return false;
  }
}

/**
 * 创建 REST 处理器（依赖注入风格，A9 测试可换 stub）。
 * @returns {{ handle: (req: import('node:http').IncomingMessage, res: import('node/http').ServerResponse) => Promise<boolean> }}
 *   handle 处理了请求返回 true；不匹配任何路由返回 false（由 server.mjs 落到 404/静态）。
 */
export function createHttpApi({ config, db, guards }) {
  /** x-admin-token 恒时比较（长度不同先短路，等长走 timingSafeEqual） */
  function adminTokenOk(req) {
    const given = String(req.headers["x-admin-token"] ?? "");
    const expected = config.ADMIN_TOKEN;
    if (!given || !expected) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** POST /chat/api/sessions：创建 uuid 会话，origin + 限流校验通过后落库 */
  async function createSession(req, res) {
    if (!originOk(guards, req)) {
      sendJson(res, 403, { error: "来源不被允许" });
      return;
    }
    // body 可选（referrer/utm），坏 JSON 不阻塞创建，按空处理
    const body = await readJsonBody(req).catch(() => ({}));
    const ip = clientIp(req);
    const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 512);
    const referrer = [
      typeof body.referrer === "string" ? body.referrer.slice(0, 512) : "",
      typeof body.utm === "string" ? body.utm.slice(0, 256) : "",
    ]
      .filter(Boolean)
      .join(" | ") || String(req.headers.referer ?? "").slice(0, 512) || null;

    const verdict = await guardNewSession(guards, ip);
    if (!verdict.ok) {
      const reason = verdict.reason ?? "";
      const friendly = GUARD_REASONS[reason] ?? reason ?? "请求过于频繁，请稍后再试";
      // 小时窗给出建议等待时间，天窗给 1 小时（不必精确，仅提示语义）
      const retryAfter = reason === "rate_limit_hour" ? 600 : reason === "rate_limit_day" ? 3600 : null;
      const headers = retryAfter ? { "retry-after": String(retryAfter) } : {};
      sendJson(res, 429, { error: friendly, reason }, headers);
      console.log(`[chat] 新会话被限流 ip=${maskIp(ip)} reason=${reason}`);
      return;
    }

    const id = randomUUID();
    await db.createSession({ id, ip, userAgent, referrer });
    console.log(`[chat] 会话创建 id=${id} ip=${maskIp(ip)}`);
    sendJson(res, 201, { sessionId: id });
  }

  /** GET /chat/api/health：存活探针（compose healthcheck 用；db 探活由 healthcheck 周期覆盖） */
  async function health(req, res) {
    sendJson(res, 200, { status: "ok" });
  }

  /** GET /chat/api/admin/sessions?limit=50&offset=0&q=&hasLead=（鉴权已在 handle 统一拦截） */
  async function adminSessions(query, res) {
    const limit = clampInt(query.get("limit"), 1, 500, 50);
    const offset = clampInt(query.get("offset"), 0, 1_000_000, 0);
    const q = (query.get("q") ?? "").trim() || null;
    const hasLeadRaw = (query.get("hasLead") ?? query.get("has_lead") ?? "").toLowerCase();
    const hasLead = hasLeadRaw === "" ? null : hasLeadRaw === "true" || hasLeadRaw === "1";
    const { total, items } = await db.listSessions({ limit, offset, q, hasLead });
    // db 侧驼峰 → 管理界面（A5）消费的下划线形态
    sendJson(res, 200, {
      total,
      items: (items ?? []).map((row) => ({
        id: row.id,
        created_at: row.createdAt,
        ended_at: row.endedAt,
        status: row.status,
        ip: row.ip,
        ua: row.userAgent,
        referrer: row.referrer,
        turn_count: row.turnCount,
        end_reason: row.endReason,
        has_lead: (row.leadCount ?? 0) > 0,
        lead_count: row.leadCount ?? 0,
        latest_match_level: row.latestMatchLevel,
        lead_summary: row.latestLeadSummary,
      })),
      limit,
      offset,
    });
  }

  /** GET /chat/api/admin/sessions/:id（含全部消息与线索；A3 契约 getSessionWithMessages） */
  async function adminSessionDetail(id, res) {
    const data = await db.getSessionWithMessages(id);
    if (!data) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    const s = data.session;
    sendJson(res, 200, {
      session: {
        id: s.id,
        created_at: s.createdAt,
        ended_at: s.endedAt,
        status: s.status,
        ip: s.ip,
        user_agent: s.userAgent,
        referrer: s.referrer,
        turn_count: s.turnCount,
        end_reason: s.endReason,
      },
      messages: (data.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.createdAt,
      })),
      leads: (data.leads ?? []).map(toSnakeLead),
    });
  }

  /** db 驼峰 lead → 管理界面下划线形态 */
  function toSnakeLead(l) {
    return {
      id: l.id,
      session_id: l.sessionId,
      created_at: l.createdAt,
      jd_title: l.jdTitle,
      match_level: l.matchLevel,
      summary: l.summary,
      concerns: l.concerns,
      jd_digest: l.jdDigest,
      ip: l.ip,
    };
  }

  /** GET /chat/api/admin/leads?limit=100 */
  async function adminLeads(query, res) {
    const limit = clampInt(query.get("limit"), 1, 1000, 100);
    const rows = await db.listLeads({ limit });
    sendJson(res, 200, { items: (rows ?? []).map(toSnakeLead), limit });
  }

  /** GET /chat/api/admin/stats：A3 聚合（会话数/提 JD 数/匹配分布/近 7 日曲线），键名对齐管理界面 */
  async function adminStats(res) {
    const stats = await db.stats();
    sendJson(res, 200, {
      total: stats?.totalSessions ?? 0,
      active: stats?.activeSessions ?? 0,
      with_lead: stats?.sessionsWithLeads ?? 0,
      lead_total: stats?.totalLeads ?? 0,
      match: stats?.matchDistribution ?? { high: 0, mid: 0, low: 0 },
      daily: (stats?.daily ?? []).map((d) => ({ day: d.date, count: d.count })),
    });
  }

  /** GET /chat/api/admin/export：JSONL 下载（A3 契约 exportJsonl：每行一个会话，含消息与线索） */
  async function adminExport(res) {
    const body = await db.exportJsonl();
    const date = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="chat-export-${date}.jsonl"`,
      "cache-control": "no-store",
    });
    res.end(typeof body === "string" && body !== "" ? body + "\n" : "");
    console.log(`[chat] admin export 完成（${typeof body === "string" ? body.split("\n").length : 0} 行）`);
  }

  /** 主分发：匹配则处理并返回 true */
  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const { pathname } = url;
    const method = req.method ?? "GET";

    // ---- 公开路由 ----
    if (method === "POST" && pathname === "/chat/api/sessions") {
      await createSession(req, res);
      return true;
    }
    if (method === "GET" && pathname === "/chat/api/health") {
      await health(req, res);
      return true;
    }

    // ---- admin 路由（统一鉴权，失败 401：admin 已公网开放，用 401 让前端重弹密码框）----
    if (pathname === "/chat/api/admin" || pathname.startsWith("/chat/api/admin/")) {
      if (!adminTokenOk(req)) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const detail = pathname.match(/^\/chat\/api\/admin\/sessions\/([^/]+)$/);
      if (method === "GET" && detail) {
        const id = decodeURIComponent(detail[1]);
        if (!UUID_RE.test(id)) {
          sendJson(res, 404, { error: "not found" });
          return true;
        }
        await adminSessionDetail(id, res);
        return true;
      }
      if (method === "GET" && pathname === "/chat/api/admin/sessions") {
        await adminSessions(url.searchParams, res);
        return true;
      }
      if (method === "GET" && pathname === "/chat/api/admin/leads") {
        await adminLeads(url.searchParams, res);
        return true;
      }
      if (method === "GET" && pathname === "/chat/api/admin/stats") {
        await adminStats(res);
        return true;
      }
      if (method === "GET" && pathname === "/chat/api/admin/export") {
        await adminExport(res);
        return true;
      }
      sendJson(res, 404, { error: "not found" });
      return true;
    }

    return false;
  }

  return { handle };
}

/** query 整数参数：非法回退默认，并夹在 [min, max] */
function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
