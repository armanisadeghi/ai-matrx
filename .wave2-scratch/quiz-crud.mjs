import { chromium } from 'playwright';
const HOST = 'wave2edu.localhost:3001';
const STATE = '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/state.json';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });
const page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console error]', msg.text()); });

async function handleOrgGateIfAny() {
  await page.waitForTimeout(800);
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible().catch(() => false)) {
    const orgBtn = dialog.getByRole('button', { name: "admin's Workspace" });
    if (await orgBtn.isVisible().catch(() => false)) {
      await orgBtn.click();
      await page.waitForTimeout(300);
      await dialog.getByRole('button', { name: /^Continue$/i }).click();
      await page.waitForTimeout(500);
    }
  }
}

// 1) Create a small quiz named via topic "Agent Test Quiz CRUD".
await page.goto(`http://${HOST}/education/quizzes/new`, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(2000);
console.log('new quiz page:', page.url());
const topicInput = page.getByLabel('Topic');
await topicInput.click();
await topicInput.type('Agent Test Quiz CRUD', { delay: 20 });
await page.screenshot({ path: '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/quiz-new-form.png' });

const genBtn = page.getByRole('button', { name: /^Generate$/i });
await genBtn.click();
await handleOrgGateIfAny();

let landed = false;
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(2000);
  if (/\/education\/quizzes\/[0-9a-f-]{20,}/.test(page.url())) { landed = true; break; }
}
console.log('quiz created, landed:', landed, 'url:', page.url());
await page.screenshot({ path: '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/quiz-detail.png' });

if (!landed) { console.log('ABORT: quiz was not created'); await browser.close(); process.exit(1); }

const quizId = page.url().match(/quizzes\/([0-9a-f-]{20,})/)[1];
console.log('QUIZ_ID', quizId);

// 2) Click Convert -> open dialog, screenshot, close.
const convertBtn = page.getByRole('button', { name: /^Convert$/i });
await convertBtn.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/quiz-convert-dialog.png' });
// close dialog (Escape)
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// 3) Click Duplicate -> should navigate to a NEW quiz id.
const dupBtn = page.getByRole('button', { name: /^Duplicate$/i });
const dupVisible = await dupBtn.isVisible().catch(() => false);
console.log('Duplicate button visible:', dupVisible);
if (dupVisible) {
  await dupBtn.click();
  let dupLanded = false;
  let dupId = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    const m = page.url().match(/quizzes\/([0-9a-f-]{20,})/);
    if (m && m[1] !== quizId) { dupLanded = true; dupId = m[1]; break; }
  }
  console.log('duplicate landed:', dupLanded, 'newId:', dupId, 'url:', page.url());
  await page.screenshot({ path: '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/quiz-duplicate.png' });

  // 4) Delete the DUPLICATE (not the original) to prove delete works, keep it minimal.
  const deleteBtn = page.getByRole('button', { name: /^Delete$/i });
  await deleteBtn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/quiz-delete-confirm.png' });
  const confirmBtn = page.getByRole('button', { name: /^Delete$/i }).last();
  await confirmBtn.click();
  let deleted = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    if (/\/education\/quizzes\/?$/.test(page.url())) { deleted = true; break; }
  }
  console.log('deleted, redirected to list:', deleted, 'url:', page.url());
} else {
  console.log('Duplicate button NOT FOUND on quiz detail page (owner view) -- possible bug');
}

await context.storageState({ path: STATE });
await browser.close();
