# iHostMC Snapshot & Import Format

This document describes the **iHostMC Snapshot** (single-file) and **iHostMC Import** (ZIP with manifest) formats. They let you export your backed-up or synced server data as a portable file and re-import it to restore or create a server.

**Format version:** 1

**References:** Website [Export & import format](/docs#export-format), [Dashboard → Backups → Import](/dashboard/backups) (Overview tab), backend export/import APIs below.

---

## 1. iHostMC Snapshot (single file)

A **snapshot** is a single JSON file (`.ihostmc-snapshot` or `.json`) that describes a server backup: file tree, mods, plugins, preset (server type and version), and optional references to file contents.

- **Use:** Export a backup or sync state as one readable file; share or archive; import later to create a server or restore metadata.
- **Extension:** `.ihostmc-snapshot` (recommended) or `.json`
- **MIME:** `application/json` or `application/vnd.ihostmc.snapshot+json`

### 1.1 Top-level schema

```json
{
  "format": "iHostMC Snapshot",
  "version": 1,
  "exportedAt": "2025-03-02T12:00:00.000Z",
  "server": {
    "name": "My Server",
    "hostId": "optional-host-id"
  },
  "manifest": { ... },
  "filesIncluded": "none"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | string | Yes | Literal `"iHostMC Snapshot"` |
| `version` | number | Yes | Schema version (currently `1`) |
| `exportedAt` | string | Yes | ISO 8601 timestamp |
| `server` | object | No | Display name and optional host id |
| `manifest` | object | Yes | See [Manifest](#12-manifest) |
| `filesIncluded` | string | Yes | `"none"` (metadata only), `"manifest_only"`, or `"zip_companion"` (files in a separate ZIP with same base name or path) |

### 1.2 Manifest

The `manifest` object matches the snapshot manifest used elsewhere in iHostMC (file tree, mods, plugins, preset, categories).

| Field | Type | Description |
|-------|------|-------------|
| `file_tree` | array | Tree of files/dirs: `{ name, path, is_dir, size_bytes?, tag?, category?, children? }` |
| `mods` | string[] | Mod filenames or names |
| `plugins` | string[] | Plugin filenames or names |
| `version` | string | Minecraft / game version |
| `server_type` | string | e.g. Paper, Forge, Vanilla |
| `minecraft_version` | string | Same as version |
| `preset` | object | `{ server_type?, minecraft_version?, loader_version?, build_id? }` for re-downloading server JAR |
| `mustFiles` | string[] | Paths tagged as essential |
| `cacheFiles` | string[] | Paths tagged as cache |
| `categories` | object | Counts by category (config, world, mod, plugin, etc.) |

---

## 2. iHostMC Import (ZIP with manifest)

A **ZIP export** contains all backed-up files plus a single manifest at the root so the same ZIP can be **imported** to recreate the server and its files.

- **Manifest path in ZIP:** `ihostmc-import.json` (root of the ZIP)
- **File layout:** All server files at relative paths (e.g. `config/server.properties`, `mods/...`, `world/...`). Paths must be safe (no `..`, normalized).

### 2.1 Import manifest schema (`ihostmc-import.json`)

Same as the snapshot format, with `filesIncluded` set to `"inline"` to indicate files are inside this ZIP.

```json
{
  "format": "iHostMC Snapshot",
  "version": 1,
  "exportedAt": "2025-03-02T12:00:00.000Z",
  "server": { "name": "My Server", "hostId": "" },
  "manifest": { ... },
  "filesIncluded": "inline"
}
```

Import flow:

1. Extract ZIP and read `ihostmc-import.json`.
2. Validate `format` and `version`.
3. Create a sync server (or backup row) and apply `server.name` and manifest.
4. Place each file from the ZIP at the path given in the manifest / file tree (relative to server root).

---

## 3. API summary

| Action | Endpoint | Description |
|--------|----------|-------------|
| Export sync as ZIP | `GET /api/sync/servers/:serverId/export?format=zip` | All synced files + `ihostmc-import.json` |
| Export sync as snapshot | `GET /api/sync/servers/:serverId/export?format=snapshot` | Single `.ihostmc-snapshot` JSON |
| Export backup as snapshot | `GET /api/backups/:id/export?format=snapshot` | Snapshot JSON from backup metadata |
| Download backup (ZIP) | `GET /api/backups/:id/download` | Original backup file (no manifest added) |
| Import ZIP | `POST /api/sync/import` | Multipart: ZIP with `ihostmc-import.json` → new sync server + files |
| Import snapshot | `POST /api/backups/import` | Multipart: `.ihostmc-snapshot` file → new snapshot backup (metadata only) |

---

## 4. Categories and tags

Exported manifests can include:

- **Tags:** `must`, `cache`, `mini`, `big` (backup scope)
- **Categories:** `config`, `world`, `mod`, `plugin`, `library`, `jar`, `cache`, `other`

These are used by the app and website for filtering and display; import uses the manifest to restore structure and optionally re-tag files.

---

## 5. References

- Backend: `backend/src/routes/sync.ts` (export), `backend/src/routes/backups.ts` (backup export/import), `backend/src/lib/export-import.ts` (shared format helpers)
- Website: Dashboard → Backups → Export / Import; [Export & import format](/docs#export-format)
