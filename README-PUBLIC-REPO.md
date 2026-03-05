# iHostMC – public app repo

This is the **desktop app only** (public repo). No backend, no website, no server.

## Link as submodule (private repo)

In your private repo (iHost):

```bash
git submodule add https://github.com/perlytiara/iHostMC.git iHostMC-public
```

Then to refresh the app code from the private repo:

```bash
./scripts/build-public-repo.sh
cd iHostMC-public && git add -A && git status && git commit -m "Sync app from private" && git push
```

Or run `./scripts/sync-public-repo.sh ./iHostMC-public --push` (with iHostMC-public as the submodule path).

## In this repo (contributors)

`npm install`, `cp .env.public.example .env`, then `npm run tauri dev`. Set `VITE_PUBLIC_REPO=true` when building for release so the Dev menu is hidden.

## What’s included

- `src/`, `src-tauri/`, root config, scripts. No backend, website, server, deploy.
