/**
 * One-off: delete a user by email. Usage: node scripts/delete-user-by-email.mjs <email>
 * Loads .env from backend root.
 */
import "dotenv/config";
import pg from "pg";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/delete-user-by-email.mjs <email>");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const r = await pool.query("DELETE FROM users WHERE email = $1", [email.trim().toLowerCase()]);
  console.log("Deleted", r.rowCount ?? 0, "user(s) for", email);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
