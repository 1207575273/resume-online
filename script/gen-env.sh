#!/usr/bin/env bash
# 生成 .env：基于 .env.example，随机生成数据库密码与内部令牌
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  echo ".env 已存在，不覆盖（需要重新生成请先删除）" >&2
  exit 0
fi

PG_PASSWORD="$(openssl rand -hex 16)"
API_TOKEN="$(openssl rand -hex 24)"

sed \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASSWORD}|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://resume:${PG_PASSWORD}@localhost:5432/resume|" \
  -e "s|^INTERNAL_API_TOKEN=.*|INTERNAL_API_TOKEN=${API_TOKEN}|" \
  .env.example > .env

chmod 600 .env

cat <<EOF
✅ 已生成 .env（权限 600）

  POSTGRES_PASSWORD   = ${PG_PASSWORD}
  INTERNAL_API_TOKEN  = ${API_TOKEN}

生产部署前请再补两个值：
  DOMAIN     你的域名（DNS A 记录指向本机）
  ACME_EMAIL 证书通知邮箱
EOF
