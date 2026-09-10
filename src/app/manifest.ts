import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Buy and sell anything, from anyone`,
    short_name: SITE_NAME,
    description: `${SITE_TAGLINE} A resale marketplace where anyone can list what they have and sell it to the public.`,
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#d9553b",
    categories: ["shopping"],
    icons: [
      { src: "/tnt-logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/tnt-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
