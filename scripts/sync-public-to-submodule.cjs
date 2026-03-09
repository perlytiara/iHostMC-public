/**
 * Export the public app and sync into the iHostMC-public submodule.
 * Lets you build and push the public app from inside this repo.
 *
 * Usage: node scripts/sync-public-to-submodule.cjs
 *
 * 1. Runs export-public-repo.cjs (writes to export/iHostMC-public)
 * 2. Syncs that into iHostMC-public/ preserving the submodule's .git
 *
 * Then from repo root:
 *   cd iHostMC-public
 *   npm ci
 *   npm run build:public
 *   git add -A && git status
 *   git commit -m "Sync from main" && git push
 *   cd ..
 *   git add iHostMC-public && git commit -m "Update public app submodule" && git push
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXPORT_DIR = path.join(ROOT, "export", "iHostMC-public");
const SUBMODULE_DIR = path.join(ROOT, "iHostMC-public");

function runExport() {
  console.log("Running export-public-repo.cjs...\n");
  execSync("node scripts/export-public-repo.cjs", {
    cwd: ROOT,
    stdio: "inherit",
  });
}

function rmDirContent(dir, keepName) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (keepName && name === keepName) continue;
    const full = path.join(dir, name);
    fs.rmSync(full, { recursive: true, force: true });
  }
}

function copyDirSync(src, dest, filter) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (filter && !filter(srcPath, entry)) continue;
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, filter);
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function syncExportToSubmodule() {
  if (!fs.existsSync(EXPORT_DIR)) {
    console.error("Export directory not found. Run export first.");
    process.exit(1);
  }
  if (!fs.existsSync(path.join(SUBMODULE_DIR, ".git"))) {
    console.error("iHostMC-public is not a git repo (submodule). Run: git submodule update --init iHostMC-public");
    process.exit(1);
  }

  console.log("\nSyncing export into iHostMC-public (keeping .git)...");
  rmDirContent(SUBMODULE_DIR, ".git");
  copyDirSync(EXPORT_DIR, SUBMODULE_DIR);
  console.log("  Done.\n");
}

// ---------- Main ----------

console.log("=== Sync public app into iHostMC-public submodule ===\n");
runExport();
syncExportToSubmodule();
console.log("Next:");
console.log("  cd iHostMC-public");
console.log("  npm ci && npm run build:public");
console.log("  git add -A && git commit -m \"Sync from main\" && git push");
console.log("  cd .. && git add iHostMC-public && git commit -m \"Update public app submodule\" && git push");
console.log("");
