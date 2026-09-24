// scripts/errors-honest/vault-empty-credential-walk.mjs — LANE ERRORS-HONEST, the Vault seat proof.
//
// THE USE CASE. Pinecrest Records keeps one credential in its organization vault, "Pinecrest
// Records — Bandcamp label login", made before anyone typed the label's username and password into
// it. Alex Hart (test@test.com), a member, opens it from a link. Before the fix the vault's
// empty-read alarm (DD-160) could not tell an empty credential from a read the database filtered,
// so it replaced her whole Pinecrest Records list with "Your vault has 1 item but none of their
// fields or files could be read … report it", and the credential was not shown at all.
//
// CLAUSES (headless Chromium, the real login form, the dev clone):
//   seat              /api/whoami answers test@test.com.
//   no-false-alarm    the list does not carry the "could be read" alarm.
//   empty-listed      the list shows the Bandcamp login, with the sentence that it holds nothing yet.
//   empty-detail      the credential opens and says plainly that nothing is saved in it yet.
//
// Env: EH_ORIGIN (default http://127.0.0.1:3071), EH_EMAIL, EH_PASSWORD (never printed), EH_SHOTS.
// The fixture is production's own row (d6f2bc7a…), copied to the clone; see PROGRESS-ERRORS-HONEST.md.

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.EH_ORIGIN ?? "http://127.0.0.1:3071";
const SHOTS = process.env.EH_SHOTS ?? "shots/errors-honest";
const BANDCAMP = "d6f2bc7a-db1d-484c-a580-77ffbc1b6123";
const NAME = "Pinecrest Records — Bandcamp label login";
const ALARM = /could be read/;
const EMPTY_ROW = /Nothing saved in it yet/;
const EMPTY_DETAIL = /Nothing is saved in this credential yet/;

const results = [];
const pass = (clause, ok, detail) => {
  results.push({ clause, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${clause} — ${detail}`);
};

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const text = () => page.evaluate(() => document.body.innerText);

try {
  const who = await signIn(page, ORIGIN, process.env.EH_EMAIL, process.env.EH_PASSWORD);
  pass("seat", who === "test@test.com", `/api/whoami answered ${who}`);

  await page.goto(`${ORIGIN}/vault/${BANDCAMP}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const { v: settled } = await until(
    "the vault list settles",
    async () => {
      const t = await text();
      if (ALARM.test(t)) return "alarm";
      if (t.includes(NAME) && (EMPTY_ROW.test(t) || EMPTY_DETAIL.test(t) || /No active fields/.test(t))) return "listed";
      return null;
    },
    150000,
  );
  await sleep(2000);
  const t = await text();
  await page.screenshot({ path: `${SHOTS}/vault-pinecrest-${settled ?? "nothing"}.png` });
  pass("no-false-alarm", !ALARM.test(t), ALARM.test(t) ? `the list reads: "${(t.match(/Your vault has[^\n]*/) ?? [""])[0].slice(0, 140)}"` : "no empty-read alarm on the list");
  pass("empty-listed", t.includes(NAME) && EMPTY_ROW.test(t), t.includes(NAME) ? (EMPTY_ROW.test(t) ? `"${NAME}" is listed as "Nothing saved in it yet"` : `"${NAME}" is listed without the sentence`) : `"${NAME}" is not on the screen`);
  pass("empty-detail", EMPTY_DETAIL.test(t), EMPTY_DETAIL.test(t) ? "the credential says nothing is saved in it yet" : "no plain sentence in the credential pane");
} catch (e) {
  pass("walk", false, e?.message ?? String(e));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
