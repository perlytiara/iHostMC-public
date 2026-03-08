#!/usr/bin/env python3
"""
iHostMC frp port-assignment API. Same behavior as main.go.
Usage: FRP_API_TOKEN=xxx FRP_ALLOWED_HOST=ihostmc.duckdns.org python3 port_api.py
Listens on :8080 by default (set FRP_API_ADDR to change).
"""
import json
import os
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT_MIN = int(os.environ.get("FRP_PORT_MIN", "20000"))
PORT_MAX = int(os.environ.get("FRP_PORT_MAX", "60000"))
ADDR = os.environ.get("FRP_API_ADDR", ":8080")
TOKEN = os.environ.get("FRP_API_TOKEN", "")
ALLOWED_HOST = os.environ.get("FRP_ALLOWED_HOST", "")

used_ports = set()
lock = threading.Lock()


def get_port():
    with lock:
        for p in range(PORT_MIN, PORT_MAX + 1):
            if p not in used_ports:
                used_ports.add(p)
                return p
    return None


def release_port(port):
    try:
        port = int(port)
    except (TypeError, ValueError):
        return False
    if port < PORT_MIN or port > PORT_MAX:
        return False
    with lock:
        used_ports.discard(port)
    return True


def check_auth(handler):
    auth = handler.headers.get("Authorization", "").strip()
    if not auth:
        q = parse_qs(urlparse(handler.path).query)
        auth = (q.get("token") or [""])[0]
    got = auth.replace("Bearer ", "").strip()
    return got == TOKEN


def check_host(handler):
    if not ALLOWED_HOST:
        return True
    host = handler.headers.get("Host", "").split(":")[0]
    return host == ALLOWED_HOST


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print("[port-api]", format % args)

    def send_json(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_POST(self):
        if not check_host(self):
            self.send_error(404, "not found")
            return
        if not TOKEN:
            self.send_json(500, {"error": "FRP_API_TOKEN not set"})
            return
        if not check_auth(self):
            self.send_json(401, {"error": "invalid token"})
            return

        path = urlparse(self.path).path
        if path == "/assign-port":
            port = get_port()
            if port is None:
                self.send_json(503, {"error": "no free port"})
                return
            self.send_json(200, {"port": port})
            return
        if path.startswith("/release-port/"):
            port_str = path.split("/release-port/")[-1].split("/")[0]
            if release_port(port_str):
                self.send_response(204)
                self.end_headers()
            else:
                self.send_json(400, {"error": "invalid port"})
            return
        self.send_error(404)


def main():
    if not TOKEN:
        print("FRP_API_TOKEN is required")
        raise SystemExit(1)
    host, _, port = ADDR.rstrip().partition(":")
    port = int(port or "8080")
    if not host:
        host = "0.0.0.0"
    print(f"frp port-api listening on {host}:{port} (ports {PORT_MIN}-{PORT_MAX}) allowed_host={ALLOWED_HOST or '*'}")
    server = HTTPServer((host, port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
