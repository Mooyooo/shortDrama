#!/usr/bin/env bash
# One-time setup of the shortDrama API and admin on Boston, run from the Mac:
#   apps/api/deploy/setup-boston.sh
# Needs the databases from KVM4 first (/root/shortdrama/db.env there). Creates:
#   /var/www/shortdrama-api/{releases,shared/.env}, the systemd service, /var/www/shortdrama-admin,
#   and two Caddy sites. The .env gets the production DATABASE_URL (copied server to server, never
#   printed) and a new random ADMIN_TOKEN.
set -euo pipefail
cd "$(dirname "$0")"

SERVER=kvmBoston
APP=/var/www/shortdrama-api

if ssh "$SERVER" "test -f $APP/shared/.env"; then
  echo "$APP/shared/.env already exists on $SERVER; setup has run before. Stopping."
  exit 1
fi

# The database URL travels KVM4 -> this Mac's pipe -> Boston, without being shown.
ssh kvm4 "grep '^DATABASE_URL_PRODUCTION=' /root/shortdrama/db.env | cut -d= -f2-" |
  ssh "$SERVER" "set -euo pipefail
    mkdir -p $APP/releases $APP/shared /var/www/shortdrama-admin
    chmod 755 $APP $APP/releases /var/www/shortdrama-admin
    # The service user (www-data) may read the secrets folder; nobody else.
    chown root:www-data $APP/shared
    chmod 750 $APP/shared
    umask 027
    read -r DATABASE_URL
    test -n \"\$DATABASE_URL\"
    cat > $APP/shared/.env <<ENV
NODE_ENV=production
HOST=127.0.0.1
PORT=3101
DATABASE_URL=\$DATABASE_URL
ADMIN_TOKEN=\$(openssl rand -hex 32)
PLAYBACK_TTL_SECONDS=14400
# Cloudflare Stream settings go here once Stream is enabled:
CF_ACCOUNT_ID=
CF_STREAM_API_TOKEN=
CF_STREAM_CUSTOMER_CODE=
CF_STREAM_SIGNING_KEY_ID=
CF_STREAM_SIGNING_KEY_PEM=
CF_STREAM_WEBHOOK_SECRET=
ENV
    chown root:www-data $APP/shared/.env
    chmod 640 $APP/shared/.env"

scp -q shortdrama-api.service "$SERVER":/etc/systemd/system/shortdrama-api.service
ssh "$SERVER" "systemctl daemon-reload && systemctl enable shortdrama-api >/dev/null 2>&1"

# Caddy: back up, append, validate; restore the backup if validation fails.
scp -q Caddyfile.snippet "$SERVER":/tmp/shortdrama.caddy
ssh "$SERVER" "set -euo pipefail
  if grep -q 'sd-api.scaleagentmax.ai' /etc/caddy/Caddyfile; then echo 'Caddy sites already present'; exit 0; fi
  cp -p /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-\$(date -u +%Y%m%d%H%M%S)
  printf '\n' >> /etc/caddy/Caddyfile
  cat /tmp/shortdrama.caddy >> /etc/caddy/Caddyfile
  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    echo 'Caddyfile invalid; restoring backup'
    cp -p \$(ls -1t /etc/caddy/Caddyfile.bak-* | head -1) /etc/caddy/Caddyfile
    exit 1
  fi
  systemctl reload caddy
  echo 'Caddy reloaded'"

echo "Setup done. Next: apps/api/deploy/deploy-boston.sh"
