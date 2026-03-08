import { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { query } from "../db/pool.js";

export type AdminChecker = (userId: string, userEmail: string) => Promise<boolean>;

/** Check if user is admin: either in DB (admins table) or in bootstrap env list. */
export async function isAdmin(userId: string, userEmail: string): Promise<boolean> {
  const email = userEmail?.toLowerCase();
  if (!email) return false;

  // Bootstrap: env list (always allowed)
  const adminEmails = config.devTierOverrideEmails;
  if (adminEmails.includes(email)) return true;

  // DB-backed admins
  try {
    const r = await query<{ user_id: string }>(
      "SELECT user_id FROM admins WHERE user_id = $1",
      [userId]
    );
    return r.rowCount !== null && r.rowCount > 0;
  } catch {
    // Table may not exist before migration 021
    return false;
  }
}

/** Require auth + admin permission (DB or bootstrap env list). */
export async function adminMiddlewareAsync(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  const email = (req as Request & { userEmail?: string }).userEmail;
  if (!userId || !email) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const allowed = await isAdmin(userId, email);

  if (!allowed) {
    const adminEmails = config.devTierOverrideEmails;
    if (adminEmails.length === 0) {
      res.status(403).json({ error: "Admin access is not configured" });
    } else {
      res.status(403).json({ error: "Admin access required" });
    }
    return;
  }
  next();
}

/** Synchronous wrapper for Express (backward compat). */
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  adminMiddlewareAsync(req, res, next).catch((err) => {
    console.error("[admin]", err);
    res.status(500).json({ error: "Internal server error" });
  });
}
