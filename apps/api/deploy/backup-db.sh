#!/usr/bin/env bash
# Daily backup of shortDrama's databases on KVM4 → Cloudflare R2.
# Installed at /usr/local/bin/shortdrama-backup-db.sh; cron: 15 7 * * * (after socialManager's 07:00).
#
# Reuses socialManager's R2 credentials (/etc/sam-backup/env, root only) but writes to its own
# prefix, backups-shortdrama/, so neither job's 30-day pruning can touch the other's files.
#
# Restore one database:
#   aws s3 cp s3://$R2_BUCKET/backups-shortdrama/<file>.dump /tmp/restore.dump \
#     --endpoint-url "$R2_ENDPOINT_URL" --region auto
#   sudo -u postgres pg_restore -d shortdrama --clean --if-exists --no-owner --role=shortdrama /tmp/restore.dump
set -euo pipefail

# Add shortdrama_staging once staging is deployed; it is empty until then.
DATABASES=(shortdrama)
PREFIX=backups-shortdrama/
RETAIN_DAYS=30
# The schema alone dumps to a few KB; anything smaller means pg_dump went wrong.
MIN_BYTES=2000

ENV_FILE=/etc/sam-backup/env
[ -r "$ENV_FILE" ] || { echo "[shortdrama-backup] missing $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1091
. "$ENV_FILE"
: "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}" "${R2_ENDPOINT_URL:?}" "${R2_BUCKET:?}"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
r2() { aws "$@" --endpoint-url "$R2_ENDPOINT_URL" --region auto; }
log() { echo "[shortdrama-backup $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
cd /tmp # postgres can't read root's home directory
ts=$(date -u +%Y%m%dT%H%M%SZ)

for db in "${DATABASES[@]}"; do
  file="${db}-${ts}.dump"
  sudo -u postgres pg_dump --format=custom --no-owner --no-privileges "$db" > "$workdir/$file"
  bytes=$(stat -c%s "$workdir/$file")
  if [ "$bytes" -lt "$MIN_BYTES" ]; then
    log "ERROR: $db dump is only $bytes bytes; not uploading"
    exit 2
  fi
  r2 s3 cp "$workdir/$file" "s3://${R2_BUCKET}/${PREFIX}${file}" --no-progress >/dev/null
  r2 s3api head-object --bucket "$R2_BUCKET" --key "${PREFIX}${file}" >/dev/null
  log "$db: uploaded and verified ${file} (${bytes} bytes)"
done

cutoff=$(date -d "${RETAIN_DAYS} days ago" -u +%s)
deleted=0
while read -r day time _size key; do
  [ -n "${key:-}" ] || continue
  epoch=$(date -d "$day $time" -u +%s 2>/dev/null || echo 0)
  # An unreadable date is never treated as old.
  if [ "$epoch" -gt 0 ] && [ "$epoch" -lt "$cutoff" ]; then
    r2 s3 rm "s3://${R2_BUCKET}/${PREFIX}${key}" >/dev/null
    deleted=$((deleted + 1))
  fi
done < <(r2 s3 ls "s3://${R2_BUCKET}/${PREFIX}")
log "pruned ${deleted} backup(s) older than ${RETAIN_DAYS} days; done"
