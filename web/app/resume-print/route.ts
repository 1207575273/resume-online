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
  // 打印版不放「本站」卡:PDF 语境下指向自身主页的链接无信息量(线上滚动卡保留)
  const personal = d.projects.filter(
    (x) => x.kind === "personal" && !/codeyang-resume|本站/.test(x.name),
  );
  const company = d.projects.filter((x) => x.kind === "company");
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

  const personalSection = personal.length
    ? `<div class="sc">
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
</div>`
    : "";

  const companyRows = company
    .map(
      (pr) => `<div class="cp-row"><span class="cp-name">${esc(pr.name)}${
        pr.link ? ` <a href="${esc(pr.link)}" style="font-weight:400;font-size:10.5px">官网 ↗</a>` : ""
      }</span><span class="cp-desc">${esc(pr.description)}</span></div>`,
    )
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
  ${sec("教育背景", "05")}
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
    .replace("{{PERSONAL_SECTION}}", personalSection)
    .replace("{{COMPANY_ROWS}}", companyRows)
    .replace("{{EXP_BLOCKS}}", expBlocks)
    .replace("{{EDU_SECTION}}", eduSection)
    .replace("{{TARGET_ROLE}}", esc(p.headline.split("·")[0]?.trim() ?? ""))
    .replace("{{CITIES}}", esc(cities))
    .replace("{{EMAIL}}", esc(p.email ?? ""));

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
