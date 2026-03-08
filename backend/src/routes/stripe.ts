import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { query } from "../db/pool.js";
import { config, hasStripe, hasStripeTest } from "../config.js";
import { getTiers } from "../tiers.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
let stripeLive: Stripe | null = null;
let stripeTest: Stripe | null = null;
if (config.stripeSecretKey) {
  stripeLive = new Stripe(config.stripeSecretKey);
}
if (config.stripeTestSecretKey) {
  stripeTest = new Stripe(config.stripeTestSecretKey);
}

type StripeContext = {
  stripe: Stripe;
  priceIdBackup: string | null;
  priceIdPro: string | null;
  customerColumn: "stripe_customer_id" | "stripe_customer_id_test";
};

function getStripeContext(useTestMode: boolean): StripeContext | null {
  if (useTestMode && stripeTest && hasStripeTest()) {
    return {
      stripe: stripeTest,
      priceIdBackup: config.stripeTestPriceIdBackup || null,
      priceIdPro: config.stripeTestPriceIdPro || null,
      customerColumn: "stripe_customer_id_test",
    };
  }
  if (stripeLive && hasStripe()) {
    const tierBackup = getTiers().find((t) => t.id === "backup")?.stripePriceId ?? null;
    const tierPro = getTiers().find((t) => t.id === "pro")?.stripePriceId ?? null;
    return {
      stripe: stripeLive,
      priceIdBackup: tierBackup,
      priceIdPro: tierPro,
      customerColumn: "stripe_customer_id",
    };
  }
  return null;
}

async function getUserStripeTestMode(userId: string): Promise<boolean> {
  const r = await query<{ stripe_test_mode: boolean }>(
    "SELECT stripe_test_mode FROM users WHERE id = $1",
    [userId]
  );
  return r.rows[0]?.stripe_test_mode ?? false;
}

/** Create Stripe Checkout session for a given tier (or fallback to legacy single price). */
router.post("/create-checkout-session", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const userEmail = (req as Request & { userEmail: string }).userEmail;
  const useTestMode = await getUserStripeTestMode(userId);
  const ctx = getStripeContext(useTestMode);

  if (!ctx) {
    res.status(503).json({ error: "Billing not configured" });
    return;
  }

  const { successUrl, cancelUrl, tierId } = req.body as { successUrl?: string; cancelUrl?: string; tierId?: string };

  let priceId: string | null = null;
  if (tierId === "backup") priceId = ctx.priceIdBackup;
  else if (tierId === "pro") priceId = ctx.priceIdPro;
  if (!priceId) priceId = config.stripePriceId || null;
  if (!priceId) {
    res.status(400).json({ error: "No price available for this tier. Set Stripe Price IDs in server env." });
    return;
  }

  try {
    const col = ctx.customerColumn;
    const custRow = await query<{ stripe_customer_id: string; stripe_customer_id_test: string | null }>(
      "SELECT stripe_customer_id, stripe_customer_id_test FROM stripe_customers WHERE user_id = $1",
      [userId]
    );
    let stripeCustomerId: string | null = custRow.rows[0]
      ? (col === "stripe_customer_id_test" ? custRow.rows[0].stripe_customer_id_test : custRow.rows[0].stripe_customer_id)
      : null;
    if (stripeCustomerId?.startsWith("test-placeholder-")) stripeCustomerId = null;

    if (!stripeCustomerId) {
      const customer = await ctx.stripe.customers.create({
        email: userEmail,
        metadata: { ihostmc_user_id: userId },
      });
      stripeCustomerId = customer.id;
      if (col === "stripe_customer_id") {
        await query(
          "INSERT INTO stripe_customers (user_id, stripe_customer_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = $2",
          [userId, stripeCustomerId]
        );
      } else {
        await query(
          `INSERT INTO stripe_customers (user_id, stripe_customer_id, stripe_customer_id_test) VALUES ($1, 'test-placeholder-' || $1::text, $2)
           ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id_test = $2`,
          [userId, stripeCustomerId]
        );
      }
    }

    const session = await ctx.stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl ?? `${req.protocol}://${req.get("host")}/settings?success=1`,
      cancel_url: cancelUrl ?? `${req.protocol}://${req.get("host")}/settings?cancel=1`,
      metadata: { ihostmc_user_id: userId },
      subscription_data: { metadata: { ihostmc_user_id: userId } },
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

/** Create one-time Stripe Checkout for AI credit packs (small / medium / bulk). Returns 501 until credit pack price IDs are configured. */
router.post("/create-credit-checkout", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { packId, successUrl, cancelUrl } = req.body as {
    packId?: "small" | "medium" | "bulk";
    successUrl?: string;
    cancelUrl?: string;
  };
  if (!packId || !["small", "medium", "bulk"].includes(packId)) {
    res.status(400).json({ error: "packId required: small, medium, or bulk" });
    return;
  }
  res.status(501).json({ error: "Credit packs coming soon. Configure Stripe credit pack price IDs to enable." });
});

/** Create Stripe Customer Portal session (manage payment method, cancel, subscribe, etc.). */
router.post("/customer-portal", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const userEmail = (req as Request & { userEmail: string }).userEmail;
  const useTestMode = await getUserStripeTestMode(userId);
  const ctx = getStripeContext(useTestMode);

  if (!ctx) {
    res.status(503).json({ error: "Billing not configured" });
    return;
  }

  const { returnUrl } = req.body as { returnUrl?: string };
  const col = ctx.customerColumn;

  const custRow = await query<{ stripe_customer_id: string; stripe_customer_id_test: string | null }>(
    "SELECT stripe_customer_id, stripe_customer_id_test FROM stripe_customers WHERE user_id = $1",
    [userId]
  );
  let stripeCustomerId: string | null = custRow.rows[0]
    ? (col === "stripe_customer_id_test" ? custRow.rows[0].stripe_customer_id_test : custRow.rows[0].stripe_customer_id)
    : null;
  if (stripeCustomerId?.startsWith("test-placeholder-")) stripeCustomerId = null;

  if (!stripeCustomerId) {
    try {
      const customer = await ctx.stripe.customers.create({
        email: userEmail,
        metadata: { ihostmc_user_id: userId },
      });
      stripeCustomerId = customer.id;
      if (col === "stripe_customer_id") {
        await query(
          "INSERT INTO stripe_customers (user_id, stripe_customer_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = $2",
          [userId, stripeCustomerId]
        );
      } else {
        await query(
          `INSERT INTO stripe_customers (user_id, stripe_customer_id, stripe_customer_id_test) VALUES ($1, '', $2)
           ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id_test = $2`,
          [userId, stripeCustomerId]
        );
      }
    } catch {
      res.status(500).json({ error: "Failed to create billing account" });
      return;
    }
  }
  try {
    const session = await ctx.stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl ?? undefined,
    });
    res.json({ url: session.url });
  } catch {
    res.status(500).json({ error: "Failed to open billing portal" });
  }
});

async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.ihostmc_user_id;
    if (userId) {
      const status = sub.status;
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      await query(
        `INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_price_id, status, current_period_end, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (user_id) DO UPDATE SET
           stripe_subscription_id = $2, stripe_price_id = $3, status = $4, current_period_end = $5, updated_at = now()`,
        [userId, sub.id, priceId, status, periodEnd]
      );
    }
  }
  if (event.type === "customer.subscription.created") {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.ihostmc_user_id;
    if (userId) {
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      await query(
        `INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_price_id, status, current_period_end, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (user_id) DO UPDATE SET
           stripe_subscription_id = $2, stripe_price_id = $3, status = $4, current_period_end = $5, updated_at = now()`,
        [userId, sub.id, priceId, sub.status, periodEnd]
      );
    }
  }
}

export function stripeWebhookHandler(req: Request, res: Response): void {
  const sig = req.headers["stripe-signature"];
  if (typeof sig !== "string") {
    res.status(400).end();
    return;
  }
  const rawBody = (req as Request & { body: Buffer }).body;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).end();
    return;
  }
  let event: Stripe.Event;
  const tryVerify = (secret: string, stripeInstance: Stripe | null): boolean => {
    if (!secret || !stripeInstance) return false;
    try {
      event = stripeInstance.webhooks.constructEvent(rawBody, sig, secret);
      return true;
    } catch {
      return false;
    }
  };
  if (tryVerify(config.stripeWebhookSecret, stripeLive)) {
    handleWebhookEvent(event!).then(() => res.json({ received: true })).catch(() => res.status(500).end());
    return;
  }
  if (tryVerify(config.stripeTestWebhookSecret, stripeTest)) {
    handleWebhookEvent(event!).then(() => res.json({ received: true })).catch(() => res.status(500).end());
    return;
  }
  res.status(400).json({ error: "Webhook signature verification failed" });
}

export default router;
