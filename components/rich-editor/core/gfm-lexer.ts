// components/rich-editor/core/gfm-lexer.ts
//
// THE EDITOR LAYER'S ONE `marked` EDGE. The one editor uses `marked` only as a
// byte-mapped GFM tokenizer — every token carries its exact `raw` source — for
// the visual view's fidelity gate (markdown-parse.ts) and the table writer's
// whole-table read-back (table-source.ts). It never renders anything: rendering
// stays with the one markdown core. Registered as the lawful editor-layer site of
// `pkg:marked` in scripts/rich-content-inventory/registry.ts — no other editor
// file imports `marked`.

import { marked, type Token, type Tokens } from "marked";

export { Lexer, Tokenizer } from "marked";
export type { Token, Tokens };

/** GFM block tokens of `text` (each with its exact `raw`), blank-line tokens dropped. */
export function lexGfmBlocks(text: string): Token[] {
  return marked.lexer(text, { gfm: true }).filter((token) => token.type !== "space");
}
