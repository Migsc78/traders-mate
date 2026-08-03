/**
 * One-shot: install Demo Plumbing logo into the current DB (no full reseed).
 *   node scripts/install-demo-logo.mjs
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (same idea as seed/loadEnv) — avoids a dotenv dependency.
try {
  const raw = await readFile(path.join(root, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] ?? "";
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  /* no .env */
}

const prisma = new PrismaClient();

const src = path.join(root, "prisma/seed/assets/demo-plumbing-logo.png");
const uploads = path.join(root, "uploads");
await mkdir(uploads, { recursive: true });
const filename = "seed-demo-plumbing-logo.png";
await copyFile(src, path.join(uploads, filename));

const base = (process.env.PUBLIC_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const url = `${base}/uploads/${filename}`;

const demo = await prisma.client.findFirst({ where: { routeKey: "seed_tm_demo_plumbing" } });
if (!demo) {
  console.error("Demo client not found (routeKey seed_tm_demo_plumbing)");
  process.exit(1);
}

await prisma.clientAsset.updateMany({
  where: { clientId: demo.id, kind: "LOGO" },
  data: { kind: "SHOWCASE" },
});
await prisma.clientAsset.create({
  data: {
    clientId: demo.id,
    kind: "LOGO",
    url,
    filename,
    caption: "Demo Plumbing logo",
    sort: 0,
  },
});

console.log(`Logo installed for ${demo.businessName}`);
console.log(url);
await prisma.$disconnect();
