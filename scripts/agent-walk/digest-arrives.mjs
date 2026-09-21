// scripts/agent-walk/digest-arrives.mjs — WATCHING THE DIGEST ARRIVE.
//
// AGENT-BUILDS-2's one unproven clause, verbatim: "Nobody has yet watched a
// subscription fire on demand and arrive in-app." This is the watching.
//
// THE USE CASE. Hands & Hope Alliance is a small community non-profit — 41
// donors, 23 individuals, 13 foundations, 5 corporate. Its director subscribed
// to the donor dashboard every Monday at eight, in the app, through the
// DigestScheduler on the dashboard itself (NOT by asking an agent — that is the
// point: a thing asked for in a sentence and a thing built by hand are the same
// object). One run was then fired on demand.
//
// WHAT THIS PROVES, as her: the notice is ON HER NOTIFICATIONS SCREEN, it says
// what arrived, and ITS LINK OPENS THE RECORDS IT COUNTED. A digest whose link
// lands on an ancestor or a 404 is worse than no digest — that is the eight-day
// staleness MANIFEST-SEAT closed, and this is the first time the link has been
// followed by anything but a checker.

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { setOrganization, signIn, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://agent-builds.localhost:3001";
const OUT =
  process.env.WALK_OUT ?? resolve(process.cwd(), "../common-docs/operations/for-arman/2026-09-21");
const SUBJECT = "Monday donor summary";
const DEEP_LINK =
  process.env.WALK_DEEP_LINK ??
  "/data-v2/335be3d6-39ed-4fe6-9725-c28952bc18c3?view=a41cd349-7a02-4a3f-b121-be94ca714f29";

const note = { ranAt: new Date().toISOString(), subject: SUBJECT, deepLink: DEEP_LINK };
const shot = async (page, name) => {
  const file = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`   shot → ${file}`);
  (note.screenshots ??= []).push(file);
};
const text = (page) => page.evaluate(() => document.body.innerText || "");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

try {
  const password = process.env.AI_ADMIN_PASSWORD;
  if (!password) throw new Error("AI_ADMIN_PASSWORD is not in the environment");
  note.signedInAs = await signIn(page, ORIGIN, "admin@admin.com", password);

  // 1. THE NOTIFICATIONS SCREEN — the deep link every agent digest declares.
  await page.goto(`${ORIGIN}/notifications`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(7000);
  const screen = await text(page);
  note.notificationsScreenHasIt = screen.includes(SUBJECT);
  note.noticeLine =
    screen
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes(SUBJECT) || /41 new|41 arrived/.test(l))
      .slice(0, 4) ?? [];
  await shot(page, "tails3-digest-08-notifications");

  // 2a. FOLLOW ITS LINK COLD — exactly as the person arriving from the notice
  //     does, with whatever organization their browser last had.
  await page.goto(`${ORIGIN}${DEEP_LINK}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(9000);
  const cold = await text(page);
  note.coldLandingIsHeld = /Select an organization first|pick an organization/i.test(cold);
  note.coldLandingTail = cold.slice(-260);
  await shot(page, "tails3-digest-09-link-followed-cold");

  // 2b. AND WITH THE ORGANIZATION PICKED, to tell a broken link from a held one.
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2500);
  await setOrganization(page, "Hands & Hope Alliance");
  await sleep(2500);

  // 2. FOLLOW ITS LINK. The notice's own deep link, not a URL this walk invented:
  //    it is read off `communication.notification.deep_link` by the caller and
  //    passed in.
  await page.goto(`${ORIGIN}${DEEP_LINK}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(9000);
  const landed = await text(page);
  note.linkStatus = await page.evaluate(() => document.title);
  note.linkLandedOn = page.url();
  note.linkShowsRecords =
    /shown \/|loaded|All records|donors/i.test(landed) && !/404|not found|went wrong/i.test(landed);
  note.landedText = landed.slice(-700);
  await shot(page, "tails3-digest-10-link-followed-in-org");

  note.ok = note.notificationsScreenHasIt && note.linkShowsRecords;
} catch (thrown) {
  note.ok = false;
  note.error = String(thrown);
  await shot(page, "tails3-digest-99-arrives-failed").catch(() => {});
} finally {
  writeFileSync(resolve(OUT, "tails3-digest-arrives.json"), JSON.stringify(note, null, 2));
  console.log(JSON.stringify(note, null, 2).slice(0, 3000));
  await browser.close();
}
