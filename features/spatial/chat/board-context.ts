/**
 * The board, as the chat agent sees it.
 *
 * A `BoardContext` is a compact, BOUNDED structured snapshot of a spatial
 * board. It reaches the agent as ONE named context entry (`spatial_board`),
 * never as user text — THE USER-INPUT LAW
 * (common-docs/systems/agents/agent-variable-binding/FEATURE.md).
 *
 * Size bounds (so a 300-tile board can never blow the context window):
 *   - at most `BOARD_CONTEXT_MAX_TILES` tiles, in-view and selected tiles first;
 *   - each tile's text excerpt is capped at `BOARD_CONTEXT_EXCERPT_CHARS`;
 *   - the whole snapshot's excerpts share a `BOARD_CONTEXT_TOTAL_EXCERPT_CHARS`
 *     budget — tiles past it keep their identity row with an empty excerpt and
 *     `excerptTruncated: true`, so the agent knows the tile exists.
 * Every cap is announced in the snapshot itself (`limits`, `omittedTileCount`).
 */

import type { InstanceContextEntry } from "@/features/agents/types/instance.types";

export const BOARD_CONTEXT_MAX_TILES = 60;
export const BOARD_CONTEXT_EXCERPT_CHARS = 1200;
export const BOARD_CONTEXT_TOTAL_EXCERPT_CHARS = 24_000;

/** The layout cookie of a `BoardWithChat` group (plain module: server pages read it too). */
export function boardChatCookieName(groupId: string): string {
  return `panels:${groupId}`;
}

/** The context key the snapshot is delivered under. */
export const BOARD_CONTEXT_KEY = "spatial_board";

export type BoardTileStatus = string;

export interface BoardContextTile {
  id: string;
  title: string;
  /** What produced the tile (a kind label, a source, a subtitle) when the board says. */
  kind: string | null;
  /** The tile's own status word ("Streaming", "Done", …) when the board shows one. */
  status: BoardTileStatus | null;
  /** Plain-text excerpt of the tile body, whitespace-collapsed and capped. */
  excerpt: string;
  excerptTruncated: boolean;
  inView: boolean;
  selected: boolean;
  focused: boolean;
}

export interface BoardContext {
  boardTitle: string;
  tileCount: number;
  /** Tiles left out of `tiles` because of `limits.maxTiles`. */
  omittedTileCount: number;
  selectedTileId: string | null;
  focusedTileId: string | null;
  inViewTileIds: string[];
  tiles: BoardContextTile[];
  limits: {
    maxTiles: number;
    excerptChars: number;
    totalExcerptChars: number;
  };
  /** When the snapshot was taken (ISO). */
  capturedAt: string;
}

export interface RawBoardTile {
  id: string;
  title: string;
  kind: string | null;
  status: string | null;
  text: string;
  inView: boolean;
  selected: boolean;
  focused: boolean;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Pure: raw tiles → the bounded snapshot. */
export function boundBoardContext(boardTitle: string, raw: readonly RawBoardTile[]): BoardContext {
  // Priority order: focused, selected, in view, then board order.
  const ranked = raw
    .map((tile, index) => ({ tile, index }))
    .sort((a, b) => {
      const score = (t: RawBoardTile) => (t.focused ? 4 : 0) + (t.selected ? 2 : 0) + (t.inView ? 1 : 0);
      return score(b.tile) - score(a.tile) || a.index - b.index;
    })
    .slice(0, BOARD_CONTEXT_MAX_TILES);

  let budget = BOARD_CONTEXT_TOTAL_EXCERPT_CHARS;
  const tiles: BoardContextTile[] = ranked.map(({ tile }) => {
    const full = collapse(tile.text);
    const allowed = Math.max(0, Math.min(BOARD_CONTEXT_EXCERPT_CHARS, budget));
    const excerpt = full.length > allowed ? `${full.slice(0, allowed)}${allowed > 0 ? "…" : ""}` : full;
    budget -= Math.min(full.length, allowed);
    return {
      id: tile.id,
      title: tile.title,
      kind: tile.kind,
      status: tile.status,
      excerpt,
      excerptTruncated: full.length > allowed,
      inView: tile.inView,
      selected: tile.selected,
      focused: tile.focused,
    };
  });

  return {
    boardTitle,
    tileCount: raw.length,
    omittedTileCount: Math.max(0, raw.length - tiles.length),
    selectedTileId: raw.find((t) => t.selected)?.id ?? null,
    focusedTileId: raw.find((t) => t.focused)?.id ?? null,
    inViewTileIds: raw.filter((t) => t.inView).map((t) => t.id),
    tiles,
    limits: {
      maxTiles: BOARD_CONTEXT_MAX_TILES,
      excerptChars: BOARD_CONTEXT_EXCERPT_CHARS,
      totalExcerptChars: BOARD_CONTEXT_TOTAL_EXCERPT_CHARS,
    },
    capturedAt: new Date().toISOString(),
  };
}

/** The ONE context entry the snapshot rides in. */
export function boardContextEntry(context: BoardContext): Omit<InstanceContextEntry, "slotMatched"> {
  return {
    key: BOARD_CONTEXT_KEY,
    value: context,
    type: "json",
    label: `Board: ${context.boardTitle}`,
  };
}

/**
 * FIRST VERSION — read the board from its DOM.
 *
 * `SpatialTile` stamps `data-spatial-tile` / `data-spatial-title` on the world
 * placeholder and `data-spatial-card` on the card (which is portaled into the
 * focus layer while focused); the body is `[data-spatial-body]`. Selection is
 * read from the tile's selection ring, status from the status dot's `title`.
 *
 * FOLLOW-UP: a store-backed reader (`SpatialStore` items + stream sources)
 * replaces this once the board exposes its store — the DOM reader cannot see
 * a tile's kind payload, only its rendered text.
 */
export function readBoardContextFromDom(root: HTMLElement | null, boardTitle: string): BoardContext {
  if (!root) return boundBoardContext(boardTitle, []);
  const rootRect = root.getBoundingClientRect();
  const raw: RawBoardTile[] = [];
  for (const tile of root.querySelectorAll<HTMLElement>("[data-spatial-tile]")) {
    const id = tile.dataset.spatialTile ?? "";
    if (!id) continue;
    const card =
      root.querySelector<HTMLElement>(`[data-spatial-card="${CSS.escape(id)}"]`) ?? tile;
    const header = card.firstElementChild;
    const status = header?.querySelector<HTMLElement>("span[title]")?.title ?? null;
    const subtitle = header?.querySelector<HTMLElement>(":scope > span:not([title])")?.textContent ?? null;
    const body = card.querySelector<HTMLElement>("[data-spatial-body]");
    const focused = card.closest("[data-spatial-focus]") !== null;
    const r = tile.getBoundingClientRect();
    const inView =
      r.width > 0 &&
      r.right > rootRect.left &&
      r.left < rootRect.right &&
      r.bottom > rootRect.top &&
      r.top < rootRect.bottom;
    raw.push({
      id,
      title: tile.dataset.spatialTitle ?? id,
      kind: subtitle ? collapse(subtitle) || null : null,
      status,
      // textContent, not innerText: an overview-tier body is `content-visibility:
      // hidden`, and innerText would read it as empty.
      text: body?.textContent ?? "",
      inView,
      selected: tile.classList.contains("ring-2"),
      focused,
    });
  }
  return boundBoardContext(boardTitle, raw);
}
