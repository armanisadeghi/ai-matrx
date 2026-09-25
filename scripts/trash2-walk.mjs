/**
 * LANE TRASH-2 — headless walk on the shared preview (LIVE database).
 *
 *   admin@admin.com   makes a disposable podcast show and canvas map in Harbor Dental Group (an
 *                     organization she owns), archives both as herself, opens /trash — which now
 *                     answers — restores both FROM THE PAGE, and sees both back on their screens.
 *                     Every /trash row is hers (or named to her); none is another member's.
 *   test@test.com     (a plain member of Harbor Dental Group) archives a disposable show of their
 *                     own; admin restores it from Organization settings → Trash; the organization
 *                     audit row and the in-app notice to test@test.com exist.
 *   test@test.com     /trash shows only their own items; Organization settings → Trash is ABSENT
 *                     (no nav chip, no section) because they are not an owner or admin there.
 * Ends by archiving every disposable again (archive, never delete).
 *
 *   WALK_TEST_PASSWORD_FILE=<file holding test@test.com's password> node scripts/trash2-walk.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { signIn, until } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://trash-2.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-25/trash-coverage";
const ORG_SLUG = "harbor-dental-group";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const TEST_EMAIL = "test@test.com";
const TEST_PASSWORD = readFileSync(process.env.WALK_TEST_PASSWORD_FILE, "utf8").trim();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/trash2-${name}.png`, fullPage: false });
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function seat(email, password) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { sb, uid: data.user.id, email: data.user.email };
}

const admin = await seat(env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD);
const tester = await seat(TEST_EMAIL, TEST_PASSWORD);
check("seats are admin@admin.com and test@test.com", admin.email === "admin@admin.com" && tester.email === TEST_EMAIL);

const { data: orgRow } = await admin.sb.schema("iam").from("organizations").select("id, name").eq("slug", ORG_SLUG).single();
const org = orgRow;
check("Harbor Dental Group resolved", !!org?.id, org?.id);

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const made = [];
async function makeShow(who, title, description) {
  const { data, error } = await who.sb.schema("podcast").from("pc_shows")
    .insert({ title, slug: `trash2-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, organization_id: org.id, description })
    .select("id").single();
  if (data) made.push({ who, schema: "podcast", table: "pc_shows", id: data.id });
  return { data, error };
}
const live = async (who, schema, table, id) =>
  (await who.sb.schema(schema).from(table).select("deleted_at").eq("id", id).maybeSingle()).data;
const archive = (who, schema, table, id) =>
  who.sb.schema(schema).from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);

const showTitle = `Smile Talk with Harbor Dental (trash walk ${stamp})`;
const { data: show, error: showErr } = await makeShow(admin, showTitle, "A monthly chat about preventive care for the families we see.");
check("admin: disposable podcast show made", !showErr && !!show, showErr?.message ?? show?.id);
const mapTitle = `Harbor Dental referral map (trash walk ${stamp})`;
const { data: map, error: mapErr } = await admin.sb.schema("canvas").from("canvas_items")
  .insert({
    user_id: admin.uid, organization_id: org.id, type: "diagram", title: mapTitle,
    content: { type: "diagram", data: { title: mapTitle, nodes: [], edges: [] }, metadata: { title: mapTitle } },
    content_hash: `trash2-${Date.now()}`, tags: [],
  })
  .select("id").single();
if (map) made.push({ who: admin, schema: "canvas", table: "canvas_items", id: map.id });
check("admin: disposable canvas map made", !mapErr && !!map, mapErr?.message ?? map?.id);
await archive(admin, "podcast", "pc_shows", show.id);
await archive(admin, "canvas", "canvas_items", map.id);
check("admin: both archived as herself", !!(await live(admin, "podcast", "pc_shows", show.id))?.deleted_at && !!(await live(admin, "canvas", "canvas_items", map.id))?.deleted_at);

const testShowTitle = `Front desk tips for new patients (trash walk ${stamp})`;
const { data: tShow, error: tErr } = await makeShow(tester, testShowTitle, "Short episodes for our front desk team on welcoming first-time patients.");
check("test@test.com: disposable show made in Harbor Dental Group", !tErr && !!tShow, tErr?.message ?? tShow?.id);
await archive(tester, "podcast", "pc_shows", tShow.id);
check("test@test.com: their show archived", !!(await live(tester, "podcast", "pc_shows", tShow.id))?.deleted_at);

// Personal Trash is the person's own: every row admin's /trash can list is hers or named to her.
const { data: adminRows, error: alErr } = await admin.sb.rpc("trash_list", { p_kinds: null, p_limit: 1000, p_offset: 0 });
const foreign = (adminRows ?? []).filter((r) => !r.is_mine);
check("admin: trash_list answers", !alErr, alErr?.message ?? `${adminRows?.length} rows`);
check("admin: test@test.com's archived show is NOT in admin's personal Trash", !(adminRows ?? []).some((r) => r.id === tShow.id));
const { data: grants } = foreign.length
  ? await admin.sb.schema("iam").from("permissions").select("resource_id").eq("granted_to_user_id", admin.uid).in("resource_id", foreign.map((r) => r.id))
  : { data: [] };
check("admin: every non-owned row in personal Trash was named to her", foreign.every((r) => (grants ?? []).some((g) => g.resource_id === r.id)), `${foreign.length} named`);

/** The shared preview runs at load 50+; a sign-in that never took is retried, and says so. */
async function signInPatiently(page, email, password, who) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await signIn(page, ORIGIN, email, password, who);
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`[trash2-walk] ${who}: sign-in attempt ${attempt} failed (${e.message.split("\n")[0]}) — retrying`);
    }
  }
}

const browser = await chromium.launch({ headless: true });
try {
  // ── admin: /trash renders, restore both from the page ─────────────────────────────────────
  const aCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await aCtx.newPage();
  page.setDefaultNavigationTimeout(300000);
  check("browser: admin signed in", (await signInPatiently(page, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin")) === "admin@admin.com");
  await page.goto(`${ORIGIN}/trash`, { waitUntil: "domcontentloaded", timeout: 300000 });
  const both = await until("both in trash", async () =>
    (await page.getByText(showTitle, { exact: true }).count()) > 0 &&
    (await page.getByText(mapTitle, { exact: true }).count()) > 0, 90000);
  await shot(page, "1-admin-trash-lists-both");
  check("admin /trash PAGE lists the archived show and map", !!both.v);
  check("admin /trash does not list test@test.com's archived show", (await page.getByText(testShowTitle, { exact: true }).count()) === 0);
  for (const title of [showTitle, mapTitle]) {
    const li = page.locator("li").filter({ hasText: title }).first();
    await li.getByRole("button", { name: /Restore/ }).click({ timeout: 15000 });
    const gone = await until(`${title} leaves trash`, async () => (await page.getByText(title, { exact: true }).count()) === 0, 30000);
    check(`admin restored "${title}" from the /trash page`, !!gone.v);
  }
  await shot(page, "2-admin-trash-after-restore");
  check("show restored (deleted_at null)", (await live(admin, "podcast", "pc_shows", show.id))?.deleted_at === null);
  check("map restored (deleted_at null)", (await live(admin, "canvas", "canvas_items", map.id))?.deleted_at === null);
  await page.goto(`${ORIGIN}/administration/knowledge/podcasts/shows`, { waitUntil: "domcontentloaded", timeout: 300000 });
  const showBack = await until("show back", async () => (await page.getByText(showTitle, { exact: true }).count()) > 0, 60000);
  await shot(page, "3-show-back-on-podcast-shows");
  check("show is back on Podcast Shows", !!showBack.v);
  await page.goto(`${ORIGIN}/maps`, { waitUntil: "domcontentloaded", timeout: 300000 });
  const mapBack = await until("map back", async () => (await page.getByText(mapTitle, { exact: true }).count()) > 0, 60000);
  await shot(page, "4-map-back-on-maps");
  check("map is back on Maps", !!mapBack.v);

  // ── admin: Organization settings → Trash, restore test@test.com's show ────────────────────
  await page.goto(`${ORIGIN}/organizations/${ORG_SLUG}/settings#trash`, { waitUntil: "commit", timeout: 300000 });
  const section = page.locator("section#trash");
  const listed = await until("org trash lists test's show", async () =>
    (await section.getByText(testShowTitle, { exact: true }).count()) > 0, 240000);
  await section.scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "5-org-trash-lists-members-item");
  check("Organization Trash lists test@test.com's archived show, with who archived it", !!listed.v &&
    /test@test\.com|Test/i.test(await section.locator("li").filter({ hasText: testShowTitle }).first().innerText()));
  await section.locator("li").filter({ hasText: testShowTitle }).first().getByRole("button", { name: /Restore/ }).click({ timeout: 15000 });
  const tBack = await until("test show restored", async () => (await live(tester, "podcast", "pc_shows", tShow.id))?.deleted_at === null, 30000);
  await shot(page, "6-org-trash-after-restore");
  check("admin restored test@test.com's show from Organization Trash", !!tBack.v);
  const { data: audit } = await admin.sb.rpc("org_admin_list_audit", { p_org_id: org.id, p_limit: 20 });
  check("organization audit row trash.restore names test@test.com's show",
    (audit ?? []).some((a) => a.action === "trash.restore" && a.target_user_id === tester.uid && a.detail?.id === tShow.id));
  const { data: notes } = await tester.sb.schema("communication").from("notification")
    .select("id, event_key, subject, body").eq("event_key", "trash.restored_by_org_admin").eq("target_id", tShow.id);
  check("test@test.com got the in-app notice", (notes ?? []).length === 1, notes?.[0]?.subject ?? "none");
  await aCtx.close();

  // ── test@test.com: only their own Trash; no Organization Trash ────────────────────────────
  await archive(tester, "podcast", "pc_shows", tShow.id);
  const tCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const tp = await tCtx.newPage();
  tp.setDefaultNavigationTimeout(300000);
  check("browser: test@test.com signed in", (await signInPatiently(tp, TEST_EMAIL, TEST_PASSWORD, "test")) === TEST_EMAIL);
  await tp.goto(`${ORIGIN}/trash`, { waitUntil: "domcontentloaded", timeout: 300000 });
  const own = await until("test sees own show", async () => (await tp.getByText(testShowTitle, { exact: true }).count()) > 0, 90000);
  await shot(tp, "7-test-trash-own-items");
  check("test@test.com /trash lists their own archived show", !!own.v);
  const { data: tRows } = await tester.sb.rpc("trash_list", { p_kinds: null, p_limit: 1000, p_offset: 0 });
  const tForeign = (tRows ?? []).filter((r) => !r.is_mine);
  const { data: tGrants } = tForeign.length
    ? await tester.sb.schema("iam").from("permissions").select("resource_id").eq("granted_to_user_id", tester.uid).in("resource_id", tForeign.map((r) => r.id))
    : { data: [] };
  check("test@test.com personal Trash: every row is theirs or named to them",
    tForeign.every((r) => (tGrants ?? []).some((g) => g.resource_id === r.id)), `${(tRows ?? []).length} rows, ${tForeign.length} named`);
  check("test@test.com /trash does not list admin's items", (await tp.getByText(showTitle, { exact: true }).count()) === 0);
  await tp.goto(`${ORIGIN}/organizations/${ORG_SLUG}/settings`, { waitUntil: "commit", timeout: 300000 });
  await until("settings rendered", async () => (await tp.getByText("General", { exact: false }).count()) > 0, 240000);
  await shot(tp, "8-test-org-settings-no-trash");
  check("Organization Trash is ABSENT for a plain member (no section)", (await tp.locator("section#trash").count()) === 0);
  const { error: refusal } = await tester.sb.rpc("org_trash_list", { p_organization_id: org.id });
  check("the server refuses a plain member's org_trash_list (42501)", refusal?.code === "42501", refusal?.message ?? "no error");
  await tCtx.close();
} catch (e) {
  check("walk completed without an exception", false, e.message.split("\n")[0]);
} finally {
  await browser.close();
  for (const m of made) await archive(m.who, m.schema, m.table, m.id);
  let allArchived = true;
  for (const m of made) allArchived &&= !!(await live(m.who, m.schema, m.table, m.id))?.deleted_at;
  check("every disposable archived again", allArchived, `${made.length} records`);
  const passed = results.filter((r) => r.ok).length;
  const text = `trash-2 walk ${new Date().toISOString()} — ${passed}/${results.length}\n` +
    results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`).join("\n") + "\n";
  writeFileSync(`${OUT}/trash2-walk.txt`, text);
  console.log(`\n${passed}/${results.length}`);
  process.exit(passed === results.length ? 0 : 1);
}
