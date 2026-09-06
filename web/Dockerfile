# 构建上下文必须是仓库根：docker build -f web/Dockerfile .

# ---------- 基础层 ----------
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---------- 依赖层 ----------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile --filter @resume/web...

# ---------- 构建层 ----------
FROM deps AS build
ARG SITE_URL=http://localhost
ENV NEXT_TELEMETRY_DISABLED=1 \
    SITE_URL=$SITE_URL
COPY web/ web/
RUN pnpm --filter @resume/web run build

# ---------- 运行层：standalone 产物 ----------
FROM node:22-alpine AS runner
RUN addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=build --chown=app:app /repo/web/.next/standalone ./
# monorepo 布局：standalone 产物在 web/ 子目录，静态资源须对应放到 web/.next/static
COPY --from=build --chown=app:app /repo/web/.next/static ./web/.next/static

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "web/server.js"]
