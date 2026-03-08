# Cursor: Local ↔ Server workflow (iHost at 51.38.40.106)

Use this when you want to **stay in sync with the server** and **converse with the Cursor instance on the server** (e.g. tell it to run updates, migrations, or debug).

---

## 1. Get up to date locally

```powershell
cd "c:\Users\user\Documents\Git Projects\iHostMC"
git pull
```

You’re then on the latest `main` (or your branch). Push when you have commits to deploy.

---

## 2. Server and repo on the server

- **Host:** 51.38.40.106  
- **User:** ubuntu  
- **Repo on server:** `/opt/iHostMC`  
- **SSH:** `ssh ubuntu@51.38.40.106` (use your SSH key or password).

---

## 3. Sync after you push (two options)

### Option A – Trigger deploy from your machine (if builder is reachable)

- Trigger: `POST http://51.38.40.106:9090/deploy`
- Wait: poll `GET http://51.38.40.106:9090/health` until `deployInProgress === false`
- From repo (e.g. WSL/Git Bash on server): `./deploy/trigger-and-wait.sh http://51.38.40.106:9090`
- See **CURSOR-DEPLOY.md** (use IP 51.38.40.106 instead of 51.75.53.62).

### Option B – SSH in and run update yourself

1. SSH: `ssh ubuntu@51.38.40.106`
2. `cd /opt/iHostMC`
3. `git pull origin main`
4. Then follow **PROMPT-SERVER-UPDATE.md** (backend: `npm ci`, `npm run db:migrate`, restart; website: `npm ci`, build, restart; verify).

---

## 4. Converse with Cursor on the server

- **SSH** into the server and open the repo in Cursor (e.g. **Remote – SSH** in Cursor to `ubuntu@51.38.40.106`, then open `/opt/iHostMC`), **or**  
- Open a terminal on the server and run the commands from the prompts below; then paste any “return prompt” back into Cursor on your Windows machine.

### Full update on server

Paste the **“Prompt (copy-paste this)”** block from **PROMPT-SERVER-UPDATE.md** into the Cursor chat on the server (in `/opt/iHostMC`). It will pull, run backend migrations, restart backend and website, and verify.

### Debug handoff (e.g. backend 500)

Use **CURSOR-SERVER-DEBUG.md**: paste the “Prompt to give to Cursor on the server” into the server Cursor; run the steps; then paste the “Return prompt” back into Cursor on Windows so it can fix code or config.

---

## 5. Quick reference

- **Pull latest** – Local (Windows): `git pull`
- **Push to deploy** – Local: `git push origin main` (then trigger deploy or SSH update)
- **Trigger deploy** – Local or server: `POST http://51.38.40.106:9090/deploy` then poll `/health`
- **Run update on server** – Server (`/opt/iHostMC`): follow **PROMPT-SERVER-UPDATE.md** (or paste its prompt into server Cursor)
- **Debug backend** – Server then local: **CURSOR-SERVER-DEBUG.md** (server Cursor → return prompt → Windows Cursor)

---

## Related docs

- **PROMPT-SERVER-UPDATE.md** – Full server update steps and copy-paste prompt for server Cursor.
- **CURSOR-DEPLOY.md** – Trigger deploy and wait (use 51.38.40.106 for this host).
- **CURSOR-SERVER-DEBUG.md** – Backend debug handoff (server Cursor → return prompt → client).
- **SERVER_SETUP_PROMPT.md** – Initial server setup at 51.38.40.106.
