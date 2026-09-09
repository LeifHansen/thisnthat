/**
 * Per-beanie illustrations. Each known Beanie gets its own
 * colour + accent (rose on Princess, peace sign + tie-dye on Peace,
 * stars-and-stripes on Glory, gold text on The End, antlers on
 * Chocolate, etc.); unknown names fall back to a generic plush.
 *
 * Style: cream "product-shot" background, single coloured silhouette
 * with chunky dark-brown outline. Original artwork — no Ty
 * trademarks (no heart tag, no "ty" wordmark).
 */

const INK = "#30210f";
const BG = "#fbf4e3"; // cream — matches our --bx-surface
const SNOUT = "#f3e2c2";

type ShapeProps = { color: string; accent?: string };

export function BeanieIllustration({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const v = pickVariant(name);
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label={`${name} illustration`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="200" height="200" fill={BG} />
      {v.render()}
    </svg>
  );
}

type Variant = { render: () => React.ReactNode };

function pickVariant(name: string): Variant {
  // Specific named beanies first (richer detail).
  switch (name) {
    case "Princess":
      return { render: () => <PrincessBear /> };
    case "Peace":
      return { render: () => <PeaceBear /> };
    case "Glory":
      return { render: () => <GloryBear /> };
    case "The End":
      return { render: () => <TheEndBear /> };
    case "Blackie":
      return { render: () => <BlackieBear /> };
    case "Snort":
      return { render: () => <SnortBull /> };
    case "Pinchers":
      return { render: () => <PinchersLobster /> };
    case "Hissy":
      return { render: () => <HissySnake /> };
    case "Tank":
      return { render: () => <TankArmadillo /> };
    case "Patti":
      return { render: () => <PattiPlatypus /> };
    case "Chocolate":
      return { render: () => <ChocolateMoose /> };
    case "Peanut":
      return { render: () => <PeanutElephant color="#2451a6" /> };
    case "Chip":
      return { render: () => <ChipCat /> };
    case "Tuffy":
      return { render: () => <TuffyDog /> };
    case "Legs":
      return { render: () => <LegsFrog /> };
  }
  // Generic by animal class with canonical Beanie colour.
  const generic = GENERIC[name];
  if (generic) return { render: generic };
  return { render: () => <GenericPlush /> };
}

const GENERIC: Record<string, () => React.ReactNode> = {
  Maple: () => <Bear color="#cf2c30" accent="leaf" />,
  Britannia: () => <Bear color="#7d4e2a" accent="jack" />,
  Erin: () => <Bear color="#2f8f4f" accent="shamrock" />,
  Curly: () => <Bear color="#a36737" />,
  Garcia: () => <Bear color="#e88f25" accent="tiedye" />,
  Valentino: () => <Bear color="#f0e8d2" accent="heart" />,
  "Holiday Teddy": () => <Bear color="#8a2a2a" accent="bow" />,
  Cubbie: () => <Bear color="#a36737" />,
  Spot: () => <Dog color="#f3e2c2" spot />,
  Snip: () => <Cat color="#e8c79a" />,
  Iggy: () => <Lizard color="#7da64a" />,
  Rainbow: () => <Lizard color="#46a85a" />,
  Stripes: () => <Lizard color="#e88f25" stripes />,
  Flash: () => <Fish color="#88b3d5" />,
  Splash: () => <Fish color="#2c2c2c" />,
  Inky: () => <Fish color="#dd6cae" />,
  Claude: () => <Fish color="#46a85a" />,
  Quackers: () => <Fish color="#f3c12f" />,
  Squealer: () => <Pig color="#f0b1c1" />,
  Hippity: () => <GenericPlush color="#a8d5b1" />,
  Speedy: () => <GenericPlush color="#5fa84a" />,
  Spinner: () => <GenericPlush color="#2a2a2a" />,
  Bongo: () => <GenericPlush color="#a36737" />,

  // Expanded-catalog mappings — themed base shapes by animal class.
  "Teddy (new face, brown)": () => <Bear color="#a36737" />,
  Fortune: () => <Bear color="#efe9df" />,
  Sammy: () => <Bear color="#6db1d6" accent="tiedye" />,
  Wallace: () => <Bear color="#2f7d4a" />,
  Osito: () => <Bear color="#7d4e2a" />,
  Germania: () => <Bear color="#7d4e2a" />,
  Sakura: () => <Bear color="#d98aa6" />,
  "The Beginning": () => <Bear color="#9fb0d8" />,
  "Signature Bear": () => <Bear color="#8a6a4a" />,
  Almond: () => <Bear color="#caa06a" />,
  Cashew: () => <Bear color="#d8b483" />,
  Ariel: () => <Bear color="#b08152" />,
  Valentina: () => <Bear color="#cf2c30" accent="heart" />,
  "1998 Holiday Teddy": () => <Bear color="#8a2a2a" accent="bow" />,
  "1999 Holiday Teddy": () => <Bear color="#8a2a2a" accent="bow" />,
  "2000 Holiday Teddy": () => <Bear color="#8a2a2a" accent="bow" />,

  Flip: () => <Cat color="#f0ece3" />,
  Pounce: () => <Cat color="#c8975a" />,
  Prance: () => <Cat color="#9aa0a6" />,
  Scat: () => <Cat color="#d9c3a0" />,
  Amber: () => <Cat color="#e0a045" />,
  Silver: () => <Cat color="#9aa0a6" />,
  Velvet: () => <Cat color="#2a2a2a" />,

  Bones: () => <Dog color="#d9b98a" />,
  Bernie: () => <Dog color="#b5723a" />,
  Doby: () => <Dog color="#2a2a2a" />,
  Dotty: () => <Dog color="#f0ece3" spot />,
  Sparky: () => <Dog color="#f0ece3" spot />,
  Bruno: () => <Dog color="#8a5a32" />,
  Fetch: () => <Dog color="#e0a045" />,
  Gigi: () => <Dog color="#2a2a2a" />,
  Pugsly: () => <Dog color="#d9b98a" />,
  Rover: () => <Dog color="#b5572c" />,
  Scottie: () => <Dog color="#2a2a2a" />,
  Spunky: () => <Dog color="#c8763a" />,
  Tracker: () => <Dog color="#d9b98a" spot />,
  Weenie: () => <Dog color="#b5572c" />,

  Coral: () => <Fish color="#ef8a3c" />,
  Lips: () => <Fish color="#cf2c30" />,
  Neon: () => <Fish color="#f2c33a" />,
  Goochy: () => <Fish color="#ef6fa8" />,
  Manny: () => <Fish color="#9aa6b0" />,
  Seamore: () => <Fish color="#eceae3" />,
  Slippery: () => <Fish color="#cdd2d6" />,
  Wiggly: () => <Fish color="#ef6fa8" />,

  Pinky: () => <GenericPlush color="#ef9bbf" />,
  Stretch: () => <GenericPlush color="#d9c39a" />,
  Scoop: () => <GenericPlush color="#c9a14a" />,
  Jabber: () => <GenericPlush color="#3b8ed0" />,
  Baldy: () => <GenericPlush color="#6b4a2f" />,
  Mac: () => <GenericPlush color="#cf2c30" />,
  Wise: () => <GenericPlush color="#6b4a2f" />,
  Wiser: () => <GenericPlush color="#6b4a2f" />,
  Eggbert: () => <GenericPlush color="#f3c12f" />,
  Stinger: () => <GenericPlush color="#2a2a2a" />,
  Glow: () => <GenericPlush color="#f3d24a" />,
  "Pumkin'": () => <GenericPlush color="#ef8a2c" />,
  Snowball: () => <GenericPlush color="#f4f1ea" />,
  Spooky: () => <GenericPlush color="#f4f1ea" />,
  Roary: () => <GenericPlush color="#c8902f" />,
  Bushy: () => <GenericPlush color="#b97f2a" />,
  Freckles: () => <GenericPlush color="#e0b15a" />,
  Sneaky: () => <GenericPlush color="#e0b15a" />,
  Blizzard: () => <GenericPlush color="#e8eef2" />,
  Canyon: () => <GenericPlush color="#b97f4a" />,
  Congo: () => <GenericPlush color="#2a2a2a" />,
  Schweetheart: () => <GenericPlush color="#b5723a" />,
  Cheeks: () => <GenericPlush color="#b08152" />,
  Mooch: () => <GenericPlush color="#8a5a32" />,
  Mel: () => <GenericPlush color="#9aa6ad" />,
  Eucalyptus: () => <GenericPlush color="#9aa6ad" />,
  Pouch: () => <GenericPlush color="#c8902f" />,
  Roam: () => <GenericPlush color="#6b4a2f" />,
  Niles: () => <GenericPlush color="#d8b483" />,
  Slowpoke: () => <GenericPlush color="#8a7a5a" />,
  Goatee: () => <GenericPlush color="#e8e2d2" />,
  Prickles: () => <GenericPlush color="#8a6a3a" />,
  Ants: () => <GenericPlush color="#7a5a3a" />,
  Stinky: () => <GenericPlush color="#2a2a2a" />,
  Ringo: () => <GenericPlush color="#8a8f95" />,
  Sly: () => <GenericPlush color="#c8763a" />,
  Trumpet: () => <GenericPlush color="#9aa6b0" />,
  Ziggy: () => <GenericPlush color="#efece6" />,
  Whisper: () => <GenericPlush color="#c8902f" />,
  Spike: () => <GenericPlush color="#b0b6bb" />,
  Daisy: () => <GenericPlush color="#f0ece3" />,
  Bessie: () => <GenericPlush color="#8a5a32" />,
  Tabasco: () => <GenericPlush color="#cf2c30" />,
  Derby: () => <GenericPlush color="#b5723a" />,
  Chops: () => <GenericPlush color="#efe9df" />,
  Fleece: () => <GenericPlush color="#efe9df" />,
  Ewey: () => <GenericPlush color="#efe9df" />,
  Ears: () => <GenericPlush color="#d9b98a" />,
  Hippie: () => <GenericPlush color="#c47fd0" />,
  Nibbler: () => <GenericPlush color="#d9b98a" />,
  Nibbly: () => <GenericPlush color="#ef9bbf" />,
  Springy: () => <GenericPlush color="#c9b6e0" />,
  Grace: () => <GenericPlush color="#eceae3" />,
  Nuts: () => <GenericPlush color="#b5723a" />,
  Radar: () => <GenericPlush color="#2a2a2a" />,
  Batty: () => <GenericPlush color="#7a5a8a" />,
  Waddle: () => <GenericPlush color="#2a2a2a" />,
  Tusk: () => <GenericPlush color="#b5723a" />,
  Jolly: () => <GenericPlush color="#8a5a32" />,
  Paul: () => <GenericPlush color="#6b6f73" />,
  Swoop: () => <GenericPlush color="#7a5a3a" />,
};

// ─── Base shapes ───────────────────────────────────────────────

function Bear({ color, accent }: ShapeProps & { accent?: string }) {
  return (
    <g>
      <circle cx="55" cy="55" r="22" fill={color} stroke={INK} strokeWidth="6" />
      <circle cx="145" cy="55" r="22" fill={color} stroke={INK} strokeWidth="6" />
      <circle cx="55" cy="55" r="10" fill={SNOUT} />
      <circle cx="145" cy="55" r="10" fill={SNOUT} />
      <circle cx="100" cy="115" r="62" fill={color} stroke={INK} strokeWidth="6" />
      <ellipse cx="80" cy="100" rx="6" ry="8" fill={INK} />
      <ellipse cx="120" cy="100" rx="6" ry="8" fill={INK} />
      <ellipse cx="100" cy="138" rx="26" ry="20" fill={SNOUT} stroke={INK} strokeWidth="5" />
      <ellipse cx="100" cy="128" rx="7" ry="5" fill={INK} />
      <path d="M100 134 v6 M88 144 q12 10 24 0" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      {accent === "leaf" && <MapleLeaf />}
      {accent === "jack" && <UnionJack />}
      {accent === "shamrock" && <Shamrock />}
      {accent === "heart" && <ChestHeart />}
      {accent === "bow" && <Bow />}
      {accent === "tiedye" && <TieDyeOverlay />}
    </g>
  );
}

function PrincessBear() {
  return (
    <g>
      <Bear color="#5d3284" />
      {/* white rose on chest */}
      <g transform="translate(100,162)">
        <circle r="6" fill="#ffffff" stroke={INK} strokeWidth="2" />
        <circle r="3" fill="#e9e0c8" />
        <path d="M-2 6 q-2 8 4 12 M2 6 q2 8 -4 12" fill="none" stroke="#2f8f4f" strokeWidth="2" strokeLinecap="round" />
      </g>
      {/* purple bow ribbon */}
      <path d="M68 76 L62 92 L78 86 Z" fill="#3f1d5c" stroke={INK} strokeWidth="2" />
      <path d="M82 78 L74 92 L88 88 Z" fill="#3f1d5c" stroke={INK} strokeWidth="2" />
    </g>
  );
}

function PeaceBear() {
  // Rainbow-striped tie-dye body + peace sign on chest.
  return (
    <g>
      <defs>
        <clipPath id="peaceHead">
          <circle cx="100" cy="115" r="62" />
        </clipPath>
        <clipPath id="peaceEarL"><circle cx="55" cy="55" r="22" /></clipPath>
        <clipPath id="peaceEarR"><circle cx="145" cy="55" r="22" /></clipPath>
      </defs>
      <g clipPath="url(#peaceEarL)">
        <RainbowStripes x={33} y={33} w={44} h={44} />
      </g>
      <g clipPath="url(#peaceEarR)">
        <RainbowStripes x={123} y={33} w={44} h={44} />
      </g>
      <circle cx="55" cy="55" r="22" fill="none" stroke={INK} strokeWidth="6" />
      <circle cx="145" cy="55" r="22" fill="none" stroke={INK} strokeWidth="6" />
      <g clipPath="url(#peaceHead)">
        <RainbowStripes x={38} y={53} w={124} h={124} />
      </g>
      <circle cx="100" cy="115" r="62" fill="none" stroke={INK} strokeWidth="6" />
      <ellipse cx="80" cy="100" rx="6" ry="8" fill={INK} />
      <ellipse cx="120" cy="100" rx="6" ry="8" fill={INK} />
      <ellipse cx="100" cy="138" rx="26" ry="20" fill={SNOUT} stroke={INK} strokeWidth="5" />
      <ellipse cx="100" cy="128" rx="7" ry="5" fill={INK} />
      <path d="M100 134 v6 M88 144 q12 10 24 0" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      {/* peace sign on chest area (slightly below face) */}
      <g transform="translate(100,168)">
        <circle r="14" fill="#ffffff" stroke={INK} strokeWidth="3" />
        <line x1="0" y1="-14" x2="0" y2="14" stroke={INK} strokeWidth="3" />
        <line x1="0" y1="0" x2="-10" y2="10" stroke={INK} strokeWidth="3" />
        <line x1="0" y1="0" x2="10" y2="10" stroke={INK} strokeWidth="3" />
      </g>
    </g>
  );
}

function RainbowStripes({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const colors = ["#e8413a", "#ef8a2c", "#f3c12f", "#46a85a", "#3b8ed0", "#8a4fb0"];
  return (
    <>
      {colors.map((c, i) => (
        <rect key={c} x={x} y={y + (h * i) / colors.length} width={w} height={h / colors.length + 0.5} fill={c} />
      ))}
    </>
  );
}

function GloryBear() {
  return (
    <g>
      <Bear color="#f5e8d1" />
      {/* belly stars-and-stripes */}
      <g transform="translate(100,162)">
        <rect x="-22" y="-2" width="44" height="22" fill="#cf2c30" stroke={INK} strokeWidth="2" rx="3" />
        <rect x="-22" y="-2" width="44" height="6" fill="#ffffff" />
        <rect x="-22" y="10" width="44" height="6" fill="#ffffff" />
        <rect x="-22" y="-2" width="14" height="10" fill="#2451a6" />
        <text x="-15" y="6" fontSize="6" fill="#ffffff">★★★</text>
      </g>
    </g>
  );
}

function BlackieBear() {
  return (
    <g>
      <Bear color="#1c1c1c" />
      <ellipse cx="100" cy="138" rx="26" ry="20" fill="#a76a3a" stroke={INK} strokeWidth="5" />
      <ellipse cx="100" cy="128" rx="7" ry="5" fill={INK} />
      <path d="M100 134 v6 M88 144 q12 10 24 0" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
    </g>
  );
}

function TheEndBear() {
  return (
    <g>
      <Bear color="#1c1c1c" />
      {/* gold "The End" text on belly */}
      <text x="100" y="172" textAnchor="middle" fontFamily="var(--font-fredoka), sans-serif" fontWeight="700" fontSize="14" fill="#d9a93e">
        the end
      </text>
      {/* sparkles */}
      <path d="M70 95 l1 4 4 1 -4 1 -1 4 -1 -4 -4 -1 4 -1 z" fill="#d9a93e" />
      <path d="M135 105 l1 4 4 1 -4 1 -1 4 -1 -4 -4 -1 4 -1 z" fill="#d9a93e" />
    </g>
  );
}

function SnortBull() {
  return (
    <g>
      {/* body */}
      <ellipse cx="105" cy="115" rx="78" ry="50" fill="#d8362e" stroke={INK} strokeWidth="6" />
      {/* tail */}
      <path d="M178 115 q22 -10 14 -30" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      <circle cx="190" cy="80" r="4" fill="#d8362e" stroke={INK} strokeWidth="3" />
      {/* head */}
      <ellipse cx="65" cy="120" rx="32" ry="30" fill="#d8362e" stroke={INK} strokeWidth="6" />
      {/* horns */}
      <path d="M48 96 q-10 -14 6 -22" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      <path d="M82 96 q10 -14 -6 -22" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      {/* white snout */}
      <ellipse cx="55" cy="130" rx="20" ry="14" fill="#f5e8d1" stroke={INK} strokeWidth="5" />
      <circle cx="48" cy="128" r="3" fill={INK} />
      <circle cx="62" cy="128" r="3" fill={INK} />
      {/* eye */}
      <circle cx="70" cy="110" r="4" fill={INK} />
      {/* legs */}
      <rect x="60" y="155" width="14" height="22" fill="#d8362e" stroke={INK} strokeWidth="5" rx="3" />
      <rect x="100" y="160" width="14" height="22" fill="#d8362e" stroke={INK} strokeWidth="5" rx="3" />
      <rect x="140" y="160" width="14" height="22" fill="#d8362e" stroke={INK} strokeWidth="5" rx="3" />
    </g>
  );
}

function PinchersLobster() {
  return (
    <g fill="#c52c30" stroke={INK} strokeWidth="6" strokeLinejoin="round">
      {/* body / tail */}
      <path d="M70 120 Q70 70 130 70 Q175 80 175 130 Q175 165 135 165 Q90 165 70 120 Z" />
      {/* tail fan */}
      <path d="M165 70 L185 50 L175 80 Z" fill="#c52c30" />
      <path d="M170 110 L195 105 L175 125 Z" fill="#c52c30" />
      {/* head */}
      <circle cx="65" cy="115" r="20" />
      <circle cx="60" cy="110" r="4" fill={INK} stroke="none" />
      {/* big claws */}
      <path d="M40 115 Q15 100 5 130 Q15 145 40 135 Z" />
      <path d="M30 105 Q40 110 35 130" fill="none" />
      {/* antennae */}
      <path d="M58 100 q-6 -18 -18 -26" fill="none" strokeLinecap="round" />
      <path d="M64 100 q-2 -22 -10 -34" fill="none" strokeLinecap="round" />
    </g>
  );
}

function HissySnake() {
  return (
    <g fill="#1f3a5c" stroke={INK} strokeWidth="6" strokeLinejoin="round">
      {/* coil */}
      <path d="M30 150 Q20 100 80 90 Q160 80 165 130 Q165 175 105 170 Q60 165 50 150" />
      <path d="M50 150 Q40 100 110 105 Q150 110 155 140 Q155 165 110 158" fill="none" />
      {/* head */}
      <ellipse cx="170" cy="115" rx="22" ry="16" />
      {/* eye */}
      <circle cx="178" cy="110" r="3" fill="#f3c12f" stroke="none" />
      {/* tongue */}
      <path d="M192 116 q10 0 14 -4 m-14 4 q10 0 14 4" fill="none" stroke="#dd6cae" strokeWidth="3" strokeLinecap="round" />
      {/* yellow belly hint */}
      <ellipse cx="98" cy="138" rx="36" ry="9" fill="#f3c12f" stroke="none" opacity="0.7" />
    </g>
  );
}

function TankArmadillo() {
  return (
    <g fill="#989792" stroke={INK} strokeWidth="6" strokeLinejoin="round">
      {/* body */}
      <ellipse cx="100" cy="130" rx="80" ry="35" />
      {/* segmented shell */}
      <path d="M60 100 Q60 95 65 95 M75 95 Q75 90 80 90 M95 90 Q95 85 100 85 M115 90 Q115 85 120 85 M135 95 Q135 90 140 90" fill="none" strokeWidth="4" />
      <path d="M50 130 q50 -14 100 0" fill="none" strokeWidth="4" />
      <path d="M55 145 q45 -10 90 0" fill="none" strokeWidth="3" />
      {/* head */}
      <ellipse cx="35" cy="135" rx="20" ry="14" />
      <circle cx="28" cy="132" r="3" fill={INK} stroke="none" />
      <path d="M20 138 q6 6 14 0" fill="none" strokeWidth="3" />
      {/* small ears */}
      <ellipse cx="38" cy="118" rx="4" ry="6" fill="#7a7976" stroke={INK} strokeWidth="3" />
      {/* tail */}
      <path d="M180 130 q22 -6 18 -20" fill="none" strokeLinecap="round" />
      {/* feet */}
      <rect x="75" y="160" width="10" height="14" rx="2" />
      <rect x="115" y="160" width="10" height="14" rx="2" />
    </g>
  );
}

function PattiPlatypus() {
  return (
    <g fill="#7a3fb0" stroke={INK} strokeWidth="6" strokeLinejoin="round">
      {/* body */}
      <ellipse cx="105" cy="115" rx="78" ry="38" />
      {/* tail */}
      <path d="M175 115 q22 0 22 14 q-6 6 -22 -4 Z" />
      {/* head */}
      <circle cx="48" cy="110" r="26" />
      {/* yellow bill */}
      <path d="M28 112 q-22 0 -22 12 q22 4 36 -4 Z" fill="#ee9523" />
      {/* eye */}
      <circle cx="55" cy="100" r="3" fill={INK} stroke="none" />
      {/* yellow feet */}
      <ellipse cx="90" cy="158" rx="10" ry="6" fill="#ee9523" />
      <ellipse cx="135" cy="158" rx="10" ry="6" fill="#ee9523" />
    </g>
  );
}

function ChocolateMoose() {
  return (
    <g>
      {/* antlers */}
      <path d="M70 60 q-10 -30 -30 -25 q-4 8 6 14 q-12 4 -4 14 q12 4 24 -4 Z" fill="#ee7a26" stroke={INK} strokeWidth="5" />
      <path d="M130 60 q10 -30 30 -25 q4 8 -6 14 q12 4 4 14 q-12 4 -24 -4 Z" fill="#ee7a26" stroke={INK} strokeWidth="5" />
      {/* body */}
      <ellipse cx="100" cy="125" rx="64" ry="50" fill="#5a3a1f" stroke={INK} strokeWidth="6" />
      {/* head muzzle */}
      <ellipse cx="100" cy="148" rx="28" ry="22" fill="#5a3a1f" stroke={INK} strokeWidth="6" />
      <ellipse cx="100" cy="148" rx="7" ry="5" fill={INK} />
      {/* eyes */}
      <ellipse cx="80" cy="108" rx="6" ry="8" fill={INK} />
      <ellipse cx="120" cy="108" rx="6" ry="8" fill={INK} />
      {/* ears */}
      <ellipse cx="55" cy="80" rx="10" ry="14" fill="#5a3a1f" stroke={INK} strokeWidth="5" />
      <ellipse cx="145" cy="80" rx="10" ry="14" fill="#5a3a1f" stroke={INK} strokeWidth="5" />
    </g>
  );
}

function PeanutElephant({ color }: { color: string }) {
  return (
    <g fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round">
      {/* body */}
      <ellipse cx="115" cy="120" rx="70" ry="46" />
      {/* head/trunk */}
      <circle cx="55" cy="110" r="34" />
      <path d="M30 100 q-20 10 -10 36 q12 6 18 -6" />
      {/* ears */}
      <ellipse cx="40" cy="80" rx="14" ry="20" fill={color} />
      <path d="M40 60 q-30 30 0 40" fill="#f3b5cf" />
      {/* eye */}
      <circle cx="65" cy="106" r="3" fill={INK} stroke="none" />
      {/* legs */}
      <rect x="80" y="155" width="14" height="22" rx="3" />
      <rect x="135" y="155" width="14" height="22" rx="3" />
      {/* tail */}
      <path d="M185 120 q14 6 14 22" fill="none" strokeLinecap="round" />
    </g>
  );
}

function ChipCat() {
  return (
    <g stroke={INK} strokeWidth="6" strokeLinejoin="round">
      <ellipse cx="100" cy="130" rx="74" ry="44" fill="#f5e8d1" />
      {/* head */}
      <circle cx="55" cy="120" r="30" fill="#f5e8d1" />
      {/* ears */}
      <path d="M40 100 l8 -28 l16 22 z" fill="#f5e8d1" />
      <path d="M68 100 l8 -28 l16 22 z" fill="#f5e8d1" />
      {/* calico patches */}
      <path d="M30 130 q12 -18 28 0 q-12 14 -28 0 Z" fill="#1c1c1c" stroke="none" />
      <path d="M58 110 q14 -16 28 4 q-12 12 -28 -4 Z" fill="#a36737" stroke="none" />
      <path d="M118 120 q24 -10 48 -2 q-8 18 -48 12 Z" fill="#1c1c1c" stroke="none" />
      <path d="M120 150 q26 4 50 -8" fill="none" stroke="#a36737" strokeWidth="14" strokeLinecap="round" />
      {/* eye + nose + whiskers */}
      <circle cx="63" cy="118" r="3" fill={INK} stroke="none" />
      <path d="M48 128 l6 4 l6 -4" fill="none" />
      <path d="M30 122 q10 2 16 6 M30 132 q10 -2 16 0" fill="none" strokeWidth="2" />
      {/* tail */}
      <path d="M174 130 q20 -10 18 -28" fill="none" strokeLinecap="round" />
    </g>
  );
}

function TuffyDog() {
  return (
    <g stroke={INK} strokeWidth="6" strokeLinejoin="round">
      <ellipse cx="105" cy="130" rx="72" ry="40" fill="#7a5436" />
      {/* darker patch */}
      <path d="M120 110 q26 -8 50 6 q-6 30 -50 18 Z" fill="#4a2f1a" stroke="none" />
      {/* head */}
      <circle cx="50" cy="120" r="30" fill="#7a5436" />
      {/* floppy ears */}
      <path d="M30 105 q-10 18 -2 30 q14 -2 18 -18 z" fill="#7a5436" />
      <path d="M65 100 q12 8 6 28 q-12 -2 -16 -16 z" fill="#7a5436" />
      {/* eyes */}
      <circle cx="42" cy="116" r="3" fill={INK} stroke="none" />
      <circle cx="58" cy="118" r="3" fill={INK} stroke="none" />
      {/* nose */}
      <ellipse cx="32" cy="128" rx="5" ry="4" fill={INK} stroke="none" />
      {/* tail */}
      <path d="M170 122 q22 -8 24 -28" fill="none" strokeLinecap="round" />
      {/* legs */}
      <rect x="75" y="158" width="12" height="18" rx="2" fill="#7a5436" />
      <rect x="115" y="158" width="12" height="18" rx="2" fill="#7a5436" />
    </g>
  );
}

function LegsFrog() {
  return (
    <g fill="#5fa84a" stroke={INK} strokeWidth="6" strokeLinejoin="round">
      {/* belly */}
      <ellipse cx="100" cy="135" rx="78" ry="40" />
      {/* lighter belly */}
      <ellipse cx="100" cy="148" rx="50" ry="20" fill="#a8d56a" />
      {/* head/eyes (bulges on top) */}
      <circle cx="70" cy="92" r="20" />
      <circle cx="130" cy="92" r="20" />
      <circle cx="70" cy="92" r="10" fill="#ffffff" />
      <circle cx="130" cy="92" r="10" fill="#ffffff" />
      <circle cx="70" cy="94" r="5" fill={INK} stroke="none" />
      <circle cx="130" cy="94" r="5" fill={INK} stroke="none" />
      {/* mouth */}
      <path d="M62 135 q38 16 76 0" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      {/* legs */}
      <ellipse cx="40" cy="160" rx="16" ry="8" />
      <ellipse cx="160" cy="160" rx="16" ry="8" />
    </g>
  );
}

function Dog({ color, spot }: { color: string; spot?: boolean }) {
  return (
    <g fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round">
      <ellipse cx="100" cy="130" rx="74" ry="42" />
      {spot && (
        <>
          <ellipse cx="60" cy="118" rx="14" ry="10" fill={INK} stroke="none" />
          <ellipse cx="140" cy="135" rx="18" ry="12" fill={INK} stroke="none" />
        </>
      )}
      {/* ears */}
      <path d="M40 92 q-8 20 0 36 q14 -2 16 -18 z" />
      <path d="M150 92 q8 20 0 36 q-14 -2 -16 -18 z" />
      <ellipse cx="60" cy="110" rx="6" ry="8" fill={INK} stroke="none" />
      <ellipse cx="100" cy="115" rx="6" ry="8" fill={INK} stroke="none" />
      <ellipse cx="100" cy="148" rx="14" ry="10" />
      <ellipse cx="100" cy="140" rx="5" ry="4" fill={INK} stroke="none" />
    </g>
  );
}

function Cat({ color }: ShapeProps) {
  return (
    <g fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round">
      <ellipse cx="100" cy="130" rx="72" ry="42" />
      <path d="M58 90 l8 -22 l14 18 z" />
      <path d="M120 90 l8 -22 l14 18 z" />
      <ellipse cx="80" cy="118" rx="5" ry="7" fill={INK} stroke="none" />
      <ellipse cx="120" cy="118" rx="5" ry="7" fill={INK} stroke="none" />
      <ellipse cx="100" cy="138" rx="6" ry="4" fill={INK} stroke="none" />
      <path d="M82 148 q18 10 36 0" fill="none" strokeWidth="4" />
      <path d="M170 130 q22 -8 24 -28" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Lizard({ color, stripes }: ShapeProps & { stripes?: boolean }) {
  return (
    <g fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round">
      <path d="M28 130 Q60 80 130 95 Q170 100 168 130 Q168 152 120 152 Q70 152 28 142 Z" />
      <ellipse cx="32" cy="130" rx="24" ry="18" />
      <circle cx="22" cy="124" r="3" fill={INK} stroke="none" />
      {stripes && (
        <g stroke={INK} strokeWidth="4">
          <path d="M60 110 q4 12 0 30" />
          <path d="M90 105 q4 14 0 34" />
          <path d="M120 105 q4 14 0 34" />
          <path d="M150 110 q4 12 0 30" />
        </g>
      )}
      <path d="M170 130 q24 -6 24 -28" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Fish({ color }: ShapeProps) {
  return (
    <g fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round">
      <path d="M148 100 L185 65 L185 135 Z" />
      <path d="M28 100 Q60 50 130 60 Q160 70 158 100 Q160 130 130 140 Q60 150 28 100 Z" />
      <circle cx="55" cy="92" r="5" fill={INK} stroke="none" />
      <path d="M30 108 q8 8 16 -2" fill="none" stroke={INK} strokeWidth="4" />
    </g>
  );
}

function Pig({ color }: ShapeProps) {
  return (
    <g fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round">
      <ellipse cx="100" cy="118" rx="68" ry="58" />
      <ellipse cx="100" cy="128" rx="34" ry="24" />
      <ellipse cx="88" cy="128" rx="4" ry="6" fill={INK} stroke="none" />
      <ellipse cx="112" cy="128" rx="4" ry="6" fill={INK} stroke="none" />
      <ellipse cx="78" cy="96" rx="5" ry="7" fill={INK} stroke="none" />
      <ellipse cx="122" cy="96" rx="5" ry="7" fill={INK} stroke="none" />
      <path d="M168 108 q12 -2 10 -14 q-2 -10 -12 -6" fill="none" strokeLinecap="round" />
    </g>
  );
}

function GenericPlush({ color = "#a36737" }: { color?: string }) {
  return (
    <g fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round">
      <path d="M60 65 q-6 -25 18 -22 q12 2 14 16 q8 -4 16 0 q2 -14 14 -16 q24 -3 18 22 q24 8 24 40 q0 50 -60 60 q-60 -10 -60 -60 q0 -32 24 -40 Z" />
      <ellipse cx="82" cy="105" rx="5" ry="7" fill={INK} stroke="none" />
      <ellipse cx="118" cy="105" rx="5" ry="7" fill={INK} stroke="none" />
      <path d="M88 130 q12 10 24 0" fill="none" strokeWidth="5" strokeLinecap="round" />
    </g>
  );
}

// ─── Accent overlays for the generic bear variants ────────────

function MapleLeaf() {
  return (
    <g transform="translate(100,162)" fill="#ffffff" stroke={INK} strokeWidth="2">
      <path d="M0 -10 L4 -2 L10 -4 L6 4 L12 8 L4 8 L0 14 L-4 8 L-12 8 L-6 4 L-10 -4 L-4 -2 Z" />
    </g>
  );
}

function UnionJack() {
  return (
    <g transform="translate(100,162)">
      <rect x="-18" y="-6" width="36" height="20" fill="#2451a6" stroke={INK} strokeWidth="2" />
      <path d="M-18 -6 L18 14 M18 -6 L-18 14" stroke="#ffffff" strokeWidth="3" />
      <path d="M0 -6 v20 M-18 4 h36" stroke="#ffffff" strokeWidth="4" />
      <path d="M0 -6 v20 M-18 4 h36" stroke="#cf2c30" strokeWidth="2" />
    </g>
  );
}

function Shamrock() {
  return (
    <g transform="translate(100,168)" fill="#f3c12f" stroke={INK} strokeWidth="2">
      <circle cx="0" cy="-6" r="4" />
      <circle cx="-6" cy="2" r="4" />
      <circle cx="6" cy="2" r="4" />
      <line x1="0" y1="2" x2="0" y2="10" stroke={INK} strokeWidth="2" />
    </g>
  );
}

function ChestHeart() {
  return (
    <path
      transform="translate(100,165)"
      d="M0 8 C-12 -2 -10 -12 -4 -10 C-2 -10 0 -6 0 -4 C0 -6 2 -10 4 -10 C10 -12 12 -2 0 8 Z"
      fill="#cf2c30"
      stroke={INK}
      strokeWidth="2"
    />
  );
}

function Bow() {
  return (
    <g transform="translate(100,80)">
      <path d="M-14 0 L-4 -6 L-4 6 Z" fill="#e9e0c8" stroke={INK} strokeWidth="3" />
      <path d="M14 0 L4 -6 L4 6 Z" fill="#e9e0c8" stroke={INK} strokeWidth="3" />
      <circle cx="0" cy="0" r="3" fill="#e9e0c8" stroke={INK} strokeWidth="2" />
    </g>
  );
}

function TieDyeOverlay() {
  // Subtle rainbow streak across the bear's belly for Garcia.
  return (
    <g opacity="0.7">
      <path d="M60 130 q40 -22 80 0" stroke="#e8413a" strokeWidth="6" fill="none" />
      <path d="M62 138 q40 -22 76 0" stroke="#f3c12f" strokeWidth="5" fill="none" />
      <path d="M64 146 q38 -20 72 0" stroke="#3b8ed0" strokeWidth="5" fill="none" />
    </g>
  );
}
