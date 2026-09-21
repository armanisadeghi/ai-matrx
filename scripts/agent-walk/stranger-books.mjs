/**
 * THE STRANGER BOOKS A VISIT — and we find out what a fat finger costs her.
 *
 * `stranger.mjs` proves a public FORM takes an answer from somebody with no
 * account. This is the other public door the agent built: a booking page, where
 * the thing being written is not just a row but a SLOT, and where getting it
 * wrong has a price nobody has measured.
 *
 * TWO QUESTIONS, and the second is the reason this file is separate:
 *   1. Does a correctly filled booking actually land — a row in the table and
 *      the slot gone from the list?
 *   2. WHAT HAPPENS TO THE SLOT WHEN THE BOOKING IS REFUSED? On 2026-09-21 a
 *      closing walk was refused twice — once on "Phone is not written the way
 *      this field expects" and once on "Vehicle Year takes a number, and it was
 *      given a string" — and the page's own counter went 32 free → 31 → 30 → 29
 *      while the times it had tried came back marked "taken". If a refused
 *      booking burns the slot, a customer who mistypes her phone number loses
 *      the 1:00 PM and has to pick another, which is a real cost to a real
 *      person and not something a screenshot of a happy path would ever show.
 *
 * So this run books CORRECTLY, then reads the counter before and after, and
 * reports the arithmetic instead of asserting a conclusion.
 *
 *   node scripts/agent-walk/stranger-books.mjs
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const HOST = process.env.WALK_HOST ?? "agent-builds.localhost";
const PORT = process.env.WALK_PORT ?? "3001";
const ORIGIN = `http://${HOST}:${PORT}`;
const OUT =
  process.env.WALK_OUT ?? resolve(process.cwd(), "../common-docs/operations/for-arman/2026-09-21");

/**
 * A REAL CUSTOMER OF A MOBILE MECHANIC, synthesized, never copied. Ironclad
 * comes to you; the complaint is the ordinary one that makes somebody finally
 * book. Vehicle Year is sent as the digits a person types — if the store wants
 * a number, making the PAGE coerce it is the product's job, not the customer's.
 */
const CUSTOMER = {
  "Customer Name": "Delia Marchetti",
  Phone: "415-555-0192",
  Email: "delia.marchetti@harborlinemail.example",
  "Vehicle Make": "Honda",
  "Vehicle Model": "CR-V",
  "Vehicle Year": "2019",
  "License Plate": "8XKR201",
};

const shot = async (page, name) => {
  const file = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`   shot → ${file}`);
  return file;
};

/** "31 free of 32" → {free: 31, total: 32} — the page's own arithmetic. */
const readCounter = async (page) => {
  const text = await page.evaluate(() => document.body.innerText || "");
  const m = text.match(/(\d+)\s+free\s+of\s+(\d+)/i);
  return m ? { free: Number(m[1]), total: Number(m[2]) } : null;
};

const browser = await chromium.launch({ headless: true });
const note = { ranAt: new Date().toISOString(), customer: CUSTOMER };
const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await context.newPage();

try {
  const url = `${ORIGIN}/b/a5da70ac-4223-4c4d-b509-391916bf7067`;
  note.url = url;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(7000);
  note.counterBefore = await readCounter(page);
  note.slotListBefore = (await page.evaluate(() => document.body.innerText)).slice(0, 500);
  await shot(page, "stranger-books-01-slots");

  // Take the first time that is NOT already marked taken.
  const chosen = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button")).filter(
      (b) => b.getClientRects().length > 0,
    );
    const free = buttons.find((b) => {
      const t = (b.textContent || "").trim();
      return /^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(t) && !/taken/i.test(t) && !b.disabled;
    });
    if (!free) return null;
    free.setAttribute("data-walk-slot", "1");
    return (free.textContent || "").trim();
  });
  if (!chosen) throw new Error("no free slot was offered");
  note.slotChosen = chosen;
  await page.locator("button[data-walk-slot]").first().click();
  await page.waitForTimeout(3500);
  note.heldText = (await page.evaluate(() => document.body.innerText)).slice(0, 400);

  // Fill each question by the label it shows.
  const filled = [];
  for (const [label, value] of Object.entries(CUSTOMER)) {
    const box = page
      .locator(
        `input[name="${label}"], input[aria-label="${label}"], input[placeholder="${label}"]`,
      )
      .first();
    if (await box.isVisible().catch(() => false)) {
      await box.fill(value);
      filled.push(label);
      continue;
    }
    // Fall back to the field that follows the label's own text.
    const ok = await page.evaluate(
      ({ label: l, value: v }) => {
        const labels = Array.from(document.querySelectorAll("label, span, div")).filter(
          (n) => (n.textContent || "").trim() === l,
        );
        for (const node of labels) {
          const scope = node.closest("div") ?? document.body;
          const input = scope.querySelector("input, textarea, select");
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              "value",
            )?.set;
            setter?.call(input, v);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
        }
        return false;
      },
      { label, value },
    );
    if (ok) filled.push(label);
  }
  note.fieldsFilled = filled;
  await page.waitForTimeout(800);
  await shot(page, "stranger-books-02-before-booking");

  await page.getByRole("button", { name: /^Book it$/ }).first().click();
  await page.waitForTimeout(10000);
  note.afterText = (await page.evaluate(() => document.body.innerText)).slice(0, 700);
  note.counterAfter = await readCounter(page);
  await shot(page, "stranger-books-03-after");
  note.ok = true;
} catch (error) {
  note.ok = false;
  note.error = String(error).slice(0, 500);
  await shot(page, "stranger-books-99-failed").catch(() => {});
}

await context.close();
await browser.close();
const file = resolve(OUT, "stranger-books-results.json");
writeFileSync(file, JSON.stringify(note, null, 2));
console.log(JSON.stringify(note, null, 2));
console.log(`\nresults → ${file}`);
