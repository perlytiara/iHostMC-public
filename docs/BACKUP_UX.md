# Backup & sync UI — app and website in tandem

This doc describes how backup/sync is grouped in the app so the **website** can mirror the same structure for a consistent experience.

## App structure (Settings → Backup & Sync)

1. **Quick sync** — One primary action: **Sync all**. Secondary: **Refresh** (from website). Status and last synced time in the same card. Dead simple: one button does the main job.
2. **Backup options** — Grouped toggles and choices: auto backup when app opens, iterations for new servers, enable for all servers, storage tier hint. Plus **Find the right save type** (short random questions → suggested tier: Snapshot / Structural / Full).
3. **Your servers** — List of servers with sync status (synced ✓, archive count, files synced).
4. **Manage on web** — Link to open the website (snapshots, archives, trash).

## App structure (Storage page)

1. **Quick actions** — Refresh, Browse on web (same idea: primary refresh, link to website).
2. **Storage usage** — Used, backup count, limit; optional mini/big breakdown.
3. **Your servers** — Synced servers with backup count and “View on web” per server.
4. **Recent backups** — List of recent backups with name, kind, size.

## Save tier helper

- **Find the right save type** is a short flow (2 random questions) that suggests **Snapshot** (metadata only, smallest), **Structural** (config + mods + plugins), or **Full** (everything including worlds). Helps users “do less to save space” or choose full when they need restores.
- Use this when creating a backup in **Servers → select server → Backup & Sync** (Snapshot / Structural / Full / Map / Customize).

## Cancel save

- If the user **cancels** a save (Cancel save button while a backup is in progress), the backup is **not** created — nothing is saved. Any partial upload may remain on the server until the user removes it from the website.
- UI: hint under Manual backup + **Cancel save** button when a save is in progress.

## Website tandem

To keep app and web in sync:

- Mirror the same **grouping**: Quick actions (or equivalent), Storage/usage, Your servers, Recent backups (or archives), Manage/trash.
- Use the same **labels** where possible (e.g. “Quick sync” / “Quick actions”, “Your servers”, “Manage on web” / “Browse on web”).
- So users see the same mental model in the app and on the website.
