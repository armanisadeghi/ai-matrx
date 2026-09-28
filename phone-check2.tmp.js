const { chromium, devices } = require('playwright');
(async () => {
  const iphone = devices['iPhone 13'];
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...iphone, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(process.argv[2], { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const btn = page.getByRole('button', { name: /choose organization/i });
  await btn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/private/tmp/org-picker.png' });
  console.log('screenshot taken');
  console.log(await page.locator('body').innerText());
  await browser.close();
})();
