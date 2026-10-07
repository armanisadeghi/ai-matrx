// spaces-agents lane: ONE real UI run of "Database with AI" as test@test.com (headless).
import { open, newPage, slash, chooseOrgIfAsked, shot } from "./lib.mjs";
const [requestsJson, shotBase] = process.argv.slice(2);
const requests = JSON.parse(requestsJson);
const out = [];
const { browser, page } = await open({ member: true });
const runs = [];
page.on("request", (r) => {
  if (r.method() !== "POST" || !/mandates\/spaces\.design_database/.test(r.url())) return;
  let body = null;
  try { body = JSON.parse(r.postData() ?? "null"); } catch {}
  runs.push({ url: r.url(), conversation_id: body?.conversation_id, user_input: body?.user_input, variables: body?.variables });
});
for (const [n, request] of requests.entries()) {
  const shotPath = `${shotBase}-${n + 1}.png`;
  try {
const id = await newPage(page);
await page.goto(`${new URL(page.url()).origin}/spaces/${id}`, { waitUntil: "domcontentloaded" });
await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 });
await page.waitForTimeout(5000);
if (!page.url().includes(id)) throw new Error("left the new page: " + page.url());
const blocks = await page.locator(".bn-editor .bn-block-content").count();
if (blocks > 2) { await page.screenshot({ path: shotPath }); throw new Error(`refused: page ${id} shows ${blocks} blocks, not a blank page`); }
console.log("page:", page.url());
// A title gives the agent its page context (page_title).
if (false) {
  const title = page.locator("[aria-label='Page title'], .spaces-title, h1[contenteditable]").first();
  if (await title.isVisible().catch(() => false)) { await title.click(); await page.keyboard.type(pageTitle); await page.keyboard.press("Enter"); }
}
await page.locator(".bn-editor .bn-block-content").first().click();
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
out.push({ request, done, page_id: id, run: runs[runs.length - 1]?.conversation_id });
console.log(JSON.stringify(out[out.length - 1]));
  } catch (e) { console.log("FAILED", n + 1, String(e).slice(0, 200)); }
}
await browser.close();
