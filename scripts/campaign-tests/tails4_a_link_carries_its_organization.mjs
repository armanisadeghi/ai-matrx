// tails4_a_link_carries_its_organization.mjs — the three walks lane TAILS-4 was asked to prove.
//
// 🚨 THE DEFECT (lane TAILS-3, 2026-09-21). A person arriving COLD — from an email, a text,
// or the notifications screen in a fresh session — lands on "Select an organization first"
// instead of the thing the link names. TAILS-3 followed the Monday donor digest's own link
// and got the picker; with the organization set by hand the same link showed its records.
//
// THE USE CASE, and it is a real one already on this database: Trailhead & Torch Journeys,
// a small guided-hiking outfitter, keeps its 81 US National Parks rows in one Table and
// subscribes to a weekly summary over it. The summary's link is what this proves.
//
// Each walk runs in its OWN fresh browser context — no cookie, no IndexedDB, no
// localStorage — because "cold" is the whole point: a warm tab already knows an
// organization and would prove nothing.
//
//   node scripts/campaign-tests/tails4_a_link_carries_its_organization.mjs
//
// It drives the ONE machine-wide dev server (port 3001); it only reads.

import { chromium } from "playwright";
import { config } from "dotenv";
import { signIn, until, sleep } from "../lib/seat-browser.mjs";

config({ path: new URL("../../.env", import.meta.url).pathname });
config({ path: new URL("../../.env.local", import.meta.url).pathname });

const ORIGIN = process.env.TAILS4_ORIGIN ?? "http://localhost:3001";
const EMAIL = process.env.AI_ADMIN_USERNAME ?? "admin@admin.com";
const PASSWORD = process.env.AI_ADMIN_PASSWORD;

// Trailhead & Torch Journeys and its US National Parks table — read off the live database,
// never invented: 81 records, and admin@admin.com is one of its members.
const ORG = "a2b50e76-7120-4bc2-b7a0-8a531ffa2cc8";
const TABLE = "449c3251-2810-4bde-9953-9a885a591b1a";
// An organization this account is genuinely not a member of.
const NOT_MINE = "efe3623f-c1a0-4c0b-9315-c8c882a856b8";

const PICKER = /Select an organization|Choose (your|an) organization|organization first/i;

let failures = 0;
const clause = (n, ok, said) => {
  if (!ok) failures += 1;
  console.log(`CLAUSE ${n} ${ok ? "OK" : "RED"}: ${said}`);
};

async function cold(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, ORIGIN, EMAIL, PASSWORD);
  await context.clearCookies({ name: "matrx-active-org" });
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
  // THE MAIN REGION, NOT THE WHOLE BODY. The shell's sidebar carries twenty-odd module
  // names, so `body.innerText` matches almost any word you look for and a clause written
  // against it passes without the page ever having rendered — which is exactly what this
  // walk did on its first run, reporting a refusal sentence that was really the nav.
  const read = () =>
    page.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      return main?.innerText ?? "";
    });
  // WAIT FOR THE PAGE TO STOP SAYING IT IS CHECKING. A clause read while the grid is
  // still resolving reads "Checking whether Data records are available here…" and calls
  // it a missing table — which is a flake, not a finding.
  await until("settled", async () => {
    const t = await read();
    if (t.trim().length < 40) return null;
    if (/Checking whether|Loading|Resolving/i.test(t) && t.trim().length < 400) return null;
    return t;
  }, 60000);
  await sleep(4000);
  const text = await read();
  // The refusal is announced through the platform's ONE refusal notice, which renders
  // outside <main>. So the walk also keeps the whole document, and only ever looks in it
  // for a sentence distinctive enough that the twenty-module sidebar cannot supply it.
  const whole = await page.evaluate(() => document.body?.innerText ?? "");
  return { context, page, text, whole };
}

const main = async () => {
  if (!PASSWORD) throw new Error("AI_ADMIN_PASSWORD is not in the environment.");
  const browser = await chromium.launch({ headless: true });

  // 1. THE LINK THE SUMMARY SENDS — cold, and it must land on the records.
  {
    const { context, text } = await cold(browser, `/data-v2/${TABLE}?org=${ORG}`);
    clause(
      1,
      !PICKER.test(text),
      `the weekly summary's own link, followed cold, did NOT land on the organization picker` +
        (PICKER.test(text) ? ` — it said: ${text.slice(0, 160)}` : ""),
    );
    clause(
      2,
      /Trailhead|National Park/i.test(text),
      `the page names Trailhead & Torch Journeys' National Parks table` +
        (/Trailhead|National Park/i.test(text) ? "" : ` — it said: ${text.slice(0, 200)}`),
    );
    await context.close();
  }

  // 2. THE SAME LINK WITHOUT ITS ORGANIZATION — the defect, still reproducible.
  {
    const { context, text } = await cold(browser, `/data-v2/${TABLE}`);
    clause(
      3,
      PICKER.test(text),
      `the same link with no organization still lands on the picker — which is the defect ` +
        `TAILS-3 measured, and it is what makes clause 1 a fix rather than a coincidence`,
    );
    await context.close();
  }

  // 3. A LINK FOR AN ORGANIZATION THIS ACCOUNT IS NOT IN — refused, in words.
  {
    const { context, whole } = await cold(browser, `/data-v2/${TABLE}?org=${NOT_MINE}`);
    const text = whole;
    const refuses = /not a member of/i.test(text);
    clause(
      4,
      refuses,
      refuses
        ? `the link refuses in words: "${
            text
              .replace(/\s+/g, " ")
              .match(/The link you followed is for[^]*?avatar menu\.|The link you followed is for[^]{0,260}/i)?.[0]
              ?.trim() ?? "(matched, but the sentence could not be sliced)"
          }"`
        : `no refusal sentence on the page — it said: ${text.replace(/\s+/g, " ").slice(0, 220)}`,
    );
    await context.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} clause(s) RED` : "\nALL CLAUSES OK");
  process.exit(failures ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
