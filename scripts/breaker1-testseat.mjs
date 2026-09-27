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
page.on("console", (m)=>{ if (m.type()==='error') consoleMsgs.push(m.text().slice(0,250)); });
try {
  const who = await signIn(page, ORIGIN, env.AI_MEMBER_USERNAME, env.AI_MEMBER_PASSWORD, "test");
  console.log("signed in as:", who);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  await page.screenshot({ path: join(SHOTS, "testseat-view.png"), fullPage: true });
  console.log("URL:", page.url());
  const bodyTxt = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log(bodyTxt);
  // try Sheet view and editing a cell
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch((e)=>console.log("no sheet btn", e.message));
  await sleep(1500);
  await page.screenshot({ path: join(SHOTS, "testseat-sheet.png"), fullPage: true });
  // try opening Configure Table (gear icon) - should be blocked or allowed for Editor?
  const gear = page.locator('[data-table-toolbar] button').nth(17);
  const gearVisible = await gear.isVisible().catch(()=>false);
  console.log("gear visible for editor:", gearVisible);
  if (gearVisible) {
    await gear.click({force:true});
    await sleep(1000);
    await page.screenshot({ path: join(SHOTS, "testseat-configure.png"), fullPage: true });
  }
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "testseat-error.png") }).catch(()=>{});
} finally {
  console.log("CONSOLE ERR:", consoleMsgs.join("\n"));
  await browser.close();
}
