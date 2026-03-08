# HTTPS with DuckDNS (legacy)

**Canonical domains:** For production we use **ihost.one** (website) and **api.ihost.one** (API). See **[docs/DNS-IHOST-ONE.md](DNS-IHOST-ONE.md)**. This page describes the legacy DuckDNS setup.

Use your DuckDNS domain so the website and API are served over HTTPS. Browsers (including Firefox with HTTPS-Only Mode) and the desktop app can then connect without being blocked.

**Result:**

- **Website:** `https://ihostmc.duckdns.org` → Next.js (port 3020)
- **API:** `https://ihostmc-api.duckdns.org` → Backend (port 3010)
- **Local dev:** Run the website on `http://localhost:3847` and set the API to `https://ihostmc-api.duckdns.org` so you can log in against the real server.

No certificate install on Windows is needed: Let's Encrypt certificates are trusted by all major browsers and the OS.

---

## 1. DuckDNS

1. In [DuckDNS](https://www.duckdns.org/) ensure **ihostmc.duckdns.org** points to your server IP (e.g. `51.75.53.62`).
2. Create a second hostname for the API: **ihostmc-api** (DuckDNS gives you `ihostmc-api.duckdns.org`). Set its IP to the same server IP. You should have:
   - `ihostmc.duckdns.org` → your server IP
   - `ihostmc-api.duckdns.org` → same IP

Verify from your PC:

```bash
nslookup ihostmc.duckdns.org
nslookup ihostmc-api.duckdns.org
```

Both should resolve to `51.75.53.62` (or your server IP).

---

## 2. Server: install nginx and Certbot

On the Linux server (e.g. Ubuntu/Debian):

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## 3. Get Let's Encrypt certificates

Certbot will obtain certificates and nginx will serve the validation. Run on the server:

```bash
sudo certbot certonly --nginx -d ihostmc.duckdns.org -d ihostmc-api.duckdns.org
```

Use one certificate for both hostnames (or run certbot twice for separate certs). Accept the prompts (email, terms). Certificates will be under `/etc/letsencrypt/live/ihostmc.duckdns.org/` (or the first domain you chose).

---

## 4. Nginx configuration

Create a config that proxies HTTPS to your Node services:

```bash
sudo nano /etc/nginx/sites-available/ihostmc
```

Paste (replace the `ssl_certificate` paths if certbot used a different directory):

```nginx
# Website – https://ihostmc.duckdns.org
server {
  listen 443 ssl http2;
  server_name ihostmc.duckdns.org;

  ssl_certificate     /etc/letsencrypt/live/ihostmc.duckdns.org/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/ihostmc.duckdns.org/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3020;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

# API – https://ihostmc-api.duckdns.org
server {
  listen 443 ssl http2;
  server_name ihostmc-api.duckdns.org;

  ssl_certificate     /etc/letsencrypt/live/ihostmc.duckdns.org/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/ihostmc.duckdns.org/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /api/stripe/webhook {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Stripe-Signature $http_stripe_signature;
  }
}
```

If you obtained separate certs for the API hostname, use that cert path in the second `server` block.

Enable the site and reload nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/ihostmc /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Backend .env (on server)

Allow the website and local dev to call the API:

```bash
cd /opt/iHostMC/backend
nano .env
```

Set:

```env
CORS_ORIGINS=https://ihostmc.duckdns.org,http://localhost:3847,http://localhost:3000
```

Add other origins if needed (e.g. a second domain). Restart the backend:

```bash
sudo systemctl restart ihostmc-backend
```

---

## 6. Website .env and rebuild (on server)

Point the website at the HTTPS API and its own **public** HTTPS URL (no port). `NEXT_PUBLIC_APP_URL` sets Next.js `assetPrefix`, so CSS/JS load from the same origin users use; if you use a port or HTTP here, assets will fail (e.g. mixed content or wrong host).

```bash
cd /opt/iHostMC/website
cat > .env << 'EOF'
NEXT_PUBLIC_API_URL=https://ihostmc-api.duckdns.org
NEXT_PUBLIC_APP_URL=https://ihostmc.duckdns.org
EOF
npm run build
sudo systemctl restart ihostmc-website
```

---

## 7. Stripe webhook (if you use billing)

In the Stripe Dashboard, set the webhook URL to:

`https://ihostmc-api.duckdns.org/api/stripe/webhook`

Use the same signing secret in backend `.env` as `STRIPE_WEBHOOK_SECRET`.

---

## 8. Local dev (Windows) – use real API over HTTPS

So you can run the website locally and log in against the real server (no Firefox HTTPS-Only blocking):

1. In **website/.env** (on your dev machine) set:

   ```env
   NEXT_PUBLIC_API_URL=https://ihostmc-api.duckdns.org
   ```

2. Start the site: `npm run dev` (e.g. http://localhost:3847).
3. Open the login page; sign in with a real account. The browser calls `https://ihostmc-api.duckdns.org`, so there is no HTTP→HTTPS upgrade issue.

The backend already allows `http://localhost:3847` in `CORS_ORIGINS` (step 5), so the API will accept requests from your local dev.

---

## 9. Desktop app (production build)

When building the Windows app that should talk to this server, set in the **app** `.env` (repo root or app folder, depending on your Tauri setup):

```env
VITE_API_BASE_URL=https://ihostmc-api.duckdns.org
```

Then run `npm run tauri build`. The built app will use the HTTPS API.

---

## 10. Renewing certificates

Let's Encrypt certs expire after 90 days. Certbot can renew automatically:

```bash
sudo certbot renew --dry-run
```

If that succeeds, set a cron or systemd timer (often already installed with certbot):

```bash
sudo systemctl status certbot.timer
```

After renewal, reload nginx: `sudo systemctl reload nginx`.

---

## 11. Optional: redirect HTTP → HTTPS

To force HTTPS only, add above each `server { listen 443 ... }` block:

```nginx
server {
  listen 80;
  server_name ihostmc.duckdns.org ihostmc-api.duckdns.org;
  return 301 https://$host$request_uri;
}
```

(Or one such block with both `server_name` values.) Then reload nginx.

---

## Certificate on Windows (optional)

**Production:** You do **not** need to install any certificate on Windows. Let's Encrypt is trusted by Windows and all browsers.

**Local HTTPS dev server:** If you later run the Next.js dev server over HTTPS with a **self-signed** cert (e.g. for testing), Windows will show a warning. To trust that cert on Windows:

1. Generate a self-signed cert (e.g. with OpenSSL or `mkcert`).
2. In Chrome/Edge: open `https://localhost:3847`, click "Advanced" → "Proceed to localhost". For system-wide trust, add the cert to Windows: run `certutil -addstore -user ROOT path\to\cert.pem` in an elevated PowerShell, or double-click the cert and choose "Install Certificate" → "Current User" → "Place all in: Trusted Root Certification Authorities".

For normal iHostMC use (browser to https://ihostmc.duckdns.org and local dev to https://ihostmc-api.duckdns.org), no Windows cert install is required.
