# Prompt: Cursor on Windows – catch up and work app + website in tandem

Use this when you're on **Windows** in Cursor and want to: pull latest, refresh so app and website stay in sync, and keep working on both in tandem (including backup/sync).

---

## Copy-paste prompt for Cursor (Windows)

```text
I'm on Windows in Cursor, working on iHostMC. I need to:

1. **Catch up from repo**  
   Pull latest: `git pull origin main`. Then in repo root run `npm install`. If I'm running the app from source: `npm run tauri dev` (or `npm run tauri build` to build installer). If I'm running the website locally: in `website/` run `npm install` and `npm run dev` (or `npm run start` after build). Tell me what commands to run so app and website (if I use it locally) are on the latest code.

2. **Refresh services**  
   If I have a **server** (backend + website deployed): I need the server updated too. Use the steps in docs/PROMPT-SERVER-UPDATE.md: pull on server, backend `npm ci` + `npm run db:migrate` + restart backend, website `npm ci` + `npm run build` + restart website. If I'm in Cursor on the server, run that prompt there. If I only have local dev: just make sure backend URL is set (e.g. VITE_API_BASE_URL in .env or website .env) so the app and website talk to the right API.

3. **Start syncing (new)**  
   So I can use Backup & Sync and the new cloud backup (manifest, preset, tags, iterations):  
   - App: Settings → Backup & Sync → sign in if needed, then "Sync now" to register servers and upload.  
   - Website: dashboard → Backups / Cloud: view servers, snapshots, create archive, enable iterations (3h/daily/weekly). Iterations are off by default; when enabled each run replaces the previous backup of that type.  
   - If the app says "Sync not available", the server needs migrations: on the server run `cd backend && npm run db:migrate && sudo systemctl restart ihostmc-backend` (see docs/PROMPT-SERVER-UPDATE.md or PROMPT-BACKUP-SYNC-SERVER.md).

4. **Work app and website in tandem**  
   - **App** (Tauri/Vite): repo root, `npm run tauri dev`. Code lives in `src/` (features, lib, etc.). Backup/sync: `src/features/servers/`, `src/features/settings/components/BackupSyncSection.tsx`, `src/lib/iteration-prefs.ts`, `src/lib/api-client.ts`, `src/features/servers/utils/backup-manifest.ts`.  
   - **Website** (Next.js): `website/`, `npm run dev` (e.g. port 3847 or 3020). Pages: `website/src/app/_pages/BackupsPage.tsx`, `BackupDetailPage.tsx`, `CloudServerPage.tsx`; types: `website/src/lib/cloud.ts`.  
   - **Backend** (Node): `backend/`, `npm run dev` (tsx watch). Sync/archive: `backend/src/routes/sync.ts`, `backend/src/lib/sync-archive.ts`.  
   - Keep API and types in sync: `src/lib/api-client.ts` (app) and `website/src/lib/cloud.ts` (website) should match backend (sync routes, backup metadata, iterationType). When you change backup/sync behavior, update app + website + backend together and run the server update flow after push.
```

---

## Quick steps (no prompt)

### 1. Catch up (Windows)

```bash
cd iHostMC
git pull origin main
npm install
# App (from source):
npm run tauri dev
# Optional – website locally:
cd website && npm install && npm run dev
```

### 2. Refresh server (after you or someone pushed)

- **Cursor on the server:** Open `docs/PROMPT-SERVER-UPDATE.md` and paste the prompt into the agent; it will pull, migrate, restart backend and website.
- **SSH:** In repo on server: `git pull origin main`, then backend `npm ci && npm run db:migrate && sudo systemctl restart ihostmc-backend`, then website `npm ci && npm run build && sudo systemctl restart ihostmc-website`.

### 3. Start syncing

- In the **app**: Settings → Backup & Sync → sign in → Sync now. Servers show under Cloud; you can enable iterations (3h/daily/weekly) per server; they replace the previous backup of that type when enabled.
- On the **website**: Dashboard → Backups – view servers, snapshots (preset, tags: must/cache/mini/big), archives, trash. Create archive from a server; iterations replace old on occurrence.

### 4. Work in tandem

| What you edit        | Where (app)                    | Where (website)              | Backend              |
|----------------------|--------------------------------|------------------------------|----------------------|
| Backup/sync types    | `src/lib/api-client.ts`        | `website/src/lib/cloud.ts`   | -                    |
| Manifest / tags       | `src/features/servers/utils/backup-manifest.ts` | BackupDetailPage, BackupsPage | `sync-archive.ts`    |
| Iterations           | `src/lib/iteration-prefs.ts`, `useBackupIterations.ts` | BackupsPage copy       | `sync.ts` archive + iterationType |
| Sync UI              | `BackupSyncSection.tsx`, ServerList | BackupsPage, CloudServerPage | `sync.ts`            |

After pushing: pull and refresh on the server (PROMPT-SERVER-UPDATE); pull and `npm install` + `tauri dev` (and website `npm run dev` if local) on Windows.

---

## Related docs

- **PROMPT-WINDOWS-GIT-PULL-AND-AUTH-SETUP.md** – Pull, OAuth auth-setup, and app build.
- **PROMPT-SERVER-UPDATE.md** – Server update (pull, migrate, restart backend & website).
- **PROMPT-SERVER-AFTER-PUSH.md** – Short “after push” checklist for server.
- **PROMPT-BACKUP-SYNC-SERVER.md** – Fix “Sync not available” and backup storage.
