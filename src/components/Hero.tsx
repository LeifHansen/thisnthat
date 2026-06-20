import Link from "next/link";

// Marketing hero — 1990s Tinker Hatfield energy: bold italics, color blocking,
// angular cuts, kinetic marquee.
export function Hero() {
  const ticker = "VINTAGE · SNEAKERS · MEMORABILIA · COLLECTABLES · ";
  return (
    <section className="tk-clip tk-shadow relative mb-10 overflow-hidden rounded-[28px] bg-[#ff5a1f]">
      {/* color-block + speed stripes */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#ff5a1f] via-[#ff1e88] to-[#5b2bff]" />
      <div className="tk-stripes absolute inset-0 opacity-60" />

      {/* top marquee */}
      <div className="relative overflow-hidden border-b-4 border-black/80 bg-black/85 py-2">
        <div className="tk-marquee text-sm font-black uppercase italic tracking-tight text-[#d6ff3f]">
          <span>{ticker.repeat(6)}</span>
          <span>{ticker.repeat(6)}</span>
        </div>
      </div>

      <div className="relative px-6 py-12 text-white sm:px-12 sm:py-16">
        <span className="inline-block -rotate-2 bg-[#d6ff3f] px-3 py-1 text-xs font-black uppercase tracking-widest text-black">
          ✨ AI-assisted listing · scan a photo, we fill the rest
        </span>

        <h1 className="tk-display mt-5 text-6xl text-white drop-shadow-[3px_3px_0_rgba(0,0,0,0.6)] sm:text-8xl">
          Icons aren&apos;t
          <br />
          <span className="text-[#d6ff3f]">retired.</span> They&apos;re resold.
        </h1>

        <p className="mt-6 max-w-xl text-base font-semibold text-white/90 sm:text-lg">
          Vintage clothing, sneakers, sports memorabilia &amp; collectables — sold from
          storefronts as bold as the stuff inside them. Buy it now, or name your price.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/sell"
            className="tk-shadow inline-block -skew-x-6 bg-black px-7 py-3 text-base font-black uppercase italic tracking-tight text-white transition-transform hover:-translate-y-0.5"
          >
            Start selling →
          </Link>
          <Link
            href="#browse"
            className="inline-block -skew-x-6 border-4 border-black bg-white px-7 py-3 text-base font-black uppercase italic tracking-tight text-black transition-transform hover:-translate-y-0.5"
          >
            Shop the drop
          </Link>
        </div>
      </div>
    </section>
  );
}
