#!/bin/bash
# Run frp port-api and frps from iHostMC/server on this machine (play.ihost.one)
set -e
cd "$(dirname "$0")"

# Load .env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
# Public relay token: same for all iHostMC users (single source in repo)
if [ -z "$FRP_API_TOKEN" ] && [ -f relay-public-token.txt ]; then
  export FRP_API_TOKEN=$(cat relay-public-token.txt | tr -d '\n\r')
fi
[ -n "$FRP_API_TOKEN" ] || { echo "FRP_API_TOKEN not set. Set it in .env or use server/relay-public-token.txt."; exit 1; }

# Prefer Go binary; fallback to Python
API_CMD=""
if command -v go >/dev/null 2>&1; then
  if [ ! -f ./port-api ] || [ main.go -nt ./port-api ]; then
    go build -o port-api . || true
  fi
  [ -f ./port-api ] && API_CMD="./port-api"
fi
if [ -z "$API_CMD" ]; then
  [ -f ./port_api.py ] && API_CMD="python3 port_api.py" || true
fi
[ -z "$API_CMD" ] && { echo "Need Go (go build) or port_api.py"; exit 1; }

# Ensure frps binary exists (either ./frps or ./frps/frps)
FRPS_BIN=./frps
[ -d ./frps ] && [ -f ./frps/frps ] && FRPS_BIN=./frps/frps
if [ ! -x "$FRPS_BIN" ]; then
  echo "Downloading frps..."
  FRP_VER=0.67.0
  wget -q "https://github.com/fatedier/frp/releases/download/v${FRP_VER}/frp_${FRP_VER}_linux_amd64.tar.gz" -O /tmp/frp.tar.gz
  tar -xzf /tmp/frp.tar.gz -C /tmp
  mkdir -p ./frps
  cp "/tmp/frp_${FRP_VER}_linux_amd64/frps" "./frps/frps"
  rm -rf /tmp/frp.tar.gz "/tmp/frp_${FRP_VER}_linux_amd64"
  chmod +x ./frps/frps
  FRPS_BIN=./frps/frps
fi

echo "Starting frps (bind 7000)..."
"$FRPS_BIN" -c "$(pwd)/frps/frps.toml" &
FRPS_PID=$!
sleep 1
echo "Starting port-api (${FRP_API_ADDR:-:8081})..."
$API_CMD &
API_PID=$!
echo "frps PID=$FRPS_PID  port-api PID=$API_PID"
echo "Public relay ready. App (Windows) uses same token from repo – no config needed."
wait $FRPS_PID $API_PID
