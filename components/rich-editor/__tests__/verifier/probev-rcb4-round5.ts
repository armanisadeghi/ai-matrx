import { Editor, getSchema } from "@tiptap/core";
import { marked } from "marked";
import { createRichEditorExtensions } from "/Users/armanisadeghi/code/matrx-frontend/components/rich-editor/core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "/Users/armanisadeghi/code/matrx-frontend/components/rich-editor/core/visual-document";
const ext = createRichEditorExtensions(); const schema = getSchema(ext);
const text = "# Docks\n\nDock | Owner | Status\n--- | --- | ---\nD1 | Dana | ok\nD2 | Luis | late\n\nEnd.\n";
for (const v of ["-", "- n/a", "1. first", "> see", "# 3"]) {
  const load = buildVisualDocument(text, schema); const ed = new Editor({ element: null as any, extensions: ext, content: load.json });
  const base = captureBaseline(ed.state.doc, load.plan);
  let pos = -1, from = 0, to = 0; let row = 0;
  ed.state.doc.descendants((n, p) => { if (n.type.name === "tableRow") { if (row === 2) { const cell = n.firstChild!; from = p + 1 + 2; to = from + cell.firstChild!.content.size; } row++; } return true; });
  try { const out = serializeVisualDocument(ed.state.tr.insertText(v, from, to).doc, base); const toks: any = marked.lexer(out); console.log(JSON.stringify(v), JSON.stringify(out.split("\n")[5]), toks.map((t: any) => t.type).join(",")); } catch (e: any) { console.log(v, "REFUSED", e.message.slice(0, 80)); }
  ed.destroy();
}
