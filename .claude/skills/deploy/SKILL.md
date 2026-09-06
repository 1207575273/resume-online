---
name: deploy
description: codeyang-resume-online 项目的部署与发布操作手册。当用户要求部署/上线/发布简历新版本/回滚内容/签发 HTTPS 证书/验证服务健康时使用。包含标准化脚本（发布、验证、回滚）与排错手册。
---

# 部署技能（codeyang-resume-online）

本项目是容器化部署：`db / server / web / nginx` 四服务（`deploy/compose.yaml`），
内容发布走「简历版本管理 API」。**所有操作先看本文件，脚本在 `scripts/`，排错在 `references/runbook.md`。**

## 环境事实（先记住这些）

- 公网入口：`http://8.218.79.152`（nginx 80，宿主机为香港服务器）
- 写接口只在容器内网可达（nginx 对非 GET 返回 403），需 `x-internal-token`（值在根目录 `.env`）
- 内容发布 = 新建版本 + 发布指针移动；**archived 版本不可复活，回滚 = 以旧内容派生新版本**（领域规则）
- web 的 fetch 数据缓存 5 分钟且落在容器可写层磁盘：**内容更新后必须 `--force-recreate web`**，`restart` 无效
- shell 默认 Node 是 v20，pnpm 11 需要 v22：**先 `nvm use 22`**

## 操作决策树

脚本一律 JS（`.mjs`，Node 22 原生 fetch，跨平台零依赖），用 `node` 执行：

| 用户意图 | 做法 |
|---|---|
| 部署/更新整栈（代码改动后） | `./deploy/deploy.sh local`（内部即 `docker compose up -d --build`） |
| 发布简历新版本（内容 JSON 已备好） | `node .claude/skills/deploy/scripts/release.mjs <content.json>` |
| 回滚简历内容到某历史版本 | `node .claude/skills/deploy/scripts/rollback.mjs [版本号]`（不带参数=列出全部版本） |
| 验证线上健康 | `node .claude/skills/deploy/scripts/verify.mjs` |
| 上 HTTPS（已有域名） | `./script/setup-https.sh` → `./deploy/deploy.sh prod`（详见 runbook） |
| 跑 e2e 验收 | `cd e2e && E2E_BASE_URL=http://8.218.79.152 E2E_API_BASE=http://8.218.79.152 pnpm test` |

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

**任何部署异常先查三处**：`docker compose --env-file .env -f deploy/compose.yaml ps`、`docker logs codeyang-resume-server-1 --tail 50`、`docker logs codeyang-resume-web-1 --tail 50`。
常见坑（PG18 挂载路径、standalone 子目录、日志目录权限等）全部收录在 `references/runbook.md` 的「已知坑速查表」。
