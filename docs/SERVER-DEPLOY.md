# iHostMC server deployment (this machine)

Run backend + website on this Linux server so users can log in via **browser** (website) or **desktop app** (Windows). Ports are chosen to avoid collisions with frps (7000, 8081), PostgreSQL (5432), and other services.

## Get up to date (runbook)

Use this when you pull new code or want the server to match the repo.

```bash
# 1. Repo
cd /opt/iHostMC   # or your clone path
git fetch
git checkout feature/auth-payments-stripe   # or your branch
git pull

# 2. Backend
cd backend
cp .env.example .env   # only if .env doesn't exist; then edit .env
# Ensure .env has: DATABASE_URL, JWT_SECRET, PORT=3010, and optionally Stripe (see below)
npm ci
npm run build
npm run db:migrate
sudo systemctl restart ihostmc-backend
sudo systemctl status ihostmc-backend

# 3. Website
cd ../website
# If API URL changed: echo "NEXT_PUBLIC_API_URL=http://YOUR_IP:3010" > .env
npm ci
npm run build
sudo systemctl restart ihostmc-website
sudo systemctl status ihostmc-website
```

**Backend `.env` checklist** (edit `backend/.env`; never commit it):

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `DATABASE_URL` | Yes | `postgresql://user:password@localhost:5432/ihostmc` |
| `JWT_SECRET` | Yes | Min 32 chars; e.g. `openssl rand -hex 32` |
| `PORT` | No | Set `3010` so app/website use `http://HOST:3010` |
| `STRIPE_SECRET_KEY` | Billing | From Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Billing | Stripe → Webhooks → Add endpoint → Signing secret |
| `STRIPE_PRICE_ID_STARTER` | Billing | Product catalog → monthly price → copy `price_...` |
| `STRIPE_PRICE_ID_PRO` | Billing | Same for Pro tier |
| `STRIPE_PRICE_ID_BACKUP` | Billing | Same for Backup tier |
| `CORS_ORIGINS` | No | `*` for dev; or comma-separated origins |
| `BACKUP_STORAGE_PATH` | No | e.g. `/opt/iHostMC/backups` |
| `RELAY_PUBLIC_TOKEN` | No | If you want app to get FRP token from API |

**Stripe webhook:** Add endpoint URL `https://YOUR_API_HOST/api/stripe/webhook` and events `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Use the signing secret as `STRIPE_WEBHOOK_SECRET`.

**Test billing without subscribing (no real charge):** In Stripe Dashboard, switch to **Test mode** (toggle top-right). In test mode: copy **Secret key** (`sk_test_...`) and set `STRIPE_SECRET_KEY`; create one product per tier (Starter, Pro, Backup) with a recurring monthly price and paste each `price_...` into `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_BACKUP`; add the webhook in test mode and set `STRIPE_WEBHOOK_SECRET`. Restart the backend. In the app, click Subscribe → Stripe Checkout opens in test mode → use card **4242 4242 4242 4242**, any future expiry (e.g. 12/34), any CVC. No real payment is made.

## Ports

| Service   | Port | Purpose                          |
| --------- | ---- | --------------------------------- |
| Backend   | 3010 | API (auth, keys, backups, Stripe) |
| Website   | 3020 | Next.js (login, signup, dashboard)|
| frps      | 7000 | FRP relay (existing)              |
| FRP API   | 8081 | (existing)                        |

## 1. Backend

```bash
cd /opt/iHostMC/backend
cp .env.example .env
# Edit .env: DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, optional Stripe, RELAY_PUBLIC_TOKEN
# Set: PORT=3010, BACKUP_STORAGE_PATH=/opt/iHostMC/backups, CORS_ORIGINS=*
npm ci
npm run build
npm run db:migrate
```

Create backup dir and set in `.env`:

```bash
mkdir -p /opt/iHostMC/backups
# In .env: BACKUP_STORAGE_PATH=/opt/iHostMC/backups
```

Run (foreground): `PORT=3010 node dist/index.js`  
Or install systemd (edit `ExecStart` in the service file if your `node` is not at `/root/.nvm/versions/node/v22.20.0/bin/node`):

```bash
sudo cp /opt/iHostMC/deploy/ihostmc-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ihostmc-backend
sudo systemctl status ihostmc-backend
```

## 2. Website

Set the **public** API URL (used by the browser when users open the site). Build reads this at build time. If the live site loads but **styles/CSS are missing**, set `NEXT_PUBLIC_APP_URL` to the URL users open (e.g. `http://YOUR_SERVER_IP:3020` or your domain) so asset URLs are correct.

```bash
cd /opt/iHostMC/website
# Use this server's IP or hostname so browsers can reach the API
echo "NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:3010" > .env
# So CSS/JS assets load on the live site (use the URL users open in the browser)
echo "NEXT_PUBLIC_APP_URL=http://YOUR_SERVER_IP:3020" >> .env
npm install
npm run build
```

Run (foreground): `npm run start:server` (listens on 0.0.0.0:3020)  
Or systemd (if Node is via nvm, the service files use a fixed path; edit `ExecStart` to match `which node` / `which npm` on your server):

```bash
sudo cp /opt/iHostMC/deploy/ihostmc-website.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ihostmc-website
sudo systemctl status ihostmc-website
```

## 3. URLs

**IP-based (HTTP):**

- **Website:** `http://YOUR_SERVER_IP:3020`
- **API:** `http://YOUR_SERVER_IP:3010`

Browsers with HTTPS-Only Mode (e.g. Firefox) may block the API; use HTTPS or add an exception.

**HTTPS (recommended):** See **[docs/DNS-IHOST-ONE.md](DNS-IHOST-ONE.md)** for ihost.one / api.ihost.one, or **[docs/HTTPS-DUCKDNS.md](HTTPS-DUCKDNS.md)** for DuckDNS. Local dev can point at `https://api.ihost.one` and log in without certificate install on Windows.

## 4. Building the Windows (desktop) app

On your **Windows** (or CI) machine:

1. Clone repo, checkout `main`.
2. Copy `.env.example` to `.env`.
3. Set **API URL** to this server so the app talks to this backend:

   ```env
   VITE_API_BASE_URL=http://YOUR_SERVER_IP:3010
   ```

4. Build Tauri:

   ```bash
   npm install
   npm run tauri build
   ```

The built app will use this server for login, account, billing, relay token, and backups. Users can sign up / log in in the **browser** at `http://YOUR_SERVER_IP:3020` or inside the **app** (same account). Replace `YOUR_SERVER_IP` with this server's IP or hostname (e.g. from `curl -s ifconfig.me` or your domain).

## 5. CORS

Backend `.env` has `CORS_ORIGINS=*` so both the website and the desktop app (any origin) can call the API. For production with HTTPS (e.g. [HTTPS-DUCKDNS.md](HTTPS-DUCKDNS.md)), set explicit origins so the website and local dev can call the API:

```env
CORS_ORIGINS=https://ihost.one,http://localhost:3847,http://localhost:3000
```

Add other origins (e.g. Tauri app, second domain) as needed. For IP-based HTTP access only, `*` is fine.

## 6. Relay (FRPS) and Share server

The app uses **play.ihost.one** as the relay (frps on port 7000; port-api at https://play.ihost.one). To give logged-in app users the relay token (Share server), set in backend `.env`:

```env
RELAY_PUBLIC_TOKEN=<same token as in server/relay-public-token.txt>
```

Token must also match `server/frps/frps.toml` `auth.token`. After you push and pull on the server, see **[SERVER-FRPS-PROMPT.md](SERVER-FRPS-PROMPT.md)** for a copy-paste prompt to fix up FRPS, port-api, firewall (7000, 8081), and PM2.

## 7. Auto-deploy (iHostMC-builder)

The builder service watches for GitHub pushes (webhook or polling), runs `git pull` on `main`, builds backend and website, and restarts PM2 relay apps and systemd backend/website.

**Start:** `cd /opt/iHostMC && pm2 start deploy/ecosystem.config.cjs` then `pm2 save`.

**Logs:** `pm2 logs iHostMC-builder`.

**Trigger:** GitHub webhook `http://YOUR_SERVER_IP:9090/webhook` (set secret in `deploy/.env` as `GITHUB_WEBHOOK_SECRET`), or manual `curl -X POST http://localhost:9090/deploy`, or polling every 2 min (default in ecosystem). Replace `YOUR_SERVER_IP` with this server's IP or hostname.

**Fresh deploy (clean rebuild + relay + nginx):** To do a full refresh (clean website build, rebuild backend + website, restart relay frps/port-api, reload nginx), use `?fresh=1` or run from repo root: `./deploy/fresh-deploy.sh`. This hits `GET /deploy?trigger=1&fresh=1` on the builder. Ensure the deploy user can reload nginx (see `deploy/sudoers-ihostmc-builder` — add nginx -t and systemctl reload nginx if needed).
