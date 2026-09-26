import { chromium } from "playwright";
import { resolve } from "node:path";
import { signIn, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = "https://aimatrx.com";
const TABLE = "b5a5a74a-2d59-4d21-9296-e9820edd169d";
const ROW_TEXT = "RTU-3 fan motor replacement";
const OUT = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/shots";

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await signIn(page, ORIGIN, "admin@admin.com", "Password1234#", "admin seat");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(3000);
  const openBtn = page.getByRole("button", { name: new RegExp(`Open ${ROW_TEXT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i") }).first();
  await openBtn.click({ timeout: 10000 });
  await sleep(1500);
  await page.getByRole("button", { name: "Share", exact: true }).first().click({ timeout: 10000 });
  await sleep(1500);
  await page.screenshot({ path: resolve(OUT, "0-admin-share-dialog-commenter.png") });
  console.log("saved admin share dialog screenshot");
  await ctx.close();
} finally {
  await browser.close();
}
