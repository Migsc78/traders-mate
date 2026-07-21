/**
 * Generate TradiesMate favicon + PWA icons from the orange TM brand mark.
 * Run: npm run icons
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const iconsDir = path.join(publicDir, "icons");
fs.mkdirSync(iconsDir, { recursive: true });

const ACCENT = "#ff5a1f";

function brandSvg(size) {
  const rx = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.41);
  const y = Math.round(size * 0.63);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${ACCENT}"/>
  <text
    x="${size / 2}"
    y="${y}"
    text-anchor="middle"
    font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-weight="800"
    font-size="${fontSize}"
    fill="#ffffff"
  >TM</text>
</svg>`;
}

function writePng(size, outPath) {
  const resvg = new Resvg(brandSvg(size), {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(outPath, png);
}

fs.writeFileSync(path.join(publicDir, "favicon.svg"), brandSvg(512));
writePng(180, path.join(iconsDir, "apple-touch-icon.png"));
writePng(192, path.join(iconsDir, "icon-192.png"));
writePng(512, path.join(iconsDir, "icon-512.png"));
writePng(512, path.join(iconsDir, "icon-512-maskable.png"));

console.log("Wrote favicon.svg + icons (180/192/512) in orange TM brand mark");
