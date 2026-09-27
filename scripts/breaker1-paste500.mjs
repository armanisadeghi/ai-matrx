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
const TSV = readFileSync("/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/breaker1/rows500.tsv", "utf8");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const consoleMsgs = [];
page.on("console", (m) => { if (m.type()==='error') consoleMsgs.push(m.text().slice(0,300)); });
const t0 = Date.now();
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2500);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await sleep(800);
  await page.locator('[role=dialog] textarea').first().fill(TSV);
  await sleep(500);
  await page.getByRole("button", { name: "Parse", exact: true }).click();
  await sleep(2500);
  await page.screenshot({ path: join(SHOTS, "paste500-preview.png"), fullPage: true });
  const previewTxt = await page.evaluate(() => document.body.innerText.slice(-1200));
  console.log("PREVIEW:\n", previewTxt);
  const confirmBtn = page.getByRole("button", { name: /Paste \d+ Rows/ });
  const label = await confirmBtn.innerText().catch(()=>"NOT FOUND");
  console.log("confirm button label:", label);
  const t1 = Date.now();
  await confirmBtn.click();
  const doneToast = page.locator('text=/Rows pasted|Pasted \\d+ rows/').first();
  await doneToast.waitFor({ timeout: 120000 }).catch(()=>console.log("no toast within 120s"));
  const t2 = Date.now();
  await sleep(2000);
  await page.screenshot({ path: join(SHOTS, "paste500-done.png"), fullPage: true });
  console.log(`parse->confirm click: ${t1-t0}ms, confirm->toast: ${t2-t1}ms`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(3000);
  const rowsTxt = await page.locator("text=/of \\d+ rows/").first().innerText().catch(()=>"?");
  console.log("final row count:", rowsTxt);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "paste500-error.png") }).catch(()=>{});
} finally {
  console.log("CONSOLE ERR:", consoleMsgs.slice(0,20).join("\n"));
  await browser.close();
}
