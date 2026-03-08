#!/usr/bin/env node
/**
 * One-off: remove sync files from disk and DB for servers that still have data.
 * Run from backend: node scripts/clean-sync-orphans.mjs (loads .env automatically if dotenv available)
 */
import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const basePath = process.env.BACKUP_STORAGE_PATH || path.join(root, "backups") || "/tmp/ihostmc-sync";

function syncStorageDir(userId, serverId) {
  return path.join(basePath, "sync", userId, serverId);
}

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const client = await pool.connect();
  try {
    const r = await client.query(
      "SELECT server_id, user_id, COUNT(*) as n FROM sync_files GROUP BY server_id, user_id"
    );
    if (r.rows.length === 0) {
      console.log("No sync_files in DB. Checking for orphan dirs on disk...");
      const syncBase = path.join(basePath, "sync");
      if (fs.existsSync(syncBase)) {
        const users = fs.readdirSync(syncBase).filter((d) => d !== ".tmp" && !d.startsWith("."));
        for (const uid of users) {
          const userDir = path.join(syncBase, uid);
          if (!fs.statSync(userDir).isDirectory()) continue;
          const servers = fs.readdirSync(userDir);
          for (const sid of servers) {
            const dir = path.join(userDir, sid);
            if (fs.existsSync(dir)) {
              fs.rmSync(dir, { recursive: true });
              console.log("Removed orphan dir:", dir);
            }
          }
        }
      }
      return;
    }
    for (const row of r.rows) {
      const { server_id, user_id, n } = row;
      const dir = syncStorageDir(user_id, server_id);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
        console.log("Removed dir:", dir);
      }
      await client.query("DELETE FROM sync_files WHERE server_id = $1 AND user_id = $2", [server_id, user_id]);
      await client.query("DELETE FROM sync_manifests WHERE server_id = $1 AND user_id = $2", [server_id, user_id]);
      await client.query(
        "UPDATE sync_servers SET mini_synced = false, last_synced_at = null, updated_at = now() WHERE id = $1 AND user_id = $2",
        [server_id, user_id]
      );
      console.log("Cleared DB for server", server_id, "(", n, "files)");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
