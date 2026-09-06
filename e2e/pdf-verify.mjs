/** 分页验证原型：与服务端同款闭环（每轮一修 + 行级锚点）→ 残留断言 → 逐页截图 */
import { chromium } from "@playwright/test";

const SCALE = 0.82;
const PAGE_H = ((297 - 16) / 25.4) * 96 / SCALE;
const CSS = `
  .no-print { display: none !important; }
  .hero-shell { min-height: auto; padding: 40px 0 24px; }
  .hero-parallax, .hero-content, .aurora-field { transform: none !important; }
  .hero-content { opacity: 1 !important; }
  .card, .skill-badge, .spec-grid, section[aria-label='关键数字'] { break-inside: avoid; }
  li, article, .skill-badge { break-inside: avoid; }
  h2, h3 { break-after: avoid; }
  p { orphans: 3; widows: 3; }
`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function paginate(page) {
  for (let round = 1; round <= 12; round++) {
    const { fixed, action } = await page.evaluate(
      ([pageH]) => {
        const blocks = document.querySelectorAll(
          [".spec-grid", ".card", "section[aria-label='关键数字']", "#education [class*='border-t']"].join(","),
        );
        const abs = (el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, h: r.height };
        };
        const pageOf = (y) => Math.floor(y / pageH);
        const crossing = [];
        for (const el of blocks) {
          if (el.dataset.pdfSpaced === "split") continue;
          const { top, bottom, h } = abs(el);
          if (h > pageH) continue;
          if (pageOf(top) !== pageOf(bottom - 1)) {
            let anchor = el;
            let inGrid = false;
            if (el.classList.contains("card")) {
              const grid = el.closest("div.grid");
              if (grid) {
                const myTop = el.getBoundingClientRect().top;
                const row = [...grid.children].filter(
                  (sib) => Math.abs(sib.getBoundingClientRect().top - myTop) < 5,
                );
                if (row.length > 1) anchor = row[0];
                inGrid = true;
              }
            }
            crossing.push({ el, anchor, inGrid, top, gap: (pageOf(top) + 1) * pageH - top });
          }
        }
        if (crossing.length === 0) return { fixed: 0, action: "done" };
        crossing.sort((a, b) => a.top - b.top);
        const c = crossing[0];
        if (c.gap > pageH * 0.6) {
          c.el.style.breakInside = "auto";
          c.el.dataset.pdfSpaced = "split";
          return { fixed: 1, action: "split" };
        }
        let head = c.anchor;
        let prev = c.anchor.previousElementSibling;
        while (prev) {
          const gap = c.anchor.getBoundingClientRect().top - prev.getBoundingClientRect().bottom;
          if (gap > 100) break;
          if (/^H[23]$/.test(prev.tagName)) { head = prev; break; }
          prev = prev.previousElementSibling;
        }
        const spacer = document.createElement("div");
        spacer.style.height = `${Math.ceil(c.gap + 2)}px`;
        if (c.inGrid) spacer.style.gridColumn = "1 / -1";
        spacer.dataset.pdfSpacer = "1";
        head.parentNode.insertBefore(spacer, head);
        head.dataset.pdfSpaced = "pushed";
        return { fixed: 1, action: "push" };
      },
      [PAGE_H],
    );
    console.log(`round ${round}: ${action}`);
    if (!fixed) break;
  }
}

const RESIDUAL = ([pageH]) => {
  const out = [];
  for (const el of document.querySelectorAll(
    ".spec-grid, .card, section[aria-label='关键数字'], #education [class*='border-t']",
  )) {
    if (el.dataset.pdfSpaced === "split") continue;
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    const bottom = r.bottom + window.scrollY;
    if (Math.floor(top / pageH) !== Math.floor((bottom - 1) / pageH)) {
      out.push({ el: el.className.slice(0, 30), h: Math.round(r.height) });
    }
  }
  return out;
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: Math.round(PAGE_H) },
  colorScheme: "dark",
});
const page = await context.newPage();
await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
await page.goto("https://resume.nodetime.top", { waitUntil: "networkidle" });
await page.evaluate(() =>
  document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("revealed")),
);
await page.addStyleTag({ content: CSS });
await sleep(600);
await paginate(page);
const residual = await page.evaluate(RESIDUAL, [PAGE_H]);
console.log("残留骑线:", residual.length ? JSON.stringify(residual) : "0 ✓");
const height = await page.evaluate(() => document.body.scrollHeight);
const pages = Math.ceil(height / PAGE_H);
console.log(`${pages} 页 · 总高 ${height}px`);
for (let i = 0; i < pages; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(i * PAGE_H));
  await sleep(250);
  await page.screenshot({ path: `/tmp/pv-${i + 1}.png` });
  console.log("shot", i + 1);
}
await browser.close();
