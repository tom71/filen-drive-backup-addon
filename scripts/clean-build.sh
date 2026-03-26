#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-filen-drive-backup-addon:test}"
NO_CACHE="${NO_CACHE:-true}"
PULL="${PULL:-true}"
PRUNE_BUILDER="${PRUNE_BUILDER:-false}"

if [ "$PRUNE_BUILDER" = "true" ]; then
  echo "Bereinige Docker Builder Cache ..."
  docker builder prune -af
fi

DOCKER_BUILD_ARGS=(build -t "$IMAGE")

if [ "$PULL" = "true" ]; then
  DOCKER_BUILD_ARGS+=(--pull)
fi

if [ "$NO_CACHE" = "true" ]; then
  DOCKER_BUILD_ARGS+=(--no-cache)
fi

DOCKER_BUILD_ARGS+=(.)

echo "Starte Clean Build fuer Image: $IMAGE"
docker "${DOCKER_BUILD_ARGS[@]}"
