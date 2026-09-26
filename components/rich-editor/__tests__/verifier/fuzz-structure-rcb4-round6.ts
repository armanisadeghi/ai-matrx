import { marked } from "marked";
import { rewriteTableSource } from "/Users/armanisadeghi/code/matrx-frontend/components/rich-editor/core/table-source";
import { parseMarkdownTable } from "/Users/armanisadeghi/code/matrx-frontend/components/mardown-display/blocks/table/parseMarkdownTable";
const alpha = ["a", " ", "\\", "|", "`", "``", "*", "-", ">", "#", "1.", "<!--", "```", "~~~", "\t", " ", "&#124;", "\n", "<div>", "===", "---", ":", "[^1]", "$"];
const tables = [
  "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |",
  "|A|B|C|\n|-|-|-|\n|1|2|3|\n|4||6|",
  "A | B | C\n--- | --- | ---\n1 | 2 | 3\n4 | 5 | 6",
  "| A | B |\n|:--|--:|\n| `x\\|y` | a \\\\| \n| c | d |",
  "| A | B |\n|---|---|",
];
function gfm(md: string) { const toks = marked.lexer(md, { gfm: true }).filter((x: any) => x.type !== "space"); if (toks.length !== 1 || toks[0].type !== "table") return null; const t: any = toks[0]; return [t.header.map((c: any) => c.text), ...t.rows.map((r: any) => r.map((c: any) => c.text))]; }
let refused = 0, bad = 0, n = 0; const ex: string[] = []; const reasons = new Map<string, number>();
let seed = 99; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const rstr = () => { let v = ""; const len = Math.floor(rnd() * 5); for (let k = 0; k < len; k++) v += alpha[Math.floor(rnd() * alpha.length)]; return v; };
for (let it = 0; it < 60000; it++) {
  const table = tables[it % tables.length]!;
  const g = parseMarkdownTable(table); if (!g) continue;
  const headers = [...g.headers]; const rows = g.rows.map(r => [...r]);
  const op = rnd();
  let desc = "";
  if (op < 0.6) { const r = Math.floor(rnd() * (rows.length + 1)); const c = Math.floor(rnd() * headers.length); const v = rstr(); if (r === 0) headers[c] = v; else rows[r - 1]![c] = v; desc = `cell r${r}c${c}=${JSON.stringify(v)}`; }
  else if (op < 0.8) { const row = headers.map(() => rstr()); rows.splice(Math.floor(rnd() * (rows.length + 1)), 0, row); desc = `addrow ${JSON.stringify(row)}`; }
  else if (op < 0.9 && rows.length) { rows.splice(Math.floor(rnd() * rows.length), 1); desc = "delrow"; }
  else { headers.push(rstr() || "New"); rows.forEach(r => r.push(rstr())); desc = "addcol"; }
  n++;
  let out: string;
  try { out = rewriteTableSource(table, { headers, rows }); } catch (e: any) { if (e.name === "TableWriteRefused") { refused++; const k = e.message.replace(/\(.*\)/, "()").slice(0, 90); reasons.set(k, (reasons.get(k) ?? 0) + 1); if (ex.length < 6) ex.push(`REFUSED ${desc} in ${JSON.stringify(table.slice(0, 14))}: ${e.message.slice(0, 200)}`); continue; } throw e; }
  const g1 = gfm(out);
  const want = [headers, ...rows].map(r => r.map(c => c.replace(/\r?\n/g, " ").trim()));
  if (!g1) { bad++; if (ex.length < 14) ex.push(`NOTONE ${desc}\n${out}`); continue; }
  // compare rendered semantics loosely: rows count and neighbour cells unchanged
  if (g1.length !== want.length) { bad++; if (ex.length < 14) ex.push(`ROWCOUNT ${desc} ${g1.length} vs ${want.length}\n${out}`); }
}
console.log({ n, refused, bad }); console.log([...reasons.entries()]); console.log(ex.join("\n"));
