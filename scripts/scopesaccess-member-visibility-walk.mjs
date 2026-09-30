/**
 * LANE SCOPES-READS-ACCESS — the owner of admin's Workspace (admin@admin.com) sets "What members can see by
 * default" back to the platform default through the organization's own settings screen (chair ruling 2026-09-29:
 * clicks only). Headless, on the shared preview (LIVE database). Screenshots before and after.
 * The preview's walk cap may pause this host at any step; a paused page carries "Resume this preview", which the
 * walk presses, as a person would.
 *
 *   node scripts/scopesaccess-member-visibility-walk.mjs
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { signIn, until } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://scopes-reads-access.localhost:3001";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const LABEL = "What members can see by default";
const CHOICE = "Everyone in this organization can see every record";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-29/scopes-reads-access";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const firstLine = (e) => String(e?.message ?? e).split("\n")[0]; // never a call log: it would echo the password

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const parked = () => page.url().includes("__dev-walk");
async function resume() {
  for (let i = 0; i < 20 && parked(); i += 1) {
    await page.getByRole("button", { name: /Resume this preview/ }).click().catch(() => undefined);
    await page.waitForTimeout(3000 + i * 1000);
  }
}
async function step(name, fn, tries = 6) {
  for (let t = 1; t <= tries; t += 1) {
    try { await resume(); const v = await fn(); if (!parked()) return v; }
    catch (e) { console.log(`${name}: attempt ${t} — ${firstLine(e)}`); }
    await resume();
  }
  throw new Error(`${name}: did not finish`);
}
try {
  const who = await step("sign in", () => signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin"));
  console.log("signed in as", who);
  if (who !== "admin@admin.com") throw new Error("wrong seat");
  await step("open settings", async () => {
    await page.goto(`${ORIGIN}/organizations/${ORG}/settings/configuration`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await resume();
    const f = await until("the setting", async () => (await page.getByText(LABEL, { exact: false }).count()) > 0, 180000);
    if (!f.v) throw new Error("the setting is not on the page");
  });
  await page.waitForTimeout(6000);
  const body = await page.locator("body").innerText();
  const at = body.indexOf(LABEL);
  console.log("around the setting:", JSON.stringify(body.slice(Math.max(0, at - 80), at + 600)));
  await page.getByText(LABEL, { exact: false }).first().scrollIntoViewIfNeeded().catch(() => undefined);
  await page.screenshot({ path: `${OUT}/member-visibility-before.png` });
  const choice = page.getByRole("radio", { name: CHOICE }).or(page.getByRole("button", { name: CHOICE })).or(page.getByText(CHOICE, { exact: true }));
  console.log("choice controls:", await choice.count());
  await step("choose", async () => { await choice.first().click({ timeout: 20000 }); await page.waitForTimeout(3000); });
  const save = page.getByRole("button", { name: /^(Save|Apply)\b/ });
  if (await save.count()) { await save.first().click(); await page.waitForTimeout(3000); console.log("pressed", await save.first().innerText().catch(() => "save")); }
  await page.screenshot({ path: `${OUT}/member-visibility-after.png` });
  const after = await page.locator("body").innerText();
  const at2 = after.indexOf(LABEL);
  console.log("after:", JSON.stringify(after.slice(Math.max(0, at2 - 80), at2 + 400)));
} catch (e) {
  console.log("FAILED:", firstLine(e));
  await page.screenshot({ path: `${OUT}/member-visibility-failed.png` }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}
