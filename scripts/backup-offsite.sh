#!/usr/bin/env bash
# Copy the local dumps somewhere else. A backup on the same machine as the
# database is not a backup.
#
# Run from the repo root on the server, e.g. from the host's crontab:
#   15 3 * * * cd /srv/daj && ./scripts/backup-offsite.sh >> /var/log/daj-offsite.log 2>&1
#
# Pick a destination with BACKUP_DEST:
#   rclone remote:  BACKUP_DEST="gdrive:daj-backups"      (needs rclone configured)
#   another host:   BACKUP_DEST="user@host:/srv/backups"  (needs an ssh key)
set -euo pipefail

SRC_DIR="${SRC_DIR:-./backups}"
BACKUP_DEST="${BACKUP_DEST:?set BACKUP_DEST, e.g. gdrive:daj-backups or user@host:/srv/backups}"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "No backup directory at $SRC_DIR" >&2
  exit 1
fi

shopt -s nullglob
dumps=("$SRC_DIR"/*.sql.gz)
if (( ${#dumps[@]} == 0 )); then
  echo "No dumps to copy in $SRC_DIR" >&2
  exit 1
fi

echo "[offsite] $(date -u '+%FT%TZ') copying ${#dumps[@]} dump(s) to $BACKUP_DEST"

if [[ "$BACKUP_DEST" == *:* && "$BACKUP_DEST" != *@*:* ]] && command -v rclone >/dev/null; then
  # Looks like an rclone remote ("remote:path") and rclone is available.
  rclone copy --verbose --include '*.sql.gz' "$SRC_DIR" "$BACKUP_DEST"
else
  # Otherwise treat it as an scp/rsync target.
  rsync -av --include='*.sql.gz' --exclude='*' "$SRC_DIR/" "$BACKUP_DEST/"
fi

echo "[offsite] done"
