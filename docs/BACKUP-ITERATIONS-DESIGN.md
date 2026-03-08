# Backup iterations – design (auto snapshots on a schedule)

**Status:** Planned. Servers are “born to be on cloud”; live sync keeps the latest state; automatic saved backups (iterations) run on intervals.

## Goals

- **Live sync** – Always keep the latest backup/sync up to date (current behavior: user or auto-sync pushes files and metadata).
- **Automatic iterations** – Save a snapshot/archive on a schedule so users have history (every 3 hours, every day, every week) with **configurable intervals** per user or per server.
- **Naming** – Iterations stored with clear naming: date, server info, occurrence type (e.g. `server-name_2025-02-28_12-00_3h`).
- **UI** – Setup flow with cards, stats, and controls for occurrence intervals (3h / 1d / 1w defaults; user can change).

## Default intervals (proposal)

| Occurrence | Default | Purpose |
|------------|--------|---------|
| Frequent   | Every 3 hours | Recent rollback |
| Daily      | Every 24 hours | Day-level history |
| Weekly     | Every 7 days | Long-term history |

Users can enable/disable each and set their own intervals (e.g. every 6h, every 12h, every 2 days).

## Implementation outline

1. **Backend**
   - Store iteration schedule per user or per server (e.g. `backup_iteration_schedule` or in `sync_servers` / user settings).
   - Endpoint to create snapshot/archive (already have POST archive); ensure naming includes date + occurrence type.
   - Cron or scheduled job that, for each user/server with iterations enabled, checks last run and creates a snapshot when the next interval has passed (3h / 1d / 1w).

2. **App**
   - Settings or Cloud tab: “Automatic backups (iterations)” section with cards:
     - Toggles for “Every 3 hours”, “Daily”, “Weekly”.
     - Optional custom interval inputs.
     - Stats: last run, next run, count of iterations per server.
   - Persist schedule (backend or local then sync to backend).

3. **Naming**
   - Iteration backups: e.g. `ServerName_2025-02-28_12-00_3h`, `ServerName_2025-02-28_daily`, `ServerName_2025-W09_weekly` so they’re sortable and identifiable.

4. **Live sync**
   - Keep current behavior: sync can run anytime (manual or auto on app open). Iterations are **in addition**: on a timer, create a snapshot and store under “iterations” with the naming above.

## Notes

- One snapshot can satisfy multiple intervals (e.g. one daily snapshot counts as “daily” and can also be the “3h” slot if it’s the first in that 3h window); or run each interval independently; design choice when implementing.
- Storage limits and backup count limits (free vs Backup/Pro) apply to iterations as well; consider caps per interval type (e.g. keep last 4 weekly, last 7 daily, last 24 for 3h).
