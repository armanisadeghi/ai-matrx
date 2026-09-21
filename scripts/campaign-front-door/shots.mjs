/**
 * LANE FRONT-DOOR — the headless proof, and the measurement behind item 3.
 *
 * Headless Playwright ONLY (the in-app browser is the owner's screen and it
 * jumps tabs), on this session's own hostname so the cookie jar is this lane's
 * and no other agent's session is evicted.
 *
 *   node scripts/campaign-front-door/shots.mjs --out <dir> [--label before|after]
 *
 * It does three things and prints what it measured:
 *   1. `/data-v2/<Jobs>` — how long the relation column (CUSTOMER) says
 *      "Loading…", and how many `/rest/v1/rpc/*` calls the page makes while it
 *      does. VERIFIER-8 MEDIUM-1 measured 10–13 s against a door that answers
 *      in 268 ms, which is the per-cell-fetch shape.
 *   2. `/data-v2/<Jobs>?view=kanban` — what actually renders (VERIFIER-8
 *      HIGH-2: it rendered the grid).
 *   3. `/data-v2/try-everything` — section 16's badge and sentence
 *      (VERIFIER-8 HIGH-1: "Not built yet" + an access refusal the page
 *      provoked with the zero UUID).
 *
 * THE GROUND is the real crew organization, never a fixture: Rincon Plumbing
 * Co, a plumbing company that runs jobs, crews, customers and invoices.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.FRONT_DOOR_PORT ?? 3044); // the one machine-wide dev server (pnpm preview:start prints the port)
const HOST = "front-door.localhost";
const ORIGIN = `http://${HOST}:${PORT}`;

const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const RINCON = "6069a466-1445-42df-a64e-cf37ecdc1b99";
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163";

const argv = process.argv.slice(2);
const at = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
const OUT = resolve(at("--out", resolve(ROOT, "tmp/front-door-shots")));
const LABEL = at("--label", "before");
mkdirSync(OUT, { recursive: true });

const shot = (page, name) => page.screenshot({ path: resolve(OUT, `front-door-${LABEL}-${name}.png`), fullPage: false });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  // THE ORGANIZATION IS CHOSEN, never resolved for the person: the same apex
  // cookie the picker writes (`matrx-active-org` = <user>:<org>).
  await context.addCookies([
    { name: "matrx-active-org", value: `${ADMIN}:${RINCON}`, domain: HOST, path: "/" },
  ]);
  const page = await context.newPage();

  const rpc = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/rest/v1/rpc/")) rpc.push({ at: Date.now(), name: u.split("/rpc/")[1].split("?")[0] });
  });

  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent("/data-v2")}`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  if (!who?.email) throw new Error("no identity — dev-login did not take");
  console.log(`[front-door] signed in as ${who.email}`);

  // ── 1. THE RELATION COLUMN ────────────────────────────────────────────────
  rpc.length = 0;
  const t0 = Date.now();
  await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("table tbody tr", { timeout: 180000 }).catch(() => {});
  const rowsAt = Date.now() - t0;

  const loadingGone = async () =>
    page.evaluate(() => {
      const t = Array.from(document.querySelectorAll("table"))
        .sort((a, b) => b.querySelectorAll("tbody tr").length - a.querySelectorAll("tbody tr").length)[0];
      if (!t) return null;
      const body = t.innerText || "";
      return { loading: (body.match(/Loading…|Loading\.\.\./g) || []).length, rows: t.querySelectorAll("tbody tr").length };
    });

  let resolvedAt = null;
  for (let i = 0; i < 400; i += 1) {
    const state = await loadingGone();
    if (state && state.rows > 0 && state.loading === 0) {
      resolvedAt = Date.now() - t0;
      break;
    }
    if (i === 6) await shot(page, "1a-relation-column-while-loading");
    await page.waitForTimeout(100);
  }
  await shot(page, "1b-relation-column-resolved");
  const perDoor = rpc.reduce((m, r) => ((m[r.name] = (m[r.name] ?? 0) + 1), m), {});
  console.log(
    `[front-door] rows on screen at ${rowsAt} ms; relation column resolved at ` +
      `${resolvedAt === null ? "NEVER (40 s)" : `${resolvedAt} ms`}; ` +
      `${rpc.length} rpc call(s): ${JSON.stringify(perDoor)}`,
  );

  // ── 2. ?view=kanban ───────────────────────────────────────────────────────
  await page.goto(`${ORIGIN}/data-v2/${JOBS}?view=kanban`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(6000);
  const drew = await page.evaluate(() => ({
    gridRows: document.querySelectorAll("table tbody tr").length,
    pressed: Array.from(document.querySelectorAll('[aria-pressed="true"]')).map((b) => b.textContent?.trim()),
  }));
  await shot(page, "2-view-kanban-deep-link");
  console.log(`[front-door] ?view=kanban → grid rows ${drew.gridRows}; pressed ${JSON.stringify(drew.pressed)}`);

  // ── 3. THE CAPABILITY PAGE, SECTION 16 ────────────────────────────────────
  await page.goto(`${ORIGIN}/data-v2/try-everything`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("#try-16", { timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(8000);
  const section16 = await page.evaluate(() => {
    const el = document.querySelector("#try-16");
    return el ? el.innerText.replace(/\s+\n/g, "\n").slice(0, 900) : null;
  });
  await page.evaluate(() => document.querySelector("#try-16")?.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  await shot(page, "3-try-everything-section-16-pipeline");
  console.log(`[front-door] section 16 says:\n${section16}`);

  writeFileSync(
    resolve(OUT, `front-door-${LABEL}-measurements.json`),
    JSON.stringify({ label: LABEL, rowsAt, resolvedAt, rpcCalls: rpc.length, perDoor, drew, section16 }, null, 2),
  );
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
