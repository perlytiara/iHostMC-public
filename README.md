# iHostMC — Minecraft Server Manager

Cross-platform **Minecraft server manager**: create servers (Vanilla, Paper, Purpur, Fabric, Forge, NeoForge, and more), manage mods and plugins, **share with friends without port forwarding**, and optionally sync to the cloud. Part of the [iHost](https://github.com/perlytiara/iHost) stack (backend, website, relay).

---

## What it does

- **Create servers** — Pick type and version, create, start/stop. No manual jar hunting.
- **Share with friends** — Use **Share server** → **iHost relay**. Friends get one address (e.g. `play.ihost.one:port`); no router config or port forwarding.
- **Mods & plugins** — Browse and install from in-app; sync with CurseForge where supported.
- **Cloud backup & sync** — Sign in at [ihost.one](https://ihost.one); sync server list and backups from **Settings → Backup & Sync**.
- **Updates** — In-app updater (Discord-style) when a new version is available.

---

## Quick start

```bash
git clone https://github.com/perlytiara/iHostMC.git
cd iHostMC
cp .env.public.example .env
npm install
npm run tauri dev
```

**Create one server:** Servers → **Add** → choose type (e.g. Paper) and version → Create → Start.  
**Share:** Select server → **Share server** → **Via iHost relay** → give friends the shown address.

---

## Auto-forwarding (relay) — no port forwarding

The app can expose your server to the internet **without opening ports** on your router:

1. Select the server and open **Share server**.
2. Choose **iHost relay** (or **Via iHost relay**). The app connects to the iHost relay and gets a public address.
3. Share that address (e.g. `play.ihost.one:xxxxx`) with friends; they join in Minecraft.

First time may download the tunnel tool; after that it’s quick. If players see “Invalid session,” restart the server once. The relay is part of the [iHost](https://github.com/perlytiara/iHost) server component; for self-hosting the full stack, see the main iHost repo.

---

## Build & release

- **Local build:** `npm run build:public`
- **CI (GitHub Actions):** Set **Variables** and **Secrets** so release builds work:
  ```bash
  npm run setup:gh                    # Variables (VITE_API_BASE_URL, VITE_WEBSITE_URL)
  npm run setup:gh -- --secrets       # Secrets from .env.gh-secrets (TAURI_SIGNING_*)
  ```
  Requires [gh CLI](https://cli.github.com/) and `gh auth login`. See [.github/SECRETS.md](.github/SECRETS.md) for details.

---

## Important steps for developers

1. **Env** — Copy `.env.public.example` to `.env`. For dev, defaults are fine; for production builds set `VITE_API_BASE_URL` and `VITE_WEBSITE_URL`.
2. **Backend** — Cloud sync and relay token need a running backend (e.g. api.ihost.one). Point the app at it via env.
3. **Relay** — Share server needs the iHost relay (see main [iHost](https://github.com/perlytiara/iHost) repo).
4. **Tests** — `npm run test:run`
5. **Signing** — Release builds use Tauri signing; secrets are only in CI, not in the repo.

See also `docs/` (e.g. updater, backup UX, Windows release).

---

## Contribution

Contributions are welcome: code, docs, and feedback.

- **Repo:** [GitHub — iHostMC](https://github.com/perlytiara/iHostMC)
- Open an issue or PR. For bigger changes, a short discussion in an issue first helps.
- The [iHost](https://github.com/perlytiara/iHost) website has a [Contribute](https://ihost.one/contribute) page and links here.

Collaborators and contributors are visible on GitHub (contributors list and in PR/issue history).

---

## Full stack (iHost)

This app is the desktop client. The full system includes:

- **iHost** repo: backend API, website (ihost.one), relay server, and this app as a submodule.
- Clone with submodules: `git clone --recurse-submodules https://github.com/perlytiara/iHost.git`

See the main [iHost README](https://github.com/perlytiara/iHost) for backend, website, relay, and data layout.
