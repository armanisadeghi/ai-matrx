/**
 * FIX-10A-ASSISTS — THE GATE: no 403 and no `[assists] …` line on the data pages, from
 * BOTH seats, on a real organization's real table.
 *
 * VERIFIER-10 finding F14: every `/data-v2/*` load from the admin seat logged
 * `403` and `[assists] resolve failed: permission denied for table assists`.
 * Nothing visibly broke and the page swallowed it, which is why it survived.
 *
 * It exits NON-ZERO on a single 403, a single `[assists]` line or a console error,
 * because a proof that only prints what it found is not a guard. It also opens a
 * NAMED table page rather than only the list: the list offered no table anchor on
 * the first run, so a version of this that trusted the list would have reported
 * green having never loaded the screen the defect was on.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, sleep } from "/Users/armanisadeghi/code/matrx-frontend/scripts/lib/seat-browser.mjs";

const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const env = {};
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(ROOT, f), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}
const ORIGIN = "http://fix10a-assists.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
mkdirSync(OUT, { recursive: true });

const SEATS = [
  { email: env.AI_ADMIN_USERNAME ?? "admin@admin.com", password: env.AI_ADMIN_PASSWORD, shot: "fix10a-assists-admin.png" },
  { email: "test@test.com", password: env.AI_TEST_PASSWORD ?? env.TEST_USER_PASSWORD ?? env.AI_ADMIN_PASSWORD, shot: "fix10a-assists-test.png" },
];

async function run(seat) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const console_ = [];
  const failed = [];
  page.on("console", (m) => console_.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => console_.push(`[pageerror] ${String(e)}`));
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`);
  });

  const who = await signIn(page, ORIGIN, seat.email, seat.password, seat.email);
  // A real business both seats belong to: Rincon Plumbing Co, a plumbing company whose
  // dispatcher keeps her jobs, customers and trucks in Data tables.
  const picked = await setOrganization(page, "Rincon Plumbing Co");
  console_.length = 0;
  failed.length = 0;

  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "networkidle", timeout: 120000 });
  await sleep(6000);
  await page.screenshot({ path: resolve(OUT, seat.shot), fullPage: false });

  // THE TABLE PAGE, NAMED. Rincon Plumbing Co's "Truck 1 dispatch backlog" — the
  // dispatcher's real ticket table, the one VERIFIER-10 worked in. Taken by id and
  // not from the list, because the list offered no anchor on the first run of this
  // script and a green that never opened a table page proves nothing.
  const NAMED_TABLE = "/data-v2/adeb37a2-476e-451a-b4a4-7800303f550f";
  const href = await page.evaluate(() =>
    (Array.from(document.querySelectorAll('a[href^="/data-v2/"]'))
      .map((a) => a.getAttribute("href"))
      .find((h) => h && h !== "/data-v2" && !h.includes("try-everything"))) ?? null,
  );
  const tablePages = [...new Set([href, NAMED_TABLE].filter(Boolean))];
  for (const path of tablePages) {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle", timeout: 120000 });
    await sleep(6000);
  }
  const tablePage = tablePages.join(" + ");
  await browser.close();
  return { who, picked, tablePage, console_, failed };
}

let failures = 0;
for (const seat of SEATS) {
  try {
    const r = await run(seat);
    const assists = r.console_.filter((l) => /\[assists\]/.test(l));
    const forbidden = r.failed.filter((l) => l.startsWith("403"));
    console.log(`\n===== SEAT ${seat.email} — app says signed in as: ${r.who} =====`);
    console.log(`organization picked ${r.picked}; pages: /data-v2 and ${r.tablePage ?? "(no table link on the list)"}`);
    console.log(`console messages: ${r.console_.length}; [assists] lines: ${assists.length}`);
    assists.forEach((l) => console.log("  ASSIST: " + l));
    console.log(`failed responses: ${r.failed.length}; 403s: ${forbidden.length}`);
    r.failed.forEach((l) => console.log("  FAILED: " + l));
    const errs = r.console_.filter((l) => l.startsWith("[error]"));
    console.log(`console errors: ${errs.length}`);
    errs.slice(0, 15).forEach((l) => console.log("  ERR: " + l.slice(0, 220)));
    if (assists.length || forbidden.length || errs.length) failures += 1;
  } catch (e) {
    console.log(`\n===== SEAT ${seat.email} FAILED: ${String(e).slice(0, 300)}`);
    failures += 1;
  }
}

console.log(
  failures === 0
    ? "\nGREEN — both seats load the data pages with no 403, no [assists] line and no console error."
    : `\nRED — ${failures} seat(s) still hit a 403, an [assists] line or a console error.`,
);
process.exit(failures === 0 ? 0 : 1);
