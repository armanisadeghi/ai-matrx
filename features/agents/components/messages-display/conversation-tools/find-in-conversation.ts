// find-in-conversation — in-thread find (Cmd/Ctrl+F inside a conversation).
//
// Highlights through the CSS Custom Highlight API: we build DOM Ranges over the
// rendered text and register them with `CSS.highlights`. The transcript's DOM
// is NEVER mutated (no <mark> injection), so React, streaming, selection, copy
// and the editors all see exactly what they rendered. Where the API is absent
// the find bar still counts and scrolls to each match — it just cannot paint.

/** Every non-overlapping, case-insensitive [start, end) match of `query`. */
export function findTextMatches(text: string, query: string): Array<[number, number]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hay = text.toLowerCase();
  const out: Array<[number, number]> = [];
  let from = 0;
  for (;;) {
    const i = hay.indexOf(q, from);
    if (i === -1) break;
    out.push([i, i + q.length]);
    from = i + q.length;
  }
  return out;
}

/** Elements whose text is chrome, not conversation content. */
const IGNORE_SELECTOR =
  "[data-find-ignore], button, [role='button'], [role='menu'], script, style, textarea, input, [aria-hidden='true']";

/**
 * Build Ranges for every match of `query` in the text rendered under `root`.
 * Matches may span element boundaries inside one block (`<strong>` etc.).
 */
export function collectFindRanges(root: HTMLElement, query: string): Range[] {
  const q = query.trim();
  if (!q) return [];
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue) return NodeFilter.FILTER_REJECT;
      if (parent.closest(IGNORE_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
    starts.push(text.length);
    text += (n as Text).nodeValue ?? "";
  }
  const locate = (offset: number, isEnd: boolean): [Text, number] | null => {
    // Binary search the node that holds `offset`.
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const start = starts[mid];
      const len = nodes[mid].nodeValue?.length ?? 0;
      const inside = isEnd ? offset > start && offset <= start + len : offset >= start && offset < start + len;
      if (inside) return [nodes[mid], offset - start];
      if (offset < start || (isEnd && offset === start)) hi = mid - 1;
      else lo = mid + 1;
    }
    return null;
  };
  const ranges: Range[] = [];
  for (const [s, e] of findTextMatches(text, q)) {
    const a = locate(s, false);
    const b = locate(e, true);
    if (!a || !b) continue;
    const r = doc.createRange();
    r.setStart(a[0], a[1]);
    r.setEnd(b[0], b[1]);
    ranges.push(r);
  }
  return ranges;
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
