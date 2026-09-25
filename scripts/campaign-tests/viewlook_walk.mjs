// LANE VIEW-STATE-PERSONAL — the headless walk on the shared preview (LIVE database, the INSTALLED
// records-ui), both seats: what the store's half of "a look is yours until you save it" does for
// www today, before the package that keeps the look is published.
//
// THE USE CASE: Harbor Street Duplex's maintenance requests (VERIFIER-23 item 1). The owner
// (admin@admin.com, editor) keeps the board grouped by Priority; the tenant liaison (test@test.com,
// a viewer share) looks at it. Her Group by pick must never change the owner's board: the store
// now refuses a viewer's write onto the shared view by name (view_declare 42501), so the installed
// page says so instead of rewriting everyone's board. The owner's own change still saves (editor).
//
//   node scripts/campaign-tests/viewlook_walk.mjs            (archives the table at the end)
//   VS_ORIGIN=http://view-look.localhost:3001 VS_SHOTS=<dir> node …
//
// The table is admin@admin.com's own disposable one in admin's Workspace, made and archived here
// through the store's doors as admin. Credentials come from .env.local and are never printed.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

import { signIn, sleep, until } from "../lib/seat-browser.mjs";
import { signedInClient } from "./use-cases/_client.mjs";

const ORIGIN = process.env.VS_ORIGIN ?? "http://view-look.localhost:3001";
const HOST = new URL(ORIGIN).hostname;
const OUT = process.env.VS_SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-25/view-look";
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
    name: `Harbor Street Duplex — maintenance requests (view-look walk ${new Date(stamp).toISOString().slice(0, 16).replace("T", " ")}Z)`,
    slug: `harbor_street_requests_viewlook_${stamp}`.slice(0, 60),
    type: "entity", display: "list", weight: "light", ordered: false, row_order: "sorted",
    title_field: "request", label_singular: "maintenance request", label_plural: "maintenance requests",
    retention_days: 365, agent_writable: true,
    default_sort: [{ field: "request", direction: "asc" }],
    parent_id: HOME,
    fields: [{ name: "request" }],
  },
});
await call("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "request", label: "Request", type: "text", source: "manual" } });
await call("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "priority", label: "Priority", type: "select", source: "manual", options: ["Urgent", "This week", "When convenient"] } });
await call("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "status", label: "Status", type: "select", source: "manual", options: ["Open", "Scheduled", "Done"] } });
for (const doc of [
  { request: "Kitchen sink drips under the basin — Unit A", priority: "This week", status: "Open" },
  { request: "Smoke detector chirps in the hallway — Unit B", priority: "Urgent", status: "Scheduled" },
  { request: "Bathroom fan is loud — Unit A", priority: "When convenient", status: "Done" },
]) {
  await call("record_write", { p_organization_id: ORG, p_table_id: tableId, p_data: doc });
}
const viewId = await call("view_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: { name: "All records", definition: { layout: "kanban", group_field: "priority", is_default: true } },
});
await call("share_grant", { p_organization_id: ORG, p_subject_id: tableId, p_principal_kind: "user", p_principal_id: TEST_ID, p_level: "viewer" });
facts.tableId = tableId;
facts.viewId = viewId;
console.log(`table ${tableId} · default view ${viewId} (board by Priority) · test@test.com shared as viewer`);

const storedGroup = async () => {
  const { data } = await client.schema("custom").rpc("views", { p_organization_id: ORG, p_table_id: tableId });
  const view = (data ?? []).find((v) => v.view_id === viewId);
  return view?.definition?.group_field ?? null;
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
    if (!/\/rpc\/view_(declare|designate|look_set)/.test(res.url())) return;
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
  await until("the board's Group by", async () =>
    page.evaluate(() => Boolean(document.querySelector('main select[aria-label="Group by which field"]'))), SLOW);
  return page.evaluate(() => ({
    group: document.querySelector('main select[aria-label="Group by which field"]')?.value ?? null,
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
  // 1. admin opens → the board grouped by the view's Priority.
  const admin = await seat("admin");
  let seen = await open(admin.page, "preview-01-owner-opens-board-by-priority");
  check(seen.group === "priority", "admin: the board opens grouped by the view's Priority", JSON.stringify(seen));

  // 2. the liaison opens it, and groups it by Status.
  const member = await seat("test");
  seen = await open(member.page, "preview-02-liaison-opens-board-by-priority");
  check(seen.group === "priority", "member: the board opens grouped by the view's Priority", JSON.stringify(seen));
  await member.page.locator('main select[aria-label="Group by which field"]').selectOption("status");
  await sleep(5000);
  await member.page.screenshot({ path: `${OUT}/preview-03-liaison-groups-by-status-refused-honestly.png` });
  const memberDeclares = member.writes.filter((w) => w.door.startsWith("view_declare"));
  facts.memberWrites = member.writes;
  check(memberDeclares.every((w) => w.status >= 400), "store: the member's write onto the shared view was refused", JSON.stringify(memberDeclares.map((w) => [w.status, w.body.slice(0, 160)])));
  const notice = await member.page.evaluate(() => Array.from(document.querySelectorAll("main [role='alert'], main [data-view-save-refused]")).map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300)));
  facts.memberNotice = notice;
  check((await storedGroup()) === "priority", "store: the shared view still groups by Priority", await storedGroup());

  // 3. the owner reloads → still Priority.
  seen = await open(admin.page, "preview-04-owner-still-sees-priority");
  check(seen.group === "priority", "admin: after the member's pick, still Priority", JSON.stringify(seen));

  // 4. the owner's own change (editor) saves onto the view; the member now sees it.
  await admin.page.locator('main select[aria-label="Group by which field"]').selectOption("status");
  await sleep(5000);
  facts.adminWrites = admin.writes;
  check((await storedGroup()) === "status", "store: the editor's change saved onto the view", await storedGroup());
  seen = await open(member.page, "preview-05-liaison-sees-the-owners-saved-status");
  check(seen.group === "status", "member: now sees the view's Status", JSON.stringify(seen));
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
console.log("viewlook_walk: GREEN");
