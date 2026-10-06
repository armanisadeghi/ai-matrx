/**
 * V2 — a markdown leaf and the pipeline can never disagree about what is a
 * kind region. The leaf gate (`markdownCarriesKind`) and the splitter both
 * read `quotedSourceRanges`; this proves the consequence over a corpus:
 *
 *  - when the gate hands a text to the pipeline, the pipeline LIFTS a kind
 *    out of it, and no prose block it leaves behind still carries one (a
 *    leftover would be drawn raw by the leaf the pipeline hands it back to);
 *  - when the gate keeps a text, the pipeline lifts nothing from it.
 */

import { splitContentIntoBlocksV2 } from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/content-splitter-v2";
import { readEnvelope } from "@ai-matrx/rich-content/kinds/redux/render-block-envelope";
import { markdownCarriesKind } from "../surfaces/json-kind-signal";

const KIND = '{"__kind":"flashcard_set","title":"Cells","cards":[{"__kind":"flashcard","front":"Q","back":"A"}]}';
const PRETTY = JSON.stringify(JSON.parse(KIND), null, 2);

const DATA: Array<[string, string]> = [
  ["prose, same line", `It returned ${KIND} without a fence.`],
  ["prose, own line", `It returned:\n${KIND}\nDone.`],
  ["a table cell", `| set | payload |\n| --- | --- |\n| cells | ${KIND} |`],
  ["a 4-space indented block", `Result:\n\n    ${KIND}\n\nDone.`],
  ["a list item", `- first\n- ${KIND}\n- third`],
  ["a blockquote line", `> Quoted:\n> ${KIND}\n> end`],
  ["a blockquoted json fence", `> Quoted:\n${("```json\n" + PRETTY + "\n```").split("\n").map((l) => `> ${l}`).join("\n")}`],
  ["a json fence", "Here:\n\n```json\n" + PRETTY + "\n```\n"],
  ["an unlabelled fence", "Here:\n\n```\n" + KIND + "\n```\n"],
  ["the whole text", KIND],
];

const SOURCE: Array<[string, string]> = [
  ["an inline code span", `The marker is \`${KIND}\` on every payload.`],
  ["a ts fence", "Code:\n\n```ts\nconst k = " + KIND + ";\n```\n"],
  ["an xml fence", "```xml\n<a>\n" + KIND + "\n</a>\n```"],
  ["a quoted ts fence", "> ```ts\n> const k = " + KIND + ";\n> ```"],
  ["a markdown fence", "````markdown\n" + KIND + "\n````"],
  ["prose naming the key", 'The "__kind" key names it.'],
];

function lifted(text: string) {
  const blocks = splitContentIntoBlocksV2(text);
  const kinds = blocks.filter((b) => readEnvelope(b.metadata)?.root.kind === "flashcard_set");
  const leftovers = blocks.filter(
    (b) => b.type !== "code" && markdownCarriesKind(b.content),
  );
  return { kinds, leftovers };
}

describe("the leaf gate and the pipeline agree (V2)", () => {
  it.each(DATA)("%s: the gate reroutes and the pipeline lifts the kind", (_label, text) => {
    expect(markdownCarriesKind(text)).toBe(true);
    const { kinds, leftovers } = lifted(text);
    expect(kinds).toHaveLength(1);
    expect(leftovers.map((b) => `${b.type}: ${b.content.slice(0, 40)}`)).toEqual([]);
  });

  it.each(SOURCE)("%s: the gate keeps it and the pipeline lifts nothing", (_label, text) => {
    expect(markdownCarriesKind(text)).toBe(false);
    expect(lifted(text).kinds).toEqual([]);
  });
});
