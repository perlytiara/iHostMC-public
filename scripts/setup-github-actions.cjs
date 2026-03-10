#!/usr/bin/env node
/**
 * Set up GitHub Actions Variables and (optionally) Secrets for this repo.
 * Requires: gh CLI installed and authenticated (gh auth login).
 *
 * Usage:
 *   node scripts/setup-github-actions.cjs           # set Variables only
 *   node scripts/setup-github-actions.cjs --secrets # also set Secrets from .env.gh-secrets
 *
 * Variables (set automatically): VITE_API_BASE_URL, VITE_WEBSITE_URL
 * Secrets (set from .env.gh-secrets): TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const VARIABLES = {
  VITE_API_BASE_URL: "https://api.ihost.one",
  VITE_WEBSITE_URL: "https://ihost.one",
};

const SECRET_NAMES = ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"];
const SECRETS_EXAMPLE = `# GitHub Actions Secrets – fill and run: gh secret set -f .env.gh-secrets
# Then delete this file. Never commit it.

TAURI_SIGNING_PRIVATE_KEY=
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
`;

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: "pipe", ...opts });
    return true;
  } catch {
    return false;
  }
}

function ensureGh() {
  if (!run("gh --version")) {
    console.error("Error: GitHub CLI (gh) is required. Install: https://cli.github.com/");
    console.error("  Then run: gh auth login");
    process.exit(1);
  }
}

function setSecretsFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    const examplePath = path.join(ROOT, ".env.gh-secrets.example");
    if (!fs.existsSync(examplePath)) {
      fs.writeFileSync(examplePath, SECRETS_EXAMPLE, "utf8");
      console.log("Created .env.gh-secrets.example – copy to .env.gh-secrets, fill values, then:");
      console.log("  gh secret set -f .env.gh-secrets");
      console.log("  rm .env.gh-secrets");
    } else {
      console.log("Copy .env.gh-secrets.example to .env.gh-secrets, fill the values, then run:");
      console.log("  node scripts/setup-github-actions.cjs --secrets");
    }
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const hasValues = SECRET_NAMES.some((n) => {
    const m = content.match(new RegExp(`^${n}=(.+)$`, "m"));
    return m && m[1]?.trim();
  });
  if (!hasValues) {
    console.log(".env.gh-secrets exists but has no values. Fill TAURI_SIGNING_* and run again.");
    return;
  }
  const repoFlag = repo ? ` -R ${repo}` : "";
  if (run("gh secret set -f " + filePath + repoFlag, { stdio: "inherit" })) {
    console.log("  ✓ Secrets set from .env.gh-secrets");
    console.log("  Remember to delete .env.gh-secrets after (it contains secrets)");
  } else {
    console.error("  ✗ Failed to set secrets");
  }
}

// Main
const withSecrets = process.argv.includes("--secrets");
const repo = process.argv.find((a) => a.startsWith("--repo="))?.slice(7);

ensureGh();
const repoFlag = repo ? ` -R ${repo}` : "";
console.log("Setting GitHub Actions Variables...");
let ok = true;
for (const [name, value] of Object.entries(VARIABLES)) {
  const cmd = `gh variable set ${name} --body "${value.replace(/"/g, '\\"')}"${repoFlag}`;
  if (run(cmd, { stdio: "inherit" })) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    ok = false;
  }
}

if (withSecrets) {
  console.log("");
  const secretsPath = path.join(ROOT, ".env.gh-secrets");
  setSecretsFromFile(secretsPath);
} else {
  console.log("");
  console.log("Variables set. For Tauri updater signing, add Secrets:");
  console.log("  1. Copy .env.gh-secrets.example to .env.gh-secrets");
  console.log("  2. Fill TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD");
  console.log("  3. Run: node scripts/setup-github-actions.cjs --secrets");
  console.log("  4. Delete .env.gh-secrets");
}

process.exit(ok ? 0 : 1);
