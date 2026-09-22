/**
 * FIX-10A-ASSISTS proof: no 403 and no `[assists] resolve failed` on /data-v2, from both seats.
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

  // the first table page the list offers
  const href = await page.evaluate(() =>
    (Array.from(document.querySelectorAll('a[href^="/data-v2/"]'))
      .map((a) => a.getAttribute("href"))
      .find((h) => h && h !== "/data-v2" && !h.includes("try-everything"))) ?? null,
  );
  let tablePage = null;
  if (href) {
    tablePage = href;
    await page.goto(`${ORIGIN}${href}`, { waitUntil: "networkidle", timeout: 120000 });
    await sleep(6000);
  }
  await browser.close();
  return { who, picked, tablePage, console_, failed };
}

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
  } catch (e) {
    console.log(`\n===== SEAT ${seat.email} FAILED: ${String(e).slice(0, 300)}`);
  }
}
