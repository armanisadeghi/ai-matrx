// Walk: Publish (J1, I4) through the real UI. Admin publishes a page it made (never a sample), a SIGNED-OUT
// browser reads it, Include sub-pages off refuses the sub-page, search engines flip the robots meta, a
// signed-in member duplicates it, Unpublish takes it down.
//
//   S=<shots dir> node features/spaces/__tests__/walk/publish.walk.mjs <root-page-id> <sub-page-id>
import { chromium } from "playwright";
import { act, open, originOf, resumeIfPaused } from "./lib.mjs";

const [rootId, subId] = process.argv.slice(2);
if (!rootId || !subId) throw new Error("usage: publish.walk.mjs <root-page-id> <sub-page-id>");
const shots = `${process.env.S ?? "/tmp"}/shots`;
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const { browser, page } = await open({ next: `/spaces/${rootId}`, width: 1440, height: 900 });
const origin = originOf(page);
await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 });
await resumeIfPaused(page);

const openPublish = async () => {
  if (!(await page.getByTestId("publish-panel").isVisible().catch(() => false))) {
    await act(page, () => page.getByRole("button", { name: /^Share$/ }).first().click());
    await act(page, () => page.getByRole("tab", { name: "Publish" }).or(page.getByRole("radio", { name: "Publish" })).first().click());
  }
  await page.getByTestId("publish-panel").waitFor({ timeout: 30_000 });
};
const toggle = async (testId) => {
  await openPublish();
  await act(page, () => page.getByTestId(testId).getByRole("switch").click());
  await page.waitForTimeout(2500);
};

// 1. Publish from the Share menu.
await openPublish();
await page.screenshot({ path: `${shots}/1-publish-tab.png` });
await act(page, () => page.getByTestId("publish-button").click());
await page.getByTestId("publish-url").waitFor({ timeout: 30_000 });
const url = await page.getByTestId("publish-url").inputValue();
check("Publish shows the public link", /\/site\/knee-recovery-home-program-/.test(url), url);
await page.screenshot({ path: `${shots}/2-published-panel.png` });
const path = new URL(url).pathname;

// 2. Signed out: the page renders read-only, noindex by default.
const anonBrowser = await chromium.launch({ headless: true });
const anon = await (await anonBrowser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
anon.on("pageerror", (e) => console.log("[anon pageerror]", e.message.slice(0, 200)));
await anon.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await anon.getByTestId("public-title").waitFor({ timeout: 120_000 });
await anon.locator(".bn-editor").first().waitFor({ timeout: 60_000 });
check("signed-out title", (await anon.getByTestId("public-title").innerText()).includes("Knee Recovery Home Program"));
check("signed-out body renders", (await anon.locator(".bn-editor").innerText()).includes("Ice for 15 minutes"));
check("read-only: nothing editable", (await anon.locator('[contenteditable="true"]').count()) === 0);
const robots = () => anon.locator('meta[name="robots"]').getAttribute("content");
check("noindex by default", /noindex/.test((await robots()) ?? ""), (await robots()) ?? "none");
check("OG image is the cover", ((await anon.locator('meta[property="og:image"]').getAttribute("content")) ?? "").includes("misty-mountains"));
await anon.screenshot({ path: `${shots}/3-signed-out-page.png` });

// 3. Sub-page reachable while included.
await anon.getByText("Week 1 exercises").first().click();
await anon.waitForURL(new RegExp(`/site/${subId}`), { timeout: 60_000 });
await anon.getByTestId("public-title").waitFor({ timeout: 120_000 });
check("sub-page opens signed out", (await anon.getByTestId("public-title").innerText()).includes("Week 1"));
await anon.screenshot({ path: `${shots}/4-signed-out-subpage.png` });

// 4. Include sub-pages off → refused.
await toggle("publish-sub-pages");
await page.screenshot({ path: `${shots}/5-subpages-off.png` });
await anon.goto(`${origin}/site/${subId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await anon.waitForTimeout(4000);
check("sub-page refused when excluded", (await anon.getByTestId("public-title").count()) === 0);
await anon.screenshot({ path: `${shots}/6-subpage-refused.png` });
await toggle("publish-sub-pages");

// 5. Allow search engines → index; back off.
await toggle("publish-search-engines");
await anon.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await anon.getByTestId("public-title").waitFor({ timeout: 120_000 });
check("search engines on → index", /(^|,\s*)index/.test((await robots()) ?? ""), (await robots()) ?? "none");
await toggle("publish-search-engines");

// 6. Signed-in member duplicates.
const member = await open({ next: path, member: true, width: 1440, height: 900 });
await member.page.getByTestId("public-duplicate").waitFor({ timeout: 120_000 });
await member.page.screenshot({ path: `${shots}/7-member-sees-duplicate.png` });
await member.page.getByTestId("public-duplicate").click();
await member.page.getByTestId("confirm-duplicate").waitFor({ timeout: 120_000 });
await member.page.screenshot({ path: `${shots}/7b-duplicate-landing.png` });
await member.page.getByTestId("confirm-duplicate").click();
// No organization chosen yet in a fresh session: the platform's picker asks; take the first one offered.
const picker = member.page.getByRole("dialog");
if (await picker.waitFor({ timeout: 8_000 }).then(() => true, () => false)) {
  await member.page.screenshot({ path: `${shots}/7c-org-picker.png` });
  await picker.getByRole("button").filter({ hasText: /Willow Bend/ }).first().click().catch(async () => picker.getByRole("option").first().click());
}
const landed = await member.page.waitForURL(/\/spaces\/[0-9a-f]{8}-[0-9a-f-]{27}$/, { timeout: 120_000 }).then(() => true, () => false);
await member.page.waitForTimeout(3000);
await member.page.screenshot({ path: `${shots}/8-member-duplicate.png` });
check("duplicate lands the copy in the member's Spaces", landed, member.page.url());
if (landed) console.log(`COPY ${member.page.url().match(/[0-9a-f-]{36}/)?.[0]}`);
await member.browser.close();

// 7. Unpublish → gone.
await openPublish();
await act(page, () => page.getByTestId("unpublish-button").click());
await page.getByTestId("publish-button").waitFor({ timeout: 30_000 });
await anon.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
await anon.waitForTimeout(4000);
check("unpublished page is gone signed out", (await anon.getByTestId("public-title").count()) === 0);
await anon.screenshot({ path: `${shots}/9-unpublished.png` });

await anonBrowser.close();
await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
