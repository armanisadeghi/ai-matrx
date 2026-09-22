/**
 * TAILS-3 — THE LIVE PROOF: a stranger books a service call and writes their phone number
 * the ordinary American way.
 *
 * THE USE CASE. Marcus Delgado's 2019 Honda CR-V will not start in his Rockridge driveway.
 * He finds Ironclad Mobile Mechanic's public booking page, takes the soonest slot and types
 * his number the way he has written it his whole life: `(415) 555-0178`. Before this lane the
 * product answered "Phone is not written the way this field expects" and AGENT-BUILDS-2's
 * closing walk had to write `415-555-0178` instead, with a comment in
 * `scripts/agent-walk/close.mjs` explaining why.
 *
 * WHAT THIS PROVES, EXACTLY. That the phone number is no longer the thing refused. A separate
 * sub-lane owns the number-coercion defect on this same page ("Vehicle Year takes a number,
 * and it was given a string"), so the booking may still fail on Vehicle Year — the script
 * reports the screen's words verbatim either way and states plainly which sentence it got.
 *
 * HEADLESS, NO SESSION, a fresh incognito context: the booking page is a link a stranger was
 * sent, and it must work for somebody with no account at all.
 *
 *   node scripts/campaign-tests/tails3phone_booking_walk.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PORT = process.env.WALK_PORT ?? "3001";
const ORIGIN = `http://${process.env.WALK_HOST ?? "tails3-phone.localhost"}:${PORT}`;
const BOOKING_URL = `${ORIGIN}/b/a5da70ac-4223-4c4d-b509-391916bf7067`;
const OUT = process.env.WALK_OUT ?? resolve(process.cwd(), "scripts/campaign-tests/shots");
mkdirSync(OUT, { recursive: true });

/** THE NUMBER THIS WHOLE LANE IS ABOUT. */
const PHONE = "(415) 555-0178";
const DRIVER = {
  "Customer Name": "Marcus Delgado",
  Phone: PHONE,
  Email: "marcus.delgado@ironcladmobilemechanic.com",
  "Vehicle Make": "Honda",
  "Vehicle Model": "CR-V",
  "Vehicle Year": "2019",
  "License Plate": "8XKR201",
};

/** The phone refusal, in the product's own words. This is the sentence that must be GONE. */
const PHONE_REFUSAL = /phone[^\n]{0,60}not written the way this field expects/i;
const CONTENTION =
  /statement timeout|did not answer in time|canceling statement|taking longer than it should|didn.t finish loading/i;

const text = (page) => page.evaluate(() => document.body.innerText).catch(() => "");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
  const page = await context.newPage();
  const out = { ranAt: new Date().toISOString(), url: BOOKING_URL, phoneTyped: PHONE };

  await page.goto(BOOKING_URL, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("button:has-text('PM'), button:has-text('AM')", { timeout: 240000 });
  await page.waitForTimeout(2000);
  out.slotListText = (await text(page)).slice(0, 400);

  const slot = page.locator("button", { hasText: /^\d{1,2}:\d{2} (AM|PM)$/ }).first();
  out.slotChosen = (await slot.textContent())?.trim() ?? null;
  await slot.click();
  await page.waitForTimeout(3000);

  // 🚨 THE LAST INPUT HAS NO LABEL — it is the booking page's honeypot. Fields are matched to
  // their label by document order and anything unlabelled is never touched.
  out.fieldsFilled = await page.evaluate((values) => {
    const nodes = Array.from(document.querySelectorAll("label, input, textarea")).filter(
      (e) => e.getClientRects().length,
    );
    const setValue = (el, v) => {
      const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const done = [];
    for (let i = 0; i < nodes.length; i += 1) {
      if (nodes[i].tagName !== "LABEL") continue;
      const label = (nodes[i].textContent || "").trim();
      const field = nodes[i + 1];
      if (!field || field.tagName === "LABEL" || !(label in values)) continue;
      setValue(field, values[label]);
      done.push(label);
    }
    return done;
  }, DRIVER);
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUT, "tails3phone-01-before-booking.png") });

  await page.getByRole("button", { name: /^Book it$/ }).first().click();
  await page.waitForTimeout(12000);
  const after = await text(page);
  await page.screenshot({ path: resolve(OUT, "tails3phone-02-after-booking.png") });

  out.screenText = after;
  out.phoneStillRefused = PHONE_REFUSAL.test(after);
  out.contention = CONTENTION.test(after);
  out.booked = /booked|confirmed|you're all set|see you|thank/i.test(after);

  console.log(JSON.stringify(out, null, 2));
  console.log(
    out.phoneStillRefused
      ? "\nFAILED — the product still refuses (415) 555-0178."
      : `\nPHONE ACCEPTED — "${PHONE}" is no longer the thing refused. Booking outcome: ${
          out.booked ? "booked" : "not booked (see screenText — another lane owns Vehicle Year)"
        }`,
  );
  await context.close();
  await browser.close();
  process.exit(out.phoneStillRefused ? 1 : 0);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
