import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getPool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const pool = getPool();

  const schemaPath = join(__dirname, "schema.sql");
  await pool.query(readFileSync(schemaPath, "utf-8"));
  console.log("Schema applied.");

  const migrationsDir = join(__dirname, "migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), "utf-8");
    await pool.query(sql);
    console.log("Migration applied:", f);
  }

  console.log("Migration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
