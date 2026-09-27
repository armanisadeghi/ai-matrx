// find-in-conversation — in-thread find (Cmd/Ctrl+F inside a conversation).
//
// Highlights through the CSS Custom Highlight API: we build DOM Ranges over the
// rendered text and register them with `CSS.highlights`. The transcript's DOM
// is NEVER mutated (no <mark> injection), so React, streaming, selection, copy
// and the editors all see exactly what they rendered. Where the API is absent
// the find bar still counts and scrolls to each match — it just cannot paint.

// The same rendered-text matcher powers RichDocument search in study guides.
// Preserve the conversation find bar's whitespace-trimming contract.
import { collectRenderedFindRanges, findRenderedTextMatches } from "@/features/rich-document/search/renderedFind";

export function findTextMatches(text: string, query: string): Array<[number, number]> {
  return findRenderedTextMatches(text, query.trim());
}

export function collectFindRanges(root: HTMLElement, query: string): Range[] {
  return collectRenderedFindRanges(root, query.trim());
}

export const FIND_HIGHLIGHT = "matrx-conversation-find";
export const FIND_HIGHLIGHT_CURRENT = "matrx-conversation-find-current";

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };
type HighlightCtor = new (...ranges: Range[]) => unknown;

function highlightApi(): { registry: HighlightRegistry; Highlight: HighlightCtor } | null {
  if (typeof window === "undefined") return null;
  const css = (window as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Highlight = (window as unknown as { Highlight?: HighlightCtor }).Highlight;
  if (!css?.highlights || !Highlight) return null;
  return { registry: css.highlights, Highlight };
}

export function supportsHighlightApi(): boolean {
  return highlightApi() !== null;
}

/** Paint all matches + the current one. Returns false where painting is unsupported. */
export function paintFindHighlights(ranges: Range[], current: number): boolean {
  const api = highlightApi();
  if (!api) return false;
  api.registry.set(FIND_HIGHLIGHT, new api.Highlight(...ranges));
  const cur = ranges[current];
  if (cur) api.registry.set(FIND_HIGHLIGHT_CURRENT, new api.Highlight(cur));
  else api.registry.delete(FIND_HIGHLIGHT_CURRENT);
  return true;
}

export function clearFindHighlights(): void {
  const api = highlightApi();
  if (!api) return;
  api.registry.delete(FIND_HIGHLIGHT);
  api.registry.delete(FIND_HIGHLIGHT_CURRENT);
}

export type FindHistoryState =
  | { state: "loading"; loaded: number }
  | { state: "done"; loaded: number }
  | { state: "partial"; loaded: number };

/**
 * The find bar's status. It never says "No matches" while older history is
 * still loading, and a search over a history that could not be fully read
 * says so (verify-RC-B9 F3).
 */
export function findStatusText(args: {
  query: string;
  matches: number;
  current: number;
  history: FindHistoryState;
  /** History arrived but its newly rendered messages are not searched yet. */
  searching?: boolean;
}): string {
  if (!args.query.trim()) return "";
  if (args.matches > 0) return `${args.current + 1} of ${args.matches}`;
  if (args.history.state === "loading") return `Loading earlier messages… ${args.history.loaded}`;
  if (args.searching) return `Searching all ${args.history.loaded} messages…`;
  if (args.history.state === "partial") {
    return `No matches in the ${args.history.loaded} messages that loaded — earlier history could not be read`;
  }
  return `No matches in ${args.history.loaded} messages`;
}
