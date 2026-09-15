#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
file="$(mktemp backups/tasks-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX)"
trap 'rm -f "$file"' ERR
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$file"
test -s "$file"
printf 'Backup saved: %s\n' "$file"
