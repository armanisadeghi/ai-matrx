/**
 * LANE POST-PUBLISH-FE — headless proof on the shared preview after records-ui 0.85.6 landed:
 * the organization hub lists its tables once (pick lists only behind Show everything), and
 * /data-v2/<table> for a designated table (the Sheet) and a plain one at 1440 and 390, with the
 * organization chip from records-ui and no stand-in row. Optionally the non-admin seat on Rooms'
 * Sheet, to read a withheld cell.
 *
 *   PPF_ORIGIN=http://post-publish-fe.localhost:3001 PPF_EMAIL=… PPF_PASSWORD=… [PPF_TEST_EMAIL=…] \
 *   node scripts/campaign-tests/postpublishfe_shots.mjs
 *
 * Read-only: signs in through the real login form, opens pages, presses Show everything (a view
 * toggle, nothing is written) and takes pictures. Credentials are never printed.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

import { signIn, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.PPF_ORIGIN ?? "http://post-publish-fe.localhost:3001";
const OUT =
  process.env.PPF_SHOTS ?? "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/shots/post-publish-fe";
const PASSWORD = process.env.PPF_PASSWORD ?? "";
const EMAIL = process.env.PPF_EMAIL ?? "";
const TEST_EMAIL = process.env.PPF_TEST_EMAIL ?? "";
if (!PASSWORD || !EMAIL) {
  console.error("The seat's sign-in is not in the environment (never printed).");
  process.exit(2);
}
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const DESIGNATED = "dbc7cd48-7b46-4402-ac9d-e459a95f4598"; // Rincon Plumbing — Service Calls (Sheet)
const PLAIN = "415c3e23-2f90-4c66-9040-b246fa1c4b36"; // Rincon Plumbing — Customers
const ROOMS = "8c62d552-a893-4338-ac05-a266b2178712";
mkdirSync(OUT, { recursive: true });

const facts = (page) =>
  page.evaluate(() => {
    const titles = Array.from(document.querySelectorAll(".hdr-structured-title")).filter((el) => el.getBoundingClientRect().width > 0);
    const title = titles[titles.length - 1] ?? null;
    const text = document.body.innerText;
    return {
      title: title?.textContent ?? null,
      chip: Array.from(document.querySelectorAll("[data-where-it-lives]")).map((el) => (el.textContent ?? "").trim()),
      standInHeaderAction: Array.from(document.querySelectorAll("header button, [data-shell-header] button"))
        .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "")
        .filter((w) => /run an agent/i.test(w)),
      sheet: Boolean(document.querySelector("[data-sheet-layout]")),
      layoutButtons: Array.from(document.querySelectorAll("main button"))
        .map((b) => (b.textContent ?? "").trim())
        .filter((w) => ["Grid", "Kanban", "Calendar", "Gallery", "Sheet"].includes(w)),
      withheldCells: Array.from(document.querySelectorAll("[data-sheet-layout] [data-records-withheld]")).map((el) => ({
        text: el.textContent,
        title: el.getAttribute("title"),
      })),
      dashCells: Array.from(document.querySelectorAll("[data-sheet-layout] td")).filter((td) => (td.textContent ?? "").trim() === "—").length,
      errorText: /Something went wrong|Application error/i.test(text),
    };
  });

const hubFacts = (page) =>
  page.evaluate(() => {
    const text = document.body.innerText;
    const count = (needle) => text.split(needle).length - 1;
    return {
      serviceCallsMentions: count("Rincon Plumbing — Service Calls"),
      statusChoicesMentions: count("Status choices"),
      choicesMentions: count(" choices"),
      keptHeading: count("Kept by the app"),
      showEverything: Boolean(document.querySelector("[data-hub-show-everything]")),
      showEverythingState: document.querySelector("[data-hub-show-everything]")?.getAttribute("data-hub-show-everything") ?? null,
      makeATable: /New table/.test(text),
    };
  });

async function settle(page) {
  await page.waitForSelector("table, [data-sheet-layout], [data-host-layout], [role='grid'], [data-hub-root]", { timeout: 120000 }).catch(() => {});
  await sleep(8000);
}

const result = {};
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, "admin seat");
    if (who !== EMAIL) throw new Error("the app says someone else is signed in");
    result[`who-${width}`] = who === EMAIL ? "admin seat confirmed by /api/whoami" : who;

    await page.goto(`${ORIGIN}/data-v2?org=${ORG}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/hub-admin-${width}.png`, fullPage: width === 1440 });
    result[`hub-${width}`] = await hubFacts(page);
    const toggle = page.locator("[data-hub-show-everything] button");
    if (await toggle.count()) {
      await toggle.first().click();
      await sleep(2500);
      await page.screenshot({ path: `${OUT}/hub-admin-show-everything-${width}.png`, fullPage: width === 1440 });
      result[`hub-shown-${width}`] = await hubFacts(page);
    }

    for (const [which, table] of [["designated", DESIGNATED], ["plain", PLAIN]]) {
      await page.goto(`${ORIGIN}/data-v2/${table}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await settle(page);
      const shot = `${OUT}/${which}-table-admin-${width}.png`;
      await page.screenshot({ path: shot });
      result[`${which}-${width}`] = { shot, ...(await facts(page)) };
    }
    result[`pageErrors-${width}`] = errors;
    console.log(JSON.stringify({ width, ...Object.fromEntries(Object.entries(result).filter(([k]) => k.endsWith(`-${width}`))) }));
    await context.close();
  }
  if (TEST_EMAIL) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const who = await signIn(page, ORIGIN, TEST_EMAIL, PASSWORD, "test seat");
    if (who === TEST_EMAIL) {
      await page.goto(`${ORIGIN}/data-v2/${ROOMS}?view=sheet`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await settle(page);
      await page.screenshot({ path: `${OUT}/rooms-sheet-test-1440.png` });
      result["rooms-test-1440"] = await facts(page);
      console.log(JSON.stringify({ rooms: result["rooms-test-1440"] }));
    } else result["rooms-test-1440"] = "the app says someone else is signed in";
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/census.json`, JSON.stringify(result, null, 2));
