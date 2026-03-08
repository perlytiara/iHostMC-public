# iHostMC server setup prompt

Use this prompt on the server (Ubuntu at 51.38.40.106, user `ubuntu`) after the project has been transferred to `/opt/iHostMC`. It configures the app, the auto-build script (builder), and how to trigger deploys on `git push`.

---

## Copy-paste prompt (give this to an AI or operator)

```
I need to set up the iHostMC project on an Ubuntu server. The code is already at /opt/iHostMC (user ubuntu, server 51.38.40.106).

Goal:
- Backend API on port 3010 (Node + PostgreSQL, .env from backend/.env.example).
- Website (Next.js) on port 3020 (.env with NEXT_PUBLIC_API_URL and NEXT_PUBLIC_APP_URL pointing to this server).
- Deploy builder on port 9090 (PM2): on trigger it runs git pull, builds backend + website, db:migrate, restarts systemd services ihostmc-backend and ihostmc-website. Triggers: GitHub webhook to /webhook, or manual POST /deploy, or polling.

Do the full setup:
1. Install Node 20+, PostgreSQL, PM2. Create a PostgreSQL database and user; set DATABASE_URL in backend/.env (copy from backend/.env.example).
2. Ensure /opt/iHostMC is owned by ubuntu. In backend: cp .env.example .env, set JWT_SECRET, PORT=3010, CORS_ORIGINS, WEBSITE_URL; npm ci && npm run build && npm run db:migrate. Create /opt/iHostMC/backups and set BACKUP_STORAGE_PATH. Install deploy/ihostmc-backend.service (fix ExecStart to use the real node path and User=ubuntu), enable and start it.
3. In website: create .env with NEXT_PUBLIC_API_URL=http://51.38.40.106:3010 and NEXT_PUBLIC_APP_URL=http://51.38.40.106:3020; npm ci && npm run build. Install deploy/ihostmc-website.service (fix ExecStart/User), enable and start it.
4. Optional: deploy/.env from deploy/.env.example (GITHUB_WEBHOOK_SECRET, POLL_INTERVAL_MS=120000, SYSTEMD_SERVICES=ihostmc-backend,ihostmc-website). Run: cd /opt/iHostMC && pm2 start deploy/ecosystem.config.cjs && pm2 save.
5. Verify: curl localhost:3010 (backend), curl localhost:3020 (website), curl localhost:9090/status (builder). Tell me any errors and the exact commands you ran.
```

---

## Setup prompt (paste this to an AI or follow manually)

**Context:** I have the iHostMC project at `/opt/iHostMC` on an Ubuntu server (user `ubuntu`). I need to set it up so that:

1. Backend API runs on port 3010 (Node, needs PostgreSQL and a `.env` from `backend/.env.example`).
2. Website (Next.js) runs on port 3020 (needs `website/.env` with `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_APP_URL`).
3. The deploy builder runs (e.g. with PM2): it listens on port 9090; when triggered (webhook or manual or poll), it runs `git pull`, builds backend + website, runs DB migrations, and restarts backend + website (systemd) and optionally PM2 relay apps.
4. After setup, a `git push` to the deploy branch (e.g. `main`) should be able to trigger a deploy (via GitHub webhook to `http://THIS_SERVER:9090/webhook` or by polling).

**Steps to perform on the server:**

1. **Prerequisites**
   - Install Node.js 20+ (e.g. `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs` or nvm).
   - Install PostgreSQL, create DB and user, set `DATABASE_URL` in backend `.env`.
   - Install PM2 globally: `sudo npm install -g pm2`.
   - Ensure git is installed and, in `/opt/iHostMC`, `git remote -v` shows the correct origin (e.g. GitHub). If the project was rsync’d with `.git`, origin may already be set.

2. **Ownership**
   - If `/opt/iHostMC` was created as root: `sudo chown -R ubuntu:ubuntu /opt/iHostMC`.

3. **Backend**
   - `cd /opt/iHostMC/backend`
   - If no `.env`: `cp .env.example .env`, then edit `.env` and set at least: `DATABASE_URL`, `JWT_SECRET`, `PORT=3010`, `CORS_ORIGINS` (e.g. your site and `http://localhost:3020`), `WEBSITE_URL`. Optionally Stripe, Resend, OAuth, etc. (see `.env.example` comments).
   - `npm ci && npm run build && npm run db:migrate`
   - Create backup dir if needed: `sudo mkdir -p /opt/iHostMC/backups && sudo chown ubuntu:ubuntu /opt/iHostMC/backups`; set `BACKUP_STORAGE_PATH=/opt/iHostMC/backups` in `.env`.
   - Install systemd unit: `sudo cp /opt/iHostMC/deploy/ihostmc-backend.service /etc/systemd/system/`
   - Fix Node path in the unit: run `which node` (e.g. `/usr/bin/node` or `/home/ubuntu/.nvm/versions/node/v20.x.x/bin/node`). Edit the service: `sudo sed -i 's|ExecStart=.*|ExecStart=REPLACE_WITH_FULL_PATH/node dist/index.js|' /etc/systemd/system/ihostmc-backend.service` (replace `REPLACE_WITH_FULL_PATH` with the dir containing `node`).
   - Or manually: `sudo nano /etc/systemd/system/ihostmc-backend.service` and set `ExecStart=/path/to/node dist/index.js`, `User=ubuntu`, `WorkingDirectory=/opt/iHostMC/backend`, `EnvironmentFile=/opt/iHostMC/backend/.env`.
   - `sudo systemctl daemon-reload && sudo systemctl enable --now ihostmc-backend && sudo systemctl status ihostmc-backend`

4. **Website**
   - `cd /opt/iHostMC/website`
   - Create `.env` with at least: `NEXT_PUBLIC_API_URL=http://51.38.40.106:3010` (or your API URL), `NEXT_PUBLIC_APP_URL=http://51.38.40.106:3020` (or the URL users use to open the site).
   - `npm ci && npm run build`
   - Install systemd unit: `sudo cp /opt/iHostMC/deploy/ihostmc-website.service /etc/systemd/system/`
   - Fix paths and user: set `ExecStart` to use the same `node` as above (or `npm run start:server` with correct PATH). Set `User=ubuntu`, `WorkingDirectory=/opt/iHostMC/website`. The website service may use `EnvironmentFile=/opt/iHostMC/website/.env`; create that file if needed.
   - `sudo systemctl daemon-reload && sudo systemctl enable --now ihostmc-website && sudo systemctl status ihostmc-website`

5. **Deploy builder (auto build + refresh on git push)**
   - `cd /opt/iHostMC`
   - Optional: `cp deploy/.env.example deploy/.env` and edit `deploy/.env`. Set `GITHUB_WEBHOOK_SECRET` if you will add a GitHub webhook; set `POLL_INTERVAL_MS=120000` to poll every 2 min instead of webhook; set `PM2_APPS=` if this host does not run the relay; set `SYSTEMD_SERVICES=ihostmc-backend,ihostmc-website`.
   - Start builder with PM2: `pm2 start deploy/ecosystem.config.cjs` then `pm2 save`. Check: `pm2 logs iHostMC-builder`. Builder listens on port 9090.
   - Open firewall if needed: `sudo ufw allow 9090/tcp` (only if you want to trigger deploy from outside).

6. **Triggering a deploy**
   - Manual (on server): `curl -X POST http://localhost:9090/deploy` or `curl "http://localhost:9090/deploy?trigger=1"`. Force rebuild without new commit: `curl "http://localhost:9090/deploy?build=1"`.
   - From your machine after push: `./deploy/trigger-and-wait.sh http://51.38.40.106:9090` (if 9090 is reachable).
   - GitHub webhook: In repo Settings → Webhooks → Add webhook. Payload URL: `http://51.38.40.106:9090/webhook`. Content type: application/json. Secret: same as `GITHUB_WEBHOOK_SECRET` in `deploy/.env`. Events: Just the push event. On each push to `main`, the server will pull, build, and restart services.

7. **Verify**
   - Backend: `curl http://localhost:3010/health` or similar.
   - Website: open `http://51.38.40.106:3020` in a browser.
   - Builder status: `curl http://localhost:9090/status`.

---

## Short checklist (after transfer)

- [ ] Node 20+, PostgreSQL, PM2 installed
- [ ] `/opt/iHostMC` owned by `ubuntu`
- [ ] `backend/.env` from `.env.example` (DATABASE_URL, JWT_SECRET, PORT=3010, …)
- [ ] `backend`: npm ci, build, db:migrate; systemd unit installed and ExecStart/User fixed
- [ ] `website/.env` with NEXT_PUBLIC_API_URL and NEXT_PUBLIC_APP_URL
- [ ] `website`: npm ci, build; systemd unit installed and ExecStart/User fixed
- [ ] `deploy/.env` optional; PM2 started: `pm2 start deploy/ecosystem.config.cjs && pm2 save`
- [ ] Optional: GitHub webhook to `http://SERVER:9090/webhook` with secret in `deploy/.env`

**After editing the website (without git push):** From repo root run `npm run refresh-website` (or `./deploy/refresh-website.sh`) to build and restart the live website so changes go live.

---

## Server verification prompt (services running – ensure ihost.one config)

Use this when the services are already running but you want to confirm env and domains are set correctly for **ihost.one** / **api.ihost.one**. Paste into Cursor (or run the checks) on the server.

```
I'm on the iHostMC server. Services (ihostmc-backend, ihostmc-website, and optionally the deploy builder and relay) appear to be running. I need to make sure the server is configured for the ihost.one domains.

Please:

1. Check backend/.env: CORS_ORIGINS should include https://ihost.one (and http://localhost:3847, http://localhost:3020 if needed). WEBSITE_URL should be https://ihost.one. If either still references ihostmc.duckdns.org, update them and restart backend: sudo systemctl restart ihostmc-backend.

2. Check website/.env: NEXT_PUBLIC_API_URL should be https://api.ihost.one (or your API URL). NEXT_PUBLIC_APP_URL should be https://ihost.one (or the URL users open). If either still references ihostmc.duckdns.org, update them, then rebuild the website (cd /opt/iHostMC/website && npm run build) and restart: sudo systemctl restart ihostmc-website.

3. Verify nginx (if used): server_name and any proxy_pass should use ihost.one and api.ihost.one per deploy/nginx/ihost-one.conf or docs/DNS-IHOST-ONE.md. Reload nginx after any change: sudo nginx -t && sudo systemctl reload nginx.

4. Confirm services: systemctl status ihostmc-backend ihostmc-website; curl -s -o /dev/null -w "%{http_code}" http://localhost:3010; curl -s -o /dev/null -w "%{http_code}" http://localhost:3020. If the deploy builder runs: curl -s http://localhost:9090/status.

5. Report back: current values of CORS_ORIGINS, WEBSITE_URL (backend), NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_URL (website), and whether any were updated. If you had to rebuild the website, say so.
```
