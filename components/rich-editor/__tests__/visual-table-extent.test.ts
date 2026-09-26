/**
 * The Visual editor reads a table exactly where THE GFM table rule does
 * (verify-RC-B4 round 9): marked's table tokenizer runs through `tableStartsAt`
 * and `findTableEnd`, so an answer's closing `</artifact>` tag or an indented
 * note under a table is never a table row, a header wider than its delimiter is
 * no table, and the stored bytes still round-trip exactly. Each expected table
 * shape below is what remark-gfm reads (scripts/lib/gfm-table-oracle.ts).
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { createRichEditorExtensions } from "../core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "../core/visual-document";
import { oracleTableGrids } from "@/scripts/lib/gfm-table-oracle";

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);
const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

/** Every table in the visual document: its rows (header included). */
function visualTables(json: JSONContent): number[] {
  const out: number[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "table") out.push((node.content ?? []).length);
    (node.content ?? []).forEach(walk);
  };
  walk(json);
  return out;
}

const HANDOVER = ["| Bay | Status |", "| --- | --- |", "| B3 | re-scan |"];
it.each([
  ["an answer's closing tag under the table", [...HANDOVER, "</artifact>", "", "Signed off."]],
  ["an HTML comment under the table", [...HANDOVER, "<!-- shift note -->", "", "Signed off."]],
  ["an indented note under a pipe-less table", ["Zone | Temp", "--- | ---", "A | 4C", "    B stays closed", "", "Signed off."]],
  ["a header wider than its delimiter", ["| Bay | Status |", "|---|", "| B3 | re-scan |", "", "Signed off."]],
  ["a one-column table with no pipe in its header", ["Notes", "|---|", "Dock B closed", "", "Signed off."]],
  ["a lone | row", [...HANDOVER, "|", "", "Signed off."]],
] as const)("%s", (_label, lines) => {
  const text = lines.join("\n");
  const { json, plan } = buildVisualDocument(text, schema);
  expect(visualTables(json as JSONContent)).toEqual(oracleTableGrids(text).map((grid) => grid.length));
  const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
  editors.push(editor);
  expect(serializeVisualDocument(editor.state.doc, captureBaseline(editor.state.doc, plan))).toBe(text);
});
