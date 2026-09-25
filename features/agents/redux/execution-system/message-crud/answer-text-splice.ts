/**
 * answer-text-splice — THE chat-message save adapter's byte-exact core
 * (rich-content RC-B5, PLAN decision 11).
 *
 * An assistant row's `content` is an array of parts: text segments, tool
 * calls, thinking, media, kind payloads. The person edits ONE string — the
 * answer text as STORED — and this module maps
 * that edit back onto the parts:
 *
 *   - Only the text part(s) the edit actually touches change. Every other
 *     part (tool calls, thinking, media, other text segments, their
 *     `citations` / `metadata`) is carried through as the SAME object.
 *   - No edit → `{ changed: false }` → the caller writes nothing.
 *   - An edit that would reach into a non-text part that carries text (a part
 *     the answer shows but the person does not own) is refused, loudly.
 *
 * The replaced `buildContentBlocksForSave` merges EVERY text segment into
 * one on save — a citation-bearing answer (many segments) came back as one
 * block even when the person fixed a single typo. This keeps the segments.
 *
 * The projection joins parts exactly as `extractFlatText` does (consecutive
 * text segments concatenate; any other contributing part is joined with
 * "\n") but WITHOUT its display scrub (`removeThinkingContent` also collapses
 * blank-line runs and trims): the editor must hold the stored bytes, or a
 * one-word fix would rewrite whitespace across the whole answer. An answer
 * whose stored text carries inline reasoning tags is not edited in place
 * (the registry `edit` action routes it to the full-screen editor).
 */

import { NON_ANSWER_BLOCK_TYPES } from "../active-requests/active-requests.selectors";
import {
  blockRangeEdit,
  islandEdit,
  listIslands,
  spliceSave,
  tokenizeSource,
  type SourceEdit,
} from "@ai-matrx/content-ir/source";
import { removeThinkingContent } from "@ai-matrx/print/markdown";

type Part = { type?: unknown; text?: unknown } & Record<string, unknown>;

interface Segment {
  /** Index of the part in the content array. */
  index: number;
  /** [start, end) of the part's text inside the projected string. */
  start: number;
  end: number;
  /** True for `type: "text"` (or untyped) parts — the ones a person may rewrite. */
  editable: boolean;
}

interface Projection {
  text: string;
  segments: Segment[];
}

function isTextPart(part: Part): boolean {
  return part.type === "text" || part.type === undefined;
}

/** Projects the parts to the answer string + where each part's bytes sit. */
export function projectAnswerText(content: unknown): Projection {
  const parts = Array.isArray(content) ? (content as Part[]) : [];
  let text = "";
  let prevWasText = false;
  const segments: Segment[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!part || typeof part !== "object") continue;
    if (typeof part.type === "string" && NON_ANSWER_BLOCK_TYPES.has(part.type)) continue;
    if (typeof part.text !== "string" || part.text.length === 0) continue;
    const isText = isTextPart(part);
    if (text.length > 0 && !(isText && prevWasText)) text += "\n";
    const start = text.length;
    text += part.text;
    segments.push({ index, start, end: text.length, editable: isText });
    prevWasText = isText;
  }
  return { text, segments };
}

export type AnswerSpliceResult =
  | { changed: false }
  | { changed: true; content: unknown[] }
  | { changed: false; error: string };

/**
 * Map `newText` (the whole edited answer) onto `content`.
 *
 * The changed region is the span between the longest common prefix and the
 * longest common suffix of old and new text. It is assigned to the text part
 * that holds its start; if it spans further parts, the covered text parts
 * give up the covered bytes (a part left empty is dropped — `extractFlatText`
 * never showed empty parts). Separators between parts are never rewritten:
 * an edit that deletes or retypes one is refused, because the result could
 * not project back to what the person saw.
 */
export function spliceAnswerText(content: unknown, newText: string): AnswerSpliceResult {
  const parts = Array.isArray(content) ? (content as Part[]) : null;
  const { text: oldText, segments } = projectAnswerText(content);
  if (newText === oldText) return { changed: false };
  if (!parts || segments.length === 0) {
    // Nothing to splice into: the answer becomes its first text part.
    return { changed: true, content: [...(parts ?? []), { type: "text", text: newText }] };
  }

  // Longest common prefix / suffix (suffix never overlaps the prefix).
  let prefix = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefix < maxPrefix && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  const maxSuffix = Math.min(oldText.length, newText.length) - prefix;
  while (
    suffix < maxSuffix &&
    oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
  ) {
    suffix++;
  }
  const oldEnd = oldText.length - suffix;
  const inserted = newText.slice(prefix, newText.length - suffix);

  // The segment that owns the edit's start: the one containing `prefix`, or —
  // for an insertion exactly at a boundary — the one ending there.
  let first = segments.findIndex((s) => prefix >= s.start && prefix < s.end);
  if (first === -1) first = segments.findIndex((s) => prefix === s.end);
  if (first === -1) {
    return { changed: false, error: "The edit falls between two parts of the answer and cannot be placed exactly." };
  }
  // The segment that owns the edit's end (exclusive end → last byte covered).
  let last = first;
  if (oldEnd > prefix) {
    last = segments.findIndex((s) => oldEnd - 1 >= s.start && oldEnd - 1 < s.end);
    if (last === -1) {
      return { changed: false, error: "The edit removes a line break between two parts of the answer." };
    }
  }

  for (let i = first; i <= last; i++) {
    if (!segments[i].editable) {
      return {
        changed: false,
        error: "The edit reaches into a part of the answer that is not text (a tool or structured result) — edit only the text around it.",
      };
    }
  }
  // Separators between covered segments belong to nobody: deleting one would
  // silently merge parts that sit around a tool call.
  for (let i = first; i < last; i++) {
    if (segments[i].end !== segments[i + 1].start) {
      return { changed: false, error: "The edit removes a line break between two parts of the answer." };
    }
  }

  const next: unknown[] = [...parts];
  const drop = new Set<number>();
  const head = segments[first];
  const tail = segments[last];
  if (first === last) {
    const own = parts[head.index].text as string;
    next[head.index] = {
      ...parts[head.index],
      text: own.slice(0, prefix - head.start) + inserted + own.slice(oldEnd - head.start),
    };
  } else {
    const headText = (parts[head.index].text as string).slice(0, prefix - head.start) + inserted;
    const tailText = (parts[tail.index].text as string).slice(oldEnd - tail.start);
    next[head.index] = { ...parts[head.index], text: headText };
    for (let i = first + 1; i < last; i++) drop.add(segments[i].index);
    if (tailText.length > 0) next[tail.index] = { ...parts[tail.index], text: tailText };
    else drop.add(tail.index);
    if (headText.length === 0) drop.add(head.index);
  }
  if (first === last && (next[head.index] as Part).text === "") drop.add(head.index);
  const spliced = next.filter((_, index) => !drop.has(index));

  // Proof, not hope: the spliced parts must project to exactly what was typed.
  if (projectAnswerText(spliced).text !== newText) {
    return { changed: false, error: "The edit could not be placed byte-for-byte into the stored answer." };
  }
  return { changed: true, content: spliced };
}

/** What the chat view shows for a stored answer text (reasoning scrubbed, blank-line runs collapsed, trimmed). */
export function displayOfStoredAnswer(stored: string): string {
  return removeThinkingContent(stored);
}

/** One contiguous change between two display texts, in PREVIOUS-display offsets. */
export interface DisplayHunk {
  start: number;
  end: number;
  text: string;
}

const TOKEN = /\s+|\w+|[^\s\w]/gu;

function tokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/**
 * Word-level Myers diff → SEPARATE hunks. Two typos a paragraph apart are two
 * hunks, never one span that overwrites everything between them.
 */
export function diffDisplayHunks(previous: string, next: string): DisplayHunk[] {
  const a = tokens(previous);
  const b = tokens(next);
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
          ? v[offset + k + 1]
          : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  // Backtrack into an edit script of kept / deleted / inserted tokens.
  type Op = { kind: "keep" | "del" | "ins"; token: string };
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d];
    const k = x - y;
    const prevK =
      k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = vd[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ kind: "keep", token: a[x - 1] });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) ops.push({ kind: "ins", token: b[y - 1] });
      else ops.push({ kind: "del", token: a[x - 1] });
    }
    x = prevX;
    y = prevY;
  }
  ops.reverse();
  const hunks: DisplayHunk[] = [];
  let pos = 0;
  let open: DisplayHunk | null = null;
  for (const op of ops) {
    if (op.kind === "keep") {
      if (open) hunks.push(open);
      open = null;
      pos += op.token.length;
      continue;
    }
    if (!open) open = { start: pos, end: pos, text: "" };
    if (op.kind === "del") {
      pos += op.token.length;
      open.end = pos;
    } else {
      open.text += op.token;
    }
  }
  if (open) hunks.push(open);
  return hunks;
}

/** storedAt[j] = offset in `stored` of display character j (greedy; only dropped characters are skipped). */
function alignDisplay(stored: string, display: string): number[] | null {
  const storedAt: number[] = new Array(display.length);
  let i = 0;
  for (let j = 0; j < display.length; j++) {
    for (;;) {
      if (i >= stored.length) return null;
      if (stored[i] === display[j]) break;
      const open = /^<(thinking|think|reasoning)>/i.exec(stored.slice(i, i + 12));
      if (open) {
        const close = stored.indexOf(`</${open[1]}>`, i);
        if (close === -1) return null;
        i = close + open[1].length + 3;
        continue;
      }
      if (/\s/.test(stored[i])) {
        i++;
        continue;
      }
      return null;
    }
    storedAt[j] = i;
    i++;
  }
  return storedAt;
}

export type DisplayEditResult =
  | { text: string; changedSpans: number }
  | { error: string };

/**
 * Map an edit made on DISPLAY text onto the STORED answer text (RC-B5).
 *
 * The display text is `displayOfStoredAnswer(stored)`: reasoning scrubbed,
 * blank-line runs collapsed, trimmed. Writing it back rewrites the stored
 * bytes; a single first-to-last-change span overwrote everything between two
 * edits — a reasoning section included (verify-RC-B5 round 2, row 1f81e7f0).
 * So:
 *
 *   1. the stored text must still show as `previousDisplay` (else refuse);
 *   2. the approved text is diffed against it into SEPARATE hunks;
 *   3. each hunk is mapped to stored offsets on its own — a replacement only
 *      where the stored bytes under it are exactly the displayed ones (a hunk
 *      across a collapsed line break or a hidden section is refused), an
 *      insertion right before the next displayed character;
 *   4. a hunk inside one protected island (code, math, a kind, an XML
 *      section) changes it through `islandEdit`; a hunk that crosses an
 *      island's edge is refused; prose hunks become block edits;
 *   5. `spliceSave` applies them — every other byte, and every island not
 *      named, is carried through untouched (integrity is required);
 *   6. the result must SHOW exactly as approved, or nothing is written.
 */
export function spliceDisplayEdit(
  stored: string,
  previousDisplay: string,
  nextDisplay: string,
): DisplayEditResult {
  if (previousDisplay === nextDisplay) return { text: stored, changedSpans: 0 };
  if (displayOfStoredAnswer(stored) !== previousDisplay) {
    return {
      error: "The answer changed since this text was shown (or it is still being written). Nothing was saved — reload and try again.",
    };
  }
  const storedAt = alignDisplay(stored, previousDisplay);
  if (!storedAt) {
    return { error: "The shown text could not be matched to the saved answer, so nothing was saved." };
  }
  const endOfMatch = previousDisplay.length ? storedAt[previousDisplay.length - 1] + 1 : 0;
  const blocks = tokenizeSource(stored);
  const islands = listIslands(blocks);

  type Placed = { start: number; end: number; text: string };
  const placed: Placed[] = [];
  for (const hunk of diffDisplayHunks(previousDisplay, nextDisplay)) {
    if (hunk.start === hunk.end) {
      const at = hunk.start < previousDisplay.length ? storedAt[hunk.start] : endOfMatch;
      placed.push({ start: at, end: at, text: hunk.text });
      continue;
    }
    const first = storedAt[hunk.start];
    const last = storedAt[hunk.end - 1];
    if (last - first !== hunk.end - 1 - hunk.start) {
      return {
        error:
          "One change spans text the view hides or collapses (a hidden reasoning section or extra blank lines), so it cannot be placed exactly. Nothing was saved — make that change in the editor.",
      };
    }
    placed.push({ start: first, end: last + 1, text: hunk.text });
  }

  const islandEdits = new Map<(typeof islands)[number], Placed[]>();
  const prose: Placed[] = [];
  for (const p of placed) {
    const host = islands.find((isl) => p.start > isl.start && p.end < isl.end);
    if (host) {
      if (/^<(thinking|think|reasoning)>/i.test(host.raw)) {
        return { error: "A change landed inside hidden reasoning, which is never edited this way. Nothing was saved." };
      }
      islandEdits.set(host, [...(islandEdits.get(host) ?? []), p]);
      continue;
    }
    const crosses = islands.some(
      (isl) => (p.start < isl.end && p.end > isl.start) && !(p.start >= isl.end || p.end <= isl.start),
    );
    if (crosses) {
      return {
        error: "One change crosses the edge of protected content (code, math, a table or a section). Nothing was saved — change it inside that block or in the editor.",
      };
    }
    prose.push(p);
  }

  const apply = (base: string, baseStart: number, spans: Placed[]) => {
    let out = base;
    for (const sp of [...spans].sort((l, r) => r.start - l.start)) {
      out = out.slice(0, sp.start - baseStart) + sp.text + out.slice(sp.end - baseStart);
    }
    return out;
  };

  const edits: SourceEdit[] = [];
  for (const [isl, spans] of islandEdits) {
    edits.push(islandEdit(isl, apply(isl.raw, isl.start, spans)));
  }
  // Prose hunks → block-aligned edits, merging hunks that share blocks.
  const blockIndex = (pos: number) => {
    const inside = blocks.findIndex((b) => pos >= b.start && pos < b.end);
    if (inside !== -1) return inside;
    const ending = blocks.findIndex((b) => pos === b.end);
    return ending !== -1 ? ending : blocks.length - 1;
  };
  const runs: { first: number; last: number; spans: Placed[] }[] = [];
  for (const p of [...prose].sort((l, r) => l.start - r.start)) {
    const first = blockIndex(p.start);
    const last = Math.max(first, blockIndex(Math.max(p.start, p.end - 1)));
    const prev = runs[runs.length - 1];
    if (prev && first <= prev.last) {
      prev.last = Math.max(prev.last, last);
      prev.spans.push(p);
    } else {
      runs.push({ first, last, spans: [p] });
    }
  }
  for (const run of runs) {
    const a = blocks[run.first];
    const b = blocks[run.last];
    edits.push(blockRangeEdit(a, b, apply(stored.slice(a.start, b.end), a.start, run.spans)));
  }

  let text: string;
  try {
    text = spliceSave(stored, edits).text;
  } catch (error) {
    return {
      error: `Saving would disturb protected content, so nothing was saved (${error instanceof Error ? error.message : String(error)}).`,
    };
  }
  if (displayOfStoredAnswer(text) !== nextDisplay) {
    return {
      error: "The saved answer would not show exactly what you approved, so nothing was saved. Make this change in the editor.",
    };
  }
  return { text, changedSpans: placed.length };
}
