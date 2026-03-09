# iHostMC – Minecraft Server Manager

Cross-platform Minecraft server manager (Windows-first) with GUI, embedded terminal, and mod/plugin browsing. App-only (no backend required for local use).

## Stack

- **Backend**: Tauri 2 (Rust)
- **Frontend**: React 18, TypeScript, Tailwind CSS, xterm.js
- **APIs**: Mojang, Paper, Purpur, Fabric, Modrinth, Spiget

## Prerequisites

- Node.js 18+
- Rust (stable) and Cargo
- npm

## Run

```bash
git clone https://github.com/perlytiara/iHostMC.git
cd iHostMC
cp .env.public.example .env
npm install
npm run tauri dev
```

### First time (for friends / contributors)

1. Clone the repo: `git clone <repo-url> && cd iHostMC`
2. Copy public env: `cp .env.public.example .env` (or copy `.env.example`). Edit `.env` if your API/website URLs differ.
3. Run: `npm install` then `npm run tauri dev`

Public config (`VITE_API_BASE_URL`, `VITE_WEBSITE_URL`) is in `.env.public.example`; never commit `.env`. For CI, use repo **Variables** (not Secrets) for those – see [.github/SECRETS.md](.github/SECRETS.md). The desktop app works offline for local servers; sign-in, relay token, and billing use the backend (see [docs/SERVER-DEPLOY.md](docs/SERVER-DEPLOY.md)).

## Build

```bash
npm run build
npm run tauri build
```

For release builds that create updater artifacts, set `TAURI_SIGNING_PRIVATE_KEY` (path to your private key or its contents) so the built app can offer in-app updates.

Public build: `npm run build:public`

### Windows: Code-Signatur (SmartScreen)

Damit Windows die `.exe` nicht als „bösartige Binärreputation“ blockiert, solltest du sie signieren. Dafür brauchst du ein **Code-Signing-Zertifikat** (OV oder EV). Schritt-für-Schritt-Anleitung: [docs/code-signing-windows.md](docs/code-signing-windows.md).

## Phase 1 features

- Server creation wizard: Vanilla, Paper, Purpur, Fabric
- Minecraft version selection per type; memory presets and system RAM suggestion
- Optional bundled Java (Adoptium) or system Java
- Server list with start/stop; one server at a time
- Embedded terminal (live output + input)
- Browse Mods & Plugins: Modrinth (mods + plugins), Spiget (free plugins; premium = link)
- Light/dark theme toggle
- Server data under `~/.ihostmc/servers/` and `~/.ihostmc/java/` for bundled JRE

## Project layout

- `src/` — React app (features: servers, terminal, mods-plugins)
- `src-tauri/src/` — Rust (commands, server, download, process, java, api)
