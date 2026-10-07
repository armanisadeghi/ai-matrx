// spaces-agents lane: ONE real UI run of "Database with AI" as test@test.com (headless).
import { open, newPage, slash, chooseOrgIfAsked, shot } from "./lib.mjs";
const [request, shotPath, pageTitle] = process.argv.slice(2);
const { browser, page } = await open({ member: true });
const runs = [];
page.on("request", (r) => {
  if (r.method() !== "POST" || !/mandates\/spaces\.design_database/.test(r.url())) return;
  let body = null;
  try { body = JSON.parse(r.postData() ?? "null"); } catch {}
  runs.push({ url: r.url(), conversation_id: body?.conversation_id, user_input: body?.user_input, variables: body?.variables });
});
const id = await newPage(page);
console.log("page:", page.url());
// A title gives the agent its page context (page_title).
if (pageTitle) {
  const title = page.locator("[aria-label='Page title'], .spaces-title, h1[contenteditable]").first();
  if (await title.isVisible().catch(() => false)) { await title.click(); await page.keyboard.type(pageTitle); await page.keyboard.press("Enter"); }
}
await page.locator(".bn-editor").first().click();
await page.keyboard.press("End");
await slash(page, "Database with AI");
const box = page.getByLabel("What to track");
await box.waitFor({ timeout: 15_000 });
await box.fill(request);
await page.getByRole("button", { name: /^Create$/ }).click();
await chooseOrgIfAsked(page);
const done = await page.getByText(/is ready$/).first().waitFor({ timeout: 300_000 }).then(() => true, () => false);
await page.waitForTimeout(6000);
await shot(page, shotPath);
const toasts = await page.locator("[data-sonner-toast]").allTextContents();
console.log(JSON.stringify({ done, page_id: id, url: page.url(), runs, toasts }, null, 1));
await browser.close();
