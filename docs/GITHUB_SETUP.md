# GitHub setup (deploy key + webhook + login with GitHub)

Do these once so the server can pull on push and you can log in with GitHub in the browser.

---

## 1. Deploy key (so the server can `git pull` without password)

1. Open your repo: **<https://github.com/perlytiara/iHostMC>**
2. Go to **Settings → Deploy keys → Add deploy key**
3. **Title:** `iHostMC server 51.38.40.106`
4. **Key:** paste this (one line):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDHKoFQaJLEP7/q4ttkF6LkndeZ24EW4FEQDNavpCxkG ihostmc-deploy@51.38.40.106
```

5. Leave **Allow write access** unchecked (read-only is enough)
6. Click **Add key**

After this, the deploy builder’s `git fetch` / `git pull` will work without any prompt. The repo remote is already set to `git@github.com:perlytiara/iHostMC.git`.

---

## 2. Webhook (so each push to `main` triggers a deploy)

1. Same repo: **Settings → Webhooks → Add webhook**
2. **Payload URL:** `https://api.ihost.one/_internal/ihostmc-deploy-github-7f3a9b2e4c1d8f6` (private path; must match `GITHUB_WEBHOOK_PATH` in `deploy/.env`)
3. **Content type:** `application/json`
4. **Secret:** use the value of `GITHUB_WEBHOOK_SECRET` from `deploy/.env` on the server (or ask whoever set the server to give it to you)
5. **Which events:** Just the push event
6. Save

The webhook is proxied via nginx from api.ihost.one to the builder. If the URL is not reachable, **polling** is still enabled in `deploy/.env` (`POLL_INTERVAL_MS=120000`, every 2 minutes).

---

## 3. Log in with GitHub (OAuth – “log in through the browser”)

To show a “Log in with GitHub” button on the site:

1. **Create a GitHub OAuth App:** <https://github.com/settings/applications/new>
2. **Application name:** e.g. `iHostMC`
3. **Homepage URL:** `http://51.38.40.106:3020` (or your future domain)
4. **Authorization callback URL:** `http://51.38.40.106:3010/api/auth/github/callback`  
   (When you add a domain, change to `https://your-api-domain/api/auth/github/callback`.)
5. Register the app, then create a **Client secret** and copy **Client ID** and **Client secret**
6. On the server, edit `backend/.env` and set:

```env
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
```

7. Restart the backend: `sudo systemctl restart ihostmc-backend`

After this, the login/signup page will show “Continue with GitHub”; you log in with GitHub in the browser and are not asked for a password in the terminal.

More detail: `docs/OAUTH-SETUP.md`.

---

## Summary

| Step            | What it does |
|-----------------|--------------|
| Deploy key      | Server can `git pull` without credentials; webhook/poll deploys work |
| Webhook         | Push to `main` triggers deploy (or use polling if 9090 is closed) |
| GitHub OAuth    | “Log in with GitHub” on the website |

Domain name can be added later; then update `WEBSITE_URL`, `BACKEND_PUBLIC_URL`, `NEXT_PUBLIC_*`, CORS, and the OAuth callback URL.
