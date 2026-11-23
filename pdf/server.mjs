/**
 * PDF 导出服务(容器版,带版本指纹缓存):
 * - 指纹 = 简历发布版本号:同一版只渲染一次,后续请求直接返回缓存文件(<50ms);
 *   发布新版自动 miss → 重新渲染并缓存(内存 LRU,保留最近 5 版)。
 * - 浏览器协商缓存:ETag = "v{版本号}",If-None-Match 命中回 304(零传输)。
 * 渲染目标:web 的独立打印路由 /resume-print(res v4 模板,数据实时来自简历 API)。
 * 系统 chromium(alpine apk),非 Playwright 捆绑版。
 */
import http from "node:http";
import { chromium } from "playwright-core";

const PORT = Number(process.env.PORT ?? 3002);
const PAGE_URL = process.env.PDF_PAGE_URL ?? "http://web:3000/resume-print";
const VERSION_URL = process.env.RESUME_VERSION_URL ?? "http://server:3001/api/v1/resume/codeyang";
const MAX_CACHE = 5;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
console.log(`[pdf] chromium ready → ${PAGE_URL}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pdfCache = new Map(); // versionNumber → Buffer
let queue = Promise.resolve(); // 渲染串行(单浏览器复用)

async function fetchVersion() {
  const res = await fetch(VERSION_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`version api ${res.status}`);
  const j = await res.json();
  return Number(j.version?.number ?? 0);
}

async function renderPdf() {
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  try {
    const page = await context.newPage();
    await page.emulateMedia({ media: "print" });
    await page.goto(PAGE_URL, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(400); // 字体收尾
    return await page.pdf({
      format: "A4",
      printBackground: true,
      scale: 1,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }, // 模板 @page 自带边距
    });
  } finally {
    await context.close();
  }
}

/** 版本指纹取 PDF:命中缓存直返,miss 时串行渲染并写入(LRU 淘汰) */
async function getPdfForVersion(version) {
  const hit = pdfCache.get(version);
  if (hit) {
    pdfCache.delete(version);
    pdfCache.set(version, hit); // LRU 触底提升
    return { buf: hit, cached: true };
  }
  const job = queue.then(() => renderPdf());
  queue = job.catch(() => {}); // 队列吞错,不阻塞后续
  const buf = await job;
  pdfCache.set(version, buf);
  while (pdfCache.size > MAX_CACHE) pdfCache.delete(pdfCache.keys().next().value);
  return { buf, cached: false };
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method !== "GET" || url.pathname !== "/resume.pdf") return res.writeHead(404).end();

    (async () => {
      const version = await fetchVersion();
      const etag = `"v${version}"`;

      // 浏览器协商缓存:版本没变直接 304,零传输
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, { ETag: etag, "cache-control": "no-cache" });
        return res.end();
      }

      const { buf, cached } = await getPdfForVersion(version);
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="CodeYang-Resume.pdf"',
        "cache-control": "no-cache", // 每次带 If-None-Match 校验,版本变即重下
        etag,
        "x-pdf-cached": cached ? "hit" : "render",
      });
      res.end(buf);
      console.log(`[pdf] served v${version} ${buf.length}B ${cached ? "(cache hit)" : "(rendered)"}`);
    })().catch((e) => {
      console.error("[pdf] failed:", e.message);
      res.writeHead(502).end("PDF 生成失败,请稍后重试");
    });
  })
  .listen(PORT, "0.0.0.0");
