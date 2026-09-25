import { chromium } from "playwright";
import { signIn, setOrganization, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "http://agent-button-swap.localhost:3001";
const ORG = "Rincon Plumbing Co";
const TABLE = "b3893755-a8e8-4aa5-9680-6bf7d32669eb";
const EMAIL = process.env.AI_ADMIN_USERNAME;
const PASSWORD = process.env.AI_ADMIN_PASSWORD;

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
try {
  await signIn(page, ORIGIN, EMAIL, PASSWORD);
  await setOrganization(page, ORG);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}?rail=settings`, { waitUntil: "domcontentloaded" });
  await sleep(2500);
  await page.click('text=Retire');
  await sleep(600);
  await page.click('button:has-text("Retire it")');
  await sleep(1200);
  await page.screenshot({ path: "/tmp/retired2.png", fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  const idx = text.indexOf("Row actions");
  console.log(text.slice(idx, idx + 300));
} finally {
  await browser.close();
}
