import { marked } from "marked";
import { rewriteTableSource } from "/Users/armanisadeghi/code/matrx-frontend/components/rich-editor/core/table-source";
import { parseMarkdownTable } from "/Users/armanisadeghi/code/matrx-frontend/components/mardown-display/blocks/table/parseMarkdownTable";
const t = "Dock | Owner | Status\n--- | --- | ---\nD1 | Dana | ok\nD2 | Luis | late";
const g = parseMarkdownTable(t)!; console.log("parsed", !!g);
for (const v of ["-", "- n/a", "1. first", "# 3", "> see", "+", "D2"]) {
  const rows = g.rows.map(r => [...r]); rows[1]![0] = v;
  try { const out = rewriteTableSource(t, { headers: g.headers, rows }); const tok: any = marked.lexer(out, { gfm: true }); console.log(JSON.stringify(v), "->", JSON.stringify(out.split("\n")[3]), "| tokens:", tok.map((x: any) => x.type).join(","), "| table rows:", tok.find((x: any) => x.type === "table")?.rows.length); } catch (e: any) { console.log(v, "REFUSED", e.message.slice(0, 100)); }
}
