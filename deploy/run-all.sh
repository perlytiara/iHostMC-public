#!/usr/bin/env bash
# Run backend + website on this server (no systemd). Ports: 3010 (API), 3020 (website).
# From repo root: ./deploy/run-all.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building backend..."
(cd backend && npm run build)

echo "Building website..."
(cd website && npm run build)

echo "Starting backend on :3010..."
(cd backend && PORT=3010 node dist/index.js) &
BACKEND_PID=$!

echo "Starting website on :3020..."
(cd website && npm run start:server) &
WEB_PID=$!

cleanup() {
  kill $BACKEND_PID $WEB_PID 2>/dev/null || true
}
trap cleanup EXIT

echo "Backend PID $BACKEND_PID, Website PID $WEB_PID. Ctrl+C to stop."
wait
