import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchPublishedResume, formatPeriod } from "@/lib/api";

/**
 * PDF 打印版简历:读 web/public/resume-template.html 实体模板(可直接浏览器打开预览版式),
 * 拉简历 API 实时填充 {{占位符}}。改样式 = 改模板文件,不碰本路由;
 * 下载链路 = 访客浏览器打印(?print=1 自动唤起),服务端零渲染依赖。
 */
export const dynamic = "force-dynamic";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 打印版 bullet 压缩:取第一个分号/句号前的主句(量化数字集中在前半句);主句过短则保留整条 */
const brief = (h: string) => {
  const head = h.split(/[;；。]/)[0].trim();
  return head.length >= 16 ? head : h;
};

const sec = (title: string, no: string) =>
  `<div class="sc-t"><span class="sc-no">${no}</span>${title}<span class="sc-line"></span></div>`;

export async function GET() {
  const [{ content: d }, template] = await Promise.all([
    fetchPublishedResume(),
    readFile(path.join(process.cwd(), "public", "resume-template.html"), "utf8"),
  ]);

  const p = d.profile;
  // 打印版剔除:「本站」卡(PDF 语境无信息量)与 landray-claw(与 Teamspace 卡重复)
  const projects = d.projects.filter(
    (x) => !/codeyang-resume|本站|landray-claw/i.test(x.name),
  );
  const cities = p.location?.split("期望")?.[1]?.trim() ?? p.location ?? "";

  const contact = [
    p.location ? `<div>${esc(p.location)}</div>` : "",
    p.email ? `<div>${esc(p.email)}</div>` : "",
    ...p.links.map((l) => `<div>${l.url ? `<a href="${esc(l.url)}">${esc(l.label)}</a>` : esc(l.label)}</div>`),
  ].join("");

  const skillRows = d.skillGroups
    .map((g) => {
      const core = g.skills.filter((s) => s.proof);
      const rest = g.skills.filter((s) => !s.proof);
      const main = core.length
        ? core
            .map(
              (s) =>
                `<div><b>${esc(s.name)}</b>${s.proof ? `<span class="sk-proof"> —— ${esc(s.proof)}</span>` : ""}</div>`,
            )
            .join("")
        : g.skills.map((s) => esc(s.name)).join(" · ");
      return `<tr><th>${esc(g.name)}</th><td>${main}${
        rest.length ? `<div class="sk-note">另有 ${rest.map((s) => esc(s.name)).join(" · ")}</div>` : ""
      }${g.note ? `<div class="sk-note">${esc(g.note)}</div>` : ""}</td></tr>`;
    })
    .join("");

  /** 打印版重点项目精修文案(比线上滚动卡更丰富;命中走手写稿,未命中走 API 原文) */
  const PRINT_OVERRIDES: Array<{ match: RegExp; description: string; highlights: string[] }> = [
    {
      match: /sp-skills/i,
      description:
        "个人与团队沉淀提炼的 Claude Code skill 集（sp = superpower）：每个 skill 独立可用，npx skills add 一条命令装进任意工程，覆盖数据查询 / 信息采集 / 内容生产 / 研发排查四大类。",
      highlights: [
        "8 个 skill：db-analyzer（MySQL/PG/Oracle/SQLite 只读分析）· market-analyzer（行情技术指标）· web-search · github-trending · cn-hotspot · wechat-post（公众号发文流水线）· landray-log（跨服务日志排查）",
        "安全设计：数据 skill 两层只读拦截（应用层门禁+引擎强制）；凭证一律 example 模板 + 提交钩子拦截，永不入库",
        "PolyForm 小企业双重授权：个人与非商业免费，商业边界清晰",
      ],
    },
    {
      match: /skill-hub/i,
      description:
        "团队内部的 Agent Skill 分发平台：门户网站选 skill → 服务端渲染安装脚本 → 本地一条命令装进 Claude Code / Codex / WorkBuddy 的 skills 目录，零安装零依赖。",
      highlights: [
        "给人也给 AI 用：门户人选 skill，一条命令落盘，AI 客户端即刻可用",
        "Anthropic Agent Skills 规范包格式，客户端支持收敛为一张适配表，新增客户端只加一行",
        "Spring Boot 4.1 + PostgreSQL 17 + React 19（TS strict）monorepo 全栈，Docker Compose 一键交付",
      ],
    },
    {
      match: /lessie/i,
      description:
        "红杉资本投资 · 全球首个 People Search AI Agent（百度百科收录，Superlinear 出品）：自然语言在全球寻找投资人、网红、企业决策者并自动建立初步联络，整合 LinkedIn/GitHub 等 100+ 平台数据，2025.09 全球上线；任职期间公司融资 $100 万 → $500 万，负责工程基建层与架构演进。",
      highlights: [
        "五层全链路可观测体系（日均 100 亿+ Token）：LLM/工具/业务/API/Trace 分层采集，Kafka+Flink 实时聚合，与 LangSmith 双轨互补",
        "评测平台 Apex：召回（Recall@K/MRR）· 排序（Precision@K/NDCG）· 业务（首轮命中率）三层度量，迭代可回归",
        "单体物理机→Dubbo3→K8s 不停机迁移：协议隔离共存同一 Nacos，48h 并行观察 + 一键回滚",
      ],
    },
  ];

  const projectCards = projects
    .map((pr) => {
      const override = PRINT_OVERRIDES.find((o) => o.match.test(pr.name));
      const description = override?.description ?? pr.description;
      const highlights = override
        ? override.highlights
        : (pr.highlights ?? []).slice(0, 1).map(brief);
      const kindTag =
        pr.kind === "company"
          ? `<span class="os-k company">公司项目</span>`
          : `<span class="os-k personal">个人项目</span>`;
      const link = pr.link
        ? `<a class="os-m" href="${esc(pr.link)}">${pr.kind === "company" ? "官网" : /github/i.test(pr.link) ? "GitHub 源码" : "链接"} ↗</a>`
        : "";
      return `<div class="os">
    <div class="os-h"><span class="os-n">${esc(pr.name)}${kindTag}</span>${link}</div>
    <div class="os-d">${esc(description)}</div>
    ${highlights.map((h) => `<li>${esc(h)}</li>`).join("")}
  </div>`;
    })
    .join("");

  const expBlocks = d.experiences
    .map(
      (e) => `<div class="ex">
    <div class="ex-h"><span class="ex-co">${esc(e.company.split("（")[0])}${
        e.companyUrl ? ` <a href="${esc(e.companyUrl)}" style="font-size:11px;font-weight:400">官网 ↗</a>` : ""
      }</span><span class="ex-p">${esc(formatPeriod(e.start, e.end))}</span></div>
    <div class="ex-role">${esc(e.role)}${e.companyTag ? `<span class="chip">${esc(e.companyTag)}</span>` : ""}</div>
    ${e.highlights.slice(0, 4).map((h) => `<li>${esc(brief(h))}</li>`).join("")}
    ${e.tech.length ? `<div class="ex-tg">${e.tech.map((t) => `<span class="ex-tgi">${esc(t)}</span>`).join("")}</div>` : ""}
  </div>`,
    )
    .join("");

  const eduSection = d.education.length
    ? `<div class="sc">
  ${sec("教育背景", "04")}
  ${d.education
    .map(
      (edu) =>
        `<div class="edu-row"><span><b>${esc(edu.school)}</b> · ${esc(edu.major)}${edu.degree ? ` · ${esc(edu.degree)}` : ""}</span><span>${esc(formatPeriod(edu.start, edu.end))}</span></div>`,
    )
    .join("")}
</div>`
    : "";

  const html = template
    .replace("{{NAME}}", esc(p.name))
    .replace("{{HEADLINE}}", esc(p.headline))
    .replace("{{CONTACT_LINES}}", contact)
    .replace("{{SUMMARY}}", esc(p.summary))
    .replace("{{TAGS}}", (p.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join(""))
    .replace("{{SKILL_ROWS}}", skillRows)
    .replace("{{PROJECT_CARDS}}", projectCards)
    .replace("{{EXP_BLOCKS}}", expBlocks)
    .replace("{{EDU_SECTION}}", eduSection)
    .replace("{{TARGET_ROLE}}", esc(p.headline.split("·")[0]?.trim() ?? ""))
    .replace("{{CITIES}}", esc(cities))
    .replace("{{EMAIL}}", esc(p.email ?? ""));

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
