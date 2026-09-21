/**
 * THE HEADLESS WALK for lane SCREENS-2 — the four screens, photographed in the REAL app.
 *
 * It signs in as `admin@admin.com` through the dev-login nonce handshake (no credential is
 * ever typed or printed), puts the session in the walkthrough organization, and captures the
 * checklist, the booking panel, the enrichment column and the pipeline board as a person sees
 * them. A capture that cannot find what it came for FAILS LOUDLY rather than saving a picture
 * of a skeleton — a screenshot of a half-loaded page reads exactly like a working screen.
 *
 *   node scripts/screens2-walk.mjs --out <dir> [--seat admin|member]
 *
 * The port comes from `scripts/campaign-ports.json`; the organization and the table ids come
 * from `--org` / `--deals` / `--people`, because this walk is over data a SQL fixture made and
 * nothing here may invent one.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const PORTS = JSON.parse(readFileSync(resolve(ROOT, "scripts/campaign-ports.json"), "utf8"));
const PORT = PORTS.lanes["SCREENS-2"];
const HOST = "127.0.0.1";
const ORIGIN = `http://${HOST}:${PORT}`;

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const OUT = resolve(argOf("out", "/tmp/screens2"));
const ORG = argOf("org", "");
const DEALS = argOf("deals", "");
const PEOPLE = argOf("people", "");
const RECORD = argOf("record", "");
if (!ORG || !DEALS || !PEOPLE) throw new Error("--org, --deals and --people are required");
mkdirSync(OUT, { recursive: true });

const shots = [];
async function shoot(page, name, mustSee) {
  // WHAT IT CAME FOR, OR NOTHING. A picture taken before the screen answered is worse than no
  // picture: it looks like a finished page and it is a skeleton.
  for (const text of mustSee) {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout: 45_000 });
  }
  const file = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  shots.push({ name, file, saw: mustSee });
  console.log(`  captured ${name} — saw ${mustSee.map((t) => JSON.stringify(t)).join(", ")}`);
}

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  // A COLD Next dev route compiles for well over the default 30s, and a navigation that times
  // out there is a fact about the compiler, not about the screen.
  page.setDefaultNavigationTimeout(180_000);
  page.setDefaultTimeout(90_000);

  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent("/data-v2")}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle").catch(() => {});

  // THE ORGANIZATION IS SET, NEVER ASSUMED. `ensureOrgId` holds every request until the
  // person picks one, so a walk that skipped this would photograph the hold screen.
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const picked = await page.evaluate(() => {
    let hit = null;
    document.querySelectorAll("*").forEach((e) => {
      if (!hit && e.children.length === 0 && (e.textContent || "").trim() === "Cedar Ridge Dental") {
        const b = e.closest("button");
        if (b) {
          b.click();
          hit = true;
        }
      }
    });
    return hit;
  });
  console.log(picked ? "  organization set: Cedar Ridge Dental" : "  organization NOT picked");
  await page.waitForTimeout(4000);
  if (!picked) {
    const said = (await page.evaluate(() => document.body.innerText)).slice(0, 700);
    console.log(`  --- what the page says ---\n${said}\n  ---`);
  }

  // 1 — THE INBOX: a checklist step is a work item, and it reached the person it belongs to.
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded" });
  await shoot(page, "01-inbox-checklist-steps-are-work", [
    "Verify the state dental hygiene licence",
    "Submit credentialing to Delta and Cigna",
  ]);

  // 2 — THE PIPELINE BOARD, through the saved view's kanban layout.
  await page.goto(`${ORIGIN}/data-v2/${DEALS}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const board = page.getByRole("button", { name: "Kanban", exact: true }).first();
  await board.waitFor({ timeout: 45_000 });
  await board.click();
  await page.waitForTimeout(3500);
  await shoot(page, "02-pipeline-board", ["Proposed", "Insurance review", "Scheduled"]);

  // 3 — THE RECORD PAGE with the checklists running on this record, reached the way the
  //     inbox reaches it: the link that names the record. Needs records-ui 0.44.0 in the app;
  //     before that the parameter is read by nobody and the record stays shut, so this SKIPS
  //     rather than photographing a table and calling it a record page.
  await page.goto(`${ORIGIN}/data-v2/${PEOPLE}?record=${RECORD}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  // THE RAIL, NOT THE HEADER BUTTON. The page always carries a "Checklists" control; the
  // record rail is an <aside>, and `ChecklistRunner` inside it carries its own test id. A
  // looser check photographed the plain table and called it the record page — which is the
  // one thing this walk exists to prevent, so it is checked by the rail's own marker.
  const railOpened = (await page.locator('aside [data-testid="checklist-runner"]').count()) > 0;
  if (railOpened) {
    await shoot(page, "03-record-page-checklist-run", ["Rosalind Tam", "Checklists"]);
  } else {
    console.log("  SKIPPED 03 — this build's records-ui does not read ?record= yet (needs 0.44.0)");
  }

  // 4 — THE TABLE'S OWN RAILS, each on the table that actually owns the thing. The booking
  //     page is declared over the plans table; the checklist is written ABOUT Staff. Opening
  //     both on one table would have photographed an honest empty state and called it the
  //     screen — which it did once, before this line.
  for (const [table, rail, name, mustSee] of [
    [DEALS, "Bookings", "04-bookings-panel", ["Book a new-patient consult"]],
    [PEOPLE, "Checklists", "05-checklists-panel", ["New hygienist onboarding"]],
  ]) {
    await page.goto(`${ORIGIN}/data-v2/${table}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const control = page.getByRole("button", { name: rail, exact: true }).first();
    if ((await control.count()) === 0) {
      console.log(`  SKIPPED ${name} — this build's records-ui has no "${rail}" rail yet`);
      continue;
    }
    await control.click();
    await page.waitForTimeout(3000);
    await shoot(page, name, mustSee);
  }

  await browser.close();
  console.log(`\n${shots.length} screenshot(s) in ${OUT}`);
};

main().catch((err) => {
  console.error(`WALK FAILED: ${err.message}`);
  process.exit(1);
});
