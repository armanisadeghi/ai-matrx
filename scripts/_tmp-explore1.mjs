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
  const who = await signIn(page, ORIGIN, EMAIL, PASSWORD);
  console.log("signed in as:", who);
  await setOrganization(page, ORG);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded" });
  await sleep(3000);
  await page.screenshot({ path: "/tmp/explore1.png", fullPage: false });
  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button")).map((b) => (b.textContent || "").trim()).filter(Boolean).slice(0, 60)
  );
  console.log("BUTTONS:", JSON.stringify(buttons));
} finally {
  await browser.close();
}
