# Windows: Billing next steps and how to test

**Use this on Windows** after the server has enabled dev tier override (Option A) and/or Stripe Test (Option B). See [SERVER-BILLING-PROMPT.md](SERVER-BILLING-PROMPT.md) for what the server person must do.

---

## 1. What to do next

1. **Get the dev secret** from whoever configured the server (same value as `DEV_TIER_OVERRIDE_SECRET` in backend `.env`). Keep it private.
2. **Open the iHostMC app** and sign in (e.g. as overflowedimagination@gmail.com).
3. Go to **Settings → Account**.
4. Then either:
   - **Dev: Switch tier** – If you see the "Dev: Switch tier (testing)" section, enter the secret and click **Free** / **Backup** / **Pro** (no payment).
   - **Subscribe** – Click **Subscribe** on Backup or Pro to test Stripe Checkout (use test card `4242 4242 4242 4242` if the server enabled Stripe Test).

---

## 2. Test dev override in the app

1. Sign in to the app (or website) as the allowed dev account (e.g. overflowedimagination@gmail.com).
2. Open **Settings → Account**.
3. Scroll to **"Dev: Switch tier (testing)"** (amber box). If you don't see it, the server has not enabled Option A or your email is not in `DEV_TIER_OVERRIDE_EMAIL`.
4. Enter the **Dev tier secret** (the value of `DEV_TIER_OVERRIDE_SECRET`).
5. Click **Free**, **Backup**, or **Pro**. The **Current plan** line should update immediately.
6. To reset, click **Free** or use the same steps and choose **Free**.

---

## 3. Test dev override with PowerShell

Use this when you want to switch tier from the command line (e.g. to verify the API without opening the app).

1. **Get a JWT:** Sign in at the website or in the app, then:
   - **Browser:** DevTools → Application → Local Storage → find the key that holds the auth token (e.g. `ihostmc-auth`), or Network tab → any API request → copy the `Authorization: Bearer ...` header.
   - **App:** Use the same token the app sends to the API (e.g. from a network inspector if available).

2. **Run the script** in PowerShell from the repo root:

   ```powershell
   .\scripts\test-tier-dev-override.ps1 -BaseUrl "http://51.75.53.62:3010" -Token "YOUR_JWT" -Secret "YOUR_DEV_TIER_OVERRIDE_SECRET" -TierId "pro"
   ```

   Replace:

   - `BaseUrl` – Your API base URL (e.g. `http://51.75.53.62:3010` or `https://your-api-host`).
   - `Token` – The JWT from step 1.
   - `Secret` – The dev tier secret from the server.
   - `TierId` – `free`, `backup`, or `pro` (default is `pro`).

3. If it succeeds, the script prints **OK** and the current plan. Open the app → **Settings → Account** and confirm **Current plan** matches.

---

## 4. Test Stripe checkout

Only works if the server enabled **Option B** (Stripe Test) in [SERVER-BILLING-PROMPT.md](SERVER-BILLING-PROMPT.md).

1. Sign in to the app.
2. **Settings → Account** → click **Subscribe** on **Backup** or **Pro**.
3. Complete Stripe Checkout using test card **4242 4242 4242 4242**, any future expiry, any CVC.
4. After success, **Current plan** should show the chosen tier. No real charge in Test mode.

---

## 5. Quick checklist

| Step | Option A (dev override) | Option B (Stripe Test) |
|------|--------------------------|-------------------------|
| Server set env + migrate + restart | `ALLOW_DEV_TIER_OVERRIDE`, `DEV_TIER_OVERRIDE_SECRET`, optional `DEV_TIER_OVERRIDE_EMAIL` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_BACKUP`, `STRIPE_PRICE_ID_PRO` |
| Test in app | Settings → Account → "Dev: Switch tier" → secret → Free/Backup/Pro | Settings → Account → Subscribe → card 4242… |
| Test with script | `.\scripts\test-tier-dev-override.ps1 -BaseUrl ... -Token ... -Secret ... -TierId pro` | N/A |

**Note:** The PowerShell script runs on Windows only. It is already in the repo; this doc explains how to run it with your real `BaseUrl`, `Token`, and `Secret`.

If something doesn't work, send the server person the link: [SERVER-BILLING-PROMPT.md](SERVER-BILLING-PROMPT.md).
