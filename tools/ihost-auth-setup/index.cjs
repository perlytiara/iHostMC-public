#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const PROGRESS_FILE = path.join(__dirname, ".auth-setup-progress.json");
const ENV_APPEND_FILE = path.join(__dirname, ".env.append");
const REPO_ROOT = path.resolve(__dirname, "../..");
const BACKEND_ENV = path.join(REPO_ROOT, "backend", ".env");

const PROVIDERS = [
  {
    id: "google",
    name: "Google",
    createUrl: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "Go to APIs & Services → Credentials → Create Credentials → OAuth client ID.",
      "Application type: Web application. Add this Authorized redirect URI:",
    ],
    envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  {
    id: "github",
    name: "GitHub",
    createUrl: "https://github.com/settings/applications/new",
    steps: [
      "Create a new OAuth App. Set the Authorization callback URL to:",
    ],
    envKeys: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  },
  {
    id: "discord",
    name: "Discord",
    createUrl: "https://discord.com/developers/applications",
    steps: [
      "Create an application (or pick existing). Open OAuth2 → Redirects → Add Redirect. Use:",
    ],
    envKeys: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
  },
  {
    id: "microsoft",
    name: "Microsoft",
    createUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    steps: [
      "New registration → Authentication → Add a platform → Web. Add this Redirect URI:",
      "API permissions: add OpenID, profile, email. Tenant 'common' = personal + work accounts.",
    ],
    envKeys: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID"],
  },
];

const CALLBACK_PATHS = {
  google: "/api/auth/google/callback",
  github: "/api/auth/github/callback",
  discord: "/api/auth/discord/callback",
  microsoft: "/api/auth/microsoft/callback",
};

function ask(rl, question, defaultVal = "") {
  const prompt = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim() || defaultVal));
  });
}

function loadProgress() {
  try {
    const raw = fs.readFileSync(PROGRESS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { backendUrl: "", providers: {} };
  }
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function buildEnvBlock(backendUrl, providers) {
  const lines = [
    "# OAuth – added by tools/ihost-auth-setup",
    `BACKEND_PUBLIC_URL=${backendUrl}`,
    "",
  ];
  for (const p of PROVIDERS) {
    const data = providers[p.id];
    if (!data) continue;
    for (const key of p.envKeys) {
      const val = data[key] || (key === "MICROSOFT_TENANT_ID" ? "common" : "");
      if (val) lines.push(`${key}=${val}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function getDoneCount(progress) {
  return PROVIDERS.filter((p) => progress.providers[p.id] && progress.providers[p.id][p.envKeys[0]]).length;
}

async function doOneProvider(rl, progress, base, p) {
  const callbackUrl = base + CALLBACK_PATHS[p.id];
  console.log("\n┌─────────────────────────────────────────────────────────");
  console.log("│ " + p.name.toUpperCase());
  console.log("└─────────────────────────────────────────────────────────\n");

  console.log("  STEP 1 — Open this page in your browser:");
  console.log("  " + p.createUrl);
  console.log("");
  await ask(rl, "  Press Enter when the page is open");

  console.log("");
  for (let i = 0; i < p.steps.length; i++) {
    console.log("  STEP " + (i + 2) + " — " + p.steps[i]);
    console.log("  " + callbackUrl);
    console.log("");
  }
  await ask(rl, "  Press Enter when you've set that callback URL and have the app created");

  const data = progress.providers[p.id] || {};
  if (p.envKeys.includes("GOOGLE_CLIENT_ID")) {
    data.GOOGLE_CLIENT_ID = await ask(rl, "  Paste Client ID from the OAuth client", data.GOOGLE_CLIENT_ID);
    data.GOOGLE_CLIENT_SECRET = await ask(rl, "  Paste Client Secret", data.GOOGLE_CLIENT_SECRET);
  } else if (p.envKeys.includes("GITHUB_CLIENT_ID")) {
    data.GITHUB_CLIENT_ID = await ask(rl, "  Paste Client ID from the OAuth App", data.GITHUB_CLIENT_ID);
    data.GITHUB_CLIENT_SECRET = await ask(rl, "  Paste Client Secret (generate one if needed)", data.GITHUB_CLIENT_SECRET);
  } else if (p.envKeys.includes("DISCORD_CLIENT_ID")) {
    data.DISCORD_CLIENT_ID = await ask(rl, "  Paste Application ID (OAuth2 → General)", data.DISCORD_CLIENT_ID);
    data.DISCORD_CLIENT_SECRET = await ask(rl, "  Paste Client Secret (Reset Secret if needed)", data.DISCORD_CLIENT_SECRET);
  } else if (p.envKeys.includes("MICROSOFT_CLIENT_ID")) {
    data.MICROSOFT_CLIENT_ID = await ask(rl, "  Paste Application (client) ID", data.MICROSOFT_CLIENT_ID);
    data.MICROSOFT_CLIENT_SECRET = await ask(rl, "  Paste Client secret value (Certificates & secrets)", data.MICROSOFT_CLIENT_SECRET);
    data.MICROSOFT_TENANT_ID = await ask(rl, "  Tenant (use 'common' for personal + work)", data.MICROSOFT_TENANT_ID || "common");
  }
  progress.providers[p.id] = data;
  saveProgress(progress);
  console.log("\n  ✓ " + p.name + " saved. You can run this again later to add more.\n");
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let progress = loadProgress();
  const backendUrl = progress.backendUrl || "https://api.ihost.one";

  console.log("\n  ╭─────────────────────────────────────────────────────────╮");
  console.log("  │  ihost auth-setup — one account for your org             │");
  console.log("  ╰─────────────────────────────────────────────────────────╯\n");
  console.log("  We'll set up sign-in step by step. Each provider (Google, GitHub,");
  console.log("  Discord, Microsoft) is one app you create on their site so your");
  console.log("  org has a dedicated login. Do one at a time; progress is saved.\n");

  const url = await ask(rl, "Backend URL for callbacks", backendUrl);
  const base = url.replace(/\/$/, "");
  progress.backendUrl = base;
  saveProgress(progress);

  const doneCount = getDoneCount(progress);
  const doneNames = PROVIDERS.filter((p) => progress.providers[p.id] && progress.providers[p.id][p.envKeys[0]]).map((p) => p.name);
  const remaining = PROVIDERS.filter((p) => !progress.providers[p.id] || !progress.providers[p.id][p.envKeys[0]]);

  console.log("\n  Progress: " + doneCount + "/" + PROVIDERS.length + " done");
  if (doneNames.length) console.log("  Done: " + doneNames.join(", "));
  if (remaining.length) console.log("  Left: " + remaining.map((p) => p.name).join(", "));
  console.log("");

  if (remaining.length === 0) {
    console.log("  All providers are configured. Writing .env block and exiting.\n");
    const envBlock = buildEnvBlock(progress.backendUrl, progress.providers);
    fs.writeFileSync(ENV_APPEND_FILE, envBlock, "utf8");
    console.log(envBlock);
    const append = await ask(rl, "Append this to backend/.env now? (y/n)", "y");
    if (append.toLowerCase() === "y" || append.toLowerCase() === "yes") {
      const backendEnv = fs.existsSync(BACKEND_ENV) ? fs.readFileSync(BACKEND_ENV, "utf8") : "";
      const marker = "# OAuth – added by tools/ihost-auth-setup";
      const idx = backendEnv.indexOf(marker);
      const withoutAuth = (idx >= 0 ? backendEnv.slice(0, idx).replace(/\n+$/, "") : backendEnv.trimEnd());
      fs.writeFileSync(BACKEND_ENV, withoutAuth + "\n\n" + envBlock + "\n", "utf8");
      console.log("\n  ✓ Written to backend/.env. Restart backend: sudo systemctl restart ihostmc-backend\n");
    }
    rl.close();
    return;
  }

  for (const p of remaining) {
    const alreadyHas = progress.providers[p.id] && progress.providers[p.id][p.envKeys[0]];
    const skip = await ask(rl, "Set up " + p.name + " now? (y/n/skip)", alreadyHas ? "y" : "n");
    if (skip.toLowerCase() === "n" || skip.toLowerCase() === "skip") {
      console.log("  Skipped. Run 'npm run auth-setup' again when ready.\n");
      continue;
    }
    await doOneProvider(rl, progress, base, p);
  }

  const envBlock = buildEnvBlock(progress.backendUrl, progress.providers);
  fs.writeFileSync(ENV_APPEND_FILE, envBlock, "utf8");
  console.log("  --- Summary ---");
  console.log("  Progress saved. Env block written to tools/ihost-auth-setup/.env.append\n");
  console.log(envBlock);
  const append = await ask(rl, "\nAppend the above to backend/.env now? (y/n)", "y");
  if (append.toLowerCase() === "y" || append.toLowerCase() === "yes") {
    const backendEnv = fs.existsSync(BACKEND_ENV) ? fs.readFileSync(BACKEND_ENV, "utf8") : "";
    const marker = "# OAuth – added by tools/ihost-auth-setup";
    const idx = backendEnv.indexOf(marker);
    const withoutAuth = (idx >= 0 ? backendEnv.slice(0, idx).replace(/\n+$/, "") : backendEnv.trimEnd());
    fs.writeFileSync(BACKEND_ENV, withoutAuth + "\n\n" + envBlock + "\n", "utf8");
    console.log("\n  ✓ Written to backend/.env. Restart backend: sudo systemctl restart ihostmc-backend\n");
  } else {
    console.log("\n  Copy the block above into backend/.env and restart the backend.\n");
  }
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
