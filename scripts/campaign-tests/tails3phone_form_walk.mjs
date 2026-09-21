/**
 * TAILS-3 — THE LIVE PROOF, END TO END: a stranger signs up for a gym class and writes her
 * phone number the ordinary American way.
 *
 * THE USE CASE. Naomi Okafor is coming back from a shoulder injury and wants the Tuesday
 * 7:15 PM boxing class at Ironline Fitness. She opens the club's public signup link with no
 * account at all and types her number the way she always has: `(415) 555-0178`. Before this
 * lane the product answered "Phone is not written the way this field expects".
 *
 * WHY THIS PAGE AND NOT THE BOOKING PAGE. `tails3phone_booking_walk.mjs` proves the same
 * number is accepted on Ironclad Mobile Mechanic's booking page, but that page still stops on
 * "Vehicle Year takes a number, and it was given a string" — a separate sub-lane's defect. The
 * form is the surface where the whole submission completes, so it is the end-to-end half.
 *
 * HEADLESS, NO SESSION, a fresh incognito context.
 *
 *   node scripts/campaign-tests/tails3phone_form_walk.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PORT = process.env.WALK_PORT ?? "3001";
const ORIGIN = `http://${process.env.WALK_HOST ?? "tails3-phone.localhost"}:${PORT}`;
const FORM_URL = `${ORIGIN}/f/690c349e-87ae-4daa-8fe5-c43b08a4367f`;
const OUT = process.env.WALK_OUT ?? resolve(process.cwd(), "scripts/campaign-tests/shots");
mkdirSync(OUT, { recursive: true });

const PHONE = "(415) 555-0178";
/** 🚨 The honeypot `#hp-confirm_…` is never touched — only `#form-<key>` fields are filled. */
const MEMBER = {
  full_name: "Naomi Okafor",
  email: "naomi.okafor@harborlinemail.example",
  phone: PHONE,
  class: "Boxing Fundamentals — Tue 7:15 PM with Coach Reyes",
  notes: "Coming back after a shoulder injury — is the 7:15 Boxing class beginner friendly?",
};

const PHONE_REFUSAL = /phone[^\n]{0,60}not written the way this field expects/i;
const text = (page) => page.evaluate(() => document.body.innerText).catch(() => "");

async function typeInto(page, selector, value, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    await page.locator(selector).fill(value, { timeout: 5000 }).catch(() => {});
    const held = await page.evaluate(
      ({ selector: s, value: v }) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
        if (el.value !== v) {
          Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return el.value === v;
      },
      { selector, value },
    );
    if (held) {
      await page.waitForTimeout(400);
      if ((await page.evaluate((s) => document.querySelector(s)?.value ?? null, selector)) === value) return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  const out = { ranAt: new Date().toISOString(), url: FORM_URL, phoneTyped: PHONE };

  await page.goto(FORM_URL, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.getByRole("button", { name: /^Next$/ }).first().waitFor({ state: "visible", timeout: 240000 });
  // 🚨 A FILL BEFORE HYDRATION IS A SILENT NO-OP. The field is server-rendered and takes
  // nothing until the bundle attaches: the value lands in the DOM, React re-renders from its
  // own empty state, and step 5 then says "full name still needs an answer" about a field the
  // walk watched itself fill. Wait for the button to be ENABLED, which only the hydrated
  // runner does, and then give React a beat.
  await page
    .getByRole("button", { name: /^Next$/ })
    .first()
    .waitFor({ state: "attached", timeout: 240000 });
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Next")?.disabled,
    { timeout: 240000 },
  ).catch(() => {});
  await page.waitForTimeout(6000);

  for (const [key, value] of Object.entries(MEMBER)) {
    const field = `#form-${key}`;
    await page.waitForSelector(field, { timeout: 120000 });
    if (!(await typeInto(page, field, value))) throw new Error(`the answer never stayed in ${field}`);
    await page.waitForTimeout(400);
    if (key === "phone") await page.screenshot({ path: resolve(OUT, "tails3phone-form-01-phone.png") });
    if (key !== "notes") {
      await page.getByRole("button", { name: /^Next$/ }).first().click();
      await page.waitForTimeout(1200);
    }
  }
  await page.screenshot({ path: resolve(OUT, "tails3phone-form-02-before-submit.png") });

  // A DISABLED SUBMIT IS A FINDING, NOT A TIMEOUT — say which answers the form still thinks
  // are empty rather than logging 30s of "element is not enabled".
  const submitButton = page.getByRole("button", { name: /^Submit$/ }).first();
  if (await submitButton.isDisabled().catch(() => false)) {
    out.submitDisabled = true;
    out.answersTheFormHolds = await page.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll("input[id^='form-'], textarea[id^='form-']")).map((el) => [
          el.id,
          el.value,
        ]),
      ),
    );
    out.stepText = await text(page);
    console.log(JSON.stringify(out, null, 2));
    await browser.close();
    process.exit(1);
  }
  await submitButton.click();
  await page.waitForTimeout(12000);
  const after = await text(page);
  await page.screenshot({ path: resolve(OUT, "tails3phone-form-03-confirmation.png") });

  out.screenText = after;
  out.phoneStillRefused = PHONE_REFUSAL.test(after);
  out.submitted = /thank|received|submitted|got it|we'll|we will/i.test(after);
  console.log(JSON.stringify(out, null, 2));
  console.log(
    out.phoneStillRefused
      ? "\nFAILED — the product still refuses (415) 555-0178."
      : `\nPHONE ACCEPTED. Submission: ${out.submitted ? "the form says it went through" : "see screenText"}`,
  );
  await context.close();
  await browser.close();
  process.exit(out.phoneStillRefused || !out.submitted ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
