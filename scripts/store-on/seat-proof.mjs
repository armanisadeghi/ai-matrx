// STORE-ON seat re-verify — both test identities see the record store ON at /data-v2.
//
// Owner ruling 2026-09-23: the record store's default is ON. This signs in the way a person
// does (the login form, headless Playwright, never the in-app browser pane) as admin@admin.com
// and as test@test.com, opens /data-v2 in the organization each is working in, and records:
// whether any store-off or could-not-check sentence is on the screen, what the hub shows, the
// console errors and every response >= 400. A screenshot per seat lands in for-arman.
//
//   node scripts/store-on/seat-proof.mjs [origin]      # default http://store-on.localhost:3001
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { signIn } from "../lib/seat-browser.mjs";

const env = { ...process.env };
for (const f of ["/Users/armanisadeghi/code/matrx-frontend/.env.local", "/Users/armanisadeghi/code/aidream/.env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}
const ORIGIN = process.argv[2] ?? "http://store-on.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
mkdirSync(OUT, { recursive: true });

// The sentences a switched-off or unreadable store puts on the screen, old and new spellings.
const OFF = [
  /has its record store switched off/i,
  /does not keep its data in the unified record store/i,
  /has turned (its|the) record store off/i,
  /could not check this organization'?s record store/i,
];

const SEATS = [
  // Ashford Labs read the store OFF by omission until the batch of 2026-09-23.
  { email: env.AI_ADMIN_USERNAME ?? "admin@admin.com", password: env.AI_ADMIN_PASSWORD, org: "Ashford Labs", shot: "store-on-seat-admin.png" },
  // Ironclad Mobile Mechanic, a crew test@test.com works in, also read OFF until that batch.
  { email: "test@test.com", password: env.TEST_USER_PASSWORD ?? "Password1234#", org: "Ironclad Mobile Mechanic", shot: "store-on-seat-test.png" },
  // VERIFIER-15, 2026-09-23: test@test.com's OWN workspace, which a demo seam had kept
  // committing back to OFF. The personal organization is picked by name like any other.
  { email: "test@test.com", password: env.TEST_USER_PASSWORD ?? "Password1234#", org: "Alex Hart's Workspace", shot: "store-on-seat-test-own-workspace.png" },
];

async function run(seat) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 160)}`); });
  try {
    const who = await signIn(page, ORIGIN, seat.email, seat.password);
    // A dev server that is recompiling aborts the first navigation; that is the server, not
    // the page, so it is retried and every retry is said out loud.
    for (let i = 1; ; i++) {
      try {
        await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
        break;
      } catch (e) {
        if (i >= 4) throw e;
        console.error(`[retry ${i}] /data-v2 navigation: ${String(e).split("\n")[0]}`);
        await page.waitForTimeout(5000);
      }
    }
    await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(3000);
    // A session with no organization picked gets the picker — honest, and not the question
    // this proof asks. Pick one the way a person does, then read the hub.
    let picked = null;
    if (/need an organization|organization is needed|No organization selected/i.test(await page.evaluate(() => document.body.innerText))) {
      const rows = page.locator(':is(button, [role="option"]):visible').filter({ hasNotText: /Test organizations|Keep it at the top|Choose org/ });
      const target = rows.filter({ hasText: seat.org }).first();
      picked = ((await target.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      await target.click();
      await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
      await page.waitForTimeout(6000);
    }
    const text = await page.evaluate(() => document.body.innerText);
    const offHits = OFF.filter((re) => re.test(text)).map(String);
    const tables = (text.match(/Tables\s*(\d+)/) ?? [])[1] ?? null;
    const newTable = /New table/i.test(text);
    await page.screenshot({ path: `${OUT}/${seat.shot}`, fullPage: false });
    return { seat: seat.email, signedInAs: who, organizationPicked: picked, storeOffSentences: offHits, tablesHeader: tables, newTableControl: newTable, consoleErrors: errors, responses400: failed, shot: `${OUT}/${seat.shot}` };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const s of SEATS) results.push(await run(s));
writeFileSync(`${OUT}/store-on-seat-evidence.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
const bad = results.filter((r) => r.signedInAs !== r.seat || r.storeOffSentences.length || !r.newTableControl);
process.exit(bad.length ? 1 : 0);
