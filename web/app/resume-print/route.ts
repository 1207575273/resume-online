import { fetchPublishedResume, formatPeriod } from "@/lib/api";

/**
 * PDF 打印版简历(独立模板,不经 root layout——无站点壳/导航/聊天/动效):
 * 版式源自 res/杨胜_v4 系列(A4 紧凑、indigo 品牌色、编号分节、完整分页控制),
 * 密度手法参考 chenpeisheng.cn/resume(bullet 单行压缩:量化数字前置)。
 * 数据来自简历版本 API——线上内容一改,打印自动同步。
 * 下载链路 = 访客自己的浏览器:下载按钮新开本页并 window.print() → 另存为 PDF,
 * 服务端零渲染依赖(无 pdf 容器/无宿主机服务)。
 */
export const dynamic = "force-dynamic";

/** 最小 HTML 转义(内容来自自家 DB,防御性处理) */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 打印版 bullet 压缩:取第一个分号/句号前的主句(量化数字集中在前半句);主句过短则保留整条 */
const brief = (h: string) => {
  const head = h.split(/[;；。]/)[0].trim();
  return head.length >= 16 ? head : h;
};

const CSS = `
  @page { size: A4; margin: 10mm 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { line-height: 1.65; color: #1e1e2e; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: -apple-system, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; }
  .page { max-width: 210mm; margin: 0 auto; padding: 10mm 14mm; }
  a { text-decoration: none; color: #6366f1; }

  .hd { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 3px solid; border-image: linear-gradient(90deg,#6366f1,#a78bfa,#c4b5fd) 1; margin-bottom: 8px; }
  .hd-name { font-size: 34px; font-weight: 800; color: #1e1b4b; letter-spacing: 4px; }
  .hd-sub { font-size: 15px; color: #6366f1; font-weight: 600; margin-top: 2px; }
  .hd-r { text-align: right; font-size: 12px; color: #374151; line-height: 1.75; min-width: 220px; flex-shrink: 0; }
  .hd-desc { font-size: 13px; color: #1f2937; background: linear-gradient(90deg,#eef2ff,#f5f3ff); padding: 8px 12px; border-radius: 4px; line-height: 1.62; border-left: 3px solid #6366f1; margin-bottom: 6px; }
  .hd-desc b { color: #4338ca; }
  .hd-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
  .hd-tags .tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 12px; background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; white-space: nowrap; }

  .sc { margin-bottom: 9px; }
  .sc-t { display: flex; align-items: baseline; gap: 7px; font-size: 14.5px; font-weight: 700; color: #4338ca; letter-spacing: 1.5px; margin-bottom: 5px; }
  .sc-no { font-size: 11px; font-weight: 800; color: #a78bfa; letter-spacing: 1px; }
  .sc-line { flex: 1; height: 1px; background: linear-gradient(90deg, #e0e7ff, transparent); }

  .sk-table { width: 100%; border-collapse: collapse; }
  .sk-table th, .sk-table td { padding: 2.5px 6px; vertical-align: top; text-align: left; }
  .sk-table th { font-size: 12.5px; border-bottom: 1px solid #e0e7ff; width: 92px; color: #1e1b4b; }
  .sk-table td { font-size: 11.5px; color: #1f2937; border-bottom: 1px solid #f2f2fa; }
  .sk-note { font-size: 10.5px; color: #6b7280; margin-top: 2px; }
  .sk-proof { color: #4b5563; }

  .os { background: #fafaff; border: 1px solid #e0e0f0; border-radius: 6px; padding: 8px 11px; margin-bottom: 5px; }
  .os-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .os-n { font-size: 14px; font-weight: 700; color: #1e1b4b; }
  .os-m { font-size: 10.5px; color: #6b7280; white-space: nowrap; }
  .os-d { font-size: 12px; color: #4b5563; margin-top: 2px; line-height: 1.55; }

  .cp-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 2.5px 0; border-bottom: 1px dashed #ececf4; }
  .cp-name { font-size: 12.5px; font-weight: 700; color: #1e1b4b; }
  .cp-desc { font-size: 11px; color: #4b5563; text-align: right; line-height: 1.5; max-width: 62%; }

  .ex { margin-bottom: 9px; }
  .ex-h { display: flex; justify-content: space-between; align-items: baseline; }
  .ex-co { font-size: 16px; font-weight: 700; color: #1e1b4b; }
  .ex-p { font-size: 12px; color: #6b7280; white-space: nowrap; }
  .ex-role { font-size: 12.5px; color: #4b5563; margin: 2px 0 4px; }
  .ex-role .chip { font-size: 10.5px; background: #f1f5f9; color: #374151; border-radius: 3px; padding: 1px 6px; margin-left: 6px; }
  .ex-ul { padding-left: 16px; font-size: 12px; color: #1f2937; }
  .ex-ul li { margin-bottom: 2.5px; line-height: 1.55; }
  .ex-tg { display: flex; gap: 4px; flex-wrap: wrap; margin: 3px 0 4px; }
  .ex-tgi { padding: 1px 7px; background: #f1f5f9; color: #374151; border-radius: 3px; font-size: 10px; font-weight: 500; }

  .edu-row { display: flex; justify-content: space-between; padding: 2.5px 0; font-size: 12px; color: #1f2937; border-bottom: 1px solid #f2f2fa; }

  .ft { font-size: 12.5px; color: #1f2937; padding: 8px 0 0; border-top: 2px solid #e0e7ff; margin-top: 6px; display: flex; gap: 22px; flex-wrap: wrap; }
  .ft-l { font-weight: 700; color: #4338ca; margin-right: 4px; }
  .credit { text-align: center; font-size: 9px; color: #c0c0c0; margin-top: 10px; letter-spacing: 0.5px; }

  /* ===== 分页控制(res v4 同款) ===== */
  .os, .cp-row, .edu-row, tr, .hd, .hd-desc, .hd-tags, .ex-h, .ex-role, .ex-tg { break-inside: avoid; page-break-inside: avoid; }
  .ex, .sc { break-inside: auto; page-break-inside: auto; }
  .sc-t, .ex-co, .ex-role { break-after: avoid; page-break-after: avoid; }
  li { orphans: 3; widows: 3; }
  @media print { .page { padding: 0; } }
  @media screen { body { background: #e8e8ee; } .page { background: #fff; box-shadow: 0 2px 24px rgba(0,0,0,.12); margin: 16px auto; } }
`;

const sec = (title: string, no: string) =>
  `<div class="sc-t"><span class="sc-no">${no}</span>${title}<span class="sc-line"></span></div>`;

export async function GET() {
  const { content: d } = await fetchPublishedResume();
  const p = d.profile;
  const personal = d.projects.filter((x) => x.kind === "personal");
  const company = d.projects.filter((x) => x.kind === "company");
  const cities = p.location?.split("期望")?.[1]?.trim() ?? p.location ?? "";

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${esc(p.name)} · PDF 简历</title>
<meta name="robots" content="noindex,nofollow">
<style>${CSS}</style></head>
<body><div class="page">

<div class="hd">
  <div>
    <div class="hd-name">${esc(p.name)}</div>
    <div class="hd-sub">${esc(p.headline)}</div>
  </div>
  <div class="hd-r">
    ${p.location ? `<div>${esc(p.location)}</div>` : ""}
    ${p.email ? `<div>${esc(p.email)}</div>` : ""}
    ${p.links.map((l) => `<div>${l.url ? `<a href="${esc(l.url)}">${esc(l.label)}</a>` : esc(l.label)}</div>`).join("")}
  </div>
</div>

<div class="hd-desc">${esc(p.summary)}</div>
<div class="hd-tags">${(p.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>

<div class="sc">
  ${sec("专业技能", "01")}
  <table class="sk-table"><tbody>
    ${d.skillGroups
      .map((g) => {
        const core = g.skills.filter((s) => s.proof);
        const rest = g.skills.filter((s) => !s.proof);
        const main = core.length
          ? core.map((s) => `<div><b>${esc(s.name)}</b>${s.proof ? `<span class="sk-proof"> —— ${esc(s.proof)}</span>` : ""}</div>`).join("")
          : g.skills.map((s) => esc(s.name)).join(" · ");
        return `<tr><th>${esc(g.name)}</th><td>${main}${
          rest.length ? `<div class="sk-note">另有 ${rest.map((s) => esc(s.name)).join(" · ")}</div>` : ""
        }${g.note ? `<div class="sk-note">${esc(g.note)}</div>` : ""}</td></tr>`;
      })
      .join("")}
  </tbody></table>
</div>

${personal.length ? `<div class="sc">
  ${sec("个人项目 · 开源", "02")}
  ${personal
    .map(
      (pr) => `<div class="os">
    <div class="os-h"><span class="os-n">${esc(pr.name)}</span>${
        pr.link ? `<a class="os-m" href="${esc(pr.link)}">${/github/i.test(pr.link) ? "GitHub 源码" : "链接"} ↗</a>` : ""
      }</div>
    <div class="os-d">${esc(pr.description)}</div>
    ${(pr.highlights ?? []).slice(0, 1).map((h) => `<li>${esc(brief(h))}</li>`).join("")}
  </div>`,
    )
    .join("")}
</div>` : ""}

${company.length ? `<div class="sc">
  ${sec("公司项目", "03")}
  ${company
    .map(
      (pr) => `<div class="cp-row"><span class="cp-name">${esc(pr.name)}${
        pr.link ? ` <a href="${esc(pr.link)}" style="font-weight:400;font-size:10.5px">官网 ↗</a>` : ""
      }</span><span class="cp-desc">${esc(pr.description)}</span></div>`,
    )
    .join("")}
</div>` : ""}

<div class="sc">
  ${sec("职业履历", "04")}
  ${d.experiences
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
    .join("")}
</div>

${d.education.length ? `<div class="sc">
  ${sec("教育背景", "05")}
  ${d.education
    .map(
      (edu) =>
        `<div class="edu-row"><span><b>${esc(edu.school)}</b> · ${esc(edu.major)}${edu.degree ? ` · ${esc(edu.degree)}` : ""}</span><span>${esc(formatPeriod(edu.start, edu.end))}</span></div>`,
    )
    .join("")}
</div>` : ""}

<div class="ft">
  <span><span class="ft-l">目标岗位</span>${esc(p.headline.split("·")[0]?.trim() ?? "")}</span>
  <span><span class="ft-l">期望城市</span>${esc(cities)}</span>
  ${p.email ? `<span><span class="ft-l">联系</span>${esc(p.email)}</span>` : ""}
</div>
<div class="credit">codeYang 结合 AI 打磨生产 · 内容与在线版实时同步</div>

</div>
<script>if(new URLSearchParams(location.search).get("print")==="1"){addEventListener("load",function(){setTimeout(function(){print()},400)})}</script>
</body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
