import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const EMAIL = process.env.AI_ADMIN_USERNAME;
const PASSWORD = process.env.AI_ADMIN_PASSWORD;
const ORIGIN = "https://aimatrx.com";
const OUT = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/f-shots";

const results = [];

async function loginFresh(browser) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);
  return { context, page };
}

async function switchOrg(page, orgName) {
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const dismissBtn = page.getByRole("button", { name: "Dismiss for today" });
  if (await dismissBtn.count()) await dismissBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  const row = page.locator(`text="${orgName}"`).last();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await row.click({ timeout: 15000 });
  await page.waitForTimeout(2500);
}

async function goto(page, path) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
}

async function textOf(page) {
  return await page.evaluate(() => document.body.innerText);
}

async function shot(page, name) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const scenarios = [
    { key: "rollup_pledges", org: "Hands & Hope Alliance", path: "/data-v2/0f9c8a0b-c8ab-481d-8070-fc1c689eb968" },
    { key: "campaign_record", org: "Hands & Hope Alliance", path: "/data-v2/abf4f43d-9877-41c1-8e47-29c26234557b?record=1f9fa537-56fc-4c1e-8735-0af8425b07bc" },
    { key: "history_recipe", org: "The Alvarado-Chen Kitchen", path: "/data-v2/5f6b8364-8c3a-48ca-a833-2905a88e6ee4?record=e28c9ae5-b7d3-41d5-8a3a-b970af16cc49" },
    { key: "quote_esign", org: "Birchwood Avenue Renovation", path: "/data-v2/0e108f31-5078-48ec-9a15-b492baa414ba?record=1ac9916f-06c6-4b17-a021-5242bf54f84b" },
    { key: "invoice_formula", org: "Ironclad Mobile Mechanic", path: "/data-v2/ffbddf5c-e5d8-417c-b82b-eff823f55fc4?record=7cfcb562-b8f1-4080-888a-a2e5d65453a5" },
    { key: "member_approval", org: "Ironline Fitness", path: "/data-v2/60df8b1e-d63a-482d-9600-22469c93263c?record=caadbc70-2f6b-4fcf-98b1-30e2a22a85ac" },
    { key: "class_form", org: "Ironline Fitness", path: "/data-v2/e4a35317-9922-4ef4-be1e-f4b748dbe97c" },
    { key: "experiment_chat", org: "Kessler Lab for Applied Microbial Ecology", path: "/data-v2/7929e197-cba4-4128-8445-870209dd0335?record=7dbd64b8-945d-49f7-9654-fe4900f53a4e" },
    { key: "customer_portal", org: "Ironclad Mobile Mechanic", path: "/data-v2/02f00d65-bf3b-49bb-995c-859926be8a4f?record=4673b326-7026-4e24-8e76-f0fec7c57f59" },
    { key: "job_checklist", org: "Greenline Landscaping Crew", path: "/data-v2/182fef5a-4ead-42a0-966b-e4e88fcd87a9?record=6ae88cbd-448a-4a9e-a076-967893694937" },
    { key: "airports_enrich", org: "Compass Route Relocation Advisors", path: "/data-v2/b1ff92ea-977a-4af8-aa35-4d637de98019" },
  ];

  for (const s of scenarios) {
    let context;
    try {
      const login = await loginFresh(browser);
      context = login.context;
      const page = login.page;
      await switchOrg(page, s.org);
      await goto(page, s.path);
      const text = await textOf(page);
      const file = await shot(page, s.key);
      results.push({ key: s.key, org: s.org, path: s.path, ok: true, textSnippet: text.slice(0, 2000), screenshot: file });
      console.log(`[${s.key}] OK -> ${file}`);
    } catch (e) {
      results.push({ key: s.key, org: s.org, path: s.path, ok: false, error: String(e) });
      console.log(`[${s.key}] ERROR: ${e}`);
    } finally {
      if (context) await context.close().catch(() => {});
    }
  }

  writeFileSync(`${OUT}/results2.json`, JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
