#!/usr/bin/env node
// pnpm perf:data [--doors] [--pages] [--calls 30] [--installs 3] [--base http://s96c6068c.localhost:3001] [--json out.json]
// Prints door latency and page load against scripts/perf-data/budgets.json. Warns, never blocks (exit 0 always).
import fs from "node:fs";
import { measureDoors } from "./doors.mjs";
import { measurePages } from "./pages.mjs";
import { signIn, UA, table, verdict, budgets } from "./lib.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? true : process.argv[i + 1]); };
const wantDoors = arg("doors", false) || !arg("pages", false);
const wantPages = arg("pages", false) || !arg("doors", false);
const calls = Number(arg("calls", 30)), installs = Number(arg("installs", 3));
const base = String(arg("base", "http://localhost:3001")).replace(/\/$/, "");
const report = { at: new Date().toISOString(), base, doors: [], pages: [] };

try {
  let fixtures = null;
  if (wantDoors) {
    console.log(`\nStore doors, ${calls} calls each, through PostgREST as admin@admin.com`);
    const d = await measureDoors({ calls, installs });
    fixtures = d.fixtures;
    report.doors = d.results;
    console.log("");
    table(d.results.map((r) => ({ door: r.door, calls: r.calls, p50_ms: r.p50, p95_ms: r.p95, max_ms: r.max, kb: r.kb, budget_p95: r.budget ?? "", verdict: verdict(r.p95, r.budget), errors: r.errors })), ["door", "calls", "p50_ms", "p95_ms", "max_ms", "kb", "budget_p95", "verdict", "errors"]);
    for (const r of d.results.filter((x) => x.errors)) console.log(`  ! ${r.door}: ${r.firstError}`);
  }
  if (wantPages) {
    // Fixtures for the pages come from the same table the doors use.
    const s = await signIn();
    const h = (schema) => ({ "User-Agent": UA, apikey: s.key, Authorization: `Bearer ${s.token}`, "Content-Type": "application/json", "Content-Profile": schema, "Accept-Profile": schema });
    const rpc = async (fn, b) => JSON.parse(await (await fetch(`${s.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: h("custom"), body: JSON.stringify(b) })).text());
    const home = await rpc("data_home", { p_include_app_tables: false });
    const D = home.items.find((i) => i.table_name === "Deliverables") ?? home.items[0];
    const first = await rpc("read_records_page", { p_organization_id: D.organization_id, p_table_id: D.table_id, p_limit: 1 });
    const views = await rpc("views", { p_organization_id: D.organization_id, p_table_id: D.table_id });
    // A board view: scan the first tables of the home list for one whose saved view lays out as a board.
    let boardViewId, boardTableId, boardNeedle;
    const tables = home.tables ?? [];
    for (let i = 0; i < tables.length && !boardViewId; i += 10) {
      await Promise.all(tables.slice(i, i + 10).map(async (t) => {
        if (boardViewId) return;
        const vs = await rpc("views", { p_organization_id: t.organization_id, p_table_id: t.table_id }).catch(() => null);
        const b = Array.isArray(vs) ? vs.find((v) => ["kanban", "board", "pipeline"].includes(v.definition?.layout)) : null;
        if (!b || boardViewId) return;
        const pg = await rpc("read_records_page", { p_organization_id: t.organization_id, p_table_id: t.table_id, p_limit: 1 }).catch(() => null);
        const title = pg?.rows?.[0]?.document?.title ?? pg?.rows?.[0]?.document?.name;
        if (title && !boardViewId) { boardViewId = b.view_id; boardTableId = t.table_id; boardNeedle = title; }
      }));
    }
    const fx = { homeNeedle: null, boardViewId, boardTableId, boardNeedle, table: D.table_name, tableId: D.table_id, recordId: first.rows[0].id, recordTitle: first.rows[0].document.title, spacePath: arg("space", null) || null };
    console.log(`\nPage load against ${base} (${/localhost|127\.0\.0\.1/.test(base) ? "dev server: numbers include on-demand compiles" : "production build"})`);
    report.pages = await measurePages({ base, fixtures: fx });
    console.log("");
    table(report.pages.map((r) => ({ page: r.page, pass: r.pass ?? "", server_html_rows: r.server_html_rows ?? "", ttfb_ms: r.ttfb_ms ?? "", lcp_ms: r.lcp_ms ?? "", hydration_start_ms: r.hydration_start_ms ?? "", calls_before_rows: r.calls_before_rows ?? "", rows_visible_ms: r.rows_visible_ms ?? r.note ?? "", all_store_calls: r.all_store_calls ?? "", store_calls: r.store_calls ?? "", budget_rows: r.budget?.rows_visible_ms ?? "", verdict: r.pass === "warm" ? verdict(Number(r.rows_visible_ms), r.budget?.rows_visible_ms) : "" })), ["page", "pass", "server_html_rows", "ttfb_ms", "lcp_ms", "hydration_start_ms", "calls_before_rows", "rows_visible_ms", "all_store_calls", "store_calls", "budget_rows", "verdict"]);
  }
  const warns = [...report.doors.filter((r) => verdict(r.p95, r.budget) === "WARN"), ...report.pages.filter((r) => r.pass === "warm" && verdict(Number(r.rows_visible_ms), r.budget?.rows_visible_ms) === "WARN")];
  console.log(`\n${warns.length} over budget (warning only).`);
  const out = arg("json", null);
  if (out && out !== true) fs.writeFileSync(out, JSON.stringify(report, null, 2));
} catch (e) {
  console.log(`perf-data could not finish: ${e.message}`);
}
process.exit(0);
