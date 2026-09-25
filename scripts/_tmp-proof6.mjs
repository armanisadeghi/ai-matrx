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
  if (url.includes("/rest/v1/rpc/")) calls.push({ url: url.replace(/^.*\/rpc\//, "").split("?")[0], t: Date.now() });
});

try {
  await signIn(page, ORIGIN, EMAIL, PASSWORD);
  await setOrganization(page, ORG);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("New record")', { timeout: 30000 });
  await sleep(4000);
  calls.length = 0;
  console.log("Clicking New record (unrelated panel, to see if the same flurry fires)...");
  await page.click('button:has-text("New record")');
  await sleep(3500);
  console.log("URL after:", page.url());
  console.log("CALLS:", JSON.stringify([...new Set(calls.map(c => c.url))]));
} finally {
  await browser.close();
}
