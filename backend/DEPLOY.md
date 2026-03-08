# iHostMC Backend – Deployment (Linux Server)

Backend for auth, encrypted API key storage, usage tracking, and Stripe billing. Run on your Linux server with PostgreSQL and (optionally) Stripe.

**Full server runbook (backend + website + get up to date):** see [../docs/SERVER-DEPLOY.md](../docs/SERVER-DEPLOY.md).

## Get up to date (backend only)

```bash
cd /opt/iHostMC/backend   # or your path
git pull
cp .env.example .env      # only if .env missing; then fill .env
npm ci
npm run build
npm run db:migrate
sudo systemctl restart ihostmc-backend
```

Ensure `.env` has at least `DATABASE_URL`, `JWT_SECRET`, `PORT=3010`. For billing add Stripe keys and `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_BACKUP` (see `../docs/SERVER-DEPLOY.md` or `.env.example`).

## Requirements

- Node.js 18+
- PostgreSQL 14+
- (Optional) Stripe account for billing

## Quick start (local)

```bash
cp .env.example .env
# Edit .env: set DATABASE_URL and JWT_SECRET at minimum
npm install
npm run db:migrate
npm run dev
```

## Linux server setup

### 1. Install Node and PostgreSQL

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm postgresql postgresql-contrib

# Or use Node 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Create database and user

```bash
sudo -u postgres psql -c "CREATE USER ihostmc WITH PASSWORD 'your-secure-password';"
sudo -u postgres psql -c "CREATE DATABASE ihostmc OWNER ihostmc;"
```

### 3. Clone repo and build backend

```bash
cd /opt/ihostmc  # or your path
git clone <repo-url> .
cd backend
npm ci
npm run build
npm run db:migrate
```

### 4. Environment file

Create `/opt/ihostmc/backend/.env` (or use systemd environment):

- `DATABASE_URL=postgresql://ihostmc:your-secure-password@localhost:5432/ihostmc`
- `JWT_SECRET=` a long random string (e.g. `openssl rand -base64 32`)
- `ENCRYPTION_KEY=` at least 32 chars (e.g. `openssl rand -hex 32`) so API keys are encrypted at rest
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` if using Stripe
- `CORS_ORIGINS=` your Tauri app origin(s), e.g. `https://app.yourapp.com` or `capacitor://localhost` for mobile

### 5. Systemd service

Create `/etc/systemd/system/ihostmc-backend.service`:

```ini
[Unit]
Description=iHostMC Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ihostmc/backend
Environment=NODE_ENV=production
EnvironmentFile=/opt/ihostmc/backend/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ihostmc-backend
sudo systemctl start ihostmc-backend
sudo systemctl status ihostmc-backend
```

### 6. Reverse proxy (HTTPS)

Use nginx (or Caddy) in front so the app is served over HTTPS. Example nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name api.yourapp.com;
  ssl_certificate /etc/letsencrypt/live/api.yourapp.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.yourapp.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /api/stripe/webhook {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Stripe-Signature $http_stripe_signature;
  }
}
```

Stripe webhook URL: `https://api.yourapp.com/api/stripe/webhook`. Configure it in Stripe Dashboard and set `STRIPE_WEBHOOK_SECRET` in `.env`.

### 7. Security

- Keep `.env` out of version control and restrict permissions: `chmod 600 .env`
- Use a strong `JWT_SECRET` and `ENCRYPTION_KEY` (different values)
- Prefer HTTPS only; set `CORS_ORIGINS` to your real app origin(s)
- Run the process as a dedicated user (e.g. `www-data`), not root

## API overview

- `POST /api/auth/register` – create account (email, password)
- `POST /api/auth/login` – login (email, password) → JWT
- `GET /api/auth/me` – current user (Bearer token)
- `GET/PUT/DELETE /api/keys/:keyName` – encrypted API keys (e.g. `curseforge`); requires auth
- `POST /api/usage` – record usage event; requires auth
- `GET /api/usage/summary` – usage summary; requires auth
- `POST /api/stripe/create-checkout-session` – Stripe Checkout URL; requires auth
- `POST /api/stripe/customer-portal` – Stripe Customer Portal URL; requires auth
- `POST /api/stripe/webhook` – Stripe webhooks (raw body, no auth)

## Open source and secrets

The backend code is open source. Secrets (DB password, JWT secret, Stripe keys, encryption key) live only in environment variables on the server, not in the repo. API keys stored via `/api/keys` are encrypted at rest using `ENCRYPTION_KEY`.
