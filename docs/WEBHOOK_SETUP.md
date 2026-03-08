# GitHub webhook for auto-deploy (sync)

The PM2 **iHostMC-builder** on the server listens on port **9090**. When GitHub sends a webhook (on push to `main`), the builder runs `git pull`, builds backend + website, and restarts services.

The webhook uses a **private, unguessable path** (not `/webhook`) so the repo URL is not guessable. It is exposed over HTTPS via **api.ihost.one** so GitHub can reach it without opening port 9090.

## Add webhook in GitHub

1. Open **<https://github.com/perlytiara/iHostMC/settings/hooks>**
2. Click **Add webhook**
3. Fill in:
   - **Payload URL:** `https://api.ihost.one/_internal/ihostmc-deploy-github-7f3a9b2e4c1d8f6`  
     (Must match `GITHUB_WEBHOOK_PATH` in `deploy/.env`; default is this path.)
   - **Content type:** `application/json`
   - **Secret:** paste the value of `GITHUB_WEBHOOK_SECRET` from `deploy/.env` on the server (same line, no spaces)
   - **Which events:** Just the push event
4. Click **Add webhook**

## Check sync

- **Builder status:** On the server: `curl http://localhost:9090/status` (status is not exposed publicly).
- **Manual deploy:** On the server: `curl -X POST http://localhost:9090/deploy`
- After adding the webhook, push to `main` and the server will pull and redeploy automatically.

If the webhook URL is not reachable (e.g. before nginx is set up), the builder still polls every 2 minutes (`POLL_INTERVAL_MS=120000` in `deploy/.env`).

## Server notes

- **Nginx:** The deploy webhook is proxied from `https://api.ihost.one/_internal/...` to `127.0.0.1:9090`. See `deploy/nginx/ihost-one.conf`.
- **Sudo for systemctl:** So the builder can restart backend/website without a password, add a sudoers rule (e.g. `/etc/sudoers.d/ihostmc-builder`):

  ```text
  ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart ihostmc-backend, /bin/systemctl restart ihostmc-website, /bin/systemctl daemon-reload
  ```

- **Custom path:** To use a different private path, set `GITHUB_WEBHOOK_PATH` in `deploy/.env` (e.g. `/_internal/my-secret-deploy-xyz`) and use that full URL in GitHub. Nginx forwards any `/_internal/` path to the builder.
