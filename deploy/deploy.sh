#!/usr/bin/env bash
# 部署入口：./deploy/deploy.sh local|prod
# local —— HTTP 全栈（开发/内网演示）
# prod  —— HTTPS 生产（需先跑 script/setup-https.sh）
set -euo pipefail

MODE="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "$MODE" != "local" && "$MODE" != "prod" ]]; then
  echo "用法: ./deploy/deploy.sh local|prod" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "缺少 .env，先运行 ./script/gen-env.sh 生成" >&2
  exit 1
fi

COMPOSE=(docker compose --env-file .env -f deploy/compose.yaml)

case "$MODE" in
  local)
    "${COMPOSE[@]}" up -d --build
    echo "✅ 本地栈已启动: http://localhost"
    ;;
  prod)
    if [[ ! -f deploy/nginx/runtime/default.conf ]]; then
      echo "缺少 deploy/nginx/runtime/default.conf，先运行 ./script/setup-https.sh 签发证书" >&2
      exit 1
    fi
    "${COMPOSE[@]}" -f deploy/compose.prod.yaml up -d --build
    DOMAIN="$(grep -E '^DOMAIN=' .env | cut -d= -f2)"
    echo "✅ 生产栈已启动: https://${DOMAIN}"
    ;;
esac

"${COMPOSE[@]}" ps
