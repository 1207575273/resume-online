// chat/src/resume-context.mjs
// A6：从简历服务（server API）拉取线上简历，压缩为紧凑中文 Markdown，供首条 user message 注入。
// 内存缓存 5 分钟（模块级 Map + 时间戳）；任何失败直接抛错，由调用方决定兜底策略。

/** 缓存有效期：5 分钟 */
const CACHE_TTL_MS = 5 * 60 * 1000;
/** 单次拉取超时：10 秒 */
const FETCH_TIMEOUT_MS = 10 * 1000;
/** 简历 slug：站点当前唯一一份简历 */
const RESUME_SLUG = "codeyang";
/** 技能三档固定展示顺序（由高到低） */
const TIER_ORDER = ["精通", "熟练", "掌握"];

/** 模块级缓存：apiBase -> { text: string, at: number(毫秒时间戳) } */
const cache = new Map();

/**
 * 获取简历上下文（紧凑中文 Markdown：基本信息/定位 tags/经历/项目/技能组+三档/教育，数字保留）。
 * @param {typeof fetch} [fetchImpl] 可注入的 fetch 实现（测试/内网代理用），默认全局 fetch
 * @param {string} [apiBase] 简历 API 根地址，默认取 env RESUME_API_BASE，再退回 localhost:3001
 * @returns {Promise<string>} 简历 Markdown 文本
 * @throws 网络失败 / 非 2xx / 非 JSON / 数据结构异常时抛 Error
 */
export async function getResumeContext(
  fetchImpl = fetch,
  apiBase = process.env.RESUME_API_BASE ?? "http://localhost:3001/api/v1",
) {
  // 命中且未过期，直接返回缓存
  const hit = cache.get(apiBase);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.text;

  const url = `${apiBase.replace(/\/+$/, "")}/resume/${RESUME_SLUG}`;

  let res;
  try {
    res = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`简历 API 请求失败（${url}）：${err?.message ?? err}`);
  }
  if (!res.ok) {
    throw new Error(`简历 API 响应异常（${url}）：HTTP ${res.status}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`简历 API 返回非 JSON（${url}）：${err?.message ?? err}`);
  }

  // 兼容 { content } 与 { resume: { content } } 两种包裹
  const content = data?.content ?? data?.resume?.content;
  if (!content?.profile) {
    throw new Error(`简历 API 数据结构异常（${url}）：缺少 content.profile`);
  }

  const text = renderResume(content);
  cache.set(apiBase, { text, at: Date.now() });
  return text;
}

/**
 * 把简历 JSON 渲染为紧凑中文 Markdown（hl/数字均取简历原文，不做加工）。
 * @param {object} c 简历 content 对象（profile/skillGroups/experiences/projects/education）
 * @returns {string}
 */
function renderResume(c) {
  const out = [];
  const p = c.profile ?? {};

  // —— 基本信息 ——
  out.push(`# ${p.name ? `${p.name} · 在线简历` : "在线简历"}`);
  if (p.headline) out.push(p.headline);

  // 联系方式：邮箱 + tel: 链接（电话）+ GitHub 链接；这些本就公开
  const contacts = [];
  if (p.email) contacts.push(p.email);
  for (const link of p.links ?? []) {
    if (!link?.url) continue;
    if (link.url.startsWith("tel:")) contacts.push(`电话 ${link.url.slice(4).trim()}`);
    else if (/github\.com/i.test(link.url)) contacts.push(`GitHub ${link.url}`);
  }
  if (contacts.length) out.push(`联系方式：${contacts.join(" ｜ ")}`);
  if (p.location) out.push(p.location);

  // —— 定位 tags ——
  if ((p.tags ?? []).length) out.push(`定位标签：${p.tags.join(" · ")}`);

  if (p.summary) out.push("", "## 概述", p.summary);

  // —— 工作经历（API 顺序即"最新在前"，保持不变）——
  const experiences = c.experiences ?? [];
  if (experiences.length) {
    out.push("", "## 工作经历");
    for (const e of experiences) {
      const head = [e.company, e.role].filter(Boolean).join(" ｜ ");
      const line = [head, fmtPeriod(e.start, e.end)].filter(Boolean).join(" ｜ ");
      if (line) out.push("", `### ${line}`);
      if (e.summary) out.push(e.summary);
      for (const h of e.highlights ?? []) out.push(`- ${h}`);
      if ((e.tech ?? []).length) out.push(`技术栈：${e.tech.join("、")}`);
    }
  }

  // —— 项目 ——
  const projects = c.projects ?? [];
  if (projects.length) {
    out.push("", "## 项目");
    for (const pr of projects) {
      const name = pr.name ?? "未命名项目";
      out.push("", `### ${pr.link ? `${name}（${pr.link}）` : name}`);
      if (pr.description) out.push(pr.description);
      for (const h of pr.highlights ?? []) out.push(`- ${h}`);
      if ((pr.tech ?? []).length) out.push(`技术栈：${pr.tech.join("、")}`);
    }
  }

  // —— 技能组 + 三档（组内按档位聚合，紧凑输出；组 note 含投入数字，保留）——
  const groups = c.skillGroups ?? [];
  if (groups.length) {
    out.push("", "## 技能");
    for (const g of groups) {
      const byTier = new Map();
      for (const s of g.skills ?? []) {
        const tier = skillTier(s.level);
        if (!byTier.has(tier)) byTier.set(tier, []);
        byTier.get(tier).push(s.name);
      }
      const parts = TIER_ORDER.filter((t) => byTier.has(t))
        .map((t) => `${t}：${byTier.get(t).join("、")}`);
      const label = g.note ? `${g.name}（${g.note}）` : g.name;
      if (parts.length) out.push(`- ${label}——${parts.join("；")}`);
    }
  }

  // —— 教育 ——
  const education = c.education ?? [];
  if (education.length) {
    out.push("", "## 教育");
    for (const e of education) {
      const seg = [e.school, e.major, e.degree].filter(Boolean).join(" · ");
      const period = fmtPeriod(e.start, e.end);
      if (seg) out.push(`- ${seg}${period ? `（${period}）` : ""}`);
    }
  }

  // 压掉连续空行，收尾
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 技能数值 → 三档：>=90 精通，>=80 熟练，其余（含缺省）掌握 */
function skillTier(level) {
  if (typeof level !== "number" || !Number.isFinite(level)) return "掌握";
  if (level >= 90) return "精通";
  if (level >= 80) return "熟练";
  return "掌握";
}

/** 时间段：日期原样保留简历写法（2026-05 / 2025.07 / 2019），缺 end 视为"至今" */
function fmtPeriod(start, end) {
  if (!start && !end) return "";
  return `${start ?? ""}–${end ?? "至今"}`;
}
