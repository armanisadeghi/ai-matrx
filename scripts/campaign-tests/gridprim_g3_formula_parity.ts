/**
 * LANE GRID-PRIMITIVES, G3 — FORMULA PARITY: THE OLDER GRID'S EVALUATOR AND THE STORE, SAME ROWS.
 *
 * THE USE CASE (scripts/campaign-tests/_gridprim_clinic.sql). Marisol Vega runs the front desk
 * at Cedar Ridge Veterinary Clinic. Her Appointments day sheet carries the formula columns a
 * practice actually keeps: the balance due after the deposit, the fee with the 3% card
 * surcharge, "Call owner" on a no-show, the recheck date two weeks out, the
 * last four of the owner's phone for the voicemail script, and so on. Every one of them is
 * worked out TWICE here — by `@ai-matrx/design-system/formulas` (the browser evaluator the
 * /data grid runs today) and by the store (`custom.formula_parse` then `custom.formula_eval`)
 * — over the SAME ten appointments, and every answer must agree: the same value, or both a
 * refusal with the same sentence.
 *
 * It writes nothing that survives: one transaction, the clinic fixture inside it, ROLLBACK.
 *
 * RUN IT:
 *   node node_modules/tsx/dist/cli.mjs scripts/campaign-tests/gridprim_g3_formula_parity.ts --target clone|branch
 *
 * RED FIRST: before gridprim_a_formula_is_typed_and_the_store_works_it_out.sql is applied it
 * fails on its first formula ("function custom.formula_parse(uuid, uuid, text) does not exist").
 *
 * LANE VIEWS-AND-FIELDS F4 — SEVEN MORE OF AIRTABLE'S FUNCTIONS (SWITCH, FIND, SUBSTITUTE,
 * REGEX_MATCH, DATETIME_FORMAT, WORKDAY, ARRAYJOIN). The older grid never had them, so there is
 * no second evaluator to agree with: STORE_ONLY below carries, for each formula, an answer
 * worked out HERE in TypeScript from the same row (Airtable's documented behaviour), or the exact
 * refusal sentence. The day sheet gains one many-choice column, Services, for ARRAYJOIN. RED
 * before viewsfields_f4_a_formula_speaks_seven_more_airtable_functions.sql ("There is no function
 * called `SWITCH`…"), GREEN after.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { evaluateFormula, parseFormula } from "@ai-matrx/kit/formula";
import {
  branchRefOverride,
  cloneRefOverride,
  loadBranchDbEnv,
  loadBranchRef,
  loadCloneDbEnv,
  loadCloneRef,
} from "../lib/migration-target";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The formula columns of the day sheet. Every function and every operator of the language. */
const FORMULAS: string[] = [
  "{Visit fee} - {Deposit taken}",
  "ROUND({Visit fee} * 1.03, 2)",
  'IF({Visit status} = "No-show", "Call owner", "")',
  'IF(AND({Visit fee} >= 300, {Deposit taken} < 100), "Ask for deposit", "OK")',
  'CONCATENATE({Patient}, " — ", {Species})',
  '{Patient} & " (" & {Visit status} & ")"',
  "UPPER(LEFT({Species}, 3))",
  "RIGHT({Owner phone}, 4)",
  "LEN({Desk notes})",
  'CONTAINS({Desk notes}, "NO-SHOW")',
  "ISBLANK({Desk notes})",
  "NOT(ISBLANK({deposit}))",
  "SUM({Visit fee}, {Deposit taken}, 25)",
  "AVERAGE({Visit fee}, {Deposit taken})",
  "MIN({Visit fee}, {Deposit taken})",
  "MAX({Visit fee}, {Deposit taken})",
  "ABS({Deposit taken} - {Visit fee})",
  "{Visit fee} / {Deposit taken}",
  "{Visit fee} % 100",
  "DATEADD({Visit date}, 14, 'days')",
  "DATEADD({Visit date}, 1, 'years')",
  'DATEADD("2026-01-31", 1, "months")',
  "YEAR({Visit date}) * 10000 + MONTH({Visit date}) * 100 + DAY({Visit date})",
  'DATEDIFF({Visit date}, "2026-10-06", \'days\')',
  'DATEDIFF("2026-09-22T08:00:00Z", "2026-09-22T17:30:00Z", "hours")',
  'DATEDIFF("2026-09-22T08:00:00Z", "2026-09-22T17:30:00Z", "minutes")',
  "TODAY()",
  "BLANK()",
  'IF({Visit fee} > 400, "Surgery follow-up")',
  'TRIM("   " & {Patient} & "  ")',
  "LOWER({Visit status})",
  'OR({Species} = "Bird", {Species} = "Rabbit")',
  "{Visit fee} <> 185",
  "{Visit fee} <= 142.5",
  "-{Deposit taken}",
  '{Visit fee} > "100"',
  "{Species} + 1",
  "{Visit fee} = BLANK()",
  "ROUND(-2.5)",
  "ROUND(1.005, 2)",
  '"10" * "3"',
  "{Visit fee} / 3",
  '"$1,250.50" + 0',
  "TRUE = 1",
  '{Visit status} != "Completed"',
  'IF({Visit fee} >= 185, {Visit fee} * 0.9, {Visit fee})',
  "DATEADD({Visit date}, -1, 'months')",
  // the refusals: the same sentence from both
  "{Visit fee} +",
  "SUMM(1)",
  "{Chart number} + 1",
  "LEFT({Patient})",
  "DATEDIFF({Visit date}, {Visit date}, 'weeks')",
  "{Visit fee} * (2",
];

type Val = string | number | boolean | null | Val[];
type Outcome = { ok: true; value: Val } | { ok: false; error: string };

/** The Services each visit carried — a many-choice column added for ARRAYJOIN. */
const SERVICES: Record<string, string[]> = {
  "Biscuit (Hollis)": ["Wellness exam", "Vaccines"],
  "Juniper (Okafor)": ["Wellness exam", "Dental estimate"],
  "Moose (Delgado)": ["Sick visit", "Bloodwork", "X-ray"],
  "Pepper (Lindqvist)": ["Nail trim"],
  "Tango (Fairweather)": ["Nail trim", "Wing clip"],
  "Maple (Ferreira)": ["Recheck"],
};
const SERVICE_OPTIONS = ["Wellness exam", "Vaccines", "Dental estimate", "Sick visit", "Bloodwork", "X-ray", "Nail trim", "Wing clip", "Recheck"];

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const ok = (value: Val): Outcome => ({ ok: true, value });
const no = (error: string): Outcome => ({ ok: false, error });
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const visit = (r: Row): Date => {
  const v = str(r.visit_on);
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
};
/** The language writes a date as it was given: a day stays a day, a moment stays ISO. */
const dateOut = (r: Row, d: Date): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(str(r.visit_on)) ? d.toISOString().slice(0, 10) : d.toISOString();
function workday(start: Date, days: number, holidays: string[]): Date {
  const d = new Date(start.getTime());
  let left = Math.abs(days);
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + Math.sign(days));
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.includes(d.toISOString().slice(0, 10))) left--;
  }
  return d;
}
function nth(text: string, old: string, neu: string, which: number): string {
  let at = -1;
  for (let k = 0; k < which; k++) {
    at = text.indexOf(old, at < 0 ? 0 : at + old.length);
    if (at < 0) return text;
  }
  return text.slice(0, at) + neu + text.slice(at + old.length);
}
const h12 = (d: Date) => (d.getUTCHours() % 12 === 0 ? 12 : d.getUTCHours() % 12);

/**
 * DATETIME_FORMAT, every specifier of Airtable's "Supported format specifiers for DATETIME_FORMAT"
 * (moment.js, English, UTC), written out by hand from that table for three moments:
 *   Tuesday 22 September 2026 17:05:09.123Z — day 265, en week 39 (weeks start Sunday, the week
 *     holding 1 January is week 1), ISO week 39, Q3, unix 1790096709;
 *   Sunday 20 September 2026 00:30:00Z — weekday 0, en week 39 but ISO week 38, k = 24;
 *   Monday 29 December 2025 12:00Z — en and ISO week 1 of week-year 2026.
 */
const TUESDAY = "2026-09-22T17:05:09.123Z";
const SUNDAY = "2026-09-20T00:30:00Z";
const YEAR_END = "2025-12-29T12:00:00Z";
const DATETIME_TOKENS: [string, string, string?][] = [
  ["M", "9"], ["Mo", "9th"], ["MM", "09"], ["MMM", "Sep"], ["MMMM", "September"],
  ["Q", "3"], ["Qo", "3rd"],
  ["D", "22"], ["Do", "22nd"], ["DD", "22"], ["DDD", "265"], ["DDDo", "265th"], ["DDDD", "265"],
  ["d", "2"], ["do", "2nd"], ["dd", "Tu"], ["ddd", "Tue"], ["dddd", "Tuesday"], ["e", "2"], ["E", "2"],
  ["w", "39"], ["wo", "39th"], ["ww", "39"], ["W", "39"], ["Wo", "39th"], ["WW", "39"],
  ["YY", "26"], ["YYYY", "2026"], ["gg", "26"], ["gggg", "2026"], ["GG", "26"], ["GGGG", "2026"],
  ["A", "PM"], ["a", "pm"], ["H", "17"], ["HH", "17"], ["h", "5"], ["hh", "05"], ["k", "17"], ["kk", "17"],
  ["m", "5"], ["mm", "05"], ["s", "9"], ["ss", "09"],
  ["S", "1"], ["SS", "12"], ["SSS", "123"], ["SSSS", "1230"], ["SSSSSSSSS", "123000000"],
  ["Z", "+00:00"], ["ZZ", "+0000"], ["X", "1790096709"], ["x", "1790096709123"],
  ["LT", "5:05 PM"], ["LTS", "5:05:09 PM"], ["L", "09/22/2026"], ["l", "9/22/2026"],
  ["LL", "September 22, 2026"], ["ll", "Sep 22, 2026"],
  ["LLL", "September 22, 2026 5:05 PM"], ["lll", "Sep 22, 2026 5:05 PM"],
  ["LLLL", "Tuesday, September 22, 2026 5:05 PM"], ["llll", "Tue, Sep 22, 2026 5:05 PM"],
  // the shapes the verifier caught, and the escapes
  ["h:m:s", "5:5:9"], ["DDDD [of the year]", "265 of the year"], ["Qo [quarter] YYYY", "3rd quarter 2026"],
  ["[Week] w [of] gggg", "Week 39 of 2026"], ["YYYY-MM-DDTHH:mm:ssZ", "2026-09-22T17:05:09+00:00"],
  ["\\\\Q Q", "Q 3"], ["dddd [at] LT", "Tuesday at 5:05 PM"],
  // Sunday, just after midnight
  ["d", "0", SUNDAY], ["do", "0th", SUNDAY], ["e", "0", SUNDAY], ["E", "7", SUNDAY], ["dd", "Su", SUNDAY],
  ["w", "39", SUNDAY], ["W", "38", SUNDAY], ["k", "24", SUNDAY], ["kk", "24", SUNDAY], ["h", "12", SUNDAY],
  ["H", "0", SUNDAY], ["A", "AM", SUNDAY], ["LTS", "12:30:00 AM", SUNDAY],
  // the last Monday of 2025 is week 1 of 2026
  ["YYYY", "2025", YEAR_END], ["w", "1", YEAR_END], ["gggg", "2026", YEAR_END], ["gg", "26", YEAR_END],
  ["W", "1", YEAR_END], ["GGGG", "2026", YEAR_END], ["Wo", "1st", YEAR_END],
];

/**
 * VIEWS-AND-FIELDS F4: the seven, each answer worked out here from the row (Airtable's behaviour)
 * and each refusal in the store's own words. `type` is the kind formula_parse must report.
 */
const STORE_ONLY: { text: string; expect: (r: Row) => Outcome; type?: string; once?: boolean }[] = [
  { text: 'SWITCH({Visit status}, "No-show", "Call owner", "Completed", "Send invoice", "Hold chart")', type: "text",
    expect: (r) => ok(r.visit_status === "No-show" ? "Call owner" : r.visit_status === "Completed" ? "Send invoice" : "Hold chart") },
  { text: 'SWITCH({Species}, "Dog", 15, "Cat", 12)', type: "number",
    expect: (r) => ok(r.species === "Dog" ? 15 : r.species === "Cat" ? 12 : null) },
  { text: 'SWITCH({Deposit taken}, BLANK(), "Take deposit", 0, "Waived", "On file")', type: "text",
    // A match compares as `=` does, and there an empty value matches 0 (as in Airtable), so a
    // deposit of 0 meets BLANK() first and "Waived" is never reached: SWITCH order matters.
    expect: (r) => ok(r.deposit === null || r.deposit === undefined || r.deposit === 0 ? "Take deposit" : "On file") },
  { text: 'FIND("-", {Owner phone})', type: "number", expect: (r) => ok(str(r.owner_phone).indexOf("-") + 1) },
  // Airtable's startFromPosition defaults to 0 and is JavaScript indexOf's start (characters
  // skipped); the answer counts from 1 and 0 means not found.
  { text: 'FIND("5", {Owner phone}, 4)', type: "number", expect: (r) => ok(str(r.owner_phone).indexOf("5", 4) + 1) },
  { text: 'FIND("5", {Owner phone}, 0)', expect: (r) => ok(str(r.owner_phone).indexOf("5", 0) + 1) },
  { text: 'FIND("(", {Owner phone}, 1)', expect: (r) => ok(str(r.owner_phone).indexOf("(", 1) + 1) },
  { text: 'FIND("1", {Owner phone}, 99)', expect: (r) => ok(str(r.owner_phone).indexOf("1", 99) + 1) },
  { text: 'FIND("", {Owner phone}, 3)', expect: (r) => ok(str(r.owner_phone).indexOf("", 3) + 1) },
  { text: 'FIND("dog", {Patient})', expect: (r) => ok(str(r.patient).indexOf("dog") + 1) },
  { text: 'SUBSTITUTE({Owner phone}, "-", ".")', type: "text", expect: (r) => ok(str(r.owner_phone).split("-").join(".")) },
  { text: 'SUBSTITUTE({Owner phone}, "4", "#", 2)', expect: (r) => ok(nth(str(r.owner_phone), "4", "#", 2)) },
  { text: 'REGEX_MATCH({Patient}, "^[A-M]")', type: "boolean", expect: (r) => ok(/^[A-M]/.test(str(r.patient))) },
  { text: 'REGEX_MATCH({Desk notes}, "(?i)no-show")', expect: (r) => ok(/no-show/i.test(str(r.desk_notes))) },
  // RE2, Airtable's engine: \b is a word boundary (in Postgres it would be a backspace), \p{…}
  // classes, named groups.
  { text: 'REGEX_MATCH({Desk notes}, "\\\\bcheck\\\\b")', expect: (r) => ok(/\bcheck\b/.test(str(r.desk_notes))) },
  { text: 'REGEX_MATCH({Desk notes}, "\\\\Bcheck")', expect: (r) => ok(/\Bcheck/.test(str(r.desk_notes))) },
  { text: 'REGEX_MATCH({Patient}, "^\\\\p{Lu}\\\\p{Ll}+ \\\\(")', expect: (r) => ok(/^\p{Lu}\p{Ll}+ \(/u.test(str(r.patient))) },
  { text: 'REGEX_MATCH({Patient}, "^[\\\\p{L} ]+$")', expect: (r) => ok(/^[\p{L} ]+$/u.test(str(r.patient))) },
  { text: 'REGEX_MATCH({Owner phone}, "\\\\P{N}")', expect: (r) => ok(/\P{N}/u.test(str(r.owner_phone))) },
  { text: 'REGEX_MATCH({Owner phone}, "^(?P<area>\\\\(541\\\\)) ")', expect: (r) => ok(/^(\(541\)) /.test(str(r.owner_phone))) },
  { text: 'REGEX_MATCH({Owner phone}, "\\\\Q(541)\\\\E")', expect: (r) => ok(str(r.owner_phone).includes("(541)")) },
  { text: 'REGEX_MATCH({Desk notes}, "TPLO\\\\z")', expect: (r) => ok(/TPLO$/.test(str(r.desk_notes))) },
  { text: 'DATETIME_FORMAT({Visit date}, "dddd, MMMM D, YYYY")', type: "text",
    expect: (r) => { const d = visit(r); return ok(`${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`); } },
  { text: 'DATETIME_FORMAT({Visit date}, "M/D/YY [at] h:mm A")',
    expect: (r) => { const d = visit(r); return ok(`${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)} at ${h12(d)}:${String(d.getUTCMinutes()).padStart(2, "0")} ${d.getUTCHours() < 12 ? "AM" : "PM"}`); } },
  { text: "DATETIME_FORMAT({Visit date})", expect: (r) => ok(dateOut(r, visit(r))) },
  { text: "WORKDAY({Visit date}, 10)", type: "date", expect: (r) => ok(dateOut(r, workday(visit(r), 10, []))) },
  { text: 'WORKDAY({Visit date}, 3, "2026-09-24, 2026-09-25")',
    expect: (r) => ok(dateOut(r, workday(visit(r), 3, ["2026-09-24", "2026-09-25"]))) },
  { text: "WORKDAY({Visit date}, -2)", expect: (r) => ok(dateOut(r, workday(visit(r), -2, []))) },
  { text: "ARRAYJOIN({Services})", type: "text", expect: (r) => ok((SERVICES[str(r.patient)] ?? []).join(", ")) },
  { text: 'ARRAYJOIN({Services}, " + ")', expect: (r) => ok((SERVICES[str(r.patient)] ?? []).join(" + ")) },
  { text: "ARRAYJOIN({Species})", expect: (r) => ok(str(r.species)) },
  // Airtable keeps empty items in ARRAYJOIN (JavaScript's join) and leaves removing them to
  // ARRAYCOMPACT, which drops null and "" but keeps false, 0 and text of spaces.
  { text: `ARRAYJOIN('["Ice", "", null, "Heat"]', "|")`, once: true, expect: () => ok(["Ice", "", null, "Heat"].join("|")) },
  { text: `ARRAYJOIN(ARRAYCOMPACT('["Ice", "", null, "Heat"]'), "|")`, once: true, expect: () => ok("Ice|Heat") },
  { text: `ARRAYCOMPACT('["Ice", "", null, " ", false, 0, "Heat"]')`, once: true, expect: () => ok(["Ice", " ", false, 0, "Heat"]) },
  { text: "ARRAYCOMPACT({Services})", expect: (r) => ok(SERVICES[str(r.patient)] ?? []) },
  { text: "ARRAYJOIN(ARRAYCOMPACT({Services}), \"; \")", expect: (r) => ok((SERVICES[str(r.patient)] ?? []).join("; ")) },
  // the refusals
  { text: 'REGEX_MATCH({Patient}, "([A-Z")', expect: () => no('`REGEX_MATCH` cannot read the pattern "([A-Z".') },
  // Patterns RE2 accepts are accepted: Postgres's `~` answers yes/no with no capture tracking, so
  // the classic runaway shapes run in milliseconds (lane 10 ruling after V9's measure).
  { text: 'REGEX_MATCH({Patient}, "(o+)+x")', expect: (r) => ok(/(o+)+x/.test(str(r.patient))) },
  { text: 'REGEX_MATCH({Patient}, "(.*)*x")', expect: (r) => ok(/(.*)*x/.test(str(r.patient))) },
  { text: 'REGEX_MATCH({Patient}, "((ab)*)+")', expect: (r) => ok(/((ab)*)+/.test(str(r.patient))) },
  { text: 'REGEX_MATCH({Patient}, "(o{2,})*")', expect: (r) => ok(/(o{2,})*/.test(str(r.patient))) },
  { text: 'REGEX_MATCH({Patient}, "(an|an)*")', expect: (r) => ok(/(an|an)*/.test(str(r.patient))) },
  { text: 'REGEX_MATCH({Patient}, "^(Ma|Mo)+")', expect: (r) => ok(/^(Ma|Mo)+/.test(str(r.patient))) },
  { text: 'REGEX_MATCH({Patient}, "(an){1,3}")', expect: (r) => ok(/(an){1,3}/.test(str(r.patient))) },
  { text: 'REGEX_MATCH({Owner phone}, "^(\\\\(541\\\\) )?[0-9-]+$")', expect: (r) => ok(/^(\(541\) )?[0-9-]+$/.test(str(r.owner_phone))) },
  { text: 'REGEX_MATCH({Desk notes}, "^(\\\\w+\\\\s?)+$")', expect: (r) => ok(/^(\w+\s?)+$/.test(str(r.desk_notes))) },
  { text: 'REGEX_MATCH(LOWER(SUBSTITUTE({Species}, " ", "-")), "^[a-z]+(-[a-z]+)*$")', expect: (r) => ok(/^[a-z]+(-[a-z]+)*$/.test(str(r.species).replace(/ /g, "-").toLowerCase())) },
  { text: 'REGEX_MATCH(LOWER(LEFT({Patient}, FIND(" ", {Patient}) - 1)) & "@mail.cedarridge-vet.com", "^[\\\\w.+-]+@[\\\\w-]+(\\\\.[\\\\w-]+)+$")', expect: () => ok(true) },
  { text: 'REGEX_MATCH({Patient}, "((((a{1,100}){1,100}){1,100}){1,100})")', once: true, expect: () => no('`REGEX_MATCH` cannot work out a pattern this complex: "((((a{1,100}){1,100}){1,100}){1,100})".') },
  { text: 'REGEX_MATCH({Patient}, "(o)\\\\1")', expect: () => no('`REGEX_MATCH` does not support backreferences such as "\\1".') },
  { text: 'REGEX_MATCH({Patient}, "Moose(?= )")', expect: () => no('`REGEX_MATCH` does not support lookahead or lookbehind such as "(?=".') },
  { text: 'REGEX_MATCH({Patient}, "(?<!Big )Moose")', expect: () => no('`REGEX_MATCH` does not support lookahead or lookbehind such as "(?<!".') },
  { text: 'REGEX_MATCH({Patient}, "\\\\p{Greek}")', expect: () => no('`REGEX_MATCH` does not know the character class "\\p{Greek}". Use L, Lu, Ll, N, Nd or P.') },
  { text: 'REGEX_MATCH({Patient}, "\\\\mMoose")', expect: () => no('`REGEX_MATCH` cannot read the pattern "\\mMoose".') },
  { text: 'SUBSTITUTE({Owner phone}, "4", "#", 0)', expect: () => no("`SUBSTITUTE` counts which one to replace from 1, but was given 0.") },
  { text: 'FIND("5", {Owner phone}, "third")', expect: () => no('`FIND` needs a number, but got "third".') },
  { text: "WORKDAY({Desk notes}, 2)",
    expect: (r) => no(str(r.desk_notes) === "" ? "`WORKDAY` needs a date, but that value is empty." : `\`WORKDAY\` needs a date, but got "${str(r.desk_notes)}".`) },
  { text: 'WORKDAY({Visit date}, 2, "Thanksgiving")', expect: () => no('`WORKDAY` needs a date, but got "Thanksgiving".') },
  { text: "WORKDAY({Visit date}, 40000)", expect: () => no("`WORKDAY` moves at most 36500 working days, but was given 40000.") },
  { text: 'DATETIME_FORMAT("next Tuesday", "YYYY")', expect: () => no('`DATETIME_FORMAT` needs a date, but got "next Tuesday".') },
  { text: 'FIND("-")', expect: () => no("`FIND` was given 1 value. Use FIND(part, text, start?).") },
  { text: "SWITCH({Species})", expect: () => no("`SWITCH` was given 1 value. Use SWITCH(value, match, result, …, otherwise?).") },
  { text: "ARRAYJOIN()", expect: () => no("`ARRAYJOIN` was given 0 values. Use ARRAYJOIN(values, separator?).") },
  ...DATETIME_TOKENS.map(([format, want, at]) => ({
    text: `DATETIME_FORMAT("${at ?? TUESDAY}", "${format}")`,
    once: true,
    expect: () => ok(want),
  })),
];

function targetFromArgv(): "clone" | "branch" {
  const i = process.argv.indexOf("--target");
  const t = i >= 0 ? process.argv[i + 1] : "clone";
  if (t !== "clone" && t !== "branch") throw new Error(`--target clone|branch, not ${t}`);
  return t;
}

function same(a: Outcome, b: Outcome): boolean {
  if (!a.ok || !b.ok) return !a.ok && !b.ok && a.error === b.error;
  if (Array.isArray(a.value) || Array.isArray(b.value)) return JSON.stringify(a.value) === JSON.stringify(b.value);
  if (typeof a.value === "number" && typeof b.value === "number") {
    return Math.abs(a.value - b.value) <= 1e-9 * Math.max(1, Math.abs(a.value));
  }
  return a.value === b.value;
}

async function main() {
  const target = targetFromArgv();
  const env =
    target === "clone"
      ? loadCloneDbEnv(ROOT, loadCloneRef(ROOT, cloneRefOverride(process.argv)))
      : loadBranchDbEnv(ROOT, loadBranchRef(ROOT, branchRefOverride(process.argv)));
  const client = new pg.Client({ ...env, ssl: { rejectUnauthorized: false }, application_name: "gridprim G3 parity" });
  await client.connect();
  let failures = 0;
  let compared = 0;
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '120s'");
    // The writes below say who is writing, the way every server door does: the platform's actor
    // declaration, transaction-local (platform.declared_actor_tier reads app.actor_tier; the
    // record store's custom.actor_word refuses an undeclared write since ONE-HOME's actor change).
    await client.query("select set_config('app.actor_tier', 'system', true)");
    await client.query(readFileSync(resolve(ROOT, "scripts/campaign-tests/_gridprim_clinic.sql"), "utf8"));
    const gp = Object.fromEntries(
      (await client.query<{ k: string; v: string }>("select k, v::text from gp")).rows.map((r) => [r.k, r.v]),
    );
    const org = gp.org!;
    const table = gp.appts!;
    // F4: the many-choice column ARRAYJOIN reads, written the way the front desk writes it.
    await client.query(
      `select custom.field_declare($1, $2, jsonb_build_object('key', 'services', 'label', 'Services',
         'type', 'multi_select', 'sort', 90, 'options', $3::jsonb)) as id`,
      [org, table, JSON.stringify(SERVICE_OPTIONS)]);
    for (const [patient, items] of Object.entries(SERVICES)) {
      await client.query(
        `select custom.record_update($1, r.id, jsonb_build_object('services', $3::jsonb))
           from custom.record r where r.organization_id = $1 and r.table_id = $2 and r.data->>'patient' = $4`,
        [org, table, JSON.stringify(items), patient]);
    }
    // Marisol's seat: the rows are read and the formulas worked out through what she may see.
    await client.query(`select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true)`);

    // THE SAME ROWS, as the older grid holds them: each column's words by label (a choice is its label).
    const fields = (
      await client.query<{ id: string; key: string; label: string; type: string }>(
        `select f.id::text, f.data->>'key' as key, f.data->>'label' as label, f.data->>'type' as type
           from custom.record f
          where f.organization_id = $1 and f.table_id = custom.field_kernel_id()
            and f.deleted_at is null and f.data->>'entity_definition_id' = $2`,
        [org, table],
      )
    ).rows;
    const records = (
      await client.query<{ id: string; vals: Record<string, unknown> }>(
        `select r.id::text, custom.record_values(r.organization_id, r.id) as vals
           from custom.record r where r.organization_id = $1 and r.table_id = $2 and r.deleted_at is null
          order by r.created_at, r.id`,
        [org, table],
      )
    ).rows;
    if (records.length !== 10) throw new Error(`the fixture holds ${records.length} appointments, not 10`);
    const rowsOld: Record<string, Record<string, unknown>> = {};
    for (const rec of records) {
      const row: Record<string, unknown> = {};
      for (const f of fields) {
        let v = rec.vals[f.key];
        if (f.type === "list" && v !== null && v !== undefined) {
          v = (await client.query<{ w: string }>("select custom.field_words($1, $2, $3::jsonb) as w", [org, f.id, JSON.stringify(v)])).rows[0]!.w;
        }
        row[f.key] = v === undefined ? null : v;
      }
      rowsOld[rec.id] = row;
    }
    const resolveIn = (row: Record<string, unknown>) => (name: string) => {
      const lower = name.trim().toLowerCase();
      const byKey = fields.find((f) => f.key.toLowerCase() === lower);
      const byLabel = fields.find((f) => f.label.toLowerCase() === lower);
      const f = byKey ?? byLabel;
      if (!f) return undefined;
      return row[f.key] ?? null;
    };

    for (const text of FORMULAS) {
      const parsedOld = parseFormula(text);
      const parsedNew = (await client.query<{ p: { ok: boolean; expr?: unknown; error?: string } }>(
        "select custom.formula_parse($1, $2, $3) as p", [org, table, text])).rows[0]!.p;
      for (const rec of records) {
        const old: Outcome = parsedOld.ok
          ? (evaluateFormula(parsedOld.ast, resolveIn(rowsOld[rec.id]!)) as Outcome)
          : { ok: false, error: parsedOld.error };
        let neu: Outcome;
        if (!parsedNew.ok) {
          neu = { ok: false, error: parsedNew.error ?? "?" };
        } else {
          await client.query("savepoint f");
          try {
            const r = await client.query<{ v: Val }>(
              `select custom.formula_eval($1, $2::jsonb, custom.record_values($1, $3),
                        coalesce(custom.rule_context($1, $3), '{}'::jsonb)
                        || jsonb_build_object('fx_self_id', $3::uuid)) as v`,
              [org, JSON.stringify(parsedNew.expr), rec.id],
            );
            const raw = r.rows[0]!.v;
            neu = { ok: true, value: raw };
            await client.query("release savepoint f");
          } catch (e) {
            await client.query("rollback to savepoint f");
            neu = { ok: false, error: (e as Error).message };
          }
        }
        compared++;
        if (!same(old, neu)) {
          failures++;
          console.log(`\x1b[31m[DIFF]\x1b[0m ${text}  ·  ${(rowsOld[rec.id]!.patient as string) ?? rec.id}\n` +
            `        older grid: ${JSON.stringify(old)}\n        store:      ${JSON.stringify(neu)}`);
        }
      }
      if (!failures) process.stdout.write(".");
    }

    // ── F4: the seven, against answers worked out here ────────────────────────────────────
    let storeOnlyFailures = 0;
    for (const c of STORE_ONLY) {
      const parsed = (await client.query<{ p: { ok: boolean; expr?: unknown; error?: string; result_type?: string } }>(
        "select custom.formula_parse($1, $2, $3) as p", [org, table, c.text])).rows[0]!.p;
      if (parsed.ok && c.type && parsed.result_type !== c.type) {
        storeOnlyFailures++;
        console.log(`\x1b[31m[TYPE]\x1b[0m ${c.text}  ·  expected ${c.type}, the store says ${parsed.result_type}`);
      }
      for (const rec of c.once ? records.slice(0, 1) : records) {
        const row = rowsOld[rec.id]!;
        const want = c.expect(row);
        let got: Outcome;
        if (!parsed.ok) {
          got = no(parsed.error ?? "?");
        } else {
          await client.query("savepoint f");
          try {
            const r = await client.query<{ v: Val }>(
              `select custom.formula_eval($1, $2::jsonb, custom.record_values($1, $3),
                        coalesce(custom.rule_context($1, $3), '{}'::jsonb)
                        || jsonb_build_object('fx_self_id', $3::uuid)) as v`,
              [org, JSON.stringify(parsed.expr), rec.id]);
            got = ok(r.rows[0]!.v);
            await client.query("release savepoint f");
          } catch (e) {
            await client.query("rollback to savepoint f");
            got = no((e as Error).message);
          }
        }
        compared++;
        if (!same(want, got)) {
          storeOnlyFailures++;
          console.log(`\x1b[31m[F4]\x1b[0m ${c.text}  ·  ${str(row.patient)}\n` +
            `        expected: ${JSON.stringify(want)}\n        store:    ${JSON.stringify(got)}`);
        }
      }
      if (!storeOnlyFailures) process.stdout.write(".");
    }
    failures += storeOnlyFailures;
    await client.query("rollback");
  } finally {
    await client.end();
  }
  console.log("");
  if (failures) {
    console.log(`\x1b[31m${failures} of ${compared} answers DISAGREE (the older grid or the expected answer vs the store).\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32mPARITY — ${FORMULAS.length} formulas × 10 appointments the same from the older grid and from the store, and ${STORE_ONLY.length} formulas of the eight newer functions (each on every appointment, or once when it reads none) the same as worked out here: ${compared} answers.\x1b[0m`);
}

main().catch((e) => {
  console.error(`\x1b[31m${e instanceof Error ? e.message : String(e)}\x1b[0m`);
  process.exit(1);
});
