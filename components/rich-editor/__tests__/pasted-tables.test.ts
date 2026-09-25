/**
 * A pasted table keeps its columns — every value stays under its own header.
 *
 * SUT: both paste paths — the Source view's converter (`htmlToMarkdown`) and
 * the Visual view's own paste (ProseMirror `pasteHTML` through the editor's
 * plugins, i.e. `transformPastedHTML` → the schema's table rules → the
 * serializer). Fixtures: real clipboard shapes from Wikipedia, Google Docs,
 * Notion, Google Sheets, Excel, Word and a plain web table
 * (fixtures/pasted-tables.ts). A `<p>` in a Wikipedia header cell used to
 * become a second cell and shift every following value one column right
 * (verify-RC-B4 R2-1).
 */
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { createRichEditorExtensions } from "../core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "../core/visual-document";
import { htmlToMarkdown } from "../core/html-to-markdown";
import { normalizePastedHtml } from "../core/paste-html";
import { PASTED_TABLES, type PastedTableFixture } from "./fixtures/pasted-tables";

const notices: string[] = [];
const extensions = createRichEditorExtensions({ onPasteNotice: (message) => notices.push(message) });
const schema = getSchema(extensions);
const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
  notices.length = 0;
});
beforeAll(() => {
  if (typeof globalThis.ClipboardEvent === "undefined") {
    (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
      readonly clipboardData = null;
    };
  }
});

/** The table's rows as cell texts (unescaped pipes split cells; edge pipes dropped). */
function tableRows(markdown: string): string[][] {
  const lines = markdown.split("\n").filter((line) => line.trim().startsWith("|"));
  return lines
    .filter((_line, index) => index !== 1) // the delimiter row
    .map((line) => {
      const cells = line.trim().split(/(?<!\\)\|/);
      return cells.slice(1, cells.length - 1).map((cell) => cell.trim());
    });
}

function assertColumns(markdown: string, fixture: PastedTableFixture): void {
  const rows = tableRows(markdown);
  expect(rows).toHaveLength(fixture.rows);
  for (const row of rows) expect(row).toHaveLength(fixture.columns);
  for (const { row, column, text } of fixture.expect) expect(rows[row]?.[column]).toBe(text);
}

function pasteIntoVisual(html: string): string {
  const { json, plan } = buildVisualDocument("Before the table.", schema);
  const editor = new Editor({ element: document.createElement("div"), extensions, content: json as JSONContent });
  editors.push(editor);
  const baseline = captureBaseline(editor.state.doc, plan);
  editor.commands.focus("end");
  editor.commands.enter();
  editor.view.pasteHTML(html);
  return serializeVisualDocument(editor.state.doc, baseline);
}

describe("pasted tables keep every value in its column", () => {
  for (const fixture of PASTED_TABLES) {
    describe(fixture.name, () => {
      it("Source view (HTML → markdown converter)", () => {
        assertColumns(htmlToMarkdown(fixture.html, schema), fixture);
      });

      it("Visual view (the editor's own paste)", () => {
        const saved = pasteIntoVisual(fixture.html);
        expect(saved.startsWith("Before the table.")).toBe(true);
        assertColumns(saved, fixture);
      });

      it("merged cells are counted, and the Visual paste says so", () => {
        expect(normalizePastedHtml(fixture.html).mergedCellsSplit).toBe(fixture.mergedCellsSplit);
        pasteIntoVisual(fixture.html);
        if (fixture.mergedCellsSplit > 0) expect(notices.join(" ")).toMatch(/merged table cell/);
        else expect(notices).toEqual([]);
      });
    });
  }

  it("HTML without a table passes through untouched", () => {
    const html = "<p>Just <b>text</b>.</p>";
    expect(normalizePastedHtml(html)).toEqual({ html, mergedCellsSplit: 0, tables: 0 });
  });
});
