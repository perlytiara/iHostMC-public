import { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

/** Require auth + user email in dev override list (treated as admin). */
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  const email = (req as Request & { userEmail?: string }).userEmail;
  if (!email) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const adminEmails = config.devTierOverrideEmails;
  if (adminEmails.length === 0) {
    res.status(403).json({ error: "Admin access is not configured" });
    return;
  }
  if (!adminEmails.includes(email.toLowerCase())) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
