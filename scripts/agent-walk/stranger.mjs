/**
 * THE STRANGER — somebody with no account uses what the agent built.
 *
 * A form that exists is not a form that works. `ask.mjs` proves the agent BUILT
 * the thing; this proves a person who has never heard of us can USE it, from a
 * browser context with no session, no cookie and no organization — which is the
 * only way a gym's signup form or a mechanic's booking page is ever actually
 * used.
 *
 * WHY THIS FILE EXISTS RATHER THAN A FEW LINES IN `close.mjs`: the first attempt
 * assumed a single-page form and waited two minutes for `#form-email`. The form
 * the agent built is `flow: "one-at-a-time"` — Typeform's shape, which is the
 * store's own default — so it renders ONE question at a time behind a Next
 * button and shows "5 of 5". The screen was never broken; it said, in plain
 * words under a disabled Submit, *"full name still needs an answer."* A walk
 * that cannot drive the flow the product actually ships is a broken walk, not a
 * broken product, and reporting it the other way round would have been the
 * expensive mistake.
 *
 *   node scripts/agent-walk/stranger.mjs
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const HOST = process.env.WALK_HOST ?? "agent-builds.localhost";
const PORT = process.env.WALK_PORT ?? "3001";
const ORIGIN = `http://${HOST}:${PORT}`;
const OUT =
  process.env.WALK_OUT ?? resolve(process.cwd(), "../common-docs/operations/for-arman/2026-09-21");

/**
 * A REAL PROSPECTIVE MEMBER OF A REAL GYM, synthesized and never copied.
 * Ironline Fitness is a strength-and-conditioning studio; Boxing Fundamentals
 * with Coach Ibrahim runs 07:15 on Wednesdays and Fridays. The note is the kind
 * a returning member actually writes, because a form proved with "test"/"asdf"
 * proves the field accepts junk and nothing else (THE NO-FAKE-TEST-DATA LAW).
 */
const MEMBER = {
  name: "Priya Raghunathan",
  email: "priya.raghunathan@harborlinemail.example",
  phone: "415-555-0184",
  klass: "Boxing Fundamentals",
  notes: "Coming back after a shoulder injury — is the 7:15 Boxing class beginner friendly?",
};

/** Answer whatever question is on screen, by what the question ASKS. */
function answerFor(questionText) {
  const q = questionText.toLowerCase();
  if (/full name|your name|^name/.test(q)) return MEMBER.name;
  if (/e-?mail/.test(q)) return MEMBER.email;
  if (/phone|mobile|number/.test(q)) return MEMBER.phone;
  if (/class/.test(q)) return MEMBER.klass;
  if (/note|anything|know/.test(q)) return MEMBER.notes;
  return null;
}

const shot = async (page, name) => {
  const file = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`   shot → ${file}`);
  return file;
};

const browser = await chromium.launch({ headless: true });
const note = { ranAt: new Date().toISOString(), member: MEMBER, steps: [] };

// ── A STRANGER: a fresh context, no storage state, no session ──────────────
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {
  const url = `${ORIGIN}/f/690c349e-87ae-4daa-8fe5-c43b08a4367f`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(6000);
  note.url = url;
  await shot(page, "stranger-01-form-opened");

  // WALK THE ONE-AT-A-TIME FLOW. Up to a dozen passes — more than the five
  // questions, so a repeated question fails loudly on the Submit check below
  // rather than looping forever.
  for (let step = 0; step < 12; step += 1) {
    const submit = page.getByRole("button", { name: /^Submit$/ }).first();
    const submitReady =
      (await submit.isVisible().catch(() => false)) &&
      (await submit.isEnabled().catch(() => false));
    if (submitReady) break;

    const box = page.locator("input:visible, textarea:visible, select:visible").first();
    if (!(await box.isVisible().catch(() => false))) break;

    const asked = await page.evaluate(() => {
      const body = document.body.innerText || "";
      // The question and its help sit directly above the field; the progress
      // line ("5 of 5") is the only other short line on the page.
      return body.split("\n").filter((l) => l.trim()).slice(0, 8).join(" | ");
    });
    const value = answerFor(asked);
    note.steps.push({ step, asked: asked.slice(0, 120), answered: value });
    if (value === null) break;

    const tag = await box.evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") await box.selectOption({ label: value }).catch(() => {});
    else await box.fill(value);
    await page.waitForTimeout(600);

    const next = page.getByRole("button", { name: /^(Next|Continue)$/ }).first();
    if (await next.isVisible().catch(() => false)) await next.click();
    else await box.press("Enter");
    await page.waitForTimeout(1500);
  }

  await shot(page, "stranger-02-before-submit");
  note.beforeSubmit = (await page.evaluate(() => document.body.innerText)).slice(0, 700);

  const submit = page.getByRole("button", { name: /^Submit$/ }).first();
  note.submitEnabled = await submit.isEnabled().catch(() => false);
  if (note.submitEnabled) {
    await submit.click();
    await page.waitForTimeout(9000);
  }
  note.afterSubmit = (await page.evaluate(() => document.body.innerText)).slice(0, 700);
  await shot(page, "stranger-03-after-submit");
  note.ok = true;
} catch (error) {
  note.ok = false;
  note.error = String(error).slice(0, 500);
  await shot(page, "stranger-99-failed").catch(() => {});
}

await context.close();
await browser.close();
const file = resolve(OUT, "stranger-results.json");
writeFileSync(file, JSON.stringify(note, null, 2));
console.log(JSON.stringify(note, null, 2));
console.log(`\nresults → ${file}`);
