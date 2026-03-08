#!/bin/bash
# Optional: run on Ubuntu VPS to install frps and open firewall.
# Usage: sudo ./setup-vps.sh

set -e
FRP_VERSION="${FRP_VERSION:-0.67.0}"
FRP_DIR=/etc/frp

echo "Installing frps ${FRP_VERSION}..."
apt-get update -qq && apt-get install -y -qq wget
mkdir -p "$FRP_DIR"
cd /tmp
wget -q "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz"
tar -xzf "frp_${FRP_VERSION}_linux_amd64.tar.gz"
cp "frp_${FRP_VERSION}_linux_amd64/frps" "$FRP_DIR/"
cp "frp_${FRP_VERSION}_linux_amd64/frps.toml" "$FRP_DIR/" 2>/dev/null || true
rm -rf "frp_${FRP_VERSION}_linux_amd64" "frp_${FRP_VERSION}_linux_amd64.tar.gz"

echo "Edit $FRP_DIR/frps.toml: set auth.token and bindPort (default 7000)."
echo "Open firewall: ufw allow 7000/tcp && ufw allow 20000:60000/tcp && ufw allow 20000:60000/udp && ufw enable"
echo "Install systemd unit: cp server/frps/frps.service /etc/systemd/system/ && systemctl enable --now frps"
