"use client";

import { useEffect } from "react";

/**
 * Stops the mouse wheel from silently changing the value of a focused
 * `<input type="number">`. Browsers treat wheel-over-a-focused-number-input as
 * increment/decrement, so a seller who scrolls the page with the cursor over
 * the price field can turn $10.00 into $9.97 without noticing.
 *
 * We blur the input the moment it receives a wheel event: the blur runs before
 * the browser applies its default step change, so the value is left alone and
 * the page scrolls normally. Passive listener — we never call preventDefault,
 * so ordinary scrolling is untouched. Mounted once, site-wide, in the layout.
 */
export function NumberInputWheelGuard() {
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      const el = e.target;
      if (
        el instanceof HTMLInputElement &&
        el.type === "number" &&
        el === document.activeElement
      ) {
        el.blur();
      }
    }
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
