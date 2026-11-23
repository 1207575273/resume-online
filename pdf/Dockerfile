# PDF 导出服务:node:22-alpine + 系统 Chromium + 中文字体
# HK 机器直连官方 CDN 速度最优;font-noto-sc 已并入 font-noto-cjk(新版 Alpine 无此包)
FROM node:22-alpine

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto-cjk

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --registry=https://registry.npmmirror.com
COPY server.mjs ./

EXPOSE 3002
CMD ["node", "server.mjs"]
