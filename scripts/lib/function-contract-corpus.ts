/**
 * THE CLASS GUARD BEHIND `function_contracts_hold`: A MIGRATION THAT REPLACES A FUNCTION
 * BODY MUST CARRY THE TOKENS THE PREVIOUS BODY DECLARED — OR SAY WHY NOT, IN ITS OWN BYTES.
 *
 * WHY THIS EXISTS. `hr.function_contract` (hr_l3_79, D13) is how a lane declares WHAT MUST
 * REMAIN TRUE of a shared function, so that another lane's `CREATE OR REPLACE` cannot
 * silently discard its fix. It works — it has caught the class three times — but it is
 * REACTIVE by construction: it reads `pg_proc`, so it can only speak AFTER the re-emit has
 * landed on the live database. Twice in one week that meant a gate went red over a fix that
 * had already been gone for hours:
 *
 *   hr_l3_69's `hr.leave_calendar` edit, erased by another lane's re-create while the ledger
 *   row still said "applied" (that is the incident hr_l3_79 was written for).
 *
 *   2026-09-22 (lane GATES-2): `crm.ensure_user_party` lost five provenance tokens to
 *   `a_verified_phone_is_reachable_by_text_and_voice.sql`, and `hr._wf_notify` /
 *   `hr._punch_notify_edited` lost `?org=` — the employer a notification deep link must
 *   carry — to `links2_an_hr_link_names_its_employer.sql`. Both turned out to be correct
 *   HOISTS into a shared body rather than losses, which is the point: NOBODY KNEW EITHER
 *   WAY until a release gate went red days later, and the person who could have said so in
 *   one line was the author of the re-emit, at the moment they wrote it.
 *
 * WHAT THIS ADDS. The same contract rows, read against the migration corpus BEFORE anything
 * is applied. A file that is not in `public._schema_migrations` and re-creates a function
 * under contract must either carry that contract's `must_contain` tokens in its own bytes,
 * or carry a declaration:
 *
 *     -- function-contract-ok: <schema>.<function> — <why, in a sentence>
 *
 * The declaration is never silent: every waiver is PRINTED on every run, with its reason,
 * so "I considered it" is a fact on the release output rather than a comment nobody reads.
 *
 * THE SCOPE IS DELIBERATE AND STATED, NOT AN OMISSION:
 *  · UNAPPLIED FILES ONLY. An applied file is already judged by the live check on the real
 *    `pg_proc` body, which is stronger. Judging the corpus historically would also be WRONG:
 *    a contract declared in a file applied AFTER a re-emit cannot bind that re-emit, and a
 *    later amendment (`update hr.function_contract`) is invisible to a bytes-only reader.
 *    Reading the LIVE rows against the NOT-YET-APPLIED files has neither problem.
 *  · `must_contain` ONLY. `must_not_contain` is a statement about the resulting body; a file
 *    may legitimately mention a forbidden token in a comment explaining why it is forbidden.
 *    That clause stays with the live check.
 *  · LITERAL `CREATE OR REPLACE FUNCTION <schema>.<name>` ONLY. 69 of 100 `hr_l3` migrations
 *    rewrite a body via `pg_get_functiondef` + `replace`, where no literal body exists to
 *    read. Those remain the live check's alone. Conservative in the right direction: this
 *    arm never invents a finding it cannot point at.
 */

export interface ContractRow {
  readonly schema_name: string;
  readonly function_name: string;
  readonly home_migration: string;
  readonly must_contain: readonly string[];
  readonly reason: string;
}

export interface CorpusFile {
  /** Basename as the ledger spells it, e.g. `hr_l3_121_….sql`. */
  readonly file: string;
  readonly sql: string;
}

export interface ContractGap {
  readonly file: string;
  /** `schema.function` the file re-creates. */
  readonly qname: string;
  readonly home_migration: string;
  readonly missing: readonly string[];
  readonly reason: string;
}

export interface ContractWaiver {
  readonly file: string;
  readonly qname: string;
  readonly why: string;
}

export interface CorpusVerdict {
  readonly gaps: readonly ContractGap[];
  readonly waivers: readonly ContractWaiver[];
  /** How many unapplied files were read, so a vacuous run says so out loud. */
  readonly filesRead: number;
  /** How many `schema.function` re-creations under contract were examined. */
  readonly recreationsExamined: number;
}

const RECREATE =
  /create\s+(?:or\s+replace\s+)?function\s+("?[a-z_][a-z0-9_$]*"?)\s*\.\s*("?[a-z_][a-z0-9_$]*"?)/gi;

/** `-- function-contract-ok: crm.ensure_user_party — the whitelist moved to the delegate` */
const WAIVER = /--\s*function-contract-ok:\s*([a-z_][a-z0-9_$]*\.[a-z_][a-z0-9_$]*)\s*[—:-]+\s*(.+)/gi;

const MIN_WHY = 20;

function unquote(s: string): string {
  return s.replace(/"/g, "").toLowerCase();
}

export function parseWaivers(sql: string): Map<string, string> {
  const out = new Map<string, string>();
  WAIVER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WAIVER.exec(sql))) {
    const why = (m[2] ?? "").trim();
    if (why.length < MIN_WHY) continue; // a waiver with no sentence is not a waiver
    out.set(m[1]!.toLowerCase(), why);
  }
  return out;
}

/**
 * THE WHOLE JUDGEMENT, as a pure function of (files, contracts) so the self-test can drive
 * it with bytes it wrote and the real run can drive it with the corpus.
 */
export function findContractGaps(
  files: readonly CorpusFile[],
  contracts: readonly ContractRow[],
): CorpusVerdict {
  const byFn = new Map<string, ContractRow[]>();
  for (const c of contracts) {
    const k = `${c.schema_name}.${c.function_name}`.toLowerCase();
    byFn.set(k, [...(byFn.get(k) ?? []), c]);
  }

  const gaps: ContractGap[] = [];
  const waivers: ContractWaiver[] = [];
  let recreationsExamined = 0;

  for (const { file, sql } of files) {
    const waived = parseWaivers(sql);
    const seen = new Set<string>();
    RECREATE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RECREATE.exec(sql))) {
      const qname = `${unquote(m[1]!)}.${unquote(m[2]!)}`;
      if (seen.has(qname)) continue;
      seen.add(qname);
      const rows = byFn.get(qname);
      if (!rows) continue;
      recreationsExamined++;
      const why = waived.get(qname);
      if (why !== undefined) {
        waivers.push({ file, qname, why });
        continue;
      }
      for (const c of rows) {
        const missing = c.must_contain.filter((t) => !sql.includes(t));
        if (missing.length === 0) continue;
        gaps.push({
          file,
          qname,
          home_migration: c.home_migration,
          missing,
          reason: c.reason,
        });
      }
    }
  }

  return { gaps, waivers, filesRead: files.length, recreationsExamined };
}
