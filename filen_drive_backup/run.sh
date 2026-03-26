#!/usr/bin/env sh
set -eu

MODE="${START_MODE:-addon}"
UI_PORT_VALUE="${UI_PORT:-8099}"

echo "[addon] start mode: ${MODE}"
echo "[addon] config path: ${CONFIG_PATH:-/data/options.json}"

case "$MODE" in
  addon|ui)
    echo "[addon] starting UI server on port ${UI_PORT_VALUE}"
    exec node dist/index.js ui "$UI_PORT_VALUE"
    ;;
  backup)
    echo "[addon] running one-time backup"
    exec node dist/index.js backup
    ;;
  restore)
    if [ -z "${BACKUP_LOCATION:-}" ]; then
      echo "[addon] BACKUP_LOCATION missing for restore mode" >&2
      exit 1
    fi

    if [ -n "${RESTORE_DIRECTORY:-}" ]; then
      exec node dist/index.js restore "$BACKUP_LOCATION" "$RESTORE_DIRECTORY"
    fi

    exec node dist/index.js restore "$BACKUP_LOCATION"
    ;;
  setup-filen-auth)
    echo "[addon] running setup-filen-auth"
    exec node dist/index.js setup-filen-auth
    ;;
  *)
    echo "[addon] unknown START_MODE: $MODE" >&2
    echo "[addon] supported: addon | ui | backup | restore | setup-filen-auth" >&2
    exit 1
    ;;
esac
