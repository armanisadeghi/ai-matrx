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

/** Inline reasoning sections the chat view scrubs (`removeThinkingContent`). */
const REASONING_OPEN = /^<(thinking|think|reasoning)>/i;

/**
 * Map an edit made on DISPLAY text onto the STORED answer text (RC-B5).
 *
 * In-body editors (code blocks, tables, inline decisions, task toggles) edit
 * the text the renderer shows, which is NOT the stored text: the view trims,
 * collapses runs of blank lines and drops inline `<thinking>` / `<reasoning>`
 * sections. Writing that display text back rewrote whitespace across the
 * whole answer. Instead:
 *
 *   1. diff `previousDisplay` → `nextDisplay` (longest common prefix/suffix):
 *      the changed span and the text typed into it;
 *   2. align `previousDisplay` onto `stored` character by character — a stored
 *      character the view dropped (extra whitespace, a reasoning section) is
 *      skipped; anything else that disagrees refuses (never a guess);
 *   3. replace only the aligned span of `stored`.
 *
 * Every stored byte outside the changed span is kept exactly — blank-line
 * runs, trailing spaces, reasoning sections included.
 */
export function spliceDisplayEdit(
  stored: string,
  previousDisplay: string,
  nextDisplay: string,
): { text: string } | { error: string } {
  if (previousDisplay === nextDisplay) return { text: stored };
  let prefix = 0;
  const maxPrefix = Math.min(previousDisplay.length, nextDisplay.length);
  while (prefix < maxPrefix && previousDisplay.charCodeAt(prefix) === nextDisplay.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  const maxSuffix = maxPrefix - prefix;
  while (
    suffix < maxSuffix &&
    previousDisplay.charCodeAt(previousDisplay.length - 1 - suffix) ===
      nextDisplay.charCodeAt(nextDisplay.length - 1 - suffix)
  ) {
    suffix++;
  }
  const displayEnd = previousDisplay.length - suffix;
  const inserted = nextDisplay.slice(prefix, nextDisplay.length - suffix);

  // storedAt[j] = index in `stored` of display character j.
  const storedAt: number[] = new Array(previousDisplay.length);
  let i = 0;
  for (let j = 0; j < previousDisplay.length; j++) {
    for (;;) {
      if (i >= stored.length) {
        return { error: "The edited block no longer matches the saved answer — reload and edit again." };
      }
      if (stored[i] === previousDisplay[j]) break;
      const rest = stored.slice(i, i + 12);
      const open = REASONING_OPEN.exec(rest);
      if (open) {
        const close = stored.indexOf(`</${open[1]}>`, i);
        if (close === -1) return { error: "The saved answer has an unclosed reasoning section; edit it in the editor." };
        i = close + open[1].length + 3;
        continue;
      }
      if (/\s/.test(stored[i])) {
        i++;
        continue;
      }
      return { error: "The edited block no longer matches the saved answer — reload and edit again." };
    }
    storedAt[j] = i;
    i++;
  }
  const endOfMatch = i;
  const at = (j: number) => (j < previousDisplay.length ? storedAt[j] : endOfMatch);
  // A pure insertion lands right after the preceding displayed character, so
  // stored whitespace the view collapsed stays on its own side.
  const storedStart = prefix === displayEnd && prefix > 0 ? storedAt[prefix - 1] + 1 : at(prefix);
  const storedEnd = prefix === displayEnd ? storedStart : storedAt[displayEnd - 1] + 1;
  return { text: stored.slice(0, storedStart) + inserted + stored.slice(storedEnd) };
}
