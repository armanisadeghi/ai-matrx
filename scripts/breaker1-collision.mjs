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
const netCalls = [];
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("field_declare") || u.includes("field_update") || u.includes("field_rename")) {
    let body=null; try{body=await r.text();}catch{}
    netCalls.push({ url: u.replace(/\?.*$/, ""), status: r.status(), body: body?.slice(0,400) });
  }
});
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  // Open Configure Table > Fields & Order to rename Discount Percent -> Fee Percent
  const toolbar = page.locator('[data-table-toolbar]').first();
  await toolbar.locator('button').nth(17).click({force:true});
  await sleep(1000);
  await page.screenshot({ path: join(SHOTS, "fields-order-tab.png"), fullPage: true });
  // find the field row for discount_percent and rename its display name
  const row = page.locator('[role=dialog]', { hasText: "discount_percent" }).first();
  console.log("discount_percent row visible:", await row.isVisible().catch(()=>false));
  const txt = await page.evaluate(() => document.body.innerText.slice(-3000));
  console.log(txt);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "collision-error.png") }).catch(()=>{});
} finally {
  console.log("CONSOLE:\n", consoleMsgs.join("\n"));
  console.log("NET:", JSON.stringify(netCalls, null, 2));
  await browser.close();
}
