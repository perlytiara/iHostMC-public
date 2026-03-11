#!/bin/bash
# Start relay (frps + port-api) from the correct server directory.
set -e
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo "Stopping existing relay PM2 apps (if any)..."
pm2 delete ihostmc-relay-frps 2>/dev/null || true
pm2 delete ihostmc-relay-port-api 2>/dev/null || true

echo "Starting relay (frps + port-api)..."
pm2 start ecosystem.config.cjs --only ihostmc-relay-frps
pm2 start ecosystem.config.cjs --only ihostmc-relay-port-api

echo "Relay started. frps on :7000, port-api on :8081"
pm2 list
