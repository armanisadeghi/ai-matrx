/**
 * DELETE MEANS ARCHIVE — live proof on aimatrx.com, headless, as admin@admin.com.
 *
 * Arman, 2026-09-27: "delete MUST MEAN ARCHIVE regardless of what it's called."
 * This drives the deployed site the way a person does and reads the database
 * back as that same person, on disposable records it creates itself (named
 * "PP test …"):
 *
 *   memory      Settings → Memory: Move to Trash → listed on /trash → Restore
 *   data store  Knowledge → Data stores: Move to Trash → listed on /trash → Restore
 *
 * Session: minted exactly like scripts/campaign-invite-delivery/shots.mjs
 * (auth.admin.generateLink → email OTP → verifyOtp) for AI_ADMIN_USERNAME; no
 * credential value is printed. Headless: nothing opens on anyone's screen.
 *
 *   node --env-file=.env.local scripts/delete-is-archive/live-proof-2.mjs [--origin https://www.aimatrx.com] [--out dir]
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

async function signedInPage(session) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const host = new URL(ORIGIN).hostname.replace(/^www\./, "");
  await ctx.addCookies(chunked("sb-matrx-auth-v2", cookieValue(session)).map((c) => ({
    ...c, domain: `.${host}`, path: "/", sameSite: "Lax", secure: true,
  })));
  await ctx.addCookies([{ name: "matrx-active-org", value: `${session.user.id}:${ORG}`, domain: `.${host}`, path: "/", sameSite: "Lax", secure: true }]);
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/api/whoami`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const who = await page.evaluate(async () => (await fetch("/api/whoami", { cache: "no-store" })).json()).catch(() => null);
  record("signed in as", who?.email === EMAIL, { email: who?.email ?? null });
  if (who?.email !== EMAIL) throw new Error("wrong identity — stopping before any write");
  return { browser, page };
}

/** Find the row on /trash and press its Restore. */
async function restoreFromTrashPage(page, label, shot) {
  await page.goto(`${ORIGIN}/trash`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  const listed = (await page.getByText(label, { exact: false }).count()) > 0;
  await page.screenshot({ path: `${OUT}/${shot}-on-trash-page.png` });
  const purge = await page.getByText(/Delete forever|Delete permanently|Empty trash|Purge/i).count();
  const row = page.locator("li, tr, [role=row], div.group", { hasText: label }).filter({ has: page.getByRole("button", { name: /Restore/i }) }).last();
  await row.getByRole("button", { name: /Restore/i }).first().click({ timeout: 15000 });
  await page.waitForTimeout(4000);
  return { listed, purge };
}

async function main() {
  const session = await mintSession();
  const db = createClient(URL_, PUB, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const memPath = `pp-test/${stamp}.md`;
  const storeName = `PP test data store ${stamp}`;

  const { error: mErr } = await db.schema("users").from("user_memory").upsert(
    { created_by: session.user.id, organization_id: ORG, path: memPath, content: "Disposable memory for the delete-means-archive proof.", deleted_at: null },
    { onConflict: "created_by,path" },
  );
  if (mErr) throw mErr;
  const { data: store, error: sErr } = await db.schema("rag").from("data_stores").insert({
    name: storeName, description: "Disposable store for the delete-means-archive proof.", kind: "general",
    organization_id: ORG, created_by: session.user.id,
  }).select("id, name").single();
  if (sErr) throw sErr;
  record("created disposable records", true, { memory: memPath, store: store.id });

  const { browser, page } = await signedInPage(session);

  // ── Memory ──────────────────────────────────────────────────────────────
  await page.goto(`${ORIGIN}/settings/preferences?tab=ai.memory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000);
  await page.getByText(memPath, { exact: false }).first().click({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/m0-memory-open.png` });
  const svgs = await page.locator("button svg").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("class")).filter((c) => c && /trash/i.test(c)))]);
  console.log("trash icons:", JSON.stringify(svgs));
  await page.locator('button:has(svg[class*="trash"])').last().click({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/m1-memory-confirm.png` });
  const memCopy = await page.locator("[role=dialog],[role=alertdialog]").last().innerText().catch(() => "");
  record("memory: confirm says Move to Trash and restorable", /Move to Trash/i.test(memCopy) && /restore/i.test(memCopy) && !/cannot be undone|permanent/i.test(memCopy), { copy: memCopy.replace(/\s+/g, " ").slice(0, 200) });
  await page.getByRole("button", { name: /^Move to Trash$/ }).click({ timeout: 15000 });
  await page.waitForTimeout(4000);
  let { data: mRow } = await db.schema("users").from("user_memory").select("path, deleted_at").eq("path", memPath).maybeSingle();
  record("memory: row archived, not destroyed", !!mRow?.deleted_at, mRow);
  const m = await restoreFromTrashPage(page, memPath.split("/").pop().replace(/\.md$/, ""), "m2-memory");
  ({ data: mRow } = await db.schema("users").from("user_memory").select("path, deleted_at").eq("path", memPath).maybeSingle());
  record("memory: listed on /trash, no purge control", m.listed && m.purge === 0, m);
  record("memory: restored from /trash", !!mRow && mRow.deleted_at === null, mRow);

  // ── Data store ──────────────────────────────────────────────────────────
  await page.goto(`${ORIGIN}/knowledge/data-stores?store_id=${store.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000);
  await page.getByRole("button", { name: /^Move to Trash$/ }).first().click({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/d1-store-confirm.png` });
  const dCopy = await page.locator("[role=dialog],[role=alertdialog]").last().innerText().catch(() => "");
  record("data store: confirm says Move to Trash and restorable", /Move .*to Trash/i.test(dCopy) && /restore/i.test(dCopy) && !/permanent/i.test(dCopy), { copy: dCopy.replace(/\s+/g, " ").slice(0, 200) });
  await page.locator("[role=dialog],[role=alertdialog]").last().getByRole("button", { name: /^Move to Trash$/ }).click({ timeout: 15000 });
  await page.waitForTimeout(4000);
  let { data: dRow } = await db.schema("rag").from("data_stores").select("id, deleted_at").eq("id", store.id).maybeSingle();
  record("data store: row archived, not destroyed", !!dRow?.deleted_at, dRow);
  const d = await restoreFromTrashPage(page, storeName, "d2-store");
  ({ data: dRow } = await db.schema("rag").from("data_stores").select("id, deleted_at").eq("id", store.id).maybeSingle());
  record("data store: listed on /trash, no purge control", d.listed && d.purge === 0, d);
  record("data store: restored from /trash", !!dRow && dRow.deleted_at === null, dRow);

  await browser.close();
  writeFileSync(`${OUT}/results-2.json`, JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed. Screens + results in ${OUT}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(`FAIL  harness crashed: ${e?.message ?? e}`);
  process.exit(2);
});
