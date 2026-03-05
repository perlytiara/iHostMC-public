/**
 * Kills processes on the Vite dev server port (1420) so a fresh
 * "npm run tauri dev" doesn't conflict with old instances.
 * Time-limited so dev starts quickly on slow machines.
 */
const kill = require("kill-port");

const VITE_PORT = 1420;
const TIMEOUT_MS = 2500;

async function run() {
  try {
    await Promise.race([
      kill(VITE_PORT),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    console.log(`Cleaned up port ${VITE_PORT} (old Vite/Tauri dev).`);
  } catch (_) {
    // Port already free, no process to kill, or timeout
  }
}

run();
