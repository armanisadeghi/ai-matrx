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
  await sleep(2000);
  await page.click('button:has-text("Add an action")');
  await sleep(500);
  await page.fill('input[placeholder="Check in"]', "Draft payment reminder");
  await page.click('button:has-text("Asks an agent")');
  await sleep(500);
  await page.screenshot({ path: "/tmp/explore13.png", fullPage: true });
} finally {
  await browser.close();
}
