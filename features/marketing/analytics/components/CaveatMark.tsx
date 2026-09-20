"use client";

/**
 * 🚨 THE ONE CAVEAT MARK — the thing that puts a GA4 honesty caveat ON the
 * number it is about.
 *
 * WHY IT EXISTS (round-4 hostile verification § V14-4, B side, 2026-09-17).
 * §4.9 asks for *"the honesty caveats printed on the numbers (thresholding,
 * `(other)` rows, sampling)"* and §1 for *"the caveat on the number itself"* —
 * that sentence IS the champion edge over every other GA4 consumer. What shipped
 * was one bordered block under the chart, a Users tile whose hint said
 * "Summed across landing pages — see the caveat", and a landing page literally
 * named `(other)` sitting in the table as an ordinary row. A caveat a reader has
 * to go and find does not qualify the number they are reading.
 *
 * ONE component, because a mark per surface is a wording per surface: the tiles,
 * the chart legend and the landing-page table all render THIS, over the ONE
 * attribution map in `../disclosures.ts`. It is deliberately not interactive —
 * there is nothing to click and a button that does nothing is worse than a
 * glyph — so it is an image with a name: the sentence is BOTH the hover title
 * and the accessible name, and the name says which number it qualifies, because
 * "warning" alone tells a screen-reader user nothing.
 *
 * It renders NOTHING when nothing is true (Law 4: absent or honest, never a
 * decorative mark that means "no problem" and reads as one).
 */

import { Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  disclosureSentence,
  type AnalyticsDisclosure,
} from "@/features/marketing/analytics/disclosures";

export interface CaveatMarkProps {
  /** The number this qualifies, named in the accessible name ("Sessions"). */
  what: string;
  /** From `disclosuresForTile` / `…Series` / `…LandingPage` / `…Table`. */
  disclosures: readonly AnalyticsDisclosure[];
  className?: string;
}

export function CaveatMark({ what, disclosures, className }: CaveatMarkProps) {
  if (disclosures.length === 0) return null;
  const sentence = disclosureSentence(disclosures);
  // A distortion Google reported is a warning; "nothing was flagged, which is
  // not an all-clear" is a note about the measurement, not about the number.
  const onlyMeasurement = disclosures.every(
    (disclosure) => disclosure.id === "flags-not-affirmed",
  );
  const Icon = onlyMeasurement ? Info : TriangleAlert;
  return (
    <span
      role="img"
      title={`${what}: ${sentence}`}
      aria-label={`${what}: ${sentence}`}
      className={cn(
        "inline-flex shrink-0 cursor-help items-center align-middle",
        onlyMeasurement ? "text-muted-foreground" : "text-warning",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
    </span>
  );
}
