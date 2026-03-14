# Release workflow & Windows

## Is the release workflow updated?

Yes. The **Build release** workflow (`.github/workflows/build-release.yml`) already:

- Builds on **Windows** (`windows-latest`) and **Linux** (ubuntu-22.04) in parallel
- Runs on **tag push** (`v*`) or **manual** (workflow_dispatch)
- Verifies the Tauri signing key on Windows before building
- Produces **Windows**: NSIS `.exe`, MSI `.msi`, and `latest.json` for the in-app updater
- Produces **Linux**: deb, rpm, AppImage/tarball
- Creates a **GitHub Release** and uploads all artifacts

No change needed for Windows — it’s already in the matrix.

---

## Prompt for Windows (sync & release)

Run these on a **Windows** machine (PowerShell or Command Prompt) to sync the repo and trigger a release. CI will build Windows + Linux and publish the release.

### 1. Sync the repo and install

```powershell
cd C:\path\to\your\workspace
git clone https://github.com/perlytiara/iHostMC.git
cd iHostMC
git pull origin main
cp .env.public.example .env
npm install
```

(If you already have the repo: `cd iHostMC`, `git pull origin main`, `npm install`.)

### 2. Bump version and sync version fields

```powershell
# Edit package.json: set "version" to e.g. "0.1.2"
npm run sync-version
```

### 3. Commit, tag, and push (this triggers the release workflow)

```powershell
git add -A
git commit -m "Release 0.1.2"
git tag v0.1.2
git push origin main
git push origin v0.1.2
```

After the tag push, GitHub Actions runs the **Build release** workflow: builds Windows and Linux, then creates the release and attaches the installers. Windows installers will appear on the [Releases](https://github.com/perlytiara/iHostMC/releases) page.

### 4. (Optional) Build Windows installer locally

Only if you need a local Windows build (e.g. to test the NSIS/MSI without CI). You must have **Node**, **Rust**, and **Visual Studio Build Tools** (or equivalent) installed. Signing is optional for local testing.

```powershell
cd iHostMC
npm run ensure-env
npm run sync-version
npm run build:public
```

Artifacts:

- `src-tauri\target\release\bundle\nsis\iHostMC-setup.exe`
- `src-tauri\target\release\bundle\msi\*.msi`

For **signed** local builds (e.g. to test the updater), set env vars (not in repo):

- `TAURI_SIGNING_PRIVATE_KEY` — contents or path of your private key
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — key password if set

Then run `npm run build:public` as above.

---

## Summary

- **Release workflow:** Already runs on Windows + Linux; no update required.
- **To ship a release from Windows:** Sync repo → bump version → `npm run sync-version` → commit → tag `vX.Y.Z` → push tag. CI does the rest.
- **To build only on Windows locally:** `npm run build:public` (optionally with signing env vars).
