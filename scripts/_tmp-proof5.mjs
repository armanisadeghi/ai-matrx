import { chromium } from "playwright";
import { signIn, setOrganization, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "http://agent-button-swap.localhost:3001";
const ORG = "Rincon Plumbing Co";
const TABLE = "b3893755-a8e8-4aa5-9680-6bf7d32669eb";
const EMAIL = process.env.AI_ADMIN_USERNAME;
const PASSWORD = process.env.AI_ADMIN_PASSWORD;

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();

const navs = [];
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) navs.push({ url: frame.url(), t: Date.now() });
});

try {
  await signIn(page, ORIGIN, EMAIL, PASSWORD);
  await setOrganization(page, ORG);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("Draft payment reminder")', { timeout: 30000 });
  await sleep(4000);
  navs.length = 0;
  const t0 = Date.now();
  console.log("URL before click:", page.url());
  await page.click('button:has-text("Draft payment reminder")');
  await sleep(4000);
  console.log("URL after click:", page.url());
  console.log("NAVIGATIONS:", JSON.stringify(navs.map(n => ({ url: n.url, ms: n.t - t0 }))));
} finally {
  await browser.close();
}
