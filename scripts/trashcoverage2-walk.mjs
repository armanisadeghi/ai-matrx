/**
 * LANE TRASH-COVERAGE-2 — headless walk on the LIVE site (www.aimatrx.com), as admin@admin.com.
 *
 * Use case: the office manager of Harbor Dental Group (an organization admin@admin.com owns) tidies
 * up — archives an infection-control rulebook, a folder of supplier invoices, a war room, a scope type
 * "Service areas" with its Field "Crew size" — changes their mind, and gets each one back from Trash.
 * Every item is disposable, made here through the product's own doors as admin, and archived again at
 * the end (archive, never delete). The walk proves, per kind:
 *   1. the archived thing is listed in /trash under its kind chip;
 *   2. a child archived with its parent reads "<title> (in <parent>)";
 *   3. Restore on the page brings it back (and the parent with it);
 *   4. Organization settings -> Trash does the same for a child folder.
 * Credentials come from .env.local and are never printed. Screenshots:
 *   common-docs/operations/for-arman/2026-09-26/trash-coverage-2/
 *
 *   node scripts/trashcoverage2-walk.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { signIn, until } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "https://www.aimatrx.com";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-26/trash-coverage-2";
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
const rpc = async (fn, args, schema = "public") => {
  const { data, error } = await sb.schema(schema).rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message} ${error.hint ?? ""}`);
  return data;
};
const { data: orgs } = await sb.schema("iam").from("organizations").select("id, name").eq("slug", ORG_SLUG);
const ORG = orgs?.[0]?.id;
check("Harbor Dental Group resolved", !!ORG, ORG);

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const tag = Date.now().toString(36);
const inTrash = async (kind, id) => {
  const { data } = await sb.rpc("trash_list", { p_kinds: [kind], p_limit: 1000, p_offset: 0 });
  return (data ?? []).find((r) => r.id === id) ?? null;
};
const live = async (schema, table, id) => {
  const { data } = await sb.schema(schema).from(table).select("id, deleted_at").eq("id", id).maybeSingle();
  return !!data && data.deleted_at === null;
};

// ── the disposable items ────────────────────────────────────────────────────────────────────
const RB_NAME = `Infection-control rulebook ${stamp}`;
const rb = await rpc("rulebook_create", {
  p_organization_id: ORG, p_name: RB_NAME, p_slug: `infection-control-${tag}`,
  p_description: "Sterilize, log and spore-test every instrument cycle; retire a failed cycle's load.",
  p_visibility: "personal",
});
const rulebookId = rb?.id ?? rb;
check("disposable rulebook created", !!rulebookId, `${RB_NAME} ${rulebookId}`);

// Folders the way the Files screen's own writes make them (files.folders under RLS, as admin).
async function folderChain(parentName, childName) {
  const { data: p, error: pe } = await sb.schema("files").from("folders")
    .insert({ folder_name: parentName, folder_path: `tc2-${tag}-${parentName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
              created_by: ME, organization_id: ORG }).select("id").single();
  if (pe) throw new Error(`folder ${parentName}: ${pe.message}`);
  const { data: c, error: ce } = await sb.schema("files").from("folders")
    .insert({ folder_name: childName, folder_path: `tc2-${tag}-${parentName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${childName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
              parent_id: p.id, created_by: ME, organization_id: ORG }).select("id").single();
  if (ce) throw new Error(`folder ${childName}: ${ce.message}`);
  return [p.id, c.id];
}
const PARENT = `Supplier invoices ${stamp}`;
const [parentId, leafId] = await folderChain(PARENT, "2026 Q3");
check("disposable folder chain created (Supplier invoices / 2026 Q3)", !!leafId && !!parentId, `${parentId} / ${leafId}`);

const TIMES = `Crew timesheets ${stamp}`;
const [orgParentId, orgLeafId] = await folderChain(TIMES, "September");
check("disposable folder chain created (Crew timesheets / September)", !!orgLeafId && !!orgParentId);

const WR_TITLE = `Q4 fleet contract push ${stamp}`;
const { data: wr, error: wrErr } = await sb.schema("workspace").from("war_rooms")
  .insert({ created_by: ME, title: WR_TITLE, organization_id: ORG, anchor_type: "canvas" }).select("id").single();
check("disposable war room created", !!wr?.id, wrErr?.message ?? WR_TITLE);
const warRoomId = wr?.id;

const ST_PLURAL = `Service areas ${stamp}`;
const st = await rpc("create_scope_type", { p_org_id: ORG, p_label_singular: `Service area ${stamp}`, p_label_plural: ST_PLURAL, p_slug: `service-areas-${tag}` });
const scopeTypeId = st?.id ?? st;
const ci = await rpc("create_context_item", { p_scope_type_id: scopeTypeId, p_key: "crew_size", p_display_name: "Crew size", p_value_type: "number" });
const fieldId = ci?.id ?? ci;
check("disposable scope type with its Field created", !!scopeTypeId && !!fieldId, `${ST_PLURAL} / Crew size`);
writeFileSync(`${OUT}/walk-state.json`, JSON.stringify({ rulebookId, parentId, leafId, orgParentId, orgLeafId, warRoomId, scopeTypeId, fieldId }, null, 2));

// ── archive each through its screen's own door ─────────────────────────────────────────────
await rpc("rulebook_archive", { p_rulebook_id: rulebookId });
await rpc("soft_delete_folder", { p_folder_id: parentId });
await rpc("soft_delete_folder", { p_folder_id: orgParentId });
{ const { error } = await sb.schema("workspace").from("war_rooms").update({ deleted_at: new Date().toISOString() }).eq("id", warRoomId);
  check("war room archived the way its page does", !error, error?.message); }
await rpc("delete_scope_type", { p_type_id: scopeTypeId });

const childRow = await inTrash("folder", leafId);
check("the inner folder is in Trash as '2026 Q3 (in Supplier invoices …)'", childRow?.title === `2026 Q3 (in ${PARENT})`, childRow?.title ?? "(absent)");
const fieldRow = await inTrash("context_item", fieldId);
check("the Field is in Trash as 'Crew size (in Service areas …)'", fieldRow?.title === `Crew size (in ${ST_PLURAL})`, fieldRow?.title ?? "(absent)");

// ── the page ────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
check("browser seat is admin@admin.com (the app says so)", who === "admin@admin.com", who);

async function restoreFromTrash({ chip, text, shotName, back }) {
  await page.goto(`${ORIGIN}/trash`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const chipBtn = page.getByRole("button", { name: new RegExp(`^${chip}`) }).first();
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
  const gone = await until(`${text} leaves Trash`, async () => (await page.locator("li").filter({ hasText: text }).count()) === 0, 30000);
  await shot(page, `${shotName}-2-after-restore`);
  check(`Restore on /trash takes "${text}" out of Trash`, !!gone.v);
  const ok = await until(`${text} is live again`, back, 30000);
  check(`"${text}" is live again`, !!ok.v);
}

await restoreFromTrash({ chip: "Rulebook", text: RB_NAME, shotName: "a-rulebook",
  back: () => live("platform", "rulebook", rulebookId) });
await restoreFromTrash({ chip: "Folder", text: `2026 Q3 (in ${PARENT})`, shotName: "b-folder-in-folder",
  back: async () => (await live("files", "folders", leafId)) && (await live("files", "folders", parentId)) });
await restoreFromTrash({ chip: "War Room", text: WR_TITLE, shotName: "c-war-room",
  back: () => live("workspace", "war_rooms", warRoomId) });
await restoreFromTrash({ chip: "Context Item", text: `Crew size (in ${ST_PLURAL})`, shotName: "d-field-in-scope-type",
  back: async () => (await live("context", "scope_types", scopeTypeId)) && (await live("context", "context_items", fieldId)) });
{
  const { data } = await sb.schema("context").from("context_items").select("is_active").eq("id", fieldId).maybeSingle();
  check("the Field came back in use (is_active)", data?.is_active === true, JSON.stringify(data));
}

// ── Organization Trash: a child folder comes back through its parent ────────────────────────
await page.goto(`${ORIGIN}/organizations/${ORG_SLUG}/settings#trash`, { waitUntil: "domcontentloaded", timeout: 180000 });
const section = page.locator("section#trash");
await section.waitFor({ timeout: 90000 });
await section.scrollIntoViewIfNeeded();
const OTEXT = `September (in ${TIMES})`;
const orow = section.locator("li").filter({ hasText: OTEXT }).first();
const olisted = await orow.waitFor({ timeout: 60000 }).then(() => true, () => false);
await shot(page, "e-1-organization-trash-lists-child-folder");
check(`Organization Trash (Harbor Dental Group) lists "${OTEXT}"`, olisted);
if (olisted) {
  await orow.getByRole("button", { name: /Restore/ }).click({ timeout: 15000 });
  const ogone = await until("row leaves org Trash", async () => (await section.locator("li").filter({ hasText: OTEXT }).count()) === 0, 30000);
  await shot(page, "e-2-organization-trash-after-restore");
  check("Restore in Organization Trash takes it out of Trash", !!ogone.v);
  const ok = await until("both folders live", async () => (await live("files", "folders", orgLeafId)) && (await live("files", "folders", orgParentId)), 30000);
  check("the child folder and its parent are both live again", !!ok.v);
}
await browser.close();

// ── archive, never delete: every disposable goes back to Trash ─────────────────────────────
await rpc("rulebook_archive", { p_rulebook_id: rulebookId });
await rpc("soft_delete_folder", { p_folder_id: parentId });
await rpc("soft_delete_folder", { p_folder_id: orgParentId });
await sb.schema("workspace").from("war_rooms").update({ deleted_at: new Date().toISOString() }).eq("id", warRoomId);
await rpc("delete_scope_type", { p_type_id: scopeTypeId });
const endChecks = await Promise.all([
  inTrash("rulebook", rulebookId), inTrash("folder", parentId), inTrash("folder", orgParentId),
  inTrash("war_room", warRoomId), inTrash("scope_type", scopeTypeId)]);
check("every disposable archived again at the end (all five in Trash)", endChecks.every(Boolean));

writeFileSync(`${OUT}/walk.txt`, results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`).join("\n") + "\n");
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
