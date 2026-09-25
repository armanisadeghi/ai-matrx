// LANE VIEW-SWITCH-NOT-DESIGNATION — the headless walk on the shared preview, both seats.
//
// THE USE CASE: Calder Fabrication's accounts-receivable table. The owner (admin@admin.com, the
// table's editor) keeps it opening as the Sheet; the office clerk (test@test.com, a commenter
// share) opens it every morning. Looking at it as a board or a calendar must never change how it
// opens for either of them; only the owner's explicit designation does.
//
//   node scripts/campaign-tests/viewswitch_walk.mjs            (archives the table at the end)
//   VS_ORIGIN=http://view-switch.localhost:3001 VS_SHOTS=<dir> node …
//
// The table is admin@admin.com's own disposable one in admin's Workspace, made and archived here
// through the store's doors as admin. Credentials come from .env.local and are never printed.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

import { signIn, sleep, until } from "../lib/seat-browser.mjs";
import { signedInClient } from "./use-cases/_client.mjs";

const ORIGIN = process.env.VS_ORIGIN ?? "http://view-switch.localhost:3001";
const HOST = new URL(ORIGIN).hostname;
const OUT = process.env.VS_SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-25/view-switch";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const HOME = "19b5970f-b3e5-5d34-b505-d8c44450d42f"; // its home
const TEST_ID = "4060701e-706a-4c76-b3ca-0bbc69fa5a14"; // test@test.com
const SLOW = 600000; // the shared preview compiles a route in minutes under load
mkdirSync(OUT, { recursive: true });

const { client } = await signedInClient();
const call = async (fn, args) => {
  const { data, error } = await client.schema("custom").rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code ?? ""} ${error.message}`.trim());
  return Array.isArray(data) ? data[0] : data;
};

const facts = { steps: [] };
const failures = [];
const check = (ok, what, saw) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${what}${saw === undefined ? "" : ` — ${saw}`}`);
  facts.steps.push({ ok, what, saw });
  if (!ok) failures.push(what);
};

// ── the disposable table, as admin ─────────────────────────────────────────────────────────────
const stamp = Date.now();
const tableId = await call("table_declare", {
  p_organization_id: ORG,
  p_spec: {
    name: `Calder Fabrication — Invoices (view-switch walk ${new Date(stamp).toISOString().slice(0, 16).replace("T", " ")}Z)`,
    slug: `calder_invoices_viewswitch_${stamp}`.slice(0, 60),
    type: "entity", display: "list", weight: "light", ordered: false, row_order: "sorted",
    title_field: "invoice_number", label_singular: "invoice", label_plural: "invoices",
    retention_days: 365, agent_writable: true,
    default_sort: [{ field: "due_date", direction: "asc" }],
    parent_id: HOME,
    fields: [{ name: "invoice_number" }],
  },
});
await call("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "invoice_number", label: "Invoice", type: "text", source: "manual" } });
await call("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "customer", label: "Customer", type: "text", source: "manual" } });
await call("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "due_date", label: "Due date", type: "datetime", source: "manual" } });
for (const doc of [
  { invoice_number: "INV-20417", customer: "Harbor Point Marina — gangway railings", due_date: "2026-03-01" },
  { invoice_number: "INV-20418", customer: "Delgado Brewing — mezzanine stairs", due_date: "2026-03-15" },
]) {
  await call("record_write", { p_organization_id: ORG, p_table_id: tableId, p_data: doc });
}
const viewId = await call("view_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: { name: "All records", definition: { layout: "sheet", is_default: true } },
});
await call("share_grant", { p_organization_id: ORG, p_subject_id: tableId, p_principal_kind: "user", p_principal_id: TEST_ID, p_level: "commenter" });
facts.tableId = tableId;
facts.viewId = viewId;
console.log(`table ${tableId} · default view ${viewId} (the Sheet) · test@test.com shared as commenter`);

const storedDefault = async () => {
  const { data } = await client.schema("custom").rpc("views", { p_organization_id: ORG, p_table_id: tableId });
  const view = (data ?? []).find((v) => v.view_id === viewId);
  return view?.definition?.layout ?? null;
};

// ── the browser ────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const url = `${ORIGIN}/data-v2/${tableId}`;

async function seat(which) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(SLOW);
  const writes = [];
  page.on("response", async (res) => {
    if (!/\/rpc\/view_(declare|designate)/.test(res.url())) return;
    let body = "";
    try { body = (await res.text()).slice(0, 400); } catch { /* gone */ }
    writes.push({ door: res.url().split("/rpc/")[1], status: res.status(), body });
  });
  if (which === "admin") {
    const env = Object.fromEntries(
      (await import("node:fs")).readFileSync("/Users/armanisadeghi/code/matrx-frontend/.env.local", "utf8")
        .split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"(.*)"$/, "$1")]),
    );
    const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME || "admin@admin.com", env.AI_ADMIN_PASSWORD, "admin");
    check(who === "admin@admin.com", "admin seat is admin@admin.com", who);
  } else {
    const nonce = randomBytes(16).toString("hex");
    writeFileSync(`/Users/armanisadeghi/code/matrx-frontend/.dev-login-nonce.${HOST}`, `${nonce}\n`);
    await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=/dashboard&as=${encodeURIComponent("test@test.com")}`, { waitUntil: "domcontentloaded" });
    const { v } = await until("test sign-in", async () => {
      const seen = await page.evaluate(async () => { try { return await (await fetch("/api/whoami")).json(); } catch { return null; } });
      return seen?.email ?? null;
    }, SLOW);
    check(v === "test@test.com", "member seat is test@test.com", v);
  }
  return { page, context, writes };
}

async function face(page) {
  await until("the table's face", async () =>
    page.evaluate(() => Boolean(document.querySelector("main [data-host-layout]") ||
      document.querySelector('main [aria-label="Layout"]') || document.querySelector("main [data-table-menu]"))), SLOW);
  await sleep(3000);
  return page.evaluate(() => ({
    sheet: Boolean(document.querySelector("main [data-host-layout='sheet']")),
    pressed: Array.from(document.querySelectorAll('main [aria-label="Layout"] button[aria-pressed="true"]')).map((b) => (b.textContent ?? "").trim()),
    notice: Array.from(document.querySelectorAll("main [role='alert'], main [data-view-save-refused]")).map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 240)),
  }));
}

async function open(page, name) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const seen = await face(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return seen;
}

async function pickFromMenu(page, word) {
  const inline = page.locator(`main [aria-label="Layout"] button:has-text("${word}")`);
  if (await inline.count()) {
    await inline.first().click();
  } else {
    await page.click("main [data-table-menu]");
    await page.locator(`[role="menuitemradio"]:has-text("${word}")`).first().click();
  }
  await sleep(4000);
}

let walkError = null;
try {
  // 1. admin opens → the Sheet; switches to Kanban, then Calendar; reloads → the Sheet.
  const admin = await seat("admin");
  let seen = await open(admin.page, "01-admin-opens-the-sheet");
  check(seen.sheet, "admin: the designated table opens as the Sheet", JSON.stringify(seen));
  await pickFromMenu(admin.page, "Kanban");
  await admin.page.screenshot({ path: `${OUT}/02-admin-looks-at-kanban.png` });
  await pickFromMenu(admin.page, "Calendar");
  await admin.page.screenshot({ path: `${OUT}/03-admin-looks-at-calendar.png` });
  check((await storedDefault()) === "sheet", "store: after Kanban + Calendar the default view still says sheet", await storedDefault());
  seen = await open(admin.page, "04-admin-reloads-still-the-sheet");
  check(seen.sheet, "admin: after the looks, a reload opens the Sheet", JSON.stringify(seen));

  // 2. the member opens → the Sheet.
  const member = await seat("test");
  seen = await open(member.page, "05-member-opens-the-sheet");
  check(seen.sheet, "member: opens the Sheet", JSON.stringify(seen));

  // 3. the explicit designation, as admin, through the one designate door → Calendar.
  //    (The installed records-ui draws "Make … the default" once it is published; the door it
  //    calls is this one.)
  await call("view_designate", { p_organization_id: ORG, p_table_id: tableId, p_view_id: viewId, p_layout: "calendar" });
  check((await storedDefault()) === "calendar", "store: the explicit designation made the default Calendar", await storedDefault());
  seen = await open(member.page, "06-member-opens-the-calendar");
  check(!seen.sheet && seen.pressed.includes("Calendar"), "member: after the designation, the table opens in the Calendar", JSON.stringify(seen));

  // 4. a look on a table that is NOT a Sheet: admin presses Kanban (the chooser is inline now).
  seen = await open(admin.page, "07-admin-opens-the-calendar");
  await pickFromMenu(admin.page, "Kanban");
  await admin.page.screenshot({ path: `${OUT}/08-admin-looks-at-kanban-on-the-calendar-table.png` });
  const layoutWrites = admin.writes.filter((w) => w.door.startsWith("view_declare") && w.status < 300);
  facts.adminWrites = admin.writes;
  check((await storedDefault()) === "calendar", "store: admin's Kanban look left the default the Calendar", await storedDefault());
  seen = await open(member.page, "09-member-still-opens-the-calendar");
  check(!seen.sheet && seen.pressed.includes("Calendar"), "member: still the Calendar after the owner's look", JSON.stringify(seen));

  // 5. the member's own look writes nothing either.
  await pickFromMenu(member.page, "Kanban");
  await member.page.screenshot({ path: `${OUT}/10-member-looks-at-kanban.png` });
  facts.memberWrites = member.writes;
  check((await storedDefault()) === "calendar", "store: the member's Kanban look left the default the Calendar", await storedDefault());
  facts.layoutWritesAccepted = layoutWrites.length;
} catch (err) {
  walkError = err;
  console.error(`walk stopped: ${err?.message ?? err}`);
  failures.push(`walk stopped: ${String(err?.message ?? err).split("\n")[0]}`);
} finally {
  await browser.close().catch(() => {});
  if (!process.argv.includes("--keep")) {
    // A network blip must never leave the disposable table behind: retry the archive.
    for (let tries = 1; tries <= 5; tries += 1) {
      try {
        let pass = await call("table_archive", { p_organization_id: ORG, p_table_id: tableId, p_chunk: 0, p_include_table: true });
        while (!pass.done) pass = await call("table_archive", { p_organization_id: ORG, p_table_id: tableId, p_chunk: 50, p_include_table: true });
        console.log(`cleanup: ${pass.message}`);
        facts.archived = pass.message;
        break;
      } catch (err) {
        console.error(`cleanup try ${tries}: ${err.message}`);
        await sleep(5000 * tries);
      }
    }
  }
  facts.error = walkError ? String(walkError?.message ?? walkError) : null;
  writeFileSync(`${OUT}/walk.json`, JSON.stringify(facts, null, 2));
}
if (failures.length) {
  console.error(`RED — ${failures.length}: ${failures.join(" | ")}`);
  process.exit(1);
}
console.log("viewswitch_walk: GREEN");
