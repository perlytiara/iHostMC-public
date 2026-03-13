/**
 * Generate latest.json for Tauri updater.
 * Run from repo root after tauri build.
 * Reads .sig from nsis bundle, writes latest.json for GitHub release.
 */
const fs = require("fs");
const path = require("path");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const v = pkg.version;
const tag = process.env.GITHUB_REF?.startsWith("refs/tags/")
  ? process.env.GITHUB_REF.replace("refs/tags/", "")
  : "v" + v;

const nsisDir = path.join("src-tauri", "target", "release", "bundle", "nsis");
const sigPath = path.join(nsisDir, `iHostMC_${v}_x64-setup.exe.sig`);
const outPath = path.join(nsisDir, "latest.json");

const sig = fs.readFileSync(sigPath, "utf8").trim();
const latest = {
  version: v,
  notes: "See GitHub release for details.",
  pub_date: new Date().toISOString().slice(0, 19) + "Z",
  platforms: {
    "windows-x86_64": {
      signature: sig,
      url: `https://github.com/perlytiara/iHostMC/releases/download/${tag}/iHostMC_${v}_x64-setup.exe`,
    },
  },
};

fs.writeFileSync(outPath, JSON.stringify(latest, null, 2));
console.log("Wrote", outPath);
