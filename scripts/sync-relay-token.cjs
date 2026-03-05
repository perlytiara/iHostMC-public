/**
 * Sync the public relay token from server/relay-public-token.txt into the app.
 * Run: npm run sync-relay-token (server/relay-public-token.txt is gitignored).
 * Prefer setting VITE_RELAY_PUBLIC_TOKEN in .env or GitHub Secrets instead.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const tokenPath = path.join(root, "server", "relay-public-token.txt");
const outPath = path.join(root, "src", "lib", "relay-token.generated.ts");

if (!fs.existsSync(tokenPath)) {
  console.error("server/relay-public-token.txt not found. Create it with your token or set VITE_RELAY_PUBLIC_TOKEN in .env");
  process.exit(1);
}

const token = fs.readFileSync(tokenPath, "utf8").trim();
if (!token) {
  console.error("relay-public-token.txt is empty");
  process.exit(1);
}

const content = `/** Generated from server/relay-public-token.txt – do not commit if it contains a real token. */\nexport const RELAY_PUBLIC_TOKEN = ${JSON.stringify(token)};\n`;
fs.writeFileSync(outPath, content);
console.log("Wrote src/lib/relay-token.generated.ts");
