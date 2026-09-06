/** 本机 PDF 服务：复用 e2e 的 playwright + chromium + 系统字体（Noto CJK 已装） */
import http from "node:http";
import { chromium } from "@playwright/test";

const PORT = 3002;
const PAGE_URL = process.env.PDF_PAGE_URL ?? "https://resume.nodetime.top";
const SCALE = 0.82;
// A4 可用高度（去掉 8mm 上下边距）换算成 CSS px，再除 scale = 每页能容纳的布局高度
const PAGE_H = ((297 - 16) / 25.4) * 96 / SCALE;

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
console.log(`chromium ready · 每页布局高度 ${PAGE_H.toFixed(0)}px`);

/** 屏幕媒体下的保真 + 碎片化基础规则（确定性断页由 JS 闭环补齐） */
const PDF_FIX_CSS = `
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

/**
 * 确定性分页闭环（spacer 版）：break-before 在连续布局里是空操作，测量会假收敛；
 * 改为在骑线元素前物理插入 spacer 撑到下一页边界——连续测量与 page.pdf 分页
 * 两个世界对 spacer 的解释一致，闭环真实有效。
 * 卡片在网格内：spacer 提升到网格容器级（否则 spacer 变网格项，布局被破坏）。
 * 空隙过大（>60% 页高）时放弃整块推页，改为放开内部分割（li 级 avoid 兜底干净切线）。
 */
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
          if (h > pageH) continue; // 单块高于一页：内部 li 级分割兜底
          if (pageOf(top) !== pageOf(bottom - 1)) {
            // 卡片骑线：锚点提升为「同行首卡」，整行一起走
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

        // 每轮只修最靠上的一处：推页会重排后续坐标，必须修完重测
        crossing.sort((a, b) => a.top - b.top);
        const c = crossing[0];
        if (c.gap > pageH * 0.6) {
          // 空隙过大：不推页，放开该块内部切割（子项仍有 break-inside:avoid 兜底干净切线）
          c.el.style.breakInside = "auto";
          c.el.dataset.pdfSpaced = "split";
          return { fixed: 1, action: "split" };
        }
        // 标题防孤行：紧邻上方的 h2/h3 一起推
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
        if (c.inGrid) spacer.style.gridColumn = "1 / -1"; // 网格内占满整行，不打乱列布局
        spacer.dataset.pdfSpacer = "1";
        head.parentNode.insertBefore(spacer, head);
        head.dataset.pdfSpaced = "pushed";
        return { fixed: 1, action: "push" };
      },
      [PAGE_H],
    );
    console.log(`[paginate] round ${round}: ${action}`);
    if (!fixed) break;
  }
}

async function renderPdf(theme) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  try {
    const page = await context.newPage();
    await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
    await page.goto(PAGE_URL, { waitUntil: "networkidle", timeout: 30000 });
    if (theme === "light") {
      await page.evaluate(() => document.documentElement.classList.remove("dark"));
    }
    await page.evaluate(() => {
      document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("revealed"));
    });
    await page.addStyleTag({ content: PDF_FIX_CSS });
    await sleep(600); // 等字体/进度条收尾
    await paginate(page);
    await sleep(100);
    return await page.pdf({
      format: "A4",
      printBackground: true,
      scale: SCALE,
      margin: { top: "8mm", bottom: "8mm", left: "6mm", right: "6mm" },
    });
  } finally {
    await context.close();
  }
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method !== "GET" || url.pathname !== "/resume.pdf") return res.writeHead(404).end();
    const theme = url.searchParams.get("theme") === "light" ? "light" : "dark";
    renderPdf(theme)
      .then((buf) => {
        res.writeHead(200, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="CodeYang-Resume.pdf"',
          "cache-control": "no-store",
        });
        res.end(buf);
        console.log(`served ${buf.length}B ${theme}`);
      })
      .catch((e) => {
        console.error(e);
        res.writeHead(502).end(String(e));
      });
  })
  .listen(PORT, () => console.log(`pdf-host on :${PORT}`));
