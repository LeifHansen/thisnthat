import Image from "next/image";
import { outboundHref } from "@/lib/outbound";

/**
 * Linked partner badge for True Blue Beans, the third-party Beanie Baby
 * authentication service we route Full / Express service submissions
 * through. Always opens in a new tab and is marked rel="external" so
 * crawlers and screen readers handle it as a cross-site partner link.
 * The href goes through the tracked /out/true-blue redirect so clicks are
 * counted; `source` labels where the badge was placed.
 *
 * Trademark note: the True Blue Beans wordmark belongs to TBB. We use
 * the logo on the basis of the existing partner relationship; do not
 * surface it on pages where the wording would imply endorsement
 * beyond what TBB has agreed to.
 */
export function TrueBlueBadge({
  size = "md",
  className = "",
  source = "badge",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  source?: string;
}) {
  const dims =
    size === "sm"
      ? { w: 96, h: 38, hClass: "h-9" }
      : size === "lg"
        ? { w: 240, h: 96, hClass: "h-20" }
        : { w: 160, h: 64, hClass: "h-14" };

  return (
    <a
      href={outboundHref("true-blue", source)}
      target="_blank"
      rel="noopener noreferrer external"
      className={`inline-flex items-center ${className}`}
      aria-label="True Blue Beans Authentication Service (opens in new tab)"
      title="True Blue Beans — our authentication partner"
    >
      <Image
        src="/brand/true-blue-beans.svg"
        width={dims.w}
        height={dims.h}
        alt="True Blue Beans Authentication Service"
        className={dims.hClass + " w-auto"}
        unoptimized
      />
    </a>
  );
}
