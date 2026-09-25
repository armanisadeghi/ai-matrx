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
  if (url.includes("/rest/v1/rpc/") || url.includes("/v2/ai/mandates/")) calls.push({ url: url.replace(/^.*(\/rpc\/|\/v2\/)/, ""), t: Date.now() });
});

try {
  await signIn(page, ORIGIN, EMAIL, PASSWORD);
  await setOrganization(page, ORG);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("Draft payment reminder")', { timeout: 30000 });
  await sleep(5000);
  console.log("Settled with zero background noise (proven separately). Clearing and clicking now.");
  calls.length = 0;
  const t0 = Date.now();
  await page.click('button:has-text("Draft payment reminder")');
  await sleep(4000);
  console.log("CALLS (ms since click):", JSON.stringify(calls.map(c => ({ url: c.url, ms: c.t - t0 })), null, 1));
  await page.screenshot({ path: "/tmp/proof4-after-click.png", fullPage: false });
} finally {
  await browser.close();
}
