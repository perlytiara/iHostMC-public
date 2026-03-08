#!/usr/bin/env bash
# Trigger iHostMC-builder deploy and wait until finished. Prints final status.
# Usage: ./deploy/trigger-and-wait.sh [BASE_URL]
# Example: ./deploy/trigger-and-wait.sh http://localhost:9090

set -e
BASE="${1:-http://localhost:9090}"
STATUS_URL="$BASE/status"
DEPLOY_URL="$BASE/deploy"

echo "Triggering deploy: POST $DEPLOY_URL"
curl -s -X POST "$DEPLOY_URL" > /dev/null || true

echo "Waiting for deploy to finish (polling $STATUS_URL every 5s)..."
while true; do
  JSON="$(curl -s "$STATUS_URL")"
  if echo "$JSON" | grep -q '"deployInProgress":false'; then
    break
  fi
  sleep 5
done

echo "Deploy finished."
echo "$JSON" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(JSON.stringify({ lastDeployFinishedAt: d.lastDeployFinishedAt, ok: d.lastDeployResult?.ok, error: d.lastDeployResult?.error, steps: d.lastDeployResult?.steps }, null, 2));" 2>/dev/null || echo "$JSON"
