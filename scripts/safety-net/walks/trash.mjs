// SN-TRASH walk (check tables.walk-trash; items T47 tables, T48 records, T49 views, T50 fields, T54 dashboards).
//
// THE USE CASE: the front-desk lead at Cedar Ridge Physical Therapy keeps a "Patient Intake Log". She
// removes a record, a column, a saved view and a dashboard — each on its own — finds each in Trash under
// its name, restores it and sees it back where it lived. Then she archives the whole table, restores it
// from Trash and archives it again at the end (archive, never delete).
//
// Runs unchanged on live and on the clone preview. Everything is made through the product's screens; the
// only exceptions are named in the step: the table page has no control that removes a saved view or a
// dashboard (this build), so those two are removed through the store's own doors AS THE SIGNED-IN SEAT
// (public.saved_view_archive / custom.dashboard_delete) — the same calls the product's clients make — and
// restored from the /trash screen. Rules, links, templates, mandates, meetings and terms are not reachable
// from a table page: they stay on the SQL suites (tables.sql-trash-*).
import { openWalk, bodyText, sleep, until, STAMP, FIXTURE_ORG_ID, SEATS } from "../lib/harness.mjs";

const ctx = await openWalk("trash");
const TABLE = `Patient Intake Log ${STAMP}`;
const REC = `Marlene Okafor eval ${STAMP}`;
const FIELD = "Referral source";
const VIEW = `Open evals ${STAMP}`;
let tableId = null;
let stateOk = true;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

try {
  const page = await ctx.page("admin");

  // ── the store's doors as the seat (only for the two kinds the screen cannot remove) ────────────
  let api = null;
  page.on("request", (r) => {
    if (api) return;
    const h = r.headers();
    const m = r.url().match(/^(https:\/\/[^/]+)\/(rest|auth)\/v1\//);
    if (m && h["apikey"]) api = { url: m[1], key: h["apikey"] };
  });
  let token = null;
  async function door(schema, fn, args) {
    if (!api) throw new Error("the page has not made a store request yet");
    if (!token) {
      const r = await fetch(`${api.url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: api.key, "content-type": "application/json" },
        body: JSON.stringify({ email: SEATS.admin.email, password: SEATS.admin.password }),
      });
      token = (await r.json()).access_token;
      if (!token) throw new Error("the seat could not sign in to the store");
    }
    const r = await fetch(`${api.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: api.key, authorization: `Bearer ${token}`, "content-type": "application/json", "content-profile": schema, "accept-profile": schema },
      body: JSON.stringify(args),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${fn}: ${r.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  // ── helpers over the screens ───────────────────────────────────────────────────────────────────
  async function openTable(query = "") {
    await ctx.goto(page, `/data-v2/${tableId}${query}`);
    for (let k = 0; k < 10; k++) {
      await sleep(5000);
      if ((await page.locator("thead th").count()) > 1 || (await page.locator("[data-sheet-layout]").count()) > 0) return true;
      const t = page.getByRole("button", { name: "Try again" });
      if (await t.count()) await t.first().click().catch(() => {});
    }
    return false;
  }
  const headers = () => page.evaluate(() => [...document.querySelectorAll("thead th")].map((t) => t.innerText.replace(/^⚿\s*/, "").trim()));
  const hasHeader = async (name) => (await headers()).some((h) => h.toLowerCase().startsWith(name.toLowerCase()));
  const rowsOf = async (table) => {
    const list = await door("custom", table, { p_organization_id: FIXTURE_ORG_ID, p_table_id: tableId });
    return Array.isArray(list) ? list : [];
  };
  async function trashRow(pred, label, timeoutMs = 90000) {
    // personal Trash, "Recent" overview: the newest rows of every kind
    const r = await until(`Trash row ${label}`, async () => {
      if (!page.url().includes("/trash")) await ctx.goto(page, "/trash");
      const rows = page.locator("li");
      const n = await rows.count();
      for (let i = 0; i < n; i++) {
        const text = (await rows.nth(i).innerText().catch(() => "")).replace(/\s+/g, " ");
        if (pred(text)) return { i, text };
      }
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await sleep(3000);
      return null;
    }, timeoutMs);
    return r.v;
  }
  async function restoreRow(pred, label) {
    const hit = await trashRow(pred, label);
    if (!hit) return { found: false };
    const row = page.locator("li").nth(hit.i);
    await row.getByRole("button", { name: /Restore/ }).first().click();
    const gone = await until(`${label} leaves Trash`, async () => !(await trashRow(pred, label, 1500).catch(() => null)), 45000);
    return { found: true, text: hit.text, gone: !!gone.v };
  }

  // ── setup: the table, a column, a record, a view, a dashboard — through the screens ────────────
  await ctx.step([], "setup: New table", page, async () => {
    await ctx.goto(page, "/data-v2");
    await sleep(6000);
    const nt = page.getByRole("button", { name: /^New table/ }).first();
    await nt.waitFor({ timeout: 90000 });
    await nt.click();
    await sleep(1200);
    await page.getByPlaceholder("Table name").fill(TABLE);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    const r = await until("the new table opens", async () => /\/data-v2\/[0-9a-f-]{36}/.test(page.url()), 90000);
    tableId = page.url().match(/\/data-v2\/([0-9a-f-]{36})/)?.[1] ?? null;
    ctx.cleanup(async () => {
      // archive again at the end, from the table page (the product's own control), unless a step already left it archived
      if (!tableId) return;
      await archiveFromPage().catch((e) => console.log(`[trash] cleanup archive: ${String(e).slice(0, 160)}`));
    });
    return { ok: !!r.v && !!tableId, detail: `${TABLE} → ${tableId}` };
  });
  if (!tableId) {
    await ctx.finish();
    process.exit(1);
  }
  const opened = await openTable();
  await ctx.step([], "setup: the table opens", page, async () => ({ ok: opened, detail: `columns: ${(await headers()).join(" | ")}` }));

  await ctx.step([], `setup: add the "${FIELD}" column`, page, async () => {
    await page.getByRole("button", { name: "Add a column" }).first().click();
    await page.getByLabel("Field name").fill(FIELD);
    await page.getByRole("button", { name: "Create column" }).click();
    const r = await until("the column", () => hasHeader(FIELD), 45000);
    return { ok: !!r.v, detail: (await headers()).join(" | ") };
  });

  await ctx.step([], "setup: add a record", page, async () => {
    await page.getByRole("button", { name: "New record" }).first().click();
    const cell = page.locator("input[id^=cell-]").first();
    await cell.waitFor({ timeout: 30000 });
    await cell.fill(REC);
    await cell.press("Enter");
    const r = await until("the record", async () => (await page.locator("tbody tr", { hasText: REC }).count()) > 0, 45000);
    return { ok: !!r.v, detail: REC };
  });

  let viewId = null;
  await ctx.step([], "setup: add a saved view", page, async () => {
    await page.getByRole("button", { name: /^View: / }).first().click();
    await page.getByRole("button", { name: "New view" }).first().click();
    await page.getByLabel("Name for the new view").fill(VIEW);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const r = await until("the view", async () => (await rowsOf("views")).find((v) => v.name === VIEW) ?? null, 30000);
    viewId = r.v?.view_id ?? null;
    return { ok: !!viewId, detail: `${VIEW} ${viewId ?? ""}` };
  });

  let dashId = null;
  let dashName = null;
  await ctx.step([], "setup: add a dashboard", page, async () => {
    await openTable("?view=dashboards");
    const ids0 = new Set((await rowsOf("dashboards")).map((d) => d.dashboard_id));
    const btn = page.getByRole("button", { name: "New dashboard" }).first();
    await btn.waitFor({ timeout: 60000 });
    await btn.click();
    const r = await until("the dashboard", async () => (await rowsOf("dashboards")).find((d) => !ids0.has(d.dashboard_id)) ?? null, 45000);
    dashId = r.v?.dashboard_id ?? null;
    dashName = r.v?.name ?? null;
    return { ok: !!dashId, detail: `${dashName} ${dashId ?? ""}` };
  });

  // ── T48 a record ───────────────────────────────────────────────────────────────────────────────
  await ctx.step(["T48"], "a removed record is in Trash and Restore brings it back", page, async () => {
    await openTable();
    const row = page.locator("tbody tr", { hasText: REC }).first();
    await row.waitFor({ timeout: 60000 });
    await row.hover();
    await sleep(500);
    await row.getByRole("button", { name: "Delete" }).first().click();
    const ask = page.getByRole("alertdialog");
    await ask.waitFor({ timeout: 20000 });
    await ask.getByRole("button", { name: "Delete", exact: true }).click();
    await sleep(3500);
    if (await page.locator("tbody tr", { hasText: REC }).count()) return { ok: false, detail: "the record is still on the page after Delete" };
    const res = await restoreRow((t) => t.includes(REC) && /Record/.test(t), "record");
    if (!res.found) return { ok: false, detail: `no Trash row for the record "${REC}"` };
    await openTable();
    const back = await until("record back", async () => (await page.locator("tbody tr", { hasText: REC }).count()) > 0, 45000);
    return { ok: res.gone && !!back.v, detail: `Trash row: ${res.text.slice(0, 120)}; left Trash=${res.gone}; back on the table=${!!back.v}` };
  });

  // ── T50 a field ────────────────────────────────────────────────────────────────────────────────
  await ctx.step(["T50"], "a removed column is in Trash and Restore brings it back", page, async () => {
    await openTable();
    await page.locator("thead th", { hasText: new RegExp(esc(FIELD), "i") }).first().click({ button: "right" });
    await sleep(900);
    await page.locator("[role=menu] [role^=menuitem]").filter({ hasText: /^Delete column/ }).first().click();
    const ask = page.getByRole("alertdialog").filter({ hasText: FIELD });
    await ask.waitFor({ timeout: 20000 });
    await ask.getByRole("button", { name: "Delete column", exact: true }).click();
    await sleep(3500);
    if (await hasHeader(FIELD)) return { ok: false, detail: "the column is still on the page after removal" };
    const res = await restoreRow((t) => t.includes(FIELD) && t.includes(TABLE), "field");
    if (!res.found) return { ok: false, detail: `no Trash row for the column "${FIELD}"` };
    await openTable();
    const back = await until("column back", () => hasHeader(FIELD), 45000);
    return { ok: res.gone && !!back.v, detail: `Trash row: ${res.text.slice(0, 120)}; left Trash=${res.gone}; back on the table=${!!back.v}` };
  });

  // ── T49 a view ─────────────────────────────────────────────────────────────────────────────────
  await ctx.step(["T49"], "a removed saved view is in Trash and Restore brings it back", page, async () => {
    if (!viewId) return { skip: "no saved view could be made on this build" };
    await door("public", "saved_view_archive", { p_surface_key: "custom/records", p_id: viewId, p_expected_version: null });
    const res = await restoreRow((t) => t.includes(VIEW), "view");
    if (!res.found) return { ok: false, detail: `no Trash row for the view "${VIEW}"` };
    const back = (await rowsOf("views")).some((v) => v.view_id === viewId);
    await openTable();
    await page.getByRole("button", { name: /^View: / }).first().click().catch(() => {});
    await sleep(1200);
    const shown = await page.locator("[data-radix-popper-content-wrapper]").last().innerText().catch(() => "");
    return { ok: res.gone && back && shown.includes(VIEW), detail: `removed through the store's door (the screen has none); Trash row: ${res.text.slice(0, 100)}; left Trash=${res.gone}; listed again by the table=${back}; picker shows it=${shown.includes(VIEW)}` };
  });

  // ── T54 a dashboard ────────────────────────────────────────────────────────────────────────────
  await ctx.step(["T54"], "a removed dashboard is in Trash and Restore brings it back", page, async () => {
    if (!dashId) return { skip: "no dashboard could be made on this build" };
    await door("custom", "dashboard_delete", { p_organization_id: FIXTURE_ORG_ID, p_dashboard_id: dashId });
    const res = await restoreRow((t) => t.includes(dashName) && t.includes(TABLE), "dashboard");
    if (!res.found) return { ok: false, detail: `no Trash row for the dashboard "${dashName}"` };
    const back = (await rowsOf("dashboards")).some((d) => d.dashboard_id === dashId);
    await openTable("?view=dashboards");
    const shown = await until("dashboard shown", async () => (await bodyText(page, 8000)).includes(dashName), 30000);
    return { ok: res.gone && back && !!shown.v, detail: `removed through the store's door (the screen has none); Trash row: ${res.text.slice(0, 100)}; left Trash=${res.gone}; listed again=${back}; page shows it=${!!shown.v}` };
  });

  // ── T47 the table ──────────────────────────────────────────────────────────────────────────────
  async function archiveFromPage() {
    await openTable();
    await page.getByRole("button", { name: "Table menu" }).first().click({ timeout: 30000 });
    await sleep(800);
    await page.locator('[role="menu"], [data-radix-popper-content-wrapper]').getByText("Settings", { exact: true }).first().click({ timeout: 30000 });
    const ask = page.getByRole("button", { name: "Archive this table" }).first();
    await ask.scrollIntoViewIfNeeded({ timeout: 30000 });
    await ask.click({ timeout: 30000 });
    await page.getByRole("button", { name: "Archive this table" }).first().click({ timeout: 30000 });
    await sleep(6000);
  }
  await ctx.step(["T47"], "an archived table is in Trash and Restore brings it back with its records", page, async () => {
    await archiveFromPage();
    const res = await restoreRow((t) => t.includes(TABLE) && /Table/.test(t) && !t.includes(`(in ${TABLE}`), "table");
    if (!res.found) return { ok: false, detail: `no Trash row for the table "${TABLE}" after Archive this table` };
    const ok = await openTable();
    const back = await until("record visible", async () => (await page.locator("tbody tr", { hasText: REC }).count()) > 0, 60000);
    return { ok: res.gone && ok && !!back.v, detail: `Trash row: ${res.text.slice(0, 100)}; left Trash=${res.gone}; table opens=${ok}; its record is back=${!!back.v}` };
  });
} finally {
  await ctx.finish();
}
