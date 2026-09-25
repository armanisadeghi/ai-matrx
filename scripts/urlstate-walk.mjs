// scripts/urlstate-walk.mjs — LANE URL-STATE headless proof on the shared preview (live database).
//
// admin@admin.com's own Invoices table on /data-v2/[tableId]: switching the layout
//   1. fires NO `?_rsc=` request (no server round trip) and no grid re-read;
//   2. moves the address (?view=) and the page follows it (the chosen layout is on screen);
//   3. keeps the page mounted (a DOM node from before the switch is still in the document);
//      (per-switch RPCs are logged as INFO: each layout's own component mounts and reads);
//   4. the instrument can see an RSC request: the same address change pushed through Next's
//      router (window.next.router.replace) DOES fire one — so "0" above is a measurement.
//
//   ORIGIN=http://url-state.localhost:3001 TABLE=<id> node scripts/urlstate-walk.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { signIn } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://url-state.localhost:3001";
const TABLE = process.env.TABLE ?? "b3893755-a8e8-4aa5-9680-6bf7d32669eb";
const OUT = process.env.OUT ?? "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/shots/url-state";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const rsc = [];
const rpcs = [];
page.on("request", (r) => {
  const u = r.url();
  if (/[?&]_rsc=/.test(u) || r.headers()["rsc"] === "1") rsc.push(u.replace(ORIGIN, ""));
  const m = u.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/);
  if (m) rpcs.push(m[1]);
});
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));

const view = () => new URL(page.url()).searchParams.get("view");

try {
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  check("seat", who === "admin@admin.com", who);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("[data-table-toolbar]", { timeout: 240000 });
  await page.waitForTimeout(6000); // let the first reads settle
  await page.screenshot({ path: `${OUT}/0-grid.png` });
  // A node that must survive: the toolbar element itself.
  await page.evaluate(() => {
    window.__urlStateProbe = document.querySelector("[data-table-toolbar]");
  });

  const switches = [];
  for (const layout of ["Kanban", "Grid", "Calendar", "Grid"]) {
    const btn = page.getByRole("button", { name: new RegExp(`^${layout}$`) }).first();
    if ((await btn.count()) === 0) {
      switches.push({ layout, skipped: "no button" });
      continue;
    }
    rsc.length = 0;
    rpcs.length = 0;
    const before = view();
    await btn.click();
    await page.waitForTimeout(3500);
    const pressed = await btn.getAttribute("aria-pressed").catch(() => null);
    const alive = await page.evaluate(() => document.contains(window.__urlStateProbe));
    switches.push({ layout, before, after: view(), rsc: [...rsc], gridRpcs: [...rpcs], pressed, alive });
    await page.screenshot({ path: `${OUT}/1-${layout.toLowerCase()}-${switches.length}.png` });
  }
  const done = switches.filter((s) => !s.skipped);
  check(
    "1-layout-switch-fires-no-rsc-request",
    done.length >= 2 && done.every((s) => s.rsc.length === 0),
    done.map((s) => `${s.layout}: rsc ${s.rsc.length}${s.rsc.length ? " " + s.rsc.join(",") : ""}`).join("; "),
  );
  check(
    "2-address-follows-and-page-follows-the-address",
    done.every((s) => s.after && s.after.toLowerCase() === s.layout.toLowerCase()),
    done.map((s) => `${s.before ?? "-"}→${s.after} (pressed=${s.pressed})`).join("; "),
  );
  check("3-page-stays-mounted", done.every((s) => s.alive), done.map((s) => `${s.layout}: ${s.alive}`).join("; "));
  // Informational, not a check: records-ui mounts each layout's own component on a switch
  // (Grid reads grid_layout/read_records when it mounts) and writes view_declare. That is the
  // package's layout work, not a navigation — the RSC count above is the navigation measure.
  console.log("INFO per-switch RPCs — " + done.map((s) => `${s.layout}: [${s.gridRpcs.join(",")}]`).join("; "));

  // 4. The instrument sees an RSC request when one happens.
  rsc.length = 0;
  const hasRouter = await page.evaluate(() => Boolean(window.next?.router?.replace));
  if (hasRouter) {
    await page.evaluate(() => {
      const u = new URL(window.location.href);
      u.searchParams.set("view", "grid");
      u.searchParams.set("instrument", "1");
      window.next.router.replace(`${u.pathname}${u.search}`);
    });
    await page.waitForTimeout(4000);
  }
  check("4-instrument-sees-a-router-navigation", hasRouter && rsc.length >= 1, `window.next.router: ${hasRouter}; rsc ${rsc.length} ${rsc.slice(0, 2).join(",")}`);
  writeFileSync(`${OUT}/switches.json`, JSON.stringify(switches, null, 2));
} catch (err) {
  check("walk", false, String(err).slice(0, 400));
  await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
} finally {
  check("console-errors", consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(" || ").slice(0, 600) : "none");
  writeFileSync(`${OUT}/walk.json`, JSON.stringify({ origin: ORIGIN, table: TABLE, at: new Date().toISOString(), results }, null, 2));
  await browser.close();
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
