#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$PWD}"
PORT="${PORT:-8099}"

bash "$ROOT_DIR/scripts/init-devtools.sh" "$ROOT_DIR"

export UI_CONFIG_PATH="$ROOT_DIR/.tmp-ui-test/options.json"
export FILEN_AUTH_STATE_PATH="$ROOT_DIR/.tmp-ui-test/filen-auth-state.json"
export UI_PORT="$PORT"

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  npm install
fi

npm run build
exec node dist/index.js ui "$PORT"