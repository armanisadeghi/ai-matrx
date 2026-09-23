/**
 * OLD-TABLES-4 — the headless proof that a MOVED older table works from the admin seat.
 *
 *   node scripts/oldtables4-move-proof.mjs            # starts its own dev server on 3058 if none is up
 *   node scripts/oldtables4-move-proof.mjs --no-server  # a server is already on 3058
 *
 * Run it AFTER admin's Workspace has been moved on the main database. It walks Rincon
 * Plumbing & Drain's Service Calls — a real older table whose `customer` column points at
 * the Customers table — and proves every clause of the chair's ruling, each one a PASS or
 * a FAIL with what the screen actually showed:
 *
 *   old-link-redirects   the OLD link /data/<id> lands on the table in its new home
 *   old-link-sentence    ...and the screen says in words that it moved
 *   unified-table        /data-v2/<id> renders the real rows (WO-4471 is on screen)
 *   views                a view switcher is there
 *   archive              the table's archive is reachable
 *   forms-rail           the forms rail is reachable
 *   relation-words       the customer column reads names (Maria Delgado …), zero bare uuids
 *   quiet                zero console errors, zero responses >= 400
 *
 * Headless only (never the owner's screen), on this lane's own port from
 * scripts/campaign-ports.json. Screenshots land beside the owner's other proof pictures.
 * Exit 0 only when every clause passes.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const PORT = JSON.parse(readFileSync(resolve(ROOT, "scripts/campaign-ports.json"), "utf8")).lanes["OLD-TABLES-4"];
const HOST = "127.0.0.1";
const ORIGIN = `http://${HOST}:${PORT}`;
const CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598"; // Rincon Plumbing — Service Calls, admin's Workspace
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const WORDS = ["Maria Delgado", "Harbor View HOA", "Takeda Property Management"];
mkdirSync(OUT, { recursive: true });

async function up() {
  try { return (await fetch(`${ORIGIN}/api/whoami`)).status < 500; } catch { return false; }
}

async function ensureServer() {
  if (process.argv.includes("--no-server") || (await up())) return null;
  const child = spawn(process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT), "-H", HOST],
    { cwd: ROOT, env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072 --dns-result-order=ipv4first" }, stdio: "ignore" });
  for (let i = 0; i < 180; i += 1) {
    if (await up()) return child;
    await new Promise((r) => setTimeout(r, 2000));
  }
  child.kill();
  throw new Error(`the dev server on ${ORIGIN} never answered`);
}

const clauses = {};
const pass = (name, ok, saw) => { clauses[name] = { ok: Boolean(ok), saw }; console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${saw}`); };

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const bad = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });

    const nonce = randomBytes(16).toString("hex");
    writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
    await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(`/data/${CALLS}`)}`,
      { waitUntil: "domcontentloaded", timeout: 240000 });
    const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
    if (who?.email !== "admin@admin.com") throw new Error(`wrong seat: ${JSON.stringify(who)} — the walk would prove nothing`);
    console.log(`seat ${who.email}`);

    // ── the OLD link ────────────────────────────────────────────────────────────────
    await page.goto(`${ORIGIN}/data/${CALLS}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForURL(new RegExp(`/data-v2/${CALLS}`), { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const landed = page.url();
    await page.screenshot({ path: `${OUT}/oldtables4-1-old-link-lands-in-the-new-home.png` });
    pass("old-link-redirects", landed.includes(`/data-v2/${CALLS}`), landed);
    const arrival = await page.evaluate(() => document.body.innerText);
    const sentence = (arrival.match(/[^.\n]*\bmoved\b[^.\n]*/i) || [null])[0];
    pass("old-link-sentence", Boolean(sentence), sentence || "no sentence on arrival says the table moved");

    // ── the unified table ───────────────────────────────────────────────────────────
    await page.goto(`${ORIGIN}/data-v2/${CALLS}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, { timeout: 240000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: `${OUT}/oldtables4-2-service-calls-on-the-new-table.png` });
    pass("unified-table", text.includes("WO-4471"), text.includes("WO-4471") ? "WO-4471 on screen" : "no rows rendered");
    const views = await page.locator('[aria-label*="view" i], button:has-text("View"), [role="tab"]:has-text("Grid"), button:has-text("Grid")').count();
    pass("views", views > 0, `${views} view control(s)`);
    const archive = await page.locator('button:has-text("Archived"), a:has-text("Archived"), [aria-label*="archive" i]').count();
    pass("archive", archive > 0, `${archive} archive control(s)`);
    const forms = await page.locator('button:has-text("Forms"), a:has-text("Forms"), [aria-label*="form" i]').count();
    pass("forms-rail", forms > 0, `${forms} forms control(s)`);
    const hit = WORDS.filter((w) => text.includes(w));
    const uuids = (text.match(UUID) || []).length;
    pass("relation-words", hit.length > 0 && uuids === 0, `names ${JSON.stringify(hit)}, bare uuids ${uuids}`);
    await page.screenshot({ path: `${OUT}/oldtables4-3-customers-read-as-names.png`, fullPage: true });

    pass("quiet", errors.length === 0 && bad.length === 0, `console errors ${errors.length}, responses>=400 ${bad.length}`);
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  writeFileSync(`${OUT}/oldtables4-walk.json`, JSON.stringify({ clauses, errors: errors.slice(0, 10), bad: bad.slice(0, 10) }, null, 2));
  const failed = Object.entries(clauses).filter(([, c]) => !c.ok).map(([n]) => n);
  console.log(failed.length ? `FAILED: ${failed.join(", ")}` : "ALL CLAUSES PASS");
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(2); });
