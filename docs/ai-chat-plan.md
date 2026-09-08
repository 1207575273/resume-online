# AI 简历问答（resume-chat）架构方案 v1

> 目标：访客在简历页与 AI 对话（典型问题："这个人符合我的 JD 吗"），底层每会话一个常驻 PTY
> 跑 `claude -p`（stream-json 双向流），AskUser 协议实现人在环，全量会话入库，
> 站长在管理后台分析"谁在问、问什么、匹配结论"，为后续面试提供针对性情报。

## 1. 总拓扑

```
浏览器（简历页右下角聊天窗）
   │  WSS  /chat/ws/:sessionId        HTTPS /chat/api/*（建会话）
   ▼
nginx（新增 location /chat/ → chat:3210，含 WS upgrade）
   ▼
chat 服务（新 workspace 包 @resume/chat，Node 22 ESM，零框架）
   ├── ws-gateway    每连接 ↔ 一个会话
   ├── pty-bridge    每会话一个 node-pty 常驻进程：
   │                 claude -p --input-format stream-json --output-format stream-json --verbose
   ├── protocol      stream-json 组帧/解析 + ASK_USER_JSON / LEAD_JSON 正则提取
   ├── prompt        系统提示词 + 简历内容注入（HTTP 拉现有 server API，缓存 5min）
   ├── db            PostgreSQL（chat_sessions / chat_messages / chat_leads）
   ├── security      origin 校验、每 IP 限流、会话时长/轮次上限、禁用工具
   └── admin         管理界面（chat 服务自托管单页，令牌鉴权）
```

## 2. 目录与文件归属（10 个 agent 的"地盘"，严禁越界改他人文件）

```
chat/                          ← A1 骨架/HTTP/WS、A2 PTY 桥、A3 数据层、A6 提示词、A8 安全、A5 admin
  package.json                 ← 已由主控建好（依赖锁定，agent 不改）
  src/server.mjs               ← A1 入口
  src/config.mjs               ← A1
  src/http-api.mjs             ← A1（REST）
  src/ws-gateway.mjs           ← A1（WS 会话管理）
  src/pty-bridge.mjs           ← A2（PTY + claude 进程生命周期）
  src/claude-protocol.mjs      ← A2（流解析 + 正则提取）
  src/prompt.mjs               ← A6（提示词 + 协议文案）
  src/resume-context.mjs       ← A6（拉简历 + 缓存）
  src/db.mjs                   ← A3（pg 客户端 + 读写）
  src/schema.sql               ← A3（建表，幂等）
  src/lead-extract.mjs         ← A3（LEAD_JSON 解析入库）
  src/security.mjs             ← A8（限流/校验/上限 中间件）
  src/admin/index.html         ← A5（管理界面单页）
  src/admin/app.mjs            ← A5
  src/admin/admin-api.md       ← A5（约定 A1 实现的 admin REST 契约）
  Dockerfile                   ← A7
  test/mock-claude.mjs         ← A9（脚本化假 claude）
  test/run-tests.mjs           ← A9（自测脚本：用 mock claude 全链路跑通）
web/components/chat/
  chat-widget.tsx              ← A4（浮动按钮 + 聊天窗）
  use-chat-session.ts          ← A4（WS 客户端 + 状态机）
deploy/compose.yaml            ← A7 只追加 chat 服务块
deploy/compose.prod.yaml       ← A7 追加（如需）
deploy/nginx/nginx.conf|runtime ← A7 只追加 /chat/ location（改 prod 模板）
.claude/skills/deploy/SKILL.md ← A10 追加 chat 运维段落
docs/ai-chat-plan.md           ← 本文档（A10 可追加"落地记录"）
```

## 3. 核心协议（所有 agent 必须遵守的合同）

### 3.1 与 claude -p 的桥（A2）

启动参数（每会话）：
```
claude -p \
  --input-format stream-json --output-format stream-json --verbose \
  --max-turns 24 \
  --model "$CHAT_MODEL"(默认 sonnet)
  --disallowed-tools --bash --edit --write   (尽最大可能禁工具；再加环境只读)
```
- 初始注入：首条 user message = `resume-context + 系统指令`（由 prompt.mjs 生成，见 3.3）。
- 后续输入：向 PTY stdin 写一行 JSON：`{"type":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]}}\n`
- 输出解析：逐行 JSON.parse；关注 `stream_event`（增量 delta，`event.delta` 文本）与 `result`（终帧）。
- PTY 必须常驻到会话结束（复用上下文，省 token）；会话结束 kill 进程组。

### 3.2 人在环：ASK_USER 协议（对 Claude Code AskUserQuestion 的致敬式复刻）

模型被系统提示词约束：**凡是需要访客补充信息（最典型：粘贴 JD 原文），不得自说自话，必须输出一行**：

```
ASK_USER_JSON {"question":"方便把 JD 原文贴给我吗？","options":["我贴 JD 原文","先按岗位名粗略评估"],"allowCustom":true}
```

- A2 用正则从 assistant 文本流里捞出（对跨 chunk 的行要缓冲拼接）：
  `/^\s*ASK_USER_JSON\s*(\{.*\})\s*$/m`
- 命中后：①该行**不下发**给前端（避免访客看到裸 JSON）；②WS 下发 ask_user 帧；③暂停该轮 relay，等访客回答。
- 访客回答 → 作为新 user turn 写入 PTY stdin → 对话继续。
- 超时（120s）未答：下发 `{"type":"ask_user_timeout"}`，会话回到普通输入态。

### 3.3 线索协议：LEAD_JSON（收集的核心）

系统提示词要求：每当一轮完成"JD 匹配评估"，assistant 在结论后追加一行：
```
LEAD_JSON {"jd_title":"AI 应用工程师","match":"high|mid|low","summary":"一句话结论","concerns":["关注点1"],"jd_digest":"JD 要点摘要"}
```
A3 用 `/^\s*LEAD_JSON\s*(\{.*\})\s*$/m` 提取（容错：JSON5 风格尾逗号允许）→ 写 chat_leads。
提取失败不阻塞对话，只记日志。

### 3.4 浏览器 ↔ chat 服务 WS 协议（A1/A4 共同遵守）

client→server：
```json
{"type":"user_message","text":"..."}
{"type":"ask_answer","answer":"...","option":"我贴 JD 原文"}
{"type":"ping"}
```
server→client：
```json
{"type":"session_ready","sessionId":"..."}
{"type":"assistant_delta","text":"增量文本"}
{"type":"assistant_done","text":"完整文本"}
{"type":"ask_user","question":"...","options":["..."],"allowCustom":true}
{"type":"ask_user_timeout"}
{"type":"session_end","reason":"idle_timeout|max_turns|server"}
{"type":"error","message":"..."}
```

### 3.5 REST（A1）

- `POST /chat/api/sessions` → `{sessionId}`（创建 + 落库；带上前端可选的 referrer/utm）
- `GET  /chat/api/health` → `{status:"ok"}`
- Admin（`src/admin/admin-api.md` 为准，A1 实现、A5 消费；鉴权：`x-admin-token` 头 == env CHAT_ADMIN_TOKEN）：
  - `GET /chat/api/admin/sessions?limit&offset&q&has_lead`
  - `GET /chat/api/admin/sessions/:id`（含全部消息）
  - `GET /chat/api/admin/leads`
  - `GET /chat/api/admin/stats`（会话数/提 JD 数/匹配分布/近 7 日曲线）
  - `GET /chat/api/admin/export`（JSONL 下载）

## 4. 数据模型（A3，schema.sql 幂等建表）

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  status text DEFAULT 'active',          -- active|ended
  ip text, user_agent text, referrer text,
  turn_count int DEFAULT 0,
  end_reason text
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id bigserial PRIMARY KEY,
  session_id uuid REFERENCES chat_sessions(id),
  created_at timestamptz DEFAULT now(),
  role text,                             -- user|assistant|ask_user|ask_answer|system
  content text,
  raw jsonb
);
CREATE TABLE IF NOT EXISTS chat_leads (
  id bigserial PRIMARY KEY,
  session_id uuid REFERENCES chat_sessions(id),
  created_at timestamptz DEFAULT now(),
  jd_title text, match_level text,       -- high|mid|low
  summary text, concerns jsonb, jd_digest text
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_leads_created ON chat_leads(created_at DESC);
```
复用现有 PostgreSQL（compose 的 db 服务），chat 用独立的 pg 连接（不进 Prisma）。

## 5. 安全与成本护栏（A8，必须先于上线）

1. WS/REST origin 白名单（SITE_URL + localhost 开发）
2. 每 IP：≤3 新会话/小时、≤20 会话/天（内存计数即可）
3. 会话上限：空闲 20min 断开、累计 ≤40 轮、单轮 assistant 输出 ≤8k 字符截断
4. claude 进程：无 allowed 工具（禁 Bash/Edit/Write 等），容器内非 root 运行
5. 输入长度 ≤4000 字符/条；全链路脱敏日志（ip 打码）
6. admin 一切接口走 `x-admin-token`；nginx 侧 `/chat/api/admin/` 仅内网（公网 404，与现有写接口同款纵深防御）
7. 免责声明：聊天窗固定脚注"AI 助手基于公开简历内容回答，可能与本人观点不同"

## 6. 配置（env，chat/src/config.mjs）

```
CHAT_PORT=3210
DATABASE_URL=postgresql://...（compose 注入 db:5432）
RESUME_API_BASE=http://server:3001/api/v1
ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY  ← claude CLI 鉴权（复用现有 provider 配置）
CHAT_MODEL=sonnet            （可换 glm 等，取决于 provider）
CHAT_ADMIN_TOKEN=...         （gen-env.sh 生成）
CHAT_MAX_TURNS=40, CHAT_IDLE_MS=1200000, CHAT_RATE_* ...
```

## 7. 前端（A4，web/components/chat/）

- `chat-widget.tsx`：右下角浮动按钮（文案"问 AI · 我符合这个 JD 吗？"）→ 展开聊天窗（移动端全宽抽屉）；深浅双主题用现有 CSS 变量；`prefers-reduced-motion` 关动画；懒加载（IntersectionObserver 出现或点击才加载 WS 逻辑）。
- `use-chat-session.ts`：建会话 → WS → 状态机（idle/user→assistant 流式/ask_user 待答/error/end）；断线自动重连一次；ask_user 渲染选项按钮 + allowCustom 时附输入框。
- 在 web 首页挂载（仅一行改动，A4 负责 page.tsx 或 layout.tsx 的挂载点，避免与他人冲突：挂在 layout.tsx `<SiteFooter/>` 之后）。

## 8. 部署（A7）

- Dockerfile：node:22-alpine + claude CLI（npm i -g @anthropic-ai/claude-code）+ node-pty 构建依赖（python3/make/g++），非 root。
- compose：服务 chat（build network: host 注释同现有）、环境变量、depends_on db、健康检查 /chat/api/health、resume.* labels。
- nginx：`location /chat/ { proxy_pass http://chat:3210; }` 含 `proxy_http_version 1.1; Upgrade/Connection` 头；admin 路径公网 404。
- 注意：pdf 容器构建失败的教训——镜像构建统一 `--network=host`。

## 9. 测试（A9）

- `mock-claude.mjs`：可执行假 claude（shebang 脚本），stdin 读 stream-json，按脚本回放 assistant delta + ASK_USER_JSON + LEAD_JSON 帧，用于无 API key 的全链路测试。
- `run-tests.mjs`：起 mock chat 服务（CHAT_CLAUDE_CMD=./test/mock-claude.mjs 覆盖启动命令——config 必须支持此覆盖）→ 走一遍：建会话 → 发消息 → 收 delta → ask_user → 回答 → LEAD 落库 → admin API 读取断言。
- web 侧不新增 e2e（避免与现有 8 用例冲突），手动验收清单写在落地记录。

## 10. 里程碑

M1 骨架+协议跑通（A1/A2/A6/A9 mock）→ M2 持久化+安全（A3/A8）→ M3 前端挂载（A4）→ M4 管理后台（A5）→ M5 容器化上线（A7）→ M6 文档收尾（A10）。
主控（本会话）负责：契约制定、冲突裁决、最终集成构建/部署/验收。

## 11. 落地记录

> 本节由 A10 收尾时追加。各 agent 并行交付、地盘互不越界，实际集成结果以主控最终验收为准。

### 11.1 交付清单（A1–A10）

| Agent | 负责范围 | 交付文件 | 状态 |
|---|---|---|---|
| A1 | 骨架/HTTP/WS | server/config/http-api/ws-gateway | ✅ 已交付并上线 |
| A2 | PTY 桥→stdio 桥 | pty-bridge/claude-protocol | ✅ 已交付（集成期重写为 stdio，见下） |
| A3 | 数据层 | schema.sql/db/lead-extract（28 项自测过） | ✅ 已交付并上线 |
| A4 | 前端聊天窗 | chat-widget/use-chat-session + layout 挂载 | ✅ 已交付并上线 |
| A5 | 管理后台 | src/admin/{index.html,app.mjs}（4 轮冒烟过） | ✅ 已交付并上线 |
| A6 | 提示词 | prompt/resume-context | ✅ 已交付（集成期补"立即行动"强约束） |
| A7 | 部署物 | Dockerfile/compose/nginx 三处/gen-env | ✅ 已交付（WORKDIR 坑由主控修复） |
| A8 | 安全护栏 | security.mjs（80 项自测过） | ✅ 已交付并上线 |
| A9 | 测试 | mock-claude/run-tests | ✅ 9/9 全过（12KB 真实开场） |
| A10 | 文档 | README/SKILL/落地记录 | ✅ 已交付 |

### 集成期关键修复（主控，2026-09-07）

1. **PTY→stdio 架构切换**：真机发现 claude CLI 在「stdin 是 TTY」时启动即报 no-input 退出（PTY 缓冲数据读不到，与 canonical/raw、注入时机无关）；stdio 管道多轮常驻验证通过后全面切换，附带解决 4096 字节行限制与 stderr 捕获两个问题。
2. **result 兜底协议提取**：glm provider 不吐 stream_event 增量、只有终帧——协议行提取（ASK_USER/LEAD）在 result 文本上再跑一遍并去重，前端不再漏裸 JSON。
3. **ask_user 落库**：网关 onAskUser 补 appendMessage（全量收集语义补全）。
4. **admin REST 蛇形序列化 + db 补 total/详情 leads**：抹平 A3 驼峰与 A5 下划线的契约漂移。
5. **chat/Dockerfile runner 阶段缺 WORKDIR /repo**：COPY 全落到 / 根导致容器起不来。
6. **nginx 单文件 bind mount 的 inode 陷阱**：重写 runtime/default.conf 产生新 inode，容器锁旧文件——改 conf 后必须 `--force-recreate nginx`，只 reload 无效。

### 线上验收（2026-09-07）

- `GET /chat/api/health` → ok；`/chat/api/admin/*` 公网 404（内网可用）
- 真会话端到端（走 CF→nginx→chat 容器→claude CLI→glm-5.3）：ask_user 触发、JD 贴入、逐条匹配表格输出、LEAD 自动入库 ✓
- mock 全链路测试 9/9；verify.mjs 5/5
| A10 | 文档与运维收尾 | 本节、`README.md`「AI 问答」小节、`.claude/skills/deploy/SKILL.md`「resume-chat 运维」 | 并行交付中，由主控集成时回填 |

### 11.2 手动验收清单（上线后过一遍；web 侧刻意不加 e2e，见第 9 节）

线上地址 `https://resume.nodetime.top`；管理后台仅内网（公网 nginx 404），访问方式见 SKILL.md「resume-chat 运维」。逐条通过才视为 M5 完成：

1. **浮动按钮出现**：首页右下角「问 AI · 我符合这个 JD 吗？」，深/浅主题各看一眼，聊天窗脚注免责声明可见
2. **点开建会话**：展开聊天窗无报错，网络面板 `POST /chat/api/sessions` → 200 拿到 `sessionId`
3. **流式回复**：发一句「你好」，回复逐字流式渲染，收尾完整成段不截断
4. **ASK_USER 按钮渲染与回答**：说「我有个 JD 想让你评估」→ 弹出选项按钮（含自定义输入框）；点选或自填后对话继续，访客全程看不到裸 JSON
5. **LEAD 落库**：贴一段真实 JD → 评估完成后 `chat_leads` 出现新行（`jd_title` / `match_level` / `summary` / `concerns` 齐全）
6. **admin 登录**：内网打开 `/chat/admin/`，用 `CHAT_ADMIN_TOKEN` 能进，公网直访 → 404
7. **会话详情**：后台点开刚才的会话，逐轮消息完整（含 `ask_user` / `ask_answer` 角色）
8. **线索筛选**：列表 `has_lead` 与关键词筛选生效，stats 数字与库内一致
9. **导出**：`GET /chat/api/admin/export` 下载 JSONL，行数与 `chat_leads` 一致
10. **限流生效**：同 IP 短时间连开 4 个会话，第 4 个被拒（错误帧/拒绝响应），页面上有明确提示
