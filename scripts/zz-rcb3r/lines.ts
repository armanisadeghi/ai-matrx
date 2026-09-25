import { connectDirect, loadDbEnv } from "../lib/direct-db";
const [id, table, col, idx, from, to] = process.argv.slice(2);
function mask(s: string) {
  return s.replace(/(<\/?)([A-Za-z_][\w-]*)|([A-Za-z]+)/g, (m, lt, tag, word) => lt ? lt + tag : "a".repeat(Math.min(word.length, 6)));
}
function texts(c: unknown): string[] { if (typeof c === "string") return [c]; const out: string[] = []; const walk = (v: unknown) => { if (typeof v === "string") { if (v.length > 20) out.push(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); }; walk(c); return out; }
(async () => {
  const cx = await connectDirect(loadDbEnv() as never, "rcb3r-lines");
  const r = (await cx.query(`select ${col} c from ${table} where id::text like $1`, [id + "%"])).rows[0];
  const t = texts(r.c)[Number(idx)];
  const lines = t.split("\n");
  let off = 0;
  lines.forEach((l, i) => { if (off + l.length >= Number(from) && off <= Number(to)) console.log(String(i).padStart(4), String(off).padStart(6), JSON.stringify(mask(l)).slice(0, 160)); off += l.length + 1; });
  await (cx as unknown as { end: () => Promise<void> }).end();
})();
