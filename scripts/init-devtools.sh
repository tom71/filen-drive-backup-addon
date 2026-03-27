#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$PWD}"
CONFIG_DIR="$ROOT_DIR/.tmp-ui-test"
CONFIG_FILE="$CONFIG_DIR/options.json"
AUTH_STATE_FILE="$CONFIG_DIR/filen-auth-state.json"
WORKING_DIR="$CONFIG_DIR/workdir"
RESTORE_DIR="$CONFIG_DIR/restore"
EXAMPLE_CONFIG="$ROOT_DIR/config/config.example.json"

mkdir -p "$CONFIG_DIR" "$WORKING_DIR" "$RESTORE_DIR"

ROOT_DIR="$ROOT_DIR" \
CONFIG_FILE="$CONFIG_FILE" \
AUTH_STATE_FILE="$AUTH_STATE_FILE" \
WORKING_DIR="$WORKING_DIR" \
RESTORE_DIR="$RESTORE_DIR" \
EXAMPLE_CONFIG="$EXAMPLE_CONFIG" \
node <<'NODE'
const fs = require("node:fs");

const rootDir = process.env.ROOT_DIR;
const configFile = process.env.CONFIG_FILE;
const authStateFile = process.env.AUTH_STATE_FILE;
const workingDir = process.env.WORKING_DIR;
const restoreDir = process.env.RESTORE_DIR;
const exampleConfig = process.env.EXAMPLE_CONFIG;

const base = JSON.parse(fs.readFileSync(exampleConfig, "utf8"));
const existing = fs.existsSync(configFile)
  ? JSON.parse(fs.readFileSync(configFile, "utf8"))
  : {};

const merged = {
  ...base,
  ...existing,
  source_directory: rootDir,
  working_directory: workingDir,
  restore_directory: restoreDir,
  filen_auth_state_path: authStateFile,
};

fs.writeFileSync(configFile, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
NODE

echo "Devtools-Konfiguration aktualisiert: $CONFIG_FILE"