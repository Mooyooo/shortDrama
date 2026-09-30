#!/usr/bin/env bash
# Deploys the API and the admin to Boston, run from the Mac:
#   apps/api/deploy/deploy-boston.sh
# Builds a release, uploads it as a new folder, installs runtime dependencies, applies migrations,
# switches the `current` link, restarts, and checks /health. Keeps the last five releases, so a
# rollback is: ln -sfn <older release> current && systemctl restart shortdrama-api.
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER=kvmBoston
APP=/var/www/shortdrama-api
RELEASE=$(date -u +%Y%m%d%H%M%S)

./deploy/build-release.sh
(cd ../admin && npm run build >/dev/null)

rsync -a --no-owner --no-group --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r release/ "$SERVER:$APP/releases/$RELEASE/"
rsync -a --no-owner --no-group --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r --delete ../admin/dist/ "$SERVER:/var/www/shortdrama-admin/"

ssh "$SERVER" "set -euo pipefail
  cd $APP/releases/$RELEASE
  npm ci --omit=dev --no-audit --no-fund --loglevel=error
  NODE_ENV=production node --env-file=$APP/shared/.env dist/migrate.js
  ln -sfn $APP/releases/$RELEASE $APP/current
  systemctl restart shortdrama-api
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS http://127.0.0.1:3101/health >/dev/null 2>&1; then break; fi
    sleep 1
  done
  curl -fsS http://127.0.0.1:3101/health && echo
  ls -1dt $APP/releases/* | tail -n +6 | xargs -r rm -rf"

echo "Deployed release $RELEASE"
