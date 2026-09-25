import "dotenv/config";
import { config } from "dotenv"; config({ path: ".env.local" });
import { connectDirect, loadDbEnv } from "../lib/direct-db";
import { splitContentIntoBlocksV2 } from "../../components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { tokenizeSource } from "@ai-matrx/content-ir/source";
const env = loadDbEnv(); if (!("url" in env) && !("connectionString" in (env as object))) { /* fallthrough */ }
const QUERIES: [string, string][] = [
  ["skill", "select id::text id, body content from skill.definition where id::text like $1"],
  ["fd", "select id::text id, content from admin.feature_docs where id::text like $1"],
  ["note", "select id::text id, content from workbench.notes where id::text like $1"],
  ["chat", "select id::text id, content from chat.message where id::text like $1"],
  ["agent", "select id::text id, messages content from agent.definition where id::text like $1"],
];
function mask(s: string) { return s.replace(/[A-Za-z]/g, "a").replace(/[0-9]/g, "9").slice(0, 70); }
function texts(c: unknown): string[] {
  if (typeof c === "string") return [c];
  const out: string[] = [];
  const walk = (v: unknown) => { if (typeof v === "string") { if (v.length > 20) out.push(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
  walk(c); return out;
}
(async () => {
  const cx = await connectDirect(env as never, "rcb3r-probe");
  for (const prefix of process.argv.slice(2)) {
    for (const [name, sql] of QUERIES) {
      let rows: { id: string; content: unknown }[] = [];
      try { rows = (await cx.query(sql, [prefix + "%"])).rows; } catch (e) { continue; }
      for (const r of rows) texts(r.content).forEach((t, i) => {
        const blocks = splitContentIntoBlocksV2(t);
        const big = blocks.filter((b) => b.type !== "text");
        const islands = tokenizeSource(t).filter((b) => b.kind === "island");
        console.log(`\n== ${name} ${r.id}#${i} len=${t.length}`);
        for (const b of big) {
          const at = t.indexOf(b.content.slice(0, 40));
          console.log(`  SPLIT ${b.type}/${(b as {language?:string}).language ?? ""} len=${b.content.length} at=${at} head=${JSON.stringify(mask(b.content))}`);
        }
        for (const b of islands) console.log(`  ISL ${b.islandType} [${b.start},${b.end}) complete=${b.complete} head=${JSON.stringify(mask(b.raw))}`);
      });
    }
  }
  await (cx as { end: () => Promise<void> }).end();
})();
