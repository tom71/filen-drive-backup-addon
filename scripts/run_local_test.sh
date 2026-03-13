#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADDON_DIR="$ROOT_DIR/hassio-filen-drive-backup"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
OPTIONS_FILE="$ADDON_DIR/dev/data/local_docker_options.json"
TMP_DIR="$ROOT_DIR/.tmp"
SIM_LOG="$TMP_DIR/simulationserver.log"

mkdir -p "$TMP_DIR"

SIM_PID=""

cleanup() {
  local exit_code=$?

  if [[ -n "$SIM_PID" ]] && kill -0 "$SIM_PID" 2>/dev/null; then
    kill "$SIM_PID" 2>/dev/null || true
    wait "$SIM_PID" 2>/dev/null || true
  fi

  docker compose -f "$COMPOSE_FILE" down >/dev/null 2>&1 || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

if [[ ! -f "$OPTIONS_FILE" ]]; then
  echo "Options-Datei fehlt: $OPTIONS_FILE"
  exit 1
fi

echo "[1/3] Starte lokalen Supervisor/Filen-Simulator ..."
pushd "$ADDON_DIR" >/dev/null
python3 -m dev.simulationserver >"$SIM_LOG" 2>&1 &
SIM_PID=$!
popd >/dev/null

echo "[2/3] Warte auf Simulator-Port 56153 ..."
for _ in $(seq 1 30); do
  if python3 - <<'PY'
import socket
s = socket.socket()
s.settimeout(0.5)
ok = s.connect_ex(("127.0.0.1", 56153)) == 0
s.close()
raise SystemExit(0 if ok else 1)
PY
  then
    echo "Simulator bereit."
    break
  fi
  sleep 1
done

if ! python3 - <<'PY'
import socket
s = socket.socket()
s.settimeout(0.5)
ok = s.connect_ex(("127.0.0.1", 56153)) == 0
s.close()
raise SystemExit(0 if ok else 1)
PY
then
  echo "Simulator wurde nicht bereit. Letzte Logzeilen:"
  tail -n 50 "$SIM_LOG" || true
  exit 1
fi

echo "[3/4] Initialisiere Docker-Volumes ..."
docker volume create filen-backup-data >/dev/null
docker volume create filen-backup-backup >/dev/null

echo "[4/4] Schreibe /data/options.json ins Docker-Volume und starte Addon-Container ..."
docker run --rm -i -v filen-backup-data:/data alpine:3.20 sh -c 'cat > /data/options.json' < "$OPTIONS_FILE"

echo "Web-UI: http://localhost:1627"
docker compose -f "$COMPOSE_FILE" up --build
