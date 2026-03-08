#!/usr/bin/env bash
# Transfer iHostMC to Ubuntu server at /opt (excludes node_modules, .next, dist, etc.).
# Usage: ./deploy/transfer-to-server.sh
# Prereq: SSH access to ubuntu@51.38.40.106.
#   Key: ssh-copy-id ubuntu@51.38.40.106
#   Password: install sshpass and run: sshpass -p 'YOUR_PASSWORD' rsync ... (or use the script with rsync replaced by sshpass -p '...' rsync ...)
#
# Target: ubuntu@51.38.40.106:/opt/iHostMC

set -e
REMOTE="ubuntu@51.38.40.106"
DEST="/opt/iHostMC"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Transferring $ROOT -> $REMOTE:$DEST (excluding node_modules, .next, dist, target, .env, backups)..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude 'target' \
  --exclude '.cargo/registry' \
  --exclude 'backups' \
  --exclude '.env' \
  --exclude '*.log' \
  --exclude '.turbo' \
  --exclude '.vite' \
  --exclude 'website/.next' \
  --exclude 'backend/dist' \
  --exclude 'src-tauri/target' \
  --exclude 'submodules/baritone/.gradle' \
  --exclude 'submodules/baritone/build' \
  --exclude 'submodules/altoclef/.gradle' \
  --exclude 'submodules/altoclef/build' \
  --exclude 'submodules/autoclef/.gradle' \
  --exclude 'submodules/autoclef/build' \
  ./ "$REMOTE:$DEST/"

echo "Done. On the server run: sudo chown -R ubuntu:ubuntu $DEST  # if /opt was created as root"
echo "Then follow: $DEST/docs/SERVER_SETUP_PROMPT.md"
