# Windows machine: build on push and keep improving Stripe / dev account testing

Use this prompt **on the Windows machine** (or paste into Cursor there) so it keeps building on pushes and improving Stripe setup, dev account testing, and how to trigger things.

---

## What to do after a push

1. **Pull the latest** from `main` (the push just made from the Linux/server side).
2. **Build and run locally** (or trigger the server deploy so the server builds from the same commit):
   - To trigger server deploy: `POST http://SERVER_IP:9090/deploy` or `GET http://SERVER_IP:9090/deploy?trigger=1` (see `docs/CURSOR-AUTO-DEPLOY-PROMPT.md`).
   - Locally: run the app/website and backend as you normally do so you can test.
3. **Stripe and tier testing:** Use `docs/STRIPE-AND-TIER-TEST.md` as the source of truth:
   - **Dev override (no Stripe):** Sign in as **overflowedimagination@gmail.com** → call `POST /api/dev/set-tier` with body `{"tierId":"pro"}` (or `"backup"` / `"free"`) and header `X-Dev-Tier-Secret: <DEV_TIER_OVERRIDE_SECRET>` → open app **Settings → Account** → **Current plan** should show Pro (or Backup / Free). If it matches, dev override works.
   - **Stripe test:** Sign in → **Settings → Account** → Subscribe to Backup or Pro → pay with test card `4242 4242 4242 4242` → after success, **Settings → Account** should show that tier. If it does, Stripe test flow works.
4. **“Did it work?” check:** Sign in → **Settings → Account** → the **Current plan** line shows Free, Backup, or Pro. If it matches what you set (via dev set-tier or test checkout), it’s working.
5. **Keep improving:** Fix any bugs you find, improve Stripe webhook handling or checkout UX, clarify docs or prompts, and push so the server (or other machines) can pull and build again.

---

## Prompt to paste into Cursor (Windows)

```text
The iHostMC repo was just pushed to main with updates to Stripe/tier testing docs. Do this:

1. Pull latest from main and build (or trigger the server deploy: POST to http://SERVER_IP:9090/deploy and wait for status deployInProgress false per docs/CURSOR-AUTO-DEPLOY-PROMPT.md).

2. Use docs/STRIPE-AND-TIER-TEST.md for testing: (a) Dev override – sign in as overflowedimagination@gmail.com, POST /api/dev/set-tier with {"tierId":"pro"} and header X-Dev-Tier-Secret, then check Settings → Account shows Current plan: Pro; (b) Stripe test – subscribe with card 4242 4242 4242 4242 and confirm Settings → Account shows the tier after checkout.

3. Confirm “did it work?” by checking Settings → Account → Current plan matches what you set. Fix any issues, improve Stripe or dev-account flows or docs, and push so the next build picks it up.
```

Replace `SERVER_IP` with your Linux server IP (or use `localhost` if you’re on the server).

---

## Quick reference

- **Stripe/test doc:** `docs/STRIPE-AND-TIER-TEST.md`
- **Deploy trigger and wait:** `docs/CURSOR-AUTO-DEPLOY-PROMPT.md`
- **Dev set-tier:** `POST /api/dev/set-tier`, body `{"tierId":"pro"|"backup"|"free"}`, header `X-Dev-Tier-Secret`
- **Success check:** Settings → Account → **Current plan** = Free | Backup | Pro
