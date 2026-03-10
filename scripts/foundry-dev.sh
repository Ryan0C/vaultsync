#!/usr/bin/env bash
set -euo pipefail

# Load optional local env from project root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

FOUNDRY_DIR="${FOUNDRY_DIR:-$HOME/foundry/foundryvtt}"
DATA_DIR="${DATA_DIR:-$HOME/foundry/foundry-data-dev}"
PORT="${PORT:-30000}"

# Sanity checks
if [ ! -f "$FOUNDRY_DIR/main.js" ]; then
  echo "Could not find Foundry entrypoint at: $FOUNDRY_DIR/main.js"
  echo "Update FOUNDRY_DIR in .env or scripts/foundry-dev.sh defaults"
  exit 1
fi

mkdir -p "$DATA_DIR"

# Run Foundry (v13+ Node distribution)
cd "$FOUNDRY_DIR"
node main.js --dataPath="$DATA_DIR" --port="$PORT" --logLevel=debug
