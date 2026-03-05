/**
 * Wrapper for "npm run tauri ...". When the first argument is "dev",
 * kills processes on the dev port (1420) before starting so old
 * Vite/Tauri instances don't conflict.
 */
const { execSync, spawnSync } = require("child_process");
const path = require("path");

const args = process.argv.slice(2);
const isDev = args[0] === "dev";

if (isDev) {
  try {
    execSync("node scripts/kill-dev-port.cjs", {
      stdio: "pipe",
      cwd: path.resolve(__dirname, ".."),
    });
  } catch (e) {
    // Port may already be free
  }
}

const result = spawnSync("npx", ["tauri", ...args], {
  stdio: "inherit",
  shell: true,
  cwd: path.resolve(__dirname, ".."),
});
process.exit(result.status ?? 1);
