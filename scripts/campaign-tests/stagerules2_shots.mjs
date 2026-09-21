/**
 * THE FOUR PICTURES, on the Birchwood Avenue renovation's real Quotes board.
 *
 * Lane STAGE-RULES left none on purpose: the three-outcome board needed a package the app
 * had not published, and a shot captioned "stage rules" showing a board without them is the
 * one lie a screenshot exists to prevent. This takes them, plus the settings screen that
 * lane could not take because it did not exist.
 *
 *   node scripts/campaign-tests/stagerules2_shots.mjs --port 3000 --out <dir>
 *
 * HEADLESS, on its own host, signed in through the nonce handshake with the identity
 * ASSERTED rather than assumed. It touches ONLY org 1a7fefc6 (Birchwood Avenue Renovation,
 * slug `home-renovation`).
 *
 * IT REFUSES TO PHOTOGRAPH THE WRONG SCREEN. Every step checks what is actually on the page
 * and stops with a sentence when it is not there: two organizations on this account are
 * called "Birchwood Avenue Renovation", the board is a VIEW and not a toolbar button, and an
 * app running an older copy of the package would draw a board with none of this in it.
 * Earlier runs of this file ended at "the organization picker would not take a click" and
 * "this bundle predates records-ui 0.50.0", which is the walk working.
 *
 * WHAT IT WRITES. Warn mode is an ORGANIZATION setting, so shot 4 turns
 * `custom/stage_rule_enforcement` to `warn`, takes the picture, and turns it back to
 * `refuse` in a `finally` — whatever happened. The card it moves under warn is moved back.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);

const PORT = arg("--port", "3000");
const HOST = arg("--host", "stagerules2.localhost");
const OUT = arg("--out", resolve(ROOT, "tmp/stagerules2-shots"));
const ORIGIN = `http://${HOST}:${PORT}`;

const ORG = "1a7fefc6-77e1-4c48-826f-003b1a2e17fd";
const ORG_SLUG = "home-renovation";
const QUOTES = "0e108f31-5078-48ec-9a15-b492baa414ba";
const TABLE_URL = `/data-v2/${QUOTES}`;
/**
 * The card every one of these pictures is about: Ferro & Sons' $11,400 bid, the only bid on
 * the Primary Bedroom. The board titles a card by the Table's `title_field`, which on this
 * table is the ROOM the quote is for — so "Primary Bedroom" is what is written on the card,
 * and it is the only one.
 */
const THE_BID = "Primary Bedroom";
/**
 * And the card her SECOND rule is about: Ferro & Sons' $58,000 basement finish, already in
 * Approved because it has other bids beside it on the same room. Marking it Paid is over
 * $10,000, so it asks for sign-off instead of being turned away.
 */
const THE_BIG_ONE = "Basement";

mkdirSync(OUT, { recursive: true });
const notes = [];
const note = (what, said) => {
  notes.push(`${what}: ${said}`);
  console.log(`[stagerules2] ${what}: ${said}`);
};
const stop = (why) => {
  throw new Error(why);
};

/** The organization's own switch, set the way an operator sets it. SELECT-only otherwise. */
function knob(value) {
  // `scope_kind`, not `scope`, and the primary key carries the organization too — the
  // first version of this line named a column that is not there, which is why shot 4 was
  // missing from the first complete run of this walk.
  const sql =
    value === null
      ? `delete from platform.knob_override where feature='custom' and key='stage_rule_enforcement' and organization_id='${ORG}';`
      : `insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
         values ('custom','stage_rule_enforcement','organization','${ORG}','${ORG}', to_jsonb('${value}'::text),
                 'lane STAGE-RULES-2, for one screenshot; set back to refuse in the same run')
         on conflict (feature, key, scope_kind, scope_id, organization_id)
           do update set value = excluded.value, set_note = excluded.set_note, updated_at = now();`;
  execFileSync(resolve(ROOT, "binlocal/p.sh"), ["-q", "-c", sql], { stdio: "pipe" });
  return value;
}

async function shot(page, name) {
  const file = resolve(OUT, `stage-rules-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`[stagerules2] ${file}`);
}

/** A real HTML5 drag, fired from the card's own handler onto the column's own handler. */
async function dragCardTo(page, cardText, stageLabel) {
  return page.evaluate(
    ({ cardText, stageLabel }) => {
      const cards = Array.from(document.querySelectorAll('[draggable="true"]'));
      const card = cards.find((c) => (c.textContent || "").includes(cardText));
      if (!card) return { ok: false, why: `no draggable card carrying "${cardText}"` };
      const columns = Array.from(document.querySelectorAll("section")).filter((s) => {
        const head = s.querySelector("header");
        return head && (head.textContent || "").trim().startsWith(stageLabel);
      });
      const column = columns[0];
      if (!column) return { ok: false, why: `no board column headed "${stageLabel}"` };
      const dt = new DataTransfer();
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
      column.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      column.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      card.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
      return { ok: true, why: `${cardText} -> ${stageLabel}` };
    },
    { cardText, stageLabel },
  );
}

/** The board, grouped by the pipeline's own stage column and not by whatever it opens on. */
async function openTheBoard(page) {
  await page.goto(`${ORIGIN}${TABLE_URL}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(9000);
  const kanban = page.getByRole("button", { name: "Kanban", exact: true }).first();
  if (await kanban.count()) {
    await kanban.click({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  // "Group by" is a SELECT, and it opens on `status` — the old ungoverned column this table
  // had before it was a pipeline. A picture of that is a picture of no rules at all.
  const groupBy = page.locator("select").filter({ hasText: "Quote stage" }).first();
  if (await groupBy.count()) {
    await groupBy.selectOption({ label: "Quote stage" }).catch((e) => note("group by", String(e).slice(0, 120)));
    await page.waitForTimeout(9000);
  } else {
    note("group by", "no select offering Quote stage");
  }
  // The cards arrive after the columns do; a shot taken now is a shot of "Loading…".
  await page.waitForFunction(() => !document.body.innerText.includes("Loading…"), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const body = await page.evaluate(() => document.body.innerText).catch(() => "");
  if (!/Requested/.test(body) || !/Approved/.test(body)) {
    await shot(page, "x-board-did-not-draw");
    stop(`the board did not draw the pipeline's stages — it says: ${body.replace(/\s+/g, " ").slice(0, 300)}`);
  }
  return body;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent("/data-v2")}`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  if (!/^admin@admin\.com$/i.test(who?.email ?? "")) {
    stop(`signed in as ${who?.email ?? "nobody"} — every campaign walk runs as admin@admin.com`);
  }
  note("signed in as", who.email);

  // THE ORGANIZATION, BY SLUG. Two are called "Birchwood Avenue Renovation"; clicking the
  // wrong one gives a picture of somebody else's empty board that looks like a working one.
  await page.waitForTimeout(5000);
  const row = page.getByRole("option").filter({ hasText: ORG_SLUG }).last();
  if (!(await row.count())) stop(`no organization row carrying the slug ${ORG_SLUG}`);
  await row.click({ timeout: 20000 });
  await page.waitForTimeout(6000);
  if (await page.evaluate(() => document.body.innerText.includes("No organization selected"))) {
    stop("the organization picker would not take a click");
  }
  note("organization", ORG_SLUG);

  // ══ 1 — THE EDITOR, with both of her rules ══════════════════════════════════════════
  await page.goto(`${ORIGIN}${TABLE_URL}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(9000);
  const settings = page.getByRole("button", { name: "Settings", exact: true }).first();
  if (!(await settings.count())) stop("no Settings button on the table toolbar");
  await settings.click({ timeout: 20000 });
  await page.waitForTimeout(6000);
  if (!(await page.evaluate(() => document.body.innerText.includes("Rules for entering")))) {
    await shot(page, "x-settings-rail-without-the-section");
    stop("the settings rail has no 'Rules for entering' section — this app is running a records-ui older than 0.50.0");
  }
  await page.getByText("Rules for entering", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  // IT OPENS ON THE FIRST STAGE, and her rules are on Approved and on Paid. A shot of
  // Requested saying "Nothing has to be true to get here yet" is TRUE and is not the
  // picture — Requested really has no rules.
  const stageSelect = page.locator('select[aria-label="Stage"]').first();
  if (!(await stageSelect.count())) stop("the section has no stage picker");
  await stageSelect.selectOption({ label: "Approved" });
  await page.waitForTimeout(4000);
  const approvedText = await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("Rules for entering");
    return t.slice(i, i + 300).replace(/\s+/g, " ");
  });
  note("the Approved rule on screen", approvedText);
  if (!/Nothing over \$5,000/.test(approvedText)) {
    await shot(page, "x-approved-rule-not-listed");
    stop("the Approved stage does not list her $5,000 rule");
  }
  await shot(page, "1a-rules-for-entering-approved");
  // ...and the one on Paid, which asks somebody instead of turning the card away.
  await stageSelect.selectOption({ label: "Paid" });
  await page.waitForTimeout(4000);
  note("the Paid rule on screen", await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("Rules for entering");
    return t.slice(i, i + 300).replace(/\s+/g, " ");
  }));
  await shot(page, "1c-rules-for-entering-paid-asks-for-approval");
  await stageSelect.selectOption({ label: "Approved" });
  await page.waitForTimeout(3000);

  // ...open it, so the condition and the live count are on screen.
  const edit = page.getByRole("button", { name: "Edit", exact: true }).last();
  if (await edit.count()) {
    await edit.click({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(6000);
  }
  const preview = await page
    .locator('[data-testid="stage-rule-preview"]')
    .first()
    .textContent()
    .catch(() => null);
  note("the live preview says", preview ?? "(nothing on screen)");
  // The demand is a `sibling_count`, which the one-clause builder cannot draw. It has to be
  // SAID rather than shown as an empty picker — the first complete run of this walk caught
  // it drawing "— pick a column —" beside a live Save button.
  const inWords = await page
    .locator('[data-testid="stage-rule-clause-in-words"]')
    .first()
    .textContent()
    .catch(() => null);
  note("the demand it cannot draw is said as", inWords ?? "(NOT SAID — it is drawn as an empty picker)");
  if (!inWords) {
    await shot(page, "x-demand-drawn-as-an-empty-picker");
    stop("the demand this builder cannot draw is still rendered as an empty picker — this app predates records-ui 0.56.0");
  }
  await shot(page, "1b-the-5000-rule-open-with-its-live-count");

  // ══ 2 — THE REFUSED DRAG, and its sentence ═════════════════════════════════════════
  await openTheBoard(page);
  await shot(page, "2a-the-quotes-board");
  const dragged = await dragCardTo(page, THE_BID, "Approved");
  note("drag to Approved", dragged.why);
  if (!dragged.ok) stop(dragged.why);
  await page.waitForTimeout(6000);
  const refusal = await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("Nothing over $5,000");
    return i < 0 ? null : t.slice(i, i + 140).replace(/\s+/g, " ");
  });
  note("the board says", refusal ?? "(the refusal sentence is NOT on screen)");
  await shot(page, "2b-refused-with-the-sentence");
  if (!refusal) stop("the drag was not refused on screen");

  // ══ 3 — THE CARD THAT IS WAITING FOR SOMEBODY ══════════════════════════════════════
  // Her second rule: anything over $10,000 needs sign-off before it is marked Paid. It does
  // not turn the card away — it asks — and FILING IS HER DECISION, so the button is pressed.
  // The card is the basement, which is in Approved and is the one she is about to pay; the
  // Primary Bedroom bid cannot be used here because it is still in Received and the board's
  // own "where a quote can go next" rule stops that move first, which is correct and is a
  // different picture.
  await openTheBoard(page);
  const toPaid = await dragCardTo(page, THE_BIG_ONE, "Paid");
  note("drag to Paid", toPaid.why);
  if (!toPaid.ok) stop(toPaid.why);
  await page.waitForTimeout(6000);
  await shot(page, "3a-it-asks-before-it-files");
  const ask = page.getByRole("button", { name: "Ask for approval", exact: true }).first();
  if (!(await ask.count())) {
    note("ask", "no 'Ask for approval' button — the gate did not come back as an approval");
    stop("the approval gate did not offer to file");
  }
  await ask.click({ timeout: 20000 });
  await page.waitForTimeout(8000);
  await shot(page, "3b-filed-and-the-card-stayed-put");
  const waiting = await page
    .locator('[data-testid="pipeline-card-waiting"]')
    .first()
    .textContent()
    .catch(() => null);
  note("the card now carries", waiting ?? "(no waiting badge)");
  // ...and it survives a reload, which is the whole point of asking the board once.
  await openTheBoard(page);
  const waitingAfter = await page
    .locator('[data-testid="pipeline-card-waiting"]')
    .first()
    .textContent()
    .catch(() => null);
  note("after a reload it still says", waitingAfter ?? "(nothing — the badge did not survive)");
  await shot(page, "3c-waiting-to-move-to-paid-after-a-reload");

  // ══ 4 — WARN MODE, AND BACK ════════════════════════════════════════════════════════
  try {
    note("organization switch", `custom/stage_rule_enforcement = ${knob("warn")}`);
    await openTheBoard(page);
    const warned = await dragCardTo(page, THE_BID, "Approved");
    note("drag to Approved under warn", warned.why);
    await page.waitForTimeout(7000);
    await shot(page, "4a-warned-it-went-through-and-said-so");
    const onScreen = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ")).catch(() => "");
    note("under warn the board says", /Nothing over \$5,000/.test(onScreen) ? "the sentence is on screen" : "the sentence is NOT on screen");
    note("and the card moved", /Approved 1|Approved 2|Approved 3/.test(onScreen) ? "Approved holds more than it did" : "(count unchanged — check the shot)");
    // Put her board back: the card returns to Received.
    await openTheBoard(page);
    const back = await dragCardTo(page, THE_BID, "Received");
    note("moved back to Received", back.why);
    await page.waitForTimeout(6000);
  } finally {
    // Put it back the way it was: this organization held NO override at all, and the
    // store's own default is refuse. Writing "refuse" would leave a row behind that says
    // somebody decided this, which is not true.
    knob(null);
    note("organization switch restored", `custom/stage_rule_enforcement = ${execFileSync(resolve(ROOT, "binlocal/p.sh"), ["-At", "-c", `select custom.stage_rule_enforcement('${ORG}'::uuid);`]).toString().trim()} (override removed)`);
  }

  await openTheBoard(page);
  await shot(page, "4b-and-back-to-stopping-you");

  writeFileSync(resolve(OUT, "stage-rules-walk.txt"), notes.join("\n") + "\n");
  await browser.close();
}

main().catch((error) => {
  console.error(`[stagerules2] STOPPED: ${error?.message ?? error}`);
  writeFileSync(resolve(OUT, "stage-rules-walk.txt"), notes.concat([`STOPPED: ${error?.message ?? error}`]).join("\n") + "\n");
  process.exitCode = 1;
});
