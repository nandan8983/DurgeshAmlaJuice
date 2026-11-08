#!/usr/bin/env bash
# Restore a dump produced by scripts/backup-loop.sh.
#
#   ./scripts/restore.sh backups/daj-20261108-023000.sql.gz
#
# The dump is created with --clean --if-exists, so it drops and recreates the
# objects it owns. Everything currently in the target database is replaced.
set -euo pipefail

DUMP="${1:?usage: restore.sh <dump.sql.gz>}"

if [[ ! -f "$DUMP" ]]; then
  echo "No such dump: $DUMP" >&2
  exit 1
fi

echo "This REPLACES the contents of the database in the running 'db' service."
echo "Dump: $DUMP"
read -r -p "Type the word restore to continue: " confirm
if [[ "$confirm" != "restore" ]]; then
  echo "Aborted."
  exit 1
fi

# Stop the API first so nothing writes mid-restore.
docker compose stop api

gunzip -c "$DUMP" | docker compose exec -T db \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-daj}" -d "${POSTGRES_DB:-daj}"

docker compose start api

echo "Restored. Check: curl -s http://127.0.0.1:4000/health"
