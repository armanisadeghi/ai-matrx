import { Editor, getSchema } from "@tiptap/core";
import { marked } from "marked";
import fs from "node:fs";
import { createRichEditorExtensions } from "/Users/armanisadeghi/code/matrx-frontend/components/rich-editor/core/extensions";
import { buildVisualDocument, captureBaseline, serializeVisualDocument } from "/Users/armanisadeghi/code/matrx-frontend/components/rich-editor/core/visual-document";
const ext = createRichEditorExtensions(); const schema = getSchema(ext);
const text = fs.readFileSync(process.argv[2], "utf8");
const alpha = ["a", " ", "\\", "|", "`", "*", "_", "\\|", "<", "$", "[", "]", "-", "#", ">", "1.", "~", "&"];
let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const load = buildVisualDocument(text, schema); const ed = new Editor({ element: null as any, extensions: ext, content: load.json });
const base = captureBaseline(ed.state.doc, load.plan);
const cells: Array<{ from: number; to: number }> = [];
ed.state.doc.descendants((n, p) => { if (n.type.name === "tableCell" || n.type.name === "tableHeader") { const from = p + 2; cells.push({ from, to: from + (n.firstChild?.content.size ?? 0) }); } return true; });
const tables0 = marked.lexer(text).filter((t: any) => t.type === "table").length;
let refused = 0, broken = 0; const ex: string[] = [];
for (let i = 0; i < 3000; i++) {
  const c = cells[Math.floor(rnd() * cells.length)]!;
  let v = ""; const len = 1 + Math.floor(rnd() * 5); for (let k = 0; k < len; k++) v += alpha[Math.floor(rnd() * alpha.length)];
  const tr = rnd() < 0.5 ? ed.state.tr.insertText(v, c.to) : ed.state.tr.insertText(v, c.from, c.to);
  try { const out = serializeVisualDocument(tr.doc, base); const toks: any[] = marked.lexer(out); const tabs = toks.filter(t => t.type === "table"); const rowsBefore = marked.lexer(text).filter((t: any) => t.type === "table").map((t: any) => t.rows.length).join(); const rowsAfter = tabs.map(t => t.rows.length).join();
    if (tabs.length !== tables0 || rowsBefore !== rowsAfter) { broken++; if (ex.length < 10) ex.push(`BROKEN ${JSON.stringify(v)} rows ${rowsBefore} -> ${rowsAfter}`); }
  } catch (e: any) { if (e.name === "TableWriteRefused") { refused++; if (ex.length < 10) ex.push(`REFUSED ${JSON.stringify(v)}: ${e.message.slice(0, 140)}`); } else throw e; }
}
console.log({ cells: cells.length, refused, broken }); console.log(ex.join("\n"));
