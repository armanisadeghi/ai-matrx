/**
 * SHARE-OUT — the Share dialog's outside lane, on a real table, headless.
 *
 * THE REAL USE CASE. Rincon Plumbing Co wants ONE customer to see the Jobs
 * table and nothing else. This drives the actual screens a person drives: open
 * the table, press Share, and photograph each state the outside lane can be in
 * — shut, open-and-invitable, invited-not-yet-joined.
 *
 * Headless only, on the machine's one dev server (port 3001) and on this
 * session's OWN hostname, so no other agent's cookie jar is touched and nothing
 * opens on the owner's screen.
 *
 *   node scripts/campaign-share-out/shots.mjs --org-id <uuid> --table <uuid> --out <dir>
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const PORT = arg("--port", "3001");
const OUT = arg("--out", "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-21");
const ORG_ID = arg("--org-id");
const TABLE = arg("--table");
const ADMIN_ID = "87a6e699-3622-4869-8843-d0867456c0dd";
mkdirSync(OUT, { recursive: true });

const target = `/data-v2/${TABLE}`;

async function main() {
  const out = execFileSync("bash", [resolve(ROOT, "scripts/dev-login.sh"), target], { cwd: ROOT }).toString();
  let loginUrl = out.split("\n").find((l) => l.includes("OPEN")).split("OPEN   : ")[1].trim();
  const u = new URL(loginUrl);
  u.port = PORT;
  loginUrl = u.toString();
  const ORIGIN = u.origin;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json()).catch(() => null);
  console.log(`[share-out] signed in as ${who?.email ?? "(unknown)"}`);
  if (who?.email !== "admin@admin.com") throw new Error(`wrong identity: ${JSON.stringify(who)}`);

  // The app's own cross-surface organization cookie — the same value a click in
  // the picker writes. Not a bypass: every read below still goes through the
  // store's doors as admin@admin.com.
  await ctx.addCookies([{
    name: "matrx-active-org",
    value: `${ADMIN_ID}:${ORG_ID}`,
    domain: new URL(ORIGIN).hostname,
    path: "/",
    sameSite: "Lax",
  }]);

  await page.goto(`${ORIGIN}${target}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(15000);

  // The dialog scrolls its own body; a shot taken without scrolling photographs
  // the top of a panel whose point is at the bottom.
  const toOutsidePanel = async () => {
    await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("h3")).find((h) =>
        /People outside this organization/.test(h.textContent || ""));
      if (!heading) return;
      let el = heading.parentElement;
      while (el && el !== document.body) {
        if (el.scrollHeight > el.clientHeight + 8) { el.scrollTop = el.scrollHeight; return; }
        el = el.parentElement;
      }
    });
    await page.waitForTimeout(800);
  };

  const shot = async (tag) => {
    await toOutsidePanel();
    const path = resolve(OUT, `share-out-${tag}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`[share-out] shot -> ${path}`);
  };

  // Press the table's own Share control. The toolbar arrives after the grid's
  // own reads settle, so this waits for it rather than assuming a fixed delay —
  // a fixed delay is how a harness photographs a half-drawn page and calls it a
  // finding.
  const share = page.locator('button:has-text("Share"), [aria-label="Share"]');
  let opened = false;
  for (let attempt = 0; attempt < 12 && !opened; attempt += 1) {
    const n = await share.count();
    for (let i = 0; i < n; i += 1) {
      const b = share.nth(i);
      if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 20000 }); opened = true; break; }
    }
    if (!opened) await page.waitForTimeout(5000);
  }
  if (!opened) {
    await shot("no-share-button");
    throw new Error(`no visible Share control on ${target}`);
  }
  await page.waitForTimeout(6000);

  const read = async () => page.evaluate(() => {
    const t = document.body.innerText;
    return {
      dialogHasOutside: t.includes("People outside this organization"),
      laneShut: t.includes("is turned off"),
      canTurnOn: !!Array.from(document.querySelectorAll("button")).find((b) => /Turn on sharing with people outside/.test(b.textContent || "")),
      inviteField: !!document.querySelector('#outside-email'),
      pending: (t.match(/Invited, not yet joined/g) || []).length,
      excerpt: t.slice(0, 900),
    };
  });

  console.log(JSON.stringify({ state: "1-lane-shut", ...(await read()), errors: errors.slice(0, 5) }, null, 2));
  await shot("1-lane-shut");

  // ── STATE 2: the office opens its own outside door. ──────────────────────
  const turnOn = page.locator('button:has-text("Turn on sharing with people outside")');
  if (await turnOn.count()) {
    await turnOn.first().click({ timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot("2-turning-it-on-says-what-it-does");
    // The confirmation names the consequence before it happens.
    const yes = page.locator('button:has-text("Turn it on")');
    for (let i = 0; i < await yes.count(); i += 1) {
      const b = yes.nth(i);
      if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 20000 }); break; }
    }
    await page.waitForTimeout(8000);
  }
  console.log(JSON.stringify({ state: "3-lane-open", ...(await read()) }, null, 2));
  await shot("3-lane-open-invite-by-email");

  // ── STATE 3: invited, not yet joined. ────────────────────────────────────
  // 🚨 SCOPED TO THE DIALOG. An unscoped `button:has-text("Invite")` matched
  // something behind the modal on the first run and the click dismissed the
  // whole dialog — the harness then photographed a grid and reported a missing
  // row. Everything from here is addressed inside [role="dialog"].
  const dialog = page.locator('[role="dialog"]').first();
  const email = dialog.locator('#outside-email');
  if (await email.count()) {
    await email.first().fill('test@test.com');
    await page.waitForTimeout(500);
    await dialog.getByRole('button', { name: 'Invite', exact: true }).first().click({ timeout: 20000 });
    await page.waitForTimeout(9000);
  }
  const after = await read();
  console.log(JSON.stringify({ state: "4-invited-not-yet-joined", ...after }, null, 2));
  await shot("4-invited-not-yet-joined");
  if (after.pending < 1) throw new Error("the dialog does not show an invited-not-yet-joined row");
  await browser.close();
}
main().catch((e) => { console.error("[share-out] FAILED", e.message); process.exit(1); });
