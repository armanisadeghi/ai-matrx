/**
 * The builder's layout model — ORDER + SIZE, never coordinates.
 *
 * The stored document keeps Grafana-style `{x, y, w, h}` grid positions
 * (surface/config.ts, ruling R7) and the renderer keeps honouring them. But a
 * person authoring a run page must never see, type, or drag a coordinate: the
 * old builder's x/y/w/h steppers are exactly the "no alignment, no
 * consideration of how a human would interact with this" that this rebuild
 * exists to delete.
 *
 * So the builder owns ONE reduction: the panels of a screen are an ORDERED
 * LIST, each with a width; the pure packer below flows them left-to-right and
 * wraps, deriving every x/y. Alignment stops being something a person can get
 * wrong — the grid is always tidy because nothing else is expressible.
 *
 * Heights are the one thing the packer does not invent: an authored height is
 * preserved byte-for-byte until the person changes it, so opening a
 * hand-tuned surface never silently rewrites it.
 *
 * Pure module — no React, no Redux, no side effects. Every function returns
 * NEW objects and spreads whatever it did not touch, so config keys this
 * builder has never heard of survive a round trip untouched.
 */

import { GRID_COLUMNS, type Readout, type RunSurfaceConfig } from "../surface/config";

// ── Size vocabulary ─────────────────────────────────────────────────────────

export type PanelWidth = "third" | "half" | "twoThirds" | "full";
export type PanelHeight = "short" | "medium" | "tall";

export const WIDTH_COLUMNS: Record<PanelWidth, number> = {
  third: 8,
  half: 12,
  twoThirds: 16,
  full: GRID_COLUMNS,
};

export const HEIGHT_ROWS: Record<PanelHeight, number> = {
  short: 6,
  medium: 10,
  tall: 16,
};

export const WIDTH_CHOICES: readonly { value: PanelWidth; label: string }[] = [
  { value: "third", label: "Narrow" },
  { value: "half", label: "Half" },
  { value: "twoThirds", label: "Wide" },
  { value: "full", label: "Full" },
];

export const HEIGHT_CHOICES: readonly { value: PanelHeight; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "tall", label: "Tall" },
];

/** The named width for a stored column span, or null when it is hand-tuned. */
export function widthOf(columns: number): PanelWidth | null {
  const hit = (Object.keys(WIDTH_COLUMNS) as PanelWidth[]).find(
    (key) => WIDTH_COLUMNS[key] === columns,
  );
  return hit ?? null;
}

/** The named height for a stored row span, or null when it is hand-tuned. */
export function heightOf(rows: number): PanelHeight | null {
  const hit = (Object.keys(HEIGHT_ROWS) as PanelHeight[]).find(
    (key) => HEIGHT_ROWS[key] === rows,
  );
  return hit ?? null;
}

// ── Screens ─────────────────────────────────────────────────────────────────

/**
 * The screen a panel belongs to. A document with no pages has ONE implicit
 * screen; `null` is its id everywhere in the builder.
 */
export type ScreenId = string | null;

export function screenIdOf(readout: Readout, config: RunSurfaceConfig): ScreenId {
  if (config.pages.length === 0) return null;
  const first = config.pages[0].id;
  const pageId = readout.pageId ?? first;
  // A panel pointing at a deleted screen falls back to the first one rather
  // than vanishing from the builder while still sitting in the document.
  return config.pages.some((p) => p.id === pageId) ? pageId : first;
}

export function panelsOfScreen(
  config: RunSurfaceConfig,
  screenId: ScreenId,
): Readout[] {
  return config.readouts.filter((r) => screenIdOf(r, config) === screenId);
}

// ── The packer ──────────────────────────────────────────────────────────────

/**
 * Flow an ordered list of panels across the 24-column grid: each panel takes
 * its own width, panels sit side by side until the row is full, then wrap. A
 * row's height is its tallest panel, so rows can never interleave.
 *
 * Deterministic and total: the same order always produces the same grid.
 */
export function packScreen(panels: readonly Readout[]): Readout[] {
  const packed: Readout[] = [];
  let cursorX = 0;
  let rowTop = 0;
  let rowHeight = 0;
  for (const panel of panels) {
    const w = Math.min(GRID_COLUMNS, Math.max(1, Math.round(panel.pos.w)));
    const h = Math.max(1, Math.round(panel.pos.h));
    if (cursorX + w > GRID_COLUMNS && cursorX > 0) {
      rowTop += rowHeight;
      cursorX = 0;
      rowHeight = 0;
    }
    packed.push({ ...panel, pos: { x: cursorX, y: rowTop, w, h } });
    cursorX += w;
    rowHeight = Math.max(rowHeight, h);
    if (cursorX >= GRID_COLUMNS) {
      rowTop += rowHeight;
      cursorX = 0;
      rowHeight = 0;
    }
  }
  return packed;
}

/**
 * Re-derive every position in the document from the readout array's ORDER,
 * screen by screen. Screens are independent grids — each starts at row 0,
 * exactly as authored surfaces already store them.
 *
 * Everything else on every readout (including keys this module knows nothing
 * about) is carried through by spread.
 */
export function repack(config: RunSurfaceConfig): RunSurfaceConfig {
  const screens: ScreenId[] =
    config.pages.length === 0 ? [null] : config.pages.map((p) => p.id);
  const byId = new Map<string, Readout>();
  for (const screen of screens) {
    for (const panel of packScreen(panelsOfScreen(config, screen))) {
      byId.set(panel.id, panel);
    }
  }
  return {
    ...config,
    readouts: config.readouts.map((r) => byId.get(r.id) ?? r),
  };
}

/**
 * Put a freshly-loaded document into the builder's model: order each screen's
 * panels by where they currently sit (top-to-bottom, left-to-right) so the
 * list on the left reads in the same order as the page on the right, then
 * repack so the grid is provably tidy from the first render.
 */
export function normalize(config: RunSurfaceConfig): RunSurfaceConfig {
  const screens: ScreenId[] =
    config.pages.length === 0 ? [null] : config.pages.map((p) => p.id);
  const ordered: Readout[] = [];
  for (const screen of screens) {
    const panels = [...panelsOfScreen(config, screen)].sort((a, b) => {
      if (a.pos.y !== b.pos.y) return a.pos.y - b.pos.y;
      if (a.pos.x !== b.pos.x) return a.pos.x - b.pos.x;
      return a.id < b.id ? -1 : 1;
    });
    ordered.push(...panels);
  }
  // A panel on no known screen (deleted page) still has to survive.
  for (const r of config.readouts) {
    if (!ordered.some((o) => o.id === r.id)) ordered.push(r);
  }
  return repack({ ...config, readouts: ordered });
}

/** Move a panel one slot earlier/later within its own screen. */
export function movePanel(
  config: RunSurfaceConfig,
  panelId: string,
  direction: -1 | 1,
): RunSurfaceConfig {
  const screen = (() => {
    const panel = config.readouts.find((r) => r.id === panelId);
    return panel ? screenIdOf(panel, config) : null;
  })();
  const siblings = panelsOfScreen(config, screen);
  const index = siblings.findIndex((r) => r.id === panelId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return config;

  const reorderedSiblings = [...siblings];
  const [moved] = reorderedSiblings.splice(index, 1);
  reorderedSiblings.splice(target, 0, moved);

  // Rebuild the whole array, substituting this screen's slots in new order.
  let cursor = 0;
  const readouts = config.readouts.map((r) =>
    screenIdOf(r, config) === screen ? reorderedSiblings[cursor++] : r,
  );
  return repack({ ...config, readouts });
}

/** A readout id that is stable, readable, and not already taken. */
export function freshPanelId(config: RunSurfaceConfig, base: string): string {
  const taken = new Set(config.readouts.map((r) => r.id));
  const slug = base.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const stem = slug || "panel";
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem}-${n}`)) n += 1;
  return `${stem}-${n}`;
}
