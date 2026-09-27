/**
 * The board, as an agent reads it (`board_read`).
 *
 * A `BoardContext` is a compact, BOUNDED structured snapshot of a spatial
 * board, returned by the board's agent tools — never sent as user text.
 *
 * Size bounds (so a 300-tile board can never blow the context window):
 *   - at most `BOARD_CONTEXT_MAX_TILES` tiles, in-view and selected tiles first;
 *   - each tile's text excerpt is capped at `BOARD_CONTEXT_EXCERPT_CHARS`;
 *   - the whole snapshot's excerpts share a `BOARD_CONTEXT_TOTAL_EXCERPT_CHARS`
 *     budget — tiles past it keep their identity row with an empty excerpt and
 *     `excerptTruncated: true`, so the agent knows the tile exists.
 * Every cap is announced in the snapshot itself (`limits`, `omittedTileCount`).
 */

export const BOARD_CONTEXT_MAX_TILES = 60;
export const BOARD_CONTEXT_EXCERPT_CHARS = 1200;
export const BOARD_CONTEXT_TOTAL_EXCERPT_CHARS = 24_000;

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
