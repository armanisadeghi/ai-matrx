// N8 Form view for a non-editor (round 31): a scratch page's inline database in Form layout with a published
// form; the page is published to the web; a SIGNED-OUT visitor (no edit right) sees the fillable form inline,
// answers it, and the answer is a row of the table. Unpublishes and trashes the page. Exit 1 on failure.
//   SPACES_WALK_ORG="Ashford Labs" SHOT_DIR=<dir> node features/spaces/__tests__/walk/form-answer.walk.mjs
import { chromium } from "playwright";
import { open, newPage, act, slash, originOf, trashPage } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
page.on("response", async (r) => {
  if (r.status() >= 400 && /rpc|rest\/v1/.test(r.url())) console.log("[refused]", r.status(), r.url().split("?")[0].slice(-60), (await r.text().catch(() => "")).slice(0, 400));
});
const id = await newPage(page);
console.log(JSON.stringify({ page: id }));
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
const answer = `Maya Okafor ${Date.now() % 100000}`;
let formLink = null;
await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").last().click();
  await slash(page, "Database - Inline");
  await page.locator(".spaces-db-frame").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4000);
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
  const publish = form.getByRole("button", { name: /^(Save and publish|Publish)$/ });
  if (await publish.count()) await publish.click();
  await form.getByRole("button", { name: /^(Copy link|Copied)$/ }).waitFor({ timeout: 30_000 });
  formLink = (await form.innerText()).match(/\/f\/[0-9a-f-]{36}/)?.[0] ?? null;
  await page.waitForTimeout(3000); // the view's formId saves with the page
});
check("the form is published", !!formLink, { formLink });
// The page saves (the view's form) before it is published.
const saved = await page.locator('.spaces-edited[data-state="saved"]').waitFor({ timeout: 30_000 }).then(() => true, () => false);
check("the page saved", saved, { state: await page.locator(".spaces-edited").getAttribute("data-state"), toasts: await page.locator("[data-sonner-toast]").allInnerTexts() });
// Publish the page to the web (Share -> Publish).
let site = null;
await act(page, async () => {
  await page.getByRole("button", { name: /^Share$/ }).first().click();
  await page.getByRole("tab", { name: "Publish" }).or(page.getByRole("radio", { name: "Publish" })).first().click();
  await page.getByTestId("publish-panel").waitFor({ timeout: 30_000 });
  await page.getByTestId("publish-button").click();
  await page.getByTestId("publish-url").waitFor({ timeout: 30_000 });
  site = await page.getByTestId("publish-url").inputValue();
  await page.keyboard.press("Escape");
});
check("the page is published", !!site, { site });
if (site) {
  const anon = await chromium.launch({ headless: true });
  const p2 = await (await anon.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  p2.on("pageerror", (e) => console.log("[anon pageerror]", e.message.slice(0, 200)));
  await p2.goto(site.startsWith("http") ? site : `${originOf(page)}${site}`, { waitUntil: "domcontentloaded" });
  const inline = p2.getByTestId("spaces-form-answer");
  const shown = await inline.waitFor({ timeout: 90_000 }).then(() => true, () => false);
  await p2.waitForTimeout(4000);
  await p2.screenshot({ path: `${SHOT}/form-answer-inline.png` });
  check("a signed-out reader sees the fillable form inline (no note)", shown && !(await p2.getByText("Only editors can change this form").count()));
  if (shown) {
    await inline.getByLabel(/Your full name/).fill(answer);
    const sent = p2.waitForResponse((r) => r.url().includes("/submit") && r.request().method() === "POST", { timeout: 60_000 }).catch(() => null);
    await inline.getByRole("button", { name: /^(Submit|Send)$/ }).click();
    const res = await sent;
    check("the answer is sent", !!res && res.ok(), { status: res?.status() });
    await p2.waitForTimeout(2000);
    await p2.screenshot({ path: `${SHOT}/form-answer-sent.png` });
  }
  await anon.close();
  // The editor sees the answer as a row (Table layout).
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
  check("the answer is a row of the table", (await page.locator(".spaces-db-frame").first().getByText(answer).count()) > 0, { answer });
  await page.screenshot({ path: `${SHOT}/form-answer-row.png` });
  await act(page, async () => {
    await page.getByRole("button", { name: /^Share$/ }).first().click();
    await page.getByRole("tab", { name: "Publish" }).or(page.getByRole("radio", { name: "Publish" })).first().click();
    await page.getByTestId("unpublish-button").click().catch(() => {});
    await page.waitForTimeout(2000);
    await page.keyboard.press("Escape");
  });
}
check("scratch page trashed", await act(page, () => trashPage(page)));
await browser.close();
process.exit(failed ? 1 : 0);
