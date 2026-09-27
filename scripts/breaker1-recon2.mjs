import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, setOrganization, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "https://www.aimatrx.com";
const SHOTS = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/breaker1/shots";
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(
  readFileSync("/Users/armanisadeghi/code/matrx-frontend/.env.local", "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await setOrganization(page, "Harbor Dental Group");
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  // find New table button
  const btn = page.getByRole("button", { name: /New table/i }).first();
  console.log("new table btn visible:", await btn.isVisible().catch(()=>false));
  await btn.click();
  await sleep(1500);
  await page.screenshot({ path: join(SHOTS, "new-table-dialog.png"), fullPage: true });
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log("AFTER CLICK:\n", txt);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "recon2-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
