#!/usr/bin/env bash
# 首次签发 Let's Encrypt 证书 + 渲染生产 nginx 配置
# 前置：
#   1. .env 中 DOMAIN / ACME_EMAIL 已配置
#   2. 域名 DNS A 记录已指向本机公网 IP
#   3. 80 端口当前空闲（脚本会临时停下占用的 nginx）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[[ -f .env ]] || { echo "缺少 .env（./script/gen-env.sh）" >&2; exit 1; }
# shellcheck disable=SC1091
source .env

[[ -n "${DOMAIN:-}" && "${DOMAIN}" != "resume.example.com" ]] || { echo "请在 .env 设置真实 DOMAIN" >&2; exit 1; }
[[ -n "${ACME_EMAIL:-}" && "${ACME_EMAIL}" != "you@example.com" ]] || { echo "请在 .env 设置 ACME_EMAIL" >&2; exit 1; }

COMPOSE=(docker compose --env-file .env -f deploy/compose.yaml)

echo "==> 暂停可能占用 80 端口的容器…"
"${COMPOSE[@]}" stop nginx 2>/dev/null || true

echo "==> 独立模式签发证书：${DOMAIN}"
docker run --rm \
  -p 80:80 \
  -v codeyang-resume_certbot-conf:/etc/letsencrypt \
  certbot/certbot:latest \
  certonly --standalone \
  -d "${DOMAIN}" \
  --email "${ACME_EMAIL}" \
  --agree-tos --no-eff-email --non-interactive

echo "==> 渲染生产 nginx 配置…"
mkdir -p deploy/nginx/runtime
sed "s/__DOMAIN__/${DOMAIN}/g" deploy/nginx/nginx.prod.conf > deploy/nginx/runtime/default.conf
echo "    deploy/nginx/runtime/default.conf（.gitignore 忽略）"

echo "==> 完成。现在可以部署生产栈：./deploy/deploy.sh prod"
