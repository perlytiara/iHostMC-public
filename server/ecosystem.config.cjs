/**
 * PM2 ecosystem for iHostMC public relay (play.ihost.one).
 * Start: cd server && pm2 start ecosystem.config.cjs
 * Save: pm2 save && pm2 startup (for reboot)
 *
 * Ports: 7000 = frps (FRP server), 8081 = port-api (assign/release for Share server).
 * App uses play.ihost.one:7000 and https://play.ihost.one (nginx → 8081).
 */
const path = require("path");
const fs = require("fs");

const SERVER_DIR = path.resolve(__dirname);
const tokenPath = path.join(SERVER_DIR, "relay-public-token.txt");
let token = "";
try {
  token = fs.readFileSync(tokenPath, "utf8").trim();
} catch (e) {
  console.warn("relay-public-token.txt not found; set FRP_API_TOKEN in .env or create file");
}

const portApiScript = path.join(SERVER_DIR, "port-api");
const portApiPython = path.join(SERVER_DIR, "port_api.py");
const usePythonPortApi = !fs.existsSync(portApiScript) && fs.existsSync(portApiPython);

module.exports = {
  apps: [
    {
      name: "ihostmc-relay-frps",
      script: path.join(SERVER_DIR, "frps", "frps"),
      args: `-c ${path.join(SERVER_DIR, "frps", "frps.toml")}`,
      cwd: SERVER_DIR,
      interpreter: "none",
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "ihostmc-relay-port-api",
      script: usePythonPortApi ? "python3" : portApiScript,
      args: usePythonPortApi ? [portApiPython] : undefined,
      cwd: SERVER_DIR,
      interpreter: "none",
      autorestart: true,
      max_restarts: 10,
      env: {
        FRP_API_TOKEN: token,
        FRP_ALLOWED_HOST: "play.ihost.one",
        FRP_API_ADDR: ":8081",
        FRP_PORT_MIN: "20000",
        FRP_PORT_MAX: "60000",
      },
    },
  ],
};
