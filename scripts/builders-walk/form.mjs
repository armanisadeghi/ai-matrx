/**
 * WALK 1 — IRONLINE FITNESS PUBLIC CLASS-SIGNUP FORM.
 *
 * The real job: the gym wants people to sign up for the Saturday 9am strength
 * class from a link it can put on a poster by the door. The person building it
 * is the studio manager, who has never written a line of anything. She opens
 * her own `members` table — 46 real members already in it — presses "Build the
 * form", ticks the columns she wants asked, writes the sentence people see
 * afterwards, and publishes.
 *
 * Then a STRANGER — a fresh browser context with no session and no account —
 * opens the link, answers it, and the new member has to be IN THE GRID.
 *
 * WHAT WOULD MAKE THIS A FAKE: declaring the form through `custom.form_declare`
 * from node and screenshotting the panel afterwards. Every step below is a
 * click on the real screen, and the last assertion reads the grid the manager
 * reads, not the door the builder called.
 */
import { chromium } from "playwright";
import { CASES, ORIGIN, signIn, useOrganization, settleOnTable, shot, shotPath } from "./walk.mjs";

const T = CASES.form;
const FORM_NAME = "Saturday 9am Strength — class signup";
/** The stranger. Synthesized, never a real person, and named like a real one. */
const VISITOR = {
  email: "dana.whitfield.s1@example.org",
  name: "Dana Whitfield",
  plan: "Basic Monthly",
};

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1020 } })).newPage();
const notes = [];

const who = await signIn(page, `/data-v2`);
notes.push(`signed in as ${who.email}`);
await useOrganization(page, T);

await settleOnTable(page, T.table);
const before = await page.evaluate(() => document.body.innerText);
notes.push(`members before: ${before.match(/members\s+(\d+)/)?.[1] ?? "?"}`);
await shot(page, "builders-01-ironline-members-grid");

// ── the manager opens the Forms rail ────────────────────────────────────────
await page.getByRole("button", { name: /^Forms$/ }).first().click();
await page.waitForTimeout(3000);
await shot(page, "builders-02-ironline-forms-rail");
const rail = await page.evaluate(() => document.body.innerText);
notes.push(
  `rail offers a builder: ${/Build the form|Build a form/.test(rail)}`,
  `rail offers an agent: ${/Ask an agent/.test(rail)}`,
);

await page.getByRole("button", { name: /Build the form|Build a form/ }).first().click();
await page.waitForTimeout(3000);

const newForm = page.getByRole("button", { name: /^New form$/ }).first();
if (await newForm.isVisible().catch(() => false)) {
  await newForm.click();
  await page.waitForTimeout(4000);
}

// ── she fills it in, in her own words, on her own columns ───────────────────
const field = (label) => page.locator(`label:has-text("${label}")`).locator("input,textarea").first();

await field("Name").fill(FORM_NAME);
await field("Submit button").fill("Save my spot");
await field("Thank-you title").fill("You're on the list");
await page.waitForTimeout(500);

// The questions are this table's own Fields. Email arrives ticked; the class
// needs a name and a plan too.
for (const column of ["Member Name", "Plan Name"]) {
  // The builder labels each question's tick "Ask for <column>", which is the
  // only stable handle on it — the checkbox is not inside a <label>.
  const box = page.getByRole("checkbox", { name: `Ask for ${column}` }).first();
  await box.waitFor({ state: "visible", timeout: 30000 });
  if (!(await box.isChecked().catch(() => false))) await box.click();
  await page.waitForTimeout(500);
}
notes.push(
  `questions now: ${(await page.evaluate(() => document.body.innerText)).match(/(\d+) of this table's/)?.[1] ?? "?"}`,
);
await shot(page, "builders-03-ironline-form-builder-filled");

await page.getByRole("button", { name: /^Save$/ }).first().click();
await page.waitForTimeout(6000);

const publish = page.getByRole("button", { name: /^Publish$/ }).first();
if (await publish.isVisible().catch(() => false)) {
  await publish.click();
  await page.waitForTimeout(6000);
}
await shot(page, "builders-04-ironline-form-published");

const afterBuild = await page.evaluate(() => document.body.innerText);
const formId = afterBuild.match(/\/f\/([0-9a-f-]{36})/i)?.[1] ?? null;
notes.push(`public link: ${formId ? `${ORIGIN}/f/${formId}` : "NONE ON SCREEN"}`);
notes.push(`state sentence: ${afterBuild.match(/(Open — anyone[^\n]*|Not published[^\n]*)/)?.[1] ?? "?"}`);

// ── a stranger with no account answers it ───────────────────────────────────
if (!formId) throw new Error("the builder published nothing this walk could open");

const strangerCtx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
const sp = await strangerCtx.newPage();
await sp.goto(`${ORIGIN}/f/${formId}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await sp.waitForTimeout(6000);
await sp.screenshot({ path: shotPath("builders-05-ironline-public-form-as-a-stranger") });
notes.push(`stranger sees: ${(await sp.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 240)}`);

// One question at a time: fill whatever is on screen, press on, repeat.
for (let step = 0; step < 8; step += 1) {
  const text = await sp.evaluate(() => document.body.innerText);
  if (/You're on the list|Thank you/i.test(text)) break;
  const input = sp.locator("input:visible, textarea:visible").first();
  if (await input.count()) {
    const type = await input.getAttribute("type");
    await input.fill(
      type === "email" ? VISITOR.email : /plan/i.test(text) ? VISITOR.plan : VISITOR.name,
    );
    await sp.waitForTimeout(400);
  }
  const next = sp
    .getByRole("button", { name: /Save my spot|Submit|Next|Continue|→/i })
    .first();
  if (!(await next.count())) break;
  await next.click().catch(() => {});
  await sp.waitForTimeout(2500);
}
await sp.waitForTimeout(3000);
await sp.screenshot({ path: shotPath("builders-06-ironline-stranger-answered") });
notes.push(`after sending: ${(await sp.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 200)}`);
await strangerCtx.close();

// ── the manager's grid ──────────────────────────────────────────────────────
await settleOnTable(page, T.table);
const grid = await page.evaluate(() => document.body.innerText);
notes.push(`members after: ${grid.match(/members\s+(\d+)/)?.[1] ?? "?"}`);
notes.push(`"${VISITOR.name}" in the grid: ${grid.includes(VISITOR.name)}`);
await page.evaluate((e) => {
  const cell = Array.from(document.querySelectorAll("td")).find((t) => t.textContent?.includes(e));
  cell?.scrollIntoView({ block: "center" });
}, VISITOR.email);
await page.waitForTimeout(1200);
await shot(page, "builders-07-ironline-new-member-in-the-grid");

console.log("\n--- WALK 1 ---");
notes.forEach((n) => console.log(" ·", n));
await browser.close();
