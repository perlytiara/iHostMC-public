# Cursor auto-deploy prompt

Use this when a task says: *trigger the server deploy and wait for status deployInProgress false*.

## Steps

1. **Trigger deploy:**  
   `POST http://51.75.53.62:9090/deploy`  
   (Or from repo: pull latest from main first, then trigger so the server builds the latest code.)

2. **Wait until done:**  
   Poll `GET http://51.75.53.62:9090/health` until the JSON has `"deployInProgress": false`.

3. **Check result:**  
   In the same health response, if present, check `lastDeployResult.ok` and `lastDeployResult.error` for build outcome.

**Full details (PowerShell, curl, logs):** see [CURSOR-DEPLOY.md](CURSOR-DEPLOY.md).

**After deploy:** Website at `http://51.75.53.62:3020`, API at `http://51.75.53.62:3010`.
