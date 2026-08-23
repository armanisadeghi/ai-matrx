import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { ValueWorkbench } from "@/features/marketing/seo/value-system/workbench/ValueWorkbench";

/**
 * THE Keyword Value workbench. Not a redirect any more.
 *
 * From 2026-08-21 this route forwarded to `./c`, the winner of a four-way UI
 * bake-off. On 2026-08-22 the four variants converged: C moved out of
 * `variants/c/` into `value-system/workbench/`, the best ideas from A and B
 * were grafted into it, and A/B/D were deleted. `./a` `./b` `./c` `./d` now
 * redirect here so every bookmark still lands somewhere true.
 *
 * The rest of the family — Dimensions, Rulebook, Topics, Industry packs —
 * sits beside this route and is reachable from the site header's sub-nav,
 * declared in `features/marketing/lib/site-subviews.ts`.
 */
export default function KeywordValuePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading keyword value workbench…" />}>
      <ValueWorkbench />
    </Suspense>
  );
}
