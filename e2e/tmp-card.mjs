// 真实交互验证:点 Hero「联系方式」按钮,确认卡片弹出且内容齐全
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("https://resume.nodetime.top", { waitUntil: "networkidle" });
await page.click('button:has-text("联系方式")');
await page.waitForTimeout(400);
const r = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return { ok: false, why: "卡片未弹出" };
  const text = dialog.textContent ?? "";
  return {
    ok: true,
    电话: text.includes("17764199296"),
    邮箱: text.includes("yang1207575273@163.com"),
    GitHub: text.includes("github"),
    位置: text.includes("广州/深圳/武汉"),
    关闭钮: !!dialog.querySelector('button[aria-label="关闭"]'),
  };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: "/tmp/contact-card.png" });
await browser.close();
