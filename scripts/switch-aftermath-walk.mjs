// scripts/switch-aftermath-walk.mjs — lane SWITCH-AFTERMATH headless walk, as admin@admin.com, on
// admin's own test organization "Harbor Dental Group" (fixture: scripts/switch-aftermath-seed.mjs).
//
//   PHASE=press  — /organizations/<org>/settings#data: Copy again (when offered), then the Data
//                  tables switch through its confirmation. Prints what the card said.
//   PHASE=look   — at 1600 and 390 wide: /data, /data/<table>, /data-v2/<table>, the settings card
//                  and the organization's Trash; records every database call each page made
//                  (rpc name + schema) so "where did this screen's data come from" has proof.
//
//   ORIGIN=https://www.aimatrx.com PHASE=look TABLE=<id> SHOTS=<dir> TAG=<before|after> node scripts/switch-aftermath-walk.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "https://www.aimatrx.com";
const ORG = process.env.ORG ?? "11f4e747-c13a-49c7-81a3-66e6391f8a9b";
const TABLE = process.env.TABLE ?? "b00bde4d-1adc-4682-88eb-57453aabf014";
const SHOTS = process.env.SHOTS ?? "/tmp";
const PHASE = process.env.PHASE ?? "look";
const TAG = process.env.TAG ?? PHASE;
const WIDTHS = (process.env.WIDTHS ?? "1600,390").split(",").map(Number);
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const out = { origin: ORIGIN, org: ORG, table: TABLE, phase: PHASE, pages: {}, console_errors: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 240)));
let calls = [];
page.on("request", (req) => {
  const u = req.url();
  const m = u.match(/\/rest\/v1\/(rpc\/)?([A-Za-z0-9_]+)/);
  if (!m) return;
  const schema = req.headers()["content-profile"] ?? req.headers()["accept-profile"] ?? "public";
  calls.push(`${m[1] ? "rpc " : "table "}${schema}.${m[2]}`);
});
const text = async () => (await page.locator("body").innerText().catch(() => "")).replace(/\s+\n/g, "\n").slice(0, 4000);
const button = (label) => page.getByRole("button", { name: label, exact: true }).first();

async function visit(key, path, wait, width) {
  calls = [];
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until(key, wait, 90000);
  await sleep(2500);
  const shot = join(SHOTS, `${TAG}-${key}-${width}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  out.pages[`${key}@${width}`] = { path, text: await text(), calls: [...new Set(calls)], shot };
}

try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);

  if (PHASE === "press") {
    await page.goto(`${ORIGIN}/organizations/${ORG}/settings#data`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("Check again", () => button("Check again").isVisible(), 120000);
    await sleep(1500);
    const card = () => page.locator("li", { has: page.locator("h3", { hasText: "Data tables" }) }).first();
    out.card_before = await card().innerText();
    if (await button("Copy again").isVisible().catch(() => false)) {
      await button("Copy again").click();
      await until("copy done", async () => !(await page.getByText("Copying the older tables again").isVisible().catch(() => false)), 600000);
      await sleep(4000);
      out.copy_result = await page.locator("p.text-xs").filter({ hasText: /Copied|copied|nothing/ }).first().innerText().catch(() => null);
    }
    await button("Check again").click();
    await sleep(6000);
    out.card_after_copy = await card().innerText();
    await page.screenshot({ path: join(SHOTS, `${TAG}-settings-before-switch.png`) });
    const sw = card().getByRole("button", { name: "Switch to the new system", exact: true });
    if (!(await sw.isVisible().catch(() => false))) throw new Error("the Data tables switch is not offered");
    await sw.click();
    const dialog = page.locator("[role=dialog],[role=alertdialog]").last();
    await until("confirm", () => dialog.isVisible(), 20000);
    await dialog.getByRole("button", { name: "Switch to the new system" }).click();
    await until("switched", async () => /Switched|Not ready|refused/i.test(await card().innerText().catch(() => "")), 180000);
    await sleep(3000);
    out.card_after_switch = await card().innerText();
    await page.screenshot({ path: join(SHOTS, `${TAG}-settings-after-switch.png`) });
  } else {
    for (const width of WIDTHS) {
      await visit("data-home", "/data", async () => !(await page.getByText("Loading", { exact: false }).first().isVisible().catch(() => false)), width);
      await visit("data-id", `/data/${TABLE}`, async () => (await text()).length > 200, width);
      await visit("data-v2-id", `/data-v2/${TABLE}`, async () => (await text()).length > 200, width);
      await visit("settings-data", `/organizations/${ORG}/settings#data`, () => button("Check again").isVisible(), width);
      // The organization's Trash lives on the same settings page.
      await page.getByText("Trash", { exact: false }).last().scrollIntoViewIfNeeded().catch(() => undefined);
      await sleep(3000);
      await page.screenshot({ path: join(SHOTS, `${TAG}-org-trash-${width}.png`) });
      out.pages[`org-trash@${width}`] = {
        text: (await page.locator("[data-trash-scope=organization]").first().innerText().catch(() => "(no organization trash list on the page)")).slice(0, 3000),
      };
    }
  }
} catch (e) {
  out.error = String(e?.message ?? e);
  await page.screenshot({ path: join(SHOTS, `${TAG}-error.png`) }).catch(() => undefined);
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}
