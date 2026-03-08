# Server: Update deployment (git pull, migrations, restart)

**Send this to whoever manages the iHostMC server** when you have pushed changes that affect the backend, website, or database (e.g. account settings on the website, WebAuthn/passkeys, new API routes).

---

## What changed (recent)

- **Account settings** (profile, passkeys, change password) are now managed on the **website** at `/dashboard/account`. The desktop app shows an “Open account settings” link that opens this page.
- **Backend**: WebAuthn (passkey) routes are mounted under `/api/auth/webauthn`. Ensure migrations have been run so the `webauthn_credentials` table exists.
- **Website**: Dashboard account page includes change password and passkeys (add/remove). The website needs `@simplewebauthn/browser` and `NEXT_PUBLIC_API_URL` (or same-host API) so it can call the backend.

---

## Steps to update the server

1. **Git pull** (in the repo root, or in each of backend / website if you deploy separately):

   ```bash
   cd /path/to/iHostMC
   git pull
   ```

2. **Backend**

   - Install dependencies (if `package.json` or `package-lock.json` changed):

     ```bash
     cd backend
     npm ci
     ```

   - Run database migrations (required if there are new migration files, e.g. `006_account_webauthn.sql`, `007_oauth_accounts.sql`):

     ```bash
     npm run db:migrate
     ```

   - Optional env (for passkeys on the website): if the website domain is not `localhost`, set in backend `.env`:

     ```env
     WEBAUTHN_RP_ID=your-domain.com
     WEBAUTHN_ORIGIN=https://your-domain.com
     ```

     (If not set, the backend may use defaults from `WEBSITE_URL`.)

   - Restart the backend (systemd or PM2):

     ```bash
     sudo systemctl restart ihostmc-backend
     # or: pm2 restart ihostmc-backend
     ```

3. **Website**

   - Install dependencies (if `package.json` or `package-lock.json` changed):

     ```bash
     cd website
     npm ci
     ```

   - Build and restart (or let your deploy pipeline do it):

     ```bash
     npm run build
     # then restart the Next.js process, e.g.:
     pm2 restart ihostmc-website
     ```

4. **Verify**

   - Backend: `GET /health` returns `{ "ok": true }`.
   - Website: Open `/dashboard/account` when logged in; you should see Profile, Sign in options, Change password, Passkeys, and Subscription. If the backend is on a different host, set `NEXT_PUBLIC_API_URL` in the website env to the backend URL.

---

## Quick checklist

- [ ] `git pull` in repo (or in backend/website dirs)
- [ ] Backend: `npm ci` (if deps changed)
- [ ] Backend: `npm run db:migrate`
- [ ] Backend: restart service
- [ ] Website: `npm ci` (if deps changed)
- [ ] Website: build + restart
- [ ] Optional: set `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` in backend if using passkeys on a non-localhost domain

For billing/Stripe and dev tier override, see **docs/SERVER-BILLING-PROMPT.md**.

---

## Builder (auto-deploy from webhook)

When the **iHostMC-builder** (PM2) runs, it does **not** hard-reset the repo by default:

- **Up to date**: no pull, no build (unless `?build=1` or `BUILDER_FORCE_REBUILD`).
- **Behind origin**: it runs `git merge origin/main --ff-only` (fast-forward only). No reset.
- **Uncommitted changes on server**: deploy is **skipped** and logs *"Supervision needed: uncommitted changes"*. Resolve locally (commit, stash, or merge) or set `BUILDER_ALLOW_RESET=1` to force reset (discards local changes).
- **Branch diverged** (e.g. commits on server that aren’t on origin): `merge --ff-only` fails, deploy is **skipped** and logs *"Supervision needed: branch diverged"*. Merge or reset manually, or set `BUILDER_ALLOW_RESET=1` to force `git reset --hard origin/main`.

So the service asks for **supervision** when there are local changes or a divergent history instead of overwriting. To restore the old “always reset” behavior, set in the builder env: `BUILDER_ALLOW_RESET=1`.
