#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-filen-drive-backup-addon:test}"
CONFIG_FILE="${CONFIG_FILE:-$PWD/.tmp-ui-test/options.json}"
SOURCE_DIR="${SOURCE_DIR:-$PWD}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-$PWD/.tmp-ui-test/local-backups}"
AUTH_STATE_FILE="${AUTH_STATE_FILE:-$PWD/.tmp-ui-test/filen-auth-state.json}"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Konfigurationsdatei nicht gefunden: $CONFIG_FILE" >&2
  exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Quellverzeichnis existiert nicht: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$LOCAL_BACKUP_DIR"

DOCKER_ARGS=(
  --rm
  -e CONFIG_PATH=/data/options.json
  -v "${CONFIG_FILE}:/data/options.json"
  -v "${SOURCE_DIR}:/backup:ro"
  -v "${LOCAL_BACKUP_DIR}:/share/filen-backups"
)

if [ -f "$AUTH_STATE_FILE" ]; then
  DOCKER_ARGS+=(
    -e FILEN_AUTH_STATE_PATH=/data/filen-auth-state.json
    -v "${AUTH_STATE_FILE}:/data/filen-auth-state.json"
  )
fi

docker run "${DOCKER_ARGS[@]}" \
  "$IMAGE" \
  node dist/index.js backup
