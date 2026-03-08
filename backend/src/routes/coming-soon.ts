import { Router, Request, Response } from "express";
import { query } from "../db/pool.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/coming-soon – add email to notify list (no auth). Body: { email: string }. */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Please enter a valid email address" });
    return;
  }
  try {
    await query(
      "INSERT INTO coming_soon_signups (email) VALUES ($1) ON CONFLICT (email) DO NOTHING",
      [email]
    );
    res.status(200).json({ ok: true, message: "You're on the list. We'll notify you when we're ready." });
  } catch (e: unknown) {
    console.error("[coming-soon] signup failed:", e);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
