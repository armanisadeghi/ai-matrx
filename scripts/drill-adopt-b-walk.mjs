// scripts/drill-adopt-b-walk.mjs — lane DRILL-ADOPT-B (2026-10-07).
// Headless, read-only walk as admin@admin.com of the three drill adoptions:
//   /research/topics/<id>/costs, /administration/applets/analytics, /administration/reporting/check-findings
// usage: ORIGIN=http://drilladoptb.localhost:3001 SHOTS=<dir> node scripts/drill-adopt-b-walk.mjs <probe|research|analytics|findings> [topicId]
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drilladoptb.localhost:3001";
const SHOTS = process.env.SHOTS ?? "/tmp/drill-adopt-b";
mkdirSync(SHOTS, { recursive: true });
const readEnv = (p) =>
  Object.fromEntries(
    readFileSync(p, "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
  );
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };
const mode = process.argv[2] ?? "probe";
const arg = process.argv[3];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
// The shared preview parks a tab at /__dev-walk once its walk cap runs out: press Resume and go on.
const rawGoto = page.goto.bind(page);
page.goto = async (url, opts) => {
  let res;
  for (let n = 1; n <= 8; n += 1) {
    res = await rawGoto(url, opts);
    await sleep(1500);
    const parked = page.url().includes("__dev-walk") || (await page.getByRole("button", { name: /Resume/ }).count()) > 0;
    if (!parked) return res;
    console.log(`[walk] parked by the walk cap (try ${n}) — resuming`);
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(4000 * n);
  }
  throw new Error("the walk cap kept parking this tab");
};
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
const shot = (name, full = false) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
const text = async (sel) => ((await page.locator(sel).first().innerText().catch(() => "")) ?? "").replace(/[ \t]+/g, " ");
const go = async (path) => {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await sleep(2500);
};

try {
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (who !== "admin@admin.com") throw new Error(`signed in as ${who}`);
  console.log("signed in as", who);
  const ctx = { page, go, shot, text, until, sleep, arg, ORIGIN, errors };
  const mod = await import(new URL(`./drill-adopt-b/${mode}.mjs`, import.meta.url));
  await mod.default(ctx);
} catch (e) {
  console.log("WALK ERROR", String(e).slice(0, 500));
  await shot("error").catch(() => {});
} finally {
  console.log("console errors:", JSON.stringify(errors.slice(0, 8)));
  await browser.close();
}
