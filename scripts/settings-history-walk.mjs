// scripts/settings-history-walk.mjs — the settings history, walked from the seat.
//
// As admin@admin.com, on admin's own workspace organization:
//   1. type a new value into an organization setting → the row says what it affects (preview)
//   2. save it, change it again → History lists both, with who / when / door
//   3. "Revert to this" on the older entry → the value returns, History grows by one
//   4. "Copy configuration" → the clipboard holds the effective configuration JSON
//   5. "Compare" against 15 minutes ago → the changed setting is listed
//   6. put the row back ("Inherit this value") so the organization is left as found
// Screenshots go to WALK_OUT (default: common-docs for-arman/2026-09-26/settings-history).
//
//   WALK_ORIGIN=http://settingshist.localhost:3001 node scripts/settings-history-walk.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { signIn, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://settingshist.localhost:3001";
const ORG = process.env.WALK_ORG ?? "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const OUT =
  process.env.WALK_OUT ??
  new URL("../../common-docs/operations/for-arman/2026-09-26/settings-history/", import.meta.url).pathname;
const LABEL = "How long a repeated agent run waits for the first one's answer";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, "")]),
);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
const page = await context.newPage();
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`  shot ${name}.png`);
};

// WALK_DEV_LOGIN_URL: the URL `pnpm dev-login /organizations/<org>/settings/configuration` prints
// (the password form is flaky while the shared dev server compiles under load).
if (process.env.WALK_DEV_LOGIN_URL) {
  await page.goto(process.env.WALK_DEV_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 180000 });
} else {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD);
  await page.goto(`${ORIGIN}/organizations/${ORG}/settings/configuration`, { waitUntil: "domcontentloaded", timeout: 180000 });
}
const input = page.getByRole("textbox", { name: LABEL });
await input.waitFor({ timeout: 180000 });
const startedAt = new Date();

async function saveValue(v) {
  await input.fill(String(v));
  await sleep(300);
  await input.locator("xpath=following::button[normalize-space()='Save'][1]").click();
  await page.getByText(/saved\./).first().waitFor({ timeout: 30000 });
  await sleep(1500);
}

// 1. preview
await input.scrollIntoViewIfNeeded();
await input.fill("90");
await sleep(500);
await shot("01-preview-before-save");

// 2. save 90, then 75; open History
await saveValue(90);
await saveValue(75);
await page.getByRole("button", { name: `History of ${LABEL}` }).click();
await page.getByText("Undo").first().waitFor({ timeout: 30000 });
await sleep(500);
await shot("02-history-after-two-changes");

// 3. revert to the 90 entry
await page.getByRole("button", { name: /Revert to this/ }).first().click();
await page.getByRole("button", { name: "Revert", exact: true }).click();
await sleep(2500);
await shot("03-history-after-revert");
const valueNow = await input.inputValue();
console.log(`  value after revert: ${valueNow}`);
await page.keyboard.press("Escape");

// 5. copy configuration
await page.getByRole("button", { name: "Copy configuration" }).click();
await page.getByText(/configuration copied/).first().waitFor({ timeout: 60000 });
const copied = await page.evaluate(() => navigator.clipboard.readText());
writeFileSync(`${OUT}04-copied-configuration.json`, copied);
const parsed = JSON.parse(copied);
console.log(`  copied configuration: ${parsed.knobs.length} settings, ${parsed.knobs.filter((k) => k.origin === "organization").length} set by the organization`);
await shot("04-copy-configuration");

// 6. compare against 15 minutes ago (before the walk)
await page.getByRole("button", { name: "Compare", exact: true }).click();
const at = new Date(startedAt.getTime() - 15 * 60 * 1000);
const local = new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
await page.getByLabel("Moment to compare against").fill(local);
await page.getByRole("dialog").getByRole("button", { name: "Compare", exact: true }).click();
await page.getByText(/differ\)|No differences/).first().waitFor({ timeout: 60000 });
await sleep(500);
await shot("05-compare-now-vs-earlier");

// 7. put it back: inherit from the platform
await page.getByRole("button", { name: `Options for ${LABEL}` }).click();
await page.getByRole("button", { name: "Inherit this value" }).click();
await page.getByRole("button", { name: "Inherit it" }).click();
await sleep(2500);
await page.keyboard.press("Escape");

await shot("06-after-inherit");
await browser.close();
console.log(`walk done: value after revert=${valueNow}`);
