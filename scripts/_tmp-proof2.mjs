import { chromium } from "playwright";
import { signIn, setOrganization, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "http://agent-button-swap.localhost:3001";
const ORG = "Rincon Plumbing Co";
const TABLE = "b3893755-a8e8-4aa5-9680-6bf7d32669eb";
const EMAIL = process.env.AI_ADMIN_USERNAME;
const PASSWORD = process.env.AI_ADMIN_PASSWORD;

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();

const calls = [];
page.on("request", (req) => {
  const url = req.url();
  if (req.method() === "POST" || url.includes("/rest/v1/rpc/")) {
    calls.push({ method: req.method(), url, t: Date.now() });
  }
});

try {
  await signIn(page, ORIGIN, EMAIL, PASSWORD);
  await setOrganization(page, ORG);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded" });
  // Wait for the grid to actually show data AND for network activity to go quiet.
  await page.waitForSelector('button:has-text("Draft payment reminder")', { timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => console.log("networkidle timeout (ok, some polling may be constant)"));
  await sleep(3000);
  const before = calls.length;
  console.log(`Baseline settled: ${before} calls captured before click.`);
  calls.length = 0;
  console.log("Clicking the agent action button on the first row...");
  await page.click('button:has-text("Draft payment reminder")');
  await sleep(3000);
  console.log("CALLS DURING/AFTER CLICK (3s window):", JSON.stringify(calls, null, 1));
  await page.screenshot({ path: "/tmp/proof2-after-click.png", fullPage: false });
} finally {
  await browser.close();
}
