# 构建上下文必须是仓库根（需要 pnpm-lock.yaml）：docker build -f chat/Dockerfile .

# ---------- 基础层 ----------
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---------- 依赖层（锁文件不变即命中缓存） ----------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY chat/package.json chat/package.json
# cache mount：pnpm store 常驻构建缓存卷，网络劣化时重试可增量续传
# --trust-lockfile：跳过供应链在线验证（同 web/Dockerfile 注释）
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --filter @resume/chat...

# ---------- 运行层：workspace 依赖 + 源码 + 全局 claude CLI ----------
FROM node:22-alpine AS runner
# 关键：runner 是全新 stage（WORKDIR 默认 /），必须显式回到 /repo，
# 否则下方 COPY ./chat/src 会落到 /chat/src，WORKDIR /repo/chat 只剩空目录
WORKDIR /repo
# claude CLI：stdio 会话里跑 `claude -p --input-format stream-json ...`
# HOME 显式可写，CLI 与子进程要落 ~/.claude 配置；runner 只用 node + npm 全局 CLI
RUN npm install -g @anthropic-ai/claude-code@latest \
 && addgroup -S app && adduser -S app -G app -h /home/app
ENV NODE_ENV=production \
    CHAT_PORT=3210

# pnpm workspace 布局：真实包在根 node_modules/.pnpm，chat/node_modules 只是软链，
# 须保留 /repo 整棵树，再补上源码（不带宿主 node_modules/test，镜像干净）
COPY --from=deps --chown=app:app /repo ./
COPY --chown=app:app chat/src ./chat/src

USER app
WORKDIR /repo/chat
EXPOSE 3210
# alpine 无 curl；node 22 内置 fetch 即可（服务自带 /chat/api/health）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3210/chat/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "src/server.mjs"]
