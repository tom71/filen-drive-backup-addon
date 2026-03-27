#!/usr/bin/env bash
set -euo pipefail

bash scripts/init-devtools.sh

if [ ! -d node_modules ]; then
  npm install
fi

echo "Devtools-Container bereit. UI starten mit: bash scripts/devtools-start-ui.sh"