import { chromium } from "playwright";
import { signIn, setOrganization, sleep, until } from "./lib/seat-browser.mjs";

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
  if (req.method() === "POST" || url.includes("/rest/v1/rpc/")) {
    calls.push({ method: req.method(), url });
  }
});

try {
  await signIn(page, ORIGIN, EMAIL, PASSWORD);
  await setOrganization(page, ORG);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded" });
  await sleep(2500);
  calls.length = 0; // clear whatever loaded the grid itself
  console.log("Cleared baseline network log. Now clicking the agent action button on one row...");
  await page.click('button:has-text("Draft payment reminder")');
  await sleep(2500);
  await page.screenshot({ path: "/tmp/proof1-after-click.png", fullPage: false });

  const relevant = calls.filter((c) =>
    /table_list|tableList|\bfields\b|record_read|recordRead|my_levels|myLevels|row_action|data\.row_action|table_row_action/i.test(c.url)
  );
  console.log("ALL CAPTURED CALLS AFTER CLICK:", JSON.stringify(calls, null, 1));
  console.log("RELEVANT (store-read or row_action) CALLS:", JSON.stringify(relevant, null, 1));
} finally {
  await browser.close();
}
