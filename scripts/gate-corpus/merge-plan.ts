/**
 * `merge-plan.ts` — THE REFRESH IS A MERGE, AND THIS IS THE PART THAT DECIDES
 * WHICH ROWS IT MAY TOUCH (BUILD-BOOK §13).
 *
 * WHY IT IS ITS OWN FILE
 * ----------------------
 * §13's merge has one job that matters: it must never delete and never overwrite
 * a row the CAMPAIGN wrote. `restore-graph.ts --merge` is the only thing that
 * runs it against the real branch, and a proof that ran different SQL against a
 * copy would prove nothing about the real run. So the row disposition — the
 * marker, the `on conflict` guard, the delete predicate and the replace path it
 * is contrasted with — lives HERE, and both the real run and
 * `refresh-merge-proof.ts`'s RED/GREEN call the same functions with a different
 * table name. The proof exercises the shipped code or it is not a proof.
 *
 * THE MARKER
 * ----------
 * §13 point 1 names it: every association and reachability row this campaign
 * creates carries `origin = 'campaign'`, a nullable column `W1-REL` lands as
 * part of its own DDL. Production's copied rows carry `null`, because production
 * has never heard of it.
 *
 * 🚨 THAT COLUMN DOES NOT EXIST YET (measured on the rehearsal branch
 * 2026-09-17: `information_schema.columns` holds no `origin` for either
 * `platform.associations` or `platform.reachability`). `W1-REL` has not run. A
 * merge that wrote `origin is distinct from 'campaign'` into its delete
 * predicate today would raise `42703 column "origin" does not exist` and the
 * refresh would not run at all — and a merge that silently dropped the predicate
 * would delete exactly the rows §13 exists to protect.
 *
 * So the marker is RESOLVED against the live table, per run, and there are two:
 *
 *   `origin-column` — §13's own marker, used the moment the column exists.
 *   `absent-from-production-snapshot` — the smallest honest stand-in until then:
 *       a branch row whose primary key PRODUCTION'S SNAPSHOT DOES NOT HOLD was
 *       not put there by this copy, so something else wrote it — the campaign's
 *       lanes, or `W0-CORPUS`'s corpus edges, both of which §13 is protecting.
 *       It is STRICTLY CONSERVATIVE: it can only over-protect, never under. Its
 *       cost is stated rather than discovered — under this marker the merge
 *       deletes NOTHING from a marker table, so a row production has deleted
 *       since the copy lingers on the branch until `W1-REL` lands `origin`. The
 *       run prints that, the receipt records which marker it used, and the
 *       reader is never left to work out which of the two numbers they are
 *       looking at.
 */

/** §13 point 1's column, and the value that means "the campaign wrote this row". */
export const MARKER_COLUMN = "origin";
export const MARKER_VALUE = "campaign";

export type Marker =
  | {
      readonly kind: "origin-column";
      /** The column that carries the marker. */
      readonly column: string;
      readonly value: string;
    }
  | {
      readonly kind: "absent-from-production-snapshot";
      /** Why this run is not using §13's marker, in one sentence, printed and stored. */
      readonly because: string;
    };

export interface ClientLike {
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

/**
 * Which marker this table can actually support, asked of the table itself.
 *
 * Deliberately NOT cached across tables: `W1-REL` lands the column on
 * `platform.associations` and `platform.reachability` in one migration, but a
 * half-applied migration is a state a merge must survive, and per-table
 * resolution means the table that HAS the column gets §13's real predicate even
 * when its sibling does not.
 */
export async function resolveMarker(client: ClientLike, qualified: string): Promise<Marker> {
  const [schema, table] = qualified.split(".");
  const r = await client.query(
    `select a.atttypid::regtype::text as typ
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and a.attname = $3
        and a.attnum > 0 and not a.attisdropped`,
    [schema, table, MARKER_COLUMN],
  );
  if (r.rowCount) {
    return { kind: "origin-column", column: MARKER_COLUMN, value: MARKER_VALUE };
  }
  return {
    kind: "absent-from-production-snapshot",
    because:
      `${qualified} carries no \`${MARKER_COLUMN}\` column, so §13's marker cannot be written ` +
      `into a predicate against it. W1-REL lands that column; until it does, a branch row whose ` +
      `primary key production's snapshot does not hold is treated as campaign-owned. That is ` +
      `conservative in the safe direction — nothing the campaign wrote can be deleted or ` +
      `overwritten — and its cost is that this merge deletes NOTHING from ${qualified}, so a row ` +
      `production deleted since the copy stays on the branch.`,
  };
}

export function markerLabel(marker: Marker): string {
  return marker.kind;
}

/**
 * The SQL predicate that is TRUE for a campaign-owned row of `alias`, or `null`
 * when the marker is not expressible as a predicate over the row alone.
 *
 * `absent-from-production-snapshot` returns null on purpose: campaign ownership
 * is then a fact about the production snapshot, not about the row, and a caller
 * that needs it asks `campaignOwnedKeys()` instead. Returning a predicate that
 * was always false — or always true — is how a guard becomes decoration.
 */
export function campaignOwnedPredicate(marker: Marker, alias: string): string | null {
  if (marker.kind !== "origin-column") return null;
  return `${alias}."${marker.column}" is not distinct from '${marker.value}'`;
}

/** The complement: TRUE for a row the merge is allowed to overwrite or delete. */
export function notCampaignOwnedPredicate(marker: Marker, alias: string): string | null {
  if (marker.kind !== "origin-column") return null;
  return `${alias}."${marker.column}" is distinct from '${marker.value}'`;
}

/**
 * §13 point 2, first half — production's rows written onto the branch, keyed on
 * THE TABLE'S OWN PRIMARY KEY, and **a row whose marker says the campaign wrote
 * it is never overwritten**: the `do update` carries the marker in its WHERE, so
 * the conflicting row is left exactly as it was found and returns nothing.
 *
 * `returning (xmax = 0)` is what makes the receipt's counts real rather than
 * estimated: true for a row this statement INSERTED, false for one it UPDATED,
 * and a row that came back at all is a row the guard did not stop. The rows of
 * the batch that return NOTHING are the skipped ones.
 */
export function mergeInsertSql(args: {
  readonly table: string;
  /** Column names, already quoted, in the order the tuples supply them. */
  readonly quotedColumns: string;
  /** Primary-key columns, already quoted and comma-joined. */
  readonly quotedPk: string;
  /** `"col" = excluded."col"` for every non-key column; empty for a key-only table. */
  readonly setList: string;
  readonly tuples: string;
  readonly marker: Marker;
}): string {
  const { table, quotedColumns, quotedPk, setList, tuples, marker } = args;
  const base = `insert into ${table} (${quotedColumns}) values ${tuples}`;
  if (!setList) {
    // Nothing to update — every column is part of the key. `do nothing` already
    // cannot overwrite anything, campaign-owned or not.
    return `${base} on conflict (${quotedPk}) do nothing returning (xmax = 0) as inserted`;
  }
  const guard = notCampaignOwnedPredicate(marker, table.split(".").pop()!);
  const where = guard ? ` where ${guard}` : "";
  return (
    `${base} on conflict (${quotedPk}) do update set ${setList}${where} ` +
    `returning (xmax = 0) as inserted`
  );
}

/**
 * §13 point 2, second half — rows the new production snapshot no longer has.
 *
 * Returns `null` when the marker cannot express campaign ownership as a
 * predicate, and that null IS the behaviour: with no way to tell a campaign row
 * from a row production dropped, the merge deletes nothing at all. The caller
 * prints why.
 *
 * `keysTable` is a relation holding one row per primary key production's
 * snapshot DOES hold (the caller materialises it; see `withSnapshotKeys`).
 */
export function mergeDeleteSql(args: {
  readonly table: string;
  readonly pk: readonly string[];
  readonly keysTable: string;
  readonly marker: Marker;
}): string | null {
  const { table, pk, keysTable, marker } = args;
  const alias = table.split(".").pop()!;
  const guard = notCampaignOwnedPredicate(marker, alias);
  if (!guard) return null;
  const join = pk.map((c) => `k."${c}" is not distinct from ${alias}."${c}"`).join(" and ");
  return (
    `delete from ${table} as ${alias} ` +
    `where not exists (select 1 from ${keysTable} k where ${join}) and ${guard}`
  );
}

/**
 * THE OLD PATH, kept here BY NAME so the RED half of the proof runs the real
 * thing rather than a re-typed imitation of it.
 *
 * This is exactly what `restore-graph.ts` does today for a `replace` table, and
 * exactly what §13 says must never run again after the campaign's lanes start
 * writing: it removes every row, campaign-owned or not.
 */
export function replaceDeleteSql(table: string): string {
  return `delete from ${table}`;
}

/**
 * Materialise "every primary key production's snapshot holds for this table"
 * as a TEMP relation, so `mergeDeleteSql`'s `not exists` is one index-less but
 * single-pass anti-join instead of 34,000 bind parameters (Postgres refuses more
 * than 65,535 in one statement, and `platform.associations` alone carries
 * 33,809 rows).
 *
 * Temp, so it dies with the connection and can never be mistaken for campaign
 * state; created INSIDE the merge's own transaction, so a rollback takes it too.
 */
export async function withSnapshotKeys(
  client: ClientLike,
  table: string,
  pk: readonly string[],
  pkTypes: readonly string[],
  keys: Iterable<string>,
): Promise<string> {
  const name = `pg_temp.snapkeys_${table.replace(/[^a-z0-9]/gi, "_")}`;
  await client.query(`drop table if exists ${name}`);
  await client.query(
    `create temp table ${name.replace("pg_temp.", "")} (` +
      pk.map((c, i) => `"${c}" ${pkTypes[i]}`).join(", ") +
      `) on commit drop`,
  );
  const batch = Math.max(1, Math.floor(30_000 / pk.length));
  let buf: unknown[] = [];
  let tuples: string[] = [];
  const flush = async () => {
    if (!tuples.length) return;
    await client.query(
      `insert into ${name} (${pk.map((c) => `"${c}"`).join(", ")}) values ${tuples.join(",")}`,
      buf,
    );
    buf = [];
    tuples = [];
  };
  for (const k of keys) {
    const parts = k.split(" ");
    const ph = pk.map((_, i) => {
      buf.push(parts[i] === "null" ? null : parts[i]);
      return `$${buf.length}::${pkTypes[i]}`;
    });
    tuples.push(`(${ph.join(",")})`);
    if (tuples.length >= batch) await flush();
  }
  await flush();
  return name;
}

/**
 * What one table's merge did, as the receipt records it.
 *
 * THE TWO SKIP COUNTS ARE DIFFERENT THINGS, and collapsing them would hide the
 * one §13 is about:
 *
 *   `skipped_conflict` — a production row whose UPSERT was refused because the
 *       row already sitting on that primary key is campaign-owned. Rare, because
 *       a campaign row is normally minted under an id production has never seen;
 *       it is counted anyway, because a zero that was measured is worth more
 *       than a zero that was assumed.
 *   `skipped_campaign_owned` — a campaign-owned row the DELETE phase spared: it
 *       is absent from production's new snapshot, so the replace-shaped restore
 *       would have taken it, and the marker is the only reason it is still
 *       there. THIS is the number §13 point 2 exists to make non-zero, and the
 *       one the rehearsal reads.
 */
export interface TableMergeCounts {
  inserted: number;
  updated: number;
  skipped_conflict: number;
  skipped_campaign_owned: number;
  deleted: number;
}

export function emptyCounts(): TableMergeCounts {
  return { inserted: 0, updated: 0, skipped_conflict: 0, skipped_campaign_owned: 0, deleted: 0 };
}

/**
 * The rows the delete phase SPARED — campaign-owned and absent from production's
 * new snapshot. Under §13's marker it is a query against the marker column and
 * the snapshot-key relation; under the fallback marker every row absent from the
 * snapshot is campaign-owned by definition, so it is the size of that difference
 * and the caller already holds it.
 */
export async function countSpared(
  client: ClientLike,
  table: string,
  marker: Marker,
  keysTable: string,
  fallback: number,
): Promise<number> {
  if (marker.kind !== "origin-column") return fallback;
  const alias = table.split(".").pop()!;
  const pkJoin = await client.query(
    `select a.attname::text as c
       from pg_constraint c
       join lateral unnest(c.conkey) with ordinality k(attnum, ord) on true
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      where c.conrelid = $1::regclass and c.contype = 'p'
      order by k.ord`,
    [table],
  );
  const pk = pkJoin.rows.map((r) => (r as { c: string }).c);
  const on = pk.map((c) => `k."${c}" is not distinct from ${alias}."${c}"`).join(" and ");
  const r = await client.query(
    `select count(*)::text n from ${table} as ${alias}
      where ${alias}."${marker.column}" is not distinct from '${marker.value}'
        and not exists (select 1 from ${keysTable} k where ${on})`,
  );
  return Number((r.rows[0] as { n: string }).n);
}

/**
 * Count the campaign-owned rows of a table — §13 point 4's `campaign_rows_before`
 * and `campaign_rows_after`, which the gate requires to be EQUAL.
 *
 * Under `origin-column` it is one `count(*)`. Under the fallback it is the size
 * of the branch's primary-key set minus production's snapshot's, which the
 * caller already holds, so it is passed in rather than re-derived — two
 * derivations of the same number is how the two halves of an equality check
 * stop measuring the same thing.
 */
export async function countCampaignOwned(
  client: ClientLike,
  table: string,
  marker: Marker,
  branchKeys: () => Promise<Set<string>>,
  snapshotKeys: Set<string>,
): Promise<number> {
  if (marker.kind === "origin-column") {
    const r = await client.query(
      `select count(*)::text n from ${table} where "${marker.column}" is not distinct from '${marker.value}'`,
    );
    return Number((r.rows[0] as { n: string }).n);
  }
  const keys = await branchKeys();
  let n = 0;
  for (const k of keys) if (!snapshotKeys.has(k)) n += 1;
  return n;
}
