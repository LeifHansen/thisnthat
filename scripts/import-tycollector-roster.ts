/**
 * Import the full Ty Beanie Baby roster from tycollector.com into the
 * EXPANDED ROSTER section of src/lib/beanie-database.ts.
 * - Fetches https://tycollector.com/beanies/beanie-roster.htm (or reads a
 *   local HTML file passed as argv[2]).
 * - Facts only: name, animal, style number. No values/years are invented.
 * - Skips anything already in the curated catalogue (matched by normalized
 *   name, including each part of compound names like "Brownie / Cubbie").
 * - Rewrites only the marked EXPANDED ROSTER section, so curated entries and
 *   the rest of the file stay verbatim. Rerunnable.
 * Run: npx tsx scripts/import-tycollector-roster.ts [path/to/roster.html]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { ORIGINAL_BEANIES, type BeanieCategory } from "../src/lib/beanie-database";

const ROSTER_URL = "https://tycollector.com/beanies/beanie-roster.htm";
const DB_PATH = new URL("../src/lib/beanie-database.ts", import.meta.url).pathname;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function unescapeEntities(s: string): string {
  return s
    .replace(/&hearts;|&#9829;|&#x2665;/gi, "♥")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

// ── animal → category mapping (same approach as merge-beanies.ts) ──────
const AQUATIC = new Set(["fish","whale","dolphin","lobster","seal","octopus","crab","manatee","walrus","penguin","seahorse","jellyfish","stingray","orca","shark","otter","seaturtle","turtle","starfish","clownfish","goldfish","pufferfish","angelfish","squid","hippocampus","platypus","hermitcrab","seaotter","sealion","narwhal","stringray"]);
const BIRDS = new Set(["bird","duck","owl","chick","rooster","flamingo","peacock","swan","toucan","eagle","hen","pelican","parrot","cardinal","bluejay","loon","ostrich","puffin","dove","crow","goose","stork","turkey","robin","hummingbird","woodpecker","bluebird","canary","chicken","cockatoo","duckling","falcon","hawk","kingfisher","kiwi","macaw","mallard","oriole","parakeet","pheasant","quail","raven","roadrunner","seagull","vulture","budgie","chickadee"]);
const DINO = new Set(["dinosaur","trex","tyrannosaurus","brontosaurus","stegosaurus","pterodactyl","raptor","brachiosaurus","triceratops","apatosaurus"]);
const INSECT = new Set(["bee","butterfly","spider","ladybug","scorpion","firefly","inchworm","ant","caterpillar","dragonfly","beetle","grasshopper","bumblebee","cricket","mosquito","snail","worm","centipede"]);
const MYTHICAL = new Set(["dragon","unicorn","pegasus","griffin","phoenix","mermaid","yeti","bigfoot","lochnessmonster","alien","monster","gargoyle"]);
const RODENT = new Set(["mouse","rat","squirrel","beaver","chipmunk","hamster","hedgehog","mole","porcupine","gerbil","groundhog","guineapig","prairiedog","gopher"]);
const NONANIMAL = new Set(["pumpkin","snowman","ghost","tree","santa","snowwoman","elf","gingerbreadman","gingerbread","heart","flower","shamrock","leprechaun","witch","angel","cupid","scarecrow","jackolantern","candycane","present","ornament","snowflake","clown","gnome"]);
const REPTILE = new Set(["frog","snake","lizard","iguana","chameleon","gecko","salamander","newt","toad","crocodile","alligator","tortoise","cobra","rattlesnake","dinosaurhatchling","tadpole","chameloen"]);
const LICENSED = new Set(["sponge","superhero","boy","girl","character","minion","troll"]);

function categoryFor(animalRaw: string): BeanieCategory {
  const a = norm(animalRaw);
  if (!a) return "Animals";
  if (LICENSED.has(a)) return "Licensed";
  if (a === "bear" || a.includes("bear") || a === "panda") return "Bears";
  if (DINO.has(a)) return "Dinosaurs";
  if (MYTHICAL.has(a)) return "Mythical";
  if (REPTILE.has(a)) return "Reptile";
  if (AQUATIC.has(a)) return "Aquatic";
  if (BIRDS.has(a)) return "Birds";
  if (INSECT.has(a)) return "Insect";
  if (RODENT.has(a)) return "Rodent";
  if (NONANIMAL.has(a)) return "Non-Animal";
  return "Animals";
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

type RosterRow = { name: string; animal: string; styleNumber?: string };

// One-off rows the generic " - " splitter can't handle.
const SPECIAL: Record<string, RosterRow> = {
  "Billionaire bear": { name: "Billionaire", animal: "bear" },
};

function parseRow(text: string): RosterRow | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (SPECIAL[t]) return SPECIAL[t];

  const parts = t.split(" - ").map((p) => p.trim());
  let name: string;
  let animal = "";
  let style = "";

  if (parts.length === 1) {
    name = parts[0];
  } else {
    const last = parts[parts.length - 1];
    const hasDigits = /\d/.test(last) || /^(no style number|none)$/i.test(last);
    if (hasDigits && parts.length >= 3) {
      style = last;
      animal = parts[parts.length - 2];
      name = parts.slice(0, -2).join(" - ");
    } else if (hasDigits) {
      style = last;
      name = parts.slice(0, -1).join(" - ");
    } else {
      animal = last;
      name = parts.slice(0, -1).join(" - ");
    }
  }

  // Style cell sometimes carries a stray animal ("dog 36657") or a
  // qualifier ("(retail) 40318", "(Ty store version) 44077").
  let styleNumber: string | undefined = style;
  const animalInStyle = style.match(/^([a-z][a-z ]*[a-z])\s+(\d{4,6})$/i);
  const qualInStyle = style.match(/^\(([^)]+)\)\s*(.+)$/);
  if (animalInStyle) {
    if (!animal) animal = animalInStyle[1];
    styleNumber = animalInStyle[2];
  } else if (qualInStyle) {
    // Keep the qualifier on the name so retail vs Ty-store rows stay distinct.
    name = `${name} (${qualInStyle[1].replace(/\s*version$/i, "")})`;
    styleNumber = qualInStyle[2].trim();
  }
  if (!styleNumber || /^(no style number|none)$/i.test(styleNumber)) {
    styleNumber = undefined;
  }

  return { name, animal, styleNumber };
}

async function loadHtml(): Promise<string> {
  const localPath = process.argv[2];
  if (localPath) return readFileSync(localPath, "utf-8");
  const res = await fetch(ROSTER_URL, {
    headers: { "user-agent": "Mozilla/5.0 (BeanieXchange catalogue import)" },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return await res.text();
}

async function main() {
  const html = await loadHtml();
  const matches = [...html.matchAll(/<p class="roster"><a href="[^"]*">([\s\S]*?)<\/a><\/p>/g)];
  if (matches.length < 1000) {
    throw new Error(`Only ${matches.length} roster rows found — page layout may have changed; aborting.`);
  }

  // Names already covered by the curated catalogue (incl. compound-name parts).
  const curated = new Set<string>();
  for (const b of ORIGINAL_BEANIES) {
    curated.add(norm(b.name));
    for (const part of b.name.split("/")) curated.add(norm(part));
  }

  const seen = new Set<string>();
  const rows: RosterRow[] = [];
  let skippedCurated = 0;
  let skippedDupe = 0;

  for (const m of matches) {
    const text = unescapeEntities(m[1].replace(/<[^>]+>/g, " "));
    const row = parseRow(text);
    if (!row || !row.name) continue;
    if (curated.has(norm(row.name))) { skippedCurated++; continue; }
    const key = `${norm(row.name)}::${row.styleNumber ?? ""}`;
    if (seen.has(key)) { skippedDupe++; continue; }
    seen.add(key);
    rows.push(row);
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const lines = rows.map((r) => {
    const animal = r.animal ? titleCase(r.animal) : "Unknown";
    const fields = [
      `name: ${JSON.stringify(r.name)}`,
      `animal: ${JSON.stringify(animal)}`,
      `category: ${JSON.stringify(categoryFor(r.animal))}`,
      `year: null`,
      ...(r.styleNumber ? [`styleNumber: ${JSON.stringify(r.styleNumber)}`] : []),
      `collection: "expanded"`,
    ];
    return `  { ${fields.join(", ")} },`;
  });

  const START = "// ── EXPANDED ROSTER START — generated by scripts/import-tycollector-roster.ts ──";
  const END = "// ── EXPANDED ROSTER END ──";
  const src = readFileSync(DB_PATH, "utf-8");
  const startIdx = src.indexOf(START);
  const endIdx = src.indexOf(END);
  if (startIdx === -1 || endIdx === -1) throw new Error("EXPANDED ROSTER markers not found in beanie-database.ts");

  const section = `${START}
// Full Ty Beanie Baby roster sourced from tycollector.com/beanies/beanie-roster.htm.
// Facts only (name, animal, style number); entries already present in the
// curated catalogue above are skipped. Do not edit by hand — rerun the script.
export const EXPANDED_BEANIES: BeanieEntry[] = [
${lines.join("\n")}
];
`;
  writeFileSync(DB_PATH, src.slice(0, startIdx) + section + src.slice(endIdx));

  console.log(`Roster rows parsed: ${matches.length}`);
  console.log(`Written to EXPANDED_BEANIES: ${rows.length}`);
  console.log(`Skipped (already in curated catalogue): ${skippedCurated}`);
  console.log(`Skipped (duplicate name+style in roster): ${skippedDupe}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
