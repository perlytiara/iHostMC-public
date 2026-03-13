# iHostMC — Minecraft Server Manager

Cross-platform Minecraft server manager. App-only (no backend).

```bash
git clone https://github.com/perlytiara/iHostMC.git
cd iHostMC
cp .env.public.example .env
npm install
npm run tauri dev
```

**Build:** `npm run build:public`

**CI (GitHub Actions):** Add Variables and Secrets so release builds work. From repo root:
```bash
npm run setup:gh                    # set Variables (VITE_API_BASE_URL, VITE_WEBSITE_URL)
npm run setup:gh -- --secrets       # set Secrets from .env.gh-secrets (TAURI_SIGNING_*)
```
Requires [gh CLI](https://cli.github.com/) and `gh auth login`. See `.github/SECRETS.md` for details.
