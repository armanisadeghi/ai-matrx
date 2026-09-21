import { chromium } from "playwright";
const EMAIL = process.env.AI_ADMIN_USERNAME;
const PASSWORD = process.env.AI_ADMIN_PASSWORD;
const ORIGIN = "https://aimatrx.com";
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const dismissBtn = page.getByRole("button", { name: "Dismiss for today" });
  if (await dismissBtn.count()) await dismissBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  // First switch via the dashboard panel (no org selected yet)
  const first = page.locator('text="Ashford Labs"').last();
  await first.click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  console.log("after first switch url:", page.url());
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/f-shots/dbg-after-first.png" });

  // Now try avatar menu for second switch
  const avatar = page.locator('text="ADMIN"').last();
  await avatar.click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/f-shots/dbg-avatar-menu.png" });
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
