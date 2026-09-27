import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, sleep } from "./lib/seat-browser.mjs";
const ORIGIN = "https://www.aimatrx.com";
const SHOTS = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/breaker1/shots";
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(
  readFileSync("/Users/armanisadeghi/code/matrx-frontend/.env.local", "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const TABLE = "31173dbe-04f5-4973-be03-2a41f0737142";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const consoleMsgs = [];
page.on("console", (m) => { if (m.type()==='error'||m.type()==='warning') consoleMsgs.push(`${m.type()}: ${m.text().slice(0,250)}`); });
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  const toolbar = page.locator('[data-table-toolbar]').first();
  await toolbar.locator('button').nth(17).click({force:true});
  await sleep(1000);

  // TEST: rename "Notes" -> "Patient Name" (existing name collision, different derived key: notes vs patient_name)
  const notesInput = page.locator('[role=dialog] input[value="Notes"]').first();
  await notesInput.fill("Patient Name");
  await sleep(400);
  await page.screenshot({ path: join(SHOTS, "rename-to-existing-before-save.png"), fullPage: true });
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await sleep(2000);
  await page.screenshot({ path: join(SHOTS, "rename-to-existing-after-save.png"), fullPage: true });
  const bodyTxt1 = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log("AFTER RENAME-TO-EXISTING:\n", bodyTxt1);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "batch2-error.png") }).catch(()=>{});
} finally {
  console.log("CONSOLE:\n", consoleMsgs.join("\n"));
  await browser.close();
}
