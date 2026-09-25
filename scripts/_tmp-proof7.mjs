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
  if (url.includes("/rest/v1/rpc/")) calls.push(url.replace(/^.*\/rpc\//, "").split("?")[0]);
});

try {
  await signIn(page, ORIGIN, EMAIL, PASSWORD);
  await setOrganization(page, ORG);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[aria-label*="xpand" i], button:has-text("⤢")', { timeout: 15000 }).catch(()=>{});
  await sleep(4000);
  calls.length = 0;
  // Click the expand ("Peek") icon on the first row
  const expandBtn = await page.$('[aria-label*="xpand" i]');
  if (expandBtn) {
    await expandBtn.click();
  } else {
    console.log("no expand button found by aria-label, trying text ⤢");
    await page.click('text=⤢');
  }
  await sleep(3000);
  console.log("URL after:", page.url());
  console.log("CALLS:", JSON.stringify([...new Set(calls)]));
} finally {
  await browser.close();
}
