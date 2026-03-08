# Server prompt: fix up FRPS and Share server relay

After you **push** updates and pull on the Linux server, use the prompt below so FRPS (relay for "Share server" in the app) is running and the app can connect.

## What the relay does

- **frps** (port **7000**): FRP server; the desktop app’s frpc connects here to expose the Minecraft server.
- **port-api** (https://play.ihost.one): Assigns a public port for each Share session; the app calls it with the relay token.

The app uses **play.ihost.one** as the relay host (frps on port 7000; port-api at play.ihost.one). The relay token is returned to logged-in users by the backend (`GET /api/relay/token`).

## Prompt to paste on the server (in Cursor or terminal)

Copy and paste the block below on the **Linux server** (where iHostMC backend/website run and where **ihost.one** / **play.ihost.one** are hosted):

```text
I'm on the iHostMC Linux server (play.ihost.one / ihost.one). Fix up FRPS and the relay so "Share server" in the app works.

1) Pull latest: cd to the iHostMC repo root and run git pull origin main.

2) Relay token: Ensure server/relay-public-token.txt exists and contains a single line (the shared relay token). If missing, generate one (e.g. openssl rand -hex 24) and write it to server/relay-public-token.txt. Update server/frps/frps.toml so auth.token equals this exact token.

3) Backend: In backend/.env set RELAY_PUBLIC_TOKEN to the same token as server/relay-public-token.txt (so logged-in app users get the token from GET /api/relay/token). Restart the backend after changing .env.

4) FRPS binary: In server/, if frps/frps does not exist or is not executable, download frps (e.g. from https://github.com/fatedier/frp/releases, linux_amd64), extract frps into server/frps/frps, and chmod +x server/frps/frps.

5) Port-api: In server/, either run go build -o port-api . so the port-api executable exists, or rely on PM2 ecosystem fallback (if port-api binary is missing, ecosystem.config.cjs uses python3 port_api.py with the same env). run.sh also builds port-api when Go is available and falls back to Python.

6) Start/restart relay with PM2: cd server && pm2 start ecosystem.config.cjs (or pm2 restart all for ihostmc-relay-frps and ihostmc-relay-port-api). Ensure both apps are running: pm2 list. Check logs: pm2 logs ihostmc-relay-frps and pm2 logs ihostmc-relay-port-api.

7) Firewall: Ensure ports 7000 (frps) and 8081 (port-api) are open on this host (e.g. ufw allow 7000, ufw allow 8081, ufw reload, or equivalent).

8) Verify: Check frps is listening on 7000: ss -tlnp | grep 7000. Check port-api is listening on 8081: ss -tlnp | grep 8081. Optionally test assign-port from this server: curl -s -X POST https://play.ihost.one/assign-port -H "Authorization: Bearer YOUR_TOKEN" (use the token from relay-public-token.txt); expect 200 with {"port":...}.

When done, tell me: frps and port-api status (pm2 list), and whether ports 7000 and 8081 are listening.
```

## Quick reference

| Item | Value |
|------|--------|
| Relay host (app) | play.ihost.one |
| frps port | 7000 |
| port-api port | 8081 |
| Token source | server/relay-public-token.txt (same as frps.toml and backend RELAY_PUBLIC_TOKEN) |
| PM2 apps | ihostmc-relay-frps, ihostmc-relay-port-api |

## If you don’t use PM2

Run the relay manually (from repo root or server/):

```bash
cd server
./run.sh
```

This starts frps and port-api in the foreground (and builds port-api with Go if needed). For production, prefer PM2 so the relay restarts on failure and after reboot (`pm2 save` and `pm2 startup`).
