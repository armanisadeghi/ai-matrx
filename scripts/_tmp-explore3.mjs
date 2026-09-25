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
  const toolbarButtons = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("header button, header + div button, button"));
    return els.slice(-30).map((b) => ({
      text: (b.textContent || "").trim(),
      aria: b.getAttribute("aria-label"),
      title: b.getAttribute("title"),
    }));
  });
  console.log(JSON.stringify(toolbarButtons, null, 1));
} finally {
  await browser.close();
}
