/**
 * LANE STORE-RESTORE-DOORS — headless walk on the LIVE site (www.aimatrx.com), as admin@admin.com.
 *
 * Use case: the office manager of Harbor Dental Group (an organization admin@admin.com owns) keeps a
 * disposable "Sterilizer maintenance log" Table. She removes a column, a cross-column Rule, a link
 * between two log entries, a document template and a dashboard, each on its own, and an archived
 * mandate of hers is waiting in Trash — then she finds each on /trash under its own kind and brings it
 * back with Restore; the dashboard goes once more and comes back through Organization settings -> Trash.
 * Every item is made here through the store's own doors as admin, and archived again at the end
 * (archive, never delete). Credentials come from .env.local and are never printed. Screenshots:
 *   common-docs/operations/for-arman/2026-09-26/store-restore-doors/
 *
 *   node scripts/storerestoredoors-walk.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { signIn, until } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "https://www.aimatrx.com";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-26/store-restore-doors";
const ORG_SLUG = "harbor-dental-group";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
if (authErr) throw authErr;
const ME = auth.user.id;
check("API seat is admin@admin.com", auth.user.email === "admin@admin.com", auth.user.email);
const custom = sb.schema("custom");
const rpc = async (fn, args, schema = "custom") => {
  const { data, error } = await sb.schema(schema).rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message} ${error.hint ?? ""}`);
  return data;
};
const idOf = (x) => (typeof x === "string" ? x : x?.id ?? x?.record_id ?? x?.table_id);
const { data: orgs } = await sb.schema("iam").from("organizations").select("id, name").eq("slug", ORG_SLUG);
const ORG = orgs?.[0]?.id;
check("Harbor Dental Group resolved", !!ORG, ORG);
const HOME = process.env.WALK_ORG_HOME ?? "5588aafe-0fdd-4fa4-8ba4-8cbb2332cf74";

const inTrash = async (kind, id) => {
  const { data } = await sb.rpc("trash_list", { p_kinds: [kind], p_limit: 1000, p_offset: 0 });
  return (data ?? []).find((r) => r.id === id) ?? null;
};

// ── the disposable Table and what hangs off it ───────────────────────────────────────────────
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const NAME = `Sterilizer maintenance log ${stamp}`;
const tableId = idOf(await rpc("table_declare", { p_organization_id: ORG, p_spec: {
  name: NAME, slug: `sterilizer_maintenance_log_${Date.now()}`, type: "entity",
  label_singular: "Log entry", label_plural: "Log entries", title_field: "unit", display: "list",
  weight: "light", ordered: false, row_order: "sorted", agent_writable: true, retention_days: 2555,
  default_sort: [{ field: "unit", direction: "asc" }], parent_id: HOME, fields: [{ name: "unit" }] } }));
const fUnit = idOf(await rpc("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "unit", label: "Unit", type: "text", required: true, sort: 10 } }));
const fTech = idOf(await rpc("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "technician", label: "Technician", type: "text", sort: 20 } }));
const fNote = idOf(await rpc("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "spore_test_note", label: "Spore test note", type: "text", sort: 30 } }));
const r1 = idOf(await rpc("record_write", { p_organization_id: ORG, p_table_id: tableId, p_data: { unit: "Autoclave 2 (Operatory B)", technician: "Dana Whitfield", spore_test_note: "Weekly spore test passed, strip lot 44821" } }));
const r2 = idOf(await rpc("record_write", { p_organization_id: ORG, p_table_id: tableId, p_data: { unit: "Statim 5000 (Hygiene room)", technician: "Luis Ortega", spore_test_note: "Door gasket replaced; retest scheduled Monday" } }));
check("disposable Table with three columns and two log entries made", !!(tableId && fNote && r1 && r2), NAME);
const ruleId = idOf(await rpc("rule_declare", { p_organization_id: ORG, p_rule_id: null, p_spec: {
  name: "Every entry names its unit and technician", kind: "predicate", uses: ["validate"],
  scope_table_id: tableId, applies_to_types: [],
  expr: { op: "and", args: [{ op: "present", args: [{ field: fUnit }] }, { op: "present", args: [{ field: fTech }] }] },
  description: "A log entry is only complete when it says which unit and who checked it." } }));
const relId = idOf(await rpc("relation_carry", { p_organization_id: ORG, p_container_id: r1, p_item_id: r2 }));
const tplId = idOf(await rpc("doc_template_save", { p_organization_id: ORG, p_table_id: tableId, p_template_id: null,
  p_name: "Sterilizer service record", p_body: `Unit: {{field:${fUnit}}}. Checked by {{field:${fTech}}}.` }));
const dashId = idOf(await rpc("dashboard_declare", { p_organization_id: ORG, p_table_id: tableId, p_dashboard_id: null,
  p_name: "Sterilizer checks this month", p_blocks: [], p_presentation: {} }));
check("a Rule, a link, a template and a dashboard made on it", !!(ruleId && relId && tplId && dashId));

// An archived mandate of admin's own, bound only in its own organization (from Trash, then back).
const { data: mands } = await sb.schema("mandate").from("definition")
  .select("id, label, organization_id, deleted_at").eq("created_by", ME).eq("origin", "user")
  .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(20);
let mandate = null;
for (const m of mands ?? []) {
  const { data: foreign } = await sb.schema("mandate").from("binding").select("id").eq("mandate_id", m.id).neq("organization_id", m.organization_id).limit(1);
  if (!foreign?.length && m.label) { mandate = m; break; }
}
check("an archived mandate of admin's own is waiting in Trash", !!mandate && !!(await inTrash("mandate", mandate.id)), mandate?.label ?? "(none)");
writeFileSync(`${OUT}/walk-state.json`, JSON.stringify({ ORG, tableId, fNote, r1, r2, ruleId, relId, tplId, dashId, mandate: mandate?.id }, null, 2));

// ── remove each through its own store door ─────────────────────────────────────────────────
await rpc("field_retire", { p_organization_id: ORG, p_field_id: fNote });
await rpc("record_delete", { p_organization_id: ORG, p_record_id: ruleId });
await rpc("relation_uncarry", { p_organization_id: ORG, p_container_id: r1, p_item_id: r2 });
await rpc("doc_template_delete", { p_organization_id: ORG, p_template_id: tplId });
await rpc("dashboard_delete", { p_organization_id: ORG, p_dashboard_id: dashId });
const relRow = await inTrash("relation", relId);
check("the link is in Trash as '<entry> → <entry>'", /→/.test(relRow?.title ?? ""), relRow?.title ?? "(absent)");

const liveRecord = async (id) => {
  const { data } = await custom.rpc("read_record", { p_organization_id: ORG, p_record_id: id });
  return !!data;
};

// ── the page ────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
check("browser seat is admin@admin.com (the app says so)", who === "admin@admin.com", who);

async function restoreFromTrash({ chip, kind, id, text, shotName, back }) {
  await page.goto(`${ORIGIN}/trash`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const chipBtn = page.getByRole("button", { name: new RegExp(`^${chip}\\s+[\\d,]+$`) }).first();
  const hasChip = await chipBtn.waitFor({ timeout: 90000 }).then(() => true, () => false);
  check(`/trash shows a "${chip}" kind`, hasChip);
  if (!hasChip) { await shot(page, `${shotName}-0-no-chip`); return; }
  await chipBtn.click();
  const row = page.locator("li").filter({ hasText: text }).first();
  const listed = await row.waitFor({ timeout: 60000 }).then(() => true, () => false);
  await shot(page, `${shotName}-1-listed`);
  check(`/trash lists "${text}" under ${chip}`, listed, listed ? (await row.innerText()).replace(/\s+/g, " ").slice(0, 160) : "");
  if (!listed) return;
  await row.getByRole("button", { name: /Restore/ }).click({ timeout: 15000 });
  const gone = await until(`${text} leaves Trash`, async () => !(await inTrash(kind, id)), 30000);
  await page.waitForTimeout(1500);
  await shot(page, `${shotName}-2-after-restore`);
  check(`Restore on /trash takes "${text}" out of Trash`, !!gone.v);
  const ok = await until(`${text} is live again`, back, 30000);
  check(`"${text}" is live again`, !!ok.v);
}

await restoreFromTrash({ chip: "Field", kind: "field", id: fNote, text: `Spore test note (in ${NAME})`, shotName: "a-field",
  back: async () => !(await inTrash("field", fNote)) });
{
  const { data } = await custom.rpc("read_record", { p_organization_id: ORG, p_record_id: r2 });
  const doc = data?.data ?? data?.document ?? data;
  check("the column came back with its values", JSON.stringify(doc ?? {}).includes("Door gasket replaced"), "");
}
await restoreFromTrash({ chip: "Rule", kind: "rule", id: ruleId, text: `Every entry names its unit and technician (in ${NAME})`, shotName: "b-rule",
  back: async () => !(await inTrash("rule", ruleId)) });
await restoreFromTrash({ chip: "Link", kind: "relation", id: relId, text: relRow?.title ?? "→", shotName: "c-link",
  back: async () => !(await inTrash("relation", relId)) });
await restoreFromTrash({ chip: "Document template", kind: "doc_template", id: tplId, text: `Sterilizer service record (in ${NAME})`, shotName: "d-template",
  back: async () => !!(await rpc("doc_template_read", { p_organization_id: ORG, p_template_id: tplId }).catch(() => null)) });
await restoreFromTrash({ chip: "Dashboard", kind: "dashboard", id: dashId, text: `Sterilizer checks this month (in ${NAME})`, shotName: "e-dashboard",
  back: async () => !(await inTrash("dashboard", dashId)) });
if (mandate) {
  await restoreFromTrash({ chip: "Mandate", kind: "mandate", id: mandate.id, text: mandate.label, shotName: "f-mandate",
    back: async () => {
      const { data } = await sb.schema("mandate").from("definition").select("deleted_at").eq("id", mandate.id).maybeSingle();
      return !!data && data.deleted_at === null;
    } });
}

// ── Organization Trash: the dashboard, removed again, comes back from Organization settings ─
await rpc("dashboard_delete", { p_organization_id: ORG, p_dashboard_id: dashId });
await page.goto(`${ORIGIN}/organizations/${ORG_SLUG}/settings#trash`, { waitUntil: "domcontentloaded", timeout: 180000 });
const section = page.locator("section#trash");
await section.waitFor({ timeout: 90000 });
await section.scrollIntoViewIfNeeded();
const OTEXT = `Sterilizer checks this month (in ${NAME})`;
const orow = section.locator("li").filter({ hasText: OTEXT }).first();
const olisted = await orow.waitFor({ timeout: 60000 }).then(() => true, () => false);
await shot(page, "g-1-organization-trash-lists-dashboard");
check(`Organization Trash (Harbor Dental Group) lists "${OTEXT}"`, olisted);
if (olisted) {
  await orow.getByRole("button", { name: /Restore/ }).click({ timeout: 15000 });
  const ogone = await until("dashboard leaves org Trash", async () => !(await inTrash("dashboard", dashId)), 30000);
  await page.waitForTimeout(1500);
  await shot(page, "g-2-organization-trash-after-restore");
  check("Restore in Organization Trash brings the dashboard back", !!ogone.v);
}
await browser.close();

// ── archive, never delete: every disposable goes back to Trash ─────────────────────────────
await rpc("field_retire", { p_organization_id: ORG, p_field_id: fNote });
await rpc("record_delete", { p_organization_id: ORG, p_record_id: ruleId });
await rpc("relation_uncarry", { p_organization_id: ORG, p_container_id: r1, p_item_id: r2 });
await rpc("doc_template_delete", { p_organization_id: ORG, p_template_id: tplId });
await rpc("dashboard_delete", { p_organization_id: ORG, p_dashboard_id: dashId });
if (mandate) await sb.schema("mandate").from("definition").update({ deleted_at: new Date().toISOString() }).eq("id", mandate.id);
const done = await rpc("table_archive", { p_organization_id: ORG, p_table_id: tableId, p_chunk: 50, p_include_table: true });
check("the Table archived again at the end (in Trash as a Table)", !!(await inTrash("table", tableId)), JSON.stringify(done).slice(0, 80));
if (mandate) check("the mandate archived again at the end", !!(await inTrash("mandate", mandate.id)));

writeFileSync(`${OUT}/walk.txt`, results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`).join("\n") + "\n");
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
