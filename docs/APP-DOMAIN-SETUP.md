# App domain setup (dashboard on its own domain)

Use this when you want the **dashboard/app** on a separate domain (e.g. `app.ihost.one` or a domain you create). The dashboard UI has no website navbar—only the app top bar (profile, settings, hamburger).

---

## 1. DNS

At your DNS provider, add an **A** record (or **CNAME** if you prefer) so the new hostname points to your server:

| Host   | Type | TTL  | Data / Target    |
|--------|------|------|------------------|
| **app** (or your subdomain) | **A** | 3600 | **YOUR_SERVER_IP** |

- Example: host **app** → `app.ihost.one` resolves to your server.
- Use your actual server IP (same as ihost.one, e.g. `51.38.40.106` if that’s your box).

Wait for DNS to propagate (a few minutes up to TTL).

---

## 2. Nginx

Add the new hostname to your existing website server block **or** duplicate the `mc.ihost.one` block and change `server_name`:

**Option A – same cert as ihost.one (subdomain of ihost.one):**

1. In `deploy/nginx/ihost-one.conf`, add your host to the HTTP redirect and to the certbot comment, e.g.:
   - `server_name ihost.one ... app.ihost.one;`
2. Add a new `server { ... }` block for `app.ihost.one` that mirrors the main website block (or the `mc.ihost.one` block): same `proxy_pass http://127.0.0.1:3020`, same `location /` and `location /_next/static/` (with `$request_uri` for static).
3. Get a cert that includes the new name:
   ```bash
   sudo certbot certonly --nginx -d app.ihost.one
   ```
   Or extend the existing cert:
   ```bash
   sudo certbot certonly --nginx -d ihost.one -d www.ihost.one -d api.ihost.one -d play.ihost.one -d mc.ihost.one -d cloud.ihost.one -d app.ihost.one
   ```

**Option B – different domain (e.g. `myapp.com`):**

1. Create a new server block for that domain (copy from the main `ihost.one` website block).
2. Set `server_name` to your domain.
3. Run certbot for that domain:
   ```bash
   sudo certbot certonly --nginx -d myapp.com -d www.myapp.com
   ```

Then copy the updated config and reload:

```bash
sudo cp /opt/iHostMC/deploy/nginx/ihost-one.conf /etc/nginx/sites-available/ihost-one
sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. App / env (optional)

If the app will be served from a different origin:

- Set **NEXT_PUBLIC_APP_URL** (and **NEXT_PUBLIC_API_URL** if the API is on another host) in `website/.env` and rebuild so links and CORS use the right URLs.
- If everything (site + dashboard) is still on the same server and only the hostname changes, you may not need to change env; nginx will route by host.

---

## Summary

1. **DNS:** A record for your app host → server IP.
2. **Nginx:** New server block (or add host to an existing one) with `proxy_pass` to `127.0.0.1:3020`.
3. **HTTPS:** `certbot certonly --nginx -d your-app-host`.
4. **Reload nginx.** The dashboard will load on the new domain with no website navbar, only the app top bar and sidebar.
