# Server backup storage – update and hosting

How backup storage works and how to update the server for tiers and reporting.

## Overview

- **Mini files**: Configs, mod/plugin names, versions, metadata. Hosted on the same server; we can host these without strict limits.
- **Big files**: Full world maps, large archives. Use storage tiers (5–500 GB). We don’t overbook; one server, subscriber revenue funds capacity.

## Env and config

On the backend server (e.g. in `backend/.env`):

- **`BACKUP_STORAGE_PATH`** (required for backups): Directory where user backup files are stored. Created per user under this path. Example: `/var/ihostmc/backups`.
- **`BACKUP_STORAGE_LIMIT_GB`** (optional): Global storage limit in GB. If set, the API reports it so the website can show “used / limit”. `0` = no limit.
- **`FREE_TIER_MAX_BACKUPS`** / **`BACKUP_TIER_MAX_BACKUPS`**: Max backup count per user (free vs Backup/Pro). Existing config.

## API

- **GET /api/backups** – List backups (unchanged).
- **GET /api/backups/report** – Returns `totalSizeBytes`, `totalCount`, `byKind: { mini, full }`, `filesTooBigCount`, `storageLimitBytes` (if `BACKUP_STORAGE_LIMIT_GB` set). Use for dashboard/UI.
- **GET /api/backups/limits** – Count and max backups per tier (unchanged).

## How to update the server

1. Pull latest code (includes `backend/src/routes/backups.ts` with `GET /report` and `backend/src/config.ts` with `backupStorageLimitGb`).
2. Set env (optional): `BACKUP_STORAGE_LIMIT_GB=50` (or your chosen limit).
3. Restart backend: `sudo systemctl restart ihostmc-backend` (or your service name).
4. Ensure `BACKUP_STORAGE_PATH` is on a volume with enough space for your tiers; add capacity as you add subscribers.

## Tiers on the website

Storage tiers (5, 10, 25, 50, 300, 500 GB) and pricing are shown on the dashboard Backups page. Actual billing is via Stripe; storage add-ons per tier can be enabled by support until self-serve is added.
