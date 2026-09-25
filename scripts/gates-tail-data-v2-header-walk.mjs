// LANE GATES-TAIL (VERIFIER-21 #7) — headless proof: open a table at /data-v2/<id> in a FRESH
// session (no organization picked) and record (a) every 4xx response, (b) the console errors,
// (c) what the shell header says about the organization. READ-ONLY: every write-shaped store
// door is aborted at the network before it leaves the browser.
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/gates-tail-data-v2-header-walk.mjs <outDir> <tableId> [label]
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.GATES_TAIL_ORIGIN ?? "http://gates-tail.localhost:3001";
const [OUT = "/tmp", TABLE, LABEL = "table"] = process.argv.slice(2);
const WRITE = /(declare|update|write|share|grant|press|decorate|knob_set|decide|delete|archive|insert|create|upsert|set_|move|merge|restore|revoke)/i;
const width = Number(process.env.GT_WIDTH ?? 1600);

const browser = await chromium.launch({ headless: true });
const report = { table: TABLE, width, refused: [], aborted: [], consoleErrors: [] };
try {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  console.log(`seat: ${await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin")}`);
  await context.route(/\/rest\/v1\/rpc\//, (route) => {
    const name = route.request().url().split("/rpc/")[1]?.split("?")[0] ?? "";
    if (WRITE.test(name) && !/(shared_with_me|_read|^read_|where_id_opens|my_levels)/.test(name)) {
      report.aborted.push(name);
      return route.abort();
    }
    return route.continue();
  });
  context.on("response", (r) => {
    if (r.status() >= 400 && !/_next|\?_rsc=|g\/collect/.test(r.url())) {
      report.refused.push({ status: r.status(), method: r.request().method(), url: r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 140), org: r.request().headers()["x-organization-id"] ?? null });
    }
  });
  page.on("console", (m) => { if (m.type() === "error") report.consoleErrors.push(m.text().slice(0, 240)); });
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(20000);
  report.header = await page.evaluate(() => {
    const h = document.querySelector("header.shell-header");
    return h ? h.innerText.replace(/\s+/g, " ").trim().slice(0, 300) : null;
  });
  report.chooseOrgRed = await page.evaluate(() => [...document.querySelectorAll("header.shell-header button")].some((b) => /Choose org/.test(b.textContent ?? "")));
  report.viewingIn = await page.evaluate(() => (document.querySelector("[data-page-object-organization]")?.textContent ?? null));
  await page.screenshot({ path: `${OUT}/data-v2-${LABEL}-${width}.png` });
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
