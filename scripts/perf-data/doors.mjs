// Store door latency: p50 / p95 over N calls through PostgREST, the way the browser calls it.
import { signIn, UA, pct, budgets, env } from "./lib.mjs";

export async function measureDoors({ calls = 30, installs = 3, log = console.log } = {}) {
  const s = await signIn();
  const hdr = (schema) => ({ "User-Agent": UA, apikey: s.key, Authorization: `Bearer ${s.token}`, "Content-Type": "application/json", "Content-Profile": schema, "Accept-Profile": schema });
  const rpc = async (schema, fn, body) => {
    const t = performance.now();
    const r = await fetch(`${s.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: hdr(schema), body: JSON.stringify(body) });
    const text = await r.text();
    return { ms: performance.now() - t, status: r.status, bytes: text.length, text };
  };

  // Realistic fixtures: the Deliverables table in Holloway Creative, found through the data home.
  const home = JSON.parse((await rpc("custom", "data_home", { p_include_platform_tables: false })).text);
  const D = home.items.find((i) => i.table_name === "Deliverables") ?? home.items[0];
  const org = D.organization_id, tableId = D.table_id;
  const ws = home.items.find((i) => i.organization_name === "admin's Workspace");
  const first = JSON.parse((await rpc("custom", "read_records_page", { p_organization_id: org, p_table_id: tableId, p_limit: 1 })).text);
  const recordId = first.rows[0].id;
  const views = JSON.parse((await rpc("custom", "views", { p_organization_id: org, p_table_id: tableId })).text);
  const sortSpec = views[0]?.definition?.sorts ?? [];
  const relationField = env.PERF_RELATION_FIELD_ID ?? "7997bcca-e6e4-4058-9086-8dfaf7cd5dd9"; // Deliverables.client
  const clientIds = [...new Set(JSON.parse((await rpc("custom", "read_records_page", { p_organization_id: org, p_table_id: tableId, p_limit: 50 })).text).rows.map((r) => r.document.client).filter(Boolean))];

  const doors = [
    ["custom.data_home", "custom", "data_home", { p_include_platform_tables: false }],
    ["custom.read_records_page (first 50)", "custom", "read_records_page", { p_organization_id: org, p_table_id: tableId, p_limit: 50, p_offset: 0 }],
    ["custom.read_records_page (sorted+search)", "custom", "read_records_page", { p_organization_id: org, p_table_id: tableId, p_limit: 50, p_offset: 0, p_search: "email", p_sort: sortSpec }],
    ["custom.views", "custom", "views", { p_organization_id: org, p_table_id: tableId }],
    ["custom.relation_words_with_icons_many", "custom", "relation_words_with_icons_many", { p_organization_id: org, p_field_id: relationField, p_record_ids: clientIds }],
    ["custom.record_aggregate", "custom", "record_aggregate", { p_organization_id: org, p_table_id: tableId, p_group_by: ["kind"], p_measures: [{ op: "sum", key: "price" }], p_limit: 200 }],
    ["platform.drill_rows", "platform", "drill_rows", { p_organization_id: org, p_source: { kind: "table", id: tableId }, p_question: null }],
    // The one-record write patches a field to the value it already holds: a real write, no junk left behind.
    ["custom.record_update (one record)", "custom", "record_update", { p_organization_id: org, p_record_id: recordId, p_patch: { hours: first.rows[0].document.hours } }],
  ];

  const results = [];
  for (const [name, schema, fn, body] of doors) {
    await rpc(schema, fn, body); // warm-up, not counted
    const ms = [], bad = [];
    let bytes = 0;
    for (let i = 0; i < calls; i++) {
      const r = await rpc(schema, fn, body);
      if (r.status >= 300) bad.push(`${r.status} ${r.text.slice(0, 120)}`);
      ms.push(r.ms); bytes = r.bytes;
    }
    ms.sort((a, b) => a - b);
    results.push({ door: name, calls, p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), max: Math.round(ms[ms.length - 1]), kb: +(bytes / 1024).toFixed(1), errors: bad.length, firstError: bad[0] ?? "", budget: budgets.doors[name]?.p95_ms });
    log(`  ${name}: p50 ${results.at(-1).p50} ms, p95 ${results.at(-1).p95} ms`);
  }

  // template_install: a multi-step door that resumes until done. Each install is removed again, in the admin workspace.
  if (installs > 0 && ws) {
    const tpl = env.PERF_TEMPLATE_ID ?? "9bce1178-693c-4da4-852d-c4bca7912220"; // T0016
    results.push(...(await measureInstalls({ rpc, orgId: ws.organization_id, templateId: tpl, installs, log, budgets })));
  } else if (installs > 0) {
    log("  template_install: SKIPPED - no workspace named \"admin's Workspace\" in the data home");
  }
  return { results, fixtures: { org, tableId, recordId, table: D.table_name } };
}

const parse = (text) => { try { return JSON.parse(text); } catch { return { _unparsed: String(text).slice(0, 160) }; } };

/**
 * The template_install rows. Never throws: an install that cannot run (the door refused, answered something that
 * is not JSON, or threw) becomes ONE named skip row so the report prints, and what was installed is still removed.
 * Each step logs as it finishes - three installs take ~3 minutes and used to say nothing until the end.
 */
export async function measureInstalls({ rpc, orgId, templateId, installs, log = console.log, budgets = {} }) {
  const firstMs = [], totalMs = [];
  const skip = (why) => {
    log(`  template_install: SKIPPED after ${firstMs.length}/${installs} - ${why}`);
    return [{ door: "custom.template_install", calls: firstMs.length, p50: 0, p95: 0, max: 0, kb: 0, errors: 1, firstError: `skipped: ${why}`, budget: undefined }];
  };
  for (let i = 0; i < installs; i++) {
    let installId;
    try {
      const t0 = performance.now();
      let r = await rpc("custom", "template_install", { p_organization_id: orgId, p_template_id: templateId });
      let ans = parse(r.text), guard = 0;
      if (r.status >= 400 || ans?.code || ans?._unparsed) return skip(`install ${i + 1} answered ${r.status} ${ans?.message ?? ans?.code ?? ans?._unparsed ?? ""}`.trim());
      firstMs.push(r.ms);
      while (ans && ans.done === false && guard++ < 30) { r = await rpc("custom", "template_install", { p_organization_id: orgId, p_template_id: templateId }); ans = parse(r.text); }
      totalMs.push(performance.now() - t0);
      installId = ans?.install_id ?? ans?.install?.id ?? ans?.id;
      log(`  template_install ${i + 1}/${installs}: first call ${Math.round(firstMs.at(-1))} ms, whole install ${Math.round(totalMs.at(-1))} ms`);
      if (!installId) return skip(`install ${i + 1} gave no install id (keys: ${Object.keys(ans ?? {}).join(",")}); nothing to remove`);
      let u = parse((await rpc("custom", "template_uninstall", { p_organization_id: orgId, p_install_id: installId })).text), g = 0;
      while (u && u.done === false && g++ < 30) u = parse((await rpc("custom", "template_uninstall", { p_organization_id: orgId, p_install_id: installId })).text);
    } catch (e) {
      return skip(`install ${i + 1} threw: ${e?.message ?? e}`);
    }
  }
  const f = [...firstMs].sort((a, b) => a - b), t = [...totalMs].sort((a, b) => a - b);
  return [
    { door: "custom.template_install (first call)", calls: installs, p50: Math.round(pct(f, 50)), p95: Math.round(pct(f, 95)), max: Math.round(f.at(-1)), kb: 0, errors: 0, firstError: "", budget: budgets.doors?.["custom.template_install (first call)"]?.p95_ms },
    { door: "custom.template_install (whole install)", calls: installs, p50: Math.round(pct(t, 50)), p95: Math.round(pct(t, 95)), max: Math.round(t.at(-1)), kb: 0, errors: 0, firstError: "", budget: undefined },
  ];
}
