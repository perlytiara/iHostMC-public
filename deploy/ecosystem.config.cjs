/**
 * PM2 ecosystem for iHostMC-builder (auto-deploy on GitHub push or poll).
 *
 * What it does: Listens on BUILDER_PORT (9090). On webhook or manual trigger or poll,
 * runs: git fetch + merge (pull), build backend + website, restart PM2 relay apps
 * and systemd backend/website.
 *
 * Start:  cd /opt/iHostMC && pm2 start deploy/ecosystem.config.cjs && pm2 save
 * Logs:   pm2 logs iHostMC-builder
 * Sync:   curl -X POST http://localhost:9090/deploy  or  curl "http://localhost:9090/deploy?trigger=1"
 *
 * Env (override in deploy/.env or here):
 *   PM2_APPS         - Comma-separated PM2 process names to restart (relay). Empty = skip.
 *   SYSTEMD_SERVICES - Comma-separated systemd units (backend, website).
 *   DEPLOY_BRANCH    - Branch to pull and deploy (default main).
 *   POLL_INTERVAL_MS - Poll GitHub every N ms (120000 = 2 min). 0 = no polling.
 */
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const home = process.env.HOME || "/root";
const pathEnv = process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

module.exports = {
  apps: [
    {
      name: "iHostMC-builder",
      script: path.join(__dirname, "builder", "server.cjs"),
      cwd: repoRoot,
      interpreter: "node",
      autorestart: true,
      max_restarts: 10,
      env: {
        HOME: home,
        PATH: pathEnv,
        TZ: "Europe/Paris",
        TZ_LOG: "Europe/Paris",
        REPO_ROOT: repoRoot,
        BUILDER_PORT: "9090",
        PM2_APPS: "",
        SYSTEMD_SERVICES: "ihostmc-backend,ihostmc-website",
        DEPLOY_BRANCH: "main",
        POLL_INTERVAL_MS: "120000",
      },
      env_production: {
        NODE_ENV: "production",
      },
      log_date_format: "HH:mm:ss",
      merge_logs: true,
      max_stdout_log_size: "5M",
      max_stderr_log_size: "5M",
    },
  ],
};
