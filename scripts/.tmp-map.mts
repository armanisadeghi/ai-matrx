import { Lexer } from "marked";
import { tokenizeSource } from "@ai-matrx/content-ir/source";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { readCorpusSource } from "./lib/rich-content-corpus";
import { withPlaceholders } from "../components/rich-editor/core/placeholders";
const env = loadDbEnv() as any; const cx = await connectDirect(env, "dbg");
await cx.query("set session characteristics as transaction read only");
const causes = new Map<string, number>(); let shown = 0;
for await (const row of readCorpusSource(cx, "notes")) {
  for (const b of tokenizeSource(row.text)) {
    if (b.kind !== "prose" || b.raw.includes("\r")) continue;
    const { text } = withPlaceholders(b);
    const toks = new Lexer({ gfm: true }).lex(text);
    const joined = toks.map(t => t.raw).join("");
    if (joined === text) continue;
    let d = 0; while (d < text.length && text[d] === joined[d]) d++;
    const ch = text.charCodeAt(d); const jch = joined.charCodeAt(d);
    const key = `text ${ch} vs joined ${jch} lenDiff ${text.length - joined.length}`;
    causes.set(key, (causes.get(key) ?? 0) + 1);
    if (shown < 3 && ch === 9) { shown++; }
  }
}
console.log([...causes].sort((a,b)=>b[1]-a[1]).slice(0,15));
await cx.end();
