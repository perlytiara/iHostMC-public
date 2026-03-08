/**
 * One-time setup: create Stripe products (Backup, Pro), monthly prices, and webhook endpoint.
 * Reads .env from backend root. Use Test key (sk_test_...) for testing.
 *
 * Usage: from backend dir: npx tsx scripts/setup-stripe-products.ts
 * Env: STRIPE_SECRET_KEY (required). Optional: STRIPE_WEBHOOK_BASE_URL (default: WEBSITE_URL, then https://ihost.one).
 */

import "dotenv/config";
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey?.startsWith("sk_")) {
  console.error("Missing or invalid STRIPE_SECRET_KEY in .env (use sk_test_... for test mode).");
  process.exit(1);
}

const webhookBase = process.env.STRIPE_WEBHOOK_BASE_URL || process.env.WEBSITE_URL || "https://ihost.one";
const webhookUrl = `${webhookBase.replace(/\/$/, "")}/api/stripe/webhook`;

const stripe = new Stripe(secretKey);

async function main(): Promise<void> {
  const isTest = secretKey.startsWith("sk_test_");
  console.log(`Using Stripe ${isTest ? "TEST" : "LIVE"} mode. Webhook URL: ${webhookUrl}\n`);

  // 1. Backup product + price ($3.99/mo)
  const backupProduct = await stripe.products.create({
    name: "iHostMC Backup",
    description: "Cloud backup: settings, mods, plugins, version, server files",
  });
  const backupPrice = await stripe.prices.create({
    product: backupProduct.id,
    unit_amount: 399, // $3.99
    currency: "usd",
    recurring: { interval: "month" },
  });
  console.log("Backup:", backupProduct.id, "-> price", backupPrice.id);

  // 2. Pro product + price ($11.99/mo)
  const proProduct = await stripe.products.create({
    name: "iHostMC Pro",
    description: "Backup + AI features with monthly credits",
  });
  const proPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 1199, // $11.99
    currency: "usd",
    recurring: { interval: "month" },
  });
  console.log("Pro:", proProduct.id, "-> price", proPrice.id);

  // 3. Webhook endpoint (subscription events)
  const webhook = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ],
    description: "iHostMC subscription sync",
  });
  const webhookSecret = (webhook as { secret?: string }).secret;
  console.log("Webhook:", webhook.id, "secret:", webhookSecret ? "whsec_..." : "(not returned)");

  console.log("\n--- Add these to backend .env ---\n");
  console.log(`STRIPE_PRICE_ID_BACKUP=${backupPrice.id}`);
  console.log(`STRIPE_PRICE_ID_PRO=${proPrice.id}`);
  if (webhookSecret) {
    console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
  }
  console.log("\nThen restart the backend.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
