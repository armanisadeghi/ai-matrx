import { cn } from "@ai-matrx/design-system";
import type { ComposerSize } from "./composer-types";

/**
 * The composer's TWO approved faces (Arman, 2026-10-05: one version of anything):
 *
 * - THE chip — `ComposerChip` (../ComposerChip.tsx). Bordered, a thing you
 *   attached or reach: Cloud, connections, repos, resources, documents, rail
 *   pills, the connect promo. It owns its own classes; there is no chip class
 *   string to hand-build a chip from.
 * - THE meta-row pill — `composerPillClass` below. Borderless text pill for
 *   the settings the run uses: agent, output, effort. Same 24px height, 6px
 *   radius, 12px text and hover as the chip; no border, because these are
 *   choices about the run, not things in it.
 */
export function composerPillClass(size: ComposerSize, open: boolean): string {
  return cn(
    "inline-flex h-6 min-w-0 shrink items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
    size === "compact" ? "px-1.5" : "px-2",
    open && "bg-accent text-foreground",
  );
}

/** A composer row above or below the card: never wraps; on a narrow screen it scrolls sideways. */
export const COMPOSER_ROW_CLASS =
  "flex min-w-0 flex-nowrap items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
