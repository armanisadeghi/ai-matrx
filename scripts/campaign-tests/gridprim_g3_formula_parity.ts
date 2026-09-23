/**
 * LANE GRID-PRIMITIVES, G3 — FORMULA PARITY: THE OLDER GRID'S EVALUATOR AND THE STORE, SAME ROWS.
 *
 * THE USE CASE (scripts/campaign-tests/_gridprim_clinic.sql). Marisol Vega runs the front desk
 * at Cedar Ridge Veterinary Clinic. Her Appointments day sheet carries the formula columns a
 * practice actually keeps: the balance due after the deposit, the fee with the 3% card
 * surcharge, "Call owner" on a no-show, the recheck date two weeks out, the
 * last four of the owner's phone for the voicemail script, and so on. Every one of them is
 * worked out TWICE here — by `features/data-tables/formulas.ts` (the browser evaluator the
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
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { evaluateFormula, parseFormula } from "../../features/data-tables/formulas";
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

type Val = string | number | boolean | null;
type Outcome = { ok: true; value: Val } | { ok: false; error: string };

function targetFromArgv(): "clone" | "branch" {
  const i = process.argv.indexOf("--target");
  const t = i >= 0 ? process.argv[i + 1] : "clone";
  if (t !== "clone" && t !== "branch") throw new Error(`--target clone|branch, not ${t}`);
  return t;
}

function same(a: Outcome, b: Outcome): boolean {
  if (!a.ok || !b.ok) return !a.ok && !b.ok && a.error === b.error;
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
    await client.query(readFileSync(resolve(ROOT, "scripts/campaign-tests/_gridprim_clinic.sql"), "utf8"));
    const gp = Object.fromEntries(
      (await client.query<{ k: string; v: string }>("select k, v::text from gp")).rows.map((r) => [r.k, r.v]),
    );
    const org = gp.org!;
    const table = gp.appts!;
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
    await client.query("rollback");
  } finally {
    await client.end();
  }
  console.log("");
  if (failures) {
    console.log(`\x1b[31m${failures} of ${compared} answers DISAGREE between the older grid and the store.\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32mPARITY — ${FORMULAS.length} formulas × 10 appointments = ${compared} answers, every one the same from the older grid and from the store.\x1b[0m`);
}

main().catch((e) => {
  console.error(`\x1b[31m${e instanceof Error ? e.message : String(e)}\x1b[0m`);
  process.exit(1);
});
