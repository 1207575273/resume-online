/**
 * PDF 导出服务(容器版):加载 web 的独立打印路由 /resume-print(res v4 模板,
 * 数据实时来自简历 API),以 print 媒体渲染为 A4 PDF——网站展示形态与 PDF 模板彻底分离,
 * 本服务只负责「把打印模板变成文件」,支持点击直接下载。
 * 系统 chromium(alpine apk),非 Playwright 捆绑版。
 */
import http from "node:http";
import { chromium } from "playwright-core";

const PORT = Number(process.env.PORT ?? 3002);
const PAGE_URL = process.env.PDF_PAGE_URL ?? "http://web:3000/resume-print";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
console.log(`[pdf] chromium ready → ${PAGE_URL}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let queue = Promise.resolve(); // 串行复用单浏览器,个人站足够

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

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method !== "GET" || url.pathname !== "/resume.pdf") return res.writeHead(404).end();
    queue = queue
      .then(() => renderPdf())
      .then((buf) => {
        res.writeHead(200, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="CodeYang-Resume.pdf"',
          "cache-control": "no-store",
        });
        res.end(buf);
        console.log(`[pdf] served ${buf.length}B`);
      })
      .catch((e) => {
        console.error("[pdf] render failed:", e.message);
        res.writeHead(502).end("PDF 生成失败,请稍后重试");
      });
  })
  .listen(PORT, "0.0.0.0");
