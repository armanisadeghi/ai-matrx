/**
 * THE composer chip (brief §7, Arman 2026-09-28): 24px, one line, 12px text,
 * medium corners. Every chip and pill around the input — Cloud, connections,
 * chosen resources, working context, the page, agent, effort, output — wears
 * this height, type size and rounding, so the rows read as one piece and
 * match the card's own corners.
 */
export const COMPOSER_CHIP_RADIUS = "rounded-md";

export const COMPOSER_CHIP_CLASS =
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs text-foreground transition-colors hover:bg-accent";

/** A composer row above or below the card: never wraps; on a narrow screen it scrolls sideways. */
export const COMPOSER_ROW_CLASS =
  "flex min-w-0 flex-nowrap items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
