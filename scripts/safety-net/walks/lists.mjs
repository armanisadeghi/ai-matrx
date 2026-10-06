// scripts/safety-net/walks/lists.mjs — LANE SN-DH (2026-10-01), check `lists.walk-lists`.
// Items: L01 lists read the store only (/pick-lists and a list page) · L02 a choice column bound to a list
// (its chips are the list's words; adding a word to the list adds it to the column's choices).
//
// THE REAL USE CASE: the front desk of Cedar Ridge Physical Therapy keeps a pick list "Visit Types <STAMP>"
// (Initial Evaluation, Follow-up, Re-evaluation, Discharge Visit) and a table "Visit Notes <STAMP>" whose
// "Visit type" column takes its choices from that list. A fifth visit type is added to the LIST; the column
// offers it with no edit of its own.
//
// Seat: admin@admin.com working in Cedar Ridge. The list and the table are made through the product's own
// doors as the seat (the same calls the pages make), carry STAMP in their names and are archived in cleanup.
// Runs unchanged on live and on the clone preview.
import { openWalk, bodyText, sleep, until, FIXTURE_ORG, FIXTURE_ORG_ID, STAMP } from "../lib/harness.mjs";

const ctx = await openWalk("lists");
const LIST_NAME = `Visit Types ${STAMP}`;
const TABLE_NAME = `Visit Notes ${STAMP}`;
const WORDS = ["Initial Evaluation", "Follow-up", "Re-evaluation", "Discharge Visit"];
const EXTRA = "Telehealth Visit";
const RED = /could not be read|statement timeout|canceling statement|schema cache|PGRST\d+|permission denied|Something went wrong|\[object Object\]/i;

let base = null;
let apikey = null;
const calls = [];

function sessionOf(cookies) {
  const parts = cookies
    .filter((c) => /^sb-(matrx-auth-v2|.*-auth-token)(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!parts.length) throw new Error("no Supabase session cookie after sign-in");
  let raw = decodeURIComponent(parts.map((c) => c.value).join(""));
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
  return JSON.parse(raw);
}

/** A door, called as the signed-in seat (the page's own token). schema = the Content-Profile (custom, …). */
async function door(page, fn, args, schema = "public") {
  const session = sessionOf(await page.context().cookies());
  const headers = { apikey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  if (schema) {
    headers["Content-Profile"] = schema;
    headers["Accept-Profile"] = schema;
  }
  const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) });
  const t = await r.text();
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
  } catch {
    data = t;
  }
  return { status: r.status, data, userId: session.user?.id };
}

async function waitText(page, re, ms = 150000) {
  return (await until(`the page to say ${re}`, async () => ((await bodyText(page, 30000)).match(re) ? true : null), ms)).v;
}

const words = (arr) => arr.map((w) => String(w).trim());

let listId = null;
let tableId = null;
let fieldId = null;

try {
  const page = await ctx.page("admin");
  const ready = page.__org === FIXTURE_ORG;
  page.on("request", (r) => {
    const m = r.url().match(/^(https?:\/\/[^/]+)\/rest\/v1\/(.*)$/);
    if (m) {
      if (!base) {
        base = m[1];
        apikey = r.headers()["apikey"] ?? apikey;
      }
      calls.push(m[2].split("?")[0]);
    }
  });
  const failed = [];
  page.on("response", async (r) => {
    if (r.status() >= 400 && /\/rest\/v1\//.test(r.url())) failed.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+\/rest\/v1\//, "").slice(0, 60)}`);
  });

  // ── L01: /pick-lists opens quietly ───────────────────────────────────────────────────────────────
  await ctx.goto(page, "/pick-lists");
  await ctx.step(["L01"], "/pick-lists opens in Cedar Ridge, quietly", page, async () => {
    if (!ready) return { ok: false, detail: `the switcher does not name ${FIXTURE_ORG}` };
    await until("the lists page", async () => (await bodyText(page, 3000)).match(/list/i) ? true : null, 120000);
    await sleep(8000);
    const t = await bodyText(page, 30000);
    const red = t.match(RED);
    const older = [...new Set(calls.filter((c) => /udt_/.test(c)))];
    return {
      ok: !red && failed.length === 0 && older.length === 0 && !!base,
      detail: red ? `red sentence: "${t.slice(Math.max(0, red.index - 60), red.index + 100).replace(/\s+/g, " ")}"` : failed.length ? `failed calls: ${failed.slice(0, 4).join(" | ")}` : older.length ? `the page read the older list tables directly: ${older.join(", ")}` : `quiet; reads: ${[...new Set(calls)].slice(0, 6).join(", ")}`,
    };
  });
  if (!base) throw new Error("no Supabase request was seen on /pick-lists — cannot call the doors");

  // ── make the list (born in the store through custom.pick_list_create: where_lists_live says record) ───────────────────────────────
  await ctx.step(["L01"], `"${LIST_NAME}" is made and lives in the store`, page, async () => {
    const made = await door(page, "pick_list_create", {
      p_organization_id: FIXTURE_ORG_ID,
      p_list_name: LIST_NAME,
      p_description: "The kinds of visit the front desk books.",
      p_items: WORDS.map((w) => ({ label: w })),
    }, "custom");
    if (made.status >= 300) return { ok: false, detail: `pick_list_create answered ${made.status}: ${JSON.stringify(made.data).slice(0, 200)}` };
    listId = made.data?.list_id ?? null;
    if (!listId) return { ok: false, detail: `no list id: ${JSON.stringify(made.data).slice(0, 200)}` };
    ctx.cleanup(async () => {
      for (let i = 0; i < 20; i++) {
        const r = await door(page, "table_archive", { p_organization_id: FIXTURE_ORG_ID, p_table_id: listId, p_chunk: 50, p_include_table: true }, "custom");
        if (r.status >= 300) throw new Error(`archiving the list: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
        if (r.data?.done === true || r.data?.finished === true || r.data?.remaining === 0 || r.data?.archived_table === true) break;
      }
    });
    const lives = await door(page, "where_lists_live", { p_list_ids: [listId] }, "custom");
    const where = JSON.stringify(lives.data);
    return { ok: /record/.test(where), detail: `list ${listId.slice(0, 8)}…: where_lists_live ${where.slice(0, 120)}` };
  });

  // ── L01: the list appears on /pick-lists and opens as a page with its four words ──────────────────────
  await ctx.step(["L01"], "/pick-lists lists it and its page shows the four words", page, async () => {
    if (!listId) return { skip: "no list was made" };
    await ctx.goto(page, "/pick-lists");
    const seen = await waitText(page, new RegExp(LIST_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), 150000);
    if (!seen) return { ok: false, detail: `/pick-lists never listed "${LIST_NAME}"` };
    await page.getByText(LIST_NAME).first().evaluate((el) => el.click());
    const opened = (await until("the list's own address", async () => (page.url().includes(`/pick-lists/${listId}`) ? true : null), 60000)).v;
    await sleep(6000);
    const t = await bodyText(page, 30000);
    const missing = WORDS.filter((w) => !t.includes(w));
    return { ok: !!opened && missing.length === 0 && !RED.test(t), detail: `opened ${page.url().replace(/^https?:\/\/[^/]+/, "")}; ${missing.length ? "missing: " + missing.join(", ") : "all four words shown"}` };
  });

  // ── L02: a table whose "Visit type" column takes its choices from the list ──────────────────────────
  await ctx.step(["L02"], `"${TABLE_NAME}" is made with a Visit type column bound to the list`, page, async () => {
    if (!listId) return { skip: "no list was made" };
    await ctx.goto(page, "/data");
    const nt = page.getByRole("button", { name: "New table" }).first();
    await nt.waitFor({ timeout: 120000 });
    await nt.click();
    await page.getByPlaceholder("Table name").fill(TABLE_NAME);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    tableId = (await until("the new table opens", async () => page.url().match(/\/data\/([0-9a-f-]{36})/)?.[1] ?? null, 120000)).v;
    if (!tableId) return { ok: false, detail: `the new table did not open (still at ${page.url()})` };
    ctx.cleanup(async () => {
      for (let i = 0; i < 20; i++) {
        const r = await door(page, "table_archive", { p_organization_id: FIXTURE_ORG_ID, p_table_id: tableId, p_chunk: 50, p_include_table: true }, "custom");
        if (r.status >= 300) throw new Error(`archiving the table: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
        if (r.data?.done === true || r.data?.finished === true || r.data?.remaining === 0 || r.data?.archived_table === true) break;
      }
    });
    await sleep(3000);
    const declared = await door(page, "field_declare", {
      p_organization_id: FIXTURE_ORG_ID,
      p_table_id: tableId,
      p_spec: { key: "visit_type", label: "Visit type", parity_type: "select", options_table_id: listId },
    }, "custom");
    if (declared.status >= 300) return { ok: false, detail: `field_declare answered ${declared.status}: ${JSON.stringify(declared.data).slice(0, 240)}` };
    fieldId = typeof declared.data === "string" ? declared.data : declared.data?.field_id ?? declared.data?.id ?? null;
    const offered = await door(page, "field_options", { p_organization_id: FIXTURE_ORG_ID, p_field_id: fieldId }, "custom");
    const names = (Array.isArray(offered.data) ? offered.data : []).map((r) => r?.data?.name ?? r?.data?.label ?? r?.name ?? "");
    const have = WORDS.filter((w) => names.includes(w));
    return { ok: have.length === WORDS.length, detail: `field ${String(fieldId).slice(0, 8)}…; field_options offers ${names.length} words (${have.length}/4 of the list's)` };
  });

  async function chipsOnPage() {
    await ctx.goto(page, `/data/${tableId}`);
    await until("the Visit type column", async () => (await page.locator("thead th", { hasText: "Visit type" }).count()) > 0 || null, 120000);
    await sleep(2000);
    // open the column's settings: its choices read from the list
    await page.locator("th", { hasText: "Visit type" }).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: /Column settings/ }).first().click();
    const dialog = page.getByRole("dialog").filter({ hasText: "Visit type" });
    await dialog.waitFor({ timeout: 30000 });
    await sleep(2500);
    const inputs = await dialog.locator('input[aria-label="Option value"]').evaluateAll((els) => els.map((e) => e.value));
    const text = (await dialog.innerText().catch(() => "")).replace(/\s+/g, " ");
    await page.keyboard.press("Escape");
    return { inputs, text };
  }

  await ctx.step(["L02"], "the column's choices are the list's words", page, async () => {
    if (!tableId || !fieldId) return { skip: "no bound column was made" };
    const { inputs, text } = await chipsOnPage();
    const shown = inputs.length ? inputs : WORDS.filter((w) => text.includes(w));
    const missing = WORDS.filter((w) => !shown.includes(w) && !text.includes(w));
    return { ok: missing.length === 0, detail: `the column editor shows ${shown.length} choices (${shown.join(", ").slice(0, 120)})${missing.length ? "; missing " + missing.join(", ") : ""}` };
  });

  await ctx.step(["L02"], `a word added to the list (${EXTRA}) appears in the column's choices`, page, async () => {
    if (!tableId || !fieldId) return { skip: "no bound column was made" };
    const added = await door(page, "record_write", { p_organization_id: FIXTURE_ORG_ID, p_table_id: listId, p_data: { name: EXTRA } }, "custom");
    if (added.status >= 300) return { ok: false, detail: `adding a word to the list: ${added.status} ${JSON.stringify(added.data).slice(0, 220)}` };
    const offered = await door(page, "field_options", { p_organization_id: FIXTURE_ORG_ID, p_field_id: fieldId }, "custom");
    const names = (Array.isArray(offered.data) ? offered.data : []).map((r) => r?.data?.name ?? r?.data?.label ?? r?.name ?? "");
    const viaDoor = names.includes(EXTRA);
    const { inputs, text } = await chipsOnPage();
    const onPage = inputs.includes(EXTRA) || text.includes(EXTRA);
    return { ok: viaDoor && onPage, detail: `${EXTRA}: field_options ${viaDoor ? "offers it" : "does NOT offer it"}; the column editor ${onPage ? "shows it" : "does NOT show it"} (${inputs.length} choices)` };
  });
} finally {
  await ctx.finish();
}
