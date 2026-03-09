# Building iHostMC on Windows

Use these steps to build the desktop app on Windows. **You need a new build** if you get "assign-port failed (404 Not Found)" when using **Share server** – that fix is only in builds made after the relay proxy was added.

## Prerequisites

1. **Node.js 18+**  
   - Download: https://nodejs.org/ (LTS)  
   - Install, then open a new terminal and run: `node -v` (e.g. `v20.x`).

2. **Rust**  
   - Download: https://rustup.rs/  
   - Run the installer, then open a **new** terminal and run: `rustc --version`.

3. **Git**  
   - Download: https://git-scm.com/download/win  
   - Install (defaults are fine).

4. **Visual Studio Build Tools** (needed for Rust on Windows)  
   - Install "Desktop development with C++": https://visualstudio.microsoft.com/visual-cpp-build-tools/  
   - Or if you have full Visual Studio, ensure the "Desktop development with C++" workload is installed.

## Build steps

1. **Clone the repo** (if you don’t have it yet):
   ```bash
   git clone https://github.com/perlytiara/iHostMC.git
   cd iHostMC
   ```

2. **Pull latest** (so you have the Share server fix):
   ```bash
   git pull origin main
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Build the app**:
   ```bash
   npm run build
   npm run tauri build
   ```

5. **Find the installer / exe**:
   - **NSIS installer:** `src-tauri\target\release\bundle\nsis\iHostMC_1.0.0_x64-setup.exe`  
   - **Portable exe:** `src-tauri\target\release\iHostMC.exe`  

You can share the **setup exe** or the **iHostMC.exe** with your friend.

## Optional: use production API/website URLs

To point the build at the live API and website:

```bash
npm run build:public
```

Then the output is again under `src-tauri\target\release\bundle\nsis\` and `src-tauri\target\release\`.

## If Windows blocks the app (SmartScreen)

- **Build folder:** Add an exclusion in Windows Security for your project folder (e.g. the folder containing `iHostMC`).  
- **Share server / frpc:** Add an exclusion for: `%LOCALAPPDATA%\ihostmc` (e.g. `C:\Users\<YourName>\AppData\Local\ihostmc`).  

See [code-signing-windows.md](code-signing-windows.md) for code signing so the app is trusted long term.

## Quick reference

| Step        | Command              |
|------------|----------------------|
| Install deps | `npm install`     |
| Build app    | `npm run build && npm run tauri build` |
| Run in dev   | `npm run tauri dev` |
