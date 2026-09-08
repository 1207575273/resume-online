#!/usr/bin/env node
/**
 * 百度普通收录 API 推送：把站点 URL 主动推给百度（百度不支持 IndexNow，只认自家通道）。
 * 用法: node .claude/skills/deploy/scripts/baidu-push.mjs [--quiet]
 * 前置: .env 里配 BAIDU_PUSH_TOKEN（ziyuan.baidu.com → 普通收录 → API 推送 页面复制 token）。
 * token 未配置时安静退出（exit 0，不阻断发布流程），首次配置后本脚本自动生效。
 * 纯 Node 22（原生 fetch），无第三方依赖。
 */
import { ROOT, readEnv } from "./lib.mjs";

const QUIET = process.argv.includes("--quiet");

const log = (m) => !QUIET && console.log(`\x1b[36m[baidu-push]\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\x1b[31m[baidu-push]\x1b[0m ${m}`);
  process.exit(1);
};

const env = readEnv();
const token = env.BAIDU_PUSH_TOKEN;
const domain = env.DOMAIN ?? "resume.nodetime.top";

if (!token || token.startsWith("占位") || token.length < 8) {
  log("BAIDU_PUSH_TOKEN 未配置，跳过（ziyuan.baidu.com → 普通收录 → API 推送 复制 token 填入 .env）");
  process.exit(0);
}

// 单页站：首页 + sitemap；以后加页面改成解析 sitemap.xml 即可
const urls = [`https://${domain}/`, `https://${domain}/sitemap.xml`];

log(`推送 ${urls.length} 条 URL → 百度普通收录…`);
try {
  const response = await fetch(
    `http://data.zz.baidu.com/urls?site=${domain}&token=${token}`,
    {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: urls.join("\n"),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (data.success) {
    log(`成功 ${data.success} 条 · 今日剩余配额 ${data.remain ?? "?"}`);
  } else {
    // 常见错误码：401 token 非法 / 400 site 与 token 不匹配 / 403 配额用尽
    fail(`百度返回错误: ${JSON.stringify(data)}（检查 .env 的 BAIDU_PUSH_TOKEN 与 DOMAIN 是否匹配）`);
  }
} catch (error) {
  fail(`请求失败: ${error.message}`);
}
