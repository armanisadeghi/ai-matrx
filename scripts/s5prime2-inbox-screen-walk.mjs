/**
 * LANE S5-PRIME-2 — the headless walk of the INBOX SCREEN's snooze and done on the shared preview
 * (LIVE database), now that records-ui carrying S5' is installed. admin@admin.com only, on admin's
 * own inbox items; every snooze and clear is put back before the walk ends, and nothing is decided.
 *
 *   node scripts/s5prime2-inbox-screen-walk.mjs
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
const ADMIN = { email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD };
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

// Which of admin's organizations to walk: one with a pending approval, and one with an assignment.
const rest = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
await rest.auth.signInWithPassword(ADMIN);
const store = rest.schema("custom");
const { data: counts } = await store.rpc("inbox_counts", {});
const orgs = [];
for (const o of counts ?? []) {
  const { data } = await store.rpc("work_inbox", { p_organization_id: o.organization_id, p_limit: 200 });
  orgs.push({ ...o, rows: data ?? [] });
}
const approvalOrg = orgs.find((o) => o.rows.some((r) => r.kind !== "assignment" && r.state === "pending"));
const workOrg = orgs.find((o) => o.rows.some((r) => r.kind === "assignment"));

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const inboxAt = async (orgId) => {
  await page.goto(`${ORIGIN}/data-v2?org=${orgId}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const got = await until("the inbox", async () => ((await page.locator('[aria-label="Inbox"]').count()) ? true : null), 120000);
  const inbox = page.locator('[aria-label="Inbox"]').first();
  await inbox.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(1500);
  return got.v ? inbox : null;
};
const tab = (inbox, v) => inbox.locator(`[data-inbox-view="${v}"]`);
try {
  const who = await signIn(page, ORIGIN, ADMIN.email, ADMIN.password, "admin");
  check("signed in through the login form as admin@admin.com", who === "admin@admin.com", who);

  if (!approvalOrg) {
    check("admin has a pending approval to snooze", false, "none on the live database");
  } else {
    const item = approvalOrg.rows.find((r) => r.kind !== "assignment" && r.state === "pending");
    const inbox = await inboxAt(approvalOrg.organization_id);
    check(`the inbox draws in ${approvalOrg.organization_name}`, !!inbox);
    const tabs = (await inbox.locator("[data-inbox-view]").allInnerTexts()).map((t) => t.replace(/\s+/g, ""));
    check("three views, each counted by the store", tabs.length === 3 && tabs[0] === `Inbox${approvalOrg.waiting}`, tabs.join(" | "));
    const row = inbox.locator(`[data-item="${item.item_id}"]`);
    await row.click({ position: { x: 5, y: 5 } });
    await inbox.focus();
    await page.keyboard.press("s");
    await sleep(500);
    const choices = inbox.locator('[data-testid="inbox-snooze-choices"]');
    check("s opens the snooze choices on the row", (await choices.count()) > 0, (await choices.first().innerText().catch(() => "")).replace(/\s+/g, " "));
    await page.screenshot({ path: `${OUT}/inbox-snooze-choices.png` });
    await choices.locator('button:has-text("Tomorrow, 8 AM")').click();
    const gone = await until("the row leaves", async () => ((await inbox.locator(`[data-item="${item.item_id}"]`).count()) === 0 ? true : null), 20000);
    check(`"${item.title}" left the inbox after Tomorrow, 8 AM`, !!gone.v);
    check("the status line says so, with Undo", /Snoozed until/.test(await inbox.locator('[data-testid="inbox-said"]').innerText().catch(() => "")));
    await tab(inbox, "snoozed").click();
    const back = await until("the snoozed view lists it", async () => ((await inbox.locator(`[data-item="${item.item_id}"]`).count()) ? true : null), 20000);
    check("the Snoozed view lists it and says when it comes back", !!back.v && (await inbox.locator('[data-testid="inbox-back-at"]').count()) > 0);
    await page.screenshot({ path: `${OUT}/inbox-snoozed-view.png` });
    await inbox.locator(`[data-item="${item.item_id}"] button:has-text("Unsnooze")`).click();
    await tab(inbox, "inbox").click();
    const returned = await until("it is back", async () => ((await inbox.locator(`[data-item="${item.item_id}"]`).count()) ? true : null), 20000);
    check("Unsnooze puts it back in the inbox", !!returned.v);
    const { data: after } = await store.rpc("inbox_counts", { p_organization_id: approvalOrg.organization_id });
    check("the store agrees: nothing of admin's is left snoozed there", after?.[0]?.snoozed === 0, JSON.stringify(after?.[0] ?? null));
    check("no Done control on a decision still owed", (await inbox.locator(`[data-item="${item.item_id}"] button:has-text("Done")`).count()) === 0);
  }

  if (!workOrg) {
    check("admin has assigned work to clear", false, "no assignment in admin's inbox on the live database");
  } else {
    const item = workOrg.rows.find((r) => r.kind === "assignment");
    const inbox = await inboxAt(workOrg.organization_id);
    // A checklist step is drawn once — in the checklist group, where it is finished — with its Done.
    const where = `[data-item="${item.item_id}"], [data-step-row="${item.item_id}"]`;
    const inStepGroup = (await inbox.locator(`[data-step-row="${item.item_id}"]`).count()) > 0;
    check(`"${item.title}" is drawn once`, (await inbox.locator(where).count()) === 1, inStepGroup ? "in the checklist group" : "as a row");
    // The inbox's own clear: on a row it is the row's button; on a step it is in the step's actions
    // strip (the step's OWN "Done" finishes it). Named "Done" in records-ui 0.85.11, "Clear" after.
    const doneBtn = inbox
      .locator(
        [`[data-item="${item.item_id}"]`, `[data-step-row="${item.item_id}"] > div:last-child`]
          .flatMap((w) => [`${w} button:text-is("Clear")`, `${w} button:text-is("Done")`])
          .join(", "),
      )
      .first();
    if (await doneBtn.count()) {
      await doneBtn.scrollIntoViewIfNeeded().catch(() => {});
      await doneBtn.click({ timeout: 15000 });
      const gone = await until("cleared", async () => ((await inbox.locator(where).count()) === 0 ? true : null), 20000);
      check(`Done clears "${item.title}"`, !!gone.v);
      const undo = inbox.locator('[data-testid="inbox-said"] button:has-text("Undo")');
      await undo.scrollIntoViewIfNeeded().catch(() => {});
      await undo.click({ timeout: 15000 });
      const back = await until("undone", async () => ((await inbox.locator(where).count()) ? true : null), 20000);
      check("Undo puts it back", !!back.v);
    } else {
      check(`Done on "${item.title}"`, false, "the row is drawn in the checklist group or has no Done");
    }
  }
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  const lines = results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`);
  lines.push("", `${results.length - failed}/${results.length} passed · ${new Date().toISOString()} · ${ORIGIN}`);
  writeFileSync(`${OUT}/inbox-screen-walk.txt`, lines.join("\n") + "\n");
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
