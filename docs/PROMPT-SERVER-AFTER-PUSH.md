# Prompt: What to do on the server after a push

Use this (or the steps below) in **Cursor on the server** (or SSH) after the repo has been pushed from your dev machine.

For the **latest push summary, server steps, and Cursor continuation prompt** (xAPI, admin dashboard, AI proxy, API keys, etc.), see **PROMPT-PUSH-AND-CONTINUE.md**.

---

## Copy-paste prompt for server Cursor

```text
Update the iHostMC server from the latest main:

1. In the repo root run: git pull origin main (or your deploy branch).

2. Backend: cd backend. Run npm ci if package.json or lockfile changed. Run npm run db:migrate so any new migrations are applied. Restart the backend (e.g. sudo systemctl restart ihostmc-backend). If .env.example or docs mention new env vars, add them to backend/.env.

3. Website: cd website. Run npm ci if deps changed, then npm run build. Restart the website (e.g. pm2 restart ihostmc-website or sudo systemctl restart ihostmc-website).

4. Quick check: backend GET /health returns ok; website loads; app can sync and use Backup & Sync / iterations if applicable.
```

---

## After push: admin dashboard, xAPI, migration 015

- **Migrations:** Run `npm run db:migrate` in backend so migration 015 (`admin_simulate_limit`) is applied.
- **Backend .env:** Add `XAI_API_KEY=<key from console.x.ai>` (server-side only; never commit). Ensure `DEV_TIER_OVERRIDE_EMAIL=overflowedimagination@gmail.com` (or your admin emails) so that account can use the Admin dashboard.
- **Backend:** `npm ci` if deps changed, then `sudo systemctl restart ihostmc-backend`.
- **Website:** `npm ci` if deps changed, `npm run build`, then restart (e.g. `pm2 restart ihostmc-website`).
- **Verify:** GET /health ok; website loads; sign in with override email → "Admin" in nav → Admin page shows usage overview and "Simulate at limit" toggle.

---

## After push "sync one server + backup iterations" (3d3e8dc)

- **No new migrations** in this push. Migrations 011 (backups soft delete) and 012 (sync_servers backfill) should already be applied.
- **No new backend env vars.** Existing `BACKUP_STORAGE_PATH` is enough for sync and archives.
- **Backend:** Pull gives you latest code. Restart backend so it’s running the current code: `cd backend && sudo systemctl restart ihostmc-backend` (or your service name).
- **Website:** Pull and rebuild/restart only if website files changed; this push was mostly app (Vite) changes.
- **App:** Users get the new behavior (sync one server only, automatic backup iterations in Cloud tab) when they use an updated app build; no server-only steps required for that.
