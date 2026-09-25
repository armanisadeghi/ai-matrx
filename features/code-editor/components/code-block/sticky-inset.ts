// Where a code block's floating Collapse/Copy controls come to rest: below the
// app header where it overlaps the scroller, AND below every row of sticky
// chrome that shares the scroller (marked `data-sticky-chrome` — e.g. the
// conversation toolbar). Without the second part they covered that chrome and
// swallowed its clicks (verify-RC-B9 F5).

export const STICKY_CHROME_SELECTOR = "[data-sticky-chrome]";

export function stickyRestInset(args: {
  headerBottom: number;
  restTop: number;
  chromeHeights: number[];
}): number {
  const header = Math.max(0, Math.round(args.headerBottom - args.restTop));
  const chrome = args.chromeHeights.reduce((sum, h) => sum + Math.max(0, h), 0);
  return header + Math.round(chrome);
}
