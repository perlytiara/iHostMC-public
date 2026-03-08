# Prompt: Server update (git pull, migrate, restart)

Use this prompt (or follow the steps) when you need to **update the iHostMC server** after pushing backend, website, or database changes.

---

## Prompt (copy-paste this)

```text
I need to update the iHostMC server. Please:

1. Pull the latest code: in the repo root run `git pull origin main` (or the branch we deploy from).

2. Backend: cd backend, run `npm ci` if deps changed, then `npm run db:migrate` for any new migrations, then restart the backend (e.g. `sudo systemctl restart ihostmc-backend`). If we added new env vars (e.g. BACKUP_STORAGE_LIMIT_GB), tell me what to add to backend/.env.

3. Website: cd website, run `npm ci` if deps changed, then `npm run build`, then restart the website (e.g. `pm2 restart ihostmc-website` or `sudo systemctl restart ihostmc-website`).

4. Verify: backend GET /health returns { "ok": true }; website loads and login/dashboard work. If there's a new API (e.g. GET /api/backups/report), confirm it's reachable when authenticated.

5. Optional: If backup storage changed, ensure BACKUP_STORAGE_PATH is set and optionally BACKUP_STORAGE_LIMIT_GB; see docs/SERVER-BACKUP-STORAGE.md for how to update.

6. Backup & Sync: If the app shows "Sync not available. Run database migrations on the server", run `npm run db:migrate` in the backend directory. That creates/updates the sync_servers table so "Sync now" in Settings → Backup & Sync works. Backups are stored on this server; set BACKUP_STORAGE_PATH in backend/.env so uploads work.
```

---

## Fix "Sync not available" (Backup & Sync)

When the app shows **"Sync not available. Run database migrations on the server (npm run db:migrate in backend)."**:

1. **SSH** into the server and go to the repo (e.g. `cd /opt/iHostMC`).
2. **Run migrations** in the backend:

   ```bash
   cd backend
   npm run db:migrate
   sudo systemctl restart ihostmc-backend
   ```

3. **Optional – backup storage**: So users can upload backups from the app or website, set in `backend/.env`:

   - `BACKUP_STORAGE_PATH=/var/ihostmc/backups` (or your path; directory will be created per user)
   - Optionally `BACKUP_STORAGE_LIMIT_GB=50` (see **SERVER-BACKUP-STORAGE.md**)

4. **Verify**: In the app, open Settings → Backup & Sync, tap **Sync now**. It should succeed and list "Which are synced". Open the website backups page to upload/download.

---

## Steps (no prompt)

1. **SSH** into the server and go to the repo (e.g. `cd /opt/iHostMC`).

2. **Pull latest**

   ```bash
   git fetch
   git pull origin main
   ```

3. **Backend**

   ```bash
   cd backend
   npm ci
   npm run db:migrate
   sudo systemctl restart ihostmc-backend
   sudo systemctl status ihostmc-backend
   ```

   - If `.env` needs new variables (e.g. `BACKUP_STORAGE_LIMIT_GB`), add them and restart again.
   - See `backend/.env.example` and **docs/SERVER-BACKUP-STORAGE.md** for backup-related env.

4. **Website**

   ```bash
   cd ../website
   npm ci
   npm run build
   sudo systemctl restart ihostmc-website
   # or: pm2 restart ihostmc-website
   ```

5. **Verify**

   - Backend: `curl -s http://localhost:3010/health` (or your backend URL) → `{"ok":true}`.
   - Website: open the site, sign in, check dashboard and backups page.

6. **Optional – backup storage**

   - If you use backup storage: set `BACKUP_STORAGE_PATH` in `backend/.env`; optionally `BACKUP_STORAGE_LIMIT_GB`.
   - See **docs/SERVER-BACKUP-STORAGE.md** for tiers and reporting.

---

## Quick checklist

- [ ] `git pull` in repo
- [ ] Backend: `npm ci` (if deps changed)
- [ ] Backend: `npm run db:migrate`
- [ ] Backend: restart service
- [ ] Website: `npm ci` (if deps changed)
- [ ] Website: build + restart
- [ ] Health check and smoke test
- [ ] Optional: backup env (BACKUP_STORAGE_PATH, BACKUP_STORAGE_LIMIT_GB)

---

---

## What to do next: Sync big files (HTTP 500)

If the app shows **big files failed (e.g. HTTP 500)** and "Plan (scan)" shows more big data than "Synced", the backend is rejecting or timing out large uploads. Do this on the server:

1. **Backend** already allows up to 500 MB per file for `POST /api/sync/servers/:serverId/files`. No code change needed there.

2. **Reverse proxy (nginx, etc.)** must allow large bodies and long timeouts for the API:
   - Set `client_max_body_size` to at least **512M** (or 1G) for the API location that proxies to the backend.
   - Set `proxy_read_timeout` and `proxy_send_timeout` to at least **600s** (10 minutes) for the sync route, so 100MB+ uploads don’t time out.

3. **Example (nginx)** for the API server block or location:
   ```nginx
   location /api/ {
     client_max_body_size 512M;
     proxy_read_timeout 600s;
     proxy_send_timeout 600s;
     proxy_pass http://localhost:3010;  # or your backend upstream
     # ... rest of proxy_* settings
   }
   ```

4. **Reload nginx** after editing: `sudo nginx -t && sudo systemctl reload nginx`.

5. **Verify**: In the app, run Sync Files again. Big files (e.g. 26 MB+ jars) should upload; the "Synced" big total should match the "Plan (scan)" total once no failures remain.

---

## Related docs

- **PROMPT-BACKUP-SYNC-SERVER.md** – Prompt for fixing "Sync not available" and enabling Backup & Sync on the server.
- **SERVER-DEPLOY.md** – Full deployment and env checklist.
- **SERVER-UPDATE-PROMPT.md** – Detailed update steps and recent changes.
- **SERVER-BACKUP-STORAGE.md** – Backup storage, tiers, and report API.
- **SERVER-BILLING-PROMPT.md** – Stripe and billing.
