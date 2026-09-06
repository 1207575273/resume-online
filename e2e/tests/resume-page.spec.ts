import { expect, test } from "@playwright/test";

/**
 * 在线简历验收用例：
 * 1. 首页完整渲染（Hero / 技能 / 经历 / 项目 / 教育 / 页脚）
 * 2. 主题切换（暗 ⇄ 亮）
 * 3. 打印按钮存在（PDF 出口）
 * 4. 截图存档（暗色 + 亮色，全页）
 * 5. SEO 基础（title / meta description / JSON-LD）
 */

test.describe("在线简历首页", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // 等待入场动画结束，避免截图截到半透明中间态
    await page.waitForTimeout(1200);
  });

  test("渲染简历核心内容", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("杨胜");
    // h1 后紧跟的副标题（headline）
    await expect(page.locator("main h1 + p")).toContainText("AI 应用架构师");

    for (const section of ["技能", "经历", "项目", "教育"]) {
      await expect(page.getByRole("heading", { name: new RegExp(section) })).toBeVisible();
    }
    // 经历时间线与项目卡片至少各一条
    await expect(page.locator("article").first()).toBeVisible();
    await expect(page.locator("[data-slot='card']").first()).toBeVisible();
  });

  test("主题可以在暗色与亮色间切换", async ({ page }) => {
    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);

    await page.getByRole("button", { name: "切换主题" }).click();
    await expect(html).not.toHaveClass(/dark/);

    await page.getByRole("button", { name: "切换主题" }).click();
    await expect(html).toHaveClass(/dark/);
  });

  test("提供打印/下载 PDF 入口", async ({ page }) => {
    await expect(page.getByRole("button", { name: "下载 PDF" })).toBeVisible();
  });

  test("SEO 基础标签与结构化数据", async ({ page }) => {
    await expect(page).toHaveTitle(/杨胜|CodeYang/);
    const description = page.locator('meta[name="description"]');
    await expect(description).not.toHaveCount(0);

    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    expect(jsonLd).toContain("Person");
  });

  test("截图存档：暗色全页", async ({ page }) => {
    await page.screenshot({ path: "screenshots/home-dark-full.png", fullPage: true });
    await page.screenshot({ path: "screenshots/home-dark-viewport.png", fullPage: false });
  });

  test("截图存档：亮色全页", async ({ page }) => {
    await page.getByRole("button", { name: "切换主题" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: "screenshots/home-light-full.png", fullPage: true });
  });
});

test.describe("server API", () => {
  test("健康检查与简历接口可用", async ({ request }) => {
    // web 不代理 /api（nginx 才代理），直连 server 验证
    const serverBase = process.env.E2E_API_BASE ?? "http://localhost:3001";

    const health = await request.get(`${serverBase}/api/v1/health`);
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).status).toBe("ok");

    const resume = await request.get(`${serverBase}/api/v1/resume/codeyang`);
    expect(resume.ok()).toBeTruthy();
    const body = await resume.json();
    expect(body.content.profile.name).toBe("杨胜");
    expect(body.version.status).toBe("published");
  });

  test("写接口拒绝无令牌请求", async ({ request }) => {
    const serverBase = process.env.E2E_API_BASE ?? "http://localhost:3001";
    const response = await request.post(`${serverBase}/api/v1/resume/codeyang/versions`, {
      data: { label: "hack" },
    });
    // 直连 server：401（令牌校验）；经 nginx：403（仅放行 GET）——两层防御都算通过
    expect([401, 403]).toContain(response.status());
  });
});
