import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where the 44px touch floor lives now: the design-system package gives every control inside
 * `.matrx-touch-targets` an invisible 44px ring, and only below `lg` (a 1440px desktop never matches).
 * Source-reading responsive-contract tests ask this instead of reading `app/globals.css`, which no longer
 * carries the rule.
 */
export function touchFloorRing(): { found: boolean; belowLgOnly: boolean } {
  const css = readFileSync(
    join(__dirname, "../../node_modules/@ai-matrx/design-system/dist/controls.css"),
    "utf8",
  );
  const at = css.indexOf(".matrx-touch-targets .matrx-control:not([data-touch-exempt])::after");
  if (at < 0) return { found: false, belowLgOnly: false };
  return { found: true, belowLgOnly: css.slice(css.lastIndexOf("@media", at), at).includes("(max-width: 1023px)") };
}
