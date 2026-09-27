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
const context = await browser.newContext({ viewport: { width: 2200, height: 1000 } });
const page = await context.newPage();
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  const info = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Table controls"]');
    if (!btn) return "NOT FOUND";
    const r = btn.getBoundingClientRect();
    const cs = getComputedStyle(btn);
    let parent = btn.parentElement;
    const parents = [];
    for (let i=0;i<5 && parent;i++){ parents.push({tag:parent.tagName, cls: parent.className.slice(0,80), display: getComputedStyle(parent).display}); parent = parent.parentElement; }
    return { rect: r, display: cs.display, visibility: cs.visibility, opacity: cs.opacity, parents };
  });
  console.log(JSON.stringify(info, null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
} finally {
  await browser.close();
}
