#!/usr/bin/env bash
# First boot: HTTP nginx so Certbot can answer. Then issue cert and switch to HTTPS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f deploy/attend.env ]]; then
  echo "Create deploy/attend.env from deploy/attend.env.example (set ATTEND_API_HOST)." >&2
  exit 1
fi
# shellcheck disable=SC1091
set -a
source deploy/attend.env
set +a

if [[ -z "${ATTEND_API_HOST:-}" ]]; then
  echo "Set ATTEND_API_HOST in deploy/attend.env (api.builditmuj.club)." >&2
  exit 1
fi

if [[ ! -f apps/backend/.env ]]; then
  echo "Create apps/backend/.env from apps/backend/.env.example with production secrets." >&2
  exit 1
fi

mkdir -p deploy/certbot/www deploy/certbot/conf
cp deploy/nginx/http.conf deploy/nginx/active.conf.template

export ATTEND_API_HOST
docker compose --env-file deploy/attend.env -f docker-compose.prod.yml up -d --build backend nginx

echo
echo "HTTP is up. Next:"
echo "  1) Confirm DNS: dig +short ${ATTEND_API_HOST}"
echo "  2) Issue TLS:   ./scripts/vps-issue-cert.sh"
echo "  3) Verify:      ./scripts/verify-production.sh https://${ATTEND_API_HOST}"
