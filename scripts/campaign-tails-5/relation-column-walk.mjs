// scripts/campaign-tails-5/relation-column-walk.mjs — A PLUMBER ADDS A COLUMN THAT POINTS AT
// HIS OWN CUSTOMERS, in a browser, headless, as a signed-in person.
//
// THE USE CASE. Rincon Plumbing Co opened a Summerland branch. The office keeps Customers and
// Jobs in two Tables and has not connected them: every job repeats the customer's name as
// text, so nobody can open a customer and see their jobs. The branch manager — a plumber, not
// a developer — adds a "Customer" column to Jobs that points at the Customers Table, and picks
// which of the customer's own columns the chip should show.
//
// WHY THIS WALK EXISTS. `scripts/campaign-tests/w1_rel_red.sql` said for two days that
// `custom.field_declare` "refuses the word `relation` by name, so a relation column cannot be
// declared from a person's seat at all". The door has taken it since 2026-09-20 and the field
// editor has offered it since 2026-09-21 — but nobody had ever driven the screen. A door that
// answers and a screen nobody has opened are not the same claim.
//
// Headless only, never the in-app Browser pane: that is the owner's screen.
//
//   TAILS5_ORIGIN   http://tails5.localhost:3001 by default (the ONE shared dev server)
//   TAILS5_JOBS     the Jobs table id
//   TAILS5_OUT      where the screenshots go

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { signIn, setOrganization, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.TAILS5_ORIGIN ?? "http://tails5.localhost:3001";
const JOBS = process.env.TAILS5_JOBS;
const ORG_NAME = "Rincon Plumbing Co — Summerland Branch";
const OUT = process.env.TAILS5_OUT ?? "/tmp/tails5";
const EMAIL = process.env.AI_ADMIN_USERNAME;
const PASSWORD = process.env.AI_ADMIN_PASSWORD;
if (!JOBS) throw new Error("TAILS5_JOBS (the Jobs table id) is required");
if (!EMAIL || !PASSWORD) throw new Error("AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD are required");

mkdirSync(OUT, { recursive: true });
const said = {};
let n = 0;
const shot = async (page, name) => {
  n += 1;
  const file = `${OUT}/tails5-${n}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`   shot ${file}`);
  return file;
};
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

/**
 * Click the visible element whose own text is exactly this.
 *
 * 🚨 `which` IS NOT A CONVENIENCE. The Jobs toolbar's control that OPENS the field panel and
 * the panel's own SAVE button both read exactly "Add field" (FieldEditor.tsx:591 — the save
 * button says "Save field" only when editing an existing column). Clicking the first match to
 * save therefore closes the panel and throws the whole column away, silently, with no request
 * ever sent — which is precisely what this walk did on its first two attempts and spent a
 * round diagnosing as a store defect. "last" clicks the panel's.
 */
const clickExact = (page, wanted, which = "first") =>
  page.evaluate(
    ({ w, which }) => {
      const leaves = Array.from(document.querySelectorAll("body *")).filter(
        (el) => el.children.length === 0 && (el.textContent ?? "").trim() === w && el.offsetParent !== null,
      );
      const leaf = which === "last" ? leaves[leaves.length - 1] : leaves[0];
      const target = leaf?.closest("button, [role='option'], [role='menuitem'], a, li") ?? leaf?.parentElement;
      if (!target) return false;
      target.scrollIntoView({ block: "center" });
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    },
    { w: wanted, which },
  );

/** Open a Radix Select by its trigger's aria-label, then pick the option whose text starts with `option`. */
async function pickFromSelect(page, triggerLabel, option) {
  const opened = await page.evaluate((label) => {
    const t = Array.from(document.querySelectorAll("[aria-label]")).find(
      (el) => el.getAttribute("aria-label") === label && el.offsetParent !== null,
    );
    if (!t) return false;
    t.scrollIntoView({ block: "center" });
    // Radix opens on pointerdown, not click.
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    return true;
  }, triggerLabel);
  if (!opened) throw new Error(`no select trigger labelled "${triggerLabel}"`);
  const { v } = await until(`the "${triggerLabel}" list`, async () => {
    return page.evaluate((want) => {
      const opt = Array.from(document.querySelectorAll("[role='option']")).find((o) =>
        (o.textContent ?? "").trim().startsWith(want),
      );
      if (!opt) return false;
      opt.scrollIntoView({ block: "center" });
      for (const type of ["pointerdown", "mouseup", "click"]) {
        opt.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0 }));
      }
      return true;
    }, option);
  }, 20000);
  if (!v) throw new Error(`"${option}" was not offered under "${triggerLabel}"`);
  await sleep(700);
}

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1420, height: 950 } });
  const page = await ctx.newPage();

  // Every refusal the store sends back, verbatim — a screen that says "something went wrong"
  // is the START of a diagnosis, never the end of one.
  const refusals = [];
  page.on("response", async (res) => {
    try {
      if (!/\/rpc\/(field_declare|table_declare)/.test(res.url())) return;
      if (res.status() < 400) return;
      refusals.push({ url: res.url().split("?")[0], status: res.status(), body: (await res.text()).slice(0, 900) });
    } catch {}
  });

  said.signed_in_as = await signIn(page, ORIGIN, EMAIL, PASSWORD);
  said.organization_found = await setOrganization(page, ORG_NAME);

  // ── 1 — THE JOBS TABLE AS IT STANDS: five real jobs, and no customer on any of them.
  await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const { v: grid } = await until("the Jobs grid", async () => (await text(page)).includes("RPS-3101"), 120000);
  if (!grid) throw new Error(`the Jobs grid never drew RPS-3101 — screen said: ${(await text(page)).slice(0, 400)}`);
  said.jobs_before = await text(page);
  said.had_a_customer_column_before = said.jobs_before.includes("Customer");
  await shot(page, "the-jobs-table-with-no-customer-on-it");

  // ── 2 — SHE OPENS "Add field" AND PICKS "Points at another record".
  if (!(await clickExact(page, "Add field"))) throw new Error('no "Add field" control on the Jobs page');
  await sleep(1200);
  await page.evaluate(() => {
    const box = Array.from(document.querySelectorAll('[aria-label="Field name"]')).find((b) => b.offsetParent !== null);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(box, "Customer");
    box?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await pickFromSelect(page, "What this field holds", "Points at another record");
  said.type_explanation = await page.evaluate(() =>
    (Array.from(document.querySelectorAll("p")).find((p) => /link to records in another/i.test(p.textContent ?? ""))
      ?.textContent ?? "").trim(),
  );
  await shot(page, "points-at-another-record");

  // ── 3 — THE REFERENCE BUILDER: which table, and which of its columns to show.
  await pickFromSelect(page, "The table this column points at", "Customers");
  said.shown_as = await page.evaluate(() => {
    const l = Array.from(document.querySelectorAll("*")).find(
      (e) => e.children.length === 0 && (e.textContent ?? "").trim() === "Shown as",
    );
    return (l?.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim();
  });
  await page.evaluate(() => {
    const cb = Array.from(document.querySelectorAll('[aria-label="Show more than one column"]')).find(
      (c) => c.offsetParent !== null,
    );
    cb?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(1200);
  said.columns_offered = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button[aria-pressed]"))
      .filter((b) => b.offsetParent !== null)
      .map((b) => (b.textContent ?? "").trim())
      .filter((t) => t && t.length < 30),
  );
  for (const key of ["name", "service_address"]) {
    const ok = await page.evaluate((k) => {
      const b = Array.from(document.querySelectorAll("button[aria-pressed]")).find(
        (x) => (x.textContent ?? "").trim() === k && x.offsetParent !== null,
      );
      if (!b) return false;
      b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    }, key);
    if (!ok) throw new Error(`the Customers column "${key}" was not offered in the reference builder`);
    await sleep(500);
  }
  await shot(page, "which-of-the-customers-columns-to-show");

  // ── 4 — SHE SAVES IT.
  if (!(await clickExact(page, "Add field", "last"))) throw new Error("no save control on the field panel");
  const { v: saved } = await until(
    "the Customer column on the Jobs grid",
    async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("th, [role='columnheader']")).some((h) =>
          /customer/i.test(h.textContent ?? ""),
        ),
      ),
    60000,
  );
  said.customer_column_is_on_the_table = Boolean(saved);
  if (!saved) {
    writeFileSync(`${OUT}/tails5-refusals.json`, JSON.stringify(refusals, null, 2));
    console.log("REFUSALS", JSON.stringify(refusals, null, 2));
    throw new Error(`the column never appeared — screen said: ${(await text(page)).slice(0, 600)}`);
  }
  await sleep(2500);
  await shot(page, "the-customer-column-is-on-the-jobs-table");
  said.jobs_after = (await text(page)).slice(0, 1200);

  // ── 5 — AND THE NAMES. A column that points at customers is only worth having if the job
  // shows WHO. She opens RPS-3101, edits the new Customer cell, picks Marisol Vega, and the
  // chip reads the two columns she chose, in the order she chose them.
  const openedRecord = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll("tr")).find((x) => /RPS-3101/.test(x.textContent ?? ""));
    const idx = Array.from(document.querySelectorAll("th")).findIndex((h) => /customer/i.test(h.textContent ?? ""));
    const cell = row?.querySelectorAll("td")[idx];
    if (!cell) return false;
    cell.scrollIntoView({ block: "center" });
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      cell.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
    return true;
  });
  said.record_opened = openedRecord;
  await sleep(2500);

  const clickLabel = (label) =>
    page.evaluate((l) => {
      const els = Array.from(document.querySelectorAll("[aria-label]")).filter(
        (e) => e.getAttribute("aria-label") === l && e.offsetParent !== null,
      );
      const el = els[els.length - 1];
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, button: 0 }));
      }
      return true;
    }, label);

  said.edit_customer_opened = await clickLabel("Edit Customer");
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
  await sleep(1500);
  // WAIT for her row rather than typing into the picker's search box. Typing there re-renders
  // the list and leaves focus in the box, and the pick that follows then does not stick — the
  // walk saved the link with the plain list and lost it with the search twice running. Waiting
  // is what removes the race; the search box is a person's convenience, not this proof's.
  const { v: offered } = await until(
    "Marisol Vega in the picker",
    async () =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll("[role='option'], [role='menuitemcheckbox'], [role='menuitem'], button"),
        ).some((b) => b.offsetParent !== null && /Marisol/i.test(b.textContent ?? "")),
      ),
    20000,
  );
  if (!offered) throw new Error("the picker never listed Marisol Vega");
  said.picker_offers = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[role='option'], [role='menuitemcheckbox'], [role='menuitem'], button"))
      .filter((b) => b.offsetParent !== null && /Marisol/i.test(b.textContent ?? ""))
      .map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim())
      .slice(0, 4),
  );
  await shot(page, "the-picker-lists-the-customers-by-the-columns-she-chose");
  await page.evaluate(() => {
    const o = Array.from(
      document.querySelectorAll("[role='option'], [role='menuitemcheckbox'], [role='menuitem'], button"),
    ).find((b) => b.offsetParent !== null && /Marisol/i.test(b.textContent ?? ""));
    for (const t of ["pointerdown", "mouseup", "click"]) {
      o?.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, button: 0 }));
    }
  });
  await sleep(2000);
  // Close the picker popover and commit the cell the way a person does.
  await page.keyboard.press("Escape");
  await sleep(1200);
  said.committed_with = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => x.offsetParent !== null && /^(save|done|apply|save field|save record)$/i.test((x.textContent ?? "").trim()),
    );
    if (!b) return null;
    b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return (b.textContent ?? "").trim();
  });
  await sleep(2500);

  // 🚨 THE ONLY PROOF THAT COUNTS: reload the page from nothing and read the cell again. The
  // picker showing her name proves the picker can draw a name; only a fresh read proves the
  // JOB now names its customer.
  await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  // WHICH job is read off the grid rather than assumed: the rail opens the row the grid has in
  // hand, and the grid's own default sort decides which that is. What is being proved is that
  // A JOB NAMES ITS CUSTOMER in the two columns she chose — not which job number got there.
  const { v: named } = await until(
    "a job whose Customer cell names Marisol Vega, after a full reload",
    async () =>
      page.evaluate(() => {
        const idx = Array.from(document.querySelectorAll("th")).findIndex((h) =>
          /customer/i.test(h.textContent ?? ""),
        );
        if (idx < 0) return false;
        for (const row of Array.from(document.querySelectorAll("tr"))) {
          const cells = row.querySelectorAll("td");
          const cell = cells[idx];
          const t = (cell?.textContent ?? "").replace(/\s+/g, " ").replace(/who\?$/, "").trim();
          if (/Marisol Vega/.test(t)) {
            const job = (cells[0]?.textContent ?? "").replace(/who\?$/, "").trim();
            return `${job} — ${t}`;
          }
        }
        return false;
      }),
    45000,
  );
  said.the_job_names_its_customer = Boolean(named);
  said.the_job_and_what_its_customer_cell_reads = named || "(no job named a customer after a reload)";
  await shot(page, "the-job-names-its-customer");

  writeFileSync(`${OUT}/tails5-walk.json`, JSON.stringify(said, null, 2));
  console.log(JSON.stringify(said, null, 2));
} finally {
  await browser.close();
}
