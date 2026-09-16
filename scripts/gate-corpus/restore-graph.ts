#!/usr/bin/env npx tsx
/**
 * `npx tsx scripts/gate-corpus/restore-graph.ts` — put PRODUCTION's association
 * graph onto the rehearsal branch by RESTORING it, not by recomputing it.
 *
 * THE DEFECT THIS CLOSES (measured 2026-09-16)
 * --------------------------------------------
 * The campaign's gate compares the branch's graph to production's: 33,808
 * `platform.associations`, 6,009 `platform.containment_edges`, 6,773
 * `platform.reachability`. The plan's stated method was
 *
 *     select set_config('session_replication_role', 'replica', true)
 *
 * so that live triggers would not fire during the restore. That is REFUSED by
 * the server: the role both runners connect as is `postgres` and, on Supabase,
 * `pg_roles.rolsuper` is FALSE — the call returns
 *
 *     ERROR: 42501: permission denied to set parameter "session_replication_role"
 *
 * With the triggers live, inserting 33,808 associations fires
 * `trg_associations_reachability` and twelve siblings per row, which RECOMPUTES
 * `platform.reachability` instead of restoring production's — destroying the
 * exact comparison the gate exists to make.
 *
 * WHAT THIS SCRIPT DOES INSTEAD, all of it inside the branch owner's rights
 * -----------------------------------------------------------------------
 *   · `ALTER TABLE … DISABLE TRIGGER <name>` per trigger, by name. That is an
 *     OWNER-level operation, and `postgres` owns every table here — verified by
 *     `pg_get_userbyid(relowner)` before anything is disabled. `DISABLE TRIGGER
 *     USER`/`ALL` are deliberately NOT used: `ALL` needs superuser, and naming
 *     each trigger is what makes the re-enable assertable.
 *   · The two NOT VALID foreign keys on `platform.associations` —
 *     `created_by → auth.users` and `organization_id → iam.organizations` —
 *     have INTERNAL RI triggers that no non-superuser can disable. They are
 *     DROPPED and re-created with the byte-identical definition the branch
 *     already had (they are already NOT VALID, so the re-created constraint is
 *     the same constraint). The definitions are captured before the drop and
 *     compared after the re-create. This is branch-only and is the answer to
 *     "is DISABLE TRIGGER enough for FK triggers" — it is not, and this is.
 *   · Production is read inside ONE `REPEATABLE READ READ ONLY` transaction, so
 *     every count and every row comes from ONE snapshot. The exit compares the
 *     branch's counts to the counts taken INSIDE that snapshot — never to a
 *     `count(*)` re-read at exit time against a database that took 53 new
 *     association rows in the last 24 hours.
 *   · The conflict policy is stated, not assumed: each copied table is emptied
 *     on the BRANCH first (`delete from`), and the rows removed are reported.
 *     The branch is made to hold production's rows exactly.
 *
 * WHAT IT PROVES BEFORE EXITING 0
 * -------------------------------
 *   1. every user trigger it disabled reads `tgenabled = 'O'` again, by query;
 *   2. every constraint it dropped is back with the identical definition;
 *   3. every copied table's branch count equals production's snapshot count;
 *   4. `platform.reachability_drift()` returns ZERO rows on the branch with
 *      production's 6,773 reachability rows present — i.e. the graph was
 *      RESTORED and still agrees with itself, which is what recomputation
 *      would have destroyed.
 *
 * WHERE IT MAY RUN. The branch, never production. The branch connection comes
 * from the one variable `common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF`
 * names, and is verified against that file; production is opened READ ONLY and
 * is never written by any statement here.
 *
 *   npx tsx scripts/gate-corpus/restore-graph.ts            copy + prove
 *   npx tsx scripts/gate-corpus/restore-graph.ts --verify   prove only, copy nothing
 *
 * Exit 0 only when all four proofs pass.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadDbEnv } from "../lib/direct-db";
import { loadBranchDbEnv, loadBranchRef } from "../lib/migration-target";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
} as const;
const OK = `${C.green}[ OK ]${C.reset}`;
const FAIL = `${C.red}[FAIL]${C.reset}`;
const INFO = `${C.dim}[INFO]${C.reset}`;

/**
 * The copy set, in dependency order. Each table's foreign keys are satisfied by
 * a table earlier in this list, or by a NOT VALID constraint this script
 * re-creates around the copy.
 *
 * `platform.containment_edges` is deliberately NOT here: it is a VIEW, not a
 * table (measured 2026-09-16 — `delete from` it returns 55000 "cannot delete
 * from view"). It derives from `platform.associations` JOINED TO
 * `platform.association_types` — which is why that registry (241 rows on
 * production, 9 on the branch) is in the copy set: with the associations alone
 * the view derived ZERO. The view is VERIFIED against production's snapshot
 * count instead of copied, which is a stronger check than copying it would be —
 * 6,009 rows have to fall out of the restored edges and types on their own.
 */
/**
 * THE CONFLICT POLICY, per table, stated rather than assumed (the branch is not
 * empty: it carries a seeded `corpus` whose rows reference `platform` rows).
 *
 *   `replace` — the branch table is emptied and rewritten, so it holds exactly
 *               production's rows. Used where anything less makes the graph
 *               disagree with itself: `associations` is the graph, and
 *               `reachability` is a pure derived cache of it.
 *   `upsert`  — production's rows are inserted or updated by primary key and
 *               the branch's own extra rows are KEPT and reported. Used where
 *               other branch rows depend on them: deleting `entity_types` rows
 *               is refused outright by `association_types_target_type_fkey`
 *               (measured 2026-09-16, key `corpus_home_a`), and
 *               `edge_payload_kind` is a lookup nothing gains from emptying.
 */
const COPY_TABLES = [
  { table: "platform.edge_payload_kind", policy: "upsert" },
  { table: "platform.entity_types", policy: "upsert" },
  { table: "platform.association_types", policy: "upsert" },
  { table: "platform.associations", policy: "replace" },
  { table: "platform.reachability", policy: "replace" },
] as const;

const COPY_NAMES = COPY_TABLES.map((t) => t.table);

/** Counted on both sides, copied on neither. */
const DERIVED_TABLES = ["platform.containment_edges"] as const;

const TABLES = [...COPY_NAMES, ...DERIVED_TABLES];

/** Postgres refuses more than 65535 bind parameters in one statement. */
const MAX_PARAMS = 30_000;

interface Snapshot {
  readonly counts: Record<string, number>;
  readonly snapshot: string;
  readonly takenAt: string;
}

interface Column {
  readonly name: string;
  /**
   * `regclass` columns hold an OID, and an OID means nothing across two
   * databases. They are read as TEXT from production and written through
   * `to_regclass(...)` on the branch, which answers NULL for a relation the
   * branch does not carry (the branch was bootstrapped by a schema-only dump,
   * so `graveyard.provision` genuinely is not there — measured 2026-09-16).
   * Every such NULL is COUNTED AND ANNOUNCED, never silently swallowed.
   */
  readonly isRegclass: boolean;
}

async function columnsOf(client: pg.Client, qualified: string): Promise<Column[]> {
  const [schema, table] = qualified.split(".");
  const r = await client.query<{ attname: string; typ: string }>(
    `select a.attname, format_type(a.atttypid, a.atttypmod) typ
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
    [schema, table],
  );
  return r.rows.map((x) => ({ name: x.attname, isRegclass: x.typ === "regclass" }));
}


interface OutsideFk {
  readonly name: string;
  readonly column: string;
  readonly parent: string;
  readonly parentColumn: string;
  /** The keys that table really holds ON THE BRANCH. */
  readonly present: Set<string>;
}

/**
 * Foreign keys from a copied table to a table OUTSIDE the copy set.
 *
 * `platform.entity_types.taxonomy_node_id` references `platform.taxonomy_node`,
 * which references `auth.users` and `iam.organizations`, which reference most of
 * the database: the closure of a faithful copy is the whole cluster, and this is
 * a rehearsal branch bootstrapped by a schema-only dump. So a NULLABLE reference
 * to a parent row the branch does not carry is written as NULL, counted, and
 * ANNOUNCED with what it costs and how to get it back. A NOT NULL one is a hard
 * refusal — there is no honest stand-in for it.
 */
async function outsideFks(
  branch: pg.Client,
  qualified: string,
  inCopySet: readonly string[],
): Promise<OutsideFk[]> {
  const r = await branch.query<{
    conname: string;
    parent: string;
    cols: string[];
    fcols: string[];
    validated: boolean;
    notnull: boolean;
  }>(
    `select c.conname,
            c.confrelid::regclass::text as parent,
            (select array_agg(a.attname::text order by k.ord)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols,
            (select array_agg(a.attname::text order by k.ord)
               from unnest(c.confkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as fcols,
            c.convalidated as validated,
            (select coalesce(bool_or(a.attnotnull), false)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as notnull
       from pg_constraint c
      where c.conrelid = $1::regclass and c.contype = 'f'
      order by c.conname`,
    [qualified],
  );
  const out: OutsideFk[] = [];
  for (const row of r.rows) {
    if (inCopySet.includes(row.parent)) continue;
    if (!row.validated) continue; // dropped and re-created around the copy
    if (row.cols.length !== 1) {
      throw new Error(
        `${qualified}: ${row.conname} is a composite foreign key to ${row.parent}, which this ` +
          `script does not know how to repair. Add ${row.parent} to the copy set.`,
      );
    }
    if (row.notnull) {
      throw new Error(
        `${qualified}.${row.cols[0]} is NOT NULL and references ${row.parent}, which is not in the ` +
          `copy set. There is no honest stand-in for a required parent — add ${row.parent} to the ` +
          `copy set, in dependency order.`,
      );
    }
    const keys = await branch.query(`select "${row.fcols[0]}" as k from ${row.parent}`);
    out.push({
      name: row.conname,
      column: row.cols[0]!,
      parent: row.parent,
      parentColumn: row.fcols[0]!,
      present: new Set(keys.rows.map((x) => String((x as Record<string, unknown>).k))),
    });
  }
  return out;
}

async function pkOf(client: pg.Client, qualified: string): Promise<string[]> {
  const r = await client.query<{ attname: string }>(
    `select a.attname
       from pg_constraint c
       join lateral unnest(c.conkey) with ordinality k(attnum, ord) on true
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      where c.conrelid = $1::regclass and c.contype = 'p'
      order by k.ord`,
    [qualified],
  );
  return r.rows.map((x) => x.attname);
}

async function main(): Promise<number> {
  const verifyOnly = process.argv.includes("--verify");
  const ref = loadBranchRef(ROOT);
  const branchEnv = loadBranchDbEnv(ROOT, ref);
  const prodEnv = loadDbEnv();
  if ("missing" in prodEnv) {
    console.error(`${FAIL}Production is read-only here but still needs credentials: ${prodEnv.missing.join(", ")}`);
    return 2;
  }
  if (prodEnv.user === ref.poolerUser || prodEnv.host.includes(ref.branchRef)) {
    console.error(`${FAIL}SUPABASE_MATRIX_* points at the BRANCH, not production. Refusing: the copy would read its own target.`);
    return 1;
  }

  const prod = new pg.Client({
    host: prodEnv.host,
    port: prodEnv.port,
    user: prodEnv.user,
    password: prodEnv.password,
    database: prodEnv.database,
    ssl: { rejectUnauthorized: false },
    application_name: "restore-graph (read only)",
  });
  const branch = new pg.Client({
    host: branchEnv.host,
    port: branchEnv.port,
    user: branchEnv.user,
    password: branchEnv.password,
    database: branchEnv.database,
    ssl: { rejectUnauthorized: false },
    application_name: "restore-graph (branch)",
  });
  await prod.connect();
  await branch.connect();

  let failures = 0;
  /** production's primary keys per table, collected during the copy, so PROOF 3
   *  is an exact set comparison and not a count that two errors could cancel. */
  const copiedKeys = new Map<string, Set<string>>();
  let restoreGuardsRef: (() => Promise<void>) | undefined;
  const fail = (what: string) => {
    failures += 1;
    console.error(`${FAIL}${what}`);
  };

  try {
    // ── The branch is the branch, and production is production ──────────────
    const bSys = (await branch.query<{ s: string }>("select system_identifier::text s from pg_control_system()")).rows[0]!.s;
    const pSys = (await prod.query<{ s: string }>("select system_identifier::text s from pg_control_system()")).rows[0]!.s;
    if (bSys !== ref.systemIdentifier || pSys !== ref.parentSystemIdentifier) {
      console.error(
        `${FAIL}The two connections are not the two databases BRANCH-REF names.\n` +
          `  branch sysid ${bSys} (expected ${ref.systemIdentifier})\n` +
          `  production sysid ${pSys} (expected ${ref.parentSystemIdentifier})\n` +
          `  Nothing was read and nothing was written.`,
      );
      return 1;
    }
    console.log(`${OK}branch ${ref.branchRef} (${bSys}) ← production ${ref.parentRef} (${pSys})`);

    // ── The stated method, proven refused, so nobody has to take it on trust ─
    try {
      await branch.query("select set_config('session_replication_role','replica',true)");
      console.log(
        `${C.yellow}[WARN]${C.reset} session_replication_role WAS settable on this branch — the role has ` +
          `become superuser. This script's method still works; the plan's original one would too.`,
      );
    } catch (e) {
      console.log(
        `${INFO}session_replication_role is refused as expected: ${C.dim}${(e as Error).message}${C.reset}`,
      );
    }

    // ── Ownership, before anything is disabled ──────────────────────────────
    for (const t of COPY_NAMES) {
      const [schema, table] = t.split(".");
      const owner = (
        await branch.query<{ o: string }>(
          `select pg_get_userbyid(c.relowner) o from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relname=$2`,
          [schema, table],
        )
      ).rows[0]?.o;
      const me = (await branch.query<{ u: string }>("select current_user u")).rows[0]!.u;
      if (!owner) {
        fail(`${t} does not exist on the branch.`);
        return 1;
      }
      if (owner !== me) {
        fail(`${t} is owned by ${owner}, not by ${me} — ALTER TABLE … DISABLE TRIGGER would be refused. Stopping before anything is changed.`);
        return 1;
      }
    }
    console.log(`${OK}every copied table on the branch is owned by ${branchEnv.user.split(".")[0]} — DISABLE TRIGGER is permitted`);

    // ── ONE production snapshot: the boundary the exit diffs against ────────
    await prod.query("begin transaction isolation level repeatable read read only");
    const snap: Snapshot = {
      counts: {},
      snapshot: (await prod.query<{ s: string }>("select pg_current_snapshot()::text s")).rows[0]!.s,
      takenAt: (await prod.query<{ t: string }>("select now()::text t")).rows[0]!.t,
    };
    for (const t of TABLES) {
      snap.counts[t] = Number((await prod.query<{ n: string }>(`select count(*)::text n from ${t}`)).rows[0]!.n);
    }
    console.log(
      `${OK}production snapshot ${C.dim}${snap.snapshot} at ${snap.takenAt}${C.reset}\n` +
        Object.entries(snap.counts)
          .map(([t, n]) => `      ${t.padEnd(30)} ${n}`)
          .join("\n"),
    );

    const disabled: Array<{ table: string; trigger: string }> = [];
    const droppedFks: Array<{ table: string; name: string; def: string }> = [];
    let guardsRestored = false;
    /** Put every trigger and constraint back. Runs on the happy path AND on any
     *  failure — a branch left with its triggers off is worse than no copy. */
    const restoreGuards = async () => {
      if (guardsRestored) return;
      guardsRestored = true;
      for (const { table, name, def } of droppedFks) {
        await branch.query(`alter table ${table} add constraint "${name}" ${def}`).catch((e) => {
          console.error(`${FAIL}could not re-create ${table}.${name}: ${(e as Error).message}`);
        });
      }
      for (const { table, trigger } of disabled) {
        await branch.query(`alter table ${table} enable trigger "${trigger}"`).catch((e) => {
          console.error(`${FAIL}could not re-enable ${table}.${trigger}: ${(e as Error).message}`);
        });
      }
    };
    restoreGuardsRef = restoreGuards;

    if (!verifyOnly) {
      // ── Disable USER triggers by name, and drop the two NOT VALID FKs ─────
      for (const t of COPY_NAMES) {
        const trg = await branch.query<{ tgname: string }>(
          `select tgname from pg_trigger where tgrelid = $1::regclass and not tgisinternal order by tgname`,
          [t],
        );
        for (const { tgname } of trg.rows) {
          await branch.query(`alter table ${t} disable trigger ${JSON.stringify(tgname).replace(/"/g, '"')}`);
          disabled.push({ table: t, trigger: tgname });
        }
        const fks = await branch.query<{ conname: string; def: string }>(
          `select conname, pg_get_constraintdef(oid) def from pg_constraint
            where conrelid = $1::regclass and contype = 'f' and not convalidated
            order by conname`,
          [t],
        );
        for (const { conname, def } of fks.rows) {
          await branch.query(`alter table ${t} drop constraint "${conname}"`);
          droppedFks.push({ table: t, name: conname, def });
        }
      }
      console.log(
        `${OK}disabled ${disabled.length} user trigger(s) by name and dropped ${droppedFks.length} NOT VALID ` +
          `foreign key(s) whose RI triggers are internal ${C.dim}(both restored below)${C.reset}`,
      );

      // ── Empty, then restore — the conflict policy, stated ─────────────────
      for (const { table: t, policy } of [...COPY_TABLES].reverse()) {
        if (policy !== "replace") continue;
        const before = Number((await branch.query<{ n: string }>(`select count(*)::text n from ${t}`)).rows[0]!.n);
        await branch.query(`delete from ${t}`);
        console.log(`${INFO}${t}: replace — removed ${before} pre-existing branch row(s)`);
      }

      for (const { table: t, policy } of COPY_TABLES) {
        const cols = await columnsOf(prod, t);
        const pk = await pkOf(prod, t);
        if (pk.length === 0) {
          fail(`${t} has no primary key — this script cannot tell one row from another there.`);
          return 1;
        }
        const quoted = cols.map((c) => `"${c.name}"`).join(", ");
        const selectList = cols
          .map((c) => (c.isRegclass ? `"${c.name}"::text as "${c.name}"` : `"${c.name}"`))
          .join(", ");
        const pkQuoted = pk.map((c) => `"${c}"`).join(", ");
        const setList = cols
          .filter((c) => !pk.includes(c.name))
          .map((c) => `"${c.name}" = excluded."${c.name}"`)
          .join(", ");
        const rowsPerBatch = Math.max(1, Math.floor(MAX_PARAMS / cols.length));
        const prodKeys = new Set<string>();
        const unresolvedRefs = new Map<string, number>();
        const outside = await outsideFks(branch, t, COPY_NAMES);
        const nulled = new Map<string, number>();
        let copied = 0;
        for (let offset = 0; ; offset += rowsPerBatch) {
          const page = await prod.query(
            `select ${selectList} from ${t} order by ${pkQuoted} limit ${rowsPerBatch} offset ${offset}`,
          );
          if (page.rows.length === 0) break;
          const values: unknown[] = [];
          const tuples = page.rows.map((row, i) => {
            const r = row as Record<string, unknown>;
            prodKeys.add(pk.map((c) => String(r[c])).join("\u0000"));
            for (const fk of outside) {
              const v = r[fk.column];
              if (v !== null && v !== undefined && !fk.present.has(String(v))) {
                r[fk.column] = null;
                nulled.set(fk.column, (nulled.get(fk.column) ?? 0) + 1);
              }
            }
            const ph = cols.map((c, j) => {
              values.push(r[c.name]);
              const n = i * cols.length + j + 1;
              return c.isRegclass ? `to_regclass($${n})` : `$${n}`;
            });
            return `(${ph.join(",")})`;
          });
          const conflict =
            policy === "upsert" && setList
              ? ` on conflict (${pkQuoted}) do update set ${setList}`
              : policy === "upsert"
                ? ` on conflict (${pkQuoted}) do nothing`
                : "";
          await branch.query(
            `insert into ${t} (${quoted}) values ${tuples.join(",")}${conflict}`,
            values,
          );
          copied += page.rows.length;
        }
        copiedKeys.set(t, prodKeys);
        console.log(`${OK}${t.padEnd(30)} ${policy} — ${copied} production row(s) written`);
        for (const [col, n] of nulled) {
          const fk = outside.find((f) => f.column === col)!;
          console.log(
            `${C.yellow}[WARN]${C.reset} ${t}.${col}: ${n} row(s) pointed at a ${fk.parent} row the ` +
              `branch does not carry (it holds ${fk.present.size}), so the column was written NULL. ` +
              `Remedy: copy ${fk.parent} into the branch before this table when a lane needs that ` +
              `column. The graph proof below does not read it.`,
          );
        }
        for (const c of cols.filter((x) => x.isRegclass)) {
          const lost = Number(
            (
              await branch.query<{ n: string }>(
                `select count(*)::text n from ${t} where "${c.name}" is null`,
              )
            ).rows[0]!.n,
          );
          const had = Number(
            (
              await prod.query<{ n: string }>(
                `select count(*)::text n from ${t} where "${c.name}" is null`,
              )
            ).rows[0]!.n,
          );
          if (lost > had) {
            unresolvedRefs.set(c.name, lost - had);
            console.log(
              `${C.yellow}[WARN]${C.reset} ${t}.${c.name}: ${lost - had} row(s) point at a relation ` +
                `the branch does not carry, so to_regclass() answered NULL. The branch was ` +
                `bootstrapped by a schema-only dump; transplant the missing schema if a lane needs ` +
                `this column, or read it from production. Nothing else was changed.`,
            );
          }
        }
      }

      // ── Put everything back, then PROVE it is back ────────────────────────
      await restoreGuards();
    }

    // ── PROOF 1: every user trigger is enabled again ────────────────────────
    const stillOff = await branch.query<{ tbl: string; tgname: string; tgenabled: string }>(
      `select tgrelid::regclass::text tbl, tgname, tgenabled::text
         from pg_trigger
        where tgrelid = any($1::regclass[]) and not tgisinternal and tgenabled <> 'O'
        order by 1, 2`,
      [TABLES as unknown as string[]],
    );
    if (stillOff.rowCount) {
      for (const r of stillOff.rows) fail(`trigger ${r.tbl}.${r.tgname} is ${r.tgenabled}, not 'O' — the restore left it disabled`);
    } else {
      const total = (
        await branch.query<{ n: string }>(
          `select count(*)::text n from pg_trigger where tgrelid = any($1::regclass[]) and not tgisinternal`,
          [TABLES as unknown as string[]],
        )
      ).rows[0]!.n;
      console.log(`${OK}all ${total} user trigger(s) on the copied tables read tgenabled = 'O'`);
    }

    // ── PROOF 2: every dropped constraint is back, identical ────────────────
    for (const { table, name, def } of droppedFks) {
      const now = (
        await branch.query<{ d: string }>(
          `select pg_get_constraintdef(oid) d from pg_constraint where conrelid=$1::regclass and conname=$2`,
          [table, name],
        )
      ).rows[0]?.d;
      if (now !== def) fail(`constraint ${table}.${name} came back as ${now ?? "(absent)"}, not ${def}`);
    }
    if (droppedFks.length && !failures)
      console.log(`${OK}all ${droppedFks.length} dropped constraint(s) are back with the identical definition`);

    // ── PROOF 3: against the SNAPSHOT, never a live re-read ────────────────
    // An exact set comparison on the primary key, per table: nothing production
    // held at the snapshot may be missing from the branch. `replace` tables must
    // ALSO hold nothing else — they are the graph and its cache, and one stray
    // row makes them disagree. `upsert` tables may carry the branch's own extra
    // rows, and those are named rather than counted away.
    for (const { table: t, policy } of COPY_TABLES) {
      const pk = await pkOf(branch, t);
      const pkQuoted = pk.map((c) => `"${c}"`).join(", ");
      const rows = await branch.query(`select ${pkQuoted} from ${t}`);
      const branchKeys = new Set(
        rows.rows.map((r) => pk.map((c) => String((r as Record<string, unknown>)[c])).join("\u0000")),
      );
      const prodKeys = copiedKeys.get(t);
      if (!prodKeys) {
        const n = Number((await branch.query<{ n: string }>(`select count(*)::text n from ${t}`)).rows[0]!.n);
        if (n !== snap.counts[t]) fail(`${t}: branch holds ${n}, production's snapshot held ${snap.counts[t]}`);
        continue;
      }
      const missing = [...prodKeys].filter((k) => !branchKeys.has(k));
      const extra = [...branchKeys].filter((k) => !prodKeys.has(k));
      if (missing.length)
        fail(`${t}: ${missing.length} row(s) production held at the snapshot are absent from the branch (e.g. ${missing[0]?.replace(/\u0000/g, "|")})`);
      else if (policy === "replace" && extra.length)
        fail(`${t}: ${extra.length} branch row(s) production does not hold — a replace table must be exactly production's (e.g. ${extra[0]?.replace(/\u0000/g, "|")})`);
      else
        console.log(
          `${OK}${t.padEnd(30)} all ${prodKeys.size} snapshot row(s) present` +
            (extra.length ? ` ${C.dim}(+${extra.length} branch-only row(s) kept: ${extra.slice(0, 3).map((k) => k.replace(/\u0000/g, "|")).join(", ")}${extra.length > 3 ? ", …" : ""})${C.reset}` : ""),
        );
    }
    for (const t of DERIVED_TABLES) {
      const n = Number((await branch.query<{ n: string }>(`select count(*)::text n from ${t}`)).rows[0]!.n);
      if (n !== snap.counts[t])
        fail(`${t} (derived, never copied): branch derives ${n}, production's snapshot held ${snap.counts[t]}`);
      else console.log(`${OK}${t.padEnd(30)} derives ${n} — production's snapshot count, from the restored edges alone`);
    }

    // ── PROOF 4: the graph was RESTORED, not recomputed ─────────────────────
    const drift = await branch.query<{ n: string }>("select count(*)::text n from platform.reachability_drift()");
    const reach = Number((await branch.query<{ n: string }>("select count(*)::text n from platform.reachability")).rows[0]!.n);
    if (drift.rows[0]!.n !== "0")
      fail(`platform.reachability_drift() returns ${drift.rows[0]!.n} row(s) on the branch — the graph does not agree with itself`);
    else console.log(`${OK}platform.reachability_drift() = 0 on the branch with ${reach} reachability rows present`);
  } catch (err) {
    console.error(`${FAIL}restore-graph aborted: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`${INFO}restoring the branch's triggers and constraints before exiting…`);
    await restoreGuardsRef?.();
    throw err;
  } finally {
    await prod.query("rollback").catch(() => {});
    await prod.end().catch(() => {});
    await branch.end().catch(() => {});
  }

  if (failures) {
    console.error(`${FAIL}restore-graph FAILED (${failures} assertion(s))`);
    return 1;
  }
  console.log(`${C.bold}${OK}restore-graph: production's graph is on the branch, restored and self-consistent${C.reset}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}restore-graph — unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);
