#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-filen-drive-backup-addon:test}"
PORT="${PORT:-8099}"
CONFIG_FILE="${CONFIG_FILE:-$PWD/.tmp-ui-test/options.json}"
AUTH_STATE_FILE="${AUTH_STATE_FILE:-$PWD/.tmp-ui-test/filen-auth-state.json}"
LOG_FILE="${LOG_FILE:-$PWD/.tmp-ui-test/ui.log}"
UI_DEBUG="${UI_DEBUG:-true}"

mkdir -p "$(dirname "$CONFIG_FILE")"
if [ ! -f "$CONFIG_FILE" ]; then
  cp config/config.example.json "$CONFIG_FILE"
fi

mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

echo "Starte UI auf Port $PORT mit Config: $CONFIG_FILE"
echo "Logs: $LOG_FILE"

DOCKER_ARGS=(
  --rm
  -p "${PORT}:${PORT}"
  -e UI_CONFIG_PATH=/data/options.json
  -e UI_LOG_PATH=/data/ui.log
  -e UI_DEBUG="${UI_DEBUG}"
  -v "${CONFIG_FILE}:/data/options.json"
  -v "${LOG_FILE}:/data/ui.log"
)

if [ -f "$AUTH_STATE_FILE" ]; then
  DOCKER_ARGS+=(
    -e FILEN_AUTH_STATE_PATH=/data/filen-auth-state.json
    -v "${AUTH_STATE_FILE}:/data/filen-auth-state.json"
  )
else
  echo "Hinweis: Kein AUTH_STATE_FILE gefunden unter $AUTH_STATE_FILE"
  echo "Filen-Listing nutzt dann Login-Daten aus options.json (2FA-Code kann ablaufen)."
fi

docker run "${DOCKER_ARGS[@]}" \
  "$IMAGE" \
  node dist/index.js ui "$PORT"
