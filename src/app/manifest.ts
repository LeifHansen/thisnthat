import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beanie Xchange — Buy & Sell Authenticated Beanie Babies",
    short_name: "BeanieXchange",
    description:
      "The trusted marketplace for Ty Beanie Babies — buy, sell, authenticate, grade, and register. Escrow-protected. Trade · Collect · Connect.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e0252f",
    categories: ["shopping", "collectibles"],
    icons: [
      { src: "/bx-logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/bx-logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
