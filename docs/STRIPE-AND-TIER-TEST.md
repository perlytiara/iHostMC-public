# Stripe Setup and Tier Testing (No Real Charges)

Use this as the prompt/instructions for whoever configures the server and Stripe so **overflowedimagination@gmail.com** can test all tiers without being charged.

**Quick fix for “No price available” / devs switch tiers without paying:** see **[SERVER-BILLING-PROMPT.md](SERVER-BILLING-PROMPT.md)** — copy-paste prompt and steps for the server person. **Windows devs:** after the server is configured, see **[WINDOWS-BILLING-NEXT-STEPS.md](WINDOWS-BILLING-NEXT-STEPS.md)** for in-app and PowerShell testing.

**Live server (example):** API `http://51.75.53.62:3010`, Website `http://51.75.53.62:3020`. Replace with your host if different.

---

## 1. Server / Backend Setup

- Ensure the backend has a `.env` with at least:
  - `DATABASE_URL`, `JWT_SECRET`
  - Run **`npm run db:migrate`** in the backend once (creates `dev_tier_overrides` and other tables).

- For **testing without paying** (dev only; not for production), set in backend `.env`:
  - `ALLOW_DEV_TIER_OVERRIDE=true`
  - `DEV_TIER_OVERRIDE_SECRET=<pick-a-secret-string>` — keep this secret; the app or scripts send it when switching tier.
  - Optional: `DEV_TIER_OVERRIDE_EMAIL=overflowedimagination@gmail.com` — only this account can use dev tier override. Omit to allow any signed-in user when override is enabled.

- For **Stripe subscriptions** (optional for this test): use **Stripe Test mode** only (see below). In `.env` set:
  - `STRIPE_SECRET_KEY=sk_test_...` (never `sk_live_...` for testing)
  - `STRIPE_WEBHOOK_SECRET=whsec_...` from the **test** webhook
  - `STRIPE_PRICE_ID_BACKUP=price_...` (test price)
  - `STRIPE_PRICE_ID_PRO=price_...` (test price)

---

## 2. Stripe Dashboard (Test Mode Only)

- In Stripe Dashboard, turn **Test mode** ON (toggle in the top right). This ensures **no real card is ever charged**; all charges are simulated.
- Create two Products (in Test mode):
  - **Backup**: add a recurring price, e.g. $3.99/month (or 3.99 EUR). Copy the **Price ID** (starts with `price_`) → put in backend `.env` as `STRIPE_PRICE_ID_BACKUP`.
  - **Pro**: add a recurring price, e.g. $11.99/month (or 11.99 EUR). Copy the **Price ID** → `STRIPE_PRICE_ID_PRO`.
- Add a **Webhook** (Test mode):
  - URL: `https://YOUR_BACKEND_HOST/api/stripe/webhook`
  - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
  - Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET` in backend `.env`.

**Important:** As long as Stripe is in **Test mode** and you use **test** keys and **test** price IDs, the account **overflowedimagination@gmail.com** will never be charged real money, even if they “subscribe” in the app. Test cards (e.g. `4242 4242 4242 4242`) do not create real charges.

---

## 3. Guarantee No Charge for overflowedimagination@gmail.com

- **Option A (recommended for quick test):** Use the **dev tier override** only. Do not add Stripe keys (or leave checkout disabled). Then the tester signs in as overflowedimagination@gmail.com and calls `POST /api/dev/set-tier` with `tierId: "backup"` or `"pro"`. Their account shows that tier; no Stripe, no payment at all.
- **Option B:** Use Stripe in **Test mode** as above. Subscribing in the app with a test card still does not charge anyone; overflowedimagination@gmail.com can subscribe in test mode and will not be charged.

---

## 4. Path to Test and How to Know It Works

**Path 1 – Dev override (no Stripe, no card):**

1. Backend running with `ALLOW_DEV_TIER_OVERRIDE=true` and `DEV_TIER_OVERRIDE_SECRET` set; migrations run. Optional: `DEV_TIER_OVERRIDE_EMAIL=overflowedimagination@gmail.com` so only that account can switch.
2. Sign in to the app or website as **overflowedimagination@gmail.com**.
3. **In the app:** Open **Settings → Account**. If the backend allows dev override for this account, you will see a **"Dev: Switch tier (testing)"** section. Enter the dev tier secret (same as `DEV_TIER_OVERRIDE_SECRET`) and click **Free**, **Backup**, or **Pro**. The current plan updates immediately; permissions (server limits, backup, AI) follow the chosen tier.
4. **Or via API:** Call `POST https://YOUR_BACKEND_URL/api/dev/set-tier` with headers `Authorization: Bearer <token>`, `Content-Type: application/json`, `X-Dev-Tier-Secret: <secret>`, body `{"tierId":"pro"}` (or `"backup"` / `"free"`).
5. To reset: use **Free** in the dev section or send `{"tierId":"free"}`. Plan shows **Free** again.

**Path 2 – Stripe test checkout (test card, no real charge):**

1. Backend has Stripe test keys and test price IDs set; webhook configured in Test mode.
2. Sign in as overflowedimagination@gmail.com in the app.
3. **Settings → Account** → choose **Backup** or **Pro** → click **Subscribe**.
4. Complete Stripe Checkout using test card `4242 4242 4242 4242`, any future expiry, any CVC.
5. After success, **Settings → Account** should show the subscribed tier (Backup or Pro) and “Renews …”.

**How to know it works:**

- **Dev override:** Settings → Account shows the selected tier (Free / Backup / Pro) and no payment is asked.
- **Stripe test:** After checkout with 4242…, Settings → Account shows the paid tier; Stripe Dashboard (Test mode) shows the subscription; no real charge on overflowedimagination@gmail.com.

**Short “did it work?” path:** Sign in → **Settings → Account** → the **Current plan** line shows Free, Backup, or Pro. If it matches what you chose (via dev set-tier or test checkout), it's working.

### Verify dev override without opening the app

After signing in (app or website), get your JWT (e.g. browser DevTools → Application → Local Storage key `ihostmc-auth` or Network tab → any API request → Authorization header). Then:

**PowerShell (repo script):**

```powershell
.\scripts\test-tier-dev-override.ps1 -BaseUrl "http://51.75.53.62:3010" -Token "YOUR_JWT" -Secret "YOUR_DEV_TIER_OVERRIDE_SECRET"
```

**curl:**

```bash
# Set tier to Pro
curl -s -X POST "http://51.75.53.62:3010/api/dev/set-tier" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -H "X-Dev-Tier-Secret: YOUR_SECRET" \
  -d '{"tierId":"pro"}'

# Confirm: GET subscription status (same token, no secret)
curl -s "http://51.75.53.62:3010/api/subscription/status" -H "Authorization: Bearer YOUR_JWT"
```

If the status response has `"tierId":"pro"` and `"tier":{"name":"Pro",...}`, it worked. Then open the app → Settings → Account and you should see **Current plan: Pro**.

---

## 5. One-Paragraph Prompt for the Server Person

Copy this and send it to whoever sets up the server/Stripe so overflowedimagination@gmail.com is never really charged (Test mode + optional dev override):

```text
Set up the iHostMC backend so we can test subscription tiers without charging overflowedimagination@gmail.com. Use Stripe in Test mode only: create Products "Backup" and "Pro" with recurring test prices, add a webhook to our backend /api/stripe/webhook, and put the test Stripe keys and price IDs in the backend .env. For dev-only testing without payment: set ALLOW_DEV_TIER_OVERRIDE=true, DEV_TIER_OVERRIDE_SECRET=<secret>, and optionally DEV_TIER_OVERRIDE_EMAIL=overflowedimagination@gmail.com (so only that account can switch tiers). Run npm run db:migrate in the backend. Then overflowedimagination@gmail.com can sign in → Settings → Account → use "Dev: Switch tier (testing)" with the secret to switch Free/Backup/Pro, or use POST /api/dev/set-tier with X-Dev-Tier-Secret. In Stripe Test mode no real card is charged; use card 4242 4242 4242 4242 for checkout tests. Verify: Current plan in Settings → Account shows the chosen tier.
```
