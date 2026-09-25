/**
 * LANE S5-PRIME-2 — the headless walk of the shell badge on the shared preview (LIVE database).
 *
 * The bell's number now counts what waits on the person in the record store through the SAME door
 * the inbox lists with (`custom.inbox_counts`), and the Inbox panel pins one row per organization
 * ("In your tables · <organization>") that opens that organization's inbox. The walk proves it
 * reads live rows: a second session (REST, the same person) snoozes one of their own items during
 * the walk, the badge's door answers one fewer, and the item is put back before the walk ends.
 * Writes: only the signed-in person's own snooze state, restored. Seats: admin@admin.com, then
 * test@test.com.
 *
 *   TEST_SEAT_PASSWORD=… node scripts/s5prime2-badge-walk.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "http://s5-prime-2.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-24/s5-prime-2";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const SEATS = [
  { who: "admin", email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD },
  { who: "test", email: "test@test.com", password: process.env.TEST_SEAT_PASSWORD },
];
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
try {
  for (const seat of SEATS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    const answers = [];
    page.on("response", async (r) => {
      if (!r.url().includes("/rpc/inbox_counts")) return;
      try {
        answers.push({ rows: await r.json(), status: r.status(), at: Date.now() });
      } catch {}
    });
    const signed = await signIn(page, ORIGIN, seat.email, seat.password, seat.who);
    check(`${seat.who}: signed in through the login form as ${seat.email}`, signed === seat.email, signed);
    await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });

    const got = await until(`${seat.who}: the badge asks inbox_counts`, async () => answers.find((a) => Array.isArray(a.rows)), 120000);
    check(`${seat.who}: the badge reads custom.inbox_counts (every organization of theirs)`, !!got.v && got.v.status === 200, got.v ? `${got.v.rows.length} organizations, HTTP ${got.v.status}` : "no answer");
    const rows = (got.v?.rows ?? []).filter((r) => r.waiting > 0);
    const work = rows.reduce((a, r) => a + r.waiting, 0);

    // The bell's own label carries the total; it includes the store's waiting work.
    const bell = page.locator("[data-inbox-header-button] button").first();
    const label = await until(`${seat.who}: the bell's label`, async () => {
      const l = await bell.getAttribute("aria-label");
      return l && /Inbox/.test(l) ? l : null;
    }, 30000);
    const total = Number((label.v ?? "").match(/Inbox \((\d+)/)?.[1] ?? 0);
    check(`${seat.who}: the bell's number includes the ${work} waiting in their tables`, total >= work && (work === 0 || total > 0), label.v ?? "no label");

    await bell.click();
    await sleep(1500);
    const panel = page.locator('[data-inbox-panel="compact"]').first();
    const text = (await panel.innerText().catch(() => "")).replace(/\s+/g, " ");
    await page.screenshot({ path: `${OUT}/${seat.who}-inbox-panel.png` });
    for (const r of rows) {
      check(`${seat.who}: the panel pins "In your tables · ${r.organization_name}" with ${r.waiting}`, text.includes(`In your tables · ${r.organization_name}`), text.slice(0, 200));
    }

    // LIVE: a second session (the same person, REST) snoozes one of their own items; the badge's
    // door answers one fewer on its next read; then it is put back.
    if (rows.length > 0) {
      const target = rows[0];
      const rest = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
      await rest.auth.signInWithPassword({ email: seat.email, password: seat.password });
      const c = rest.schema("custom");
      const { data: items } = await c.rpc("work_inbox", { p_organization_id: target.organization_id, p_limit: 200 });
      const item = items?.[0];
      const s = await c.rpc("inbox_snooze", { p_organization_id: target.organization_id, p_item_id: item.item_id, p_until: new Date(Date.now() + 86400e3).toISOString() });
      check(`${seat.who}: a second session snoozes "${item.title}"`, !s.error, s.error?.message ?? "");
      const before = answers.length;
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.bringToFront();
      // Focus refetch; if the browser does not fire it headless, reopen the page.
      let fresh = await until(`${seat.who}: a fresh inbox_counts`, async () => answers.slice(before).find((a) => Array.isArray(a.rows)), 8000);
      if (!fresh.v) {
        await page.reload({ waitUntil: "domcontentloaded" });
        fresh = await until(`${seat.who}: a fresh inbox_counts after reload`, async () => answers.slice(before).find((a) => Array.isArray(a.rows)), 120000);
      }
      const now = (fresh.v?.rows ?? []).find((r) => r.organization_id === target.organization_id);
      check(`${seat.who}: the badge's door now answers ${target.waiting - 1} waiting in ${target.organization_name} (read live)`, (now?.waiting ?? 0) === target.waiting - 1, JSON.stringify(now ?? null));
      const u = await c.rpc("inbox_unsnooze", { p_organization_id: target.organization_id, p_item_id: item.item_id });
      check(`${seat.who}: put back`, !u.error && u.data?.changed === true, u.error?.message ?? u.data?.sentence);

      // The pinned row opens that organization's inbox, whichever organization is selected.
      await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await sleep(3000);
      await page.locator("[data-inbox-header-button] button").first().click();
      await sleep(1500);
      const pin = page.locator(`button:has-text("In your tables · ${target.organization_name}")`).first();
      if (await pin.count()) {
        await pin.click();
        const went = await until(`${seat.who}: navigates to the organization's inbox`, async () => (page.url().includes(`org=${target.organization_id}`) ? page.url() : null), 60000);
        check(`${seat.who}: the pinned row opens /data-v2?org=<that organization>`, !!went.v, went.v ?? page.url());
      } else {
        check(`${seat.who}: the pinned row opens /data-v2?org=<that organization>`, false, "row not found");
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  const lines = results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`);
  lines.push("", `${results.length - failed}/${results.length} passed · ${new Date().toISOString()} · ${ORIGIN}`);
  writeFileSync(`${OUT}/badge-walk.txt`, lines.join("\n") + "\n");
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
