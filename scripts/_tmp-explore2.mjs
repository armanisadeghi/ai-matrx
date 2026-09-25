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
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded" });
  await sleep(2500);
  // click the "..." more-actions button near Share/Layout
  await page.click('button:has-text("...")').catch(async () => {
    console.log("no ... button by text, trying aria/svg based lookup");
  });
  await sleep(800);
  await page.screenshot({ path: "/tmp/explore2.png" });
  const menu = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="menuitem"], [role="menu"] *')).map((n) => (n.textContent||"").trim()).filter(Boolean)
  );
  console.log("MENU:", JSON.stringify(menu));
} finally {
  await browser.close();
}
