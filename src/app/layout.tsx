import type { Metadata } from "next";
import { jsonLdScript } from "@/lib/jsonLd";
import { Suspense } from "react";
import { Montserrat } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import "./globals.css";
import { auth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/guards";
import { SignOutButton } from "@/components/SignOutButton";
import { MobileMenu } from "@/components/MobileMenu";
import { NumberInputWheelGuard } from "@/components/NumberInputWheelGuard";
import { DeferredOverlays } from "@/components/DeferredOverlays";
import { CartProvider } from "@/lib/cart";
import { CartButton } from "@/components/CartButton";
import { unreadTotal } from "@/lib/messages";
import { outboundHref } from "@/lib/outbound";
import { Toaster, ToastFromQuery } from "@/lib/toast";

// GA4 measurement ID. Set NEXT_PUBLIC_GA_ID in the deploy environment to point
// the tag at a different/new property without a code change. Uses `||` (not
// `??`) so an empty value — e.g. a build arg whose secret is unset — falls
// back to the built-in stream rather than silently disabling analytics.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || "G-C0H8CEC4E4";

// Brand kit typography: Montserrat (Bold headings, Regular body).
//
// ONE loader call, not two. Body and display were separate Montserrat() calls
// (400-700 and 600-800) — the same family requested twice, which produced two
// CSS modules and two variable classes on <html> for one typeface. Body and
// display differ by font-weight, not by family, so the union of the weights
// through a single loader renders identically. --font-display is aliased to
// this in globals.css.
//
// Worth being precise, since the opposite is easy to assume: this saves no
// bytes. next/font already deduplicated the shared weights, and the emitted
// woff2 set is byte-identical either way (5 files, 156.2 KB). All five weights
// are genuinely used, so none can be dropped.
const montserrat = Montserrat({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const SITE_URL = "https://beaniexchange.com";
const SITE_NAME = "Beanie Xchange";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Kept under ~60 characters so Google shows the full title in results.
  title: {
    default: "BeanieXchange — Buy, Sell & Authenticate Your Beanie Babies",
    template: "%s · BeanieXchange",
  },
  description:
    "Beanie Xchange — the Beanie Baby Exchange. Buy and sell authenticated Beanie Babies, authenticate Beanie Babies via our True Blue Beans partnership, track Beanie Baby values, and verify any Beanie Baby on the BX Registry. Escrow-protected payments. Trade · Collect · Connect.",
  keywords: [
    "Beanie Babies",
    "Beanie Baby",
    "Beanie Baby Authentication",
    "Authenticate Beanie Babies",
    "Beanie Baby Exchange",
    "buy and sell Beanie Babies",
    "buy Beanie Babies",
    "sell Beanie Babies",
    "Beanie Babies for sale",
    "Track Beanie Baby value",
    "Beanie Baby value",
    "Beanie Baby price guide",
    "Beanie Baby grading",
    "Ty Beanie Babies",
    "rare Beanie Babies",
    "vintage Beanie Babies",
    "retired Beanie Babies",
    "Beanie Baby marketplace",
    "Beanie Baby COA",
    "Beanie Baby Certificate of Authenticity",
    "Beanie Baby registry",
    "True Blue Beans",
    "True Blue verified",
    "Princess Diana Beanie Baby",
    "Original 9 Beanie Babies",
    "BX Authentication",
    "Beanie Xchange Registry",
    "Beanie Xchange",
  ],
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "BeanieXchange — Buy, Sell & Authenticate Your Beanie Babies",
    description:
      "Trade · Collect · Connect. Every Beanie Baby on Beanie Xchange is True Blue verified, COA-backed, or authenticated in-house. Escrow-protected payments. Optional professional grading and a permanent place in the Beanie Xchange Registry.",
    images: [
      {
        url: "/bx-logo.png",
        width: 512,
        height: 512,
        alt: "Beanie Xchange — BX heart logo. Trade · Collect · Connect.",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "BeanieXchange — Buy, Sell & Authenticate Your Beanie Babies",
    description:
      "The trusted marketplace for Ty Beanie Babies. Authenticated, graded, escrow-protected.",
    images: ["/bx-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "shopping",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Degrade to logged-out rather than 500 the entire site if the session read
  // fails (e.g. a transient DB blip — auth() reads the user from the DB).
  const session = await auth().catch(() => null);
  const unreadMessages = session?.user
    ? await unreadTotal(session.user.id).catch(() => 0)
    : 0;
  // Superadmin's admin lives in their dashboard Admin tab (no header button);
  // HQ admins get a header shortcut to /admin.
  const showAdminButton =
    session?.user?.role === "ADMIN" && !isSuperadmin(session?.user);
  const adminHref = "/admin";

  return (
    <html
      lang="en"
      className={`${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--bx-bg)] text-ink">
        {/* Stops the mouse wheel from silently changing focused number inputs
            (e.g. a price field turning $10 into $9.97 on scroll). */}
        <NumberInputWheelGuard />
        {/* ── Sitewide beanie-bear pattern backdrop (decorative) ── */}
        <div className="bx-backdrop" aria-hidden />
        <div className="relative z-10 flex flex-col min-h-full">
        <CartProvider>
        {/* Open the TCP+TLS connection to googletagmanager up front rather than
            paying for the handshake when gtag.js is first requested. Lighthouse
            costed this at ~355ms on mobile ("Preconnect to required origins").

            Deliberately the ONLY preconnect. The R2 photo bucket looks like an
            obvious second candidate, but canOptimizeImage() in lib/photos.ts
            treats every R2 URL as optimizable, so those images are served
            through /_next/image from this origin and the browser never opens a
            connection to R2 at all. A preconnect to a host that is never
            requested just burns a connection slot. */}
        {GA_ID && (
          <>
            <link rel="preconnect" href="https://www.googletagmanager.com" />
            <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
          </>
        )}
        {/* Google Analytics 4 — gtag.js. Only emitted when an ID is set. */}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
            </Script>
          </>
        )}

        {/* Site-wide JSON-LD: Organization + WebSite (with SearchAction). */}
        <Script
          id="ld-organization"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: SITE_NAME,
              alternateName: ["BeanieXchange", "Beanie Baby Exchange", "BX"],
              url: SITE_URL,
              logo: `${SITE_URL}/bx-logo.png`,
              description:
                "Beanie Xchange is the trusted marketplace for authenticated Beanie Babies — buy, sell, authenticate, grade, and register Ty Beanie Babies with escrow-protected payments.",
              sameAs: [],
            }),
          }}
        />
        <Script
          id="ld-website"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
              potentialAction: {
                "@type": "SearchAction",
                // /database is the page that actually accepts ?q= deep links
                // (the homepage hero search posts there too).
                target: `${SITE_URL}/database?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />

        <header className="sticky top-0 z-50 bg-[var(--bx-bg2)]/95 backdrop-blur border-b-[3px] border-[var(--bx-ink)] shadow-[0_3px_0_rgba(43,35,80,0.10)]">
          <div className="mx-auto max-w-7xl px-4 h-[4.4rem] flex flex-nowrap items-center gap-2 xl:gap-4">
            <Link href="/" className="shrink-0 flex items-center gap-2 !text-ink">
              {/* `sizes` matters more than it looks here: without it, next/image
                  builds the srcset from the 512px `width` prop and preloads the
                  640w/1080w variants for a mark that renders 36-40px tall. That
                  preload competes with the hero's — the actual LCP element — on
                  mobile. Pinned to the real display size instead. */}
              <Image
                src="/bx-logo.png"
                alt="Beanie Xchange"
                width={512}
                height={512}
                sizes="40px"
                priority
                className="h-9 sm:h-10 w-auto"
              />
              {/* Hidden at the very smallest widths: with the admin pill, cart,
                  and hamburger, the wordmark overflowed a 360px header and
                  body's overflow-x:clip silently cut the menu button off. */}
              <span className="hidden min-[420px]:inline font-display text-xl sm:text-[1.65rem] font-bold tracking-tight leading-none">
                <span className="!text-[var(--bx-red)]">Beanie</span>
                <span className="!text-[var(--bx-blue-bright)]">X</span>
                <span className="!text-[var(--bx-ink)]">change</span>
              </span>
            </Link>

            <nav className="hidden xl:flex shrink-0 items-center gap-2 text-[0.95rem] font-bold whitespace-nowrap font-display">
              <Link
                href="/browse"
                className="rounded-full border-2 border-[var(--bx-ink)] bg-[var(--bx-blue-bright)] !text-ink px-3.5 py-1.5 shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform"
              >
                Marketplace
              </Link>
              <Link
                href="/database"
                className="rounded-full border-2 border-[var(--bx-ink)] bg-[var(--bx-green-bright)] !text-ink px-3.5 py-1.5 shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform"
              >
                Database
              </Link>
              <Link
                href="/authenticate"
                className="rounded-full border-2 border-[var(--bx-ink)] bg-[var(--bx-pink)] !text-[var(--bx-ink)] px-3.5 py-1.5 shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform"
              >
                Auth &amp; Grade
              </Link>
              <Link
                href="/forum"
                className="rounded-full border-2 border-[var(--bx-ink)] bg-[var(--bx-purple-bright)] !text-[var(--bx-ink)] px-3.5 py-1.5 shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform"
              >
                Community
              </Link>
              <Link
                href="/blog"
                className="rounded-full border-2 border-[var(--bx-ink)] bg-[var(--bx-yellow)] !text-ink px-3.5 py-1.5 shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform"
              >
                Blog
              </Link>
              <div className="relative group">
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-label="Resources menu"
                  className="rounded-full border-2 border-[var(--bx-ink)] bg-white !text-ink px-3.5 py-1.5 shadow-[0_2px_0_var(--bx-ink)] inline-flex items-center gap-1 cursor-pointer font-display font-bold"
                >
                  Resources
                  <svg
                    aria-hidden
                    viewBox="0 0 12 12"
                    className="h-3 w-3 transition-transform group-hover:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 4.5 6 8 9.5 4.5" />
                  </svg>
                </button>
                {/* focus-within keeps the menu reachable by keyboard — with
                    hover alone its links could never receive focus at all. */}
                <div className="absolute left-0 top-full pt-2 hidden group-hover:block group-focus-within:block">
                  <div className="bx-panel py-2 w-56 shadow-[var(--bx-shadow-lg)] font-sans font-medium normal-case">
                    <Link
                      href="/beanie-info"
                      className="block px-4 py-2 text-sm !text-[var(--bx-ink-soft)] hover:bg-[var(--bx-surface)] hover:!text-ink"
                    >
                      Beanie Info
                    </Link>
                    <Link
                      href="/rarity-guide"
                      className="block px-4 py-2 text-sm !text-[var(--bx-ink-soft)] hover:bg-[var(--bx-surface)] hover:!text-ink"
                    >
                      Collecting / Rarity Guide
                    </Link>
                    <Link
                      href="/price-trends"
                      className="block px-4 py-2 text-sm !text-[var(--bx-ink-soft)] hover:bg-[var(--bx-surface)] hover:!text-ink"
                    >
                      Price Trends
                    </Link>
                    <Link
                      href="/authentication-process"
                      className="block px-4 py-2 text-sm !text-[var(--bx-ink-soft)] hover:bg-[var(--bx-surface)] hover:!text-ink"
                    >
                      How Authentication Works
                    </Link>
                    {/* Verify-cert / BX Registry — disabled with in-house authentication:
                    <Link
                      href="/registry"
                      className="block px-4 py-2 text-sm !text-[var(--bx-ink-soft)] hover:bg-[var(--bx-surface)] hover:!text-ink"
                    >
                      BX Registry
                    </Link>
                    */}
                  </div>
                </div>
              </div>
            </nav>

            {/* Icon controls (inbox + cart) sit at the FAR right, after the
                text buttons, so they anchor the end of the header. */}
            <nav className="hidden xl:flex shrink-0 items-center gap-2 text-sm font-medium ml-auto whitespace-nowrap">
              {session?.user ? (
                <>
                  {showAdminButton && (
                    <Link
                      href={adminHref}
                      className="rounded-full bg-[var(--bx-red)] !text-[var(--bx-ink)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bx-red-dark)]"
                    >
                      Admin
                    </Link>
                  )}
                  <Link
                    href="/dashboard"
                    className="rounded-full border-2 border-[var(--bx-ink)] bg-[var(--bx-yellow)] !text-ink px-3.5 py-1.5 shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform font-display font-bold"
                  >
                    Dashboard
                  </Link>
                  <SignOutButton />
                </>
              ) : (
                <>
                  <Link
                    href="/auth/signin"
                    className="bx-btn bx-btn--ghost !py-2 !px-4"
                  >
                    Log in
                  </Link>
                  <Link href="/auth/signup" className="bx-btn !py-2 !px-4">
                    Sign up
                  </Link>
                </>
              )}
              {session?.user && (
                <Link
                  href="/messages"
                  aria-label={`Inbox${unreadMessages > 0 ? ` (${unreadMessages} unread)` : ""}`}
                  title="Inbox"
                  className="relative rounded-full border-2 border-[var(--bx-ink)] bg-white !text-ink p-2 shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                  </svg>
                  {unreadMessages > 0 && (
                    <span className="absolute -top-2 -right-2 rounded-full bg-[var(--bx-red)] text-[var(--bx-ink)] text-[10px] font-bold leading-none px-1.5 py-1">
                      {unreadMessages > 99 ? "99+" : unreadMessages}
                    </span>
                  )}
                </Link>
              )}
              <CartButton />
            </nav>

            {showAdminButton && (
              <Link
                href={adminHref}
                className="xl:hidden ml-auto inline-flex items-center h-11 rounded-full border-2 border-[var(--bx-ink)] bg-[var(--bx-red)] px-3 !text-[var(--bx-ink)] text-xs font-bold shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 transition-transform"
              >
                Admin
              </Link>
            )}
            <CartButton
              className={`xl:hidden ${showAdminButton ? "" : "ml-auto"}`}
            />
            <MobileMenu
              loggedIn={!!session?.user}
              isAdmin={showAdminButton}
              adminHref={adminHref}
              signOutSlot={<SignOutButton />}
            />
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
          {children}
        </main>

        <DeferredOverlays
          loggedIn={!!session?.user}
          initialUnread={unreadMessages}
        />
        <Toaster />
        <Suspense fallback={null}>
          <ToastFromQuery />
        </Suspense>

        <footer className="bg-[var(--bx-surface)] border-t border-[var(--bx-line)] py-12 text-sm text-muted">
          {/* Phones: brand full-width, then link sections paired 2-up — a
              single-column stack of 16 links made the footer ~4 screens tall. */}
          <div className="mx-auto max-w-6xl px-4 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-5 lg:gap-8">
            <div className="space-y-3 col-span-2 lg:col-span-1">
              <Link href="/" className="!text-ink">
                <span className="text-lg font-extrabold tracking-tight">
                  Beanie<span className="!text-[var(--bx-red)]">Xchange</span>
                </span>
              </Link>
              <p className="text-xs leading-relaxed max-w-xs">
                The leading marketplace and community for Beanie Baby®
                collectors. Buy, sell, authenticate, and connect with
                collectors worldwide.
              </p>
            </div>
            <div className="space-y-2.5">
              <p className="font-semibold text-ink">Marketplace</p>
              <Link href="/browse" className="block py-1 hover:!text-ink">
                All Listings
              </Link>
              <Link href="/browse?hide=unauth" className="block py-1 hover:!text-ink">
                Verified Only
              </Link>
              {/* Verify-cert / BX Registry — disabled with in-house authentication:
              <Link href="/registry" className="block py-1 hover:!text-ink">
                BX Registry
              </Link>
              */}
              <Link href="/database" className="block py-1 hover:!text-ink">
                Price Guide
              </Link>
            </div>
            <div className="space-y-2.5">
              <p className="font-semibold text-ink">Auth &amp; Grade</p>
              <Link href="/authentication-process" className="block py-1 hover:!text-ink">
                How It Works
              </Link>
              <Link href="/authenticate" className="block py-1 hover:!text-ink">
                Submit Your Item
              </Link>
              <Link href="/rarity-guide" className="block py-1 hover:!text-ink">
                Grading Scale
              </Link>
              <a
                href={outboundHref("true-blue", "footer")}
                target="_blank"
                rel="noopener noreferrer external"
                className="block py-1 hover:!text-ink"
              >
                True Blue Beans ↗
              </a>
            </div>
            <div className="space-y-2.5">
              <p className="font-semibold text-ink">Community</p>
              <Link href="/forum" className="block py-1 hover:!text-ink">
                Forums
              </Link>
              <Link href="/blog" className="block py-1 hover:!text-ink">
                Blog
              </Link>
              {/* Verify-cert / BX Registry — disabled with in-house authentication:
              <Link href="/registry" className="block py-1 hover:!text-ink">
                Registry
              </Link>
              */}
              {session?.user ? (
                <Link href="/dashboard" className="block py-1 hover:!text-ink">
                  Dashboard
                </Link>
              ) : (
                <Link href="/auth/signup" className="block py-1 hover:!text-ink">
                  Create account
                </Link>
              )}
            </div>
            <div className="space-y-2.5">
              <p className="font-semibold text-ink">Resources</p>
              <Link href="/database" className="block py-1 hover:!text-ink">
                Beanie Database
              </Link>
              <Link href="/beanie-info" className="block py-1 hover:!text-ink">
                Beanie Info
              </Link>
              <Link href="/beanie-info" className="block py-1 hover:!text-ink">
                Collecting Guides
              </Link>
              <a
                href="mailto:support@beaniexchange.com"
                className="block py-1 hover:!text-ink"
              >
                Help Center
              </a>
            </div>
          </div>
          <div className="mx-auto max-w-6xl px-4 mt-10 pt-6 border-t border-[var(--bx-line)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <p>
              © {new Date().getFullYear()} BeanieXchange. All rights reserved.
            </p>
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <Link href="/terms" className="hover:!text-ink">
                Terms of Service
              </Link>
              <Link href="/privacy" className="hover:!text-ink">
                Privacy Policy
              </Link>
              <Link href="/returns" className="hover:!text-ink">
                Return Policy
              </Link>
              <Link href="/authenticate" className="hover:!text-ink">
                Authentication Terms
              </Link>
            </nav>
          </div>
          <p className="mx-auto max-w-6xl px-4 mt-4 text-center sm:text-left text-[11px] text-muted/80">
            Not affiliated with or endorsed by Ty&nbsp;Inc. &ldquo;Beanie
            Babies&rdquo; is a trademark of Ty&nbsp;Inc.
          </p>
        </footer>
        </CartProvider>
        </div>
      </body>
    </html>
  );
}
