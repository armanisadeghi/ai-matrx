/**
 * DELETE MEANS ARCHIVE — live proof on aimatrx.com, headless, as admin@admin.com.
 *
 * Arman, 2026-09-27: "delete MUST MEAN ARCHIVE regardless of what it's called."
 * This drives the deployed site the way a person does and reads the database
 * back as that same person, on disposable records it creates itself (named
 * "PP test …"):
 *
 *   notes   delete a note from the list menu → it is in Trash → Restore brings it back
 *   folder  "Move all notes to Trash" on a folder → every note AND the folder row
 *           are in Trash with one timestamp; restoring a note revives its folder
 *
 * Session: minted exactly like scripts/campaign-invite-delivery/shots.mjs
 * (auth.admin.generateLink → email OTP → verifyOtp) for AI_ADMIN_USERNAME; no
 * credential value is printed. Headless: nothing opens on anyone's screen.
 *
 *   node --env-file=.env.local scripts/delete-is-archive/live-proof.mjs [--origin https://www.aimatrx.com] [--out dir]
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ORIGIN = arg("--origin", "https://www.aimatrx.com");
const OUT = arg("--out", "/tmp/delete-is-archive-proof");
const ORG = arg("--org", "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f");
const EMAIL = process.env.AI_ADMIN_USERNAME;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SECRET_KEY;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
mkdirSync(OUT, { recursive: true });

const results = [];
const record = (step, ok, detail) => {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}  ${JSON.stringify(detail)}`);
};

async function mintSession() {
  if (!EMAIL || !URL_ || !SERVICE || !PUB) throw new Error("AI_ADMIN_USERNAME / Supabase env missing");
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const otp = link.data?.properties?.email_otp;
  if (!otp) throw new Error(`could not mint a session: ${link.error?.message ?? "no otp"}`);
  const pub = createClient(URL_, PUB, { auth: { persistSession: false } });
  const { data, error } = await pub.auth.verifyOtp({ email: EMAIL, token: otp, type: "email" });
  if (error || !data.session) throw new Error(`verifyOtp failed: ${error?.message}`);
  return data.session;
}

function cookieValue(s) {
  return "base64-" + Buffer.from(JSON.stringify({
    access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at,
    expires_in: s.expires_in, token_type: s.token_type,
    // The full user object pushes the cookie past one chunk; a chunked session
    // beside matrx-active-org reads as signed out on the live proxy (observed
    // 2026-09-28). The JWT carries the identity; the id is enough here.
    user: { id: s.user.id, email: s.user.email, aud: s.user.aud, role: s.user.role },
  })).toString("base64");
}

/** @supabase/ssr chunks a long cookie into name.0, name.1 … at 3180 chars. */
function chunked(name, value) {
  const MAX = 3180;
  if (value.length <= MAX) return [{ name, value }];
  const out = [];
  for (let i = 0; i * MAX < value.length; i++) out.push({ name: `${name}.${i}`, value: value.slice(i * MAX, (i + 1) * MAX) });
  return out;
}

async function main() {
  const session = await mintSession();
  const userId = session.user.id;
  const db = createClient(URL_, PUB, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  const wb = () => db.schema("workbench");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  // ── Disposable records, as the person ─────────────────────────────────────
  const { data: folderId, error: fErr } = await wb().rpc("note_folder_get_or_create", {
    p_organization_id: ORG, p_name: `PP test folder ${stamp}`,
  });
  if (fErr) throw fErr;
  const mk = async (label, folder) => {
    const { data, error } = await wb().from("notes").insert({
      label, content: `Disposable note for the delete-means-archive proof (${stamp}).`,
      organization_id: ORG, folder_id: folder?.id ?? null, folder_name: folder?.name ?? "Draft",
    }).select("id, label").single();
    if (error) throw error;
    return data;
  };
  const folder = { id: typeof folderId === "string" ? folderId : folderId?.id ?? folderId, name: `PP test folder ${stamp}` };
  const single = await mk(`PP test note ${stamp}`, null);
  const f1 = await mk(`PP test folder note 1 ${stamp}`, folder);
  const f2 = await mk(`PP test folder note 2 ${stamp}`, folder);
  record("created disposable records", true, { single: single.id, folder: folder.id, f1: f1.id, f2: f2.id });

  // ── Browser as the person ────────────────────────────────────────────────
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const host = new URL(ORIGIN).hostname.replace(/^www\./, "");
  await ctx.addCookies(chunked("sb-matrx-auth-v2", cookieValue(session)).map((c) => ({
    ...c, domain: `.${host}`, path: "/", sameSite: "Lax", secure: true,
  })));
  await ctx.addCookies([{ name: "matrx-active-org", value: `${userId}:${ORG}`, domain: `.${host}`, path: "/", sameSite: "Lax", secure: true }]);
  const page = await ctx.newPage();
  // Identity first, on a server route with no client JS (no second refresher racing the proxy).
  await page.goto(`${ORIGIN}/api/whoami`, { waitUntil: "domcontentloaded", timeout: 120000 });
  let who = null;
  for (let i = 0; i < 5 && who?.email !== EMAIL; i++) {
    await page.waitForTimeout(3000);
    who = await page.evaluate(async () => (await fetch("/api/whoami", { cache: "no-store" })).json()).catch(() => null);
    if (who?.email !== EMAIL) {
      const again = await mintSession();
      await ctx.addCookies(chunked("sb-matrx-auth-v2", cookieValue(again)).map((c) => ({
        ...c, domain: `.${host}`, path: "/", sameSite: "Lax", secure: true,
      })));
    }
  }
  if (who?.email !== EMAIL) {
    const names = (await ctx.cookies()).map((c) => `${c.name}@${c.domain}:${c.value.length}`);
    console.log("debug cookies:", JSON.stringify(names), "who:", JSON.stringify(who));
  }
  record("signed in as", who?.email === EMAIL, { email: who?.email ?? null });
  if (who?.email !== EMAIL) throw new Error("wrong identity — stopping before any write");

  // ── 1. Single note: Move to Trash from its menu ─────────────────────────
  await page.goto(`${ORIGIN}/notes?note=${single.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  const row = page.getByText(single.label, { exact: false }).first();
  await row.click({ button: "right", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/0-note-menu.png` });
  const items = await page.locator('[role="menuitem"], [role="menu"] button, [data-radix-collection-item]').allInnerTexts().catch(() => []);
  console.log("menu items:", JSON.stringify(items.slice(0, 40)));
  // The v3 menu nests the note's own actions under a submenu named for the note.
  await page.locator('[role="menuitem"]', { hasText: single.label }).first().hover();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/0b-note-submenu.png` });
  const sub = await page.locator('[role="menuitem"]').allInnerTexts().catch(() => []);
  console.log("submenu items:", JSON.stringify(sub.filter((t) => /trash|delete|archive/i.test(t))));
  await page.locator('[role="menuitem"]', { hasText: /^(Move to Trash|Delete Note|Delete)$/ }).first().click({ timeout: 15000 });
  const confirmBtn = page.getByRole("button", { name: /Move to Trash|Delete/i }).last();
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/1-note-moved-to-trash.png` });
  let { data: sRow } = await wb().from("notes").select("id, deleted_at").eq("id", single.id).maybeSingle();
  record("note: row still exists, deleted_at set (in Trash)", !!sRow && !!sRow.deleted_at, sRow);

  // Open Trash in the sidebar and restore it.
  await page.getByText(/^Trash$/).first().click({ timeout: 15000 });
  await page.waitForTimeout(3000);
  const inTrash = await page.getByText(single.label, { exact: false }).first().isVisible().catch(() => false);
  await page.screenshot({ path: `${OUT}/2-note-in-trash.png` });
  record("note: shown in Trash", inTrash, { label: single.label });
  const trashRow = page.locator(".group\\/trash", { hasText: single.label }).first();
  await trashRow.hover();
  const restoreBtn = trashRow.getByTitle("Restore");
  const deleteForever = await trashRow.getByTitle(/Delete forever/i).count();
  record("note: Trash offers no Delete forever", deleteForever === 0, { deleteForeverButtons: deleteForever });
  const emptyTrash = await page.getByText(/Empty trash/i).count();
  record("note: Trash offers no Empty trash", emptyTrash === 0, { emptyTrashButtons: emptyTrash });
  await restoreBtn.click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  ({ data: sRow } = await wb().from("notes").select("id, deleted_at").eq("id", single.id).maybeSingle());
  record("note: restored from Trash (deleted_at cleared)", !!sRow && sRow.deleted_at === null, sRow);
  await page.screenshot({ path: `${OUT}/3-note-restored.png` });

  // ── 2. Folder: Move all notes to Trash ───────────────────────────────────
  await page.goto(`${ORIGIN}/notes`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  await page.getByText(folder.name, { exact: false }).first().click({ button: "right", timeout: 30000 });
  await page.getByRole("menuitem", { name: /Move all notes to Trash/i }).first().click({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/4-folder-confirm.png` });
  const { data: inFolder } = await wb().from("notes").select("id").eq("folder_id", folder.id).is("deleted_at", null);
  const folderNoteIds = (inFolder ?? []).map((r) => r.id);
  await page.getByRole("button", { name: new RegExp(`Move ${folderNoteIds.length} to Trash`, "i") }).click({ timeout: 15000 });
  await page.waitForTimeout(4000);
  const { data: fRows } = await wb().from("notes").select("id, deleted_at").in("id", folderNoteIds);
  const { data: fFolder } = await wb().from("note_folders").select("id, deleted_at").eq("id", folder.id).maybeSingle();
  const stamps = new Set((fRows ?? []).map((r) => r.deleted_at));
  record(`folder: all ${folderNoteIds.length} notes in Trash`, (fRows ?? []).length === folderNoteIds.length && folderNoteIds.length >= 2 && (fRows ?? []).every((r) => r.deleted_at), fRows);
  record("folder: folder row archived, not destroyed, same timestamp", !!fFolder?.deleted_at && stamps.has(fFolder.deleted_at), fFolder);
  await page.getByText(/^Trash$/).first().click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/5-folder-notes-in-trash.png` });
  const bothShown = (await page.getByText(f1.label).count()) > 0 && (await page.getByText(f2.label).count()) > 0;
  record("folder: both notes shown in Trash", bothShown, {});
  const f1Row = page.locator(".group\\/trash", { hasText: f1.label }).first();
  await f1Row.hover();
  await f1Row.getByTitle("Restore").click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  const { data: f1After } = await wb().from("notes").select("id, deleted_at, folder_id").eq("id", f1.id).maybeSingle();
  const { data: folderAfter } = await wb().from("note_folders").select("id, deleted_at").eq("id", folder.id).maybeSingle();
  record("folder: restoring a note brings its folder back", !!f1After && f1After.deleted_at === null && folderAfter?.deleted_at === null, { f1After, folderAfter });

  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed. Screens + results in ${OUT}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(`FAIL  harness crashed: ${e?.message ?? e}`);
  process.exit(2);
});
