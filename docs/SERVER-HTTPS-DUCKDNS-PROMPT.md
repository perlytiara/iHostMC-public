# Server prompt: enable HTTPS with DuckDNS

After you **pull the latest code** on the Linux server, paste the prompt below into Cursor **on the server** so it sets up HTTPS for ihostmc.duckdns.org and ihostmc-api.duckdns.org.

---

## Prompt (paste this on the server)

```
I'm on the Linux iHostMC server. Enable HTTPS using our DuckDNS domain so the website and API work with Firefox and local dev. Follow docs/HTTPS-DUCKDNS.md and do the following.

1) DuckDNS: ihostmc.duckdns.org and ihostmc-api.duckdns.org already point to this server's IP. Confirm with nslookup if needed.

2) Install nginx and Certbot if not already installed (apt install nginx certbot python3-certbot-nginx). Get a single certificate for both hostnames: certbot certonly --nginx -d ihostmc.duckdns.org -d ihostmc-api.duckdns.org.

3) Add nginx config: create /etc/nginx/sites-available/ihostmc with two server blocks — (a) ihostmc.duckdns.org proxying to 127.0.0.1:3020, (b) ihostmc-api.duckdns.org proxying to 127.0.0.1:3010 and forwarding /api/stripe/webhook with Stripe-Signature header. Use the Let's Encrypt cert path from step 2. Enable the site (symlink to sites-enabled), nginx -t, reload nginx.

4) Backend: in /opt/iHostMC/backend/.env set CORS_ORIGINS=https://ihostmc.duckdns.org,http://localhost:3847,http://localhost:3000 (or append to existing). Restart ihostmc-backend.

5) Website: in /opt/iHostMC/website/.env set NEXT_PUBLIC_API_URL=https://ihostmc-api.duckdns.org and NEXT_PUBLIC_APP_URL=https://ihostmc.duckdns.org. Run npm install and npm run build in website/, then restart ihostmc-website.

6) If we use Stripe, remind me to set the webhook URL in the Stripe Dashboard to https://ihostmc-api.duckdns.org/api/stripe/webhook.

Tell me when HTTPS is live and what URLs to use (website and API).
```

---

After the server is done, use **https://ihostmc.duckdns.org** in the browser and set **NEXT_PUBLIC_API_URL=https://ihostmc-api.duckdns.org** in website/.env on Windows for local dev.
