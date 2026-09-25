// ─────────────────────────────────────────────────────────────────────────
// TOGGLE ONE TASK IN THE STORED SOURCE — through the splice API.
//
// A rendered checkbox knows its item text and its index among this rendered
// block's tasks. The stored text is found by tokenizing the ORIGINAL source
// (`@ai-matrx/content-ir/source`): only prose blocks are searched (a `- [ ]`
// inside a code fence, an XML section or any other island is never a task),
// the matching line's marker flips `[ ]` ⇄ `[x]`, and the change goes back
// through `spliceSave` with `requireIntegrity` — every other byte, every
// island, stays exactly as stored.
//
// Matching: the task whose text equals the rendered text (markdown marks
// ignored). When the same text appears more than once, the rendered index
// picks among them in order. No match → null (the caller says so; the source
// is never guessed at).
// ─────────────────────────────────────────────────────────────────────────

import { blockEdit, spliceSave, tokenizeSource } from "@ai-matrx/content-ir/source";

const TASK_LINE = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]([ \t]+|$)(.*)$/;

function normalize(text: string): string {
  return text
    .replace(/[*_~`=]|\[\[|\]\]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface TaskToggleRequest {
  /** The item text as rendered. */
  text: string;
  /** Index among the rendered block's tasks — the tiebreaker for duplicates. */
  index: number;
  /** The state the person asked for. */
  checked: boolean;
}

interface Candidate {
  blockIndex: number;
  lineStart: number;
  markerOffset: number;
  text: string;
}

/** The new source with that one task toggled, or null when no stored task matches. */
export function toggleTaskInSource(source: string, request: TaskToggleRequest): string | null {
  const blocks = tokenizeSource(source);
  const all: Candidate[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.kind !== "prose") return;
    let offset = 0;
    for (const line of block.raw.split("\n")) {
      const m = TASK_LINE.exec(line);
      if (m) {
        all.push({ blockIndex, lineStart: offset, markerOffset: offset + (m[1] ?? "").length + 1, text: m[4] ?? "" });
      }
      offset += line.length + 1;
    }
  });
  if (all.length === 0) return null;
  const wanted = normalize(request.text);
  const matches = all.filter((c) => normalize(c.text) === wanted);
  const pick =
    matches.length === 1
      ? matches[0]
      : matches.length > 1
        ? (matches[Math.min(request.index, matches.length - 1)] ?? matches[0])
        : wanted === "" && all[request.index]
          ? all[request.index]
          : undefined;
  if (!pick) return null;
  const block = blocks[pick.blockIndex];
  if (!block) return null;
  const nextRaw =
    block.raw.slice(0, pick.markerOffset) + (request.checked ? "x" : " ") + block.raw.slice(pick.markerOffset + 1);
  if (nextRaw === block.raw) return source;
  const result = spliceSave(source, [blockEdit(block, nextRaw)], { blocks, requireIntegrity: true });
  return result.text;
}
