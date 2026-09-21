/**
 * PEEK-SHARE — does the record peek still refuse Ironclad Mobile Mechanic's own
 * admin her own service call?  Real use case: a one-van mobile mechanic opens a
 * service call to read its history before invoicing it.
 * Headless only.  node <this> --port 3001 --host <host> --table <id> --record <id> --tag <name>
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const PORT = arg("--port", "3001");
const OUT = arg("--out", "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/shots");
const TABLE = arg("--table");
const RECORD = arg("--record");
const TAG = arg("--tag", "peek");
const ORG = arg("--org");
const ORG_ID = arg("--org-id");
const VIEW = arg("--view");
const ADMIN_ID = "87a6e699-3622-4869-8843-d0867456c0dd";
const ORIGIN_OVERRIDE = arg("--origin");
mkdirSync(OUT, { recursive: true });

const target = RECORD ? `/data-v2/${TABLE}?record=${RECORD}` : `/data-v2/${TABLE}`;

async function main() {
  let ORIGIN, loginUrl = null;
  if (ORIGIN_OVERRIDE) {
    ORIGIN = ORIGIN_OVERRIDE;
  } else {
    const out = execFileSync("bash", [resolve(ROOT, "scripts/dev-login.sh"), target], { cwd: ROOT }).toString();
    loginUrl = out.split("\n").find((l) => l.includes("OPEN")).split("OPEN   : ")[1].trim();
    const u = new URL(loginUrl);
    u.port = PORT;
    loginUrl = u.toString();
    ORIGIN = u.origin;
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });

  // PRODUCTION: there is no dev-login there. Sign in at /login with the test
  // admin's own credentials, read from the environment file and never printed.
  if (!loginUrl) {
    const env = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    const pick = (k) => (env.split("\n").find((l) => l.startsWith(k + "=")) || "").slice(k.length + 1).replace(/^['"]|['"]$/g, "").trim();
    const user = pick("AI_ADMIN_USERNAME");
    const pass = pick("AI_ADMIN_PASSWORD");
    if (!user || !pass) throw new Error("no test-admin credentials in .env.local");
    await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForTimeout(4000);
    await page.locator('input[type="email"], input[name="email"]').first().fill(user);
    await page.locator('input[type="password"], input[name="password"]').first().fill(pass);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(15000);
    const who = await page.evaluate(async () => (await fetch("/api/whoami")).json()).catch(() => null);
    console.log(`[peek] signed in as ${who?.email ?? "(unknown)"}`);
    if (who?.email !== "admin@admin.com") throw new Error(`wrong identity on ${ORIGIN}: ${JSON.stringify(who)}`);
  }

  if (loginUrl) {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
    const who = await page.evaluate(async () => (await fetch("/api/whoami")).json()).catch(() => null);
    console.log(`[peek] signed in as ${who?.email ?? "(unknown)"}`);
    if (who?.email !== "admin@admin.com") throw new Error(`wrong identity: ${JSON.stringify(who)}`);
  }

  // WHICH ORGANIZATION THIS TAB IS IN. `matrx-active-org` is the app's own
  // cross-surface selection cookie (lib/organizations/activeOrgCookie.ts, rung 1
  // of resolveActiveOrgContext) — the same value a click in the picker writes.
  // Setting it is how a returning person arrives already in their organization;
  // it is not a bypass of any door, and every read below still goes through the
  // store's own doors as admin@admin.com.
  if (ORG_ID) {
    await ctx.addCookies([{
      name: "matrx-active-org",
      value: `${ADMIN_ID}:${ORG_ID}`,
      domain: new URL(ORIGIN).hostname,
      path: "/",
      sameSite: "Lax",
    }]);
  }

  await page.goto(`${ORIGIN}${target}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(8000);

  // The session files every request under one organization. If none is chosen the
  // page says so and offers the list; choose the one this run is about, by name.
  if (ORG && (await page.locator("text=Data records need an organization").count())) {
    // Several pickers exist in the shell; only one of them is on screen. Click the
    // VISIBLE option whose text is this organization's name.
    const opts = page.locator(`button:has-text("${ORG}")`);
    const n = await opts.count();
    let clicked = false;
    for (let i = 0; i < n; i += 1) {
      const o = opts.nth(i);
      if (await o.isVisible().catch(() => false)) { await o.click({ timeout: 20000 }); clicked = true; break; }
    }
    if (!clicked) throw new Error(`no visible picker option for ${ORG} (${n} hidden matches)`);
    await page.waitForTimeout(10000);
    await page.goto(`${ORIGIN}${target}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  }
  await page.waitForTimeout(12000);

  // A named view in the table toolbar (Kanban, Calendar, Gallery, Grid).
  if (VIEW) {
    const b = page.locator(`button:has-text("${VIEW}")`);
    const n = await b.count();
    for (let i = 0; i < n; i += 1) {
      const o = b.nth(i);
      if (await o.isVisible().catch(() => false)) { await o.click({ timeout: 20000 }); break; }
    }
    await page.waitForTimeout(15000);
  }

  const state = await page.evaluate(() => {
    const txt = document.body.innerText;
    const count = (s) => txt.split(s).length - 1;
    return {
      refusals: count("You do not have access to this"),
      footnoteSentence: txt.includes("Nothing here can say which columns the system worked out"),
      loadingCards: (document.body.innerText.match(/Loading…/g) || []).length,
      headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((h) => h.textContent.trim()).filter(Boolean).slice(0, 8),
      excerpt: txt.slice(0, 1400),
    };
  });
  console.log(JSON.stringify({ tag: TAG, ...state, consoleErrors: consoleErrors.slice(0, 5) }, null, 2));
  await page.screenshot({ path: resolve(OUT, `${TAG}.png`), fullPage: false });
  console.log(`[peek] shot -> ${resolve(OUT, `${TAG}.png`)}`);
  await browser.close();
}
main().catch((e) => { console.error("[peek] FAILED", e.message); process.exit(1); });
