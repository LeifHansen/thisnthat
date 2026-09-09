import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { DM_Sans, Fraunces } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import "./globals.css";
import { auth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/guards";
import { jsonLdScript } from "@/lib/jsonLd";
import { SITE_NAME, SITE_TAGLINE, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";
import { SignOutButton } from "@/components/SignOutButton";
import { MobileMenu } from "@/components/MobileMenu";
import { NumberInputWheelGuard } from "@/components/NumberInputWheelGuard";
import { DeferredOverlays } from "@/components/DeferredOverlays";
import { CartProvider } from "@/lib/cart";
import { CartButton } from "@/components/CartButton";
import { unreadTotal } from "@/lib/messages";
import { Toaster, ToastFromQuery } from "@/lib/toast";

// GA4 measurement ID. Set NEXT_PUBLIC_GA_ID in the deploy environment; the tag
// is only emitted when one is configured.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || "";

// Typography: DM Sans for body/UI, Fraunces (a warm serif) for headings.
// Both are variable fonts, so no weight list is needed. globals.css reads
// --font-body and --font-display.
const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const TITLE = `${SITE_NAME} — Buy and sell anything, from anyone`;
const DESCRIPTION = `${SITE_TAGLINE} ${SITE_NAME} is a resale marketplace where anyone can list clothes, shoes, electronics, art, cards, collectibles and more, and sell to the public. Payment is held until the buyer confirms delivery.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  keywords: [
    "resale marketplace",
    "buy and sell online",
    "sell used items",
    "secondhand",
    "pre-owned",
    "thrift online",
    "used clothes",
    "used electronics",
    "vintage",
    "collectibles",
    "trading cards",
    "art prints",
    "sell my stuff",
    SITE_NAME,
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
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE_TAGLINE,
    images: ["/og.png"],
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

export const viewport: Viewport = {
  themeColor: "#faf7f2",
};

const NAV: { href: string; label: string }[] = [
  { href: "/browse", label: "Browse" },
  { href: "/browse?type=lots", label: "Lots" },
  { href: "/sell", label: "Sell" },
  { href: "/blog", label: "Blog" },
];

const navLink =
  "rounded-full px-3.5 py-1.5 text-[0.95rem] font-semibold !text-ink hover:bg-[var(--tnt-surface)] transition-colors";
const footerLink = "block py-1 hover:!text-ink";

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
  // other admins get a header shortcut to /admin.
  const showAdminButton =
    session?.user?.role === "ADMIN" && !isSuperadmin(session?.user);
  const adminHref = "/admin";

  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--tnt-bg)] text-ink">
        {/* Stops the mouse wheel from silently changing focused number inputs
            (e.g. a price field turning $10 into $9.97 on scroll). */}
        <NumberInputWheelGuard />
        <CartProvider>
          {/* Open the connection to googletagmanager up front rather than
              paying for the handshake when gtag.js is first requested. */}
          {GA_ID && (
            <>
              <link rel="preconnect" href="https://www.googletagmanager.com" />
              <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
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
                url: SITE_URL,
                logo: `${SITE_URL}/tnt-logo.png`,
                description: DESCRIPTION,
                email: SUPPORT_EMAIL,
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
                  target: `${SITE_URL}/browse?q={search_term_string}`,
                  "query-input": "required name=search_term_string",
                },
              }),
            }}
          />

          <header className="sticky top-0 z-50 bg-[var(--tnt-bg2)]/90 backdrop-blur border-b border-[var(--tnt-line)]">
            <div className="mx-auto max-w-7xl px-4 h-16 flex flex-nowrap items-center gap-2 lg:gap-4">
              <Link
                href="/"
                className="shrink-0 flex items-center gap-2 !text-ink"
                aria-label={`${SITE_NAME} home`}
              >
                {/* `sizes` pins the srcset to the real display size so a
                    40px mark never preloads a 1080w variant. */}
                <Image
                  src="/tnt-mark.svg"
                  alt=""
                  width={512}
                  height={512}
                  sizes="40px"
                  loading="eager"
                  className="h-9 w-9 sm:h-10 sm:w-10"
                />
                {/* Hidden at the very smallest widths so the cart, admin pill
                    and menu button still fit a 360px header. */}
                <span className="hidden min-[400px]:inline font-display text-[1.45rem] sm:text-[1.6rem] font-semibold tracking-tight leading-none">
                  This<span className="!text-[var(--tnt-red)]">&rsquo;n&rsquo;</span>that
                </span>
              </Link>

              <nav
                aria-label="Primary"
                className="hidden lg:flex shrink-0 items-center gap-1 whitespace-nowrap ml-2"
              >
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href} className={navLink}>
                    {item.label}
                  </Link>
                ))}
              </nav>

              {/* Account controls sit at the far right on desktop. */}
              <nav
                aria-label="Account"
                className="hidden lg:flex shrink-0 items-center gap-2 text-sm font-medium ml-auto whitespace-nowrap"
              >
                {session?.user ? (
                  <>
                    {showAdminButton && (
                      <Link
                        href={adminHref}
                        className="rounded-full bg-[var(--tnt-red)] !text-white px-3 py-1.5 text-xs font-bold hover:bg-[var(--tnt-red-dark)]"
                      >
                        Admin
                      </Link>
                    )}
                    <Link href="/dashboard" className={navLink}>
                      Dashboard
                    </Link>
                    <SignOutButton />
                  </>
                ) : (
                  <>
                    <Link
                      href="/auth/signin"
                      className="tnt-btn tnt-btn--ghost !py-2 !px-4"
                    >
                      Log in
                    </Link>
                    <Link href="/auth/signup" className="tnt-btn !py-2 !px-4">
                      Sign up
                    </Link>
                  </>
                )}
                {session?.user && (
                  <Link
                    href="/messages"
                    aria-label={`Inbox${unreadMessages > 0 ? ` (${unreadMessages} unread)` : ""}`}
                    title="Inbox"
                    className="relative rounded-full border border-[var(--tnt-line-strong)] bg-white !text-ink p-2 hover:bg-[var(--tnt-surface)] transition-colors"
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
                      <span className="absolute -top-2 -right-2 rounded-full bg-[var(--tnt-red)] text-white text-[10px] font-bold leading-none px-1.5 py-1">
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
                  className="lg:hidden ml-auto inline-flex items-center h-10 rounded-full bg-[var(--tnt-red)] px-3 !text-white text-xs font-bold hover:bg-[var(--tnt-red-dark)]"
                >
                  Admin
                </Link>
              )}
              <CartButton
                className={`lg:hidden ${showAdminButton ? "" : "ml-auto"}`}
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

          <footer className="bg-[var(--tnt-surface)] border-t border-[var(--tnt-line)] py-12 text-sm text-muted">
            {/* Phones: brand full-width, then link sections paired 2-up. */}
            <div className="mx-auto max-w-6xl px-4 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-5 lg:gap-8">
              <div className="space-y-3 col-span-2 lg:col-span-1">
                <Link href="/" className="!text-ink inline-flex items-center gap-2">
                  <Image
                    src="/tnt-mark.svg"
                    alt=""
                    width={512}
                    height={512}
                    sizes="28px"
                    className="h-7 w-7"
                  />
                  <span className="font-display text-lg font-semibold tracking-tight">
                    This<span className="!text-[var(--tnt-red)]">&rsquo;n&rsquo;</span>that
                  </span>
                </Link>
                <p className="text-xs leading-relaxed max-w-xs">
                  {SITE_TAGLINE} A marketplace where anyone can list what
                  they have and sell it to the public. Sellers are paid out
                  when the buyer confirms delivery.
                </p>
              </div>
              <div className="space-y-2.5">
                <p className="font-semibold text-ink">Marketplace</p>
                <Link href="/browse" className={footerLink}>
                  Browse
                </Link>
                <Link href="/browse?type=lots" className={footerLink}>
                  Lots &amp; bundles
                </Link>
                <Link href="/sell" className={footerLink}>
                  Sell
                </Link>
              </div>
              <div className="space-y-2.5">
                <p className="font-semibold text-ink">Account</p>
                {session?.user ? (
                  <Link href="/dashboard" className={footerLink}>
                    Dashboard
                  </Link>
                ) : (
                  <Link href="/auth/signup" className={footerLink}>
                    Create account
                  </Link>
                )}
                <Link href="/messages" className={footerLink}>
                  Messages
                </Link>
              </div>
              <div className="space-y-2.5">
                <p className="font-semibold text-ink">Help</p>
                <Link href="/blog" className={footerLink}>
                  Blog
                </Link>
                <Link href="/returns" className={footerLink}>
                  Return policy
                </Link>
                <Link href="/terms#fees" className={footerLink}>
                  Fees
                </Link>
              </div>
              <div className="space-y-2.5">
                <p className="font-semibold text-ink">Legal</p>
                <Link href="/terms" className={footerLink}>
                  Terms
                </Link>
                <Link href="/privacy" className={footerLink}>
                  Privacy
                </Link>
                <Link href="/returns" className={footerLink}>
                  Returns
                </Link>
              </div>
            </div>
            <div className="mx-auto max-w-6xl px-4 mt-10 pt-6 border-t border-[var(--tnt-line)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <p>
                © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
              </p>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:!text-ink">
                {SUPPORT_EMAIL}
              </a>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
