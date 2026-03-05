/**
 * Writes a minimal valid 32x32 icon.ico for Tauri Windows build.
 * ICO format: header (6) + directory entry (16) + BMP image data.
 */
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "src-tauri", "icons");
const outPath = path.join(outDir, "icon.ico");

// Minimal 32x32 32bpp ICO: header + one entry + BMP (info header + pixels + mask)
const header = Buffer.from([
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, // type=1, count=1
]);
const entry = Buffer.alloc(16);
entry[0] = 32; // width
entry[1] = 32; // height
entry[2] = 0; // colors
entry[3] = 0;
entry[4] = 1; entry[5] = 0; // planes
entry[6] = 32; entry[7] = 0; // 32 bpp
// size of image data (40 + 32*32*4 + mask)
const bmpSize = 40 + 32 * 32 * 4 + Math.ceil((32 * 32) / 8);
entry.writeUInt32LE(bmpSize, 8);
entry.writeUInt32LE(22, 12); // offset

// BITMAPINFOHEADER (40 bytes)
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40, 0);   // header size
dib.writeInt32LE(32, 4);    // width
dib.writeInt32LE(64, 8);    // height (32*2 for XOR + AND)
dib.writeUInt16LE(1, 12);   // planes
dib.writeUInt16LE(32, 14); // bit count

// 32x32 32bpp pixels (bottom-up, BGRA) - simple gray
const rowBytes = 32 * 4;
const xorSize = 32 * rowBytes;
const xorMask = Buffer.alloc(xorSize);
for (let i = 0; i < xorSize; i += 4) {
  xorMask[i] = 0x60;     // B
  xorMask[i + 1] = 0x60; // G
  xorMask[i + 2] = 0x60; // R
  xorMask[i + 3] = 0xff; // A
}
// AND mask (1 bit per pixel, 32 rows of 4 bytes)
const andSize = 32 * 4;
const andMask = Buffer.alloc(andSize);

fs.mkdirSync(outDir, { recursive: true });
const out = Buffer.concat([header, entry, dib, xorMask, andMask]);
fs.writeFileSync(outPath, out);
console.log("Written:", outPath);
