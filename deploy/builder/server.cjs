/**
 * iHostMC-builder: watches GitHub for repo updates, pulls, builds, and restarts services.
 * Run with PM2: pm2 start deploy/ecosystem.config.cjs (from repo root)
 *
 * Flow on each deploy:
 *   1. git fetch origin && git reset --hard origin/<DEPLOY_BRANCH> (clean pull, no local changes)
 *   2. npm ci + build in backend/ and website/
 *   3. pm2 restart for each PM2_APPS (relay: frps, port-api)
 *   4. systemctl restart for each SYSTEMD_SERVICES (backend, website)
 *
 * Triggers:
 *   - GitHub webhook: POST <GITHUB_WEBHOOK_PATH> (Content-Type: application/json, X-Hub-Signature-256 if secret set)
 *   - Manual: POST /deploy or GET /deploy?trigger=1 (optional ?build=1 to force rebuild; ?fresh=1 = full clean + rebuild + relay + nginx reload)
 *   - Polling: every POLL_INTERVAL_MS if set (e.g. 120000 = 2 min)
 *
 * Env: REPO_ROOT, BUILDER_PORT, DEPLOY_BRANCH, GITHUB_WEBHOOK_SECRET, GITHUB_WEBHOOK_PATH, POLL_INTERVAL_MS,
 *      PM2_APPS (comma list; leave empty if this host has no relay), SYSTEMD_SERVICES.
 */

const http = require("http");
const crypto = require("crypto");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Optional: load deploy/.env (e.g. GITHUB_WEBHOOK_SECRET, POLL_INTERVAL_MS)
const deployDir = path.resolve(__dirname, "..");
const envPath = path.join(deployDir, ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  });
}

const REPO_ROOT = process.env.REPO_ROOT || "/opt/iHostMC";
const PORT = parseInt(process.env.BUILDER_PORT || "9090", 10);
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const POLL_INTERVAL_MS = process.env.POLL_INTERVAL_MS
  ? parseInt(process.env.POLL_INTERVAL_MS, 10)
  : 0; // 0 = no polling
const PM2_APPS = (process.env.PM2_APPS != null ? process.env.PM2_APPS : "ihostmc-relay-frps,ihostmc-relay-port-api")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SYSTEMD_SERVICES = (process.env.SYSTEMD_SERVICES || "ihostmc-backend,ihostmc-website")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEPLOY_BRANCH = process.env.DEPLOY_BRANCH || "main";
// Private, unguessable path for GitHub webhook (not /webhook). Override with GITHUB_WEBHOOK_PATH if needed.
const GITHUB_WEBHOOK_PATH = (process.env.GITHUB_WEBHOOK_PATH || "/_internal/ihostmc-deploy-github-7f3a9b2e4c1d8f6").replace(/\/+$/, "") || "/_internal/ihostmc-deploy-github-7f3a9b2e4c1d8f6";
const TZ_LOG = process.env.TZ_LOG || "Europe/Paris";

let deployInProgress = false;
let lastDeployStartedAt = null;
let lastDeployFinishedAt = null;
let lastDeployResult = null;

function nowFrance() {
  return new Date().toLocaleTimeString("fr-FR", {
    timeZone: TZ_LOG,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function log(prefix, ...args) {
  const ts = nowFrance();
  const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  console.log(`[${ts}] ${prefix}:`, msg);
}

function exec(cmd, cwd = REPO_ROOT, opts = {}) {
  log("exec", cmd);
  return execSync(cmd, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...opts,
  });
}

function execMaybe(cmd, cwd = REPO_ROOT) {
  try {
    return exec(cmd, cwd);
  } catch (e) {
    log("exec-error", e.message);
    throw e;
  }
}

function execQuiet(cmd, cwd = REPO_ROOT) {
  return execSync(cmd, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

function getDeployBranch() {
  return DEPLOY_BRANCH;
}

function hasNewCommits() {
  try {
    execQuiet("git fetch origin");
    const local = execQuiet("git rev-parse " + DEPLOY_BRANCH).trim();
    const remote = execQuiet("git rev-parse origin/" + DEPLOY_BRANCH).trim();
    return local && remote && local !== remote;
  } catch {
    return false;
  }
}

function runDeploy(forceRebuild = false, freshDeploy = false) {
  if (deployInProgress) {
    log("deploy", "Already in progress, skipping.");
    return { ok: false, reason: "deploy_already_in_progress" };
  }
  deployInProgress = true;
  lastDeployStartedAt = new Date();
  log("deploy", "---------- Deploy started ----------");
  const result = { ok: true, steps: [] };
  try {
    const branch = getDeployBranch();
    log("deploy", "Branch:", branch);

    execMaybe("git checkout " + branch);
    log("deploy", "Fetching origin (git fetch)...");
    execMaybe("git fetch origin");
    const remoteRef = "origin/" + branch;
    let remote;
    try {
      remote = execMaybe("git rev-parse " + remoteRef).trim();
    } catch (e) {
      throw new Error("Remote ref " + remoteRef + " not found after fetch. Check branch name and git remote.");
    }
    const before = execMaybe("git rev-parse HEAD").trim();
    let after = before;

    const allowForceReset = process.env.BUILDER_ALLOW_RESET === "1" || process.env.BUILDER_ALLOW_RESET === "true";
    const statusPorcelain = execQuiet("git status --porcelain", REPO_ROOT).trim();
    const hasLocalChanges = statusPorcelain.length > 0;

    if (before === remote) {
      log("deploy", "Already up to date (no new commits).");
      result.steps.push({ pull: "already_latest" });
    } else if (hasLocalChanges && !allowForceReset) {
      log("deploy", "Supervision needed: uncommitted changes on server. Pull/merge manually, or set BUILDER_ALLOW_RESET=1 to force reset (discards local changes).");
      result.steps.push({ pull: "skipped_supervision_needed", reason: "local_changes" });
      result.ok = false;
      result.error = "Deploy skipped: local changes on server. Merge or reset manually.";
      log("deploy", "---------- Deploy skipped (supervision needed) ----------");
      deployInProgress = false;
      lastDeployFinishedAt = new Date();
      lastDeployResult = result;
      return result;
    } else if (allowForceReset) {
      log("deploy", "Pulling: reset --hard " + remoteRef + " (BUILDER_ALLOW_RESET=1)...");
      execMaybe("git reset --hard " + remoteRef);
      after = execMaybe("git rev-parse HEAD").trim();
      log("deploy", "Updated:", before.slice(0, 7), "->", after.slice(0, 7));
      result.steps.push({ pull: "updated_reset" });
    } else {
      try {
        execMaybe("git merge " + remoteRef + " --ff-only");
        after = execMaybe("git rev-parse HEAD").trim();
        log("deploy", "Updated (merge --ff-only):", before.slice(0, 7), "->", after.slice(0, 7));
        result.steps.push({ pull: "updated_merge" });
      } catch (mergeErr) {
        log("deploy", "Supervision needed: branch diverged from origin (merge --ff-only failed). Merge or reset manually, or set BUILDER_ALLOW_RESET=1 to force reset.");
        result.steps.push({ pull: "skipped_supervision_needed", reason: "diverged" });
        result.ok = false;
        result.error = "Deploy skipped: branch diverged. Merge or reset manually.";
        log("deploy", "---------- Deploy skipped (supervision needed) ----------");
        deployInProgress = false;
        lastDeployFinishedAt = new Date();
        lastDeployResult = result;
        return result;
      }
    }

    if (before === after && !process.env.BUILDER_FORCE_REBUILD && !forceRebuild) {
      log("deploy", "No new commits, skipping build (use ?build=1 or ?fresh=1 to force rebuild).");
    } else {
      log("deploy", "Building backend...");
      execMaybe("npm ci", path.join(REPO_ROOT, "backend"));
      execMaybe("npm run build", path.join(REPO_ROOT, "backend"));
      log("deploy", "Running db:migrate...");
      execMaybe("npm run db:migrate", path.join(REPO_ROOT, "backend"));
      result.steps.push({ backend_build: "ok" });

      log("deploy", "Building website...");
      const websiteDir = path.join(REPO_ROOT, "website");
      const nextDir = path.join(websiteDir, ".next");
      const nodeModulesDir = path.join(websiteDir, "node_modules");
      const doCleanWebsite = freshDeploy || fs.existsSync(nextDir);
      if (doCleanWebsite && fs.existsSync(nextDir)) {
        log("deploy", "Removing website/.next for clean build (avoids ChunkLoadError after deploy)");
        fs.rmSync(nextDir, { recursive: true });
      }
      if ((freshDeploy || fs.existsSync(nextDir)) && fs.existsSync(nodeModulesDir)) {
        log("deploy", "Removing website/node_modules for clean npm ci");
        fs.rmSync(nodeModulesDir, { recursive: true });
      }
      execMaybe("npm ci", websiteDir);
      execMaybe("npm run build", websiteDir);
      result.steps.push({ website_build: "ok" });
    }

    for (const app of PM2_APPS) {
      try {
        execMaybe(`pm2 restart ${app}`);
        log("deploy", "PM2 restarted:", app);
        result.steps.push({ pm2: app });
      } catch (e) {
        log("deploy", "PM2 restart failed for", app, e.message);
        result.steps.push({ pm2: app, error: e.message });
      }
    }

    if (SYSTEMD_SERVICES.length > 0) {
      try {
        execMaybe("sudo systemctl daemon-reload");
      } catch (e) {
        log("deploy", "systemctl daemon-reload warning:", e.message);
      }
    }
    for (const svc of SYSTEMD_SERVICES) {
      try {
        execMaybe("sudo systemctl restart " + svc);
        log("deploy", "Systemd restarted:", svc);
        result.steps.push({ systemd: svc });
      } catch (e) {
        log("deploy", "Systemd restart failed for", svc, e.message);
        result.steps.push({ systemd: svc, error: e.message });
      }
    }

    // Restart relay (frps + port-api) so server/.env (e.g. FRP_ALLOWED_HOST=play.ihost.one) is picked up
    const serverDir = path.join(REPO_ROOT, "server");
    if (fs.existsSync(path.join(serverDir, "ecosystem.config.cjs"))) {
      try {
        execMaybe("pm2 restart ihostmc-relay-frps ihostmc-relay-port-api", serverDir);
        log("deploy", "Relay PM2 restarted (frps, port-api)");
        result.steps.push({ relay_pm2: "ok" });
      } catch (e) {
        log("deploy", "Relay PM2 restart skipped or failed (not critical):", e.message);
        result.steps.push({ relay_pm2: "skipped", message: e.message });
      }
    }

    if (freshDeploy) {
      try {
        execMaybe("sudo nginx -t");
        execMaybe("sudo systemctl reload nginx");
        log("deploy", "Nginx reloaded");
        result.steps.push({ nginx_reload: "ok" });
      } catch (e) {
        log("deploy", "Nginx reload skipped or failed:", e.message);
        result.steps.push({ nginx_reload: "skipped", message: e.message });
      }
    }

    log("deploy", "---------- Deploy finished ----------");
  } catch (e) {
    result.ok = false;
    result.error = e.message;
    log("deploy", "Deploy failed:", e.message);
  } finally {
    deployInProgress = false;
    lastDeployFinishedAt = new Date();
    lastDeployResult = result;
  }
  return result;
}

function verifySignature(body, signature) {
  if (!GITHUB_WEBHOOK_SECRET) return true;
  if (!signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

const server = http.createServer((req, res) => {
  const statusPath = req.url?.split("?")[0];
  if (req.method === "GET" && (statusPath === "/" || statusPath === "/health" || statusPath === "/status")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        service: "iHostMC-builder",
        uptime: process.uptime(),
        deployInProgress,
        lastDeployStartedAt: lastDeployStartedAt ? lastDeployStartedAt.toISOString() : null,
        lastDeployFinishedAt: lastDeployFinishedAt ? lastDeployFinishedAt.toISOString() : null,
        lastDeployResult: lastDeployResult
          ? { ok: lastDeployResult.ok, error: lastDeployResult.error || null, steps: lastDeployResult.steps }
          : null,
      })
    );
    return;
  }

  const webhookPath = req.url?.split("?")[0];
  if (req.method === "POST" && webhookPath === GITHUB_WEBHOOK_PATH) {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const sig = req.headers["x-hub-signature-256"] || "";
      if (!verifySignature(body, sig)) {
        log("webhook", "Invalid or missing signature");
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("Unauthorized");
        return;
      }
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad JSON");
        return;
      }
      if (payload.ref && payload.ref.startsWith("refs/heads/")) {
        const branch = payload.ref.replace("refs/heads/", "");
        if (branch === getDeployBranch()) {
          log("webhook", "Push to", branch, "- running deploy");
          const result = runDeploy();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } else {
          log("webhook", "Push to", branch, "(deploy branch is", getDeployBranch() + ") - ignored");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, skipped: "different_branch" }));
        }
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, skipped: "not_push" }));
      }
    });
    return;
  }

  const deployPath = req.url?.split("?")[0];
  const isDeploy = deployPath === "/deploy";
  const forceRebuild = req.url && /[?&]build=1|[?&]force=1|[?&]fresh=1/.test(req.url);
  const freshDeploy = req.url && /[?&]fresh=1/.test(req.url);
  const trigger = req.url && /[?&]trigger=1/.test(req.url);
  if (isDeploy && (req.method === "POST" || (req.method === "GET" && trigger))) {
    if (freshDeploy) log("deploy", "Fresh deploy requested (clean + rebuild + relay + nginx)");
    else if (forceRebuild) log("deploy", "Force rebuild requested");
    const result = runDeploy(forceRebuild, freshDeploy);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  log("builder", "iHostMC-builder listening on port", PORT);
  log("builder", "Repo:", REPO_ROOT, "| Deploy branch:", getDeployBranch());
  log("builder", "PM2 apps:", PM2_APPS.join(", ") || "(none)");
  log("builder", "Systemd:", SYSTEMD_SERVICES.join(", ") || "(none)");
  if (GITHUB_WEBHOOK_SECRET) log("builder", "Webhook secret: set");
  else log("builder", "Webhook secret: not set (webhook will accept any request)");
  log("builder", "Webhook path:", GITHUB_WEBHOOK_PATH);
  if (POLL_INTERVAL_MS > 0) {
    log("builder", "Polling", getDeployBranch(), "every", POLL_INTERVAL_MS, "ms (quiet until new commits)");
    setInterval(() => {
      if (deployInProgress) return;
      try {
        if (hasNewCommits()) {
          log("poll", "New commits on", getDeployBranch(), "- starting deploy");
          runDeploy();
        }
      } catch (e) {
        log("poll", "Error:", e.message);
      }
    }, POLL_INTERVAL_MS);
  }
});
