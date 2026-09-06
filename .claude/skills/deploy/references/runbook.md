# 运维手册（Runbook）

## 架构事实

```
公网 :80 → nginx → web 容器（Next 16 standalone，SSR）
              ↘ server 容器（Next 16 API + 轻量 DDD + Prisma 7）→ db 容器（PG 18）
```

- compose 工程名 `codeyang-resume`；只有 nginx 发布宿主机端口；db 仅 `127.0.0.1:5432`
- server 容器启动命令：`prisma migrate deploy && node server/server.js`（迁移先行）
- 日志：`docker logs`（JSONL）；宿主机 `logs/server/server-YYYY-MM-DD.log`（人类可读，保留 14 天）
- 所有 compose 服务带 `resume.*` 中文 label（Portainer 可辨）

## 部署模式

| 模式 | 命令 | 场景 |
|---|---|---|
| 本地/HTTP | `./deploy/deploy.sh local` | 开发、内网演示、当前公网裸 HTTP 形态 |
| 生产/HTTPS | `./script/setup-https.sh`（一次性）→ `./deploy/deploy.sh prod` | 域名 DNS 已指向本机后 |

## HTTPS 首次开通（前置：域名 A 记录 → 8.218.79.152）

1. `.env` 填 `DOMAIN=你的域名`、`ACME_EMAIL=邮箱`
2. `./script/setup-https.sh` —— standalone 模式签发（自动停 nginx 腾 80 端口）→ 渲染 `deploy/nginx/runtime/default.conf`
3. `./deploy/deploy.sh prod` —— 443 + certbot 容器（12h 续期循环，nginx 6h reload）
4. 续期无需人工干预；证书在 named volume `codeyang-resume_certbot-conf`

## 内容发布 / 回滚

见上级 SKILL.md。要点（脚本全部 JS 化，`node xxx.mjs` 直接跑，跨平台）：

- 发布：`node scripts/release.mjs <content.json>`（建版本 → 发布 → 强刷 web → 验证）
- 回滚：`node scripts/rollback.mjs <N>`（archived 版本不可复活，脚本以旧内容派生新版本发布）
- web 数据缓存 5 分钟（fetch revalidate=300）且**落在容器可写层磁盘**——`docker compose restart web` 清不掉，必须 `--force-recreate`

## Playwright 验收

```bash
source ~/.nvm/nvm.sh && nvm use 22
cd e2e
E2E_BASE_URL=http://8.218.79.152 E2E_API_BASE=http://8.218.79.152 pnpm test
# 截图产物: e2e/screenshots/；报告: pnpm report
```

注意 `E2E_API_BASE` 传**不带路径**的主机名（测试代码自己拼 `/api/v1`）。

## 已知坑速查表（全部踩过，血泪）

| 症状 | 根因 | 解法 |
|---|---|---|
| db 容器重启循环 + "18+ directory names" | PG18 镜像不再支持挂 `/var/lib/postgresql/data` | 卷挂 `/var/lib/postgresql` |
| web 容器 MODULE_NOT_FOUND: server.js | monorepo 下 standalone 产物在 `web/server.js` 子目录 | `node web/server.js`；静态资源 COPY 到 `web/.next/static` |
| server 起不来: Cannot find module 'prisma/config' | 全局 prisma 不在应用 node_modules 解析路径 | Dockerfile 里 `ln -s /usr/local/lib/node_modules/prisma /app/node_modules/prisma` |
| prisma.config.ts 加载失败（找不到 ./src/...） | 运行镜像没有应用源码 | prisma.config.ts 自包含（内联 dotenv，不 import src） |
| 文件日志没写 + ERR_STREAM_DESTROYED | 宿主机日志目录是 root 属主，容器 app(uid 100) 写不进 | `sudo chown admin:admin logs && chmod -R 0777 logs` |
| 内容更新后页面还是旧的 | fetch 缓存在容器可写层磁盘，restart 不清 | `up -d --force-recreate web` |
| pnpm 报 ERR_UNKNOWN_BUILTIN_MODULE node:sqlite | shell 默认 Node v20，pnpm 11 需 ≥22 | `nvm use 22` |
| e2e API 用例全挂 | `E2E_API_BASE` 传了带 `/api/v1` 的地址被二次拼接 | 只传主机名 |
| 迁移 P1000 认证失败 | .env 加载路径算错回落默认密码 | 服务器端 env 加载器找 `../.env`（cwd=server） |

## 密钥与安全

- `.env`（600 权限）：`POSTGRES_PASSWORD` / `INTERNAL_API_TOKEN`（写接口令牌）/ `DOMAIN` / `ACME_EMAIL`
- 公网暴露面：仅 GET 读接口 + 首页；写操作双保险（nginx 403 + token 401）
- 如需撤销泄露的 token：改 `.env` 的 `INTERNAL_API_TOKEN` → `docker compose up -d --force-recreate server`
