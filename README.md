# codeyang-resume-online

CodeYang 的在线简历：**Next.js 全栈 monorepo**（pnpm workspace），前后端分为两个应用、独立容器部署，PostgreSQL 存储，Nginx 边缘反代 + HTTPS。

## 架构拓扑

```
                      ┌─────────────────────────────────────┐
  Internet ──80/443──▶│ nginx（唯一对外入口，TLS 终结）        │
                      └─────┬────────────────────┬──────────┘
                            │ /api/v1/*          │ 其余路径
                            ▼                    ▼
                    ┌──────────────┐     ┌──────────────┐
                    │ server:3001  │     │  web:3000    │
                    │ Next.js 16   │     │ Next.js 16   │
                    │ 纯 API 服务  │     │ 前端站点(SSR) │
                    │ + 轻量 DDD   │     └──────────────┘
                    └──────┬───────┘
                           │ Prisma 7 (adapter-pg)
                           ▼
                    ┌──────────────┐
                    │ db: PostgreSQL 18 │──▶ pgdata 卷（仅内网）
                    └──────────────┘
```

## 技术栈

| 层 | 技术 | 版本锚点 |
|---|---|---|
| 包管理 | pnpm workspace | 11.x（根 `packageManager` 钉住） |
| 前端 | Next.js App Router + React | 16.3.x / 19.x |
| UI | shadcn/ui 形态组件 + Tailwind CSS（CSS-first） + tw-animate-css | Tailwind 4.x |
| 后端 | Next.js Route Handlers（纯 API 模式） | 16.3.x |
| ORM | Prisma（driver adapter `@prisma/adapter-pg`，无引擎二进制） | **钉 7.10.x，8.x 为 RC 不用** |
| 数据库 | PostgreSQL | 18-alpine |
| 运行时 | Node.js LTS | 22（与容器镜像一致） |
| 部署 | Docker Compose（容器即进程管理，**无 PM2**） | compose v2 |

## 目录结构（一级目录刻意克制：只有 4 个）

```
codeyang-resume-online/
├── server/                  # 后端：Next.js 纯 API 服务（轻量 DDD 分层）
│   ├── app/api/v1/          #   interfaces 层：路由处理器（薄壳）
│   ├── src/domain/          #   领域层：实体 / 值对象 / 仓储端口（零框架依赖）
│   ├── src/application/     #   应用层：用例（每件事一个类）
│   ├── src/infrastructure/  #   基础设施层：Prisma 仓储实现 / 配置
│   ├── src/composition.ts   #   组合根：唯一装配依赖的地方
│   └── prisma/              #   schema / 迁移 / 种子数据
├── web/                     # 前端：Next.js 站点（SSR + SEO）
│   ├── app/                 #   路由、布局、sitemap/robots
│   ├── components/ui/       #   shadcn/ui 形态基础组件
│   ├── components/resume/   #   简历业务组件
│   └── lib/                 #   API client / 类型契约镜像 / 工具
├── script/                  # 常用脚本
│   ├── dev.mjs              #   一键本地开发（起 db → 迁移 → 并行 dev）
│   ├── gen-env.sh           #   生成 .env 与随机令牌
│   └── setup-https.sh       #   首次签发/续期 Let's Encrypt 证书
├── e2e/                     # Playwright 验收测试与截图
│   ├── playwright.config.ts
│   └── tests/               #   页面渲染/主题切换/SEO/接口/安全用例
├── deploy/                  # 部署物
│   ├── compose.yaml         #   本地全栈（db + server + web + nginx）
│   ├── compose.prod.yaml    #   生产差异层（443 + certbot 自动续期）
│   ├── nginx/               #   dev / prod 两份 nginx 配置
│   └── deploy.sh            #   构建并拉起
├── pnpm-workspace.yaml
└── package.json             # 根：只有 workspace 编排脚本
```

## 后端分层约束（轻量 DDD）

**四层，依赖方向严格单向**：`interfaces → application → domain ← infrastructure(实现)`

| 层 | 位置 | 职责 | 硬约束 |
|---|---|---|---|
| interfaces | `server/app/api/**` + `src/interfaces/` | HTTP 适配：解析请求、调用例、错误→状态码 | 不写业务判断 |
| application | `src/application/` | 用例编排：一个类一件事 | 只依赖 domain |
| domain | `src/domain/` | 实体（状态迁移规则）、值对象（内容契约）、仓储端口 | **禁止 import next/prisma/nest 等任何框架** |
| infrastructure | `src/infrastructure/` | Prisma 仓储实现、配置（唯一读 env 处） | 只实现 domain 端口 |

刻意**不做**的事：CQRS、聚合根、事件总线、DTO 映射库——项目体量配不上这些复杂度。

### 简历版本管理模型

- `ResumeVersion`：**不可变内容快照**，一版一行；改简历 = 新建版本（可基于当前发布版派生）
- 状态机：`draft → published → archived`（不可逆；归档版不能复活）
- `Resume.publishedVersionId`：发布指针，指向对外版本；发布新版本时旧版本自动归档（一致性由 `Resume.publishVersion()` 保证）
- 写操作（建版本/发布）需请求头 `x-internal-token`；生产环境 nginx 只把读接口暴露公网（纵深防御）

## API 一览（前缀 `/api/v1`）

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| GET | `/health` | 存活探针（compose healthcheck 用） | 公开 |
| GET | `/resume/:slug` | 当前发布版本内容 | 公开 |
| GET | `/resume/:slug/versions` | 版本列表（仅元信息） | 公开 |
| POST | `/resume/:slug/versions` | 新建草稿版本 `{content?, label?, note?}` | 内部令牌 |
| POST | `/resume/:slug/versions/:versionId/publish` | 发布指定版本 | 内部令牌 |
| GET | `/openapi.json` | OpenAPI 3.1 描述 | 公开 |

## 常用命令

```bash
pnpm install                # 安装全部依赖
pnpm dev                    # 一键本地开发（PG 容器 + 迁移 + 双应用 dev）
pnpm build                  # 构建全部（server + web）
pnpm db:migrate             # 开发迁移（生成迁移文件）
pnpm db:seed                # 写入示例简历数据
./deploy/deploy.sh local    # 本地全栈容器化起服（HTTP）
./deploy/deploy.sh prod     # 生产部署（HTTPS，需先配好 DNS 与 .env）
./script/setup-https.sh     # 首次签发证书（deploy:prod 前执行一次）
```

## 环境变量

复制 `.env.example` → `.env`，或直接 `./script/gen-env.sh` 自动生成随机令牌。要点：

- `DATABASE_URL`：本地 `localhost:5432`，容器内 `db:5432`（compose 注入，不共用一份）
- `INTERNAL_API_TOKEN`：写接口令牌，生产必填
- `RESUME_API_BASE`：web 服务端取数地址（容器内 `http://server:3001/api/v1`）
- `DOMAIN` / `ACME_EMAIL`：仅生产 HTTPS 用

## 部署说明

- **无 PM2**：每个容器就是进程（`restart: unless-stopped`，dockerd 托管重启）
- 仅 nginx 映射宿主机端口（80/443）；db/server/web 只在 compose 内网
- server 容器启动时先 `prisma migrate deploy` 再起服务
- 证书：certbot 容器 webroot 模式 + 循环续期，nginx 定期 reload
- 所有 compose 服务带 `resume.*` label（含中文名称），Portainer / 运维界面一眼区分

## 日志（server）

- **控制台：JSONL**（pino 原生输出，`docker logs` 即结构化日志）
- **文件：人类可读**（pino-pretty 格式），按天轮转 `logs/server-YYYY-MM-DD.log`，**保留 14 天**自动清理
- 容器内文件日志挂载到宿主机 `logs/server/`；相关变量：`LOG_LEVEL` / `LOG_DIR` / `LOG_RETENTION_DAYS`（`LOG_FILE=false` 可关闭文件日志）
- 刻意不用 pino transport（worker 线程）：Next standalone 打包下不可靠，轮转为自实现的 40 行按天切换流

## AI 问答（resume-chat）

workspace 新增的第 3 个应用包 `chat/`（一级目录只多这一个）：让访客在简历页右下角直接问 AI「这个人符合我的 JD 吗」，每会话一个常驻 PTY 跑 `claude -p`（stream-json 双向流，AskUser 协议人在环），全部会话与线索落库，站长在管理后台分析「谁在问、问什么、匹配结论」。完整方案与协议见 `docs/ai-chat-plan.md`。

```
浏览器（简历页右下角聊天窗）
   │  WSS /chat/ws/:sessionId ＋ HTTPS /chat/api/*
   ▼
nginx ──/chat/──▶ chat:3210（@resume/chat，Node 22 ESM，零框架）
                    │  每会话一个 node-pty 常驻进程
                    ▼
                claude -p（stream-json 双向流，工具全禁）
                    │  会话 / 消息 / 线索
                    ▼
                db: PostgreSQL（复用现有实例，chat_* 三张表，不进 Prisma）
```

配置（`chat/src/config.mjs` 读 env，生产由 compose 注入）：

| 变量 | 说明 |
|---|---|
| `CHAT_MODEL` | 传给 claude CLI 的模型，默认 `sonnet` |
| `CHAT_ADMIN_TOKEN` | 管理后台令牌（`gen-env.sh` 生成；后台接口走 `x-admin-token` 头） |
| `CHAT_MAX_TURNS` / `CHAT_IDLE_MS` / `CHAT_RATE_*` | 会话轮次 / 空闲断开 / 每 IP 限流上限（成本护栏） |
| `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` | claude CLI 鉴权（复用现有 provider 配置，缺了会话起不来） |
| `DATABASE_URL` / `RESUME_API_BASE` | 数据库连接与简历内容 API（容器内 `http://server:3001/api/v1`） |

本地开发三步（Node 22，先 `nvm use 22`）：

```bash
pnpm install                       # 1. 根 workspace 一把装全
pnpm dev                           # 2. 起依赖：db 容器 + 迁移 + server/web 双 dev
pnpm --filter @resume/chat dev     # 3. 起 chat（:3210，--watch 热重启）
```

无 API key 也能全链路自测：`CHAT_CLAUDE_CMD=./test/mock-claude.mjs pnpm --filter @resume/chat test`（脚本化假 claude 回放，不花 token）。
