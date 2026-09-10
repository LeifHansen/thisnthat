"use client";

import { useEffect } from "react";

/**
 * Forces the viewport to the top on mount. Server-action redirects (e.g. after
 * publishing a listing) can otherwise leave the new page scrolled to wherever
 * the form was submitted — on mobile that's the footer.
 */
export function ScrollToTop() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return null;
}
