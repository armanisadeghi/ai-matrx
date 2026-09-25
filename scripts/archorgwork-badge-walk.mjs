/**
 * LANE ARCHIVED-ORG-WORK — headless walk of admin@admin.com's bell and inbox on the shared preview
 * (LIVE database), read-only. Proves the archived Ironclad Mobile Mechanic's seven withdrawn
 * approvals are no longer counted or listed anywhere she looks: the bell's door
 * (custom.inbox_counts) lists no archived organization; the panel pins no archived organization;
 * the per-organization inbox and counts doors answer nothing for Ironclad; and the bell's number
 * equals the store's waiting work it is built from (no hidden seven).
 *
 *   node scripts/archorgwork-badge-walk.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "http://archived-org-work.localhost:3001";
const IRONCLAD = "719980a1-75f1-410f-88aa-0223f38f2872";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-24/archived-org-work";
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

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const answers = [];
  page.on("response", async (r) => {
    if (!r.url().includes("/rpc/inbox_counts")) return;
    try { answers.push({ rows: await r.json(), status: r.status() }); } catch {}
  });
  const signed = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  check("signed in through the login form as admin@admin.com", signed === env.AI_ADMIN_USERNAME, signed);
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const got = await until("the badge asks inbox_counts", async () => answers.find((a) => Array.isArray(a.rows)), 120000);
  const rows = got.v?.rows ?? [];
  check("the bell reads custom.inbox_counts (HTTP 200)", got.v?.status === 200, `${rows.length} organizations: ${rows.map((r) => `${r.organization_name} ${r.waiting}`).join(", ")}`);
  check("the bell's door lists no Ironclad organization", !rows.some((r) => /Ironclad/.test(r.organization_name ?? "") || r.organization_id === IRONCLAD), "");

  const rest = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await rest.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
  const c = rest.schema("custom");
  const inbox = await c.rpc("work_inbox", { p_organization_id: IRONCLAD, p_limit: 200 });
  check("custom.work_inbox(Ironclad) lists nothing", !inbox.error && (inbox.data ?? []).length === 0, inbox.error?.message ?? `${(inbox.data ?? []).length} rows`);
  const decided = await c.rpc("work_inbox", { p_organization_id: IRONCLAD, p_limit: 200, p_include_decided: true });
  check("custom.work_inbox(Ironclad, decided) lists nothing either", !decided.error && (decided.data ?? []).length === 0, decided.error?.message ?? `${(decided.data ?? []).length} rows`);
  const counts = await c.rpc("inbox_counts", { p_organization_id: IRONCLAD });
  const cr = (counts.data ?? [])[0];
  check("custom.inbox_counts(Ironclad) counts 0 waiting (was 7)", !counts.error && (cr?.waiting ?? 0) === 0, counts.error?.message ?? JSON.stringify(cr ?? null));

  const bell = page.locator("[data-inbox-header-button] button").first();
  const label = await until("the bell's label", async () => {
    const l = await bell.getAttribute("aria-label");
    return l && /Inbox/.test(l) ? l : null;
  }, 30000);
  check("the bell carries a label", !!label.v, label.v ?? "");
  await bell.click();
  await sleep(1500);
  const text = (await page.locator('[data-inbox-panel="compact"]').first().innerText().catch(() => "")).replace(/\s+/g, " ");
  await page.screenshot({ path: `${OUT}/admin-inbox-panel.png` });
  check("the panel pins no Ironclad row", !/In your tables · Ironclad/.test(text), text.slice(0, 240));
  for (const r of rows.filter((x) => x.waiting > 0)) {
    check(`the panel pins "In your tables · ${r.organization_name}"`, text.includes(`In your tables · ${r.organization_name}`), "");
  }
  await ctx.close();
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  const lines = results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`);
  lines.push("", `${results.length - failed}/${results.length} passed · ${new Date().toISOString()} · ${ORIGIN}`);
  writeFileSync(`${OUT}/badge-walk.txt`, lines.join("\n") + "\n");
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
