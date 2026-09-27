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
const netCalls = [];
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/rest/v1/rpc/record_write") || u.includes("/rest/v1/rpc/record_create") || u.includes("field_update")) {
    let body = null;
    try { body = await r.text(); } catch {}
    netCalls.push({ url: u.replace(/\?.*$/, ""), status: r.status(), body: body?.slice(0,500) });
  }
});
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  await page.getByRole("button", { name: "Add the first row", exact: false }).click();
  await sleep(1000);
  // Simpler: fill sequential inputs/textareas in order matching known column order:
  // Title, Appointment, Completion Percent, Discount Percent, Notes, Patient Name, Preferred Time, Procedure Category, Status
  const fields = await page.locator('[role="dialog"] textarea, [role="dialog"] input:not([type=hidden])').all();
  console.log("num fields", fields.length);
  const values = [
    "Maria Gonzalez recall",     // Title
    "2026-10-05T14:30:00",       // Appointment (typed as ISO string, since field renders as plain text)
    "75",                        // Completion Percent
    "10",                        // Discount Percent
    "Patient prefers morning calls; overdue for 6-month cleaning.", // Notes
    "Maria Gonzalez",            // Patient Name
    "09:00",                     // Preferred Time
  ];
  for (let i = 0; i < values.length && i < fields.length; i++) {
    await fields[i].fill(values[i]);
  }
  await page.screenshot({ path: join(SHOTS, "row1-filled.png"), fullPage: true });
  await page.getByRole("button", { name: "Add Row", exact: true }).click();
  await sleep(2500);
  await page.screenshot({ path: join(SHOTS, "row1-after-submit.png"), fullPage: true });
  console.log("NET:", JSON.stringify(netCalls, null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "row1-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
