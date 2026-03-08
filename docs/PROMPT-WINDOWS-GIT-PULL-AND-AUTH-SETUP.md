# Prompt: Windows – git pull and OAuth auth-setup

> **WIP** — Sign-in options setup is work in progress. Use the TODO below to pick up later.

Use this prompt (or follow the steps) when you're on **Windows** and want to get the latest repo, then run the OAuth sign-in setup and understand what's going on.

---

## TODO: Sign-in setup (pick up later)

- [ ] **Backend URL for callbacks** — e.g. `https://api.ihost.one` (set when running `npm run auth-setup`)
- [ ] **Google** — Create OAuth client at [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials); redirect URI: `{BACKEND_URL}/api/auth/google/callback`; env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] **GitHub** — Create OAuth App at [GitHub OAuth Apps](https://github.com/settings/applications/new); callback: `{BACKEND_URL}/api/auth/github/callback`; env: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- [ ] **Discord** — Create app at [Discord Developer Portal](https://discord.com/developers/applications), OAuth2 → Redirects; redirect: `{BACKEND_URL}/api/auth/discord/callback`; env: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`
- [ ] **Microsoft** — Register app at [Azure Registered Apps](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade); redirect: `{BACKEND_URL}/api/auth/microsoft/callback`; env: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`
- [ ] **Write keys to `backend/.env`** — Run `npm run auth-setup` and choose **y** at the end to write the OAuth block
- [ ] **Restart backend** — Server: `sudo systemctl restart ihostmc-backend`; Windows dev: stop/start `npm run dev` in `backend/`

Progress is saved in `tools/ihost-auth-setup/.auth-setup-progress.json`.

---

## Prompt (copy-paste this)

```text
I'm on Windows. I need to:

1. Get the latest iHostMC repo: open a terminal in the repo folder and run `git pull origin main`. If you're not in the repo yet, clone it first: `git clone https://github.com/perlytiara/iHostMC.git` then `cd iHostMC`.

2. Run the OAuth auth-setup so my org has sign-in (GitHub, Google, Discord, Microsoft). The script is step-by-step: run `npm run auth-setup` from the repo root. It will:
   - Show progress (e.g. 0/4 providers done)
   - For each provider ask "Set up X now? (y/n/skip)"
   - If I say y, it walks me through: open this URL → set this callback URL → paste Client ID and Client Secret
   - Save progress so I can stop and run again later
   - At the end offer to write the keys into backend/.env

3. Explain what's going on: what the script does, what each provider is for (sign-in on the website/app), and what I need to do on each provider's site (create an OAuth app, set callback URL, copy Client ID/Secret). Tell me where the backend .env lives and that I need to restart the backend after adding keys (on the server: `sudo systemctl restart ihostmc-backend`; on Windows dev the backend is usually `npm run dev` in backend/ and picks up .env on restart).
```

---

## Steps (no prompt)

1. **Open terminal** in the iHostMC folder (e.g. PowerShell or Git Bash).

2. **Pull latest**

   ```bash
   git pull origin main
   ```

   To get the latest app (e.g. sync big-files count fix: "X of Y big" and mini/big in synced tree):

   - **If you build the app from source:** after `git pull`, run `npm install` in the repo root, then `npm run tauri build` (or `npm run tauri dev` to run without building installer). The new build will show synced storage as "N of P mini, M of Q big" when a scan exists, and the synced files tree header will show "X mini · Y big · size".
   - **If you use a pre-built installer:** download the latest release/installer from the project’s releases page; install and run the new build.

3. **Run auth-setup**

   ```bash
   npm run auth-setup
   ```

   - Say **y** for each provider you want to set up (or **n**/skip and run again later).
   - Follow the steps: open the URL, set the callback URL it shows, then paste Client ID and Client Secret when asked.
   - At the end, say **y** to write keys to `backend/.env`.

4. **What's going on**
   - The script collects OAuth **Client ID** and **Client Secret** for Google, GitHub, Discord, and Microsoft.
   - You create one "app" per provider on their developer site (e.g. GitHub OAuth App). That app is your org's dedicated sign-in for iHost.
   - The **callback URL** you set on each provider must be exactly what the script prints (e.g. `https://api.ihost.one/api/auth/github/callback`).
   - The script writes these into `backend/.env`. The backend reads them and shows "Sign in with GitHub" (etc.) on the website and in the app. After changing `.env`, restart the backend (on the server: `sudo systemctl restart ihostmc-backend`; locally: stop and start `npm run dev` in `backend/`).

5. **Progress** is saved in `tools/ihost-auth-setup/.auth-setup-progress.json`. You can run `npm run auth-setup` again anytime to add more providers or re-run the "write to backend/.env" step.

---

## After push: keep app and server in sync

When code is pushed to `main`, both **Windows (app)** and **server (backend, website, nginx)** should be updated so they stay in sync.

### On Windows (your machine / Cursor)

1. **Pull and rebuild the app**

   ```bash
   cd iHostMC
   git pull origin main
   npm install
   npm run tauri build
   ```

   Or to run without building an installer: `npm run tauri dev`.

2. **Tell the server to update** (if you’re the one deploying):

   - **Option A – Cursor on the server:** Open the repo on the server in Cursor and paste the prompt from **docs/PROMPT-SERVER-UPDATE.md** (e.g. “I need to update the iHostMC server. Please: 1. Pull… 2. Backend… 3. Website… 4. Fix sync big files… 5. Verify…”). The agent will run `git pull`, `npm ci`, `db:migrate`, restarts, and nginx changes.
   - **Option B – SSH + terminal:** SSH into the server, `cd` to the repo (e.g. `/opt/iHostMC`), then run the same steps as in PROMPT-SERVER-UPDATE.md: `git pull origin main`, then backend `npm ci` and `npm run db:migrate` and `sudo systemctl restart ihostmc-backend`, then website `npm ci` and `npm run build` and restart the website service, then nginx if needed.

### On the server (terminal / Cursor on server)

After **you** push, or after someone else pushes and you want the server up to date:

1. In the repo on the server (e.g. `/opt/iHostMC`), run the full update flow. Easiest: open **docs/PROMPT-SERVER-UPDATE.md** in Cursor on the server and paste the prompt into the agent; it will run pull, migrate, restarts, and nginx.
2. Or run manually in a terminal on the server:

   ```bash
   cd /opt/iHostMC
   git pull origin main
   cd backend && npm ci && npm run db:migrate && sudo systemctl restart ihostmc-backend
   cd ../website && npm ci && npm run build && sudo systemctl restart ihostmc-website
   # If sync big files need nginx changes: edit nginx (client_max_body_size 512M; timeouts 600s), then:
   sudo nginx -t && sudo systemctl reload nginx
   ```

### Constant exchange

- **You push from Windows** → Pull on server (Cursor prompt or SSH) so backend/website/nginx are updated; pull + build on Windows so the app is updated.
- **Someone else pushes** → On Windows: `git pull origin main` then `npm install` and `npm run tauri build` (or `tauri dev`). On server: run the PROMPT-SERVER-UPDATE flow so the server matches the repo.
- Keep **docs/PROMPT-SERVER-UPDATE.md** handy on the server so Cursor (or you in terminal) can run the same steps every time.
