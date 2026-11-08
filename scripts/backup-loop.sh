#!/bin/sh
# Nightly pg_dump inside the compose stack.
#
# Sleeps until BACKUP_AT (UTC, HH:MM), dumps, prunes anything older than
# BACKUP_KEEP_DAYS, then waits for the next day. Dumps land in /backups, which
# is bind-mounted to ./backups on the host — copy that directory off the machine
# (see scripts/backup-offsite.sh) or the backup is still one disk failure away
# from being useless.
set -eu

BACKUP_AT="${BACKUP_AT:-02:30}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
OUT_DIR=/backups

mkdir -p "$OUT_DIR"

log() { echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

seconds_until() {
  target_h=$(echo "$1" | cut -d: -f1)
  target_m=$(echo "$1" | cut -d: -f2)
  now=$(date -u +%s)
  today_target=$(date -u -d "$(date -u +%Y-%m-%d) ${target_h}:${target_m}:00" +%s 2>/dev/null \
    || date -u -j -f '%Y-%m-%d %H:%M:%S' "$(date -u +%Y-%m-%d) ${target_h}:${target_m}:00" +%s)
  if [ "$today_target" -le "$now" ]; then
    today_target=$((today_target + 86400))
  fi
  echo $((today_target - now))
}

dump_now() {
  stamp=$(date -u +%Y%m%d-%H%M%S)
  file="$OUT_DIR/${PGDATABASE}-${stamp}.sql.gz"
  log "dumping to $(basename "$file")"
  # --clean so the dump can be restored over an existing database.
  if pg_dump --clean --if-exists --no-owner --no-privileges | gzip -9 > "$file.part"; then
    mv "$file.part" "$file"
    log "ok, $(du -h "$file" | cut -f1)"
  else
    rm -f "$file.part"
    log "FAILED"
    return 1
  fi

  find "$OUT_DIR" -name "${PGDATABASE}-*.sql.gz" -mtime "+${BACKUP_KEEP_DAYS}" -print -delete \
    | while read -r old; do log "pruned $(basename "$old")"; done
}

log "scheduled daily at ${BACKUP_AT} UTC, keeping ${BACKUP_KEEP_DAYS} days"

# One dump at startup so a fresh deployment is never without a backup.
dump_now || log "startup dump failed, will retry on schedule"

while true; do
  wait_for=$(seconds_until "$BACKUP_AT")
  log "sleeping ${wait_for}s"
  sleep "$wait_for"
  dump_now || true
done
