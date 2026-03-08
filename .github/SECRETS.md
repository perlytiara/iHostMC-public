# Config: public vs secret

## Public (exposed in build – use Variables)

These are **not secret**. They are baked into the app and website so the client knows where to connect.

| Variable | Purpose |
| -------- | ------- |
| `VITE_API_BASE_URL` | Backend API (auth, billing, relay token, keys). |
| `VITE_WEBSITE_URL` | Website (login, signup, checkout). App opens this for "Sign in with browser". |

**Where to set**

- **Local:** Copy `.env.public.example` to `.env` and edit. Commit `.env.public.example`; never commit `.env`.
- **GitHub Actions:** Use **Repository Variables** (Settings → Secrets and variables → Actions → **Variables**). Add `VITE_API_BASE_URL` and `VITE_WEBSITE_URL` there. Use `vars.VITE_API_BASE_URL` in workflows – do **not** store these as Secrets.

## Secret (never in frontend – use Secrets or backend only)

| What | Where |
| ------ | ----- |
| Stripe secret key, webhook secret | Backend `.env` or server secrets only. |
| JWT secret, `DATABASE_URL`, `ENCRYPTION_KEY` | Backend `.env` only. |
| Relay (FRP) token | Backend `.env` as `RELAY_PUBLIC_TOKEN`. The API returns it to **logged-in** users only (`GET /api/relay/token`). No need to put it in the app build. |
| Optional dev relay in build | If you want a **dev** build with a default relay token, set `VITE_RELAY_PUBLIC_TOKEN` as a **Secret** in GitHub and pass it only in a dev workflow. For the **release** build, omit it so users get the token seamlessly after sign-in. |

## One clean flow for users

1. User opens app → Settings → Account → "Sign in with browser".
2. Browser opens website login; user signs in.
3. After login, the site opens the app (or the "accept" page) and the app signs in. **Relay token** is fetched from the API when the user is signed in; no separate step.
4. Billing and Share use the same account; no extra login.

- **Dev (you and collaborators):** A committed `.env.development` sets `VITE_API_BASE_URL` and `VITE_WEBSITE_URL` to the shared dev server. Run `npm run tauri dev` and Settings → Account works without creating `.env`. To override (e.g. local backend), copy `.env.example` to `.env` and set values there.
- **Build you distribute:** Build **without** `VITE_RELAY_PUBLIC_TOKEN` (e.g. in CI don’t pass that secret, or use a separate “release” workflow). The built app will have no relay token; when the user signs in, the app calls your backend and gets the token at runtime.
- **GitHub Secrets** (for CI): In the repo go to Settings → Secrets and variables → Actions. Add secret **VITE_API_BASE_URL** (e.g. `http://YOUR_SERVER_IP:3010`). Optionally add **VITE_WEBSITE_URL** and **VITE_RELAY_PUBLIC_TOKEN**. Use the example workflow (copy `.github/workflows/build-with-secrets.example.yml` to `build.yml`) so builds get the backend; then every dev and CI builds see the same Account/backend as you.

## Summary

- **Public:** `VITE_API_BASE_URL`, `VITE_WEBSITE_URL` → Repository **Variables**, `.env.public.example` in repo.
- **Secret:** Backend-only env (Stripe, JWT, DB, relay). Relay token is given through the app/website after login.
- **Optional Secret:** `VITE_RELAY_PUBLIC_TOKEN` only for dev builds; omit for release.
