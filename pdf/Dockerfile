# PDF 导出服务：node:22-alpine + 系统 Chromium + 中文字体
# 慢网络加速：apk 用阿里云镜像、npm 用 npmmirror
FROM node:22-alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
 && apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
 && apk add --no-cache font-noto-cjk font-noto-sc

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --registry=https://registry.npmmirror.com
COPY server.mjs ./

EXPOSE 3002
CMD ["node", "server.mjs"]
