// N8 Form view for a non-editor (rounds 31, 33): the admin makes a scratch page (in an organization test@test.com
// is not in) whose inline database is in Form layout with a published form. (a) Shared with test@test.com at Can
// view: on a fresh load the SIGNED-IN viewer sees the question list, answers it, and the answer is a row. (b) The
// page is published to the web; a SIGNED-OUT visitor sees the fillable form inline and answers it; that answer is
// a row too. Unpublishes and trashes the page. Exit 1 on failure.
//   SHOT_DIR=<dir> node features/spaces/__tests__/walk/form-answer.walk.mjs [leftover page ids…]
import { chromium } from "playwright";
import { open, newPage, act, slash, originOf, trashPage, loginUrl, orgWithoutMember, shareWith, resumeIfPaused } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const org = await orgWithoutMember();
console.log(JSON.stringify({ org }));
const { browser, page } = await open({ member: false, next: `/spaces?org=${org}`, width: 1440, height: 1000 });
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
const viewerAnswer = `Daniel Reyes ${Date.now() % 100000}`;
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
  // The forms builder (records-ui) starts the form with the table's Name asked; the question's words are its
  // first text box holding "Name". Older builders had an "Ask for Name" switch and a "How to ask for Name" box.
  await form.getByRole("button", { name: "Add a question" }).or(form.getByRole("checkbox", { name: "Ask for Name" })).first().waitFor({ timeout: 60_000 });
  const ask = form.getByRole("checkbox", { name: "Ask for Name" });
  if ((await ask.count()) && (await ask.getAttribute("aria-checked")) !== "true" && (await ask.getAttribute("data-state")) !== "checked") await ask.click();
  const words = form.getByRole("textbox", { name: "How to ask for Name" });
  await words.fill("Your full name");
  await words.press("Tab");
  await page.waitForTimeout(1500);
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
// (a) A signed-in viewer (Can view) on a fresh load sees the questions and answers.
await act(page, () => shareWith(page, "test@test.com", "Can view"));
{
  const vb = await chromium.launch({ headless: true });
  const vp = await (await vb.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  vp.on("pageerror", (e) => console.log("[viewer pageerror]", e.message.slice(0, 200)));
  await vp.goto(loginUrl(`/spaces/${id}`, true), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await vp.waitForURL((u) => u.pathname.includes(id), { timeout: 120_000 }).catch(() => {});
  const inline = vp.getByTestId("spaces-form-answer");
  const shown = await inline.waitFor({ timeout: 90_000 }).then(() => true, () => false);
  const asked = shown && (await inline.getByLabel(/Your full name/).waitFor({ timeout: 30_000 }).then(() => true, () => false));
  await vp.screenshot({ path: `${SHOT}/form-answer-viewer.png` });
  check("a signed-in viewer sees the form's questions on a fresh load", asked, { shown, note: (await vp.locator(".spaces-db-frame").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160) });
  if (asked) {
    await inline.getByLabel(/Your full name/).fill(viewerAnswer);
    const sent = vp.waitForResponse((r) => r.url().includes("/submit") && r.request().method() === "POST", { timeout: 60_000 }).catch(() => null);
    await inline.getByRole("button", { name: /^(Submit|Send)$/ }).click();
    const res = await sent;
    check("the viewer's answer is sent", !!res && res.ok(), { status: res?.status() });
    await vp.waitForTimeout(2000);
  }
  await vb.close();
}
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
if (site) try {
  const anon = await chromium.launch({ headless: true });
  const p2 = await (await anon.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  p2.on("pageerror", (e) => console.log("[anon pageerror]", e.message.slice(0, 200)));
  await p2.goto(site.startsWith("http") ? site : `${originOf(page)}${site}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
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
  // The editor sees the answer as a row (Table layout). A shared preview can pause an idle tab: resume, reload.
  await resumeIfPaused(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.locator(".spaces-db-frame").first().waitFor({ timeout: 180_000 });
  await page.waitForTimeout(4000);
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
  check("the visitor's answer is a row of the table", (await page.locator(".spaces-db-frame").first().getByText(answer).count()) > 0, { answer });
  check("the viewer's answer is a row of the table", (await page.locator(".spaces-db-frame").first().getByText(viewerAnswer).count()) > 0, { viewerAnswer });
  await page.screenshot({ path: `${SHOT}/form-answer-row.png` });
} catch (e) {
  check("the published half ran", false, { error: String(e.message).split("\n")[0].slice(0, 200) });
} finally {
  if (!page.url().includes(id)) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 }).catch(() => {});
  await act(page, async () => {
    await page.getByRole("button", { name: /^Share$/ }).first().click();
    await page.getByRole("tab", { name: "Publish" }).or(page.getByRole("radio", { name: "Publish" })).first().click();
    await page.getByTestId("unpublish-button").click().catch(() => {});
    await page.waitForTimeout(2000);
    await page.keyboard.press("Escape");
  });
}
check("scratch page trashed", await act(page, () => trashPage(page)));
// Leftovers of an earlier run (argv): unpublish, then Trash.
for (const old of process.argv.slice(2)) {
  await page.goto(`${originOf(page)}/spaces/${old}`, { waitUntil: "domcontentloaded" });
  await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /^Share$/ }).first().click().catch(() => {});
  await page.getByRole("tab", { name: "Publish" }).or(page.getByRole("radio", { name: "Publish" })).first().click().catch(() => {});
  await page.getByTestId("unpublish-button").click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.keyboard.press("Escape");
  console.log(JSON.stringify({ leftover: old, trashed: await trashPage(page).catch(() => false) }));
}
await browser.close();
process.exit(failed ? 1 : 0);
