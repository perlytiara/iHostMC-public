# Backup cloud – how it works (for Cursor / Windows context)

This doc summarizes how the **backup cloud** (sync, snapshots, archives, trash) works and what was changed recently. Use it when bringing up the project on Windows or when Cursor needs context.

---

## Concepts

- **Live synced data** – The latest files the app has uploaded for a server. One “current” state per server. Shown on the dashboard under “Live sync” / “Live synced data.” Not yet saved as an archive.

- **Snapshot** – A point-in-time record (file list, mods, plugins, version). Created when the user clicks **“Archive this sync”** on the website: the current synced state is stored as a backup row with `metadata.source === "sync_snapshot"`. No zip file; used for reference and to free the live sync for the next upload.

- **Archives** – All saved backups: full/mini zips plus snapshots. Shown in “Snapshots & archives” (or “Archives” on the per-server page). Count toward backup limits.

- **Trash** – Soft-deleted backups (`backups.deleted_at` set). Shown in the Trash tab. Restorable until **“Purge expired now”** (after 30 days). Storage is freed on purge.

- **Remove from cloud** – User deletes the current synced data for a server. We now (1) create a snapshot **in trash** (best-effort), (2) **always** delete sync files from disk, remove the server’s sync directory, clear `sync_files` and `sync_manifests`, and set `sync_servers.mini_synced = false`. So the server always shows as empty after remove; any leftover disk data is cleaned up.

---

## Recent changes (what we did)

1. **Dashboard/website UI**
   - **BackupsPage**: “Backup cloud” intro; tabs Overview | Servers | Snapshots & archives | Trash. “Live synced data” section; filter for Snapshots in archives.
   - **CloudServerPage**: Tabs **Live sync** | **Snapshots** | **Archives** | **Trash**. Live sync tab has current synced data + file log; Snapshots tab lists only `sync_snapshot` backups.

2. **App**
   - **BackupSyncSection**: Wording aligned with dashboard (Backup cloud, live synced data, snapshots & archives).
   - **Sync flow**: After sync, app posts a rich manifest (file list, mods, plugins, version) so the backend has a proper snapshot.

3. **Backend – remove from cloud**
   - **DELETE `/api/sync/servers/:serverId/synced-data`**:
     - Tries to create a snapshot row with `deleted_at = now()` (trash). If that fails, we log and continue.
     - Deletes each synced file from disk, then **removes the whole server sync directory** `sync/<userId>/<serverId>/` with `fs.rmSync(..., { recursive: true })`.
     - Clears `sync_files`, `sync_manifests`, and updates `sync_servers`. So the site and disk stay in sync.

4. **Migrations**
   - All applied (including `011_backups_soft_delete.sql` for `deleted_at`). Run `npm run db:migrate` in `backend/` if you pull on a new machine.

5. **One-off cleanup**
   - **`backend/scripts/clean-sync-orphans.mjs`** – Removes sync data from disk and DB for servers that still had rows or orphan dirs. Was run once on the server to clear leftover data (e.g. 174 files for one server, ~248MB). Safe to run again if needed: `cd backend && node scripts/clean-sync-orphans.mjs` (uses `.env` for `DATABASE_URL`, `BACKUP_STORAGE_PATH`).

---

## Storage layout (backend)

- **BACKUP_STORAGE_PATH** (e.g. `/opt/iHostMC/backups` or `backend/backups`):
  - `sync/<userId>/<serverId>/` – synced files for that server (removed when user “Remove from cloud” or after cleanup script).
  - `sync/.tmp/` – multer temp uploads.
  - `<userId>/` – backup zips and snapshot metadata (paths like `__snapshot_<serverId>_<ts>` for snapshots).

---

## On Windows / after pull

1. **Backend**: `cd backend && npm ci && npm run db:migrate` (and set `BACKUP_STORAGE_PATH` in `.env` if you want real storage).
2. **Website**: `cd website && npm ci && npm run build` (and run dev or start as usual).
3. **App**: Normal run; Backup & Sync talks to the same backend (e.g. `VITE_API_BASE_URL`).

No extra steps for the cloud behavior; the above is for context and for fixing sync/trash/disk issues.

---

## Export and import

- **Full copy (ZIP):** From a server’s Live sync tab, use **Export ZIP** to download all synced files plus `ihostmc-import.json` at the root. Re-import that ZIP in Dashboard → Backups → Overview → Import to create a new sync server with the same files.
- **Snapshot (single file):** Use **Export snapshot** on a server or on a backup detail page to get a `.ihostmc-snapshot` JSON file. Use **Import snapshot** on the dashboard to add it as a metadata-only backup.
- **Format spec:** See **`docs/IHOSTMC-SNAPSHOT-FORMAT.md`** and the website docs page (Export & import format).
