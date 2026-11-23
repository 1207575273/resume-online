---
name: adsense
description: codeyang-resume-online 的 Google AdSense 广告接入与运维。当用户要启用/关闭广告、拿到 ca-pub 发布商 ID、广告不显示要排查、提到变现/广告位/ads.txt/AdSense 审核时使用。
---

# AdSense 广告（克制接入，配置驱动）

## 架构现状（2026-09-11 接入）

| 组件 | 位置 | 说明 |
|---|---|---|
| 广告位组件 | `web/components/ads/ad-slot.tsx` | 页脚上方一个响应式单元；打印（PDF）隐藏；min-height 防布局抖动 |
| 脚本注入 | `web/app/layout.tsx` | `NEXT_PUBLIC_ADSENSE_CLIENT` 存在才注入 adsbygoogle.js（next/script afterInteractive） |
| 隐私政策页 | `web/app/privacy/page.tsx` | AdSense 审核**必需**；已进 sitemap、页脚有链接 |
| ads.txt | `web/public/ads.txt` | 授权卖家声明，当前为注释占位 |
| 配置 | `.env` 两行 → compose `build.args` → Dockerfile `ARG/ENV` | **NEXT_PUBLIC_* 是构建期内联**，改完必须重新 build（运行时 environment 无效） |

**当前未配置 ID = 无广告版**：广告位组件返回 null、脚本不注入，与接入前完全一致（已线上验证 0 处 adsbygoogle）。

## 启用流程（用户拿到 ca-pub-… 后）

1. `.env` 加两行（广告单元 id 在 AdSense 后台「广告 → 按广告单元」创建展示广告后获得）：
   ```
   NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-xxxxxxxxxxxxxxxx
   NEXT_PUBLIC_ADSENSE_SLOT=xxxxxxxxxx
   ```
2. `web/public/ads.txt` 取消注释那行并替换 ID：`google.com, pub-xxxxxxxxxxxxxxxx, DIRECT, f08c47fec0942fa0`
3. 重新构建部署（网络劣化期 web 构建失败的兜底见 deploy skill 决策树）：
   ```
   docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml build web
   docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml up -d --no-build web
   ```
4. 验证（三处都要过）：
   ```
   curl -s https://resume.nodetime.top/ | grep -c adsbygoogle   # >0：脚本与广告位已渲染
   curl -s https://resume.nodetime.top/ads.txt                   # 含 google.com, pub-… 行
   浏览器开首页：页脚上方应出现广告（新账号填充可能要几小时~几天）
   ```

## 广告不显示的排查顺序

1. **`.env` 配了但没重新 build**——最常见（NEXT_PUBLIC_ 构建期内联，改 env 不 build 无效）；
   确认产物：`curl -s 首页 | grep ca-pub` 应能看到 ID
2. ads.txt 未更新 / ID 与账号不匹配（后台会报"ads.txt 警告"）
3. 账号未过审 / 站点未被批准（AdSense 后台看状态；被拒常见原因：内容量少——单页简历站天然弱，可补项目详情页）
4. 新站点流量低：展示填充慢属正常，等即可
5. 区域/设备无广告库存：换设备网络再看

## 回滚（关掉广告）

清空 `.env` 那两行（或注释掉）→ 重新 build web + up → 恢复无广告版。ads.txt 的注释占位可保留。

## 立场备忘（用户曾误解，别再踩）

- **广告 ≠ SEO**：AdSense 与搜索排名无关（Google 官方口径）。收录推进走 GSC/百度资源平台/内容矩阵，见 `docs/baidu-content-pack.md`
- 广告位设计立场：**克制**——只在页脚上方一个位。求职主页满页广告伤 HR 观感，别加自动广告（会在内容中间乱插）
- 隐私政策页必须可达（页脚链接），这是 AdSense 审核硬性项
