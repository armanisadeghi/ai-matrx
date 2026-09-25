// ─────────────────────────────────────────────────────────────────────────
// THE ONE same-name XML balance rule for both block splitters — the static
// one (content-splitter-core `extractXmlBlock`) and the live one
// (`StreamBlockAccumulator`, `xml_tag` state).
//
// A section may contain a section with the SAME name:
//
//   <info>
//   Outer
//   <info>
//   Inner
//   </info>
//   Outer tail
//   </info>
//
// Matching the FIRST `</info>` closed the outer section at the inner closer,
// and `Outer tail` + the real `</info>` leaked out as raw text (verify-RC-B2,
// 2026-09-25). The container closes on the closer that brings its depth back
// to zero. Only a LINE-LEADING opener nests (the only place either splitter
// detects a section opener) — prose that mentions `<info>` mid-sentence never
// holds a section open. With `trackFences`, tags inside a fenced code block
// never count (the static splitter; it falls back when that reading runs off
// the end of the text).
// ─────────────────────────────────────────────────────────────────────────

export interface XmlBalanceState {
  /** Open same-name sections, counting the container itself (starts at 1). */
  depth: number;
  /** Backtick/tilde run of the fenced code block we are inside, if any. */
  fence: string | null;
}

export function initialXmlBalance(): XmlBalanceState {
  return { depth: 1, fence: null };
}

export interface XmlBalanceOptions {
  /** Ignore tags inside ``` / ~~~ fenced code (default true). */
  trackFences?: boolean;
  /** Count nested same-name openers (default true). False = first closer wins. */
  nest?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Scan ONE line inside an open `<tagName>` section, in source order.
 *
 * Returns the character index where the container's own closing tag starts
 * (the closer that brings depth to zero), or -1 when the section is still
 * open after this line. Mutates `state` (depth and fence tracking).
 */
export function findBalancedXmlClose(
  line: string,
  tagName: string,
  state: XmlBalanceState,
  { trackFences = true, nest = true }: XmlBalanceOptions = {},
): number {
  const fence = trackFences ? FENCE_LINE.exec(line) : null;
  if (state.fence) {
    if (
      fence &&
      fence[1][0] === state.fence[0] &&
      fence[1].length >= state.fence.length &&
      line.trim() === fence[1]
    ) {
      state.fence = null;
    }
    return -1;
  }
  if (fence) {
    state.fence = fence[1];
    return -1;
  }
  const tag = new RegExp(
    `<(\\/?)${escapeRegExp(tagName)}(?=[\\s>/])[^<>]*?(\\/?)>`,
    "g",
  );
  for (const match of line.matchAll(tag)) {
    const closing = match[1] === "/";
    const selfClosing = match[2] === "/";
    if (closing) {
      state.depth -= 1;
      if (state.depth === 0) return match.index ?? -1;
    } else if (
      nest &&
      !selfClosing &&
      line.slice(0, match.index).trim() === ""
    ) {
      state.depth += 1;
    }
  }
  return -1;
}
