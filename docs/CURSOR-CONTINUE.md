# Cursor: Continue iHostMC server + website setup

Use this as the **prompt to resume work** on the iHostMC backend, website, and server deployment.

**Server status (this machine):** Latest `main` pulled; website rebuilt and `ihostmc-website` restarted. Dashboard "Open in iHostMC" button and deep-link auth are live at `http://YOUR_SERVER_IP:3020`. Backend on 3010, website on 3020.

---

## What’s done

- **Backend (repo root `/backend`)**
  - Auth: register, login, JWT, `GET /api/auth/me`, `POST /api/auth/change-password`
  - Keys: encrypted API keys (CurseForge etc.) at `GET/PUT/DELETE /api/keys/:keyName`
  - Usage: `POST /api/usage`, `GET /api/usage/summary`
  - Stripe: `POST /api/stripe/create-checkout-session`, `POST /api/stripe/customer-portal`, `POST /api/stripe/webhook`
  - Relay: `GET /api/relay/token` (returns FRP token to logged-in users only)
  - Backups: `GET /api/backups`, `POST /api/backups` (multipart), `GET /api/backups/:id/download`, `DELETE /api/backups/:id`
  - Subscription: `GET /api/subscription/status`
  - DB schema: `backend/src/db/schema.sql` (users, stripe_customers, user_api_keys, usage_events, subscriptions, backups)
  - Env: see `backend/.env.example` (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, Stripe, RELAY_PUBLIC_TOKEN, BACKUP_STORAGE_PATH, CORS_ORIGINS)

- **Desktop app (Tauri, repo root)**
  - Settings → Account: sign up, sign in, billing link, usage, CurseForge key (synced to backend)
  - Share server: relay token from backend when logged in (no key in distributed build)
  - `VITE_API_BASE_URL` in `.env` points to backend

- **Website (repo `/website`)**
  - Next.js 14, Tailwind, App Router
  - Pages: `/` (landing), `/login`, `/signup`, `/dashboard`, `/dashboard/backups`
  - Same backend API: login/signup use same DB; dashboard shows email, subscription status, backups (list/upload/download/delete)
  - Env: `NEXT_PUBLIC_API_URL` (same as backend URL)

---

## What to do next

1. **Server deployment (this machine)** – See **`docs/SERVER-DEPLOY.md`**.
   - Backend on **port 3010**, website on **port 3020** (avoids frps 7000/8081, Postgres 5432, etc.).
   - Backend `.env`: `PORT=3010`, `BACKUP_STORAGE_PATH=/opt/iHostMC/backups`, `CORS_ORIGINS=*` (or tighten for production). Relay: `RELAY_PUBLIC_TOKEN` so logged-in app users get the FRP token.
   - Run via systemd (`deploy/ihostmc-backend.service`, `deploy/ihostmc-website.service`) or `deploy/run-all.sh`.
   - Website build: set `NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:3010` so the browser can call the API. Users open `http://YOUR_SERVER_IP:3020` to log in in the browser; Windows app uses `VITE_API_BASE_URL=http://YOUR_SERVER_IP:3010`.

2. **Optional: website as its own repo**
   - To release the site as **iHostMC-WWW**: create a new GitHub repo `iHostMC-WWW`, copy the contents of `website/` into it, push. Then the server can clone `iHostMC-WWW` for the site and keep `iHostMC` for backend + desktop app.

3. **Stripe**
   - Create product/price in Stripe Dashboard, set `STRIPE_PRICE_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in backend `.env`. Webhook URL: `https://api.ihostmc.com/api/stripe/webhook` (or your domain).

4. **Download link and “Open in iHostMC”**
   - Set `NEXT_PUBLIC_DOWNLOAD_URL` in website `.env` to your GitHub Releases or download page; the dashboard shows “Download for Windows”.
   - When logged in, the dashboard also shows **“Open in iHostMC”**: it opens the desktop app via `ihostmc://auth?payload=...` and signs the user in (no copy-paste). The app must be installed so the OS registers the `ihostmc` protocol.

5. **CORS**
   - For IP-based access, `CORS_ORIGINS=*` is fine. For production with a domain set `CORS_ORIGINS` to `https://ihostmc.com,https://www.ihostmc.com,capacitor://localhost` (and your app’s origin). See `docs/SERVER-DEPLOY.md`.

---

## Repo layout

- `backend/` – Express API (auth, keys, usage, Stripe, relay, backups, subscription)
- `website/` – Next.js site (landing, login, signup, dashboard, backups)
- `src-tauri/`, `src/` – Tauri desktop app (already uses backend for auth, keys, relay, billing)
- `docs/` – this file and other docs

---

## Prompt to paste into Cursor

Copy and paste the following when you want to continue:

```
Continue the iHostMC server and website setup. Read docs/CURSOR-CONTINUE.md for what’s done and what’s next. Priorities: (1) Make sure backend and website run on the server (deployment, nginx, env, BACKUP_STORAGE_PATH). (2) Optionally split website into its own repo iHostMC-WWW and add a one-line README there. (3) Add a real Download link on the website dashboard to the desktop app (e.g. GitHub Releases). (4) Document CORS_ORIGINS for production. Push changes and tell me when it’s ready to deploy on the server.
```
