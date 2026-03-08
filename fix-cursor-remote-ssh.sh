#!/bin/bash
# Fix Cursor Remote SSH installation on root@51.75.53.62
#
# --- FIX "Connection closed" ON THE SERVER (run FIRST from PowerShell) ---
# SCP fails when root's .bashrc/.profile print anything (echo, motd, etc).
# Fix: make non-interactive shells return immediately. Run:
#
#   ssh root@51.75.53.62 'for f in .bashrc .profile; do f=/root/$f; [ -f $f ] || touch $f; grep -q return $f && continue; cp -a $f $f.bak; (echo ''[[ $- != *i* ]] && return''; echo; cat $f) > $f.new; mv $f.new $f; done; echo Fixed'
#
# Then retry SCP.
#
# --- AFTER SCP WORKS (or use WinSCP to upload to /tmp/) ---
# PowerShell - file at: C:\Users\user\Downloads\_.DOWNLOADERS._\_.NEAT._\cursor-reh-linux-x64.tar.gz
#
#   scp "C:\Users\user\Downloads\_.DOWNLOADERS._\_.NEAT._\cursor-reh-linux-x64.tar.gz" root@51.75.53.62:/tmp/
#   ssh root@51.75.53.62 "mkdir -p /root/.cursor-server/bin/linux-x64; mv /tmp/cursor-reh-linux-x64.tar.gz /root/.cursor-server/; cd /root/.cursor-server; tar -xzf cursor-reh-linux-x64.tar.gz -C bin/linux-x64/; rm cursor-reh-linux-x64.tar.gz; ls bin/linux-x64/; echo Done"

set -e

CURSOR_SERVER_DIR="${HOME}/.cursor-server"
CURSOR_BIN_DIR="${CURSOR_SERVER_DIR}/bin/linux-x64"
CURSOR_VERSION="183d374088f4eb28500dc13e8807157ad5646cc8"

echo "=== Cursor Remote SSH Fix (extract mode) ==="
echo "1. Removing corrupted cursor-server files..."
rm -f "${CURSOR_SERVER_DIR}"/cursor-server-*.tar.gz 2>/dev/null || true
find "${CURSOR_SERVER_DIR}" -maxdepth 1 -name "*.tar.gz" ! -name "cursor-reh-linux-x64.tar.gz" -delete 2>/dev/null || true

echo "2. Ensuring directory structure..."
mkdir -p "${CURSOR_SERVER_DIR}"
mkdir -p "${CURSOR_BIN_DIR}"

# Use tarball from SCP if provided (CURSOR_TARBALL env)
TARBALL="${CURSOR_TARBALL:-${CURSOR_SERVER_DIR}/cursor-reh-linux-x64.tar.gz}"

if [ ! -f "${TARBALL}" ]; then
    echo "ERROR: Tarball not found at ${TARBALL}"
    echo "Run: scp cursor-reh-linux-x64.tar.gz root@51.75.53.62:/root/.cursor-server/"
    exit 1
fi

echo "3. Verifying tarball..."
if [ ! -s "${TARBALL}" ]; then
    echo "ERROR: Tarball is empty"
    exit 1
fi
if ! file "${TARBALL}" | grep -qE "gzip|compressed"; then
    echo "ERROR: Not a valid gzip archive"
    exit 1
fi

echo "4. Extracting..."
tar -xzf "${TARBALL}" -C "${CURSOR_BIN_DIR}"

EXTRACTED_DIR=$(ls -d ${CURSOR_BIN_DIR}/*/ 2>/dev/null | head -1)
if [ -n "${EXTRACTED_DIR}" ] && [ -f "${EXTRACTED_DIR}node" ]; then
    echo "5. Done. Node at: ${EXTRACTED_DIR}node"
else
    echo "5. Extracted. Contents:"
    ls -la "${CURSOR_BIN_DIR}/"
fi

rm -f "${TARBALL}"
echo "=== Done. Try reconnecting with Cursor Remote SSH ==="
