// N8 Form view (round 30): a scratch page's inline database -> View settings -> Layout -> Form; ask Name
// with its own title, description and Required; Save and publish; a signed-out visitor answers the
// link; the answer is a row of the table. Exit 1 on any failure.
//   SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/form-view.walk.mjs [pageId]
import { chromium } from "playwright";
import { open, newPage, act, slash, originOf } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let id = process.argv[2];
if (id) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
else id = await newPage(page);
console.log(JSON.stringify({ page: id }));
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
const answer = `Rosa Delgado ${Date.now() % 100000}`;
let link = null;
await act(page, async () => {
  if (!(await page.locator(".spaces-db-frame").count())) {
    await page.locator(".bn-editor .bn-inline-content").last().click();
    await slash(page, "Database - Inline");
    await page.locator(".spaces-db-frame").first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(4000);
  }
  const frame = page.locator(".spaces-db-frame").first();
  await frame.hover();
  await frame.getByRole("button", { name: "View settings" }).click();
  await page.getByText("Layout", { exact: true }).click();
  await page.locator("[data-radix-popper-content-wrapper]").last().getByText("Form", { exact: true }).click();
  await page.keyboard.press("Escape");
  const form = frame.locator(".spaces-db-form");
  await form.waitFor({ timeout: 30_000 });
  const ask = form.getByRole("checkbox", { name: "Ask for Name" });
  await ask.waitFor({ timeout: 30_000 });
  if ((await ask.getAttribute("aria-checked")) !== "true" && (await ask.getAttribute("data-state")) !== "checked") await ask.click();
  await form.getByRole("textbox", { name: "How to ask for Name" }).fill("Your full name");
  await form.getByRole("textbox", { name: "Help text for Name" }).fill("First and last, as on your ID");
  const req = form.getByRole("checkbox", { name: "Name is required" });
  const hasReq = (await req.count()) > 0;
  check("each question has its own Required box", hasReq);
  if (hasReq && (await req.getAttribute("data-state")) !== "checked") await req.click();
  await page.screenshot({ path: `${SHOT}/form-view-built.png` });
  const publish = form.getByRole("button", { name: /^(Save and publish|Publish)$/ });
  if (await publish.count()) await publish.click();
  else if (await form.getByRole("button", { name: "Save", exact: true }).isEnabled().catch(() => false)) await form.getByRole("button", { name: "Save", exact: true }).click();
  await form.getByRole("button", { name: /^(Copy link|Copied)$/ }).waitFor({ timeout: 30_000 });
  link = (await form.innerText()).match(/\/f\/[0-9a-f-]{36}/)?.[0] ?? null;
});
check("published with a link", !!link, { link });
const viewSaved = await page.evaluate(() => document.querySelector(".spaces-db-frame")?.getAttribute("data-layout"));
check("the view is a Form view", viewSaved === "form", { layout: viewSaved });
if (link) {
  const anon = await chromium.launch({ headless: true });
  const p2 = await (await anon.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  await p2.goto(`${originOf(page)}${link}`, { waitUntil: "domcontentloaded" });
  const box = p2.getByLabel(/Your full name/);
  await box.waitFor({ timeout: 60_000 });
  await p2.waitForLoadState("networkidle").catch(() => {});
  await p2.waitForTimeout(4000); // hydrated before typing (a first compile can take 10 s)
  check("the question reads in its own words, with its description", (await p2.content()).includes("First and last, as on your ID"));
  await p2.screenshot({ path: `${SHOT}/form-view-public.png` });
  await box.fill(answer);
  const sent = p2.waitForResponse((r) => r.url().includes("/submit") && r.request().method() === "POST", { timeout: 60_000 }).catch(() => null);
  await p2.getByRole("button", { name: /^(Submit|Send)$/ }).click();
  const res = await sent;
  check("the answer is sent", !!res && res.ok(), { status: res?.status() });
  await p2.waitForTimeout(2000);
  await p2.screenshot({ path: `${SHOT}/form-view-sent.png` });
  await anon.close();
  // Back on the page: the answer is a row of the table (switch the view to Table).
  await act(page, async () => {
    const frame = page.locator(".spaces-db-frame").first();
    await frame.hover();
    await frame.getByRole("button", { name: "View settings" }).click();
    await page.getByText("Layout", { exact: true }).click();
    await page.locator("[data-radix-popper-content-wrapper]").last().getByText("Table", { exact: true }).click();
    await page.keyboard.press("Escape");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".spaces-db-frame").first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(8000);
  const has = await page.locator(".spaces-db-frame").first().getByText(answer).count();
  check("the answer is a row of the table", has > 0, { answer });
  await page.screenshot({ path: `${SHOT}/form-view-row.png` });
}
await browser.close();
process.exit(failed ? 1 : 0);
