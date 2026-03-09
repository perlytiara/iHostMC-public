#!/bin/bash
# Start relay (frps + port-api) from the correct server directory.
# Run after deploy or on boot: cd /opt/iHost/server && ./scripts/start-relay.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SERVER_DIR"

if ! command -v pm2 &>/dev/null; then
  echo "pm2 not found. Install: npm install -g pm2"
  exit 1
fi

# Stop existing relay processes (they may have wrong paths)
pm2 delete ihostmc-relay-frps 2>/dev/null || true
pm2 delete ihostmc-relay-port-api 2>/dev/null || true

# Start from current (correct) path
pm2 start ecosystem.config.cjs --only ihostmc-relay-frps
pm2 start ecosystem.config.cjs --only ihostmc-relay-port-api

pm2 save
echo "Relay started. frps on :7000, port-api on :8081"
