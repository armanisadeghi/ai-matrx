import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
await p.goto('http://localhost:3000/api/dev-login?nonce=075ade974476bd57e3f46cd4c1e3ecd2&next=%2Fdashboard', { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.goto('http://localhost:3000/agents/44d3b270-d516-4485-86a5-a958968e15c9/run?conversationId=c813a6ec-fdd7-4792-9b83-bb3411bf0dbf', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForTimeout(12000);
await p.screenshot({ path: '/tmp/decision-answers-fixed.png', fullPage: true });
console.log('shot ok');
await b.close();
