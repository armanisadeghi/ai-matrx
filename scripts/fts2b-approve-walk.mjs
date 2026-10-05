/**
 * LANE FINISH-THE-SWITCH · FTS-2b item 1 — headless walk on the :3001 dev server, as admin@admin.com.
 * Cedar Ridge PT's front desk asked an agent to move Jordan Pike's preferred clinic Costa Mesa -> Irvine;
 * the agent's change waits on /approvals. The walk approves it from the card, opens Jordan's CRM page,
 * reads the new clinic, then archives Jordan from the page's own control.
 *   node scripts/fts2b-approve-walk.mjs [phase]
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://fts2b.localhost:3001";
const OUT = "/tmp/matrx-evidence/fts2b";
const PARTY = "0a594af8-f9f3-458c-9889-a3bcbf874933";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const phase = process.argv[2] ?? "approve";
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const resume = async () => {
  if (page.url().includes("__dev-walk")) {
    await page.getByRole("button", { name: "Resume this preview" }).click();
    await page.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180_000 });
  }
};
const go = async (path) => { await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 }); await resume(); };
await go("/login");
page.on("load", () => { if (page.url().includes("__dev-walk")) { console.log("[walk] parked — resuming"); page.getByRole("button", { name: "Resume this preview" }).click().catch(() => {}); } });
for (let n = 1; n <= 6; n += 1) {
  try {
    await resume();
    if (!page.url().includes("/login")) await go("/login");
    await page.waitForSelector("#email", { timeout: 60000 });
    await page.waitForLoadState("load").catch(() => undefined);
    await sleep(2000);
    await page.fill("#email", env.AI_ADMIN_USERNAME, { timeout: 10000 });
    await page.fill("#password", env.AI_ADMIN_PASSWORD, { timeout: 10000 });
    await page.click('button:has-text("Sign in")', { timeout: 10000 });
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90000 });
    await resume();
    break;
  } catch (e) { console.log(`[walk] sign-in try ${n}: ${String(e.message).split("\n")[0]}`); await sleep(3000 * n); }
}
const who = await page.evaluate(async () => (await (await fetch("/api/whoami")).json())?.email ?? null);
if (who !== "admin@admin.com") { await page.screenshot({ path: `${OUT}/0-signin-fail.png` }); throw new Error(`signed in as ${who} at ${page.url()}`); }
console.log("signed in as", who?.v ?? who);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
try {
  if (phase === "approve") {
    await go("/approvals");
    const card = await until("card", async () => (await page.getByText("Change Jordan Pike").count()) > 0, 90000);
    await shot("1-approvals");
    console.log("card visible:", !!card.v);
    const body = await page.locator("body").innerText();
    const i = body.indexOf("Change Jordan Pike");
    console.log("card text:", JSON.stringify(body.slice(Math.max(0, i - 200), i + 600)));
    if (process.argv[3] === "go") {
      const cardEl = page.locator("xpath=//*[normalize-space(text())='Change Jordan Pike']/ancestor::*[.//button[normalize-space()='Approve']][1]").first();
      await cardEl.scrollIntoViewIfNeeded();
      await shot("2-card");
      await cardEl.getByRole("button", { name: /^Approve$/ }).click();
      const dlg = page.getByRole("dialog");
      await dlg.waitFor({ timeout: 20000 });
      console.log("dialog:", JSON.stringify((await dlg.innerText()).replace(/\s+/g, " ")));
      await shot("2b-confirm");
      await dlg.getByRole("button", { name: /^Approve 1$/ }).click();
      const done = await until("approved", async () => (await page.getByText("Change Jordan Pike").count()) === 0 || /Approved 1/.test(await page.locator("body").innerText()), 30000);
      await shot("3-approved");
      console.log("approved toast:", !!done.v);
    }
  } else if (phase === "crm") {
    await go(`/crm/${PARTY}`);
    const seen = await until("clinic", async () => /Cedar Ridge - (Irvine|Costa Mesa)/.exec(await page.locator("body").innerText())?.[0], 90000);
    await shot("4-crm");
    console.log("clinic on page:", seen.v);
  }
} finally {
  await browser.close();
}
