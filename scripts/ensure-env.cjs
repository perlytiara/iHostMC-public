/**
 * Ensures .env exists by copying .env.public.example when .env is missing.
 * Run before dev/build/test so getApiBaseUrl and other VITE_* consumers work.
 * Safe to run multiple times; only copies when .env does not exist.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.public.example");

if (fs.existsSync(envPath)) {
  process.exit(0);
}
if (!fs.existsSync(examplePath)) {
  console.warn("ensure-env: .env.public.example not found, skipping");
  process.exit(0);
}

fs.copyFileSync(examplePath, envPath);
console.log("ensure-env: created .env from .env.public.example");
