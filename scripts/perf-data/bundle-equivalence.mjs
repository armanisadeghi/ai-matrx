#!/usr/bin/env node
// pnpm perf:bundle — PAGE-BUNDLE equivalence on the live store, as admin@admin.com:
// custom.table_page_bundle answers, for each part, exactly what that part's own door answers for the
// same arguments. Exit 1 on any difference. Also prints the bundle's call time next to the sum of the doors'.
import { signIn, UA } from "./lib.mjs";

// Parts the bundle computes itself: they are knob reads (platform.knob_resolve), not a door in the `custom`
// schema, so there is no single door to compare them with. Skipped by name, never silently: each is printed.
export const BUNDLE_ONLY_PARTS = new Set(["server_rows"]);
export const isBundleOnlyPart = (p) => BUNDLE_ONLY_PARTS.has(p.door);

if (process.argv.includes("--self-test")) {
  const ok = isBundleOnlyPart({ door: "server_rows" }) && !isBundleOnlyPart({ door: "views" });
  console.log(ok ? "self-test ok: server_rows is bundle-only, views is a door" : "self-test FAILED");
  process.exit(ok ? 0 : 1);
}

const s = await signIn();
const h = { "User-Agent": UA, apikey: s.key, Authorization: `Bearer ${s.token}`, "Content-Type": "application/json", "Content-Profile": "custom", "Accept-Profile": "custom" };
const rpc = async (fn, body) => {
  const t = Date.now();
  const r = await fetch(`${s.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  return { status: r.status, json: JSON.parse(await r.text()), ms: Date.now() - t };
};
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

const home = (await rpc("data_home", { p_include_app_tables: false })).json;
const tables = (home.items ?? []).slice(0, Number(process.argv[2] ?? 6));
let bad = 0;
for (const t of tables) {
  const b = await rpc("table_page_bundle", { p_organization_id: t.organization_id, p_table_id: t.table_id, p_view_id: null });
  if (b.status !== 200) { console.log(`FAIL ${t.table_name}: bundle ${b.status} ${canon(b.json).slice(0, 200)}`); bad++; continue; }
  let sum = 0, same = 0;
  let skipped = 0;
  for (const p of b.json.parts) {
    if (isBundleOnlyPart(p)) { skipped++; console.log(`  ${t.table_name}: part ${p.door} is bundle-only (a knob read, no door) - skipped`); continue; }
    const one = await rpc(p.door, p.args);
    if (p.door === "views" && Array.isArray(p.data)) {
      // PERF-REVIEW-FIX 2: views come back in a total order - name, the default view first, then id.
      const key = (v) => [v.name, v.definition?.is_default === true ? 0 : 1, v.view_id];
      const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
      if (p.data.some((v, i) => i > 0 && cmp(p.data[i - 1], v) > 0)) { console.log(`DIFF ${t.table_name} views are not in (name, default, id) order`); bad++; }
    }
    sum += one.ms;
    if (p.error) { console.log(`  ${t.table_name}: part ${p.door} refused inside the bundle (${p.error}); its own door answered ${one.status}`); if (one.status === 200) bad++; continue; }
    if (one.status !== 200 || canon(one.json) !== canon(p.data)) { console.log(`DIFF ${t.table_name} ${p.door}\n  door:   ${canon(one.json).slice(0, 240)}\n  bundle: ${canon(p.data).slice(0, 240)}`); bad++; } else same++;
  }
  console.log(`${bad ? "!!" : "ok"} ${t.table_name}: ${same}/${b.json.parts.length - skipped} door parts identical; bundle ${b.ms} ms vs ${sum} ms for the doors one after another`);
}
console.log(bad ? `\n${bad} difference(s)` : "\nbundle = the sum of the single doors");
process.exit(bad ? 1 : 0);
