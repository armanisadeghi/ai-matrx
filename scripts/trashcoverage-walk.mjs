/**
 * LANE TRASH-COVERAGE — headless walk on the shared preview (LIVE database) as admin@admin.com.
 * Makes two disposable records the way the app does (as the person, through supabase-js with her
 * own session): a podcast show and a canvas map. Archives each from its own screen (reading the
 * confirm sentence), opens /trash, restores both from there, and proves both are back in their
 * lists. Ends by archiving both disposables again (owner law: archive, never delete).
 *
 *   node scripts/trashcoverage-walk.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { signIn, setOrganization, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "http://trash-coverage.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-25/trash-coverage";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

// ── the person's own client (her session, her RLS) ────────────────────────────────────────────
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD,
});
if (authErr) throw authErr;
const uid = auth.user.id;
check("supabase-js seat is admin@admin.com", auth.user.email === "admin@admin.com", auth.user.email);

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const ORG_NAME = process.env.WALK_ORG ?? "Harborview Mobile Mechanic";
const { data: orgs } = await sb.schema("iam").from("organizations").select("id, name, archived_at").eq("name", ORG_NAME).is("archived_at", null).limit(1);
let org = orgs?.[0];
if (!org) {
  const { data: mine } = await sb.schema("iam").from("organization_member").select("organization_id, role").eq("user_id", uid).eq("role", "owner");
  const ids = (mine ?? []).map((m) => m.organization_id);
  const { data: named } = await sb.schema("iam").from("organizations").select("id, name, archived_at, is_personal").in("id", ids).is("archived_at", null);
  org = (named ?? []).find((o) => o.is_personal) ?? named?.[0];
}
check("an organization to file the disposables under", !!org, org?.name);

const showTitle = `Harborview Garage Talk (trash walk ${stamp})`;
const { data: show, error: showErr } = await sb.schema("podcast").from("pc_shows")
  .insert({ title: showTitle, slug: `harborview-garage-talk-${Date.now()}`, organization_id: org.id, description: "Weekly shop talk from a two-van mobile mechanic." })
  .select("id").single();
check("disposable podcast show made", !showErr && !!show, showErr?.message ?? show?.id);

const mapTitle = `Harborview service territory (trash walk ${stamp})`;
const { data: map, error: mapErr } = await sb.schema("canvas").from("canvas_items")
  .insert({
    user_id: uid, organization_id: org.id, type: "diagram", title: mapTitle,
    content: { type: "diagram", data: { title: mapTitle, nodes: [], edges: [] }, metadata: { title: mapTitle } },
    content_hash: `trashcoverage-${Date.now()}`, tags: [],
  })
  .select("id").single();
check("disposable canvas map made", !mapErr && !!map, mapErr?.message ?? map?.id);

const live = async (schema, table, id) => {
  const { data } = await sb.schema(schema).from(table).select("deleted_at").eq("id", id).single();
  return data;
};

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const signed = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  check("browser signed in as admin@admin.com", signed === "admin@admin.com", String(signed));
  await setOrganization(page, org.name).catch((e) => console.log("org pick:", e.message));

  // ── 1. archive the show from the Podcast Shows screen ───────────────────────────────────────
  await page.goto(`${ORIGIN}/administration/knowledge/podcasts/shows`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const showRow = await until("show row", async () => (await page.getByText(showTitle, { exact: true }).count()) > 0, 60000);
  check("show listed on Podcast Shows", !!showRow.v);
  const row = page.locator("tr, [role='row'], li, div").filter({ hasText: showTitle }).last();
  await row.hover().catch(() => {});
  await row.locator('button[title="Delete"]').first().click({ timeout: 15000 });
  await page.getByRole("alertdialog").waitFor({ timeout: 15000 });
  const showDialog = await page.getByRole("alertdialog").innerText();
  await shot(page, "1-show-archive-confirm");
  check("show confirm says restore from Trash", /restore it from Trash/.test(showDialog) && !/cannot be undone/i.test(showDialog), showDialog.replace(/\s+/g, " ").slice(0, 160));
  await page.getByRole("alertdialog").getByRole("button", { name: /delete/i }).last().click();
  const showGone = await until("show archived", async () => (await live("podcast", "pc_shows", show.id))?.deleted_at, 30000);
  check("show archived (deleted_at set)", !!showGone.v);

  // ── 2. archive the map from the Maps screen ──────────────────────────────────────────────────
  await page.goto(`${ORIGIN}/maps`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const mapRow = await until("map row", async () => (await page.getByText(mapTitle, { exact: true }).count()) > 0, 60000);
  check("map listed on Maps", !!mapRow.v);
  await page.getByText(mapTitle, { exact: true }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Delete$/ }).first().click({ timeout: 15000 });
  const dlg = page.getByRole("alertdialog").or(page.getByRole("dialog")).first();
  await dlg.waitFor({ timeout: 15000 });
  const mapDialog = await dlg.innerText();
  await shot(page, "2-map-archive-confirm");
  check("map confirm says restore from Trash", /restore it from Trash/.test(mapDialog) && !/cannot be undone|permanently/i.test(mapDialog), mapDialog.replace(/\s+/g, " ").slice(0, 160));
  await dlg.getByRole("button", { name: /^Delete$/ }).click();
  const mapGone = await until("map archived", async () => (await live("canvas", "canvas_items", map.id))?.deleted_at, 30000);
  check("map archived (deleted_at set)", !!mapGone.v);

  // ── 3. /trash lists both; restore both from there ────────────────────────────────────────────
  await page.goto(`${ORIGIN}/trash`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const both = await until("both in trash", async () =>
    (await page.getByText(showTitle, { exact: true }).count()) > 0 &&
    (await page.getByText(mapTitle, { exact: true }).count()) > 0, 60000);
  await shot(page, "3-trash-lists-both");
  check("Trash lists the archived show and map", !!both.v);
  for (const title of [showTitle, mapTitle]) {
    const li = page.locator("li").filter({ hasText: title }).first();
    await li.getByRole("button", { name: /Restore/ }).click({ timeout: 15000 });
    await until(`${title} leaves trash`, async () => (await page.getByText(title, { exact: true }).count()) === 0, 30000);
  }
  await shot(page, "4-trash-after-restore");
  check("show restored (deleted_at null)", (await live("podcast", "pc_shows", show.id))?.deleted_at === null);
  check("map restored (deleted_at null)", (await live("canvas", "canvas_items", map.id))?.deleted_at === null);

  // ── 4. they are back where they live ─────────────────────────────────────────────────────────
  await page.goto(`${ORIGIN}/administration/knowledge/podcasts/shows`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const showBack = await until("show back", async () => (await page.getByText(showTitle, { exact: true }).count()) > 0, 60000);
  await shot(page, "5-show-back-on-podcast-shows");
  check("show is back on Podcast Shows", !!showBack.v);
  await page.goto(`${ORIGIN}/maps`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const mapBack = await until("map back", async () => (await page.getByText(mapTitle, { exact: true }).count()) > 0, 60000);
  await shot(page, "6-map-back-on-maps");
  check("map is back on Maps", !!mapBack.v);
} catch (e) {
  check("walk completed without an exception", false, e.message.split("\n")[0]);
} finally {
  await browser.close();
  // ── 5. archive the disposables (never a hard delete) ─────────────────────────────────────────
  const now = new Date().toISOString();
  if (show?.id) await sb.schema("podcast").from("pc_shows").update({ deleted_at: now }).eq("id", show.id).is("deleted_at", null);
  if (map?.id) await sb.schema("canvas").from("canvas_items").update({ deleted_at: now }).eq("id", map.id).is("deleted_at", null);
  check("disposables archived again", !!(await live("podcast", "pc_shows", show?.id))?.deleted_at && !!(await live("canvas", "canvas_items", map?.id))?.deleted_at);
  const passed = results.filter((r) => r.ok).length;
  const text = `trash-coverage walk ${new Date().toISOString()} — ${passed}/${results.length}\n` +
    results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`).join("\n") + "\n";
  writeFileSync(`${OUT}/walk.txt`, text);
  console.log(`\n${passed}/${results.length}`);
  process.exit(passed === results.length ? 0 : 1);
}
