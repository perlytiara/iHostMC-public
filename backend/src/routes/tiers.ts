import { Router, Request, Response } from "express";
import { getTiers } from "../tiers.js";

const router = Router();

/** List all billing tiers (public for pricing page; auth not required). */
router.get("/", (_req: Request, res: Response): void => {
  const tiers = getTiers().map((t) => ({
    id: t.id,
    name: t.name,
    priceUsd: t.priceUsd,
    maxServers: t.maxServers,
    aiIncluded: t.aiIncluded,
    aiCreditsPerMonth: t.aiCreditsPerMonth,
    autoBackup: t.autoBackup,
    apiRequestsPerMonth: t.apiRequestsPerMonth,
    description: t.description,
    featureKeys: t.featureKeys,
  }));
  res.json({ tiers });
});

export default router;
