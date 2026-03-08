/**
 * One-off: set email_verified_at for a user by email. Usage: node scripts/verify-user-by-email.mjs <email>
 */
import "dotenv/config";
import pg from "pg";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/verify-user-by-email.mjs <email>");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const r = await pool.query(
    "UPDATE users SET email_verified_at = now(), email_verification_token = NULL, email_verification_expires_at = NULL WHERE email = $1",
    [email.trim().toLowerCase()]
  );
  console.log("Verified", r.rowCount ?? 0, "user(s) for", email);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
