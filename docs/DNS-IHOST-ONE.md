# Full custom DNS for ihost.one – point to this server

Use these records so **ihost.one** (website), **api.ihost.one** (API), and **play.ihost.one** (relay) point to the iHostMC server and you can get HTTPS certs.

**Server IP:** `51.38.40.106`

---

## Where to add records

In your DNS provider (e.g. **Squarespace** → Domains → **ihost.one** → **DNS** → **Custom records**, or any registrar that lets you manage DNS):

- Remove or replace any default A/CNAME for **@** and **www** if you want the root domain to hit this server.
- Add the custom records below. TTL can be **30 mins** or **1 hr** while testing, then increase (e.g. **4 hrs**).

---

## Custom DNS records (full set)

All of these point the domain (and subdomains) to the same server so nginx can serve the app and Let's Encrypt can verify for HTTPS.

| Host   | Type  | Priority | TTL   | Data / Target      | Notes                          |
|--------|-------|----------|-------|--------------------|--------------------------------|
| **@**  | **A** | —        | 3600  | **51.38.40.106**   | ihost.one → iHostMC website   |
| **www**| **A** | —        | 3600  | **51.38.40.106**   | www.ihost.one (redirect in nginx) |
| **api**| **A** | —        | 3600  | **51.38.40.106**   | api.ihost.one → backend API   |
| **play**| **A**| —        | 3600  | **51.38.40.106**   | play.ihost.one → relay        |

- **Host:** In most panels, **@** = root (ihost.one), **www** = www.ihost.one, **api** = api.ihost.one, **play** = play.ihost.one. If your provider uses “subdomain” only, leave @ as “root” or “blank” for the root, and use **www**, **api**, **play** as subdomains.
- **Type:** A (IPv4). Use AAAA with your server’s IPv6 if you have one.
- **Priority:** Leave empty or 0 for A records.
- **Data:** `51.38.40.106` for every A record above.

Optional (keep if you use email on the domain):

- **MX** – leave as your provider’s defaults if you use their email.
- **TXT** (SPF/DKIM/DMARC) – leave as-is for email; not needed for HTTPS.

---

## Check that DNS is correct

After saving and waiting for TTL:

```bash
# All should resolve to 51.38.40.106
nslookup ihost.one
nslookup www.ihost.one
nslookup api.ihost.one
nslookup play.ihost.one
```

---

## Server setup after DNS is live (HTTPS)

On the server (51.38.40.106):

1. **Nginx + Let's Encrypt (certify the domain for HTTPS)**
   ```bash
   sudo cp /opt/iHostMC/deploy/nginx/ihost-one.conf /etc/nginx/sites-available/ihost-one
   sudo ln -sf /etc/nginx/sites-available/ihost-one /etc/nginx/sites-enabled/
   sudo certbot certonly --nginx -d ihost.one -d www.ihost.one -d api.ihost.one -d play.ihost.one --non-interactive --agree-tos -m admin@ihost.one
   sudo nginx -t && sudo systemctl reload nginx
   ```

2. **Backend and website** (envs use ihost.one / api.ihost.one / play.ihost.one). Restart and rebuild:
   ```bash
   cd /opt/iHostMC/website && npm run build && sudo systemctl restart ihostmc-website
   sudo systemctl restart ihostmc-backend
   ```

3. **Relay** (play.ihost.one):
   ```bash
   cd /opt/iHostMC/server && pm2 restart ihostmc-relay-frps ihostmc-relay-port-api
   ```

After that, HTTPS will work for **https://ihost.one**, **https://api.ihost.one**, and **https://play.ihost.one**.
