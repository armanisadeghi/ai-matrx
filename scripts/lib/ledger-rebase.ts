/**
 * LEDGER REBASE — move a ledger row onto a file's CURRENT bytes, and only after the dev clone
 * has proven those bytes already describe what is live. (Lane LEDGER-REBASE, chair ruling
 * 2026-09-22; the TypeScript half. aidream's `db/ledger_rebase.py` is the Python half, with the
 * same proof shape, the same receipt shape and the same refusals.)
 *
 * WHY IT EXISTS. Three ledger rows record checksums of bytes that exist NOWHERE — not in either
 * object store (155,296 + 123,822 blobs hashed, reachable and unreachable), not in any copy of
 * the file on this machine (DRIFT-9). They ran from a working tree and were edited before they
 * were ever committed. `--amend-idempotent` cannot help: its first step is finding the ledgered
 * blob in git. So those rows could never agree with the tree again, and the grandfather list
 * that froze them could never shrink.
 *
 * THE RULING. The live database is the truth; the ledger's job is to say which bytes produced
 * it. When the bytes that ran are gone, the honest substitute is a PROOF that the bytes we have
 * produce exactly what is live — measured, not asserted:
 *
 *   1. `--target clone` runs the file's current committed bytes on the dev clone (a physical
 *      copy of production) inside a transaction that is ROLLED BACK, and diffs the full object
 *      inventory (`scripts/lib/db-objects-inventory.ts`, depth `full`: function bodies, views,
 *      policies, indexes, ACLs — not only tables) taken before and after, plus every row the
 *      file wrote (`pg_stat_xact_user_tables`). Zero objects changed and zero rows written means
 *      every statement in the file is a no-op against live: the file already describes it.
 *      Anything else is NOT idempotent, printed object by object, and no proof is written.
 *   2. A passing proof is written to `migrations/rebase-proofs/<sha256 of the bytes>.json`,
 *      HASH-BOUND to the file exactly like the `-- policy-ddl: one-table` measurement: change
 *      one byte and the proof stops answering for it.
 *   3. `--target production` then — and only then — rewrites the ledger row's checksum. It
 *      requires `--confirm-chair-step <file>`, a `--reason`, and a LIVE build-lock lease for
 *      `--lane`; it refuses a proof that is missing, bound to other bytes, older than
 *      REBASE_PROOF_MAX_AGE_HOURS, taken anywhere but the clone, tampered with, or taken
 *      against a different ledger checksum than production holds now. It EXECUTES NOTHING.
 *   4. History is never overwritten silently: the row keeps an append-only
 *      `rebase_receipts jsonb` array holding the original checksum, the reason, the chair
 *      confirmation, the lane and the clone proof's own hash.
 *   5. The checked-in snapshot (`migrations/LEDGER.json`) moves onto the new bytes and the
 *      grandfather list shrinks by that name THROUGH ITS RATCHET BLOCK — the runner writes
 *      `last_shrunk_by: LEDGER-REBASE`; nobody hand-edits the list.
 *
 * WHY ROWS COUNT, NOT ONLY OBJECTS. A file that inserts a knob row is idempotent only if the
 * insert inserts nothing. `pg_stat_xact_user_tables` counts every tuple this transaction wrote,
 * so `on conflict do nothing` that conflicts reads 0 and a real insert reads 1. It is strict on
 * purpose: `update t set a = a` writes a tuple and is refused, although it changes no value. A
 * strict proof that refuses a no-op is a rebase that waits; a loose one is a lie in the ledger.
 *
 * WHY THREE INVENTORIES, NOT TWO. The clone is shared: other lanes rehearse on it while a proof
 * runs, and catalog reads see their committed DDL mid-transaction (measured on the first probe:
 * `custom.table_archive` changed under a no-op file). So the proof reads BEFORE, AFTER (inside a
 * savepoint) and RESTORED (after rolling that savepoint back). A delta counts as the file's only
 * when AFTER differs from BOTH; a delta between BEFORE and RESTORED is another session's work,
 * printed as such, never hidden and never counted.
 *
 * Kept free of `pg` and of process state: every database touch is an injected query function,
 * so the verdict functions are exercised by the self-test with no connection at all.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { Delta } from "./db-objects-diff-core";
import { inventoryObjects, parseIdentity, type InventoryQuery } from "./db-objects-inventory";

/** The name the ratchet block records, and the lane this primitive belongs to. */
export const LEDGER_REBASE_LANE = "LEDGER-REBASE";

/** The append-only receipt column on `public._schema_migrations`. */
export const RECEIPT_COLUMN = "rebase_receipts";

/** Where proofs live, beside the migration directories they answer for. */
export const REBASE_PROOF_DIRNAME = "rebase-proofs";

/**
 * A proof older than this was taken against a production that has since moved. The clone is
 * re-cut nightly and both repos take hundreds of commits a day, so one refresh cycle plus a
 * margin for the 1–4 AM window is the longest a proof may be believed.
 */
export const REBASE_PROOF_MAX_AGE_HOURS = 36;

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Deterministic JSON: keys sorted at every depth, so the proof hash is reproducible. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface ObjectDeltaRecord {
  readonly direction: "removed" | "added" | "changed";
  readonly kind: string;
  readonly object: string;
  readonly before: string | null;
  readonly after: string | null;
}

export interface RowWriteRecord {
  readonly table: string;
  readonly tuples: number;
}

export interface IdempotencyMeasurement {
  /** The FILE's effect: objects AFTER differs from both BEFORE and RESTORED. */
  readonly deltas: ObjectDeltaRecord[];
  /** Another session's committed work, seen between BEFORE and RESTORED. Printed, never counted. */
  readonly concurrent: ObjectDeltaRecord[];
  /** Every user table this transaction wrote a tuple into. */
  readonly rowsWritten: RowWriteRecord[];
  readonly objectsInventoried: number;
  /** The error the file raised, when it could not even run. A file that errors is not a description. */
  readonly error: string | null;
  readonly ms: number;
}

export function isIdempotent(m: IdempotencyMeasurement): boolean {
  return m.error === null && m.deltas.length === 0 && m.rowsWritten.length === 0;
}

function objectName(d: Delta): string {
  const o = d.object;
  if (o.kind === "event_trigger") return o.name;
  if (o.table === null || o.kind === "table") return `${o.schema}.${o.name}`;
  return `${o.schema}.${o.table}.${o.name}`;
}

function toRecord(d: Delta): ObjectDeltaRecord {
  return {
    direction: d.direction === "production_only" ? "removed" : d.direction === "branch_only" ? "added" : "changed",
    kind: d.object.kind,
    object: objectName(d),
    before: d.productionSignature ?? null,
    after: d.branchSignature ?? null,
  };
}

/** Every identity whose signature differs between two inventories, as printable records. */
function keyedDeltas(
  a: ReadonlyMap<string, string>,
  b: ReadonlyMap<string, string>,
  keep: (key: string) => boolean,
): ObjectDeltaRecord[] {
  const out: ObjectDeltaRecord[] = [];
  for (const key of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const x = a.get(key);
    const y = b.get(key);
    if (x === y || !keep(key)) continue;
    const d: Delta = {
      object: parseIdentity(key),
      direction: x === undefined ? "branch_only" : y === undefined ? "production_only" : "differs",
      productionSignature: x,
      branchSignature: y,
    };
    out.push(toRecord(d));
  }
  return out;
}

/**
 * 40P01 deadlock / 55P03 lock_not_available. The inventory reads every view through
 * `pg_get_viewdef`, which holds ACCESS SHARE on each view until the transaction ends, so on the
 * shared clone another lane's DDL can deadlock with a proof (measured on the aidream self-test's
 * first run). That is retried by the caller, announced, never silent.
 */
export function isLockClash(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "40P01" || code === "55P03";
}

const ROW_WRITES_SQL = `
  select schemaname || '.' || relname as t, (n_tup_ins + n_tup_upd + n_tup_del)::bigint as n
    from pg_stat_xact_user_tables`;

/**
 * THE MEASUREMENT. The caller has already opened the transaction (and proven its role); this
 * takes a savepoint, runs the file, measures, and rolls the savepoint back. It never commits.
 * The caller rolls the whole transaction back afterwards.
 */
export async function measureIdempotency(
  query: InventoryQuery,
  sql: string,
): Promise<IdempotencyMeasurement> {
  const t0 = Date.now();
  const before = await inventoryObjects(query, "full");
  const rowsBefore = new Map<string, number>(
    (await query(ROW_WRITES_SQL)).rows.map((r) => [String(r.t), Number(r.n)]),
  );
  await query("savepoint ledger_rebase_proof");
  let error: string | null = null;
  try {
    await query(sql);
  } catch (err) {
    // Another session's lock is the shared clone's traffic, not the file's verdict: rethrow so
    // the caller rolls back and retries (isLockClash).
    if (isLockClash(err)) throw err;
    error = err instanceof Error ? err.message : String(err);
  }
  let deltas: ObjectDeltaRecord[] = [];
  let rowsWritten: RowWriteRecord[] = [];
  let afterObjects: Map<string, string> | null = null;
  if (error === null) {
    rowsWritten = (await query(ROW_WRITES_SQL)).rows
      .map((r) => ({ table: String(r.t), tuples: Number(r.n) - (rowsBefore.get(String(r.t)) ?? 0) }))
      .filter((r) => r.tuples > 0)
      .sort((a, b) => a.table.localeCompare(b.table));
    afterObjects = (await inventoryObjects(query, "full")).objects;
  }
  await query("rollback to savepoint ledger_rebase_proof");
  const restored = await inventoryObjects(query, "full");

  const concurrent = keyedDeltas(before.objects, restored.objects, () => true);
  if (afterObjects) {
    const after = afterObjects;
    // AFTER must differ from RESTORED too, or this delta is another session's commit.
    deltas = keyedDeltas(before.objects, after, (key) => after.get(key) !== restored.objects.get(key));
  }
  return {
    deltas,
    concurrent,
    rowsWritten,
    objectsInventoried: before.objects.size,
    error,
    ms: Date.now() - t0,
  };
}

/** What `--target clone` writes and `--target production` reads. Same shape in both runners. */
export interface RebaseProof {
  readonly kind: "ledger-rebase-proof";
  readonly version: 1;
  /** Repo-relative path of the migration file. */
  readonly file: string;
  /** The checksum the runner ledgers for these bytes (TS: raw bytes; Python: EOF-trimmed). */
  readonly sha256: string;
  readonly target: "clone";
  readonly clone_ref: string;
  readonly clone_name: string;
  readonly system_identifier: string;
  /** The checksum the CLONE's ledger held for this file — production's, as of the clone's cut. */
  readonly ledgered_checksum: string;
  readonly ledger_applied_at: string;
  readonly measured_at: string;
  readonly objects_inventoried: number;
  readonly deltas: ObjectDeltaRecord[];
  readonly rows_written: RowWriteRecord[];
  readonly concurrent_noise: ObjectDeltaRecord[];
  readonly verdict: "idempotent";
  readonly runner: string;
  /** sha256 of canonicalJson(the proof without this field). A hand-edited proof fails it. */
  readonly proof_sha256: string;
}

export function proofHashOf(proof: Omit<RebaseProof, "proof_sha256"> | RebaseProof): string {
  const { proof_sha256: _drop, ...body } = proof as RebaseProof;
  void _drop;
  return sha256Hex(canonicalJson(body));
}

/** `<repo>/migrations/campaign/x.sql` → `<repo>/migrations/rebase-proofs/<sha>.json`. */
export function rebaseProofPath(migrationsDir: string, sha: string): string {
  return resolve(migrationsDir, REBASE_PROOF_DIRNAME, `${sha}.json`);
}

export function writeRebaseProof(migrationsDir: string, proof: RebaseProof): string {
  const path = rebaseProofPath(migrationsDir, proof.sha256);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  return path;
}

/** Read a proof, or null. A malformed file is null — never a pass. */
export function loadRebaseProof(migrationsDir: string, sha: string): RebaseProof | null {
  const path = rebaseProofPath(migrationsDir, sha);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RebaseProof;
  } catch {
    return null;
  }
}

export interface ProofExpectation {
  readonly file: string;
  readonly sha256: string;
  /** What production's ledger row holds RIGHT NOW. */
  readonly ledgeredChecksum: string;
  readonly now: Date;
}

/**
 * THE PRODUCTION GATE on the proof. Returns the refusal sentence, or null when the proof holds
 * for exactly these bytes, this ledger row, and this week.
 */
export function proofRefusal(proof: RebaseProof | null, want: ProofExpectation): string | null {
  const short = (s: string) => `${s.slice(0, 12)}…`;
  if (!proof) {
    return (
      `there is NO clone proof for these exact bytes (sha256 ${short(want.sha256)}). Run the same ` +
      `command with --target clone first; it writes ${REBASE_PROOF_DIRNAME}/${want.sha256}.json ` +
      `only when the bytes change nothing on the clone.`
    );
  }
  if (proof.kind !== "ledger-rebase-proof" || proof.version !== 1) {
    return `the proof file is not a ledger-rebase proof (kind ${String(proof.kind)}, version ${String(proof.version)}).`;
  }
  if (proofHashOf(proof) !== proof.proof_sha256) {
    return (
      `the proof's own hash does not match its contents (recorded ${short(String(proof.proof_sha256))}, ` +
      `computed ${short(proofHashOf(proof))}). A proof is written by the runner, never edited.`
    );
  }
  if (proof.sha256 !== want.sha256) {
    return `the proof is for bytes ${short(proof.sha256)}, and the file is ${short(want.sha256)} — a proof of other bytes proves nothing about these.`;
  }
  if (proof.file !== want.file) {
    return `the proof names ${proof.file}, not ${want.file}.`;
  }
  if (proof.target !== "clone") {
    return `the proof was taken against "${String(proof.target)}". Only the dev clone may execute a file to prove it.`;
  }
  if (proof.verdict !== "idempotent" || proof.deltas.length > 0 || proof.rows_written.length > 0) {
    return `the proof does not say idempotent (${proof.deltas.length} object delta(s), ${proof.rows_written.length} table(s) written).`;
  }
  if (proof.ledgered_checksum !== want.ledgeredChecksum) {
    return (
      `the proof was taken while the ledger held ${short(proof.ledgered_checksum)}, and production ` +
      `holds ${short(want.ledgeredChecksum)} now. The row moved since the proof; take a new one.`
    );
  }
  const measured = Date.parse(proof.measured_at);
  if (!Number.isFinite(measured)) return `the proof's measured_at (${String(proof.measured_at)}) is not a time.`;
  const ageHours = (want.now.getTime() - measured) / 3_600_000;
  if (ageHours > REBASE_PROOF_MAX_AGE_HOURS) {
    return (
      `the proof is STALE: taken ${ageHours.toFixed(1)} h ago (${proof.measured_at}), and a proof is ` +
      `believed for ${REBASE_PROOF_MAX_AGE_HOURS} h — production has moved since. Re-run it on the clone.`
    );
  }
  if (ageHours < -0.1) return `the proof's measured_at (${proof.measured_at}) is in the future.`;
  return null;
}

/** One entry of the append-only receipt array. Same shape in both runners. */
export interface RebaseReceipt {
  readonly kind: "ledger-rebase";
  readonly was: string;
  readonly now: string;
  readonly reason: string;
  readonly chair_step_confirmed: string | null;
  readonly lane: string | null;
  readonly target: "clone" | "production";
  readonly clone_proof: {
    readonly path: string;
    readonly sha256: string;
    readonly clone_ref: string;
    readonly measured_at: string;
  };
  readonly runner: string;
  readonly rebased_at: string;
}

/**
 * THE GRANDFATHER LIST SHRINKS THROUGH ITS RATCHET, WRITTEN BY THE RUNNER. Removes `relPath`
 * from `files`, moves `ratchet.current_count`, stamps `last_shrunk_by` and appends the reason to
 * `ratchet.shrunk` so the list says how it got shorter. Returns false when the name was not there.
 */
export function shrinkGrandfathered(
  path: string,
  relPath: string,
  entry: { was: string; now: string; proofSha256: string; at: Date },
): boolean {
  if (!existsSync(path)) return false;
  const doc = JSON.parse(readFileSync(path, "utf8")) as {
    files?: Record<string, unknown>;
    ratchet?: Record<string, unknown> & { shrunk?: unknown[] };
  };
  if (!doc.files || !(relPath in doc.files)) return false;
  delete doc.files[relPath];
  const ratchet = (doc.ratchet ??= {});
  ratchet.current_count = Object.keys(doc.files).length;
  ratchet.last_shrunk_by = LEDGER_REBASE_LANE;
  ratchet.last_shrunk_at = entry.at.toISOString().slice(0, 10);
  const shrunk = Array.isArray(ratchet.shrunk) ? ratchet.shrunk : [];
  shrunk.push({
    file: relPath,
    by: LEDGER_REBASE_LANE,
    at: entry.at.toISOString(),
    how:
      "ledger rebase: the file's current bytes changed nothing on the dev clone, so production's " +
      "row moved onto them and this exemption is no longer needed",
    was: entry.was,
    now: entry.now,
    clone_proof_sha256: entry.proofSha256,
  });
  ratchet.shrunk = shrunk;
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return true;
}

/** The one plain sentence printed per rebased row. */
export function rebaseSentence(args: {
  filename: string;
  target: "clone" | "production";
  was: string;
  now: string;
  cloneRef: string;
  measuredAt: string;
}): string {
  return (
    `Rebased ${args.filename} on ${args.target}: its ledger row now names the committed bytes ` +
    `(${args.now.slice(0, 12)}…) instead of the lost ones (${args.was.slice(0, 12)}…), because ` +
    `running those bytes on the dev clone ${args.cloneRef} at ${args.measuredAt} changed nothing; ` +
    `the old checksum, the reason and the proof are kept on the row.`
  );
}
