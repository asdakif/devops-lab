#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -s .deploy-state/previous-image || { echo 'No previous deployment recorded' >&2; exit 1; }
previous="$(cat .deploy-state/previous-image)"
API_IMAGE="$previous" docker compose up -d --no-build --pull never --wait --wait-timeout 120 api
printf '%s\n' "$previous" > .deploy-state/current-image
echo "Rollback healthy: $previous"
