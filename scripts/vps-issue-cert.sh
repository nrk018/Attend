#!/usr/bin/env bash
# Run after vps-up.sh and DNS is live. Issues Let's Encrypt cert and reloads HTTPS nginx.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
set -a
source deploy/attend.env
set +a

EMAIL="${CERTBOT_EMAIL:-}"
if [[ -z "$EMAIL" ]]; then
  echo "Set CERTBOT_EMAIL in deploy/attend.env" >&2
  exit 1
fi

docker compose --env-file deploy/attend.env -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "${ATTEND_API_HOST}" \
  --email "${EMAIL}" \
  --agree-tos \
  --no-eff-email

cp deploy/nginx/https.conf deploy/nginx/active.conf.template
docker compose --env-file deploy/attend.env -f docker-compose.prod.yml up -d nginx

echo "HTTPS ready: https://${ATTEND_API_HOST}/health"
echo "Renew later: docker compose --env-file deploy/attend.env -f docker-compose.prod.yml run --rm certbot renew && docker compose --env-file deploy/attend.env -f docker-compose.prod.yml exec nginx nginx -s reload"
