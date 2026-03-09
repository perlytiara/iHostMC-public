# Build iHostMC on Windows (exe + installer)

Use this when you want to produce the Windows app (`.exe` and setup installer) from the repo in **Windows Cursor** or any Windows terminal.

**In Cursor:** When asking the AI to build the app on Windows, you can say: *"Build the app on Windows — follow docs/BUILD-WINDOWS.md"* or @-mention `docs/BUILD-WINDOWS.md`.

## Prerequisites (install once)

1. **Node.js 18+** – [nodejs.org](https://nodejs.org/)
2. **Rust** – [rustup.rs](https://rustup.rs/) → run `rustup default stable`
3. **Tauri / Windows deps** – [Tauri Windows install](https://v2.tauri.app/start/install/windows/):
   - Visual Studio 2022 Build Tools (or VS 2022) with **“Desktop development with C++”**
   - **WebView2** (usually already on Windows 11)

## Repo path

Clone or open the repo, e.g.:

- `C:\Users\user\Documents\Git Projects\iHostMC`

All commands below are run from that **repo root**.

## Full commands (copy-paste)

### 1. Open repo in terminal

```powershell
cd "C:\Users\user\Documents\Git Projects\iHostMC"
```

(Use your actual path if different.)

### 2. Optional: clean and reinstall

```powershell
Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force src-tauri\target -ErrorAction SilentlyContinue
npm install
```

### 3. Build frontend

```powershell
npm run build
```

Creates the `dist\` folder (HTML, JS, CSS).

### 4. Build app (exe + installer)

```powershell
npm run tauri build
```

This runs the frontend build again (if configured) then compiles the Rust app.

## Output locations (after `npm run tauri build`)

| What | Path (from repo root) |
|------|------------------------|
| **Executable** | `src-tauri\target\release\ihostmc.exe` |
| **NSIS installer** | `src-tauri\target\release\bundle\nsis\` (e.g. `iHostMC_1.0.0_x64-setup.exe`) |
| **MSI** (if enabled) | `src-tauri\target\release\bundle\msi\` |
| **Frontend assets** | `dist\` |

## If build fails

- **`npm run build` fails** – Run `npm install` and try again. If TypeScript errors appear, the project is set up to build with `vite build` only; run `npm run typecheck` separately to see type errors.
- **`npm run tauri build` fails** – Check Rust: `rustc --version`. Ensure Visual Studio Build Tools and WebView2 are installed (see Tauri Windows install link above).
- **CI / `--ci` error** – Run without CI: `$env:CI=''; npm run tauri build` (PowerShell) or in CMD: `set CI=` then `npm run tauri build`.

## Quick one-shot (clean + build)

From repo root in PowerShell:

```powershell
cd "C:\Users\user\Documents\Git Projects\iHostMC"
Remove-Item -Recurse -Force node_modules, dist, src-tauri\target -ErrorAction SilentlyContinue
npm install
npm run build
npm run tauri build
```

Then open:

- `src-tauri\target\release\ihostmc.exe` to run the app, or  
- `src-tauri\target\release\bundle\nsis\` to get the installer.
