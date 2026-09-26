/**
 * campaign-authorisation.ts — WHAT A CAMPAIGN FILE NEEDS BEFORE `pnpm db:apply --target production`.
 *
 * 🚨 THE REHEARSAL BRANCH IS GONE (deleted 2026-09-26 00:30Z). Until lane DB-TOOLS-NO-BRANCH
 * (2026-09-25 PT) the production authorisation opened a connection to that branch to read a
 * `campaign_watch.build_lock` row, so after the deletion `loadBranchDbEnv` refused and EVERY
 * campaign file was refused at production — three lanes in a row (COPY-WRITABLE,
 * BIG-VALUES-WRITE, PROVISION-BATCH-FIX) ran the legs by hand with psql. The branch read is gone.
 *
 * WHAT THE AUTHORISATION IS NOW, and where each part lives:
 *
 *   1. AN EXPLICIT `--lane`. Refused without one, before the header is read (apply-migration.ts).
 *   2. THE `-- based-on:` HASHES MATCH PRODUCTION AT APPLY TIME. Recomputed against the database
 *      being applied to, immediately before the file executes, and the whole file is refused on
 *      any difference (DD-220, scripts/migration-based-on.ts). Unchanged; it was never a branch
 *      read.
 *   3. THE PAIR ON THE CLONE — the up and its inverse, each ledgered on the dev clone with the
 *      checksum of the bytes on disk — is READ AND PRINTED on the apply line. It is INFORMATION,
 *      NEVER A REFUSAL: Arman's 2026-09-18 ruling (migrations/JUDGMENT.md §6a) stands, and a
 *      gate on it was tried and reverted on 2026-09-26 (FOUND_DEFECTS D351). Work in progress is
 *      kept off production by `-- draft:` (JUDGMENT §1c), not by the rehearsal copy.
 *
 * The verdict is a PURE function of facts the caller read, so its self-test needs no database.
 */

import { createHash } from "node:crypto";

export interface CloneLedgerFact {
  readonly checksum: string;
  readonly applied_at: string;
}

export interface ClonePairFacts {
  readonly upName: string;
  /** The bytes on disk. */
  readonly upSql: string;
  /** `null` when the file ships no inverse. */
  readonly inverseName: string | null;
  readonly inverseSql: string | null;
  /** The clone's ledger rows, or `null` when the clone had none for that name. */
  readonly upOnClone: CloneLedgerFact | null;
  readonly inverseOnClone: CloneLedgerFact | null;
  /** Set when the clone could not be read at all — printed, never a refusal. */
  readonly cloneUnreadable?: string | null;
}

export type PairState = "rehearsed" | "different-bytes" | "not-on-clone" | "no-inverse" | "unread";

export interface ClonePairVerdict {
  /** ALWAYS null — the clone is information (JUDGMENT §6a). Kept as a field so a caller that
   *  ever grew a refusal here would have to change a type, not slip one in. */
  readonly refusal: null;
  readonly up: PairState;
  readonly inverse: PairState;
  /** One line for the apply output. */
  readonly note: string;
}

function sha(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Both hash forms the estate's ledgers hold for the same bytes (CS-30): sha256(sql) from this
 *  runner, sha256(sql.rstrip()) from aidream's. */
export function ledgerHoldsBytes(row: CloneLedgerFact | null, sql: string): boolean {
  if (!row) return false;
  return row.checksum === sha(sql) || row.checksum === sha(sql.replace(/\s+$/, ""));
}

function stateOf(row: CloneLedgerFact | null, sql: string | null): PairState {
  if (sql === null) return "no-inverse";
  if (!row) return "not-on-clone";
  return ledgerHoldsBytes(row, sql) ? "rehearsed" : "different-bytes";
}

const WORDS: Record<PairState, string> = {
  rehearsed: "ledgered on the clone, byte-identical",
  "different-bytes": "ledgered on the clone with DIFFERENT bytes",
  "not-on-clone": "not ledgered on the clone",
  "no-inverse": "no inverse file",
  unread: "clone not read",
};

export function clonePairVerdict(f: ClonePairFacts): ClonePairVerdict {
  if (f.cloneUnreadable) {
    return {
      refusal: null,
      up: "unread",
      inverse: "unread",
      note: `the clone could not be read (${f.cloneUnreadable}) — the pair's rehearsal state is unknown; information only`,
    };
  }
  const up = stateOf(f.upOnClone, f.upSql);
  const inverse = stateOf(f.inverseOnClone, f.inverseSql);
  const note =
    `up ${f.upName}: ${WORDS[up]}` +
    (f.upOnClone ? ` (${f.upOnClone.applied_at})` : "") +
    `; inverse ${f.inverseName ?? "(none)"}: ${WORDS[inverse]}` +
    (f.inverseOnClone ? ` (${f.inverseOnClone.applied_at})` : "") +
    (up === "rehearsed" && inverse === "rehearsed"
      ? " — rule 27's pair is on the clone"
      : " — information only, never a gate (JUDGMENT §6a)");
  return { refusal: null, up, inverse, note };
}

/** The authorisation's self-test: pure, no database. Returns the failures. */
export function clonePairSelfTest(): string[] {
  const failures: string[] = [];
  const up = "create table if not exists zz.a (id int);\n";
  const down = "drop table if exists zz.a;\n";
  const row = (s: string): CloneLedgerFact => ({ checksum: sha(s), applied_at: "2026-09-25 22:00" });
  const cases: Array<[string, ClonePairFacts, PairState, PairState]> = [
    ["pair rehearsed", { upName: "a.sql", upSql: up, inverseName: "a_down.sql", inverseSql: down, upOnClone: row(up), inverseOnClone: row(down) }, "rehearsed", "rehearsed"],
    ["aidream's rstrip hash counts", { upName: "a.sql", upSql: up, inverseName: "a_down.sql", inverseSql: down, upOnClone: { checksum: sha(up.trimEnd()), applied_at: "x" }, inverseOnClone: row(down) }, "rehearsed", "rehearsed"],
    ["edited after rehearsal", { upName: "a.sql", upSql: up + "-- more\n", inverseName: "a_down.sql", inverseSql: down, upOnClone: row(up), inverseOnClone: row(down) }, "different-bytes", "rehearsed"],
    ["never rehearsed", { upName: "a.sql", upSql: up, inverseName: "a_down.sql", inverseSql: down, upOnClone: null, inverseOnClone: null }, "not-on-clone", "not-on-clone"],
    ["no inverse", { upName: "a.sql", upSql: up, inverseName: null, inverseSql: null, upOnClone: row(up), inverseOnClone: null }, "rehearsed", "no-inverse"],
  ];
  for (const [label, facts, wantUp, wantDown] of cases) {
    const v = clonePairVerdict(facts);
    if (v.up !== wantUp || v.inverse !== wantDown) failures.push(`${label}: got ${v.up}/${v.inverse}, want ${wantUp}/${wantDown}`);
    if (v.refusal !== null) failures.push(`${label}: the clone pair refused — it is information only (JUDGMENT §6a)`);
  }
  const unread = clonePairVerdict({ upName: "a.sql", upSql: up, inverseName: null, inverseSql: null, upOnClone: null, inverseOnClone: null, cloneUnreadable: "no password" });
  if (unread.up !== "unread" || unread.refusal !== null) failures.push("unreadable clone must be announced, never refused");
  return failures;
}
