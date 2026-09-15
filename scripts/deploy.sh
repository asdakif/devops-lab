#!/usr/bin/env bash
# Run on the Docker host from the checked out release directory.
set -euo pipefail
cd "$(dirname "$0")/.."
image="${1:?Usage: bash scripts/deploy.sh ghcr.io/owner/repo:sha-COMMIT}"
[[ "$image" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]+$ ]] || { echo 'Invalid image reference' >&2; exit 1; }
test -f .env || { echo 'Create .env on this host first: npm run setup' >&2; exit 1; }
mkdir -p .deploy-state
container="$(docker compose ps -q api)"
previous=''
if [ -n "$container" ]; then previous="$(docker inspect --format '{{.Image}}' "$container")"; fi
docker pull "$image"
if API_IMAGE="$image" docker compose up -d --no-build --wait --wait-timeout 120 api; then
  if [ -n "$previous" ]; then printf '%s\n' "$previous" > .deploy-state/previous-image; fi
  printf '%s\n' "$image" > .deploy-state/current-image
  echo "Deployment healthy: $image"
else
  echo 'Deployment failed its health check.' >&2
  if [ -n "$previous" ]; then
    echo "Restoring previous image: $previous" >&2
    API_IMAGE="$previous" docker compose up -d --no-build --pull never --wait --wait-timeout 120 api
    printf '%s\n' "$previous" > .deploy-state/current-image
  fi
  exit 1
fi
