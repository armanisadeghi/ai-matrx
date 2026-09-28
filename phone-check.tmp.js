const { chromium, devices } = require('playwright');

(async () => {
  const iphone = devices['iPhone 13'];
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...iphone,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
  });

  const loginUrl = process.argv[2];
  const targetPath = process.argv[3] || '/education/classes/agent-test-chemistry';

  await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('After login, URL:', page.url());
  await page.waitForTimeout(1500);

  // Check org state
  const bodyText = await page.locator('main').innerText().catch(() => '');
  console.log('--- Body text after nav ---');
  console.log(bodyText.slice(0, 500));

  if (bodyText.includes('Choose organization')) {
    console.log('Clicking Choose organization...');
    await page.getByRole('button', { name: /choose organization/i }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code-matrx-frontend/410bf6c0-7412-4131-bf7b-53eee75e0dab/scratchpad/org-picker.png' });
    const orgOption = page.getByText(/admin.?s workspace/i).first();
    if (await orgOption.count() > 0) {
      await orgOption.click();
      await page.waitForTimeout(1500);
    } else {
      console.log('Could not find admin workspace org option, dumping page text');
      console.log(await page.innerText('body'));
    }
  }

  await page.waitForTimeout(1000);
  console.log('Final URL:', page.url());
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code-matrx-frontend/410bf6c0-7412-4131-bf7b-53eee75e0dab/scratchpad/class-page-phone.png', fullPage: false });

  await browser.close();
})();
