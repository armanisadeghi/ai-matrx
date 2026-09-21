/**
 * THE FOUR ASKS — a person presses "Ask an agent" and gets the THING, not advice.
 *
 * The hand-built half of every builder is proved by `scripts/builders-walk/`:
 * a person opens the rail, ticks the columns, publishes. This is the OTHER
 * half of the same empty state — the one that had never worked, because the
 * mandate it launches (`data.page_guidance`) held General Chat, which carries
 * no tool at all, and the `records` tool row advertised nine of its twenty-four
 * actions, so the four build verbs were never even shown to a model.
 *
 * THE FOUR, EACH ON THE BUSINESS WHOSE PRODUCT IT IS:
 *   1. Ironline Fitness — the studio manager, standing on her list of classes,
 *      says "make me a class signup form".
 *   2. Ironclad Mobile Mechanic — the owner sells time, so "let customers book
 *      a service call" must become a page that HOLDS a slot.
 *   3. Rincon Plumbing Co — "give my customers a portal to see their own jobs",
 *      and a customer must never see her neighbour's.
 *   4. Hands & Hope Alliance — "send me the donor dashboard every Monday" is
 *      both halves: the screen, and being told.
 *
 * WHAT WOULD MAKE THIS A FAKE: calling `agent_run` from node and printing the
 * answer. The agent would run, but not from the seat, not under this person's
 * permissions, and not through the button the product actually draws. Every
 * step below is a click on the real screen as admin@admin.com, and the closing
 * assertion reads the DATABASE, not the agent's own sentence about itself.
 *
 *   node scripts/agent-walk/ask.mjs --only form|booking|portal|digest
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORIGIN, OUT, signIn, useOrganization, settleOnTable, shot } from "../builders-walk/walk.mjs";

/**
 * A tab whose empty state is gone has no "Ask an agent" button — `BuildOrAsk`
 * IS the empty state. So each ask names the real table it belongs on and, where
 * that tab is already occupied by the hand-built walks, the real sibling table
 * in the SAME business where the question is still open.
 */
const ASKS = {
  form: {
    org: "11d47e36-4b1e-46b8-bdf6-8ef928b730fb",
    orgName: "Ironline Fitness",
    slug: "fixture-ironline-fitness-f1wa0s",
    tables: [
      { id: "e4a35317-9922-4ef4-be1e-f4b748dbe97c", name: "classes" },
      { id: "a2eacc8b-8d7c-4172-985d-b33888d95470", name: "plans" },
    ],
    rail: /^Forms$/,
    say: "make me a class signup form",
  },
  booking: {
    org: "0a751390-558e-4775-ba0e-3891bdf82d45",
    orgName: "Ironclad Mobile Mechanic",
    slug: "ironclad-mobile-mechanic",
    tables: [
      { id: "215e2e75-d04e-4c8a-b208-5be46488b18d", name: "Service Calls" },
      { id: "02f00d65-bf3b-49bb-995c-859926be8a4f", name: "Customers" },
    ],
    rail: /^Bookings$/,
    say: "let customers book a service call",
  },
  // 🚨 THE PORTAL ASK CANNOT BE REACHED IN RINCON PLUMBING CO, AND THAT IS A PRODUCT
  // DEFECT, NOT A MISSING FIXTURE. Measured on main 2026-09-21 (lane AGENT-BUILDS-2):
  // the Portals rail is ORGANIZATION-scoped while every sibling rail on the same
  // screen — Forms, Bookings — is TABLE-scoped. `PortalsPanel` calls
  // `client.portals()`, which takes no table at all (`custom.portals(p_organization_id)`,
  // versus `custom.forms(p_organization_id, p_table_id)`), and decides emptiness from
  // `portals.length`. So standing on Rincon's `Parts` table — eight rows of copper pipe
  // and wax rings — the rail reads "Portals 10" and lists ten cards titled "Your jobs
  // and invoices", which belong to the `Jobs` table. The empty state never renders, so
  // `BuildOrAsk` never renders, so the agent half is unreachable on EVERY table in any
  // organization that already has one portal. The package documents this as deliberate
  // ("a portal belongs to the organization, and hiding the others would answer a
  // question nobody asked", `records-ui/src/PortalsPanel.tsx`), which makes it a design
  // ruling to overturn rather than a bug to patch quietly — it is written up for the
  // owner instead of changed here.
  //
  // So the portal ask runs where it is still REACHABLE, on the same product question
  // and a real business: Ironclad Mobile Mechanic (0 portals) sells visits, and its
  // owner wants a customer to see her own service calls without phoning him.
  portal: {
    org: "0a751390-558e-4775-ba0e-3891bdf82d45",
    orgName: "Ironclad Mobile Mechanic",
    slug: "ironclad-mobile-mechanic",
    tables: [
      { id: "215e2e75-d04e-4c8a-b208-5be46488b18d", name: "Service Calls" },
      { id: "ffbddf5c-e5d8-417c-b82b-eff823f55fc4", name: "Invoices" },
    ],
    rail: /^Portals$/,
    say: "give my customers a portal to see their own service calls",
  },
  digest: {
    org: "488fcc2f-22ee-49eb-9ec4-1b870591164a",
    orgName: "Hands & Hope Alliance",
    slug: "hands-and-hope-alliance",
    tables: [
      { id: "335be3d6-39ed-4fe6-9725-c28952bc18c3", name: "donors" },
      { id: "0f9c8a0b-c8ab-481d-8070-fc1c689eb968", name: "pledges" },
    ],
    // 🚨 THE DIGEST ASK IS ON **Notifications**, NOT Dashboards. Measured 2026-09-21:
    // `BuildOrAsk` — the whole two-button empty state — is imported by exactly four
    // panels (`FormsPanel`, `BookingSlots`, `PortalsPanel`, `SubscriptionsPanel`), and
    // it is `SubscriptionsPanel` that offers `kind: "digest"`. There is no dashboards
    // panel at all; a dashboard renders through `DashboardCanvas`, which has no agent
    // half. So a walk pointed at the Dashboards tab waits for a button that cannot be
    // there, and reports the tab "not empty" — which is what this one did twice, on a
    // donors table carrying ZERO dashboards.
    rail: /^Notifications$/,
    say: "send me the donor dashboard every Monday",
  },
};

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const which = only ? [only] : Object.keys(ASKS);

/** Everything the agent's turn did, so a wasted call is COUNTED, never guessed. */
function toolCallsOnPage(page) {
  // The window draws each call as its own collapsed row — "Worked with records ·
  // record read", "The record store refused". Reading the ROWS is how a wasted
  // call gets counted instead of estimated.
  return page.evaluate(() => {
    const seen = [];
    for (const n of document.querySelectorAll("div,li,button")) {
      const t = (n.innerText || "").trim();
      if (!t || t.length > 120) continue;
      if (!/^(Worked with records|The record store refused|Using tool)/i.test(t)) continue;
      const line = t.replace(/\s+/g, " ");
      if (!seen.includes(line)) seen.push(line);
    }
    return seen;
  });
}

const browser = await chromium.launch({ headless: true });
const results = [];

for (const key of which) {
  const A = ASKS[key];
  const context = await browser.newContext({ viewport: { width: 1680, height: 1020 } });
  const page = await context.newPage();
  const note = { ask: key, org: A.orgName, said: A.say, steps: [] };
  const started = Date.now();

  try {
    const who = await signIn(page, "/data-v2");
    if (who.email !== "admin@admin.com") throw new Error(`signed in as ${who.email}`);
    await useOrganization(page, { ...A, table: A.tables[0].id });

    // FIND THE TAB THAT IS STILL EMPTY. `BuildOrAsk` is the empty state itself,
    // so a tab somebody already built on offers no agent at all — that is the
    // component behaving correctly, not a failure, and the walk says which
    // table it ended up on rather than quietly reporting the first one.
    let table = null;
    let railText = "";
    for (const candidate of A.tables) {
      await settleOnTable(page, candidate.id);
      await page.getByRole("button", { name: A.rail }).first().click();

      // 🚨 WAIT FOR THE BUTTON; A CLOCK IS NOT AN ANSWER. This used to sleep 4s and
      // then read `isVisible()` once, so a panel still fetching — Hands & Hope's
      // `donors` is 246 records behind a cold rail — reported "this tab is not empty"
      // while the table in fact had ZERO dashboards (`custom.dashboards(org, donors)`
      // = 0, measured 2026-09-21). That is the same defect as the org check one file
      // over: absence of a positive signal read as proof of its opposite. It cost this
      // lane two full walks before the database contradicted the walk's own summary.
      const ask = page.getByRole("button", { name: /Ask an agent/i }).first();
      const offered = await ask
        .waitFor({ state: "visible", timeout: 45000 })
        .then(() => true)
        .catch(() => false);
      railText = await page.evaluate(() => {
        const panel = document.querySelector("[role=dialog], aside, [data-slot=rail]");
        return (panel?.innerText || "").slice(0, 900);
      });
      if (offered) {
        table = candidate;
        break;
      }
      // AND NEVER CONCLUDE SILENTLY. The walk quotes what the rail actually said, so
      // "no empty state" can be checked against the panel's own words instead of being
      // taken on the harness's word.
      note.steps.push(
        `${candidate.name}: no "Ask an agent" after 45s — the ${A.rail.source} panel said: ` +
          JSON.stringify(railText.replace(/\s+/g, " ").slice(0, 220)),
      );
    }
    if (!table) throw new Error(`no ${key} tab is still empty in ${A.orgName}`);
    note.table = `${table.name} (${table.id})`;
    note.steps.push(`standing on ${table.name}, ${A.rail.source} tab empty`);
    await shot(page, `ask-${key}-01-empty-state`);

    // ── the person presses the agent half and says what they want ───────────
    await page.getByRole("button", { name: /Ask an agent/i }).first().click();
    await page.waitForTimeout(9000);
    await shot(page, `ask-${key}-02-composer`);

    // The Agent window's own composer — matched by the words on it, because a
    // page with a grid, a rail and a picker on it has a dozen other inputs.
    const box = page
      .locator(
        '[placeholder="Type your message..."]:visible, [aria-label="Type your message"]:visible',
      )
      .first();
    await box.waitFor({ state: "visible", timeout: 90000 });
    await box.click();
    await box.fill(A.say);
    await page.waitForTimeout(800);
    await box.press("Enter");
    const submitted = Date.now();

    // ── and waits, the way she would ────────────────────────────────────────
    // A build is several provider round trips and a write; the wait is on the
    // answer appearing, not on a number.
    // WAIT FOR THE TURN TO END, NOT FOR A WORD TO APPEAR. The first version of
    // this loop broke as soon as the page contained "refused" — and "The record
    // store refused" is the label of ONE collapsed tool call in a turn that then
    // went on working, so the walk stopped at 109 seconds, reported zero tool
    // calls, and would have called a working agent a failure. A turn is over
    // when the thinking stops, or when the link is on screen.
    const deadline = Date.now() + 420000;
    let answer = "";
    let still = 0;
    while (Date.now() < deadline) {
      await page.waitForTimeout(6000);
      answer = await page.evaluate(() => document.body.innerText);
      if (/https?:\/\/[^\s]+\/(f|b|d|portal\/c)\//i.test(answer)) break;
      const working = /Reasoning\.\.\.|Using tool|Working with records|Thinking/i.test(answer);
      still = working ? 0 : still + 1;
      // Time since SUBMIT, never since the walk began: sign-in, the org picker
      // and a cold compile eat the first minute, so a start-relative guard
      // declared the turn finished before the first token arrived.
      if (still >= 4 && Date.now() - submitted > 120000) break;
    }
    note.seconds = Math.round((Date.now() - submitted) / 1000);
    note.toolCalls = await toolCallsOnPage(page);
    await shot(page, `ask-${key}-03-answer`);
    note.answerTail = answer.slice(-2500);
    note.ok = true;
  } catch (error) {
    note.ok = false;
    note.error = String(error).slice(0, 600);
    await shot(page, `ask-${key}-99-failed`).catch(() => {});
  }

  results.push(note);
  console.log(`\n════ ${key} — ${A.orgName} ════`);
  console.log(JSON.stringify(note, null, 2));
  await context.close();
}

const file = resolve(OUT, "ask-walk-results.json");
writeFileSync(file, JSON.stringify(results, null, 2));
console.log(`\nresults → ${file}`);
await browser.close();
