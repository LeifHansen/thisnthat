// Generates local SVG placeholder images for the seed listings so the
// marketplace looks complete offline (before real R2 images exist).
// Run: node scripts/gen-placeholders.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "seed");
mkdirSync(outDir, { recursive: true });

// name -> [label, accent hue]
const items = {
  denim1: ["Denim", 215], denim2: ["Denim", 215],
  bandtee1: ["Band Tee", 280], bandtee2: ["Band Tee", 280],
  coat1: ["Wool Coat", 30],
  jordan1: ["Sneaker", 0], jordan2: ["Sneaker", 0], jordan3: ["Sneaker", 0],
  samba1: ["Sneaker", 150],
  belt1: ["Leather", 25],
  ball1: ["Memorabilia", 120], ball2: ["Memorabilia", 120],
  card1: ["Trading Card", 45],
  vinyl1: ["Vinyl", 260], vinyl2: ["Vinyl", 260],
  comic1: ["Comic", 200],
};

function svg(label, hue) {
  const c1 = `hsl(${hue} 70% 55%)`;
  const c2 = `hsl(${(hue + 40) % 360} 65% 40%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="400" cy="330" r="140" fill="rgba(255,255,255,0.18)"/>
  <text x="400" y="420" font-family="system-ui, sans-serif" font-size="56" font-weight="700"
        fill="rgba(255,255,255,0.95)" text-anchor="middle">${label}</text>
</svg>`;
}

let count = 0;
for (const [name, [label, hue]] of Object.entries(items)) {
  writeFileSync(join(outDir, `${name}.svg`), svg(label, hue));
  count++;
}
console.log(`Wrote ${count} placeholder SVGs to public/seed/`);
