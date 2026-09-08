// chat/src/security.mjs — A8 安全与成本护栏（每 IP 限流 / 输入校验 / origin 白名单）
//
// 契约（A1 的 ws-gateway / http-api 按此调用，签名不可改动）：
//   createGuards(config) → {
//     checkNewSession(ip)      → { ok, reason? }  滑动窗口：1h ≤ perHour、24h ≤ perDay
//     registerSessionEnd(ip)   会话结束回收一次配额（支持"提前结束返还额度"）
//     checkMessage(text)       → { ok, reason? }  非空 / ≤4000 字符 / 剔控制字符后仍有可见内容
//     sanitize(text)           截断 + 剥离 C0/C1 控制字符（保留 \n \t）+ 统一换行
//     originAllowed(origin, host) origin 为空放行；否则 origin 的 host 须等于请求 host 或在白名单
//     reset()                  清空内存计数（测试用）
//   }
//
// 设计约束：零依赖、纯同步、绝不抛异常——所有公开函数对坏输入一律返回失败结果。
// 另导出纯函数 maskIp / clientIp（http-api 与 ws-gateway 共用的脱敏/取源 IP 口径）。

/** 限流窗口与内存护栏常量（窗口时长固定，配额数量走 config） */
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MAX_TRACKED_IPS = 10_000 // 内存上限保护：Map 超过该规模时清最旧的 IP 记录
const EVICT_BATCH = 2_048 // 每次驱逐条数（摊销代价，删到略低于上限）
const SWEEP_INTERVAL_MS = 60_000 // 全表惰性清扫的最小间隔
const UNKNOWN_IP_KEY = '__unknown__' // ip 缺失（null / undefined / "unknown"）时合并计数的桶

/** 剥离 C0/C1 控制字符与 DEL：保留 \t 与 \n（\r 在此之前已统一为 \n） */
const CTRL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
/** 换行统一：\r\n 与孤立 \r → \n */
const CRLF_RE = /\r\n?/g

/** 默认配额（docs/ai-chat-plan.md §5/§6）；idleMs/maxTurns 由 ws-gateway 直接读 config，不经过这里 */
const DEFAULTS = {
  maxInputChars: 4_000, // 单条输入字符上限（按 Unicode code point 计）
  perHour: 3, // 每 IP 每小时新会话上限
  perDay: 20, // 每 IP 每天新会话上限
}

/** ip 打码（§5.5 全链路脱敏日志）：保留首尾各一段 */
export function maskIp(ip) {
  if (!ip) return 'unknown'
  const parts = ip.split('.')
  if (parts.length === 4) return `${parts[0]}.x.x.${parts[3]}`
  return ip.length > 8 ? `${ip.slice(0, 4)}…${ip.slice(-4)}` : ip
}

/** 客户端 IP：nginx 代理后取 x-forwarded-for 首段，否则取 socket 地址 */
export function clientIp(req) {
  const xff = req.headers?.['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim() !== '') return xff.split(',')[0].trim()
  return req.socket?.remoteAddress ?? ''
}

/** 从 config 里取第一个非空 key 的值（兼容大写 env 风格与驼峰风格） */
function pick(config, ...keys) {
  for (const key of keys) {
    const value = config?.[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

/** 宽容数值解析：接受 number 或数字字符串，非法/负数回退默认值（env 直传时不抛异常） */
function toNonNegativeNumber(value, fallback) {
  if (value === undefined || value === null) return fallback
  const n =
    typeof value === 'string'
      ? Number(value.trim())
      : typeof value === 'number'
        ? value
        : Number.NaN
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** ip 归一：缺失或 "unknown" 一律并入 UNKNOWN_IP_KEY 桶（合并计数），超长截断防滥用 */
function normalizeIp(ip) {
  if (typeof ip === 'string') {
    const s = ip.trim().toLowerCase()
    if (s && s !== 'unknown') return s.slice(0, 64)
  }
  return UNKNOWN_IP_KEY
}

/** 按 Unicode code point 计数（与 sanitize 的截断口径一致，emoji 不多计） */
function countChars(text) {
  let n = 0
  for (const _ of text) n += 1
  return n
}

/** 解析 "host" / "host:port" / "[::1]:port" → { hostname, port }；不合法返回 null */
function parseHostPort(raw) {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (s.startsWith('[')) {
    // IPv6 字面量：hostname 不含方括号
    const end = s.indexOf(']')
    if (end === -1) return null
    const hostname = s.slice(1, end)
    let port = ''
    if (s.length > end + 1) {
      if (s[end + 1] !== ':') return null
      port = s.slice(end + 2)
    }
    return { hostname, port }
  }
  const colon = s.lastIndexOf(':')
  if (colon === -1) return { hostname: s, port: '' }
  // 无方括号却出现多个冒号 = 裸 IPv6，视为不合法（正常请求不会出现）
  if (s.indexOf(':') !== colon) return null
  return { hostname: s.slice(0, colon), port: s.slice(colon + 1) }
}

/** 协议默认端口（用于 "无显式端口" 与 "显式 443/80" 的等价比较） */
function defaultPortOf(protocol) {
  if (protocol === 'https:') return '443'
  if (protocol === 'http:') return '80'
  return ''
}

/** 构建白名单：SITE_URL 的域名（支持逗号分隔多值）+ localhost / 127.0.0.1（任意端口） */
function buildOriginWhitelist(siteUrl) {
  const whitelist = new Set(['localhost', '127.0.0.1'])
  const entries = typeof siteUrl === 'string' ? siteUrl.split(',') : []
  for (const entry of entries) {
    const s = entry.trim()
    if (!s) continue
    try {
      // 容错：裸域名（无协议）按 https 补全后再解析
      const url = new URL(s.includes('://') ? s : `https://${s}`)
      if (url.hostname) whitelist.add(url.hostname.toLowerCase())
    } catch {
      // 非法条目直接忽略，不让配置问题拖垮服务
    }
  }
  return whitelist
}

/**
 * 创建护栏实例（纯同步、零依赖、内存计数）。
 * config 可选字段：SITE_URL、CHAT_RATE_PER_HOUR、CHAT_RATE_PER_DAY、
 * CHAT_MAX_INPUT_CHARS（均可传数字或数字字符串），
 * 以及 now()（可选时钟函数，默认 Date.now，测试注入用）。
 */
export function createGuards(config = {}) {
  // 实例私有的上限快照：多实例互不干扰
  const limits = {
    perHour: toNonNegativeNumber(pick(config, 'CHAT_RATE_PER_HOUR', 'chatRatePerHour'), DEFAULTS.perHour),
    perDay: toNonNegativeNumber(pick(config, 'CHAT_RATE_PER_DAY', 'chatRatePerDay'), DEFAULTS.perDay),
    maxInputChars: toNonNegativeNumber(
      pick(config, 'CHAT_MAX_INPUT_CHARS', 'chatMaxInputChars'),
      DEFAULTS.maxInputChars,
    ),
  }

  const whitelist = buildOriginWhitelist(pick(config, 'SITE_URL', 'siteUrl'))
  const nowFn = typeof config.now === 'function' ? config.now : Date.now

  /** Map<ip, number[]>：该 ip 每次"通过检查的新会话"的时间戳（滑动窗口计数） */
  const hitsByIp = new Map()
  let lastSweepAt = 0

  /** 安全取时：注入的时钟返回坏值时回退系统时钟 */
  function safeNow() {
    const t = nowFn()
    return Number.isFinite(t) ? t : Date.now()
  }

  /** 全表惰性清扫（节流 60s）：删除已滑出 24h 窗口、无有效记录的 ip，防 Map 无限增长 */
  function sweep(now) {
    if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
    lastSweepAt = now
    for (const [ip, stamps] of hitsByIp) {
      const alive = stamps.filter((t) => now - t < DAY_MS)
      if (alive.length === 0) hitsByIp.delete(ip)
      else if (alive.length !== stamps.length) hitsByIp.set(ip, alive)
    }
  }

  /** 内存上限保护：Map 超过 MAX_TRACKED_IPS 时按插入序清最旧的一批（近似 FIFO，非精确 LRU） */
  function evictOldestIfTooBig() {
    if (hitsByIp.size <= MAX_TRACKED_IPS) return
    let toDrop = hitsByIp.size - MAX_TRACKED_IPS + EVICT_BATCH
    for (const ip of hitsByIp.keys()) {
      if (toDrop <= 0) break
      hitsByIp.delete(ip)
      toDrop -= 1
    }
  }

  /** 新会话配额检查：1h 滑动窗口 ≤ perHour，24h 滑动窗口 ≤ perDay；通过才计数（拒绝不计数） */
  function checkNewSession(ip) {
    const key = normalizeIp(ip)
    const now = safeNow()
    sweep(now)
    const stamps = (hitsByIp.get(key) ?? []).filter((t) => now - t < DAY_MS)
    if (stamps.length >= limits.perDay) {
      return { ok: false, reason: 'rate_limit_day' }
    }
    // 时间戳升序，1h 窗内的是最新一段；数组最长 20，直接 filter 计数最直白
    const hourCount = stamps.filter((t) => now - t < HOUR_MS).length
    if (hourCount >= limits.perHour) {
      return { ok: false, reason: 'rate_limit_hour' }
    }
    stamps.push(now)
    hitsByIp.set(key, stamps)
    evictOldestIfTooBig()
    return { ok: true }
  }

  /** 会话结束：回收该 ip 最旧的一次计数（提前正常结束的会话把配额还给访客） */
  function registerSessionEnd(ip) {
    const key = normalizeIp(ip)
    const stamps = hitsByIp.get(key)
    if (!stamps || stamps.length === 0) return // 无可回收记录，静默忽略（幂等）
    stamps.shift()
    if (stamps.length === 0) hitsByIp.delete(key)
  }

  /** 消息校验：非空、长度 ≤ maxInputChars、剔除控制字符后仍有可见内容 */
  function checkMessage(text) {
    if (typeof text !== 'string' || text.length === 0) {
      return { ok: false, reason: 'empty' }
    }
    if (countChars(text) > limits.maxInputChars) {
      return { ok: false, reason: 'too_long' }
    }
    const visible = text.replace(CRLF_RE, '\n').replace(CTRL_CHARS_RE, '').trim()
    if (visible.length === 0) {
      return { ok: false, reason: 'empty' } // 整条都是控制字符 / 空白
    }
    return { ok: true }
  }

  /** 清洗：截断到 maxInputChars（按 code point，防切断代理对）→ 统一换行 → 剥离控制字符 */
  function sanitize(text) {
    if (typeof text !== 'string' || text.length === 0) return ''
    const chars = Array.from(text)
    let out = ''
    for (let i = 0; i < chars.length && i < limits.maxInputChars; i += 1) out += chars[i]
    return out.replace(CRLF_RE, '\n').replace(CTRL_CHARS_RE, '')
  }

  /**
   * origin 校验：
   * - origin 为空（同源 GET / 非浏览器客户端如 curl）→ 放行；
   * - 否则解析 origin，其 host（含端口等价比较）等于请求 Host 头 → 放行；
   * - 或 origin 的 hostname 在白名单（SITE_URL 域名 + localhost / 127.0.0.1，端口不限）→ 放行；
   * - 解析失败（含隐私模式发来的 "null"）一律拒绝。
   */
  function originAllowed(origin, host) {
    if (origin === null || origin === undefined || origin === '') return true
    if (typeof origin !== 'string') return false
    let url
    try {
      url = new URL(origin)
    } catch {
      return false
    }
    const originHost = parseHostPort(url.host) // URL.host = hostname[:port]，已小写
    if (!originHost || !originHost.hostname) return false
    if (typeof host === 'string' && host.trim()) {
      const reqHost = parseHostPort(host)
      if (reqHost && reqHost.hostname === originHost.hostname) {
        // 端口等价比较：未显式标注的端口按 origin 协议默认端口补全
        const originPort = originHost.port || defaultPortOf(url.protocol)
        const reqPort = reqHost.port || defaultPortOf(url.protocol)
        if (originPort === reqPort) return true
      }
    }
    return whitelist.has(originHost.hostname)
  }

  /** 清空全部内存计数（测试用） */
  function reset() {
    hitsByIp.clear()
    lastSweepAt = 0
  }

  return {
    checkNewSession,
    registerSessionEnd,
    checkMessage,
    sanitize,
    originAllowed,
    reset,
  }
}
