/**
 * Generate TradiesMate favicon, PWA icons, and Open Graph image from the orange TM brand mark.
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
const INK = "#1a120e";
const CREAM = "#fff7f2";

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

function ogSvg() {
  const w = 1200;
  const h = 630;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff3eb"/>
      <stop offset="55%" stop-color="${CREAM}"/>
      <stop offset="100%" stop-color="#ffe4d4"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="1080" cy="-40" r="280" fill="${ACCENT}" opacity="0.12"/>
  <circle cx="-60" cy="700" r="320" fill="${ACCENT}" opacity="0.08"/>
  <rect x="88" y="210" width="140" height="140" rx="32" fill="${ACCENT}"/>
  <text
    x="158"
    y="305"
    text-anchor="middle"
    font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-weight="800"
    font-size="72"
    fill="#ffffff"
  >TM</text>
  <text
    x="260"
    y="268"
    font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-weight="800"
    font-size="64"
    fill="${INK}"
  >TradiesMate</text>
  <text
    x="260"
    y="330"
    font-family="Arial, Helvetica, sans-serif"
    font-weight="600"
    font-size="34"
    fill="${INK}"
    opacity="0.78"
  >Turn missed calls into quoted jobs</text>
  <text
    x="88"
    y="460"
    font-family="Arial, Helvetica, sans-serif"
    font-weight="500"
    font-size="28"
    fill="${INK}"
    opacity="0.7"
  >Dedicated UK number · SMS rescue · Quotes · Pay Now · Diary · Certs</text>
  <text
    x="88"
    y="520"
    font-family="Arial, Helvetica, sans-serif"
    font-weight="700"
    font-size="24"
    fill="${ACCENT}"
  >tradiesmate.co.uk</text>
</svg>`;
}

function writePngFromSvg(svg, outPath, width) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: true },
  });
  fs.writeFileSync(outPath, resvg.render().asPng());
}

function writePng(size, outPath) {
  writePngFromSvg(brandSvg(size), outPath, size);
}

fs.writeFileSync(path.join(publicDir, "favicon.svg"), brandSvg(512));
writePng(180, path.join(iconsDir, "apple-touch-icon.png"));
writePng(192, path.join(iconsDir, "icon-192.png"));
writePng(512, path.join(iconsDir, "icon-512.png"));
writePng(512, path.join(iconsDir, "icon-512-maskable.png"));
writePngFromSvg(ogSvg(), path.join(publicDir, "og-image.png"), 1200);

console.log("Wrote favicon.svg, icons (180/192/512), and og-image.png (1200×630)");
