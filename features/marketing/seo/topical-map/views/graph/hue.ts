// features/marketing/seo/topical-map/views/graph/hue.ts
//
// THE HUE CHANNEL'S PALETTE, in one pure place because TWO surfaces must agree
// on it: the topic bodies (`nodes.tsx`) paint a topic with the bar of the facet
// value it belongs to, and the SAME function paints that value's pill on the
// axis. If the two ever computed their colour differently the legend's promise
// — "the bar on a topic matches the bar on its value in the column on the
// left" — would be a lie, so there is exactly one implementation and both call
// it.
//
// 🚨 SIX TOKENS CANNOT BE 255 COLOURS, AND THE LEGEND SAYS SO. All Green's
// `region` facet has 255 values; hashing them onto six chart tokens means
// collisions, by arithmetic. That is not a defect to hide — the colour is a
// shortcut for finding a topic's neighbours on screen, and the COLUMN is the
// key. `encoding.ts` reads {@link GRAPH_HUE_BAR_COUNT} to decide when the
// legend must state the collisions out loud.
//
// Pure: no React, no xy-flow, no store. Tested directly.

/**
 * Six chart tokens, chosen by a stable hash of the value slug so the same value
 * is the same colour on every render and on every machine — a colour that moves
 * when the sort order changes teaches the person nothing.
 */
export const GRAPH_HUE_BARS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
] as const;

/** How many distinct hues exist. The legend's honesty threshold. */
export const GRAPH_HUE_BAR_COUNT = GRAPH_HUE_BARS.length;

/** The bar class for one facet-value slug, or null when hue draws nothing. */
export function hueBar(key: string | null): string | null {
  if (!key) return null;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 100000;
  }
  return GRAPH_HUE_BARS[hash % GRAPH_HUE_BARS.length];
}
