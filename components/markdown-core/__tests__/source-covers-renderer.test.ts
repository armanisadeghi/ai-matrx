/**
 * FORCING FUNCTION: the editor never unlocks what the renderer draws as a block.
 *
 * The source tokenizer (`@ai-matrx/content-ir/source`) decides what an editor
 * may re-serialize; the renderer splitter decides what a reader sees as a code
 * block. If the renderer draws a fenced block whose bytes the tokenizer calls
 * prose, a visual editor can reflow code the reader sees as code. So for every
 * generated document — backtick and tilde fences, nested ```markdown, and the
 * exotic whitespace the RC-B3 re-verification used (U+FEFF, U+00A0, U+0085,
 * U+2028, tabs) — every non-text block the renderer produces must sit inside
 * ONE tokenizer island. The tokenizer may lock MORE (it treats ~~~ as a fence
 * the way remark renders it); it may never lock less. (verify-RC-B3 residual R5.)
 *
 * Use case: a teacher pastes a lesson that mixes ```python, ~~~ and a
 * ```markdown handout with its own fences; editing the prose around them must
 * never rewrite any of the code a student sees.
 *
 * Seeded and bounded: SOURCE_COVERS_LONG=1 runs 20x more documents.
 */
import { listIslands, tokenizeSource } from "@ai-matrx/content-ir/source";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

const F = "```";
const LONG = process.env.SOURCE_COVERS_LONG === "1";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WS = [" ", "\t", "﻿", " ", "\u0085", " ", "\u001C", ""];
const LINES = [
  `${F}python`, `${F}js`, `${F}markdown`, `${F}md`, `${F}mermaid`, `${F}`, "````", "````md", "~~~", "~~~py",
  "print(1)", "const a = 1;", "# Heading", "Some prose sentence.", "- a list item", "", "", "x = y + 1",
  "graph TD; A-->B", "more words here", `x ${F}`, `}${F}`,
];

function randomDoc(random: () => number, lines: number): string {
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    let line = LINES[Math.floor(random() * LINES.length)] as string;
    if (random() < 0.25) line = (WS[Math.floor(random() * WS.length)] as string) + line;
    if (random() < 0.25) line += WS[Math.floor(random() * WS.length)] as string;
    out.push(line);
  }
  return out.join(random() < 0.2 ? "\r\n" : "\n");
}

/**
 * Where a renderer code block's body sits: it starts on the line right after a
 * fence opener and is followed by a line break, its closing backticks, or the
 * end of the text. Anything else is an identical prose line, not the block.
 */
function locate(text: string, content: string, from: number): number {
  for (let at = text.indexOf(content, from); at !== -1; at = text.indexOf(content, at + 1)) {
    if (at === 0 || text[at - 1] !== "\n") continue;
    const prevStart = text.lastIndexOf("\n", at - 2) + 1;
    const opener = text.slice(prevStart, at - 1).replace(/\r$/, "").trim();
    if (!opener.startsWith("```")) continue;
    const rest = text.slice(at + content.length);
    if (rest === "" || rest.startsWith("\n") || rest.startsWith("\r\n") || rest.startsWith("`")) return at;
  }
  return -1;
}

/** A rewritten copy of the text with a map from each of its offsets to the original. */
function view(text: string, blankWhitespaceLines: boolean) {
  let str = "";
  const map: number[] = [];
  let i = 0;
  while (i < text.length) {
    let lineEnd = text.indexOf("\n", i);
    if (lineEnd === -1) lineEnd = text.length;
    let contentEnd = lineEnd;
    if (contentEnd > i && text[contentEnd - 1] === "\r") contentEnd--;
    const line = text.slice(i, contentEnd);
    if (!(blankWhitespaceLines && line.trim() === "")) {
      for (let k = i; k < contentEnd; k++) {
        str += text[k];
        map.push(k);
      }
    }
    if (lineEnd < text.length) {
      str += "\n";
      map.push(lineEnd);
    }
    i = lineEnd + 1;
  }
  map.push(text.length);
  /** First view offset whose original offset is at or after `original`. */
  const from = (original: number) => {
    let lo = 0;
    let hi = map.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((map[mid] as number) < original) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return { str, map, from };
}

describe("the tokenizer locks every block the renderer draws from a fence", () => {
  test.each([[1], [2], [3], [4]])("seed %i", (seed) => {
    const random = seededRandom(seed);
    const docs = LONG ? 20000 : 1000;
    let checkedBlocks = 0;
    for (let round = 0; round < docs; round++) {
      const text = randomDoc(random, 2 + Math.floor(random() * 14));
      const islands = listIslands(tokenizeSource(text)).filter((island) => !island.inline);
      const blocks = splitContentIntoBlocksV2(text);
      // The splitter splits on \r?\n (contents carry LF only) and blanks
      // whitespace-only lines inside prose. Locate code bodies in an LF view and
      // prose in an LF + blank-line view; both map back to original offsets, and
      // the cursor lives in original offsets.
      const code = view(text, false);
      const prose = view(text, true);
      let cursor = 0;
      for (const block of blocks) {
        if (!block.content) continue;
        if (block.type === "text") {
          const at = prose.str.indexOf(block.content, prose.from(cursor));
          if (at !== -1) cursor = prose.map[at + block.content.length] as number;
          continue;
        }
        // A whitespace-only body has no distinctive bytes to find (or to damage).
        if (block.content.trim() === "") continue;
        const lfAt = locate(code.str, block.content, code.from(cursor));
        if (lfAt === -1) continue; // content the splitter rewrote — not locatable byte-for-byte
        const at = code.map[lfAt] as number;
        const end = (code.map[lfAt + block.content.length - 1] as number) + 1;
        const owner = islands.find((island) => island.start <= at && island.end >= end);
        if (!owner) {
          throw new Error(
            `seed ${seed} round ${round}: renderer ${block.type} block [${at},${end}) is not inside one tokenizer island\n` +
              JSON.stringify(text),
          );
        }
        checkedBlocks++;
        cursor = end;
      }
    }
    expect(checkedBlocks).toBeGreaterThan(docs / 4);
  });
});
