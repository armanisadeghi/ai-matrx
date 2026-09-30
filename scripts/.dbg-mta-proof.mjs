// [DBG-mta7] throwaway clone harness — deleted before commit
import pg from "pg";
import fs from "node:fs";
const env = fs.readFileSync("/Users/armanisadeghi/code/matrx-frontend/.env.local", "utf8");
const url = env.split("\n").find((l) => l.startsWith("CLONE_DATABASE_URL="))?.slice(19).replace(/^"|"$/g, "");
if (!url || !url.includes("nwvvyzngqicrmnbuzauy")) throw new Error("not the clone");
const c = new pg.Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ""), ssl: { rejectUnauthorized: false }, statement_timeout: 900000 });
await c.connect();
const [mode] = process.argv.slice(2);
const users = { member: "34ed4fc3-c527-4819-99bf-15c26603b261", admin: "87a6e699-3622-4869-8843-d0867456c0dd", owner: "4cf62e4e-2679-484f-b652-034e697418df", nonmember: "4060701e-706a-4c76-b3ca-0bbc69fa5a14" };
const topics = [
  ["e9df6779-8e0e-45e9-a664-375e7d1ecffd", "consumer-electronics-recycling"],
  ["e9df6779-8e0e-45e9-a664-375e7d1ecffd", "e-waste-recycling-events"],
  ["e9df6779-8e0e-45e9-a664-375e7d1ecffd", "general-recycling-and-material-disposal"],
  ["e9df6779-8e0e-45e9-a664-375e7d1ecffd", "it-asset-disposition-itad"],
  ["9017401c-701e-48de-a54a-3f63d21ea7fe", "data-destruction-services"],
  ["3983a2b9-2923-4755-8873-fac1602ed772", "prp-therapy"],
];
async function as(uid, fn, args) {
  const c = new pg.Client({ connectionString: url.replace(/[?\&]sslmode=[^\&]*/, ""), ssl: { rejectUnauthorized: false } });
  c.on("error", () => {});
  await c.connect();
  try { return await as1(c, uid, fn, args); } catch (e) { return { err: e.code ?? String(e.message).slice(0, 40) }; } finally { c.end().catch(() => {}); }
}
async function as1(c, uid, fn, args) {
  await c.query("begin");
  try {
    await c.query("set local statement_timeout = '15min'");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const t0 = performance.now();
    const r = await c.query(`select ${fn} as r`, args);
    return { ms: Math.round(performance.now() - t0), r: r.rows[0].r };
  } catch (e) { return { err: e.code }; } finally { await c.query("rollback"); }
}
if (mode === "equiv") {
  const who = process.argv[3];
  for (const [m, s] of topics) for (const k of [null, ["pages"], ["keywords"], []]) {
    const o = await as(users[who], "seo._dbg_old_mta($1,$2,$3)", [m, s, k]);
    const n = await as(users[who], "seo.map_topic_associations($1,$2,$3)", [m, s, k]);
    const same = JSON.stringify(o.r) === JSON.stringify(n.r) && o.err === n.err;
    console.log(who, s, k ? k.join(",") || "[]" : "ALL", "old", o.err ?? `${o.r.length} rows ${o.ms}ms`, "new", n.err ?? `${n.r.length} rows ${n.ms}ms`, same ? "IDENTICAL" : "DIFFERENT");
  }
}
if (mode === "paged") {
  const who = process.argv[3]; const size = Number(process.argv[4] ?? 100);
  for (const [m, s] of topics.slice(0, 4)) {
    const o = await as(users[who], "seo._dbg_old_mta($1,$2,$3)", [m, s, null]);
    if (o.err) { console.log(who, s, "refused", o.err); continue; }
    const first = await as(users[who], "seo.map_topic_associations($1,$2,null,$3)", [m, s, size + 1]);
    const byKind = new Map();
    for (const row of first.r) { const k = row.association.kind; (byKind.get(k) ?? byKind.set(k, []).get(k)).push(row); }
    const all = []; let calls = 1; let worst = first.ms;
    for (const [k, rows] of byKind) {
      let page = rows;
      for (;;) {
        const shown = page.slice(0, size); all.push(...shown);
        if (page.length <= size) break;
        const nx = await as(users[who], "seo.map_topic_associations($1,$2,$3,$4,$5)", [m, s, [k], size + 1, shown[shown.length - 1].association.cursor]);
        calls++; worst = Math.max(worst, nx.ms); page = nx.r;
      }
    }
    const strip = all.map((r) => { const { cursor, ...a } = r.association; return { ...r, association: a }; });
    console.log(who, s, `first page ${first.ms}ms (${first.r.length} rows)`, `walked ${calls} calls, slowest ${worst}ms`, JSON.stringify(strip) === JSON.stringify(o.r) ? "UNION == OLD" : `DIFFERENT ${strip.length} vs ${o.r.length}`);
  }
}
if (mode === "timing") {
  const who = process.argv[3]; const size = Number(process.argv[4] ?? 101);
  for (const [m, s] of topics.slice(0, 4)) {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push((await as(users[who], "seo.map_topic_associations($1,$2,null,$3)", [m, s, size])).ms);
    const full = await as(users[who], "seo.map_topic_associations($1,$2)", [m, s]);
    console.log(who, s, "paged(", size, ") warm ms", runs.join("/"), "| unpaged", full.ms, "ms");
  }
}
if (mode === "explain") {
  const who = process.argv[3]; const q = process.argv[4];
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: users[who], role: "authenticated" })]);
  const r = await c.query(`explain (analyze, buffers, format text) ${q}`);
  console.log(r.rows.map((x) => x["QUERY PLAN"]).join("\n"));
  await c.query("rollback");
}
if (mode === "exec") { await c.query(fs.readFileSync(process.argv[3], "utf8")); console.log("exec ok"); }
if (mode === "tree") {
  const crypto = await import("node:crypto");
  for (const who of ["member", "admin", "nonmember"]) for (const [m, inc, site] of [
    ["e9df6779-8e0e-45e9-a664-375e7d1ecffd", ["description", "status", "counts", "facets"], null],
    ["e9df6779-8e0e-45e9-a664-375e7d1ecffd", ["counts"], "d0aff5b6-0710-4848-8304-164db3c80ab7"],
    ["9017401c-701e-48de-a54a-3f63d21ea7fe", ["description", "status", "counts", "facets"], null],
  ]) {
    const r = await as(users[who], "seo.map_tree($1,null,null,$2,$3)", [m, inc, site]);
    console.log("tree", process.argv[3], who, m.slice(0, 4), inc.join("+"), site ? "site" : "all", r.err ?? `${r.ms}ms md5=${crypto.createHash("md5").update(JSON.stringify(r.r)).digest("hex")}`);
  }
}
if (mode === "diag") { for (let i=0;i<3;i++) { const r = await as(users[process.argv[3]], "seo.map_diagnostics($1,null,1)", ["e9df6779-8e0e-45e9-a664-375e7d1ecffd"]); console.log("diag", r.err ?? r.ms + "ms"); } }
await c.end();
if (mode === "one") {
  const [, who, fn, m, s, kinds, lim] = process.argv.slice(2);
  const args = [m, s, kinds === "ALL" ? null : kinds.split(",")];
  const call = fn === "old" ? "seo._dbg_old_mta($1,$2,$3)" : lim ? `seo.map_topic_associations($1,$2,$3,${Number(lim)})` : "seo.map_topic_associations($1,$2,$3)";
  const r = await as(users[who], call, args);
  console.log(who, fn, s, kinds, lim ?? "", r.err ?? `${r.r.length} rows ${r.ms}ms md5=${(await import("node:crypto")).createHash("md5").update(JSON.stringify(r.r)).digest("hex")}`);
}
