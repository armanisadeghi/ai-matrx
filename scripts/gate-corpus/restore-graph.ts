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
 *     OWNER-level operation, and `postgres` owns every table this script must
 *     disable a trigger on — verified by `pg_get_userbyid(relowner)` before
 *     anything is disabled. `auth.users` and `auth.oauth_clients` are owned by
 *     `supabase_auth_admin`; they are copied without owner rights BECAUSE the
 *     script proves per table that they carry zero user triggers and zero NOT
 *     VALID foreign keys, so there is nothing to disable and nothing to drop. `DISABLE TRIGGER
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
 *   4. THE ANTI-VACUITY FLOOR — `iam.permissions`, `iam.organizations`,
 *      `iam.memberships`, `auth.users` and `platform.entity_relationships` each
 *      hold at least production's snapshot count. This is the proof ATTACK-4
 *      finding 1 was missing: without it every "over the copied real graph"
 *      clause passed over an access set holding 0.1% of production's grants,
 *      and "lost 0, gained 0" is what an empty set returns;
 *   5. `platform.reachability_drift()` returns ZERO rows on the branch with
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
 * `--verify` compares the branch to the BOUNDARY THE COPY RECORDED — a row in
 * `restore_graph.run` on the branch holding the production snapshot id,
 * the per-table counts taken inside it, and the branch-only rows the policy kept
 * — never to a fresh read of production. Production takes new association rows
 * all day; a verifier that re-reads it fails because the world moved, which says
 * nothing about whether the copy is intact.
 *
 * Exit 0 only when all five proofs pass.
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
/**
 * THE ACCESS HALF — added 2026-09-16 after ATTACK-4 finding 1.
 *
 * Until this commit the copy set was the five `platform` tables below the
 * `── containment ──` line and NOTHING ELSE, while `W0-DATA`'s exit proof, every
 * "over the copied real graph" clause, `V2-ACCESS`'s lost-0/gained-0 diff and
 * `W7-GATE`'s Test 1 all read the ACCESS graph. Measured on the branch against
 * production the moment somebody looked: `iam.permissions` 6 / 4,603 ·
 * `iam.organizations` 3 / 422 · `iam.memberships` 5 / 584 · `auth.users` 14 / 478
 * · `auth.oauth_clients` 0 / 86. "Lost 0, gained 0" is what an empty set returns,
 * so the gate the whole campaign exists to pass would have gone green over 0.1%
 * of production's grants.
 *
 * WHICH TABLES, AND WHY EXACTLY THESE. Not a guess and not a wish-list: the set
 * is the transitive read set of `iam.has_access_for_base`'s SIXTEEN ARMS, taken
 * from the live function bodies with SQL comments and string literals STRIPPED
 * (the naive read pulls in `context.scope_types`, `ui.ui_surface`, `chat.message`
 * and a dozen more that appear only inside comments). The arms and what each one
 * reads, measured 2026-09-16 against production:
 *
 *   iam.has_access_for_base            iam.membership_grant, iam.memberships,
 *                                      iam.system_orgs, platform.entity_relationships,
 *                                      platform.entity_types, platform.reachability,
 *                                      platform.rulebook
 *   public.user_can_read_via_library_grant  iam.org_industries, iam.organization_member,
 *                                      platform.entity_grants
 *   public.library_is_open             platform.entity_grants
 *   public.is_pack_curator             iam.industry_curators, seo.starter_pack
 *   public.is_rulebook_curator         iam.industry_curators, platform.rulebook
 *   public.is_org_admin_for            iam.organization_member
 *   public.is_super_admin_for          admin.admins   (via public.is_admin)
 *   public.has_permission_for          iam.organization_member, iam.permissions,
 *                                      platform.entity_types
 *   public._edu_can_read_via_assignment  iam.memberships, platform.associations_live
 *   iam.has_org_access_for             iam.organization_member, iam.system_orgs
 *   iam.class_lanes                    platform.entity_relationships, platform.entity_types
 *   iam.token_is_parented_component    platform.entity_relationships, platform.entity_types
 *   platform.entity_row_access_attrs   platform.entity_types (+ the row's OWN table, resolved
 *                                      at run time — that is every entity table and is not
 *                                      copyable; it is why this rehearsal proves the ACCESS
 *                                      decision and not every row's contents)
 *   iam.table_has_visibility           (no tables)
 *
 * `iam.organization_member` and `platform.associations_live` are VIEWS
 * (`iam.memberships` and `platform.associations` respectively) — they are
 * VERIFIED against production's snapshot, never copied. So are
 * `platform.containment_edges` and every count in DERIVED_TABLES.
 *
 * `iam.industries`, `platform.assurance_level` and `platform.source_authority`
 * are in the set for a different reason: they are NOT NULL foreign-key parents of
 * tables that ARE (`iam.industry_curators.industry_id`,
 * `iam.org_industries.industry_id`, and `platform.rulebook`'s two lookups). There
 * is no honest stand-in for a required parent.
 *
 * `auth.oauth_clients` is in the set because `W0-DATA`'s exit names it and
 * §5.9's extension and desktop lanes sign in through it — not because an access
 * arm reads it (none does).
 */
interface CopyTable {
  readonly table: string;
  readonly policy: "upsert" | "replace";
  /** A SHELL: only these columns are read from production. See `auth.users`. */
  readonly columns?: readonly string[];
  readonly columnsNote?: string;
  /** Not owned by the connecting role. Proven at run time to need no owner right. */
  readonly notOurs?: boolean;
}

const COPY_TABLES: readonly CopyTable[] = [
  // ── the access half — parents first, in foreign-key order ────────────────
  {
    table: "auth.users",
    policy: "upsert",
    /**
     * A SHELL, and the word is load-bearing. Every column that IS an
     * authentication secret — `encrypted_password`, every `*_token*`, every
     * `email_change*`, `phone*`, `*_sent_at` — is NOT copied and is left at the
     * branch's own default, and this script SAYS SO on every run with what it
     * costs. What is copied is identity: the `id` the whole access graph's
     * foreign keys point at, and enough of the row for a lane to recognise the
     * person.
     *
     * CONSEQUENCE, stated rather than discovered at 3 a.m.: NOBODY CAN SIGN IN
     * ON THE BRANCH AS A COPIED USER. A lane that needs a signed-in session on
     * the branch mints its own user through the branch's Supabase Auth API (the
     * branch's own keys come from GET /v1/projects/<branch_ref>/api-keys, see
     * BRANCH-REF) — it does not get one from here.
     */
    columns: [
      "id",
      "aud",
      "role",
      "email",
      "email_confirmed_at",
      "last_sign_in_at",
      "raw_app_meta_data",
      "raw_user_meta_data",
      "is_super_admin",
      "created_at",
      "updated_at",
      "banned_until",
      "is_sso_user",
      "deleted_at",
      "is_anonymous",
    ],
    columnsNote:
      "shell — every password, token and email/phone-change column is left unset; no copied " +
      "user can sign in on the branch",
    /**
     * `auth.users` and `auth.oauth_clients` are owned by `supabase_auth_admin`,
     * not by `postgres`, so `ALTER TABLE … DISABLE TRIGGER` is refused there
     * (42501 must be owner of table users — measured 2026-09-16). It does not
     * matter and the script proves why rather than assuming it: both carry ZERO
     * user triggers and ZERO `NOT VALID` foreign keys on the branch, so there is
     * nothing to disable and nothing to drop. `postgres` does hold INSERT and
     * DELETE on both (measured).
     */
    notOurs: true,
  },
  { table: "auth.oauth_clients", policy: "upsert", notOurs: true },
  { table: "iam.organizations", policy: "upsert" },
  // AFTER organizations: `iam_industries_organization_id_fkey` is a validated FK
  // to `iam.organizations` (measured 2026-09-16 — the copy aborted 23503 on it
  // when industries came first). The order below is ASSERTED against the
  // branch's own foreign-key graph before anything is written; see
  // `assertCopyOrder`.
  { table: "iam.industries", policy: "upsert" },
  { table: "admin.admins", policy: "upsert" },
  { table: "iam.membership_grant", policy: "upsert" },
  { table: "iam.memberships", policy: "upsert" },
  { table: "iam.permissions", policy: "upsert" },
  { table: "iam.system_orgs", policy: "upsert" },
  { table: "iam.industry_curators", policy: "upsert" },
  { table: "iam.org_industries", policy: "upsert" },
  { table: "platform.assurance_level", policy: "upsert" },
  { table: "platform.source_authority", policy: "upsert" },
  // ── the containment half — unchanged ─────────────────────────────────────
  { table: "platform.edge_payload_kind", policy: "upsert" },
  { table: "platform.entity_types", policy: "upsert" },
  { table: "platform.association_types", policy: "upsert" },
  { table: "platform.entity_relationships", policy: "upsert" },
  { table: "platform.associations", policy: "replace" },
  { table: "platform.reachability", policy: "replace" },
  // ── the two arms that read entity tables of their own ────────────────────
  { table: "platform.entity_grants", policy: "upsert" },
  { table: "platform.rulebook", policy: "upsert" },
  { table: "seo.starter_pack", policy: "upsert" },
];

const COPY_NAMES = COPY_TABLES.map((t) => t.table);

/**
 * Counted on both sides, copied on neither — every one of them is a VIEW, and
 * each one names the BASE table it derives from, because that is what decides
 * how its count must be judged.
 *
 *   base policy `replace` — the base holds exactly production's rows, so the
 *       view must derive exactly production's count. Anything else means the
 *       restore is not faithful.
 *   base policy `upsert`  — the base keeps the branch's own extra rows (the
 *       seeded corpus), so the view derives production's count PLUS however many
 *       of those extras satisfy it. The assertion is therefore a RANGE with both
 *       ends named, and the excess is printed and attributed — never waved
 *       through with a `>=`.
 */
const DERIVED_TABLES = [
  { view: "platform.containment_edges", base: "platform.associations" },
  { view: "platform.associations_live", base: "platform.associations" },
  { view: "iam.organization_member", base: "iam.memberships" },
] as const;

const DERIVED_NAMES = DERIVED_TABLES.map((d) => d.view);

/**
 * THE ANTI-VACUITY FLOOR (ATTACK-4 findings 1 and 25).
 *
 * `W7-GATE`'s clause asserted 33,809 associations and 6,773 reachability rows —
 * the two tables that WERE copied — so it could not catch the vacuity that was
 * actually there. These are the counts whose emptiness made every access proof
 * pass over nothing, and the floor is production's own snapshot count: a copy
 * that lands fewer is a FAILED copy, not a smaller one. Cite THIS list in a gate
 * clause, never a hand-typed number.
 */
const ANTI_VACUITY_FLOOR = [
  "iam.permissions",
  "iam.organizations",
  "iam.memberships",
  "auth.users",
  "platform.entity_relationships",
] as const;

const TABLES = [...COPY_NAMES, ...DERIVED_NAMES];

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
  /**
   * EVERY column is read as TEXT and written back with an explicit cast to this
   * type. That is not belt-and-braces, it is the only faithful round trip: the
   * node-postgres driver PARSES `jsonb` into a JavaScript value and re-sends
   * whatever that value stringifies to, so a `jsonb` column holding a JSON
   * STRING (`platform.rulebook.rules` — measured 2026-09-16) comes back as a JS
   * string and is re-sent as raw text, which Postgres then refuses with
   * `22P02 invalid input syntax for type json`. Postgres's own text
   * representation, cast back to the same type, cannot drift — it is what COPY
   * does.
   */
  readonly typ: string;
}

async function columnsOf(client: pg.Client, qualified: string): Promise<Column[]> {
  const [schema, table] = qualified.split(".");
  // GENERATED columns are excluded, always and everywhere — Postgres refuses a
  // non-DEFAULT value for one (428C9 "cannot insert a non-DEFAULT value into
  // column", measured 2026-09-16 on auth.users.confirmed_at). They are derived
  // from columns that ARE copied, so excluding them loses nothing; including
  // them aborts the whole copy mid-run.
  const r = await client.query<{ attname: string; typ: string }>(
    `select a.attname, format_type(a.atttypid, a.atttypmod) typ
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and a.attnum > 0 and not a.attisdropped
        and a.attgenerated = ''
      order by a.attnum`,
    [schema, table],
  );
  return r.rows.map((x) => ({
    name: x.attname,
    isRegclass: x.typ === "regclass",
    typ: x.typ,
  }));
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

/** The boundary the copy recorded, so `--verify` never re-reads a moving source. */
// NOT in `public`: the live platform._ddl_guard() event trigger refuses a NEW
// table there by name ("public keeps functions and RPCs, never tables"), and it
// is live on the branch. Its own schema, so `W0-CORPUS` owning `corpus` and this
// lane owning its boundary never collide.
const RUN_SCHEMA = "restore_graph";
const RUN_TABLE = `${RUN_SCHEMA}.run`;

async function ensureRunTable(branch: pg.Client): Promise<void> {
  await branch.query(`create schema if not exists ${RUN_SCHEMA}`);
  await branch.query(
    `create table if not exists ${RUN_TABLE} (
       id bigserial primary key,
       ran_at timestamptz not null default now(),
       prod_snapshot text not null,
       prod_taken_at text not null,
       counts jsonb not null,
       extras jsonb not null default '{}'::jsonb
     )`,
  );
}

/**
 * THE COPY ORDER IS ASSERTED, NOT TRUSTED.
 *
 * `COPY_TABLES` is hand-ordered, and a hand-ordered list rots: on 2026-09-16 the
 * access half was added with `iam.industries` before `iam.organizations` and the
 * copy died 23503 in the middle, after `auth.users` and `auth.oauth_clients` had
 * already been written and with the branch's triggers off. So the order is now
 * CHECKED against the branch's own foreign-key graph before a single row moves,
 * and a wrong order is a refusal that PRINTS a correct one.
 *
 * Edges considered: validated foreign keys between two tables that are both in
 * the copy set. Self-references are ignored (all such columns hold zero non-null
 * values — measured), and NOT VALID constraints are ignored because the copy
 * drops and re-creates them around itself.
 */
async function assertCopyOrder(branch: pg.Client): Promise<string[]> {
  const position = new Map(COPY_NAMES.map((t, i) => [t, i]));
  const parents = new Map<string, Set<string>>(COPY_NAMES.map((t) => [t, new Set<string>()]));
  const problems: string[] = [];
  for (const t of COPY_NAMES) {
    const r = await branch.query<{ conname: string; parent: string }>(
      `select c.conname, c.confrelid::regclass::text as parent
         from pg_constraint c
        where c.conrelid = $1::regclass and c.contype = 'f' and c.convalidated
        order by c.conname`,
      [t],
    );
    for (const { conname, parent } of r.rows) {
      if (parent === t) continue;
      if (!position.has(parent)) continue;
      parents.get(t)!.add(parent);
      if (position.get(parent)! > position.get(t)!) {
        problems.push(
          `${t} is copied at position ${position.get(t)} but its parent ${parent} (${conname}) is at ` +
            `${position.get(parent)} — the insert would fail 23503 halfway through the copy.`,
        );
      }
    }
  }
  if (problems.length) {
    // A correct order, printed so the fix is not a puzzle.
    const done: string[] = [];
    const left = new Set(COPY_NAMES);
    while (left.size) {
      const ready = [...left].filter((t) => [...parents.get(t)!].every((p) => done.includes(p)));
      if (!ready.length) {
        problems.push(`the foreign keys among the copy set form a CYCLE over: ${[...left].join(", ")}`);
        break;
      }
      for (const t of ready) {
        done.push(t);
        left.delete(t);
      }
    }
    throw new Error(
      `COPY_TABLES is out of dependency order:\n  ${problems.join("\n  ")}\n` +
        `  A dependency-correct order is:\n    ${done.join("\n    ")}`,
    );
  }
  return COPY_NAMES;
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
    // Owner rights are needed for exactly one thing: ALTER TABLE … DISABLE
    // TRIGGER (and dropping a NOT VALID foreign key). A table we do not own is
    // therefore fine IF AND ONLY IF it has nothing to disable and nothing to
    // drop — which is PROVEN here per table, never assumed. `auth.users` and
    // `auth.oauth_clients` are owned by `supabase_auth_admin` and carry zero
    // user triggers and zero NOT VALID foreign keys on the branch.
    const me = (await branch.query<{ u: string }>("select current_user u")).rows[0]!.u;
    const notOursOk: string[] = [];
    for (const { table: t, notOurs } of COPY_TABLES) {
      const [schema, table] = t.split(".");
      const owner = (
        await branch.query<{ o: string }>(
          `select pg_get_userbyid(c.relowner) o from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relname=$2`,
          [schema, table],
        )
      ).rows[0]?.o;
      if (!owner) {
        fail(`${t} does not exist on the branch.`);
        return 1;
      }
      if (owner === me) continue;
      if (!notOurs) {
        fail(`${t} is owned by ${owner}, not by ${me} — ALTER TABLE … DISABLE TRIGGER would be refused. Stopping before anything is changed.`);
        return 1;
      }
      const userTrg = Number(
        (
          await branch.query<{ n: string }>(
            `select count(*)::text n from pg_trigger where tgrelid = $1::regclass and not tgisinternal`,
            [t],
          )
        ).rows[0]!.n,
      );
      const notValid = Number(
        (
          await branch.query<{ n: string }>(
            `select count(*)::text n from pg_constraint where conrelid = $1::regclass and contype = 'f' and not convalidated`,
            [t],
          )
        ).rows[0]!.n,
      );
      const canWrite = (
        await branch.query<{ i: boolean; d: boolean }>(
          `select has_table_privilege(current_user,$1,'INSERT') i, has_table_privilege(current_user,$1,'DELETE') d`,
          [t],
        )
      ).rows[0]!;
      if (userTrg > 0 || notValid > 0) {
        fail(
          `${t} is owned by ${owner}, not by ${me}, AND it carries ${userTrg} user trigger(s) and ` +
            `${notValid} NOT VALID foreign key(s) on the branch. Those are exactly what this script ` +
            `must disable and drop, and only the owner may. It was marked \`notOurs\` on the ` +
            `understanding that it had neither — that is no longer true. Stopping before anything ` +
            `is changed.`,
        );
        return 1;
      }
      if (!canWrite.i) {
        fail(`${t} is owned by ${owner} and ${me} holds no INSERT on it. Stopping before anything is changed.`);
        return 1;
      }
      notOursOk.push(`${t} (owner ${owner}, 0 user triggers, 0 NOT VALID FKs, INSERT ${canWrite.i}, DELETE ${canWrite.d})`);
    }
    console.log(
      `${OK}every copied table this script must DISABLE TRIGGER on is owned by ${me}` +
        (notOursOk.length
          ? `\n${INFO}not ours, and proven not to need owner rights: ${notOursOk.join("; ")}`
          : ""),
    );

    // ── The declared copy order agrees with the branch's real FK graph ──────
    await assertCopyOrder(branch);
    console.log(`${OK}COPY_TABLES is in dependency order — asserted against the branch's own foreign keys`);

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
      for (const { table: t, notOurs } of COPY_TABLES) {
        if (notOurs) continue; // proven above to have nothing to disable or drop
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

      for (const entry of COPY_TABLES) {
        const { table: t, policy } = entry;
        const only = entry.columns;
        const allCols = await columnsOf(prod, t);
        const pk = await pkOf(prod, t);
        // A SHELL: only the named columns are read from production. Every other
        // column is left at the branch's own default, and what that costs is
        // printed — never discovered later by a lane that assumed a full row.
        let cols = allCols;
        if (only) {
          const known = new Set(allCols.map((c) => c.name));
          const unknown = only.filter((c) => !known.has(c));
          if (unknown.length) {
            fail(
              `${t}: the shell column list names ${unknown.join(", ")}, which production's ${t} ` +
                `does not have. The list is stale — fix it rather than copying a different shape.`,
            );
            return 1;
          }
          const missingRequired = allCols.filter(
            (c) => !only.includes(c.name) && !pk.includes(c.name),
          );
          cols = allCols.filter((c) => only.includes(c.name) || pk.includes(c.name));
          const dropped = missingRequired.map((c) => c.name);
          // An excluded column that is NOT NULL with no default on the BRANCH is
          // a refusal, not a surprise INSERT failure halfway through the copy.
          const [bs, bt] = t.split(".");
          const undefaulted = await branch.query<{ attname: string }>(
            `select a.attname
               from pg_attribute a
               join pg_class c on c.oid = a.attrelid
               join pg_namespace n on n.oid = c.relnamespace
               left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
              where n.nspname = $1 and c.relname = $2 and a.attnum > 0 and not a.attisdropped
                and a.attnotnull and d.adbin is null and not a.attidentity = any(array['a','d'])
                and a.attname = any($3::text[])`,
            [bs, bt, dropped],
          );
          if (undefaulted.rowCount) {
            fail(
              `${t}: the shell leaves out ${undefaulted.rows.map((r) => r.attname).join(", ")}, ` +
                `which is NOT NULL with no default on the branch. Copy it or give it a default — ` +
                `there is no honest stand-in.`,
            );
            return 1;
          }
          console.log(
            `${C.yellow}[WARN]${C.reset} ${t}: SHELL COPY — ${cols.length} of ${allCols.length} ` +
              `column(s) are copied. NOT copied, left at the branch's own default: ${dropped.join(", ")}. ` +
              `${entry.columnsNote ?? ""}`,
          );
        }
        if (pk.length === 0) {
          fail(`${t} has no primary key — this script cannot tell one row from another there.`);
          return 1;
        }
        const quoted = cols.map((c) => `"${c.name}"`).join(", ");
        // Read EVERY column as Postgres's own text form; see Column.typ.
        const selectList = cols.map((c) => `"${c.name}"::text as "${c.name}"`).join(", ");
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
              return c.isRegclass ? `to_regclass($${n})` : `$${n}::${c.typ}`;
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

    // ── PROOF 3: against the RECORDED BOUNDARY, never a live re-read ───────
    // On a copy run the boundary is this run's own snapshot and the comparison
    // is an exact primary-key set difference. On `--verify` the boundary is the
    // row the last copy WROTE: production takes new association rows all day
    // (33,808 at 02:54, 33,809 at 03:12 — measured), so a verifier that
    // re-reads production fails because the world moved, which says nothing
    // about whether the copy is intact.
    const extrasKept: Record<string, number> = {};
    if (!verifyOnly) {
      for (const { table: t, policy } of COPY_TABLES) {
        const pk = await pkOf(branch, t);
        const pkQuoted = pk.map((c) => `"${c}"`).join(", ");
        const rows = await branch.query(`select ${pkQuoted} from ${t}`);
        const branchKeys = new Set(
          rows.rows.map((r) => pk.map((c) => String((r as Record<string, unknown>)[c])).join("\u0000")),
        );
        const prodKeys = copiedKeys.get(t)!;
        const missing = [...prodKeys].filter((k) => !branchKeys.has(k));
        const extra = [...branchKeys].filter((k) => !prodKeys.has(k));
        extrasKept[t] = extra.length;
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
      for (const { view, base } of DERIVED_TABLES) {
        const n = Number((await branch.query<{ n: string }>(`select count(*)::text n from ${view}`)).rows[0]!.n);
        const want = snap.counts[view]!;
        const policy = COPY_TABLES.find((c) => c.table === base)?.policy;
        const slack = policy === "upsert" ? (extrasKept[base] ?? 0) : 0;
        extrasKept[view] = n - want;
        if (n < want || n > want + slack)
          fail(
            `${view} (derived from ${base}, never copied): branch derives ${n}, production's snapshot ` +
              `held ${want}` +
              (slack
                ? ` and ${base} kept ${slack} branch-only row(s), so anything from ${want} to ${want + slack} is honest — ${n} is not`
                : ` and ${base} is a \`replace\` table, so the count must be exact`),
          );
        else
          console.log(
            `${OK}${view.padEnd(30)} derives ${n} — production's ${want}` +
              (n - want
                ? ` + ${n - want} from ${base}'s ${slack} kept branch-only row(s)`
                : `, from the restored edges alone`),
          );
      }
      if (!failures) {
        await ensureRunTable(branch);
        await branch.query(
          `insert into ${RUN_TABLE} (prod_snapshot, prod_taken_at, counts, extras) values ($1, $2, $3::jsonb, $4::jsonb)`,
          [snap.snapshot, snap.takenAt, JSON.stringify(snap.counts), JSON.stringify(extrasKept)],
        );
        console.log(`${OK}boundary recorded in ${RUN_TABLE} — this is what --verify compares against`);
      }
    } else {
      await ensureRunTable(branch);
      const last = await branch.query<{
        ran_at: string; prod_snapshot: string; prod_taken_at: string;
        counts: Record<string, number>; extras: Record<string, number>;
      }>(`select ran_at::text, prod_snapshot, prod_taken_at, counts, extras from ${RUN_TABLE} order by id desc limit 1`);
      const boundary = last.rows[0];
      if (!boundary) {
        fail(
          `--verify has nothing to verify against: ${RUN_TABLE} is empty, so no copy has ever ` +
            `recorded its boundary on this branch. Run the copy first (without --verify).`,
        );
      } else {
        console.log(
          `${INFO}boundary: the copy of ${boundary.ran_at} against production snapshot ` +
            `${boundary.prod_snapshot} taken ${boundary.prod_taken_at}`,
        );
        for (const t of TABLES) {
          const n = Number((await branch.query<{ n: string }>(`select count(*)::text n from ${t}`)).rows[0]!.n);
          const want = Number(boundary.counts[t] ?? NaN) + Number(boundary.extras[t] ?? 0);
          if (!Number.isFinite(want)) fail(`${t}: the recorded boundary holds no count for it`);
          else if (n !== want)
            fail(`${t}: branch holds ${n}, the recorded boundary says ${boundary.counts[t]} restored + ${boundary.extras[t] ?? 0} branch-only = ${want}`);
          else
            console.log(
              `${OK}${t.padEnd(30)} ${n} — the boundary's ${boundary.counts[t]}` +
                (boundary.extras[t] ? ` + ${boundary.extras[t]} branch-only` : ""),
            );
        }
      }
    }

    // ── PROOF 4: THE ANTI-VACUITY FLOOR — the access half is not empty ──────
    // ATTACK-4 findings 1 and 25. `W7-GATE`'s anti-vacuity clause counted the
    // two tables that were being copied and could not see the tables that were
    // empty. This proof counts the ones whose emptiness makes an access proof
    // pass over nothing, against production's own snapshot count, and it is the
    // list a gate clause cites.
    {
      const floorSource = verifyOnly
        ? (
            await branch.query<{ counts: Record<string, number> }>(
              `select counts from ${RUN_TABLE} order by id desc limit 1`,
            )
          ).rows[0]?.counts
        : snap.counts;
      if (!floorSource) {
        fail(`the anti-vacuity floor has no boundary to read: ${RUN_TABLE} is empty.`);
      } else {
        for (const t of ANTI_VACUITY_FLOOR) {
          const n = Number((await branch.query<{ n: string }>(`select count(*)::text n from ${t}`)).rows[0]!.n);
          const floor = Number(floorSource[t] ?? NaN);
          if (!Number.isFinite(floor))
            fail(`${t} is in the anti-vacuity floor but the boundary holds no count for it — the copy set and the floor disagree.`);
          else if (n < floor)
            fail(
              `ANTI-VACUITY: ${t} holds ${n} row(s) on the branch, production's snapshot held ${floor}. ` +
                `Every "over the copied real graph" clause would pass over a set this size and prove nothing.`,
            );
          else console.log(`${OK}floor ${t.padEnd(30)} ${n} ≥ production's ${floor}`);
        }
      }
    }

    // ── PROOF 5: the graph was RESTORED, not recomputed ─────────────────────
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
