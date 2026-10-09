/**
 * The Add menu's rows — pure, so the menu, the Start panel and the tests read one list.
 *
 * ONE row per thing a person can add: its label, its section (`BoardItemType.section`) and what a
 * click does. A type that can be started AND brought in is still one row — the click is its primary
 * action (start new), `bringIn` is the row's second door. The board's own tools (sticky, text,
 * frame, draw, shapes) are rows of the Canvas section whose click only activates that tool.
 */

import {
  ArrowUpRight,
  Circle,
  Frame,
  Minus,
  Pencil,
  Shapes,
  Square,
  StickyNote,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { BoardTool } from "../engine/tools";
import {
  BOARD_SECTIONS,
  boardSectionLabel,
  startNewEntries,
  type BoardItemType,
  type BoardSection,
  type StartNewEntry,
} from "../items/types";

export interface AddRow {
  /** Stable id: `new:<type>:<entry index>`, `in:<type>` (a type with no "new"), `tool:<tool>`. */
  id: string;
  section: BoardSection;
  label: string;
  icon: LucideIcon;
  /** The catalog type (absent for a canvas tool row). */
  type?: BoardItemType;
  /** What a row click does. */
  primary: { kind: "new"; entry: StartNewEntry } | { kind: "in" } | { kind: "tool"; tool: BoardTool };
  /** The row's second door ("Bring in") when the primary is a new item and the type has a picker. */
  bringIn?: { label: string };
  /** Found by typing only: the browse list stays short (the four shapes sit behind one "Shapes" row). */
  searchOnly?: boolean;
  /** Lower-cased words the search also matches (type label, bring-in label, section). */
  haystack: string;
}

/** The board's own tools as Add rows, in toolbar order. */
const CANVAS_TOOLS: readonly { tool: BoardTool; label: string; icon: LucideIcon; words: string; searchOnly?: boolean }[] = [
  { tool: "sticky", label: "Sticky note", icon: StickyNote, words: "sticky post-it note" },
  { tool: "text", label: "Text", icon: Type, words: "label heading caption" },
  { tool: "frame", label: "Frame", icon: Frame, words: "group section container" },
  { tool: "pen", label: "Draw", icon: Pencil, words: "pen sketch freehand" },
  // "Shapes" starts the rectangle (the shape tools' first); the four are found by typing.
  { tool: "rect", label: "Shapes", icon: Shapes, words: "shape rectangle box square" },
  { tool: "rect", label: "Rectangle", icon: Square, words: "shape box square", searchOnly: true },
  { tool: "oval", label: "Oval", icon: Circle, words: "shape circle ellipse", searchOnly: true },
  { tool: "arrow", label: "Arrow", icon: ArrowUpRight, words: "shape connector", searchOnly: true },
  { tool: "line", label: "Line", icon: Minus, words: "shape divider", searchOnly: true },
];

const sectionOrder = (s: BoardSection) => BOARD_SECTIONS.findIndex((x) => x.key === s);

/**
 * Every row for `types`, grouped in section order (catalog order inside a section). `tools` is the
 * set of canvas tools the board offers (a preset may narrow its toolbar); omitted = all.
 */
export function buildAddRows(types: readonly BoardItemType[], tools?: readonly BoardTool[]): AddRow[] {
  const rows: AddRow[] = [];
  for (const c of CANVAS_TOOLS) {
    if (tools && !tools.includes(c.tool)) continue;
    rows.push({
      id: `tool:${c.tool}${c.label === "Shapes" ? ":shapes" : ""}`,
      ...(c.searchOnly ? { searchOnly: true } : {}),
      section: "canvas",
      label: c.label,
      icon: c.icon,
      primary: { kind: "tool", tool: c.tool },
      haystack: `${c.label} ${c.words} canvas tool`.toLowerCase(),
    });
  }
  for (const t of types) {
    const entries = startNewEntries(t);
    const words = (extra: string) => `${t.label} ${extra} ${boardSectionLabel(t.section)}`.toLowerCase();
    entries.forEach((entry, i) => {
      rows.push({
        id: `new:${t.key}:${i}`,
        section: t.section,
        label: entry.label,
        icon: entry.icon ?? t.icon,
        type: t,
        primary: { kind: "new", entry },
        ...(i === 0 && t.bringIn ? { bringIn: { label: t.bringIn.label } } : {}),
        haystack: words(`${entry.label} ${i === 0 && t.bringIn ? t.bringIn.label : ""}`),
      });
    });
    if (entries.length === 0 && t.bringIn) {
      rows.push({
        id: `in:${t.key}`,
        section: t.section,
        label: t.bringIn.label,
        icon: t.icon,
        type: t,
        primary: { kind: "in" },
        haystack: words(t.bringIn.label),
      });
    }
  }
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => sectionOrder(a.r.section) - sectionOrder(b.r.section) || a.i - b.i)
    .map((x) => x.r);
}

/** The browse list: every row except the search-only ones. */
export const browseRows = (rows: readonly AddRow[]): AddRow[] => rows.filter((r) => !r.searchOnly);

/** Rows grouped by section, in section order (empty sections left out; search-only rows left out). */
export function groupBySection(rows: readonly AddRow[]): { section: BoardSection; label: string; rows: AddRow[] }[] {
  return BOARD_SECTIONS.flatMap((s) => {
    const inSection = rows.filter((r) => r.section === s.key && !r.searchOnly);
    return inSection.length ? [{ section: s.key, label: s.label, rows: inSection }] : [];
  });
}

/**
 * Type-ahead: every word of the query must start a word of the row (its label, its type, its
 * bring-in name, its section); best matches first (label prefix, then label word, then the rest).
 * An empty query keeps every row in menu order.
 */
export function filterAddRows(rows: readonly AddRow[], query: string): AddRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...rows];
  const scored: { r: AddRow; score: number; i: number }[] = [];
  rows.forEach((r, i) => {
    const label = r.label.toLowerCase();
    let score = 0;
    for (const w of words) {
      const inLabel = label.startsWith(w) ? 3 : label.split(/[\s-]+/).some((x) => x.startsWith(w)) ? 2 : 0;
      const inHay = r.haystack.split(/[\s-]+/).some((x) => x.startsWith(w)) ? 1 : 0;
      if (!inLabel && !inHay) return;
      score += inLabel || inHay;
    }
    scored.push({ r, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.r);
}

// ── recents: the last few things THIS person added, kept in this browser per person ──────────────

export const RECENT_ADDS_MAX = 5;
const RECENT_PREFIX = "matrx.board.recentAdds";

export const recentAddsKey = (userId: string) => `${RECENT_PREFIX}:${userId}`;

export function readRecentAdds(userId: string | null): string[] {
  if (!userId) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(recentAddsKey(userId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_ADDS_MAX) : [];
  } catch {
    return [];
  }
}

/** Most recent first, no repeats, at most `RECENT_ADDS_MAX`. Returns the new list. */
export function pushRecentAdd(current: readonly string[], id: string): string[] {
  return [id, ...current.filter((x) => x !== id)].slice(0, RECENT_ADDS_MAX);
}

export function writeRecentAdds(userId: string | null, ids: readonly string[]): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(recentAddsKey(userId), JSON.stringify(ids));
  } catch {
    // Storage blocked: the list lasts for this visit only.
  }
}

/** The recent ids that still name an offered catalog row, in recency order. */
export function recentRows(rows: readonly AddRow[], ids: readonly string[]): AddRow[] {
  return ids.flatMap((id) => {
    const r = rows.find((x) => x.id === id && x.type);
    return r ? [r] : [];
  });
}
