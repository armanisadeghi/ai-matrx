// scripts/campaign-tails-7/create-from-the-relation-picker-walk.mjs
//
// THE DISPATCHER MAKES THE CUSTOMER SHE IS LOOKING FOR, FROM INSIDE THE JOB — in a browser,
// headless, as a signed-in person, on real Rincon data.
//
// THE USE CASE. Rincon Plumbing Co — Summerland Branch. A call comes in for a slab leak at
// 2290 Ortega Hill Rd from somebody who has never been written down. The dispatcher opens job
// RPS-3104, goes to its Customer column — and before today the picker's last word was
// "Nothing in that table matches." She had to leave the job, find the Customers table, add a
// row, come back, re-open the picker and search again, hoping the job had not lost what she
// had typed into it.
//
// WHAT THIS PROVES, AND WHERE IT WAS DECIDED. TAILS-5 left this half open and pointed at
// `InlineCreate` in matrx-frontend's `reference-picker` overlay, reachable only from
// ContextMenuV3's "Insert reference…". That overlay is a DIFFERENT system: it builds a
// ```matrx fence to paste into prose, through `createEntityRow` on platform entities, and it
// knows nothing about a records Table. Wiring it into the grid would have been a fork of the
// wrong primitive. The one builder for a relation VALUE is `RelationPicker` in
// `@ai-matrx/records-ui` — the control the grid cell, the record form, the record rail and the
// public form runner all draw — so the create went there, once, and all of them inherited it.
//
// Headless only, never the in-app Browser pane: that is the owner's screen.
//
//   TAILS7_ORIGIN   http://tails7.localhost:3001 by default (the ONE shared dev server)
//   TAILS7_JOBS     the Jobs table id
//   TAILS7_OUT      where the screenshots go

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { signIn, setOrganization, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.TAILS7_ORIGIN ?? "http://tails7.localhost:3001";
const JOBS = process.env.TAILS7_JOBS;
const ORG_NAME = "Rincon Plumbing Co — Summerland Branch";
const JOB = process.env.TAILS7_JOB ?? "RPS-3104";
// A Summerland name that belongs to nobody: the branch's own naming, never a real person and
// never "Test Customer 1".
const NEW_CUSTOMER = process.env.TAILS7_NEW_CUSTOMER ?? "Delfina Arreola";
const OUT = process.env.TAILS7_OUT ?? "/tmp/tails7";
const EMAIL = process.env.AI_ADMIN_USERNAME;
const PASSWORD = process.env.AI_ADMIN_PASSWORD;
if (!JOBS) throw new Error("TAILS7_JOBS (the Jobs table id) is required");
if (!EMAIL || !PASSWORD) throw new Error("AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD are required");

mkdirSync(OUT, { recursive: true });
const said = {};
let n = 0;
const shot = async (page, name) => {
  n += 1;
  const file = `${OUT}/tails7-${n}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`   shot ${file}`);
  return file;
};
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

/** Fire the whole pointer sequence Radix listens for, not just `click`. */
const press = (page, findInPage) =>
  page.evaluate((src) => {
    // eslint-disable-next-line no-new-func
    const el = new Function(`return (${src})()`)();
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, button: 0 }));
    }
    return true;
  }, findInPage);

const typeInto = (page, selector, value) =>
  page.evaluate(
    ({ sel, v }) => {
      const box = Array.from(document.querySelectorAll(sel)).find((b) => b.offsetParent !== null);
      if (!box) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(box, v);
      box.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    },
    { sel: selector, v: value },
  );

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1420, height: 950 } });
  const page = await ctx.newPage();

  // Every refusal the store sends back, verbatim.
  const refusals = [];
  page.on("response", async (res) => {
    try {
      if (!/\/rpc\/record_write/.test(res.url())) return;
      if (res.status() < 400) return;
      refusals.push({ url: res.url().split("?")[0], status: res.status(), body: (await res.text()).slice(0, 900) });
    } catch {}
  });

  said.signed_in_as = await signIn(page, ORIGIN, EMAIL, PASSWORD);
  said.organization_found = await setOrganization(page, ORG_NAME);

  // ── 1 — THE JOB THAT HAS NOBODY ON IT YET.
  await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const { v: grid } = await until("the Jobs grid", async () => (await text(page)).includes(JOB), 120000);
  if (!grid) throw new Error(`the Jobs grid never drew ${JOB} — screen said: ${(await text(page)).slice(0, 400)}`);
  said.grid_before = (await text(page)).slice(0, 700);
  said.the_new_customer_was_not_in_the_book_before = !said.grid_before.includes(NEW_CUSTOMER);
  await shot(page, "the-job-with-nobody-on-it");

  // ── 2 — SHE OPENS THE JOB'S CUSTOMER CELL.
  said.record_opened = await page.evaluate((job) => {
    const row = Array.from(document.querySelectorAll("tr")).find((x) => new RegExp(job).test(x.textContent ?? ""));
    const idx = Array.from(document.querySelectorAll("th")).findIndex((h) => /customer/i.test(h.textContent ?? ""));
    const cell = row?.querySelectorAll("td")[idx];
    if (!cell) return false;
    cell.scrollIntoView({ block: "center" });
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      cell.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
    return true;
  }, JOB);
  await sleep(2500);

  await press(page, `() => { const e = Array.from(document.querySelectorAll('[aria-label="Edit Customer"]')).filter(x => x.offsetParent !== null); return e[e.length - 1]; }`);
  await sleep(1500);

  said.picker_opened = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("[aria-label]")).find(
      (el) => /^Pick for /i.test(el.getAttribute("aria-label") ?? "") && el.offsetParent !== null,
    );
    if (!b) return null;
    b.scrollIntoView({ block: "center" });
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      b.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, button: 0 }));
    }
    return b.getAttribute("aria-label");
  });
  if (!said.picker_opened) throw new Error("no relation picker on the Customer field");
  await sleep(1500);

  // ── 3 — THE CONTROL THAT WAS NOT THERE. With nothing typed it names the target Table.
  // 🚨 SCOPED TO THE POPOVER, AND THE FIRST RUN OF THIS WALK PROVES WHY. A page-wide search
  // for a button reading /^New / found the grid's own "New view" and recorded it as the
  // picker's control — a green reading of the wrong button. The popover is the element that
  // holds the picker's Search box; everything asserted about the picker is asked inside it.
  const inPicker = (fn) =>
    page.evaluate((src) => {
      const search = Array.from(document.querySelectorAll('input[placeholder="Search"]')).find(
        (b) => b.offsetParent !== null,
      );
      const pop = search?.closest("[data-radix-popper-content-wrapper]") ?? search?.parentElement;
      if (!pop) return null;
      // eslint-disable-next-line no-new-func
      return new Function("pop", `return (${src})(pop)`)(pop);
    }, fn.toString());

  const { v: named } = await until(
    "the create control naming the target Table",
    async () =>
      inPicker((pop) =>
        Array.from(pop.querySelectorAll("button"))
          .map((b) => (b.textContent || "").trim())
          .find((t) => /^New /.test(t)) ?? false,
      ),
    20000,
  );
  said.create_control_before_typing = named || null;
  if (!named) throw new Error("the picker offers no way to make a new one");
  await shot(page, "the-picker-offers-to-make-a-new-one");

  // ── 4 — SHE TYPES THE CALLER'S NAME. Nothing matches, and WHAT SHE TYPED IS THE OFFER.
  await typeInto(page, 'input[placeholder="Search"]', NEW_CUSTOMER);
  await sleep(1200);
  said.what_the_picker_said_when_nothing_matched = await page.evaluate(() =>
    (Array.from(document.querySelectorAll("p")).find((p) =>
      /nothing in that table matches/i.test(p.textContent ?? ""),
    )?.textContent ?? "").trim(),
  );
  said.create_control_after_typing = await inPicker((pop) =>
    Array.from(pop.querySelectorAll("button"))
      .map((b) => (b.textContent || "").trim())
      .find((t) => /^Create /.test(t)) ?? null,
  );
  if (!said.create_control_after_typing) {
    throw new Error("the picker did not offer to create what she typed");
  }
  await shot(page, "create-what-she-typed");

  // ── 5 — ONE PRESS.
  await press(page, `() => { const s = Array.from(document.querySelectorAll('input[placeholder="Search"]')).find(b => b.offsetParent !== null); const pop = s.closest('[data-radix-popper-content-wrapper]') || s.parentElement; return Array.from(pop.querySelectorAll('button')).find(b => /^Create /.test((b.textContent || '').trim())); }`);
  const { v: chipped } = await until(
    "the new customer as a chip on the job",
    async () => (await text(page)).includes(NEW_CUSTOMER),
    30000,
  );
  said.the_new_customer_is_on_the_job_before_saving = Boolean(chipped);
  if (!chipped) {
    writeFileSync(`${OUT}/tails7-refusals.json`, JSON.stringify(refusals, null, 2));
    throw new Error(`nothing came back — screen said: ${(await text(page)).slice(0, 600)}`);
  }
  await sleep(1200);
  await shot(page, "the-new-customer-is-picked");

  // ── 6 — SHE COMMITS THE RECORD the way a person does.
  await page.keyboard.press("Escape");
  await sleep(1200);
  said.committed_with = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => x.offsetParent !== null && /^(save|done|apply|save record)$/i.test((x.textContent ?? "").trim()),
    );
    if (!b) return null;
    b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return (b.textContent ?? "").trim();
  });
  await sleep(3000);

  // 🚨 THE ONLY PROOF THAT COUNTS: load the page again from nothing and read the column. The
  // picker drawing a name proves a picker can draw a name; only a fresh read proves the JOB
  // names a customer who did not exist when she opened it.
  await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const { v: back } = await until(
    "the new customer on the reloaded Jobs grid",
    async () => (await text(page)).includes(NEW_CUSTOMER),
    120000,
  );
  said.after_a_full_reload_the_job_names_her = Boolean(back);
  said.the_job_and_what_its_customer_cell_reads = await page.evaluate(
    ({ job, who }) => {
      const idx = Array.from(document.querySelectorAll("th")).findIndex((h) => /customer/i.test(h.textContent ?? ""));
      const row = Array.from(document.querySelectorAll("tr")).find((x) => new RegExp(who).test(x.textContent ?? ""));
      const cells = row ? Array.from(row.querySelectorAll("td")).map((c) => (c.textContent ?? "").trim()) : [];
      return { asked_for: job, row_found: Boolean(row), customer_cell: cells[idx] ?? null, row: cells.join(" | ") };
    },
    { job: JOB, who: NEW_CUSTOMER },
  );
  await shot(page, "after-a-full-reload-the-job-names-her");

  // ── 7 — AND SHE IS IN THE CUSTOMERS BOOK, as a record of that Table, not a loose string.
  await page.goto(`${ORIGIN}/data-v2/${process.env.TAILS7_CUSTOMERS ?? ""}`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  const { v: inBook } = await until(
    "the new customer in the Customers table",
    async () => (await text(page)).includes(NEW_CUSTOMER),
    120000,
  );
  said.she_is_in_the_customers_table = Boolean(inBook);
  await shot(page, "she-is-in-the-customers-book");

  if (!said.after_a_full_reload_the_job_names_her) {
    throw new Error("the job did NOT name her after a reload — the whole point of the walk");
  }

  writeFileSync(`${OUT}/tails7-walk.json`, JSON.stringify(said, null, 2));
  console.log(JSON.stringify(said, null, 2));
} finally {
  await browser.close();
}
