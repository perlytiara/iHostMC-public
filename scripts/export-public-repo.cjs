/**
 * Export the public app repo from the private monorepo.
 *
 * Copies only the desktop-app files (src/, src-tauri/, configs, scripts)
 * into an export directory, injects public-facing README/LICENSE/etc.,
 * and patches files that reference private infra.
 *
 * Usage:  node scripts/export-public-repo.cjs [--out <dir>]
 * Default output: ./export/iHostMC-public
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUT = path.join(ROOT, "export", "iHostMC-public");

// ---------- CLI args ----------
let outDir = DEFAULT_OUT;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) {
    outDir = path.resolve(args[++i]);
  }
}

// ---------- Helpers ----------

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest, filter) {
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (filter && !filter(srcPath, entry)) continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, filter);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function writeText(dest, content) {
  mkdirp(path.dirname(dest));
  fs.writeFileSync(dest, content, "utf8");
}

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

// ---------- What to copy ----------

const COPY_DIRS = [
  "src",
  "src-tauri",
];

const COPY_ROOT_FILES = [
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "tailwind.config.js",
  "postcss.config.js",
  "tsconfig.json",
  "tsconfig.node.json",
  ".env.public.example",
];

const COPY_SCRIPTS = [
  "scripts/tauri-wrapper.cjs",
  "scripts/kill-dev-port.cjs",
  "scripts/gen-icon.cjs",
];

const SKIP_PATTERNS = [
  /[/\\]target[/\\]/,
  /[/\\]node_modules[/\\]/,
  /[/\\]\.DS_Store$/,
  /[/\\]Thumbs\.db$/,
];

function shouldCopy(fullPath, entry) {
  const rel = fullPath.replace(ROOT + path.sep, "");
  for (const pat of SKIP_PATTERNS) {
    if (pat.test(rel)) return false;
  }
  return true;
}

// ---------- File patching ----------

function patchPackageJson(content) {
  const pkg = JSON.parse(content);

  delete pkg.workspaces;

  const keepScripts = [
    "dev", "build", "preview", "tauri", "tauri:test",
    "build:public", "test", "test:run", "sync-relay-token",
  ];
  if (pkg.scripts) {
    for (const key of Object.keys(pkg.scripts)) {
      if (!keepScripts.includes(key)) delete pkg.scripts[key];
    }
  }

  return JSON.stringify(pkg, null, 2) + "\n";
}

function patchTauriConf(content) {
  const conf = JSON.parse(content);
  if (conf.plugins?.updater) {
    conf.plugins.updater.endpoints = [
      "https://github.com/iHostMC/iHostMC/releases/latest/download/latest.json",
    ];
  }
  return JSON.stringify(conf, null, 2) + "\n";
}

function patchAccountSection(content) {
  return content.replace(
    /const BILLING_SETUP_GUIDE_URL\s*=\s*"[^"]*";/,
    'const BILLING_SETUP_GUIDE_URL = "https://github.com/iHostMC/iHostMC/blob/main/docs/BILLING.md";'
  );
}

function patchApiClient(content) {
  // Source uses api.ihost.one / ihost.one; no DuckDNS. Pass-through.
  return content;
}

const FILE_PATCHES = {
  "package.json": patchPackageJson,
  [path.join("src-tauri", "tauri.conf.json")]: patchTauriConf,
  [path.join("src", "features", "settings", "components", "AccountSection.tsx")]: patchAccountSection,
  [path.join("src", "lib", "api-client.ts")]: patchApiClient,
};

// ---------- Template files ----------

const PUBLIC_GITIGNORE = `node_modules/
dist/
dist-ssr/
src-tauri/target/
.tauri/
~/.tauri/
.env
.env.local
.env.*.local
!.env.public.example
*.log
.DS_Store
Thumbs.db
*.tsbuildinfo
/test-results/
/playwright-report/
/blob-report/
.idea/
.vscode/*
!.vscode/extensions.json
.cursor/
`;

const LICENSE = `MIT License

Copyright (c) ${new Date().getFullYear()} iHostMC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const CONTRIBUTING = `# Contributing to iHostMC

Thanks for your interest in contributing!

## Getting started

1. Fork and clone the repo
2. Copy \`.env.public.example\` to \`.env\`
3. Run \`npm install\`
4. Run \`npm run tauri dev\`

## Prerequisites

- **Node.js** 18+
- **Rust** (stable) and Cargo
- **npm**

## Project structure

\`\`\`
src/            React frontend (features, components, hooks, locales)
src-tauri/      Tauri / Rust backend (server lifecycle, downloads, APIs)
scripts/        Dev helper scripts
\`\`\`

## Development workflow

- \`npm run tauri dev\` — Start the app in dev mode
- \`npm run test\` — Run unit tests (Vitest)
- \`npm run build:public\` — Production build against the public API

## Pull requests

1. Create a feature branch from \`main\`
2. Make your changes, add tests where applicable
3. Ensure the app builds: \`npm run build\`
4. Open a PR with a clear description of the change

## Code style

- TypeScript strict mode
- React functional components with hooks
- Tailwind CSS for styling
- Follow existing file and folder conventions

## Reporting issues

Open an issue on GitHub with:
- What you expected
- What happened
- Steps to reproduce
- Your OS and app version

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
`;

const README = `# iHostMC — Minecraft Server Manager

<p align="center">
  <strong>Cross-platform Minecraft server manager with GUI, embedded terminal, and mod/plugin browsing.</strong>
</p>

---

## Features

- **Server creation wizard** — Vanilla, Paper, Purpur, Fabric with version selection
- **Embedded terminal** — Live server output and command input
- **Mods & Plugins** — Browse and install from Modrinth and Spiget
- **Memory management** — Presets and system RAM detection
- **Java management** — Optional bundled Java (Adoptium) or use system Java
- **Play without port forwarding** — Built-in relay/tunnel support
- **Cloud backup & sync** — Automatic backups with iteration schedules (requires account)
- **AI advisor** — In-app Minecraft server assistant (Pro tier)
- **Light & dark theme**
- **Multi-language** — English, German, French

## Stack

| Layer | Tech |
|-------|------|
| Desktop shell | [Tauri 2](https://tauri.app/) (Rust) |
| Frontend | React 18, TypeScript, Tailwind CSS |
| Terminal | xterm.js |
| APIs | Mojang, Paper, Purpur, Fabric, Modrinth, Spiget |

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- npm

### Run

\`\`\`bash
git clone https://github.com/iHostMC/iHostMC.git
cd iHostMC
cp .env.public.example .env
npm install
npm run tauri dev
\`\`\`

### Build

\`\`\`bash
npm run build:public
\`\`\`

This builds the app against the production API (\`api.ihost.one\`). Output is in \`src-tauri/target/release/bundle/\`.

## Configuration

Copy \`.env.public.example\` to \`.env\`. The two public variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| \`VITE_API_BASE_URL\` | \`https://api.ihost.one\` | Backend API for auth, billing, sync |
| \`VITE_WEBSITE_URL\` | \`https://ihost.one\` | Website for sign-in and dashboard |

These are **not secrets** — they tell the app where to connect. The app works offline for local servers; sign-in and cloud features use the API.

## How it works

The desktop app manages Minecraft servers locally on your machine. All server files live under \`~/.ihostmc/servers/\`.

**Online features** (optional, requires a free account):

- **Relay** — Play with friends without port forwarding. The relay token is fetched after sign-in.
- **Cloud backup** — Sync server files to private cloud storage (Backup and Pro tiers).
- **AI advisor** — Ask questions about your server (Pro tier).

Payment and billing are handled through the website and Stripe. The app opens checkout in your browser; no payment details touch the desktop app.

## Project layout

\`\`\`
src/                  React app
├── features/         Feature modules (servers, terminal, mods-plugins, ai, settings, auth)
├── components/       Shared UI components
├── lib/              Utilities and API client
├── hooks/            React hooks
├── locales/          i18n translations (en, de, fr)
└── styles/           Global CSS

src-tauri/            Tauri / Rust backend
├── src/
│   ├── commands/     Tauri commands (server lifecycle, downloads, Java)
│   └── api/          External API wrappers (Mojang, Paper, Modrinth, etc.)
└── Cargo.toml

scripts/              Dev helper scripts
\`\`\`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
`;

const DOCS_BILLING = `# Billing

iHostMC uses a tiered subscription model. Billing is handled through [Stripe](https://stripe.com/) via the iHostMC website.

## Tiers

| Tier | Price | Includes |
|------|-------|----------|
| **Free** | $0/mo | Unlimited local servers, mods & plugins, relay (play without port forwarding) |
| **Backup** | $3.99/mo | Everything in Free + cloud backup & sync |
| **Pro** | $11.99/mo | Everything in Backup + AI advisor (500 credits/mo included) |

## AI Credits

AI credits can be purchased as one-time packs by any tier:

| Pack | Credits | Price |
|------|---------|-------|
| Small | 250 | $3.99 |
| Medium | 1,000 | $10 |
| Bulk | 5,000 | $50 |

Pro subscribers receive 500 free credits per month in addition to any purchased packs.

## How it works in the app

1. Open **Settings → Account**
2. Sign in (opens the website in your browser)
3. Choose a plan and subscribe (Stripe checkout opens in browser)
4. The app refreshes your subscription status automatically

All payment processing happens on the website through Stripe. No payment details are stored in or handled by the desktop app.

## Managing your subscription

Click **Manage billing** in Settings → Account to open the Stripe customer portal where you can update payment method, change plans, or cancel.
`;

const GITHUB_WORKFLOWS_BUILD = `name: Build

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    branches: [main]

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install dependencies
        run: npm ci

      - name: Build app
        env:
          VITE_API_BASE_URL: \${{ vars.VITE_API_BASE_URL || 'https://api.ihost.one' }}
          VITE_WEBSITE_URL: \${{ vars.VITE_WEBSITE_URL || 'https://ihost.one' }}
          TAURI_SIGNING_PRIVATE_KEY: \${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        run: npm run build:public

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-build
          path: |
            src-tauri/target/release/bundle/nsis/*.exe
            src-tauri/target/release/bundle/nsis/*.sig
          if-no-files-found: error
`;

// ---------- Main ----------

console.log(`Exporting public repo to: ${outDir}`);
console.log();

if (fs.existsSync(outDir)) {
  console.log("Cleaning existing export directory...");
  fs.rmSync(outDir, { recursive: true, force: true });
}
mkdirp(outDir);

// 1. Copy directories
for (const dir of COPY_DIRS) {
  const src = path.join(ROOT, dir);
  const dest = path.join(outDir, dir);
  if (!fs.existsSync(src)) {
    console.warn(`  SKIP (not found): ${dir}/`);
    continue;
  }
  console.log(`  Copying ${dir}/`);
  copyDir(src, dest, shouldCopy);
}

// 2. Copy root files
for (const file of COPY_ROOT_FILES) {
  const src = path.join(ROOT, file);
  if (!fs.existsSync(src)) {
    console.warn(`  SKIP (not found): ${file}`);
    continue;
  }
  console.log(`  Copying ${file}`);
  copyFile(src, path.join(outDir, file));
}

// 3. Copy scripts
for (const file of COPY_SCRIPTS) {
  const src = path.join(ROOT, file);
  if (!fs.existsSync(src)) {
    console.warn(`  SKIP (not found): ${file}`);
    continue;
  }
  console.log(`  Copying ${file}`);
  copyFile(src, path.join(outDir, file));
}

// 4. Apply patches to copied files
console.log();
console.log("Patching files for public repo...");
for (const [relPath, patchFn] of Object.entries(FILE_PATCHES)) {
  const dest = path.join(outDir, relPath);
  if (!fs.existsSync(dest)) {
    console.warn(`  SKIP patch (not found): ${relPath}`);
    continue;
  }
  console.log(`  Patching ${relPath}`);
  const content = readText(dest);
  writeText(dest, patchFn(content));
}

// 5. Ensure relay-token.generated.ts has empty token
const relayTokenPath = path.join(outDir, "src", "lib", "relay-token.generated.ts");
writeText(relayTokenPath, [
  '/**',
  ' * Default relay token. Leave empty for public builds.',
  ' * Users get the relay token from the backend after sign-in.',
  ' */',
  'export const RELAY_PUBLIC_TOKEN = "";',
  '',
].join('\n'));
console.log("  Reset src/lib/relay-token.generated.ts (empty token)");

// 6. Write template files
console.log();
console.log("Writing public repo template files...");

writeText(path.join(outDir, ".gitignore"), PUBLIC_GITIGNORE);
console.log("  .gitignore");

writeText(path.join(outDir, "LICENSE"), LICENSE);
console.log("  LICENSE");

writeText(path.join(outDir, "CONTRIBUTING.md"), CONTRIBUTING);
console.log("  CONTRIBUTING.md");

writeText(path.join(outDir, "README.md"), README);
console.log("  README.md");

writeText(path.join(outDir, "docs", "BILLING.md"), DOCS_BILLING);
console.log("  docs/BILLING.md");

mkdirp(path.join(outDir, ".github", "workflows"));
writeText(path.join(outDir, ".github", "workflows", "build.yml"), GITHUB_WORKFLOWS_BUILD);
console.log("  .github/workflows/build.yml");

// 7. Summary
console.log();
console.log("========================================");
console.log("  Public repo exported successfully!");
console.log(`  Location: ${outDir}`);
console.log("========================================");
console.log();
console.log("Next steps:");
console.log("  cd export/iHostMC-public");
console.log("  git init && git add -A && git commit -m 'Initial public release'");
console.log("  git remote add origin https://github.com/iHostMC/iHostMC.git");
console.log("  git push -u origin main");
