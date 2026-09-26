/**
 * The chat splitter reads a message's BLOCK structure the way GFM does
 * (verify-RC-B4 round 9), judged against an independent GFM parser (remark-gfm):
 *
 * - Lines right under a list item's text — even `| a | b |` pipe lines — are that
 *   item's text in GFM. They are never a "tree" block: an ASCII tree connector is
 *   `+`/`|` FOLLOWED BY A DASH (`|-- src`); a bare `| ` is a table row's edge.
 * - A line-leading tag CommonMark reads as an HTML BLOCK (`<div>`, `<section>`, …)
 *   that never closes ends where GFM ends it (the first blank line) — it never
 *   swallows the prose after it. A CLOSED container is still one block.
 * Real ASCII / box-drawing trees and custom XML containers keep their blocks.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { splitContentIntoBlocksV2 } from "../content-splitter-v2";

type N = { type: string; children?: N[] };
const gfmTopTypes = (md: string) => ((unified().use(remarkParse).use(remarkGfm).parse(md) as N).children ?? []).map((n) => n.type);
const blocks = (md: string) => splitContentIntoBlocksV2(md).filter((b) => b.content.trim()).map((b) => [b.type, b.content.trim()]);

it("a table written right under a list item's text is that item's text — no tree, no table", () => {
  const md = "Dock handover\n\n- Dock C reopens at six\n| Bay | Crew |\n| --- | --- |\n| C1 | Ines |\n\nSigned off.";
  expect(gfmTopTypes(md)).toEqual(["paragraph", "list", "paragraph"]);
  expect(blocks(md).map(([type]) => type)).toEqual(["text"]);
});

it("an ASCII tree with dash connectors is still a tree", () => {
  const md = "Layout:\n\nproject\n|-- src\n|   |-- main.py\n|   +-- util.py\n+-- README.md\n\nDone.";
  expect(blocks(md).map(([type]) => type)).toContain("tree");
});

it("a box-drawing tree is still a tree", () => {
  const md = "project\n├── src\n│   └── main.py\n└── README.md";
  expect(blocks(md).map(([type]) => type)).toEqual(["tree"]);
});

it("an unclosed <div> line is an HTML block that ends at the blank line — the prose after it stays prose", () => {
  const md = "Here is tonight's handover.\n\n<div>\n\nOmar signs off once bay B3 is re-scanned.";
  expect(gfmTopTypes(md)).toEqual(["paragraph", "html", "paragraph"]);
  const got = blocks(md);
  expect(got.some(([type, content]) => type === "code" && content.includes("Omar signs off"))).toBe(false);
  expect(got.map(([type]) => type)).toEqual(["text"]);
});

it("a closed <section> container is still one block, exactly its lines", () => {
  const md = "Intro.\n\n<section>\nBay B3 re-scan.\n</section>\n\nOutro.";
  expect(blocks(md)).toEqual([["text", "Intro."], ["code", "<section>\nBay B3 re-scan.\n</section>"], ["text", "Outro."]]);
});

it("an unclosed <section> with prose after a blank line leaves that prose as prose", () => {
  const md = "<section>\nBay B3 re-scan.\n\nOmar signs off.";
  expect(gfmTopTypes(md)).toEqual(["html", "paragraph"]);
  expect(blocks(md).some(([type, content]) => type === "code" && content.includes("Omar signs off"))).toBe(false);
});

it("a custom XML container keeps its block", () => {
  const md = "Intro.\n\n<shift_note>\nBay B3 re-scan.\n</shift_note>\n\nOutro.";
  expect(blocks(md).map(([type]) => type)).toContain("code");
});
