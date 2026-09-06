---
name: deploy
description: codeyang-resume-online 项目的部署与发布操作手册。当用户要求部署/上线/发布简历新版本/回滚内容/签发 HTTPS 证书/验证服务健康时使用。包含标准化脚本（发布、验证、回滚）与排错手册。
---

# 部署技能（codeyang-resume-online）

本项目是容器化部署：生产为 `db / server / web / nginx / certbot` 五服务
（`deploy/compose.yaml` + 叠加 `deploy/compose.prod.yaml`：443 + TLS + 证书自动续期），
内容发布走「简历版本管理 API」。**所有操作先看本文件，脚本在 `scripts/`，排错在 `references/runbook.md`。**

## 环境事实（先记住这些）

- 公网入口：**`https://resume.nodetime.top`**（HTTPS，nginx 80/443，宿主机香港服务器）；IP 直连兜底 `http://8.218.79.152`
- **PDF 导出**：`GET /resume.pdf?theme=dark|light`（nginx → `host.docker.internal:3002`）。
  服务当前跑在**宿主机** `pdf-host.mjs`（e2e 的 playwright + 系统 chromium，nohup）；
  容器化文件已备好（pdf/ 目录 + compose 的 pdf 服务 + nginx 目标切回 `pdf:3002`），
  网络通畅时构建镜像并切换即可。重启宿主机后需手动拉起：`cd e2e && nohup node pdf-host.mjs &`
  两个已踩平的坑：① 中文渲染依赖宿主机字体（已装 `fonts-noto-cjk`，2026-09-07，丢了会变框框）；
  ② **域名前面有 Cloudflare，会把 .pdf 缓存 4 小时**——nginx 已强制 no-store，前端按钮带时间戳参数兜底
- **本机跑的是生产栈（prod 叠加模式，5 容器：db/server/web/nginx/certbot）**，查状态一律带两个 compose 文件：
  `docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml ps`
- ⚠️ **`script/dev.mjs` 起的 dev 栈与生产共用同一个 db 容器/数据库**（同一个 compose project）：
  「先发 dev 预览」的版本发布实际会写生产库并移动发布指针——若线上还是旧代码，新契约内容会当场打破线上页面。
  预览新内容形态的正确顺序：**先部署新代码上线，再发布新内容**；或给 dev 栈独立 project 名与数据卷再隔离。
- 写接口只在容器内网可达（nginx 对非 GET 返回 403），需 `x-internal-token`（值在根目录 `.env`）
- 内容发布 = 新建版本 + 发布指针移动；**archived 版本不可复活，回滚 = 以旧内容派生新版本**（领域规则）
- shell 默认 Node 是 v20，pnpm 11 需要 v22：**先 `nvm use 22`**（deploy.sh 纯 bash + docker，不需要 Node）

## HTTPS 与证书（certbot）

- 证书：Let's Encrypt，域名 `resume.nodetime.top`（.env 的 `DOMAIN`），有效期 90 天
- 存储：named volume `codeyang-resume_certbot-conf`（证书本体）+ `codeyang-resume_certbot-www`（webroot 挑战目录）——**`deploy.sh prod` 重建服务不会动这两个卷，更新代码不影响证书**
- 续期机制（全自动，无需人工干预）：
  - `certbot` 容器每 **12h** 跑 `certbot renew --webroot`
  - `nginx` 容器每 **6h** `nginx -s reload` 吃新证书（compose.prod.yaml 的 command 覆盖）
- 首次签发/换域名才需要 `./script/setup-https.sh`（standalone 模式临时占 80，签完渲染 `deploy/nginx/runtime/default.conf`）
- 查证书到期：`echo | openssl s_client -connect resume.nodetime.top:443 -servername resume.nodetime.top 2>/dev/null | openssl x509 -noout -dates`
- 查续期容器：`docker logs codeyang-resume-certbot-1 --tail 20`（安静无输出属正常）

## 操作决策树

脚本一律 JS（`.mjs`，Node 22 原生 fetch，跨平台零依赖），用 `node` 执行：

| 用户意图 | 做法 |
|---|---|
| **更新代码并发布到生产（本机唯一正确路径）** | `./deploy/deploy.sh prod`（= 双 compose 文件 `up -d --build`，证书/certbot 原样保留） |
| 部署到无 HTTPS 的内网演示机 | `./deploy/deploy.sh local`（**绝不可在本生产机跑**，会把 nginx 降级成纯 80、丢掉 443 与证书配置） |
| 发布简历新版本（内容 JSON 已备好） | `node .claude/skills/deploy/scripts/release.mjs <content.json>` |
| 回滚简历内容到某历史版本 | `node .claude/skills/deploy/scripts/rollback.mjs [版本号]`（不带参数=列出全部版本） |
| 验证线上健康 | `node .claude/skills/deploy/scripts/verify.mjs` |
| 首次上 HTTPS / 换域名 | `./script/setup-https.sh` → `./deploy/deploy.sh prod`（详见 runbook） |
| 跑 e2e 验收 | `cd e2e && E2E_BASE_URL=https://resume.nodetime.top E2E_API_BASE=https://resume.nodetime.top pnpm test` |

环境变量 `PUBLIC_BASE` 可覆盖默认公网地址（本地验证时设 `http://localhost`）。

## 发布新版本（标准流程）

1. 准备内容 JSON：`{ "content": {...完整简历契约}, "label": "...", "note": "..." }`
   契约见 `server/src/domain/resume/resume-content.ts`；**以当前发布版为基线修改**（`GET /api/v1/resume/codeyang`）
2. 执行 `node .claude/skills/deploy/scripts/release.mjs /tmp/vN-content.json`——脚本会：校验容器与 JSON → 建版本 → 发布 → 强刷 web 缓存 → 公网验证
3. 看输出末尾的「版本 #N · label」与公网抽检结果

## 验证清单（发布/部署后必做）

`scripts/verify.mjs` 会自动断言：

1. `GET /api/v1/health` → `status: ok`
2. `GET /`（首页）→ 200
3. `GET /api/v1/resume/codeyang` → 姓名/版本号/发布态
4. `POST /api/v1/resume/codeyang/versions`（无令牌）→ 403（nginx 层拦截即正确）
5. 四容器状态 healthy/up

人工再补两项：浏览器打开公网地址肉眼看版式；改一次主题/点一次下载 PDF。

## 出问题了？

**任何部署异常先查三处**：`docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml ps`、`docker logs codeyang-resume-server-1 --tail 50`、`docker logs codeyang-resume-web-1 --tail 50`。
常见坑（PG18 挂载路径、standalone 子目录、日志目录权限等）全部收录在 `references/runbook.md` 的「已知坑速查表」。
