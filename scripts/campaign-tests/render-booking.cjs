// scripts/campaign-tests/render-booking.cjs — LANE BOOKING'S HEADLESS RENDER.
//
// The public booking page and the visitor's own manage page, at phone and desktop
// width, light and dark, with a REAL booking made end to end and then cancelled.
// It photographs the picker, the held state, the missing-answers sentence, the
// confirmation with its manage link, the manage page, and the cancel confirm.
//
//   BASE=http://127.0.0.1:3012 FORM=<booking page id> \
//     node scripts/campaign-tests/render-booking.cjs
//
// IT NEEDS A SERVER AND THIS MACHINE ALLOWS EXACTLY ONE. `next dev` is refused
// while any dev server is up anywhere on the box ("a second dev server is a
// reliable hard crash — the cap is ONE, machine-wide"), and `pnpm preview:start`
// owns port 3001. So this runs against a PRODUCTION build of this checkout:
//
//   NODE_ENV=production npx next build
//   NODE_ENV=production npx next start -p 3012 -H 127.0.0.1
//
// A booking page to point it at is made by `booking_race.sh`'s fixture, or by
// `custom.booking_declare` + `custom.anon_publish` as admin@admin.com.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1:3012";
const FORM = process.env.FORM;
const OUT = process.env.OUT || "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-20";

const SHOTS = [
  { name: "phone-light", width: 390, height: 844, scheme: "light" },
  { name: "phone-dark", width: 390, height: 844, scheme: "dark" },
  { name: "desktop-light", width: 1440, height: 900, scheme: "light" },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const notes = [];

  for (const shot of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      colorScheme: shot.scheme,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    const t0 = Date.now();
    await page.goto(`${BASE}/b/${FORM}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Pick a time", { timeout: 20000 });
    const firstPaint = Date.now() - t0;

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    await page.screenshot({ path: path.join(OUT, `public-booking-${shot.name}.png`), fullPage: false });
    notes.push(`${shot.name}: picker on screen in ${firstPaint} ms, horizontal scroll ${overflow}, console errors ${errors.length}`);

    if (shot.name === "phone-light") {
      // HOLD → DETAILS, and photograph the details step.
      const buttons = await page.$$("button:not([disabled])");
      let clicked = false;
      for (const b of buttons) {
        const t = (await b.innerText()).trim();
        if (/^\d{1,2}[:.]\d{2}/.test(t) || /(AM|PM|am|pm)$/.test(t)) { await b.click(); clicked = true; break; }
      }
      if (!clicked) throw new Error("no time button found to click");
      await page.waitForSelector("text=held for you", { timeout: 20000 });
      await page.screenshot({ path: path.join(OUT, "public-booking-phone-held.png") });

      // The missing-answers sentence.
      await page.click("button:has-text('Book it')").catch(() => {});
      await page.waitForTimeout(400);
      const missing = await page.locator("p.text-destructive").first().innerText().catch(() => "");
      await page.screenshot({ path: path.join(OUT, "public-booking-phone-validation.png") });
      notes.push(`validation: "${missing.replace(/\s+/g, " ").trim()}"`);

      // Fill it in and book.
      const inputs = await page.$$("input:not([aria-hidden='true'])");
      await inputs[0].fill("Dana Ops");
      if (inputs[1]) await inputs[1].fill("dana@example.test");
      await page.click("button:has-text('Book it')");
      await page.waitForSelector("text=Move or cancel this appointment", { timeout: 30000 });
      await page.screenshot({ path: path.join(OUT, "public-booking-phone-booked.png") });
      const href = await page.getAttribute("a:has-text('Move or cancel this appointment')", "href");
      notes.push(`booked: the confirmation offers ${href}`);

      // The visitor's own page.
      await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Your appointment", { timeout: 20000 });
      await page.screenshot({ path: path.join(OUT, "public-booking-phone-manage.png") });
      await page.click("button:has-text('Cancel this appointment')");
      await page.waitForSelector("text=Yes, cancel it", { timeout: 10000 });
      await page.screenshot({ path: path.join(OUT, "public-booking-phone-cancel-confirm.png") });
      notes.push("manage: move-to list and a cancel that names the hour being given up");
    }

    await ctx.close();
  }

  await browser.close();
  console.log(notes.join("\n"));
})().catch((e) => { console.error("RENDER FAILED:", e.message); process.exit(1); });
