# iHostMC auto-deploy (wait for server, logs)

Use this **on the server** (Linux) or **from Windows** so Cursor knows how to trigger the auto-update, wait until the server is done, and read build logs.

## Quick reference

- **Server IP:** `51.75.53.62` (use `localhost` when on the server).
- **Builder URL:** `http://51.75.53.62:9090`
- **Trigger deploy:** `POST http://51.75.53.62:9090/deploy` or `GET http://51.75.53.62:9090/deploy?trigger=1`. Force full rebuild: `?build=1` or `?force=1`.
- **Wait until done:** Poll `GET http://51.75.53.62:9090/health` (or `/`) until `deployInProgress === false`. Builder may also expose `GET /status` with `lastDeployResult`; if not, check PM2 logs for outcome.
- **Build logs:** On the server run `pm2 logs iHostMC-builder` (or `pm2 logs iHostMC-builder --lines 100`). Logs use France time (Europe/Paris).
- **Website (after deploy):** `http://51.75.53.62:3020` · **API:** `http://51.75.53.62:3010`

## When pushing from Windows (or after updating repo)

1. **Trigger deploy** (if not using GitHub webhook/polling):
   - `curl -X POST "http://51.75.53.62:9090/deploy"` or `curl "http://51.75.53.62:9090/deploy?trigger=1"`
   - Force rebuild: add `?build=1` or `?force=1`.

2. **Wait until deploy is finished:**
   - Poll `GET http://51.75.53.62:9090/health` until `deployInProgress` is `false`.
   - If the builder exposes `GET /status`, read `lastDeployResult`; otherwise check `pm2 logs iHostMC-builder` for outcome.

3. **View build logs:**
   - On the server: `pm2 logs iHostMC-builder` (France time). Use `--lines N` for last N lines.

4. **On the server – trigger and wait in one command:**
   ```bash
   cd /opt/iHostMC && ./deploy/trigger-and-wait.sh http://localhost:9090
   ```
   Triggers deploy, polls until done, then prints final status.

5. **One-liner to trigger and wait (bash):**
   ```bash
   curl -s -X POST "http://51.75.53.62:9090/deploy" && until curl -s "http://51.75.53.62:9090/health" | grep -q '"deployInProgress":false'; do sleep 5; done && curl -s "http://51.75.53.62:9090/health"
   ```

## Status / health response (for polling)

`GET /health` or `GET /` returns JSON like (builder may add `lastDeployResult` in a future version):

```json
{
  "service": "iHostMC-builder",
  "uptime": 123.45,
  "deployInProgress": false,
  "lastDeployStartedAt": "2026-02-23T21:00:00.000Z",
  "lastDeployFinishedAt": "2026-02-23T21:05:00.000Z",
  "lastDeployResult": {
    "ok": true,
    "error": null,
    "steps": [
      { "pull": "updated" },
      { "backend_build": "ok" },
      { "website_build": "ok" },
      { "systemd": "ihostmc-backend" },
      { "systemd": "ihostmc-website" }
    ]
  }
}
```

When `deployInProgress` is `true`, a deploy is running. When it turns `false`, check `lastDeployResult.ok` and `lastDeployResult.error` for outcome.

## From Windows (push then wait)

1. Push to `main` (or the branch configured as `DEPLOY_BRANCH`). Webhook/polling may start deploy automatically.
2. To wait from your machine: poll `http://51.75.53.62:9090/health` until `deployInProgress` is false.
3. To see logs remotely: `ssh user@51.75.53.62 "pm2 logs iHostMC-builder --lines 80"`.

4. **Trigger and wait (PowerShell):**
   ```powershell
   Invoke-WebRequest -Uri "http://51.75.53.62:9090/deploy" -Method POST -UseBasicParsing | Out-Null
   do { Start-Sleep -Seconds 5; $h = Invoke-RestMethod -Uri "http://51.75.53.62:9090/health" } while ($h.deployInProgress -eq $true)
   $h | ConvertTo-Json -Depth 5
   ```
   Then check build logs on the server: `ssh user@51.75.53.62 "pm2 logs iHostMC-builder --lines 80"`.

## Server PM2 notes

- Logs are in France time (Europe/Paris). Set `TZ_LOG` or `TZ` in `deploy/.env` to change.
- Restart builder after changing deploy config: `cd /opt/iHostMC && pm2 restart iHostMC-builder && pm2 save`.

## Backend .env (dev tier testing)

For testing billing tiers without payment (dev only, not for production), see **docs/STRIPE-AND-TIER-TEST.md**. On the server, set in the backend `.env`: `ALLOW_DEV_TIER_OVERRIDE=true`, `DEV_TIER_OVERRIDE_SECRET=<secret>`, and optionally `DEV_TIER_OVERRIDE_EMAIL=overflowedimagination@gmail.com`. Run `npm run db:migrate` in the backend once. Then the allowed account can switch tiers from **Settings → Account** (Dev: Switch tier) or via the API.
