# 构建上下文必须是仓库根（需要 pnpm-lock.yaml）：docker build -f server/Dockerfile .

# ---------- 基础层 ----------
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---------- 依赖层（锁文件不变即命中缓存） ----------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile --filter @resume/server...

# ---------- 构建层：生成 Prisma client 并构建 standalone 产物 ----------
FROM deps AS build
COPY server/ server/
RUN pnpm --filter @resume/server exec prisma generate \
 && pnpm --filter @resume/server run build

# ---------- 运行层：standalone 产物 + 全局 prisma CLI（迁移用） ----------
FROM node:22-alpine AS runner
RUN corepack enable \
 && npm install -g prisma@7.10.0 \
 && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# monorepo 布局：standalone 产物在 server/ 子目录
COPY --from=build --chown=app:app /repo/server/.next/standalone ./
COPY --from=build --chown=app:app /repo/server/.next/static ./server/.next/static

# 迁移需要 schema / migrations / 配置（standalone 不包含）
COPY --from=build --chown=app:app /repo/server/prisma ./prisma
COPY --from=build --chown=app:app /repo/server/prisma.config.ts ./prisma.config.ts

# prisma.config.ts 的 `import 'prisma/config'` 从 /app/node_modules 解析：
# 把全局安装的 CLI 软链进应用 node_modules
RUN ln -sf /usr/local/lib/node_modules/prisma /app/node_modules/prisma

USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/v1/health || exit 1

# 先迁移后启动
CMD ["sh", "-c", "prisma migrate deploy && node server/server.js"]
