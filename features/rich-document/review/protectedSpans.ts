// features/rich-document/review/protectedSpans.ts
//
// Text going to an agent carries its PROTECTED spans as atoms the model
// cannot alter (verify-RC-B5 r4 N1). Owner's words: never destroy TUI escape
// characters. A model handed raw terminal escapes (`\u001b[32m`) returns them
// as spaces, and every Clean up on an answer with terminal output was refused
// — even for a plain typo fix.
//
// So the text is sent with each protected span replaced by a numbered marker
// (`⟦P1⟧`), and the approved result gets every span back BYTE-FOR-BYTE before
// the splice: terminal/control escape sequences, and every inline construct
// the shared tokenizer marks protected (`{{variables}}`, citations, anchors,
// inline XML/HTML tags, inline kind JSON, media refs, wikilinks) plus bare JSON
// blocks. Fenced code, math and XML sections stay readable — they are still
// protected by the save's own island gate, which refuses a change that would
// alter them.
//
// A marker the agent dropped, duplicated or invented makes the result
// unusable: that is said, never guessed.

import { listIslands, tokenizeSource } from "@ai-matrx/content-ir/source";

/** ESC sequences (CSI, OSC, two-byte) and bare C0/DEL control characters (not \t \n \r). */
const ESCAPES =
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const MARKER = /⟦P(\d+)⟧/g;

export interface MaskedText {
  /** What the agent receives. */
  text: string;
  /** Original bytes of each span; marker `⟦Pn⟧` stands for spans[n-1]. */
  spans: string[];
}

export function maskProtectedSpans(text: string): MaskedText {
  if (MARKER.test(text)) {
    // The text already contains marker-shaped strings: masking would be
    // ambiguous, so send it as it is (the save gate still protects it).
    MARKER.lastIndex = 0;
    return { text, spans: [] };
  }
  MARKER.lastIndex = 0;
  const ranges: { start: number; end: number }[] = [];
  for (const m of text.matchAll(ESCAPES)) {
    ranges.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  for (const island of listIslands(tokenizeSource(text))) {
    if (island.inline || island.islandType === "json") {
      ranges.push({ start: island.start, end: island.end });
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = kept[kept.length - 1];
    if (last && r.start < last.end) continue; // inside or overlapping a kept span
    kept.push(r);
  }
  if (kept.length === 0) return { text, spans: [] };
  const spans: string[] = [];
  let out = "";
  let at = 0;
  for (const r of kept) {
    out += text.slice(at, r.start);
    spans.push(text.slice(r.start, r.end));
    out += `⟦P${spans.length}⟧`;
    at = r.end;
  }
  out += text.slice(at);
  return { text: out, spans };
}

export type UnmaskResult = { text: string } | { error: string };

/** Put every protected span back, byte-for-byte — or say which ones the agent broke. */
export function unmaskProtectedSpans(result: string, spans: readonly string[]): UnmaskResult {
  if (spans.length === 0) return { text: result };
  const seen = new Map<number, number>();
  for (const m of result.matchAll(MARKER)) {
    const n = Number(m[1]);
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  const broken = spans
    .map((_, i) => i + 1)
    .filter((n) => seen.get(n) !== 1);
  const invented = [...seen.keys()].filter((n) => n < 1 || n > spans.length);
  if (broken.length > 0 || invented.length > 0) {
    return {
      error:
        "The agent's result dropped or changed protected text (terminal codes, variables or similar), so it cannot be applied. Run it again, or make the change in the editor.",
    };
  }
  return { text: result.replace(MARKER, (_, n: string) => spans[Number(n) - 1]) };
}
