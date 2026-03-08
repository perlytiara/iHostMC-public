# Prompt: Server update for Backup & Sync

Use this when the **app** shows "Sync not available" or you need the server to support **Backup & Sync** (sync server list, upload/manage backups on the website).

---

## Copy-paste prompt for the server

```text
Update the iHostMC server so Backup & Sync works from the app.

1. Pull latest code in the repo: git pull origin main (or the branch we deploy from).

2. Backend – migrations (required for "Sync now"):
   - cd backend
   - npm run db:migrate   (creates/updates sync_servers table; fixes "Sync not available")
   - npm ci              (if package.json or lockfile changed)
   - Restart backend: sudo systemctl restart ihostmc-backend (or pm2/systemd name you use)

3. Backend – backup storage (so users can upload backups):
   - In backend/.env set BACKUP_STORAGE_PATH to a directory, e.g. /var/ihostmc/backups (create it if needed: sudo mkdir -p /var/ihostmc/backups && sudo chown <app-user> /var/ihostmc/backups)
   - Optional: BACKUP_STORAGE_LIMIT_GB=50 (see backend/.env.example and docs/SERVER-BACKUP-STORAGE.md)
   - Restart backend again after changing .env

4. Website (if we deploy it on this server):
   - cd website && npm ci && npm run build && restart the website service

5. Verify:
   - Backend: curl -s http://localhost:3010/health → {"ok":true}
   - App: Settings → Backup & Sync → "Sync now" should succeed (no "Sync not available")
   - Website: open the backups page; user can upload/download backups
```

---

## Short version (migrations only)

If you only need to fix **"Sync not available"**:

```bash
cd /path/to/iHostMC/backend
npm run db:migrate
sudo systemctl restart ihostmc-backend
```

---

## What the app expects

- **Sync**: `POST /api/sync/servers` and `GET /api/sync/servers` (backend must have run migrations so `sync_servers` table exists).
- **Backups**: `GET /api/backups`, `POST /api/backups` (upload), `GET /api/backups/report`, `GET /api/backups/:id` (backend needs `BACKUP_STORAGE_PATH` in `.env`).

See **PROMPT-SERVER-UPDATE.md** for the full server update checklist and **SERVER-BACKUP-STORAGE.md** for backup tiers and env.
