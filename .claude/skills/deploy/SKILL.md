---
name: deploy
description: codeyang-resume-online 项目的部署与发布操作手册。当用户要求部署/上线/发布简历新版本/回滚内容/签发 HTTPS 证书/验证服务健康时使用。包含标准化脚本（发布、验证、回滚）与排错手册。
---

# 部署技能（codeyang-resume-online）

本项目是容器化部署：生产为 `db / server / web / chat / nginx / certbot` 六服务
（`deploy/compose.yaml` + 叠加 `deploy/compose.prod.yaml`：443 + TLS + 证书自动续期；
`pdf` 服务为容器化预案、默认 profiles 门控不启动），
内容发布走「简历版本管理 API」。**所有操作先看本文件，脚本在 `scripts/`，排错在 `references/runbook.md`。**

## 环境事实（先记住这些）

- 公网入口：**`https://resume.nodetime.top`**（HTTPS，nginx 80/443，宿主机香港服务器）；IP 直连兜底 `http://8.218.79.152`
- **PDF 导出**：`GET /resume.pdf?theme=dark|light`（nginx → `host.docker.internal:3002`）。
  服务当前跑在**宿主机** `pdf-host.mjs`（e2e 的 playwright + 系统 chromium，nohup）；
  容器化文件已备好（pdf/ 目录 + compose 的 pdf 服务 + nginx 目标切回 `pdf:3002`），
  网络通畅时构建镜像并切换即可。重启宿主机后需手动拉起：`cd e2e && nohup node pdf-host.mjs &`
  两个已踩平的坑：① 中文渲染依赖宿主机字体（已装 `fonts-noto-cjk`，2026-09-07，丢了会变框框）；
  ② ~~CF 缓存 .pdf 4 小时~~ 已过时：2026-09-08 起 resume 走灰云直连（A 记录 → 8.218.79.152，DNS only），
  无 CF 代理层；但 nginx 对 .pdf 仍强制 no-store、前端按钮带时间戳参数，双保险保留无害
- **本机跑的是生产栈（prod 叠加模式，6 容器：db/server/web/chat/nginx/certbot）**，查状态一律带两个 compose 文件：
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
| **更新代码并发布到生产（本机唯一正确路径）** | `./deploy/deploy.sh prod`（= 双 compose 文件 `up -d --build`，证书/certbot 原样保留）。**web 构建在网络劣化期失败时**（pnpm 大二进制 error 23 / 供应链检查报错）：宿主 `pnpm --filter @resume/web run build` 后用 tar 上下文直打 runner 层镜像（`tar -C /tmp/webctx -cf - Dockerfile -C web/.next standalone -C web/.next static -C web public \| docker build -t codeyang-resume-web:latest -`），再 `up -d --no-build web`；Dockerfile 已带 `--trust-lockfile` + pnpm store cache mount |
| 部署到无 HTTPS 的内网演示机 | `./deploy/deploy.sh local`（**绝不可在本生产机跑**，会把 nginx 降级成纯 80、丢掉 443 与证书配置） |
| 发布简历新版本（内容 JSON 已备好） | `node .claude/skills/deploy/scripts/release.mjs <content.json>`（末尾自动推百度收录） |
| 手动推百度收录 | `node .claude/skills/deploy/scripts/baidu-push.mjs`（需 `.env` 的 `BAIDU_PUSH_TOKEN`，未配则跳过） |
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
5. 生产 6 容器状态 running（本地栈 5 个）

人工再补两项：浏览器打开公网地址肉眼看版式；改一次主题/点一次下载 PDF。

## 出问题了？

**任何部署异常先查三处**：`docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml ps`、`docker logs codeyang-resume-server-1 --tail 50`、`docker logs codeyang-resume-web-1 --tail 50`。
常见坑（PG18 挂载路径、standalone 子目录、日志目录权限等）全部收录在 `references/runbook.md` 的「已知坑速查表」。

## resume-chat 运维（AI 问答）

生产栈新增第 6 个容器 `chat`（workspace 包 `@resume/chat`，容器内 :3210，**不发布宿主机端口**）：
简历页聊天窗每会话拉起一个常驻 `claude -p` 子进程（stdio pipes + stream-json，非 PTY——claude CLI 拒绝 TTY stdin），
会话/消息/线索全量入库，供管理后台分析。
方案与协议见 `docs/ai-chat-plan.md`，本节只讲运维（compose 命令一律带双文件，同上文口径）。

### 入口与路由

| 入口 | 地址 | 说明 |
|---|---|---|
| 访客聊天窗 | `https://resume.nodetime.top` 首页右下角 | WSS 走 `/chat/ws/:sessionId`，nginx 已配 upgrade |
| 健康探针 | `https://resume.nodetime.top/chat/api/health` | compose healthcheck 用 |
| 管理后台 | `https://resume.nodetime.top/chat/admin/` | **公网开放**，登录密码 = `.env` 的 `CHAT_ADMIN_TOKEN`（2026-09-08 起，简化为密码登录） |

admin 接口要求 `x-admin-token` 头（值 = 根目录 `.env` 的 `CHAT_ADMIN_TOKEN`；输错返回 401 前端重弹密码框）：

```bash
# 服务器上直连容器取数/导出（token 不落 shell 历史，从容器 env 读）
docker exec codeyang-resume-chat-1 sh -c \
  'wget -qO- --header "x-admin-token: $CHAT_ADMIN_TOKEN" http://127.0.0.1:3210/chat/api/admin/stats'
```

```bash
# ① SSH 隧道看后台网页：先在服务器上查容器内网 IP，再从本地隧道
ssh <服务器> 'docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" codeyang-resume-chat-1'
ssh -L 3210:<上面查到的IP>:3210 <服务器>    # 本地浏览器开 http://localhost:3210/chat/admin/
# ② 服务器上直连容器取数/导出（token 不落 shell 历史，从容器 env 读）
docker exec codeyang-resume-chat-1 sh -c \
  'wget -qO- --header "x-admin-token: $CHAT_ADMIN_TOKEN" http://127.0.0.1:3210/chat/api/admin/stats'
```

### 环境变量与令牌轮换

| 变量 | 用途 |
|---|---|
| `CHAT_MODEL` | claude CLI 模型（默认 sonnet） |
| `CHAT_ADMIN_TOKEN` | 后台令牌（`x-admin-token`） |
| `CHAT_MAX_TURNS` / `CHAT_IDLE_MS` / `CHAT_RATE_*` | 会话轮次 / 空闲断开 / 每 IP 限流 |
| `CHAT_CLAUDE_CMD` | 覆盖 claude 启动命令（测试注入 mock 用） |
| `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` | claude CLI 鉴权（**缺了 = 会话全起不来**） |
| `DATABASE_URL` / `RESUME_API_BASE` | db 与简历 API（compose 注入） |

轮换 `CHAT_ADMIN_TOKEN`——注意 `gen-env.sh` **对已存在的 .env 不覆盖**，分两种情况：

```bash
# 新机器：./script/gen-env.sh 一把生成（含随机 token）
# 已有 .env（本机生产栈即此情况）：手工换这一行，再重建 chat 容器
sed -i "s|^CHAT_ADMIN_TOKEN=.*|CHAT_ADMIN_TOKEN=$(openssl rand -hex 24)|" .env
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml up -d chat
```

### 常见排查

| 症状 | 先查 | 常因 |
|---|---|---|
| 会话建了但无回复 | `docker logs codeyang-resume-chat-1 --tail 50` | **claude CLI 鉴权失败最常见**：`ANTHROPIC_*` 没进容器（.env 缺项或 compose 未引用），日志见 401 / invalid api key |
| WS 用一会儿就断 | nginx 错误日志 | `/chat/` 的 `proxy_read_timeout` 偏短，长回答静默期被掐；调大后 reload nginx 容器 |
| 限流误伤自己 | 重启即清 | `security.mjs` 是**内存计数**：`docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml restart chat` 即清零；常态化放行要调 `CHAT_RATE_*` |
| 容器 unhealthy | `docker logs` ＋ curl `/chat/api/health` | db 未就绪或 `chat/src/schema.sql` 未执行（建表幂等，重起自动补） |

### 成本护栏在哪改

- 轮次：env `CHAT_MAX_TURNS`（pty 启动的 `--max-turns` 同源于它；改完 `up -d chat` 重建生效于新会话）
- 每 IP 限流：默认 ≤3 新会话/小时、≤20 会话/天，数值在 `chat/src/security.mjs`（可用 `CHAT_RATE_*` 覆盖）
- 模型：env `CHAT_MODEL`（换档立即生效于新会话，进行中的不动）
- 观察入口：后台 stats（会话数 / 提 JD 数 / 匹配分布 / 近 7 日曲线）＋ `docker logs` 每会话轮次

### 已知约束

- **claude 进程每会话常驻**：重启/重建 chat 容器会杀掉全部进行中会话（访客端收到 `session_end`）——发布挑低峰期
- 限流计数在内存，容器重启即清零（有利有弊：误伤自愈，但刷子可靠重启窗口重置）
- `chat_*` 三张表在共享 db 但**不进 Prisma schema**：改表只动 `chat/src/schema.sql`（幂等），不要去 server 侧建迁移
