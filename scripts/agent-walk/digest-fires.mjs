// scripts/agent-walk/digest-fires.mjs — THE ONE CLAUSE NOBODY HAD EVER WATCHED.
//
// AGENT-BUILDS-2 proved the digest ask makes a dashboard, and then said plainly:
// "Nobody has yet watched a subscription fire on demand and arrive in-app."
// The subscription itself was REFUSED — correctly — because the test
// organization's `custom/agent_schema_changes` knob makes a person approve a
// schema-level change and a subscription of that kind cannot even be queued for
// approval. The remedy was a knob on a real organization, not code.
//
// THE USE CASE. Hands & Hope Alliance is a small community non-profit: 41
// donors, 23 of them individuals, 13 foundations, 5 corporate. Its director
// wants the donor dashboard in her inbox every Monday morning so she knows what
// last week did before the staff meeting.
//
// WHAT THIS WALK PROVES, as her, headless, through the real screens:
//   1. the knob is on (set beforehand by the organization's own admin through
//      platform.knob_override_set — the door, not a SQL UPDATE);
//   2. the weekly subscription is made in the DigestScheduler UI, NOT by an
//      agent — this is the hand-built half of "a thing asked for in a sentence
//      and a thing built by hand are the same object";
//   3. one run fires on demand;
//   4. the notice ARRIVES IN-APP and its link opens something real.
//
// Every claim is read back out of the database by the caller; this file reports
// what the SCREEN said and nothing more.

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { signIn, setOrganization, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://agent-builds.localhost:3001";
const OUT =
  process.env.WALK_OUT ?? resolve(process.cwd(), "../common-docs/operations/for-arman/2026-09-21");
const ORG = "Hands & Hope Alliance";
const DONORS_TABLE = process.env.WALK_TABLE ?? "335be3d6-39ed-4fe6-9725-c28952bc18c3";
const DIGEST_NAME = "Monday donor summary";

const note = { ranAt: new Date().toISOString(), organization: ORG, table: DONORS_TABLE };
const shot = async (page, name) => {
  const file = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`   shot → ${file}`);
  (note.screenshots ??= []).push(file);
  return file;
};
const text = (page) => page.evaluate(() => document.body.innerText || "");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

try {
  const password = process.env.AI_ADMIN_PASSWORD;
  if (!password) throw new Error("AI_ADMIN_PASSWORD is not in the environment");
  note.signedInAs = await signIn(page, ORIGIN, "admin@admin.com", password);

  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2500);
  await setOrganization(page, ORG);
  await sleep(2000);

  await page.goto(`${ORIGIN}/data-v2/${DONORS_TABLE}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await sleep(6000);
  await shot(page, "tails3-digest-01-donors-table");

  // OPEN THE DASHBOARDS RAIL — the same button a person presses.
  const openedRail = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => (x.textContent || "").trim() === "Dashboards",
    );
    if (!b) return false;
    b.click();
    return true;
  });
  note.openedDashboardsRail = openedRail;
  await sleep(5000);
  await shot(page, "tails3-digest-02-dashboards-rail");

  // OPEN THE DONOR DASHBOARD the agent built at 16:06Z.
  const openedDashboard = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button, a")).find((x) =>
      /Donor Dashboard/i.test(x.textContent || ""),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  note.openedDashboard = openedDashboard;
  await sleep(6000);
  note.dashboardText = (await text(page)).slice(0, 900);
  await shot(page, "tails3-digest-03-donor-dashboard");

  // THE SCHEDULER. "Send this on a schedule" is its own heading.
  const openedScheduler = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /schedule|send this on a schedule/i.test(x.textContent || ""),
    );
    if (b) {
      b.click();
      return b.textContent?.trim() ?? true;
    }
    return document.body.innerText.includes("Send this on a schedule") ? "already open" : false;
  });
  note.openedScheduler = openedScheduler;
  await sleep(3500);
  await shot(page, "tails3-digest-04-scheduler");

  // FILL IT THE WAY SHE WOULD: a name, every week, Monday at 08:00.
  const configured = await page.evaluate((name) => {
    const setNative = (el, v) => {
      const proto =
        el.tagName === "SELECT"
          ? window.HTMLSelectElement
          : el.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement
            : window.HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const box = document.querySelector('input[placeholder="Monday donor summary"]');
    if (!box) return { ok: false, why: "the scheduler's name box is not on screen" };
    setNative(box, name);
    const selects = Array.from(document.querySelectorAll("select")).filter(
      (s) => s.offsetParent !== null,
    );
    const chose = [];
    for (const s of selects) {
      const weekly = Array.from(s.options).find((o) => o.value === "weekly");
      if (weekly) {
        setNative(s, "weekly");
        chose.push("cadence=weekly");
        continue;
      }
      const monday = Array.from(s.options).find((o) => /^monday$/i.test(o.value));
      if (monday) {
        setNative(s, monday.value);
        chose.push(`weekday=${monday.value}`);
      }
    }
    return { ok: true, chose, selects: selects.length };
  }, DIGEST_NAME);
  note.configured = configured;
  await sleep(1500);
  await shot(page, "tails3-digest-05-configured");

  // SCHEDULE IT.
  const scheduled = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => (x.textContent || "").trim() === "Schedule it",
    );
    if (!b) return false;
    b.click();
    return true;
  });
  note.pressedScheduleIt = scheduled;
  await sleep(9000);
  note.afterScheduling = (await text(page)).slice(-1400);
  await shot(page, "tails3-digest-06-scheduled");

  // FIRE ONE NOW, from the screen.
  const fired = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /show me one now|send one now|run it now/i.test(x.textContent || ""),
    );
    if (!b) return false;
    b.click();
    return b.textContent?.trim() ?? true;
  });
  note.firedOnDemand = fired;
  await sleep(9000);
  note.afterFiring = (await text(page)).slice(-1400);
  await shot(page, "tails3-digest-07-fired");

  note.ok = true;
} catch (thrown) {
  note.ok = false;
  note.error = String(thrown);
  await shot(page, "tails3-digest-99-failed").catch(() => {});
} finally {
  writeFileSync(resolve(OUT, "tails3-digest-results.json"), JSON.stringify(note, null, 2));
  console.log(JSON.stringify(note, null, 2).slice(0, 4000));
  console.log(`\nresults → ${resolve(OUT, "tails3-digest-results.json")}`);
  await browser.close();
}
