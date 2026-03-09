# Public build and public repo

How to build the **public** desktop app (for end users, not internal/dev) and how to maintain a **public repo** that contains only the app code and builds against the public API.

---

## Public vs private build

- **Public build**: App points to `https://api.ihost.one` and `https://ihost.one`. No relay token is baked in; users get the relay token from the backend after sign-in. Safe to distribute.
- **Private / dev build**: May use internal API URLs, dev relay token in env or `sync-relay-token`, and other secrets. For developers close to the server only; do not distribute.

---

## Building the public app (Windows)

From the repo root:

```bash
npm run build:public
```

This:

1. Sets `VITE_API_BASE_URL=https://api.ihost.one` and `VITE_WEBSITE_URL=https://ihost.one` for the build (no `.env` override).
2. Does **not** set `VITE_RELAY_PUBLIC_TOKEN`, so the built app gets the relay token from the backend when the user is signed in.
3. Runs `npm run build` then `npm run tauri build`.

Output: `src-tauri/target/release/bundle/` (e.g. Windows NSIS installer and exe).

For CI (e.g. GitHub Actions), use **Variables** for the two URLs and do **not** set the relay token secret for public releases.

---

## Public repo (e.g. iHost / iHostMC public)

Goal: a separate **public** repo that only has the desktop app code and builds the same app that talks to `api.ihost.one` / `ihost.one`. No backend, no server config, no proprietary keys or internal URLs.

### What to include in the public repo

- **App (Tauri + frontend)**  
  - `src/` (all frontend code)  
  - `src-tauri/` (Tauri Rust + config)  
  - `index.html`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `tsconfig.node.json`  
  - `package.json`, `package-lock.json` (app deps only; no backend/website/server)  
  - `public/` if any  
  - `.env.public.example` (only public vars: `VITE_API_BASE_URL`, `VITE_WEBSITE_URL`; no `VITE_RELAY_PUBLIC_TOKEN` in the example)  
  - `scripts/tauri-wrapper.cjs`, `scripts/kill-dev-port.cjs` (needed for `npm run tauri` / dev)  
  - `scripts/sync-relay-token.cjs` can stay but doc should say it’s for private dev only; public build does not use it  
  - `src/lib/relay-token.generated.ts` with empty token (already the case)

- **Docs**  
  - README, contribution guide, and any docs that don’t reference internal infra (e.g. this file, stripped of private details).

- **Optional**  
  - `.github/workflows/build.yml` that uses **Variables** `VITE_API_BASE_URL` and `VITE_WEBSITE_URL` only (no Secrets for public release).

### What to exclude from the public repo

- **Backend / server / website / deploy**  
  - `backend/`, `server/`, `website/`, `deploy/`  
  - These contain env, secrets, Stripe, DB, relay config, etc. Keeping them private avoids exposing security and infra.

- **Private tooling and config**  
  - `tools/` (e.g. auth-setup that writes to backend `.env`)  
  - Any `.env` or files with real keys or internal URLs  
  - Internal CI workflows or deploy scripts that use secrets

- **Submodules**  
  - If they are only for internal use (e.g. baritone/altoclef for server-side use), don’t add them to the public app repo or document that they’re optional and not required for building the desktop app.

### Syncing from the private repo

Options:

1. **Manual copy**  
   - Periodically copy the app directories and files listed above from the private repo into the public repo.  
   - Commit and push. No automation; you control what goes out.

2. **Git subtree**  
   - In the public repo, add the private repo as a remote and use `git subtree pull` for a subpath that contains only the app (e.g. a branch that has only the app tree).  
   - Requires a branch or layout in the private repo that mirrors “app only.”

3. **Export script**  
   - In the private repo, a script (e.g. `scripts/export-public-app.sh`) that copies the listed paths into an export directory, then you can push that directory to the public repo.  
   - Ensures only allowed files and no accidental inclusion of backend/server/.env.

### iHostMC-public submodule (build live and push from here)

This repo (perlytiara/iHostMC) contains **iHostMC-public** as a submodule. The public app lives at `iHostMC-public/` so you can build and push it from inside Cursor without leaving the main repo.

1. **Sync main → submodule** (export app-only tree into the submodule):
   ```bash
   node scripts/sync-public-to-submodule.cjs
   ```
   This runs the export script and copies the result into `iHostMC-public/` (keeps the submodule’s `.git`).

2. **Build and push the public repo**:
   ```bash
   cd iHostMC-public
   npm ci && npm run build:public
   git add -A && git commit -m "Sync from main" && git push
   ```

3. **Update the main repo’s submodule pointer**:
   ```bash
   cd ..
   git add iHostMC-public && git commit -m "Update public app submodule" && git push
   ```

Clone/init the submodule if needed: `git submodule update --init iHostMC-public`.

### Security

- The **public repo and public build** do not contain API keys, relay tokens, or backend/server secrets.  
- The desktop app only talks to the **public** API and website (`api.ihost.one`, `ihost.one`). Auth and relay tokens are obtained at runtime after user sign-in.  
- **Backend and server** stay in the private repo so their security (auth, Stripe, DB, relay config) is not exposed or reversible from the public app codebase.

---

## Summary

- **Public Windows build**: Run `npm run build:public` (uses public URLs, no baked-in relay token).  
- **Public repo**: Include only the desktop app + public config and docs; exclude backend, server, website, deploy, and any secrets. Sync from private via copy, subtree, or export script so the published app stays free of proprietary and internal details.
