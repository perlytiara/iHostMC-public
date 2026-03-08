#!/usr/bin/env bash
# Build the website and restart the live website service so changes go live.
# Run from repo root: ./deploy/refresh-website.sh
# If systemd is used, you may need: sudo ./deploy/refresh-website.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[refresh-website] Cleaning .next and building website..."
(cd website && rm -rf .next && npm run build)

echo "[refresh-website] Restarting website service..."
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet ihostmc-website 2>/dev/null; then
    sudo -n systemctl restart ihostmc-website 2>/dev/null && echo "[refresh-website] ihostmc-website restarted." || sudo systemctl restart ihostmc-website
  else
    echo "[refresh-website] ihostmc-website not found or not active. If you use PM2 or another runner, restart it manually."
  fi
else
  echo "[refresh-website] systemctl not found. Restart your website process manually (e.g. pm2 restart ihostmc-website)."
fi

echo "[refresh-website] Done. Refresh your browser to see changes."
