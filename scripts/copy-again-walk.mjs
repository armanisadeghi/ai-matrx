// scripts/copy-again-walk.mjs — lane COPY-AGAIN-DOOR headless proof, as admin@admin.com on admin's
// own organization.
//
// 1. /organizations/<org>/settings#data: the Data tables switch names a difference copying again
//    clears, and "Copy again" sits beside "Check again". With PRESS=1 it is pressed: progress, the
//    one-line result, and the switch measured again.
// 2. With TABLE=<copied table id>: /data-v2/<table> ⋯ menu shows "Copy this table again"; with
//    PRESS=1 it is chosen and the toast's result is read.
//
//   ORIGIN=<site> ORG=<id> [TABLE=<id>] SHOTS=<dir> [PRESS=1] node scripts/copy-again-walk.mjs
//
// Prints a JSON verdict; exit 1 on any miss.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://copy-again-door.localhost:3001";
const ORG = process.env.ORG ?? "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const TABLE = process.env.TABLE ?? null;
const SHOTS = process.env.SHOTS ?? "/tmp";
const PRESS = process.env.PRESS === "1";
const TAG = process.env.TAG ?? (PRESS ? "press" : "look");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const out = { origin: ORIGIN, org: ORG, table: TABLE, press: PRESS, console_errors: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 300)));
const misses = [];

const sectionText = async () => (await page.locator("text=Check again").first().locator("xpath=ancestor::div[3]").innerText().catch(() => "")).trim();
const button = (label) => page.getByRole("button", { name: label, exact: true }).first();

try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);

  await page.goto(`${ORIGIN}/organizations/${ORG}/settings#data`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("Check again", () => button("Check again").isVisible(), 180000);
  await button("Check again").scrollIntoViewIfNeeded();
  await sleep(1500);
  out.card_before = await sectionText();
  out.copy_again_shown = await button("Copy again").isVisible().catch(() => false);
  await page.screenshot({ path: join(SHOTS, `copy-again-card-${TAG}-before.png`), fullPage: false });
  if (!out.copy_again_shown) misses.push("Copy again is not beside Check again");

  if (PRESS && out.copy_again_shown) {
    await button("Copy again").click();
    await sleep(1200);
    out.progress = (await page.locator("text=/Copying the older tables again/").first().innerText().catch(() => "")).trim();
    await page.screenshot({ path: join(SHOTS, `copy-again-card-${TAG}-running.png`) });
    const result = page.locator("p", { hasText: /^(Copied .* again\.|.*already being copied again.*|.*can copy its tables again.*|.*already switched.*|Copied again with .*)/ }).first();
    await until("the result line", () => result.isVisible(), 600000);
    out.result_line = (await result.innerText()).trim();
    await sleep(2500);
    out.card_after = await sectionText();
    await page.screenshot({ path: join(SHOTS, `copy-again-card-${TAG}-after.png`) });
    if (!/^Copied /.test(out.result_line)) misses.push(`the copy did not succeed: ${out.result_line}`);
  }

  if (TABLE) {
    await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("table menu", () => page.locator("[data-table-menu]").first().isVisible(), 180000);
    await sleep(3000);
    await page.locator("[data-table-menu]").first().click();
    const item = page.locator('[data-table-menu-extra="copy-again"]').first();
    const seen = await until("copy-again item", () => item.isVisible(), 30000).catch(() => ({ v: false }));
    out.menu_item_shown = !!seen?.v;
    out.menu_items = await page.locator("[role=menuitem]").allInnerTexts().catch(() => []);
    await page.screenshot({ path: join(SHOTS, `copy-again-menu-${TAG}.png`) });
    if (!out.menu_item_shown) misses.push("the table menu has no Copy this table again");
    if (PRESS && out.menu_item_shown) {
      await item.click();
      const done = page.locator("[data-sonner-toast]", { hasText: /Copied|not copied again/ }).last();
      await until("toast result", () => done.isVisible(), 300000);
      out.toast_text = (await done.innerText()).trim();
      await page.screenshot({ path: join(SHOTS, `copy-again-menu-${TAG}-toast.png`) });
      if (!/^Copied /.test(out.toast_text)) misses.push(`the table copy did not succeed: ${out.toast_text}`);
    } else {
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
} catch (err) {
  misses.push(String(err?.message ?? err));
  await page.screenshot({ path: join(SHOTS, `copy-again-${TAG}-failure.png`) }).catch(() => {});
} finally {
  out.misses = misses;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(misses.length ? 1 : 0);
}
