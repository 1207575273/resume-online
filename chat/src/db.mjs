// chat 服务数据层（docs/ai-chat-plan.md §4）
// 复用现有 PostgreSQL（compose 的 db 服务），chat 用独立 pg 连接池（不进 Prisma）。
// 所有对外方法：全部参数化查询（$n 占位）防注入；行字段 snake_case → 驼峰后返回。

import { readFile } from 'node:fs/promises';
import pg from 'pg';

// ---------- 行映射（数据库 snake_case → 应用侧驼峰） ----------

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    status: row.status,
    ip: row.ip,
    userAgent: row.user_agent,
    referrer: row.referrer,
    turnCount: row.turn_count,
    endReason: row.end_reason,
  };
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    role: row.role,
    content: row.content,
    raw: row.raw,
  };
}

function mapLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    jdTitle: row.jd_title,
    matchLevel: row.match_level,
    summary: row.summary,
    concerns: row.concerns,
    jdDigest: row.jd_digest,
    // listLeads 联表带出的会话侧信息（其余调用方没有这两列，值为 undefined）
    ip: row.ip,
    userAgent: row.user_agent,
  };
}

// ---------- 工具 ----------

/** ILIKE 模式串：转义 % _ \，避免用户输入的通配符被意外展开 */
function likePattern(q) {
  return `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** 限制 limit/offset 为安全整数 */
function safePage({ limit = 50, offset = 0 } = {}, defaultLimit = 50, maxLimit = 500) {
  const lim = Number.isInteger(limit) && limit > 0 ? Math.min(limit, maxLimit) : defaultLimit;
  const off = Number.isInteger(offset) && offset > 0 ? offset : 0;
  return { limit: lim, offset: off };
}

// ---------- 工厂 ----------

/**
 * 创建数据层实例。
 * @param {{DATABASE_URL: string}} config 取 config.DATABASE_URL 作为唯一连接配置
 * @returns 数据层对象：init / createSession / appendMessage / bumpTurn / endSession /
 *          insertLead / listSessions / getSessionWithMessages / listLeads / stats /
 *          exportJsonl / close
 */
export function createDb(config) {
  const databaseUrl = config && config.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('createDb: 缺少 config.DATABASE_URL');
  }

  // 单一连接池，全实例共享
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  /**
   * init 的 promise 缓存：同一 db 实例内 schema 只执行一次（幂等且免重复 IO）。
   * 失败时清空，允许下一次调用重试。
   */
  let initPromise = null;

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
      await pool.query(sql); // CREATE TABLE/INDEX IF NOT EXISTS，天然幂等
    })().catch((err) => {
      initPromise = null; // 失败允许重试
      throw err;
    });
    return initPromise;
  }

  // ---------- 会话 ----------

  /** 创建会话（id 由调用方生成 uuid），返回会话对象 */
  async function createSession({ id, ip = null, userAgent = null, referrer = null } = {}) {
    const { rows } = await pool.query(
      `INSERT INTO chat_sessions (id, ip, user_agent, referrer)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, ip, userAgent, referrer],
    );
    return mapSession(rows[0]);
  }

  /** 追加一条消息；raw 为原始帧对象（存 jsonb），返回消息对象 */
  async function appendMessage({ sessionId, role, content = null, raw = null } = {}) {
    const { rows } = await pool.query(
      `INSERT INTO chat_messages (session_id, role, content, raw)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING *`,
      [sessionId, role, content, raw == null ? null : JSON.stringify(raw)],
    );
    return mapMessage(rows[0]);
  }

  /** 会话轮次 +1，返回更新后的 turn_count */
  async function bumpTurn(sessionId) {
    const { rows } = await pool.query(
      `UPDATE chat_sessions SET turn_count = turn_count + 1
       WHERE id = $1
       RETURNING turn_count`,
      [sessionId],
    );
    return rows.length > 0 ? rows[0].turn_count : null;
  }

  /**
   * 结束会话（仅对 active 会话生效，防止 idle/max_turns 两个 reason 相互覆盖）。
   * @returns {boolean} 是否真正发生了状态变更
   */
  async function endSession(sessionId, reason = null) {
    const { rowCount } = await pool.query(
      `UPDATE chat_sessions
       SET status = 'ended', ended_at = now(), end_reason = $2
       WHERE id = $1 AND status = 'active'`,
      [sessionId, reason],
    );
    return rowCount === 1;
  }

  // ---------- 线索 ----------

  /** 写入 LEAD 线索（concerns 为字符串数组，存 jsonb），返回线索对象 */
  async function insertLead({
    sessionId, jdTitle = null, matchLevel, summary = null, concerns = [], jdDigest = null,
  } = {}) {
    const concernList = Array.isArray(concerns)
      ? concerns.filter((item) => typeof item === 'string')
      : [];
    const { rows } = await pool.query(
      `INSERT INTO chat_leads (session_id, jd_title, match_level, summary, concerns, jd_digest)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [sessionId, jdTitle, matchLevel, summary, JSON.stringify(concernList), jdDigest],
    );
    return mapLead(rows[0]);
  }

  // ---------- 查询 ----------

  /**
   * 会话列表（倒序分页）。
   * @param {object} opts
   *  - q：模糊匹配 ip / user_agent / referrer / 该会话任意 lead 摘要（ILIKE，参数化）
   *  - hasLead=true：只返回产生过线索的会话
   * 每行附 leadCount / latestMatchLevel / latestLeadSummary。
   */
  async function listSessions(opts = {}) {
    const { limit, offset } = safePage(opts);
    const q = typeof opts.q === 'string' ? opts.q.trim() : '';
    const hasLead = opts.hasLead === true;
    const params = [q === '' ? '' : likePattern(q), hasLead, limit, offset];
    const where = `
       WHERE ($1 = '' OR s.ip ILIKE $1 OR s.user_agent ILIKE $1 OR s.referrer ILIKE $1
              OR EXISTS (SELECT 1 FROM chat_leads lq
                         WHERE lq.session_id = s.id AND lq.summary ILIKE $1))
         AND ($2 = false OR EXISTS (SELECT 1 FROM chat_leads lf WHERE lf.session_id = s.id))`;
    const [listRes, totalRes] = await Promise.all([
      pool.query(
        `SELECT s.*,
           (SELECT count(*) FROM chat_leads l WHERE l.session_id = s.id) AS lead_count,
           (SELECT l.match_level FROM chat_leads l
             WHERE l.session_id = s.id ORDER BY l.created_at DESC LIMIT 1) AS latest_match_level,
           (SELECT l.summary FROM chat_leads l
             WHERE l.session_id = s.id ORDER BY l.created_at DESC LIMIT 1) AS latest_lead_summary
         FROM chat_sessions s
         ${where}
         ORDER BY s.created_at DESC
         LIMIT $3 OFFSET $4`,
        params,
      ),
      pool.query(
        `SELECT count(*) AS total FROM chat_sessions s ${where}`,
        [params[0], params[1]],
      ),
    ]);
    return {
      total: Number(totalRes.rows[0].total) || 0,
      items: listRes.rows.map((row) => ({
        ...mapSession(row),
        leadCount: Number(row.lead_count) || 0,
        latestMatchLevel: row.latest_match_level,
        latestLeadSummary: row.latest_lead_summary,
      })),
    };
  }

  /** 会话详情 + 全部消息（按时间升序）；会话不存在返回 null */
  async function getSessionWithMessages(id) {
    const sessionRes = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = $1',
      [id],
    );
    if (sessionRes.rows.length === 0) return null;
    const [messageRes, leadRes] = await Promise.all([
      pool.query(
        'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC, id ASC',
        [id],
      ),
      pool.query(
        'SELECT * FROM chat_leads WHERE session_id = $1 ORDER BY created_at ASC, id ASC',
        [id],
      ),
    ]);
    return {
      session: mapSession(sessionRes.rows[0]),
      messages: messageRes.rows.map(mapMessage),
      leads: leadRes.rows.map(mapLead),
    };
  }

  /** 线索列表（倒序），联表带出会话 ip / user_agent 便于后台分析 */
  async function listLeads(opts = {}) {
    const { limit } = safePage(opts, 100, 1000);
    const { rows } = await pool.query(
      `SELECT l.*, s.ip, s.user_agent
       FROM chat_leads l
       LEFT JOIN chat_sessions s ON s.id = l.session_id
       ORDER BY l.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(mapLead);
  }

  /**
   * 运营统计：总会话数 / 活跃数 / 有 lead 会话数 / lead 总数 /
   * match 分布（缺失等级补 0）/ 近 7 日每日会话数（升序，含今天，无数据补 0）。
   */
  async function stats() {
    const [sessionRes, leadAggRes, matchRes, dailyRes] = await Promise.all([
      pool.query(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status = 'active') AS active
         FROM chat_sessions`,
      ),
      pool.query(
        `SELECT count(*) AS lead_total,
                count(DISTINCT session_id) AS sessions_with_leads
         FROM chat_leads`,
      ),
      pool.query('SELECT match_level, count(*) AS n FROM chat_leads GROUP BY match_level'),
      pool.query(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(s.id) AS n
         FROM generate_series(
                date_trunc('day', now()) - interval '6 days',
                date_trunc('day', now()),
                interval '1 day') AS d(day)
         LEFT JOIN chat_sessions s
           ON date_trunc('day', s.created_at) = d.day
         GROUP BY d.day
         ORDER BY d.day`,
      ),
    ]);

    const matchDistribution = { high: 0, mid: 0, low: 0 };
    for (const row of matchRes.rows) {
      if (row.match_level in matchDistribution) {
        matchDistribution[row.match_level] = Number(row.n);
      }
    }

    return {
      totalSessions: Number(sessionRes.rows[0].total),
      activeSessions: Number(sessionRes.rows[0].active),
      sessionsWithLeads: Number(leadAggRes.rows[0].sessions_with_leads),
      totalLeads: Number(leadAggRes.rows[0].lead_total),
      matchDistribution,
      daily: dailyRes.rows.map((row) => ({ date: row.date, count: Number(row.n) })),
    };
  }

  /**
   * 全量导出为 JSONL 字符串：每行一个会话（含全部消息与线索），按创建时间升序。
   * 供 admin `/chat/api/admin/export` 直接下载。
   */
  async function exportJsonl() {
    const [sessionRes, messageRes, leadRes] = await Promise.all([
      pool.query('SELECT * FROM chat_sessions ORDER BY created_at ASC, id ASC'),
      pool.query('SELECT * FROM chat_messages ORDER BY created_at ASC, id ASC'),
      pool.query('SELECT * FROM chat_leads ORDER BY created_at ASC, id ASC'),
    ]);

    const messagesBySession = new Map();
    for (const row of messageRes.rows) {
      const list = messagesBySession.get(row.session_id) ?? [];
      list.push({
        role: row.role,
        content: row.content,
        raw: row.raw,
        createdAt: row.created_at,
      });
      messagesBySession.set(row.session_id, list);
    }
    const leadsBySession = new Map();
    for (const row of leadRes.rows) {
      const list = leadsBySession.get(row.session_id) ?? [];
      list.push({
        jdTitle: row.jd_title,
        matchLevel: row.match_level,
        summary: row.summary,
        concerns: row.concerns,
        jdDigest: row.jd_digest,
        createdAt: row.created_at,
      });
      leadsBySession.set(row.session_id, list);
    }

    return sessionRes.rows
      .map((row) => JSON.stringify({
        sessionId: row.id,
        createdAt: row.created_at,
        endedAt: row.ended_at,
        status: row.status,
        ip: row.ip,
        userAgent: row.user_agent,
        referrer: row.referrer,
        turnCount: row.turn_count,
        endReason: row.end_reason,
        messages: messagesBySession.get(row.id) ?? [],
        leads: leadsBySession.get(row.id) ?? [],
      }))
      .join('\n');
  }

  /** 关闭连接池（优雅停机 / 测试收尾用） */
  async function close() {
    await pool.end();
  }

  return {
    init,
    createSession,
    appendMessage,
    bumpTurn,
    endSession,
    insertLead,
    listSessions,
    getSessionWithMessages,
    listLeads,
    stats,
    exportJsonl,
    close,
  };
}
