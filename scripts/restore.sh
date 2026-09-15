#!/usr/bin/env bash
# Restore only into a NEW database, never over the running application database.
set -euo pipefail
cd "$(dirname "$0")/.."
file="${1:?Usage: bash scripts/restore.sh backups/file devops_restore_drill}"
target="${2:?Provide a new database name starting with devops_restore_}"
[[ "$target" =~ ^devops_restore_[a-z0-9_]{1,40}$ ]] || { echo 'Invalid restore database name' >&2; exit 1; }
test -s "$file"
# createdb fails if the target already exists. Existing databases are preserved.
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$target"
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --single-transaction --no-owner --no-acl --exit-on-error' sh "$target" < "$file"
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) AS restored_tasks FROM tasks"' sh "$target"
printf 'Restored into %s. The API still uses its original database.\n' "$target"
