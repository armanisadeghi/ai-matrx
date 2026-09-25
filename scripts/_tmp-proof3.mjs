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
  if (url.includes("/rest/v1/rpc/")) calls.push({ url: url.replace(/^.*\/rpc\//, ""), t: Date.now() });
});

try {
  await signIn(page, ORIGIN, EMAIL, PASSWORD);
  await setOrganization(page, ORG);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("Draft payment reminder")', { timeout: 30000 });
  await sleep(5000);
  console.log("Settled. NOW observing with ZERO interaction for 5s...");
  calls.length = 0;
  await sleep(5000);
  console.log("NO-CLICK WINDOW CALLS:", JSON.stringify(calls.map(c=>c.url)));
} finally {
  await browser.close();
}
