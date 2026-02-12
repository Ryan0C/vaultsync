#!/usr/bin/env bash
set -euo pipefail

FOUNDRY_DIR="$HOME/foundry/foundryvtt"
DATA_DIR="$HOME/foundry/foundry-data-dev"
PORT="30000"

# Sanity checks
if [ ! -f "$FOUNDRY_DIR/main.js" ]; then
  echo "Could not find Foundry entrypoint at: $FOUNDRY_DIR/main.js"
  echo "Update FOUNDRY_DIR in scripts/foundry-dev.sh"
  exit 1
fi

mkdir -p "$DATA_DIR"

# Run Foundry (v13+ Node distribution)
cd "$FOUNDRY_DIR"
node main.js --dataPath="$DATA_DIR" --port="$PORT" --logLevel=debug