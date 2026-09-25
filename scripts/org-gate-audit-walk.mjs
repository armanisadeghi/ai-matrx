// LANE ORG-GATE-AUDIT — headless proof on the shared preview that two fixed surfaces ASK for an
// organization instead of refusing, then continue the same action with the answer.
//
//   1. Content editor → Content options → "Save to Scratch" (ContentManagerMenu, which used to
//      call requireOrganizationContext(activeOrgId) on the click). Creates ONE note in Scratch,
//      which this walk then soft-deletes (deleted_at) as the same seat.
//   2. Bing Webmaster connections → "Only for me" (startBingOAuth, whose header helper used to
//      be the synchronous bare kernel). Nothing is written; the navigation to Microsoft is
//      intercepted and aborted once the authorize-url request has been seen.
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed), fresh
// cookie jar, so no organization is selected until the app's own dialog asks.
// Usage: node scripts/org-gate-audit-walk.mjs <outDir>
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.ORG_GATE_ORIGIN ?? "http://org-gate-audit.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
const WORKSPACE = "admin's Workspace";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
if (authErr) throw authErr;

async function dismissSpendPopup(page) {
  // The daily-spend notice floats over the page on first load; dismiss it the way a person does.
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 30000 }).then(() => true).catch(() => false)) {
    await dismiss.click();
    await dismiss.waitFor({ state: "hidden", timeout: 10000 }).catch(() => undefined);
  }
}

async function answerWorkspaceDialog(page, label) {
  const ask = page.getByText("Which workspace is this for?");
  const asked = await ask.isVisible({ timeout: 15000 }).catch(() => false);
  console.log(`${label}: workspace dialog opened = ${asked}`);
  if (!asked) return false;
  await page.screenshot({ path: `${OUT}/${label}-dialog.png` });
  const pick = page.getByText(WORKSPACE, { exact: true }).last();
  await pick.scrollIntoViewIfNeeded();
  await pick.click();
  await page.getByRole("button", { name: /^Continue$/ }).click();
  return true;
}

const browser = await chromium.launch({ headless: true });
const report = {};
try {
  // ── 1. Save to Scratch ────────────────────────────────────────────────────────────────────
  {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const page = await context.newPage();
    const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
    console.log(`scratch seat: ${who}`);
    const started = new Date().toISOString();
    const inserts = [];
    page.on("request", (r) => {
      if (/\/rest\/v1\/notes/.test(r.url()) && r.method() === "POST") inserts.push(r.postData()?.slice(0, 400));
    });
    await page.goto(`${ORIGIN}/administration/ui/official-components/content-editor`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const selected = await page.evaluate(async () => (await (await fetch("/api/whoami")).json()));
    console.log("whoami:", JSON.stringify({ email: selected?.email }));
    const options = page.locator('button[title="Content options"]').first();
    await options.waitFor({ timeout: 240000 });
    await dismissSpendPopup(page);
    // The menu is lazy: the first press loads it (a dev compile can take a while), so press
    // again until it is open, exactly as a person would.
    const item = page.getByRole("button", { name: /Save to Scratch/ }).last();
    const menuOpen = page.locator("div.fixed.inset-0.backdrop-blur-\\[2px\\]");
    for (let i = 0; i < 8; i += 1) {
      await page.locator('button[title="Content options"]').first().click();
      if (await menuOpen.first().isVisible({ timeout: 8000 }).catch(() => false)) break;
    }
    console.log("menu buttons:", JSON.stringify(await page.getByRole("button").allInnerTexts().then((t) => t.filter((x) => /Scratch|Notes|Copy/.test(x)))));
    await page.screenshot({ path: `${OUT}/scratch-menu.png` });
    await item.click();
    const asked = await answerWorkspaceDialog(page, "scratch");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/scratch-after.png` });
    const { data: notes } = await sb.schema("workbench").from("notes")
      .select("id, label, folder_name, organization_id, created_at")
      .eq("created_by", auth.user.id).eq("folder_name", "Scratch").gte("created_at", started).is("deleted_at", null);
    const toasts = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent?.trim()));
    report.scratch = { asked, notes, inserts: inserts.length, toasts };
    for (const n of notes ?? []) {
      const { error } = await sb.schema("workbench").from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", n.id);
      console.log(`retired note ${n.id}: ${error ? error.message : "soft-deleted"}`);
    }
    await context.close();
  }

  // ── 2. Bing "Only for me" ─────────────────────────────────────────────────────────────────
  {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const page = await context.newPage();
    const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
    console.log(`bing seat: ${who}`);
    let authorize = null;
    page.on("request", (r) => {
      if (/bing-integrations\/authorize-url/.test(r.url())) authorize = { url: r.url().slice(0, 200), org: r.headers()["x-organization-id"] ?? null };
    });
    await page.route(/login\.microsoftonline\.com|bing\.com\/webmasters\/oauth|login\.live\.com/, (route) => route.abort());
    await page.goto(`${ORIGIN}/marketing/operations/connections/bing`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await dismissSpendPopup(page);
    const onlyForMe = page.getByRole("button", { name: /Only for me/ }).first();
    if (!(await onlyForMe.isVisible({ timeout: 60000 }).catch(() => false))) {
      const add = page.getByRole("button", { name: /Add|Connect/ }).first();
      if (await add.isVisible({ timeout: 5000 }).catch(() => false)) await add.click();
    }
    await onlyForMe.waitFor({ timeout: 60000 });
    await page.screenshot({ path: `${OUT}/bing-before.png` });
    await onlyForMe.click();
    const asked = await answerWorkspaceDialog(page, "bing");
    for (let i = 0; i < 30 && !authorize; i += 1) await page.waitForTimeout(500);
    const toasts = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent?.trim())).catch(() => []);
    report.bing = { asked, authorize, toasts };
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
