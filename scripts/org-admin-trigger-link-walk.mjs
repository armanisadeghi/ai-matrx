// scripts/org-admin-trigger-link-walk.mjs — a PLAIN org admin opens the org triggers page and the workflow link (headless).
//   node --env-file=.env.local scripts/org-admin-trigger-link-walk.mjs
// Makes a tagged org-admin persona (role admin, not owner, not a super admin) with one workflow + one paused
// trigger, signs it in on this session's preview host, clicks the workflow name, and asserts the workflow's
// triggers page renders (no 403 / not-found / redirect away). Tears everything down in `finally`.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { testTarget, withOrgAdminFixture, fixtureSessionCookies } from "./lib/persona.mjs";

const target = testTarget();
const login = execSync(`pnpm -s dev-login '/dashboard'`, { encoding: "utf8" });
const origin = new URL(login.match(/OPEN\s*:\s*(\S+)/)[1]).origin;
const host = new URL(origin).hostname;
let failed = false;
await withOrgAdminFixture(target, { suite: "scheduling/org-admin-triggers", purpose: "org admin opens the trigger's workflow link", withWorkflowTrigger: true }, async (fx) => {
  console.log(`persona: ${fx.admin.fullName} <${fx.admin.email}> admin of "${fx.organizationName}" (${fx.organizationSlug}); expires ${fx.expiresAt}`);
  const cookies = await fixtureSessionCookies(target, fx.admin, { host });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const warm = await ctx.newPage();
  await warm.goto(login.match(/OPEN\s*:\s*(\S+)/)[1].replace(/\?.*$/, ""), { timeout: 180_000 }).catch(() => {});
  if (warm.url().includes("__dev-walk")) { await warm.getByRole("button", { name: "Resume this preview" }).click(); await warm.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180_000 }); }
  await ctx.clearCookies();
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(`${origin}/organizations/${fx.organizationSlug}/admin/triggers`, { timeout: 180_000 });
  await page.waitForTimeout(8000);
  console.log("triggers page url:", page.url());
  const link = page.getByRole("link", { name: /weekly intake review/i }).first();
  const hasLink = (await link.count()) > 0;
  console.log("workflow link present:", hasLink, hasLink ? await link.getAttribute("href") : "");
  if (!hasLink) { console.log((await page.evaluate(() => document.body.innerText)).slice(0, 600)); failed = true; }
  else {
    await link.click();
    await page.waitForURL(/\/workflows\//, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(8000);
    const text = await page.evaluate(() => document.body.innerText);
    console.log("after click url:", page.url());
    const dead = /forbidden|not found|404|don't have access|no access|sign in/i.test(text.slice(0, 1500));
    console.log("dead end:", dead, "| body starts:", JSON.stringify(text.slice(0, 200)));
    await page.screenshot({ path: process.env.WALK_SHOT ?? "/tmp/org-admin-link.png" });
    failed = dead || !/\/workflows\//.test(page.url());
  }
  await browser.close();
});
console.log(failed ? "RESULT: dead end" : "RESULT: ok");
process.exit(failed ? 1 : 0);
