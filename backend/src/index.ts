import express from "express";
import cors from "cors";
import { config, hasStripe } from "./config.js";
import { query } from "./db/pool.js";
import authRoutes from "./routes/auth.js";
import keysRoutes from "./routes/keys.js";
import usageRoutes from "./routes/usage.js";
import stripeRoutes, { stripeWebhookHandler } from "./routes/stripe.js";
import relayRoutes from "./routes/relay.js";
import backupRoutes from "./routes/backups.js";
import syncRoutes from "./routes/sync.js";
import subscriptionRoutes from "./routes/subscription.js";
import tiersRoutes from "./routes/tiers.js";
import devRoutes from "./routes/dev.js";
import adminRoutes from "./routes/admin.js";
import comingSoonRoutes from "./routes/coming-soon.js";
import aiRoutes from "./routes/ai.js";
import { startIterationScheduler } from "./iteration-scheduler.js";

const app = express();

// CORS: allow * (debug), or listed origins, or null/undefined (desktop app), or localhost (Tauri/Vite dev).
const allowAnyOrigin = config.corsOrigins.length === 1 && config.corsOrigins[0] === "*";
app.use(
  cors({
    origin: allowAnyOrigin
      ? (origin, cb) => cb(null, origin ?? true)
      : (origin, cb) => {
          if (!origin) return cb(null, true); // desktop app often sends no Origin
          const allowed = config.corsOrigins as string[];
          if (allowed.includes(origin)) return cb(null, true);
          try {
            const u = new URL(origin);
            if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return cb(null, true);
          } catch {
            // ignore
          }
          return cb(null, false);
        },
    credentials: true,
  })
);

// Webhook must get raw body; mount before express.json()
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  let syncAvailable = false;
  if (config.databaseUrl) {
    try {
      await query("SELECT 1 FROM sync_servers LIMIT 1");
      syncAvailable = true;
    } catch {
      // sync_servers table missing or DB error
    }
  }
  res.json({ ok: true, stripe: hasStripe(), syncAvailable });
});

app.use("/api/auth", authRoutes);
app.use("/api/keys", keysRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/relay", relayRoutes);
app.use("/api/backups", backupRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/tiers", tiersRoutes);
app.use("/api/dev", devRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/coming-soon", comingSoonRoutes);
app.use("/api/ai", aiRoutes);

app.listen(config.port, () => {
  console.log(`iHostMC backend listening on port ${config.port}`);
  if (config.databaseUrl) {
    startIterationScheduler();
  }
});
