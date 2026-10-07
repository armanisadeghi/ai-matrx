// A copied Univer document is markdown WITH its markup: headings, bold, italics, lists, tables.
// The live review (2026-10-07) found "Copy markdown" on /documents/<id> produced bare text because the
// copy read only the data stream; the formatting lives in the snapshot's text runs. The snapshot below is
// built the way markdown-to-univer-doc writes one (it cannot load under jest: Univer is ESM-only).
import { univerDocToMarkdown } from "../univer-doc-to-markdown";

type Piece = [text: string, ts?: Record<string, unknown>];
function snapshot(paragraphs: Piece[][]) {
  let stream = "";
  const textRuns: Array<{ st: number; ed: number; ts: Record<string, unknown> }> = [];
  for (const para of paragraphs) {
    for (const [text, ts] of para) {
      if (ts) textRuns.push({ st: stream.length, ed: stream.length + text.length, ts });
      stream += text;
    }
    stream += "\r";
  }
  return { body: { dataStream: stream + "\n", textRuns, paragraphs: [] } };
}

const B = { bl: 1 };
const SEP = "   |   ";
const md = univerDocToMarkdown(
  snapshot([
    [["Nomenclature Core", { bl: 1, fs: 26 }]],
    [["What this is:", B], [" the smallest set, with "], ["one", { it: 1 }], [" emphasis."]],
    [["\u2022 "], ["first rule"]],
    [["\u2022 "], ["second rule"]],
    [["1. "], ["step one"]],
    [["2. "], ["step two"]],
    [["Ion", B], [SEP], ["Charge", B]],
    [["sodium"], [SEP], ["+1"]],
    [["chloride"], [SEP], ["-1"]],
  ]),
);

describe("univerDocToMarkdown carries the document's markup", () => {
  test("headings", () => expect(md).toMatch(/^# Nomenclature Core/));
  test("bold lead-in", () => expect(md).toContain("**What this is:**"));
  test("italics", () => expect(md).toContain("*one*"));
  test("bullets", () => expect(md).toMatch(/^- first rule\n- second rule$/m));
  test("numbered lists", () => expect(md).toMatch(/^1\. step one\n2\. step two$/m));
  test("tables", () => {
    expect(md).toMatch(/^\| Ion \| Charge \|\n\| --- \| --- \|\n\| sodium \| \+1 \|\n\| chloride \| -1 \|$/m);
  });
});
