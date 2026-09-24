/**
 * OLD-TABLES-4 — the headless proof that a COPIED older table stands SIDE BY SIDE with its
 * copy, from the admin seat (owner's ruling 2026-09-23: nothing redirects; old and new both open).
 *
 *   node scripts/oldtables4-move-proof.mjs            # starts its own dev server on 3058 if none is up
 *   node scripts/oldtables4-move-proof.mjs --no-server  # a server is already on 3058
 *
 * Run it AFTER admin's Workspace has been moved on the main database. It walks Rincon
 * Plumbing & Drain's Service Calls — a real older table whose `customer` column points at
 * the Customers table — and proves every clause of the chair's ruling, each one a PASS or
 * a FAIL with what the screen actually showed:
 *
 *   old-link-stays       the OLD link /data/<id> stays at /data/<id> and shows its rows
 *   old-link-older-store ...read from the OLDER store (its own read door; no record-store read)
 *   old-link-no-sentence ...with no sentence saying the table moved (nothing moved)
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

    // THE ORGANIZATION IS CHOSEN, NEVER ASSUMED. A fresh session has none, and every
    // record-store screen then asks for one (that is the platform law, not a failure). The
    // walk picks admin's Workspace through the same picker a person uses, once.
    await page.goto(`${ORIGIN}/data-v2/${CALLS}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const picker = page.getByText("admin's Workspace", { exact: true }).locator("visible=true").first();
    await picker.waitFor({ timeout: 60000 }).catch(() => {});
    if ((await page.getByText(/organization/i).filter({ hasText: /needed|need an/i }).count()) > 0 && (await picker.count()) > 0) {
      await picker.click();
      await page.waitForTimeout(3000);
    }
    console.log("organization chosen: admin's Workspace");

    // ── the OLD link: the older viewer over the older store, as always ───────────────
    // GRID-PORT removed the /data redirect on the owner's ruling (matrx-frontend 6528af13b4):
    // /data/<id> never asks the record store, never goes to /data-v2 and never says a table
    // moved. The walk proves exactly that, beside the new address below.
    const reads = [];
    // A store read counts only when it is a read OF THIS TABLE (its id in the request body) —
    // the shell's own panels read other store tables on every page, and those are not /data's.
    const onRequest = (r) => {
      if (!/\/rest\/v1\/rpc\//.test(r.url())) return;
      const door = r.url().split("/rpc/")[1].split("?")[0];
      reads.push({ door, ofThisTable: (r.postData() || "").includes(CALLS) });
    };
    page.on("request", onRequest);
    await page.goto(`${ORIGIN}/data/${CALLS}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, { timeout: 240000 }).catch(() => {});
    await page.waitForTimeout(3000);
    page.off("request", onRequest);
    const landed = page.url();
    const older = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: `${OUT}/oldtables4-1-old-address-opens-the-older-table.png` });
    pass("old-link-stays", landed.includes(`/data/${CALLS}`) && !landed.includes("/data-v2/") && older.includes("WO-4471"),
      `${landed} (${older.includes("WO-4471") ? "rows" : "no rows"})`);
    const olderDoor = reads.some((r) => /^get_user_table/.test(r.door) && r.ofThisTable);
    const storeRead = reads.filter((r) => /^(read_records|where_id_opens|record_)/.test(r.door) && r.ofThisTable).map((r) => r.door);
    pass("old-link-older-store", olderDoor && storeRead.length === 0,
      `older read door ${olderDoor ? "called" : "NOT called"} for this table; record-store reads of this table ${storeRead.length}${storeRead.length ? " " + JSON.stringify([...new Set(storeRead)]) : ""}`);
    const sentence = (older.match(/[^.\n]*\bmoved\b[^.\n]*/i) || [null])[0];
    pass("old-link-no-sentence", !sentence, sentence || "no sentence says the table moved");

    // ── the unified table ───────────────────────────────────────────────────────────
    await page.goto(`${ORIGIN}/data-v2/${CALLS}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, { timeout: 240000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: `${OUT}/oldtables4-2-new-address-opens-the-store-copy.png` });
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

    // ON A CLONE-BACKED SERVER the Python server is still production's, and it rightly
    // refuses a session JWT the CLONE minted (401 on /files/session and the outage poll).
    // Those are named and excluded only when the dev server points at the clone; against
    // the main database every one of them counts.
    const onClone = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").includes("jxhgzalwckuarngvsdyq");
    const python = /https:\/\/(server\.app|files)\.matrxserver\.com\//;
    const excused = onClone ? bad.filter((b) => b.startsWith("401 ") && python.test(b.slice(4))) : [];
    const counted = bad.filter((b) => !excused.includes(b));
    const countedErrors = onClone ? errors.filter((e) => !/status of 401/.test(e)) : errors;
    pass("quiet", countedErrors.length === 0 && counted.length === 0,
      `console errors ${countedErrors.length}, responses>=400 ${counted.length}` +
      (excused.length ? ` (plus ${excused.length} expected 401s from production's Python server refusing a clone-minted session)` : ""));
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
