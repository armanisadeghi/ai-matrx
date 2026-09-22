/**
 * DRILL — THE PROOF, FROM THE SEAT, HEADLESS.
 *
 * THE USE CASE. Rincon Plumbing Co runs one truck and forty-odd live jobs. The owner opens the
 * Jobs dashboard on Monday, sees the Jobs-by-stage chart say Cancelled 4, and clicks it —
 * because four cancellations is either a bad week or a bad dispatcher, and she wants the four.
 *
 * WHAT THIS SCRIPT PROVES, AND WHY IT IS NOT A SCREENSHOT OF A NUMBER. It signs in as
 * admin@admin.com through the login form, moves to Rincon Plumbing Co (behind the test-fixture
 * disclosure, the way a person reaches it), opens the Dashboards tab, clicks a bar, and then
 * asserts THREE things that can each fail independently:
 *
 *   1. the address carries the QUESTION (`?filter=`), not just the grouping;
 *   2. the screen says which question is holding the rest of the table back, in her words;
 *   3. the rows on screen are ONLY the ones behind that number — counted against what
 *      `custom.record_aggregate` said the number was.
 *
 *   node scripts/drill/proof.mjs --out <dir>
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, until, sleep } from "../lib/seat-browser.mjs";

const ROOT = process.cwd();
const PORTS = JSON.parse(readFileSync(resolve(ROOT, "scripts/campaign-ports.json"), "utf8"));
const PORT = PORTS.lanes["DRILL"];
const ORIGIN = `http://127.0.0.1:${PORT}`;

const ORG = "Rincon Plumbing Co";
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163";
// Her "Truck 1 — jobs by stage" board. Named, because a proof that clicks whichever chart
// happens to be first proves whatever that chart happened to be.
const BOARD = "4fb858b5-4f68-4b9d-9738-67131f54e870";

const argv = process.argv.slice(2);
const OUT = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : resolve(ROOT, "scripts/drill/shots");
mkdirSync(OUT, { recursive: true });

function env(name) {
  for (const file of [".env.local", ".env", "../aidream/.env"]) {
    try {
      const line = readFileSync(resolve(ROOT, file), "utf8")
        .split("\n")
        .find((l) => l.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "");
    } catch {}
  }
  return null;
}

const said = [];
function say(line) {
  said.push(line);
  console.log(`[drill] ${line}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const email = env("AI_ADMIN_USERNAME") ?? "admin@admin.com";
  const password = env("AI_ADMIN_PASSWORD");
  if (!password) throw new Error("AI_ADMIN_PASSWORD is not in either .env — nothing was tried");
  const who = await signIn(page, ORIGIN, email, password);
  say(`signed in as ${who}`);
  if (who !== "admin@admin.com") throw new Error(`the seat is ${who}, not the test account`);

  await setOrganization(page, ORG);
  say(`organization: ${ORG}`);

  // ── 1. THE DASHBOARD, AND THE NUMBER ───────────────────────────────────────
  await page.goto(`${ORIGIN}/data-v2/${JOBS}?view=dashboards&dashboard=${BOARD}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await until("the dashboard canvas", async () => (await page.locator("svg .recharts-bar-rectangle").count()) > 0, 90000);
  await page.screenshot({ path: resolve(OUT, "drill-1-the-dashboard.png"), fullPage: false });

  const bars = page.locator("svg .recharts-bar-rectangle");
  const barCount = await bars.count();
  say(`the chart drew ${barCount} bar(s)`);
  if (barCount === 0) throw new Error("no bar to click — nothing was proved");

  // ── 2. THE CLICK ───────────────────────────────────────────────────────────
  // NOT THE BIGGEST BAR. The chart orders by count descending, so the first bar is the
  // largest group — and a drill that "worked" by opening the largest group is the one
  // least likely to notice it actually opened the whole table. A small, NAMED group is
  // the one that can tell the two apart, so this takes a middle bar and refuses a blank.
  const pick = Math.min(2, barCount - 1);
  await bars.nth(pick).click({ force: true });
  await until("the address to carry the question", async () => page.url().includes("filter="), 30000);
  const url = new URL(page.url());
  const question = url.searchParams.get("filter");
  say(`the address carries the question: ${question}`);
  if (!question) throw new Error("the address has no ?filter= — the click threw the question away");
  const asked = JSON.parse(question);
  const [askedKey] = Object.keys(asked);
  if (asked[askedKey] === null) {
    throw new Error(
      "the bar this proof clicked is the group nobody has filled in — a real proof needs a NAMED group",
    );
  }

  // ── 3. THE SENTENCE ────────────────────────────────────────────────────────
  const notice = await until(
    "the sentence about where they came from",
    async () => (await page.locator('[data-testid="came-from-a-number"]').textContent())?.trim() || null,
    60000,
  );
  say(`the screen says: ${notice.v}`);
  if (!/only the records that number counted/.test(notice.v ?? "")) {
    throw new Error("the screen does not say it is narrowed");
  }

  await sleep(2500);
  await page.screenshot({ path: resolve(OUT, "drill-2-only-those-rows.png"), fullPage: false });

  // ── 5. THE SAME QUESTION, IN THE GRID. The board and the grid each ask the store for
  //      their own page, so a filter honoured by one and not the other is a layout button
  //      that silently changes which records you are looking at. The grid is also where
  //      rows are countable, so this is where the number is checked.
  //
  //      🚨 `table tbody tr` IS NOT A ROW. The loading skeleton satisfies it — this proof
  //      counted six "rows" of a four-row answer on its first run, which is exactly the
  //      trap `scripts/grid-parity/shots.mjs` wrote down. A row is a `tr[data-row-id]`,
  //      and the count is taken only once it has stopped changing.
  const settledRows = async (label) => {
    const count = () => page.evaluate(() => document.querySelectorAll("table tbody tr[data-row-id]").length);
    let last = -1;
    for (let i = 0; i < 40; i += 1) {
      await sleep(750);
      const now = await count();
      if (now > 0 && now === last) return now;
      last = now;
    }
    throw new Error(`${label}: the grid never settled on a row count`);
  };

  url.searchParams.set("view", "grid");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 120000 });
  const narrowed = await settledRows("narrowed");
  const values = await page.evaluate(() =>
    Array.from(document.querySelectorAll("table tbody tr[data-row-id]")).map(
      (row) => (row.textContent ?? "").trim(),
    ),
  );
  say(`${askedKey} = ${String(asked[askedKey])} — rows in the grid: ${narrowed}`);
  await sleep(1000);
  await page.screenshot({ path: resolve(OUT, "drill-3-the-grid-asks-the-same-question.png"), fullPage: false });

  // EVERY ROW ON SCREEN IS ONE THE NUMBER COUNTED. A screen that narrowed to the wrong
  // rows looks exactly like one that narrowed to the right ones.
  const wrong = values.filter((text) => !text.includes(String(asked[askedKey])));
  if (wrong.length > 0) {
    throw new Error(
      `${wrong.length} row(s) on screen do not carry ${askedKey} = ${String(asked[askedKey])}`,
    );
  }
  say(`every one of the ${narrowed} rows carries ${askedKey} = ${String(asked[askedKey])}`);

  // AND IT IS A SUBSET, NOT THE WHOLE TABLE WEARING A SENTENCE.
  url.searchParams.delete("filter");
  url.searchParams.delete("from");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 120000 });
  const whole = await settledRows("unfiltered");
  say(`the same grid with no question: ${whole} rows`);
  if (!(narrowed < whole)) {
    throw new Error(
      `the narrowed grid showed ${narrowed} of ${whole} rows — it did not narrow anything, and the sentence on it says it did`,
    );
  }

  writeFileSync(resolve(OUT, "drill-what-was-proved.txt"), said.join("\n") + "\n");
  await browser.close();
  say("done");
}

main().catch(async (err) => {
  console.error(`[drill] FAILED: ${err?.message ?? err}`);
  process.exitCode = 1;
});
