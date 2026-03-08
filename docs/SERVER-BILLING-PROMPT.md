# Server: Fix "No price available" and let devs switch tiers without paying

**Send this to whoever manages the iHostMC server.** It fixes the error users see when clicking **Subscribe** (“No price available for this tier. Set Stripe Price IDs in server env.”) and lets devs (e.g. overflowedimagination@gmail.com) switch plans **without paying**.

---

## What’s wrong

- **Subscribe** (Backup / Pro) fails because the backend has no Stripe Price IDs (or Stripe isn’t configured).
- **Manage billing** may fail with “Billing not configured” for the same reason.
- Devs need a way to **switch tiers for testing without paying**.

---

## Fix: two options

### Option A – Dev tier override only (no Stripe, no payment)

Use this if you only need **devs to test Free / Backup / Pro** without real billing.

1. **On the server**, open the backend `.env` (e.g. `/opt/iHostMC/backend/.env` or wherever the API runs).

2. **Add or set these lines** (replace `your-secret-here` with a random string only devs know):

   ```env
   ALLOW_DEV_TIER_OVERRIDE=true
   DEV_TIER_OVERRIDE_SECRET=your-secret-here
   DEV_TIER_OVERRIDE_EMAIL=overflowedimagination@gmail.com
   ```

   - `DEV_TIER_OVERRIDE_EMAIL` limits who can use the dev switcher. Use one email, or comma-separated (e.g. `email1@example.com,email2@example.com`). To allow any signed-in user, omit this line.

3. **Run migrations once** in the backend directory:

   ```bash
   cd /opt/iHostMC/backend
   npm run db:migrate
   ```

4. **Restart the backend** (e.g. systemd or PM2):

   ```bash
   sudo systemctl restart ihostmc-backend
   # or: pm2 restart ihostmc-backend
   ```

5. **Tell the dev** the value of `DEV_TIER_OVERRIDE_SECRET`. For step-by-step testing on Windows (in the app or via PowerShell), they can use **docs/WINDOWS-BILLING-NEXT-STEPS.md**. In the app they go to **Settings → Account**, see **“Dev: Switch tier (testing)”**, enter that secret, and click **Free** / **Backup** / **Pro**. The plan updates immediately; no payment.

**Result:** Subscribe/Manage billing still show errors if Stripe isn’t set, but devs can switch tiers in the dev section. No Stripe or card needed.

---

### Option B – Stripe Test mode (Subscribe and Manage billing work)

Use this if you want **Subscribe** and **Manage billing** to work (with test cards, no real charges).

1. **Stripe Dashboard** – turn **Test mode** ON (top-right). Create two Products:
   - **Backup** → Add price → $3.99 (or EUR) / month recurring → copy the **Price ID** (e.g. `price_xxx`).
   - **Pro** → Add price → $11.99 (or EUR) / month recurring → copy the **Price ID**.

2. **Webhook** (Test mode): Developers → Webhooks → Add endpoint:
   - URL: `https://YOUR_API_HOST/api/stripe/webhook`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** (e.g. `whsec_xxx`).

3. **Backend `.env`** – set:

   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_ID_BACKUP=price_...
   STRIPE_PRICE_ID_PRO=price_...
   ```

   Use the **test** key and the **test** price IDs (no real charges).

4. **Restart the backend** after changing `.env`.

**Result:** Users can click **Subscribe** and complete checkout with test card `4242 4242 4242 4242`; **Manage billing** opens the Stripe portal. No real money in Test mode.

---

### Option A + B together (recommended for dev/testing)

- Set **Option A** (dev tier override) so overflowedimagination@gmail.com can switch tiers without paying from **Settings → Account**.
- Set **Option B** (Stripe Test) so **Subscribe** and **Manage billing** work with test cards.
- Then devs can either use “Dev: Switch tier” (no card) or test the full Stripe flow with 4242…

---

## Copy-paste prompt for the server person

You can send this as-is (replace `OUR_API_HOST` with your API host when setting the webhook):

```text
Billing still isn't set up, so Subscribe shows an error. Please do one of these (or both):

Option 1 – Let devs switch tiers without paying (no Stripe):
- On the server, edit the backend .env and add:
  ALLOW_DEV_TIER_OVERRIDE=true
  DEV_TIER_OVERRIDE_SECRET=<pick a secret and tell me>
  DEV_TIER_OVERRIDE_EMAIL=overflowedimagination@gmail.com
- In the backend folder run: npm run db:migrate
- Restart the backend (e.g. systemctl restart ihostmc-backend or pm2 restart)

Then I can use Settings → Account → "Dev: Switch tier (testing)" with that secret to switch Free/Backup/Pro.

Option 2 – Make Subscribe and Manage billing work (Stripe Test):
- In Stripe Dashboard (Test mode): create Products "Backup" and "Pro" with monthly prices, copy the price IDs. Add webhook to https://OUR_API_HOST/api/stripe/webhook, copy signing secret.
- In backend .env set: STRIPE_SECRET_KEY=sk_test_..., STRIPE_WEBHOOK_SECRET=whsec_..., STRIPE_PRICE_ID_BACKUP=price_..., STRIPE_PRICE_ID_PRO=price_...
- Restart the backend.

Full steps (copy-paste for you): https://github.com/perlytiara/iHostMC/blob/main/docs/SERVER-BILLING-PROMPT.md
```

**After they apply Option 1 (and optionally Option 2):** have them pull latest and redeploy so the app has the new “View setup guide” link and clearer billing messages.

---

## Verify

- **Dev override:** Sign in as overflowedimagination@gmail.com → **Settings → Account** → you should see **“Dev: Switch tier (testing)”**. Enter the secret, click **Pro** → Current plan shows **Pro**.
- **Stripe:** Click **Subscribe** on Backup or Pro → Stripe Checkout opens; use card `4242 4242 4242 4242` → after success, Current plan shows the chosen tier.
