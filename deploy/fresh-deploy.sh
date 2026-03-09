#!/usr/bin/env bash
# Trigger a full fresh deploy: clean website build, rebuild backend + website, restart relay (frps, port-api), reload nginx.
# Run from repo root or from server: ./deploy/fresh-deploy.sh
# Builder must be running (e.g. pm2 start deploy/ecosystem.config.cjs). Default URL: http://localhost:9090

set -e
URL="${DEPLOY_URL:-http://localhost:9090}"
echo "[fresh-deploy] Triggering fresh deploy at $URL/deploy?trigger=1&fresh=1 ..."
res=$(curl -s -X GET "$URL/deploy?trigger=1&fresh=1" || true)
echo "$res" | head -c 500
echo ""
if echo "$res" | grep -q '"deployInProgress"'; then
  echo "[fresh-deploy] Check status: curl -s $URL/status"
fi
