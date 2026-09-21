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
  await page.waitForTimeout(3500);
  const dismissBtn = page.getByRole('button', { name: 'Dismiss for today' });
  if (await dismissBtn.count()) {
    await dismissBtn.click({ force: true });
    console.log('clicked dismiss');
  } else {
    console.log('no dismiss button found');
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/f-shots/debug-after-dismiss.png" });
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
