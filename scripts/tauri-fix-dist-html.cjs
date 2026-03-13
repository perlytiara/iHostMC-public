/**
 * After Vite build, rewrite dist/index.html so asset paths are relative.
 * Tauri on Windows can fail to load assets when index.html uses absolute paths like /assets/.
 * Run after: vite build
 */
const fs = require("fs");
const path = require("path");

const distIndex = path.resolve(__dirname, "..", "dist", "index.html");
if (!fs.existsSync(distIndex)) {
  console.warn("tauri-fix-dist-html: dist/index.html not found, skipping");
  process.exit(0);
}

let html = fs.readFileSync(distIndex, "utf8");
// Absolute paths break in Tauri's asset protocol on Windows
html = html.replace(/(\s(src|href)=")\/(assets\/[^"]+")/g, "$1./$3");
html = html.replace(/(\s(src|href)=")\/(favicon[^"]*")/g, "$1./$3");
fs.writeFileSync(distIndex, html);
console.log("tauri-fix-dist-html: rewrote dist/index.html to use relative asset paths");
