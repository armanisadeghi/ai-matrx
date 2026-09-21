/**
 * THE CLOSING WALK — three proofs, run by a script, reported in the product's own words.
 *
 *   1. A STRANGER SIGNS UP FOR A GYM CLASS. A brand-new browser context with no session at
 *      all opens Ironline Fitness's public class-signup form and fills it in as a prospective
 *      member. If a person with no account cannot add a row, the form is not a form.
 *   2. A CUSTOMER BOOKS A SERVICE CALL. Same — no session — on Ironclad Mobile Mechanic's
 *      booking page: take a real slot, give a real car problem, press Book it.
 *   3. THE DOOR REFUSES A VIEWER, IN WORDS, AND CREATES NOTHING. The non-admin test account
 *      reaches a table it can see, opens the Forms rail and asks an agent for a form. What is
 *      being captured is the SENTENCE the product gives a person who lacks the right — and
 *      that nothing was created. "The button is not even there" is an equally valid outcome,
 *      so the script records what the viewer DOES see either way.
 *
 * WHAT THIS SCRIPT DOES NOT PROVE. A confirmation on screen is the product's claim, not the
 * database's. Proofs 1 and 2 report the exact confirmation text and any reference the screen
 * shows, and say plainly that the row check is still owed.
 *
 * HEADLESS, ALWAYS. And on TWO hostnames on purpose: the viewer proof signs in as
 * test@test.com, and cookies are per HOST, so signing that account in on `agent-builds.localhost`
 * would evict the admin session another lane in this campaign is using (CLAUDE.md § dev server).
 * Proofs 1 and 2 need no session at all and use a fresh incognito context each.
 *
 *   node scripts/agent-walk/close.mjs [--only form|booking|refusal]
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "../lib/seat-browser.mjs";

const PORT = process.env.WALK_PORT ?? "3001";
/** The public surfaces: a stranger's host, no session, nothing to evict. */
const PUBLIC_ORIGIN = `http://${process.env.WALK_HOST ?? "agent-builds.localhost"}:${PORT}`;
/** The viewer's own host — its cookie jar is its own (see the header). */
const VIEWER_ORIGIN = `http://${process.env.WALK_VIEWER_HOST ?? "close-refusal.localhost"}:${PORT}`;
const OUT = process.env.WALK_OUT ?? resolve(process.cwd(), "../common-docs/operations/for-arman/2026-09-21");
mkdirSync(OUT, { recursive: true });

const FORM_URL = `${PUBLIC_ORIGIN}/f/690c349e-87ae-4daa-8fe5-c43b08a4367f`;
const BOOKING_URL = `${PUBLIC_ORIGIN}/b/a5da70ac-4223-4c4d-b509-391916bf7067`;
/** The organization the viewer actually belongs to, and a table it keeps work in. */
const VIEWER_ORG = "ironclad-mobile-mechanic-719980a1";
const VIEWER_TABLE = "Service Calls";

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;

/**
 * THE PEOPLE. Synthesized, never real, never "Test User": a name, a reserved-TLD address that
 * cannot belong to anybody, a 555 number, and the sentence an actual person would type.
 */
const MEMBER = {
  full_name: "Naomi Okafor",
  email: "naomi.okafor@harborlinemail.example",
  // FIXED 2026-09-21 by lane TAILS-3. The phone field's pattern used to be
  // `^[+0-9][0-9 ()\-\.]{4,}$`, which had to START with a digit or a plus, so the very
  // ordinary American way of writing a number was refused with "Phone is not written the way
  // this field expects". Every phone Field now carries `custom.phone_pattern()`, which counts
  // digits instead of policing punctuation, so this walk writes the number the way a person
  // actually writes it.
  phone: "(415) 555-0163",
  class: "Boxing Fundamentals — Tue 7:15 PM with Coach Reyes",
  notes: "Coming back after a shoulder injury — is the 7:15 Boxing class beginner friendly?",
};
const DRIVER = {
  "Customer Name": "Marcus Delgado",
  Phone: "(415) 555-0178", // see MEMBER.phone — a leading "(" is accepted since TAILS-3

  Email: "marcus.delgado@harborlinemail.example",
  "Vehicle Make": "Honda",
  "Vehicle Model": "CR-V",
  "Vehicle Year": "2019",
  "License Plate": "8XKR201",
};

const results = { ranAt: new Date().toISOString(), publicOrigin: PUBLIC_ORIGIN, viewerOrigin: VIEWER_ORIGIN, proofs: {} };

const text = (page) => page.evaluate(() => document.body.innerText).catch(() => "");

async function shot(page, name) {
  const file = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`   shot → ${file}`);
  return file;
}

/**
 * CONTENTION IS NOT A VERDICT. The record store is shared with every other lane, and a
 * statement that could not get a turn says so in its own words. Treating that as "the product
 * refused" would be reporting somebody else's load as this product's behaviour.
 */
const CONTENTION =
  /statement timeout|did not answer in time|The store refused this|canceling statement|taking longer than it should|didn.t finish loading/i;

/**
 * OPEN A PUBLIC PAGE, AND WAIT OUT CONTENTION ONCE.
 *
 * A public page whose server read could not get a turn renders the product's honest copy —
 * "This is taking longer than it should" — over a 500 whose real reason is
 * `custom.form_public refused: canceling statement due to statement timeout`. That is another
 * lane holding a lock, not this page being broken, and reporting it as a product verdict would
 * be a lie in the other direction. So: say it, wait a minute, try once more, say it again.
 */
async function openPublic(page, url, record) {
  const load = async () => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForTimeout(8000);
    return text(page);
  };
  let body = await load();
  if (CONTENTION.test(body)) {
    record.contentionOnLoad = body.trim().split("\n").slice(0, 4).join(" / ");
    console.warn(`[close] CONTENTION opening ${url} — ${record.contentionOnLoad}; waiting 60s`);
    await page.waitForTimeout(60000);
    body = await load();
    record.contentionClearedOnRetry = !CONTENTION.test(body);
    if (!record.contentionClearedOnRetry) {
      record.pass = false;
      record.failure =
        "the page never rendered: the record store could not answer in time on two attempts — CONTENTION, not a product verdict";
      record.whatTheScreenSaid = body;
      return false;
    }
  }
  return true;
}

/**
 * Fill a React-controlled field the way a keystroke does — AND PROVE IT TOOK.
 *
 * 🚨 A FILL BEFORE HYDRATION IS A SILENT NO-OP. The field is server-rendered and accepts
 * nothing until the bundle attaches; the value lands in the DOM, React re-renders from its own
 * empty state, and the field is blank again. The first run of this walk spent 120s waiting for
 * step 2 of a wizard whose step 1 had quietly un-filled itself. So the value is written, read
 * back, and written again until the screen agrees.
 */
async function typeInto(page, selector, value, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    // A REAL KEYSTROKE FIRST. `locator.fill` focuses the field and dispatches the browser's
    // own input event, which is what React's `onChange` listens to; the raw value setter below
    // is the fallback for a field Playwright cannot reach (one covered by an overlay).
    await page
      .locator(selector)
      .fill(value, { timeout: 5000 })
      .catch(() => {});
    const stuck = await page.evaluate(
      ({ selector: s, value: v }) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
        if (el.value !== v) {
          Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return el.value === v;
      },
      { selector, value },
    );
    if (stuck) {
      // One more beat, then confirm React did not re-render it away.
      await page.waitForTimeout(400);
      const held = await page.evaluate((s) => document.querySelector(s)?.value ?? null, selector);
      if (held === value) return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

/* ------------------------------------------------------------------ PROOF 1: the stranger */

/**
 * The form is a one-field-per-step wizard (`1 of 5`) whose real fields carry `id="form-<key>"`.
 * 🚨 THE HONEYPOT IS NOT A FIELD. Every step also renders `#hp-confirm_…` labelled "Leave this
 * field empty" — a bot filler that sweeps `input,textarea` fills it and gets the submission
 * thrown away, which would look exactly like the product losing the row. It is never touched.
 */
async function proofForm(browser) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  const record = { name: "a stranger signs up for a gym class", url: FORM_URL, person: MEMBER, screenshots: [] };

  if (!(await openPublic(page, FORM_URL, record))) {
    record.screenshots.push(await shot(page, "close-form-01-opened"));
    await context.close();
    return record;
  }
  await page.getByRole("button", { name: /^Next$/ }).first().waitFor({ state: "visible", timeout: 240000 });
  record.screenshots.push(await shot(page, "close-form-01-opened"));

  for (const [key, value] of Object.entries(MEMBER)) {
    const field = `#form-${key}`;
    await page.waitForSelector(field, { timeout: 120000 });
    if (!(await typeInto(page, field, value))) {
      throw new Error(`the answer never stayed in ${field} — the field would not take "${value}"`);
    }
    await page.waitForTimeout(400);
    const last = key === "notes";
    if (last) {
      record.beforeSubmitText = await text(page);
      record.screenshots.push(await shot(page, "close-form-02-before-submit"));
      break;
    }
    await page.getByRole("button", { name: /^Next$/ }).first().click();
    await page.waitForTimeout(1200);
  }

  // A DISABLED SUBMIT IS A FINDING, NOT A TIMEOUT. The runner disables it while any REQUIRED
  // question is still empty in its own state, so if it is disabled the walk says which answers
  // the form thinks it is missing — a 30s "element is not enabled" log says nothing.
  const submitButton = page.getByRole("button", { name: /^Submit$/ }).first();
  if (await submitButton.isDisabled().catch(() => false)) {
    record.submitDisabled = true;
    record.answersTheFormStillHolds = await page.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll("input[id^='form-'], textarea[id^='form-']")).map((el) => [
          el.id,
          el.value,
        ]),
      ),
    );
    record.pass = false;
    record.failure = "the form's Submit stayed disabled — it still considers a required answer empty";
    record.screenshots.push(await shot(page, "close-form-03-submit-disabled"));
    await context.close();
    return record;
  }

  const submit = async () => {
    await submitButton.click();
    await page.waitForTimeout(9000);
    return text(page);
  };
  let after = await submit();
  if (CONTENTION.test(after)) {
    record.contention = `the store did not answer in time on the first submit: ${after.slice(0, 400)}`;
    console.warn("[close] CONTENTION on submit — waiting 60s and trying once more");
    await page.waitForTimeout(60000);
    await page.goto(FORM_URL, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForTimeout(6000);
    for (const [key, value] of Object.entries(MEMBER)) {
      await page.waitForSelector(`#form-${key}`, { timeout: 120000 });
      await typeInto(page, `#form-${key}`, value);
      await page.waitForTimeout(300);
      if (key !== "notes") {
        await page.getByRole("button", { name: /^Next$/ }).first().click();
        await page.waitForTimeout(1200);
      }
    }
    after = await submit();
  }

  record.confirmationText = after;
  record.screenshots.push(await shot(page, "close-form-03-confirmation"));
  record.contentionOnFinalAttempt = CONTENTION.test(after);
  // The screen's own claim, nothing more. Whether a row exists is a database question.
  record.pass = !record.contentionOnFinalAttempt && /thank|received|submitted|got it|we'll|we will/i.test(after);
  record.databaseCheckOwed =
    "A row check in the members table is still owed — this proof only reports what the screen said.";
  await context.close();
  return record;
}

/* ------------------------------------------------------------- PROOF 2: the service call */

async function proofBooking(browser) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
  const page = await context.newPage();
  const record = { name: "a customer books a service call", url: BOOKING_URL, person: DRIVER, screenshots: [] };

  if (!(await openPublic(page, BOOKING_URL, record))) {
    record.screenshots.push(await shot(page, "close-booking-01-slots"));
    await context.close();
    return record;
  }
  await page.waitForSelector("button:has-text('PM'), button:has-text('AM')", { timeout: 240000 });
  await page.waitForTimeout(2000);
  record.slotListText = await text(page);
  record.screenshots.push(await shot(page, "close-booking-01-slots"));
  if (CONTENTION.test(record.slotListText)) {
    record.contention = "the slot list itself came back as a store timeout";
  }

  // Take the first slot the page offers, the way a person picks the soonest one.
  const slot = page.locator("button", { hasText: /^\d{1,2}:\d{2} (AM|PM)$/ }).first();
  record.slotChosen = (await slot.textContent())?.trim() ?? null;
  await slot.click();
  await page.waitForTimeout(3000);
  record.heldText = await text(page);

  // 🚨 THE LAST INPUT HAS NO LABEL — it is the booking page's honeypot. Fields are matched to
  // their label by document order and anything unlabelled is left alone.
  const filled = await page.evaluate((values) => {
    const nodes = Array.from(document.querySelectorAll("label, input, textarea")).filter(
      (e) => e.getClientRects().length,
    );
    const setValue = (el, v) => {
      const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const done = [];
    for (let i = 0; i < nodes.length; i += 1) {
      if (nodes[i].tagName !== "LABEL") continue;
      const label = (nodes[i].textContent || "").trim();
      const field = nodes[i + 1];
      if (!field || field.tagName === "LABEL") continue;
      if (!(label in values)) continue;
      setValue(field, values[label]);
      done.push(label);
    }
    return done;
  }, DRIVER);
  record.fieldsFilled = filled;
  const missing = Object.keys(DRIVER).filter((k) => !filled.includes(k));
  if (missing.length) record.fieldsNotFound = missing;
  await page.waitForTimeout(600);
  record.screenshots.push(await shot(page, "close-booking-02-before-booking"));

  const book = async () => {
    await page.getByRole("button", { name: /^Book it$/ }).first().click();
    await page.waitForTimeout(9000);
    return text(page);
  };
  let after = await book();
  if (CONTENTION.test(after)) {
    record.contention = `the store did not answer in time on the first booking: ${after.slice(0, 400)}`;
    console.warn("[close] CONTENTION on booking — waiting 60s and trying once more");
    await page.waitForTimeout(60000);
    after = await book().catch(async (error) => `could not press Book it again: ${String(error)}`);
  }

  record.confirmationText = after;
  record.screenshots.push(await shot(page, "close-booking-03-confirmation"));
  record.contentionOnFinalAttempt = CONTENTION.test(after);
  record.pass = !record.contentionOnFinalAttempt && /booked|confirmed|you're all set|see you|thank/i.test(after);
  record.databaseCheckOwed =
    "A row check in the Service Calls table and its holds table is still owed — this proof only reports what the screen said.";
  await context.close();
  return record;
}

/* ----------------------------------------------------- PROOF 3: the door refuses a viewer */

async function proofRefusal(browser) {
  const password = process.env.TEST_USER_PASSWORD ?? "Password1234#";
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  const page = await context.newPage();
  const record = { name: "the door refuses a viewer, in words, and creates nothing", screenshots: [] };

  record.signedInAs = await signIn(page, VIEWER_ORIGIN, "test@test.com", password);
  if (record.signedInAs !== "test@test.com") {
    throw new Error(`this proof must run as test@test.com — the app says ${record.signedInAs}`);
  }

  // The platform never picks an organization for anyone: pick one the viewer belongs to.
  await page.goto(`${VIEWER_ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(12000);
  const picked = await page.evaluate((wanted) => {
    const row = Array.from(document.querySelectorAll("button[role=option]"))
      .filter((e) => e.getClientRects().length)
      .find((e) => (e.textContent || "").includes(wanted));
    if (!row) return false;
    row.scrollIntoView({ block: "center" });
    row.click();
    return true;
  }, VIEWER_ORG);
  if (!picked) throw new Error(`the picker offered the viewer no row for ${VIEWER_ORG}`);
  record.organization = VIEWER_ORG;
  await page.waitForTimeout(12000);

  await page.goto(`${VIEWER_ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(12000);
  record.screenshots.push(await shot(page, "close-refusal-01-viewer-data"));
  // 🚨 THE CARD IS A `<button>` INSIDE AN `<li>`, and `querySelectorAll` answers in DOCUMENT
  // order, not selector order — so a query listing `li` alongside `button` hands back the LI
  // first, and a click on the LI never reaches React's handler on the button. The first run of
  // this walk "clicked" the table and stayed on /data-v2. Only the button is clicked.
  const opened = await page.evaluate((name) => {
    const card = Array.from(document.querySelectorAll("a[href], button, [role=button]"))
      .filter((e) => e.getClientRects().length)
      .find((e) => (e.textContent || "").trim().startsWith(name) && (e.textContent || "").length < 120);
    if (!card) return false;
    card.scrollIntoView({ block: "center" });
    card.click();
    return true;
  }, VIEWER_TABLE);
  if (!opened) throw new Error(`the viewer's Data page showed no "${VIEWER_TABLE}" table to open`);
  await page.waitForTimeout(15000);
  record.tableUrl = page.url();
  record.tableScreenText = await text(page);
  record.screenshots.push(await shot(page, "close-refusal-02-table"));

  // THE BUTTON MAY SIMPLY NOT BE THERE, and that is a reportable outcome, not a failure.
  const formsRail = page.getByRole("button", { name: /^Forms$/ }).first();
  record.formsRailVisible = await formsRail.isVisible().catch(() => false);
  if (!record.formsRailVisible) {
    record.outcome = "the viewer never sees a Forms rail on this table";
    record.whatTheViewerSees = record.tableScreenText;
    record.pass = true;
    await context.close();
    return record;
  }
  await formsRail.click();
  await page.waitForTimeout(4000);
  record.railTextBefore = await text(page);
  record.screenshots.push(await shot(page, "close-refusal-03-forms-rail"));

  const ask = page.getByRole("button", { name: /Ask an agent/i }).first();
  record.askAnAgentVisible = await ask.isVisible().catch(() => false);
  if (!record.askAnAgentVisible) {
    record.outcome = 'the viewer sees the Forms rail but no "Ask an agent" control';
    record.whatTheViewerSees = record.railTextBefore;
    record.pass = true;
    await context.close();
    return record;
  }

  await ask.click();
  await page.waitForTimeout(4000);
  record.afterAskText = await text(page);
  record.screenshots.push(await shot(page, "close-refusal-04-ask-opened"));

  // Ask for the form in a person's words, wherever the composer is.
  const typed = await page.evaluate(() => {
    const box = Array.from(document.querySelectorAll("textarea, input[type=text], [contenteditable=true]")).find(
      (e) => e.getClientRects().length && !e.id.startsWith("hp-"),
    );
    if (!box) return false;
    if (box.isContentEditable) {
      box.focus();
      box.textContent = "make me a signup form";
      box.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return true;
    }
    const proto = box.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(box, "make me a signup form");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  record.askComposerFound = typed;
  if (typed) {
    await page.waitForTimeout(800);
    record.screenshots.push(await shot(page, "close-refusal-05-asked"));
    const send = page
      .getByRole("button", { name: /^(Send|Ask|Build|Create|Generate|Go)$/i })
      .first();
    if (await send.isVisible().catch(() => false)) {
      await send.click();
    } else {
      await page.keyboard.press("Enter");
    }
    // WAIT FOR THE ANSWER, NOT THE CLOCK. The point of this proof is the SENTENCE the product
    // gives someone who lacks the right, and a fixed 20s caught the run mid-"Reasoning…" — a
    // screenshot of a spinner is not a refusal. Poll until the run stops thinking.
    for (let i = 0; i < 60; i += 1) {
      await page.waitForTimeout(5000);
      const body = await text(page);
      if (!/Reasoning…|Thinking…|Ready to run/.test(body)) break;
    }
  }
  record.afterAskingText = await text(page);
  record.screenshots.push(await shot(page, "close-refusal-06-answer"));
  record.contention = CONTENTION.test(record.afterAskingText)
    ? "the store did not answer in time while the ask was in flight — contention, not a product verdict"
    : undefined;

  // NOTHING CREATED: the rail is re-read from a fresh load, so the list is the server's, not a
  // stale client cache. The database check is still the owner's to run.
  await page.goto(record.tableUrl, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.getByRole("button", { name: /^Forms$/ }).first().waitFor({ state: "visible", timeout: 240000 });
  await page.getByRole("button", { name: /^Forms$/ }).first().click();
  await page.waitForTimeout(5000);
  record.railTextAfter = await text(page);
  record.screenshots.push(await shot(page, "close-refusal-07-rail-after"));
  record.railUnchanged = record.railTextBefore === record.railTextAfter;
  record.outcome = "the viewer pressed Ask an agent and asked for a form";
  // THE PRODUCT'S OWN SENTENCE, quoted rather than summarized — this is the evidence.
  record.refusalInWords =
    (record.railTextAfter.match(/[^\n]*needs the admin level[^\n]*/) ?? [null])[0] ??
    (record.afterAskingText.match(/[^\n]*(cannot|can’t|can't|not allowed|do not have|don’t have|permission|admin level)[^\n]*/) ??
      [null])[0];
  record.formsStillNoneAfter = /Forms\nnone yet/.test(record.railTextAfter);
  record.pass = Boolean(record.refusalInWords) && record.railUnchanged;
  record.databaseCheckOwed =
    "A row check for any form created on this table is still owed — this proof reports the rail before and after.";
  await context.close();
  return record;
}

/* ------------------------------------------------------------------------------- the run */

const browser = await chromium.launch({ headless: true });
const steps = [
  ["form", proofForm],
  ["booking", proofBooking],
  ["refusal", proofRefusal],
];
for (const [key, fn] of steps) {
  if (only && only !== key) continue;
  console.log(`\n[close] ── proof: ${key}`);
  try {
    results.proofs[key] = await fn(browser);
  } catch (error) {
    // A failure is a failure, reported with what the screen said, never retried into a pass.
    results.proofs[key] = { name: key, pass: false, failure: String(error?.stack ?? error) };
    console.error(`[close] ${key} FAILED — ${error}`);
  }
}
await browser.close();

// 🚨 A `--only` RUN MUST NOT ERASE THE OTHER TWO PROOFS. The first version rewrote the file
// from scratch, so re-running one proof silently deleted the evidence for the other two — and
// the owner reads this file.
const file = resolve(OUT, "close-walk-results.json");
if (only) {
  try {
    const previous = JSON.parse(readFileSync(file, "utf8"));
    results.proofs = { ...previous.proofs, ...results.proofs };
    results.previousRunAt = previous.ranAt;
  } catch {
    /* no earlier run to keep */
  }
}
writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
console.log(`\n[close] results → ${file}`);
for (const [key, proof] of Object.entries(results.proofs)) {
  console.log(`  ${key}: ${proof.pass ? "PASS (screen)" : "FAIL"}${proof.contention ? " [CONTENTION]" : ""}`);
}
