/**
 * A CLIENT-WRITABLE TABLE MAY NOT LEAVE A SECURITY COLUMN UNPINNED.
 *
 * WHAT THIS CLOSES. VERIFIER-8, 2026-09-21, CRITICAL-1 (feedback
 * `2bf46257-ac5f-4213-8a32-af2498979de9`). `iam.api_keys` was served over PostgREST with
 * INSERT granted to `authenticated`, and its `std_insert` RLS policy said:
 *
 *   WITH CHECK ( is_platform_admin()
 *     OR ( created_by = auth.uid()
 *          AND ( organization_id IS NULL OR iam.has_org_access(organization_id) OR … ) ) )
 *
 * It pinned `created_by`. It pinned `organization_id`. It said NOTHING about
 * `service_user_id` — the column that decides WHOSE IDENTITY a presented API key adopts —
 * and nothing about `secret_hash`, the digest the server compares the presented token
 * against. So any signed-in member could POST an ACTIVE key row carrying a secret of her
 * choosing and the organization owner's user id, present it to the AI server, and be
 * authenticated AS THE OWNER. Full account takeover, from a plain member's seat, over plain
 * HTTP. It was found by a human-written adversarial probe, not by any of the 245+ guards
 * this repo ships.
 *
 * WHY NO EXISTING GUARD COULD SEE IT. The guard family that sits on this exact surface —
 * `check:anon-write-surface`, `check:client-writes-are-granted`, `check:rls-on` — asks
 * whether RLS is ON and whether a grant exists. Both answers were YES here. Nothing asked
 * the only question that mattered: given that the client CAN write this row, does the policy
 * constrain the columns that decide who somebody is? VERIFIER-8's own words: those guards'
 * self-tests were not green, so "the guard that should have caught CRITICAL-1 cannot
 * currently prove itself." This one proves itself below.
 *
 * WHAT IT DOES. Reads the live catalog. For every table a client role (`authenticated` /
 * `anon`) may INSERT or UPDATE — table grant, column grant, or a grant to PUBLIC it
 * inherits, all three answered by `has_any_column_privilege` — it finds the permissive RLS
 * policies for that command and asks, for each SECURITY-BEARING column on the table,
 * whether the column's name appears anywhere in the policy's `WITH CHECK`. A column that
 * does not appear is not pinned: the client chooses its value.
 *
 * WHAT COUNTS AS CLOSED. A RESTRICTIVE policy for the same command whose `WITH CHECK` is
 * `false` refuses the write outright, so the table is CLOSED and nothing on it is a finding
 * — that is how `iam.api_keys` reads today. This is deliberate: the fix for this class is
 * to remove the door, not to add a pin beside it.
 *
 * SEVERITY. An identity or credential column (`*user_id`, `*_hash`, `token`, `secret*`,
 * `password*`, `role`, `is_*admin`, `permission_level`, `owner*`) is CRITICAL — an unpinned
 * one is the takeover shape. A state column (`status`, `active`, `enabled`, `visibility`)
 * is a WARNING: it is privilege-adjacent but rarely an identity. Only CRITICAL findings
 * fail the build, so the guard stays loud about the thing that actually bit us.
 *
 * 🚨 UNMEASURED IS NOT PASSED. No credentials, an unreachable database, or an empty answer
 * is a FAILURE with a banner, never a silent green.
 *
 *   pnpm check:unpinned-security-columns
 *   pnpm check:unpinned-security-columns:self-test
 *
 * THE SELF-TEST runs the classifier over the VERBATIM pre-fix `iam.api_keys` policy bytes —
 * the real ones, copied out of `pg_policy` at 14:19 UTC on 2026-09-21, before anything was
 * changed — and requires it to report `service_user_id` and `secret_hash` as CRITICAL; then
 * over the post-fix shape, and requires it to report nothing. A guard that cannot show you
 * the defect it was written for is doctrine, not a guard.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

/**
 * THE CENSUS THIS LANE INHERITED, AND WHY IT IS A BASELINE RATHER THAN 289 FAILURES.
 *
 * The first live run found 289 CRITICAL rows across the whole database. Every one is real in
 * the sense that the column is genuinely unpinned, but they are not 289 account-takeovers:
 * most are a `user_id` on a table whose policy pins `created_by = auth.uid()` — the same
 * shape as CRITICAL-1, which means each needs a human decision about whether that table's
 * door should exist at all. That is weeks of work across every feature schema, and it cannot
 * gate a release today.
 *
 * So this follows the repo's own ratchet convention (`scripts/settings-guards/FEATURE.md`:
 * "every guard with a baseline now has one that ONLY SHRINKS"). The known set is recorded;
 * ANY NEW finding fails, and any baseline entry that stops existing ALSO fails, so nobody can
 * quietly widen the surface and nobody can let the file rot into a permission slip. Adding a
 * finding to the baseline is not a way to clear it: only `--update-baseline`, run
 * deliberately after a fix, may rewrite the file, and it is reviewed in the diff.
 */
const BASELINE_PATH = resolve(process.cwd(), "scripts/unpinned-security-columns-baseline.json");

function keyOf(f: Finding): string {
  return `${f.schema}.${f.table}|${f.policy}|${f.cmd}|${f.column}`;
}

function readBaseline(): Set<string> {
  if (!existsSync(BASELINE_PATH)) return new Set();
  return new Set(JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as string[]);
}

const CLIENT_ROLES = ["authenticated", "anon"] as const;

/** Catalog identifiers only — they come from `pg_attribute`, never from a caller. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * A SECRET. Its value IS the credential, so an unpinned one lets the client choose what the
 * server will later accept — `iam.api_keys.secret_hash` exactly. Always CRITICAL.
 *
 * `*_hash` alone is deliberately NOT here: the live census (2026-09-21) found 748 unpinned
 * `*_hash` columns and almost all are CONTENT checksums (`content_hash`, `sync_base_hash`,
 * `input_contract_hash`) on admin-gated tables. Failing on those would bury the one finding
 * that matters, and a guard that cries wolf is a guard somebody mutes. A credential digest
 * is named as one.
 */
const SECRET_COLUMN = [
  /^secret/i,
  /_secret(_hash)?$/i,
  /password/i,
  /(^|_)token(_hash)?$/i,
  /api_key/i,
  /secret_hash$/i,
  /credential/i,
];

/**
 * 🚨 IN THIS CODEBASE "TOKEN" USUALLY MEANS A VOCABULARY KEY, NOT A SECRET.
 * `platform.entity_types.token`, `target_token`, `subject_token`, `entity_token` are registry
 * identifiers — the same word the Data Doctrine uses for an entity's name. Matching them as
 * credentials produced 48 false CRITICALs on the first live run, which is exactly how a guard
 * gets muted. `claim_token`, `webhook_secret`, `refresh_claim_token` and
 * `domain_verification_token` are NOT vocabulary: those really are secrets.
 *
 * 🚨 A BARE `token` IS THE ONE NAME THAT CANNOT BE TAKEN ON TRUST, AND IT HID THE SHARPEST
 * COLUMN IN THE DATABASE. (SECURITY-SWEEP, 2026-09-21.) This list used to carry a bare
 * `/^token$/i`, which exempted EVERY column literally named `token` — including
 * **`platform.share_links.token`, the share link's bearer credential**: the string in
 * `/s/<token>` that grants whatever `permission_level` the same row names, on a table any
 * signed-in person may INSERT. The guard dutifully reported that row's `short_token` — whose
 * own column comment says it is "a URL alias ONLY — carries no authorization" — and stayed
 * silent about the credential two columns away. `iam.invitations.token` and
 * `crm.unsubscribe_token.token` were hidden by the same line.
 *
 * The QUALIFIED names stay: `entity_token`, `target_token`, `subject_token`,
 * `reference_target_token` and `container_token` say in the name which registry they point
 * into, and the live census agrees (`hr.access_audit.target_token`, 2,131 rows, all entity
 * tokens). A bare `token` says nothing, so it must PROVE itself, per column:
 *   1. a FOREIGN KEY to `platform.entity_types(token)`; or
 *   2. the table is non-empty and every non-null value resolves to a live
 *      `platform.entity_types.token`; or
 *   3. **a value REPEATS across rows** (and rule 2 needs at least one non-null value: an
 *      all-NULL column resolves to any registry vacuously, which is how a first pass of this
 *      rule cleared `research.rs_topic.refresh_claim_token`, a lease token that is merely
 *      unset today). A bearer credential is never shared between two rows
 *      — that is what makes it a credential. A vocabulary token is shared by definition:
 *      `content_ir.kind_surface.token` holds "flashcards" twice and "mermaid" beside it,
 *      while `platform.share_links.token` is 366 distinct 64-character strings and
 *      `iam.invitations.token` 33 distinct uuids. This is the discriminator that does not
 *      depend on which registry a token points into, and it is asked of the data.
 * A table with no rows proves nothing and stays a finding. UNPROVEN IS NOT EXEMPT.
 *
 * The same three questions are asked of EVERY token-shaped column the name list does not
 * already clear, not just a bare `token` — the list is a fast path, the evidence is the rule.
 *
 * `credential_reference_kind` stays by name: it is a KIND ("oauth", "api_key"), it references
 * no registry, and no evidence rule would ever clear it.
 */
const VOCABULARY_NOT_A_SECRET = [
  /^entity_token$/i,
  /^target_token$/i,
  /^subject_token$/i,
  /^reference_target_token$/i,
  /^container_token$/i,
  /^credential_reference_kind$/i,
];

/**
 * WHO SOMEBODY IS, or WHAT THEY MAY DO. `iam.api_keys.service_user_id` is one of these: the
 * identity a presented key adopts. Unpinned, these are CRITICAL when the policy pins nothing
 * at all (a NULL `WITH CHECK`), because then the client rewrites the row's owner freely; with
 * a real `WITH CHECK` that pins something else they are a WARNING for a human to judge.
 */
const IDENTITY_COLUMN = [
  /user_id$/i,
  /^role$/i,
  /^is_.*admin$/i,
  /^permission_level$/i,
  /^owner(_id)?$/i,
  /^granted_to_/i,
];

/** Privilege-adjacent state. Real, but rarely an identity on its own — a warning. */
const STATE_COLUMN = [
  /^status$/i,
  /^active$/i,
  /^enabled$/i,
  /^visibility$/i,
  /^organization_id$/i,
  /^level$/i,
  /_hash$/i,
  /_version$/i,
];

export type Severity = "critical" | "warning";

export interface PolicyFacts {
  readonly schema: string;
  readonly table: string;
  readonly policy: string;
  /** 'a' INSERT · 'w' UPDATE · '*' ALL */
  readonly cmd: string;
  readonly withCheck: string | null;
  /**
   * 🚨 THE `USING` CLAUSE IS PART OF THE ANSWER, AND MISSING THAT IS A FALSE-ALARM FACTORY.
   * PostgreSQL: when `WITH CHECK` is omitted on an UPDATE or ALL policy, THE `USING`
   * EXPRESSION IS USED AS THE CHECK TOO. A first pass at this guard read a NULL `WITH CHECK`
   * as "nothing is pinned" and reported six policies as critical — including
   * `users.user_secrets` ("Users manage own secrets", USING `auth.uid() = user_id`), which is
   * in fact perfectly closed: you cannot move a secret onto another user, because that same
   * expression is applied to the new row. A guard that invents six account-takeovers is worse
   * than no guard. So the EFFECTIVE check is `withCheck ?? usingExpr`, and only a policy with
   * neither is genuinely unconstrained.
   */
  readonly usingExpr: string | null;
  readonly columns: readonly string[];
  /**
   * 🚨 A COLUMN THE CLIENT CANNOT WRITE IS NOT AN UNPINNED COLUMN. (SECURITY-SWEEP, 2026-09-21)
   *
   * The first version of this guard asked only "is this table client-writable?" and then
   * judged EVERY column on it. That is not the question. `iam.apply_table_grants` issues a
   * COLUMN-level grant whenever `platform.entity_types.client_excluded_columns` is declared,
   * so the platform's own way of saying "a client may never write this secret" is to withhold
   * the column from the grant — and that is exactly how `esign.signing_key.secret_key`,
   * `hr.kiosk_device.device_secret_hash`, `hr.kiosk_session.session_token_hash`,
   * `hr.provider_binding.credential_ref` and `users.integration_connections.credential_item_id`
   * are already closed on this database. All five were in the 233-row baseline as open holes.
   *
   * Two things were wrong with that. It over-reported five genuinely closed credential columns
   * — and, far worse, it meant that CLOSING one of the remaining holes the platform's own way
   * would not shrink the baseline, so the ratchet could not see a fix. A guard that cannot see
   * the fix is a guard that argues against making it.
   *
   * So the census now asks `has_column_privilege(role, col, 'INSERT'/'UPDATE')` per column,
   * per command, and only a column the client may genuinely set is judged. When absent (unit
   * fixtures), every column in `columns` is treated as writable.
   */
  readonly writableColumns?: readonly string[];
  /**
   * Columns PROVEN to hold a `platform.entity_types` vocabulary token rather than a
   * credential — by a foreign key to `platform.entity_types(token)`, or because every value
   * in the column resolves to one. See `VOCABULARY_NOT_A_SECRET`. Unproven is not exempt.
   */
  readonly vocabularyColumns?: readonly string[];
  /**
   * 🚨 A COLUMN A BEFORE-TRIGGER SPEAKS FOR IS NOT A SILENT COLUMN. (SECURITY-SWEEP, 2026-09-21.)
   *
   * Some rules cannot be written as a policy at all. `scheduler.sch_run.claim_token` is the
   * worked example: a client MUST be able to CLEAR it (that is how a run finishes) and MUST be
   * able to leave it untouched (markRunRunning), but may never INSERT one or swap one for a
   * value it chose. A `WITH CHECK` sees only the NEW row and cannot tell those three apart. A
   * BEFORE INSERT OR UPDATE trigger sees OLD and NEW, so that is where the rule lives.
   *
   * Without this, the guard went on reporting `claim_token` after the write had been refused at
   * the row level and proven refused over HTTP — the third time in this lane that a real fix
   * was invisible to the thing meant to measure it.
   *
   * The test is deliberately NARROW, because the generous version was measured and was wrong:
   * asking only "does a before-trigger's body mention this column" cleared 107 baseline rows
   * in one run, since the SHARED trigger functions attached to hundreds of tables (org
   * stampers, governance guards, audit writers) all name `user_id`, `role` and
   * `organization_id` in passing. So the trigger must RAISE, and must be BESPOKE to the table
   * — attached to exactly one relation. That is what separates
   * `scheduler._claim_token_is_minted_by_the_door` from `platform._stamp_org_default`.
   */
  readonly triggerGuardedColumns?: readonly string[];
}

/** What Postgres will actually apply to the NEW row. See `usingExpr`. */
export function effectiveCheck(policy: Pick<PolicyFacts, "withCheck" | "usingExpr">): string | null {
  return policy.withCheck ?? policy.usingExpr;
}

export interface Finding {
  readonly schema: string;
  readonly table: string;
  readonly policy: string;
  readonly cmd: string;
  readonly column: string;
  readonly severity: Severity;
  readonly why: string;
}

/**
 * The two shapes that actually take an account over, and nothing else at CRITICAL:
 *
 *   1. AN UNPINNED SECRET — the client chooses the value the server will later accept.
 *      `iam.api_keys.secret_hash`. Critical whatever else the policy pins.
 *   2. AN IDENTITY COLUMN UNDER A POLICY THAT PINS NOTHING — a permissive INSERT/UPDATE/ALL
 *      policy with a NULL `WITH CHECK`. The `USING` clause decides which rows you may REACH;
 *      with no `WITH CHECK`, nothing decides what the row looks like AFTERWARDS, so you take
 *      a row you own and rewrite whose it is, or what level it grants.
 *
 * An identity column under a real `WITH CHECK` that pins something else is a WARNING: it
 * needs a human's eye, but it is usually gated by `is_platform_admin()` or
 * `iam.has_access(...)` and failing on it would bury case 1 and 2 under hundreds of rows.
 */
export function classify(column: string, ctx: PinContext, provenVocabulary = false): Severity | null {
  const vocabulary = provenVocabulary || VOCABULARY_NOT_A_SECRET.some((re) => re.test(column));
  if (!vocabulary && SECRET_COLUMN.some((re) => re.test(column))) return "critical";
  if (IDENTITY_COLUMN.some((re) => re.test(column))) {
    if (ctx.withCheckIsNull) return "critical";
    // 3. THE api_keys SHAPE. This policy IS in the business of pinning identity — it names
    //    `auth.uid()` or another identity column — and it left this one out. That is not a
    //    policy that decided the column is safe; it is a policy that forgot the column
    //    exists, which is precisely how `service_user_id` was missed while `created_by` two
    //    lines away was pinned.
    return ctx.policyPinsSomeIdentity ? "critical" : "warning";
  }
  if (STATE_COLUMN.some((re) => re.test(column))) return "warning";
  return null;
}

export interface PinContext {
  readonly withCheckIsNull: boolean;
  readonly policyPinsSomeIdentity: boolean;
}

/** Does this WITH CHECK constrain identity at all? */
export function pinsSomeIdentity(withCheck: string | null, columns: readonly string[]): boolean {
  if (withCheck === null) return false;
  if (/auth\.uid\(\)/.test(withCheck)) return true;
  return columns.some((c) => IDENTITY_COLUMN.some((re) => re.test(c)) && isPinned(withCheck, c));
}

/**
 * Is the column's name mentioned anywhere in the WITH CHECK? Deliberately generous: a
 * mention inside a function call (`iam.has_org_access(organization_id)`) counts as pinned,
 * because the policy author did consider it. The defect this hunts is total SILENCE about a
 * column, which is what lets a client choose its value freely.
 *
 * A NULL WITH CHECK on a permissive INSERT/UPDATE/ALL policy pins NOTHING AT ALL, so every
 * security column on such a table is a finding — the worst shape there is.
 */
export function isPinned(withCheck: string | null, column: string): boolean {
  if (withCheck === null) return false;
  return new RegExp(`\\b${column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(withCheck);
}

export function findingsFor(policy: PolicyFacts): Finding[] {
  const out: Finding[] = [];
  const check = effectiveCheck(policy);
  const ctx: PinContext = {
    withCheckIsNull: check === null,
    policyPinsSomeIdentity: pinsSomeIdentity(check, policy.columns),
  };
  // See `PolicyFacts.writableColumns`. `pinsSomeIdentity` above deliberately still reads the
  // WHOLE column list: whether a policy is in the business of pinning identity is a fact about
  // the policy, not about which columns happen to carry a grant.
  const writable =
    policy.writableColumns === undefined ? null : new Set(policy.writableColumns);
  const vocabulary = new Set(policy.vocabularyColumns ?? []);
  const triggerGuarded = new Set(policy.triggerGuardedColumns ?? []);
  for (const column of policy.columns) {
    if (writable !== null && !writable.has(column)) continue;
    // See `triggerGuardedColumns`: a rule a policy cannot state lives in a BEFORE trigger.
    if (triggerGuarded.has(column)) continue;
    const severity = classify(column, ctx, vocabulary.has(column));
    if (severity === null) continue;
    if (isPinned(check, column)) continue;
    out.push({
      schema: policy.schema,
      table: policy.table,
      policy: policy.policy,
      cmd: policy.cmd,
      column,
      severity,
      why:
        policy.withCheck === null
          ? `the policy has NO WITH CHECK, so the client chooses ${column} freely`
          : `${column} is never named in the WITH CHECK, so the client chooses its value`,
    });
  }
  return out;
}

const CMD_NAME: Record<string, string> = { a: "INSERT", w: "UPDATE", "*": "ALL" };

/**
 * The census. Self-contained and deterministic: every client-writable table, its permissive
 * write policies for client roles, the WITH CHECK text, its columns, and whether a
 * restrictive `false` policy already closes it.
 */
const CENSUS_SQL = `
with client_writable as (
  select c.oid as relid, n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname not in ('pg_catalog','information_schema','pg_toast')
     and exists (
       select 1 from unnest($1::text[]) as r(role)
        where has_any_column_privilege(r.role, c.oid, 'INSERT')
           or has_any_column_privilege(r.role, c.oid, 'UPDATE')
     )
),
closed as (
  select p.polrelid as relid, p.polcmd
    from pg_policy p
   where p.polpermissive = false
     and btrim(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''), '() ') = 'false'
     and (
       p.polroles = '{0}'
       or exists (
         select 1 from pg_roles r
          where r.oid = any(p.polroles) and r.rolname = any($1::text[])
       )
     )
)
select w.schema_name,
       w.table_name,
       p.polname                                   as policy_name,
       p.polcmd::text                              as cmd,
       pg_get_expr(p.polwithcheck, p.polrelid)     as with_check,
       pg_get_expr(p.polqual, p.polrelid)          as using_expr,
       (select coalesce(array_agg(a.attname::text order by a.attnum), '{}'::text[])
          from pg_attribute a
         where a.attrelid = w.relid and a.attnum > 0 and not a.attisdropped) as columns,
       -- A COLUMN THE CLIENT CANNOT WRITE IS NOT AN UNPINNED COLUMN (SECURITY-SWEEP 2026-09-21).
       -- Asked per column AND per command, because a column grant is per privilege:
       -- 'a' -> INSERT, 'w' -> UPDATE, '*' -> either. This is the same has_*_privilege family
       -- the client_writable CTE uses, so the two halves of the census cannot disagree.
       (select coalesce(array_agg(a.attname::text order by a.attnum), '{}'::text[])
          from pg_attribute a
         where a.attrelid = w.relid and a.attnum > 0 and not a.attisdropped
           and exists (
             select 1 from unnest($1::text[]) as r(role)
              where (p.polcmd in ('a','*')
                       and has_column_privilege(r.role, w.relid, a.attname, 'INSERT'))
                 or (p.polcmd in ('w','*')
                       and has_column_privilege(r.role, w.relid, a.attname, 'UPDATE'))
           )) as writable_columns,
       -- VOCABULARY PROVEN FROM THE CATALOG: a column whose foreign key points at
       -- platform.entity_types(token) holds a registry identifier, not a bearer secret.
       -- The value-level proof (every value resolves to a live token) is asked separately,
       -- per candidate column, because it has to read the table.
       (select coalesce(array_agg(distinct a2.attname::text), '{}'::text[])
          from pg_constraint fk
          join lateral unnest(fk.conkey) as k(attnum) on true
          join pg_attribute a2 on a2.attrelid = fk.conrelid and a2.attnum = k.attnum
         where fk.conrelid = w.relid and fk.contype = 'f'
           and fk.confrelid = 'platform.entity_types'::regclass
           and exists (
             select 1 from unnest(fk.confkey) as ck(attnum)
             join pg_attribute a3 on a3.attrelid = fk.confrelid and a3.attnum = ck.attnum
            where a3.attname = 'token')) as fk_vocabulary_columns,
       -- Columns named in the body of an ENABLED, row-level BEFORE INSERT/UPDATE trigger on
       -- this table. See PolicyFacts.triggerGuardedColumns: some rules (clear-yes,
       -- set-no, leave-alone-yes) cannot be written as a policy at all.
       (select coalesce(array_agg(distinct a4.attname::text), '{}'::text[])
          from pg_trigger tg
          join pg_proc tp on tp.oid = tg.tgfoid
          join pg_attribute a4 on a4.attrelid = w.relid and a4.attnum > 0 and not a4.attisdropped
         where tg.tgrelid = w.relid
           and not tg.tgisinternal
           and tg.tgenabled <> 'D'
           and (tg.tgtype & 2) <> 0                    -- BEFORE
           and (tg.tgtype & 1) <> 0                    -- FOR EACH ROW
           and ((tg.tgtype & 4) <> 0 or (tg.tgtype & 16) <> 0)  -- INSERT or UPDATE
           and tp.prosrc ~ ('\\m' || a4.attname || '\\M')
           -- 🚨 THE THREE CONDITIONS THAT KEEP THIS HONEST. A first pass asked only "does a
           -- before-trigger's body mention this column", and it cleared 107 baseline rows in
           -- one go — because the generic, SHARED trigger functions this database attaches to
           -- hundreds of tables (org stampers, governance guards, audit writers) name
           -- user_id, role and organization_id in passing. A guard that clears 107 real
           -- findings by accident is worse than no guard. So the trigger must:
           --   * RAISE — it refuses something, rather than merely reading the column;
           --   * be BESPOKE to this table — a function attached to exactly one relation, which
           --     is what separates scheduler._claim_token_is_minted_by_the_door from
           --     platform._stamp_org_default.
           and tp.prosrc ~* 'raise +exception'
           and (select count(distinct t2.tgrelid) from pg_trigger t2
                 where t2.tgfoid = tp.oid and not t2.tgisinternal) = 1) as trigger_guarded_columns
  from client_writable w
  join pg_policy p on p.polrelid = w.relid
 where p.polpermissive = true
   and p.polcmd in ('a','w','*')
   and (
     p.polroles = '{0}'   -- TO PUBLIC: applies to authenticated as well
     or exists (
       select 1 from pg_roles r
        where r.oid = any(p.polroles) and r.rolname = any($1::text[])
     )
   )
   -- WHAT COUNTS AS CLOSED, per command. A restrictive with-check-false for the same command
   -- closes it; a restrictive ALL closes everything. And an ALL policy is closed when BOTH
   -- write commands are separately refused -- the shape this lane's own
   -- share_links_client_insert_refused / _update_refused pair takes. Without this the guard
   -- went on reporting iam.invitations.token under platform_admin_all minutes after the write
   -- had been refused at the row level and proven refused over HTTP. A guard that cannot see
   -- a fix is the defect this lane opened with.
   and not exists (
     select 1 from closed cl
      where cl.relid = w.relid and (cl.polcmd = p.polcmd or cl.polcmd = '*')
   )
   and not (
     p.polcmd = '*'
     and exists (select 1 from closed cl where cl.relid = w.relid and cl.polcmd = 'a')
     and exists (select 1 from closed cl where cl.relid = w.relid and cl.polcmd = 'w')
   )
 order by w.schema_name, w.table_name, p.polname
`;

/** The real bytes, before and after. See the header. */
export const PRE_FIX_API_KEYS: PolicyFacts = {
  schema: "iam",
  table: "api_keys",
  policy: "std_insert",
  cmd: "a",
  usingExpr: null,
  withCheck:
    "(( SELECT is_platform_admin() AS is_platform_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) " +
    "AND ((organization_id IS NULL) OR iam.has_org_access(organization_id) OR ((organization_id IN " +
    "( SELECT system_orgs.organization_id FROM iam.system_orgs WHERE system_orgs.global_readable)) " +
    "AND is_super_admin()))))",
  columns: [
    "id",
    "key_id",
    "secret_hash",
    "display_prefix",
    "name",
    "service_user_id",
    "status",
    "revoked_at",
    "last_used_at",
    "expires_at",
    "organization_id",
    "created_by",
    "updated_by",
    "created_at",
    "updated_at",
    "deleted_at",
    "version",
    "metadata",
    "visibility",
    "custom_fields",
  ],
};

function selfTest(): number {
  let failed = 0;
  const say = (ok: boolean, line: string) => {
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${line}`);
    if (!ok) failed += 1;
  };

  // RED — the real defect, in the real bytes.
  const red = findingsFor(PRE_FIX_API_KEYS);
  const criticals = red.filter((f) => f.severity === "critical").map((f) => f.column);
  say(
    criticals.includes("service_user_id"),
    "the pre-fix iam.api_keys std_insert policy is CRITICAL on `service_user_id` " +
      "(the identity a presented key adopts)",
  );
  say(
    criticals.includes("secret_hash"),
    "the same policy is CRITICAL on `secret_hash` (the digest the server compares against)",
  );
  say(
    !red.some((f) => f.column === "created_by") && !red.some((f) => f.column === "organization_id"),
    "`created_by` and `organization_id`, which that policy DOES pin, are not reported",
  );

  // THE SECOND WAY A DOOR IS REMOVED: the column is withheld from the client grant.
  // `iam.apply_table_grants` does exactly this whenever `platform.entity_types
  // .client_excluded_columns` names a column, and it is how the platform already closes
  // `esign.signing_key.secret_key` and four more. A guard that still called those holes could
  // not see a fix when one was made — so both halves are asserted here on the same bytes.
  // RED half: with the secret still granted, it IS reported.
  say(
    findingsFor({ ...PRE_FIX_API_KEYS, writableColumns: PRE_FIX_API_KEYS.columns })
      .some((f) => f.column === "secret_hash" && f.severity === "critical"),
    "a credential column the client MAY write is still CRITICAL when the grant is table-wide",
  );
  // GREEN half: withhold that one column from the grant and the finding is gone — and only
  // that one, so the rule cannot be mistaken for "withholding anything clears the table".
  const grantWithheld = findingsFor({
    ...PRE_FIX_API_KEYS,
    writableColumns: PRE_FIX_API_KEYS.columns.filter((c) => c !== "secret_hash"),
  });
  say(
    !grantWithheld.some((f) => f.column === "secret_hash"),
    "the same column withheld from the client grant (client_excluded_columns) is NOT a finding",
  );
  say(
    grantWithheld.some((f) => f.column === "service_user_id" && f.severity === "critical"),
    "…and withholding one column does not clear the others: service_user_id is still CRITICAL",
  );

  // THE VOCABULARY EVIDENCE RULE, on the shape that hid the share link's credential. A column
  // named `token` is a finding UNLESS the catalog or the data proves it is a registry key; the
  // two fixtures differ only in that proof.
  const shareLinkShape = {
    schema: "platform",
    table: "share_links",
    policy: "std_insert",
    cmd: "a",
    withCheck: "((created_by = ( SELECT auth.uid() AS uid)) AND iam.has_org_access(organization_id))",
    usingExpr: null,
    columns: ["id", "token", "short_token", "permission_level", "created_by", "organization_id"],
  } as const;
  say(
    findingsFor({ ...shareLinkShape })
      .some((f) => f.column === "token" && f.severity === "critical"),
    "an UNPROVEN `token` column is CRITICAL — this is platform.share_links.token, the string " +
      "in /s/<token>, which a bare name-based exemption hid until 2026-09-21",
  );
  say(
    !findingsFor({ ...shareLinkShape, vocabularyColumns: ["token"] })
      .some((f) => f.column === "token"),
    "the same column PROVEN to be a registry key (FK to platform.entity_types(token), or its " +
      "values resolve, or a value repeats across rows) is not a finding",
  );
  say(
    findingsFor({ ...shareLinkShape, vocabularyColumns: ["token"] })
      .some((f) => f.column === "permission_level" && f.severity === "critical"),
    "…and proving one column says nothing about the next: permission_level, what the link " +
      "GRANTS, is still CRITICAL",
  );

  // A RULE A POLICY CANNOT STATE, STATED IN A TRIGGER. `scheduler.sch_run.claim_token`: a
  // client may CLEAR it (finishing a run) and leave it untouched (markRunRunning), but may
  // never INSERT one or swap one. WITH CHECK sees only the new row; a BEFORE trigger sees OLD
  // and NEW. Both halves on the same bytes.
  const leaseShape = {
    schema: "scheduler",
    table: "sch_run",
    policy: "std_insert",
    cmd: "a",
    withCheck: "(created_by = ( SELECT auth.uid() AS uid))",
    usingExpr: null,
    columns: ["id", "task_id", "claim_token", "user_id", "created_by"],
  } as const;
  say(
    findingsFor({ ...leaseShape })
      .some((f) => f.column === "claim_token" && f.severity === "critical"),
    "a lease token no policy and no trigger speaks for is CRITICAL",
  );
  say(
    !findingsFor({ ...leaseShape, triggerGuardedColumns: ["claim_token"] })
      .some((f) => f.column === "claim_token"),
    "the same column named by a BEFORE INSERT/UPDATE trigger is NOT a finding — the rule " +
      "(clear yes, set no, leave alone yes) is one a WITH CHECK cannot express",
  );
  say(
    findingsFor({ ...leaseShape, triggerGuardedColumns: ["claim_token"] })
      .some((f) => f.column === "user_id" && f.severity === "critical"),
    "…and a trigger speaking for one column says nothing about the next: user_id stays CRITICAL",
  );

  // GREEN — the shape it has today: a restrictive refusal means the census never yields the
  // table at all, so the classifier is handed nothing to judge.
  say(
    findingsFor({ ...PRE_FIX_API_KEYS, policy: "api_keys_client_insert_refused", withCheck: "false", usingExpr: null, columns: [] })
      .length === 0,
    "a table closed by a restrictive refusal yields no findings",
  );

  // The second live shape, from the same census: `users.user_secrets`, a permissive ALL
  // policy for `authenticated` with NO WITH CHECK at all. Nothing decides what the row looks
  // like after the write, so a user moves a secret onto another user's id.
  // `users.user_secrets`, a real permissive ALL policy TO PUBLIC with NO `WITH CHECK`. It is
  // CLOSED, because Postgres applies its `USING` to the new row as well — and reading it as
  // "nothing is pinned" is what an earlier pass of this guard did, inventing six
  // account-takeovers that do not exist. The fixture is kept precisely to hold that lesson.
  const fallsBackToUsing = findingsFor({
    schema: "users",
    table: "user_secrets",
    policy: "Users manage own secrets",
    cmd: "*",
    withCheck: null,
    usingExpr: "(( SELECT auth.uid() AS uid) = user_id)",
    columns: ["id", "user_id", "organization_id", "name"],
  });
  say(
    !fallsBackToUsing.some((f) => f.column === "user_id"),
    "a NULL WITH CHECK falls back to USING, so users.user_secrets is NOT reported (it is closed)",
  );

  // Genuinely unconstrained: neither clause.
  const naked = findingsFor({
    schema: "zz",
    table: "hypothetical",
    policy: "wide_open",
    cmd: "*",
    withCheck: null,
    usingExpr: null,
    columns: ["id", "user_id", "organization_id"],
  });
  say(
    naked.some((f) => f.column === "user_id" && f.severity === "critical"),
    "a policy with NEITHER clause is CRITICAL on its identity columns",
  );

  // …and the same column under a real WITH CHECK that pins something else is a WARNING, not a
  // failure. This is what keeps the guard usable: the live census found 748 such rows and
  // almost all are content checksums on admin-gated tables.
  const judged = findingsFor({
    schema: "admin",
    table: "feature_docs",
    policy: "platform_admin_all",
    cmd: "*",
    withCheck: "( SELECT is_platform_admin() AS is_platform_admin)",
    usingExpr: null,
    columns: ["content_hash", "sync_base_hash", "created_by"],
  });
  say(
    judged.length > 0 && judged.every((f) => f.severity === "warning"),
    "a content checksum under an admin-gated WITH CHECK is a WARNING, never a failure",
  );

  console.log(
    failed === 0
      ? "\nself-test GREEN — the classifier reports the real CRITICAL-1 defect and clears the fix."
      : `\nself-test RED — ${failed} assertion(s) failed.`,
  );
  return failed === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) return selfTest();

  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `[FAIL] LIVE PULL FAILED — missing ${env.missing.join(", ")}.\n` +
        `  This guard answers "may the browser really choose this column?" and only the live\n` +
        `  catalog knows. UNMEASURED IS NOT PASSED: refusing rather than reporting green.`,
    );
    return 1;
  }

  const client = await connectDirect(env, "check-unpinned-security-columns").catch((e: unknown) => {
    console.error(`[FAIL] LIVE PULL FAILED — could not connect: ${String(e)}`);
    return null;
  });
  if (client === null) return 1;

  try {
    const { rows } = await client.query(CENSUS_SQL, [[...CLIENT_ROLES]]);
    if (rows.length === 0) {
      console.error(
        `[FAIL] LIVE PULL FAILED — the census returned no client-writable policies at all.\n` +
          `  That is not a clean bill of health, it is an unanswered question.`,
      );
      return 1;
    }

    // THE VALUE-LEVEL VOCABULARY PROOF. A catalog foreign key answers most of it; the rest
    // is answered by the data, once per (table, column), and only for the columns that would
    // otherwise be judged as credentials. A table with no rows proves nothing and stays a
    // finding — UNPROVEN IS NOT EXEMPT.
    // Every token-shaped column that the name list does not already clear must prove itself.
    // The name list is only a fast path for the five qualified names; the evidence is what
    // actually decides, and it is what clears `platform.lifecycle_reference_map`'s
    // `parent_token` / `child_token` (1,362 rows, every value a live entity token, and tokens
    // that repeat) without anyone adding two more names to a list.
    const TOKEN_SHAPED = /(^|_)token$/i;
    const proven = new Map<string, Set<string>>();
    const asked = new Set<string>();
    for (const r of rows) {
      const rel = `${r.schema_name}.${r.table_name}`;
      const fkVocab = new Set<string>(r.fk_vocabulary_columns ?? []);
      const writable = new Set<string>(r.writable_columns ?? []);
      const set = proven.get(rel) ?? new Set<string>(fkVocab);
      for (const c of fkVocab) set.add(c);
      proven.set(rel, set);
      for (const column of (r.columns ?? []) as string[]) {
        if (!TOKEN_SHAPED.test(column)) continue;
        if (VOCABULARY_NOT_A_SECRET.some((re) => re.test(column))) continue;
        if (!writable.has(column) || set.has(column)) continue;
        const key = `${rel}.${column}`;
        if (asked.has(key)) continue;
        asked.add(key);
        const col = quoteIdent(column);
        const qualified = `${quoteIdent(r.schema_name)}.${quoteIdent(r.table_name)}`;
        const { rows: answer } = await client.query(
          // An ALL-NULL column resolves to the registry VACUOUSLY, and an earlier pass of
          // this rule cleared `research.rs_topic.refresh_claim_token` — a lease token that is
          // simply unset today — on exactly that. At least one non-null value must be there
          // and must resolve. UNPROVEN IS NOT EXEMPT includes "unpopulated".
          "select (count(t." + col + ") > 0 and count(*) filter (where t." + col + " is not null " +
            "and not exists (select 1 from platform.entity_types et where et.token = t." + col +
            "::text)) = 0) as resolves_to_registry, " +
            "(count(t." + col + ") > count(distinct t." + col + ")) as value_repeats " +
            "from " + qualified + " t",
        );
        if (answer[0]?.resolves_to_registry === true || answer[0]?.value_repeats === true) {
          set.add(column);
        }
      }
    }

    const findings: Finding[] = [];
    for (const r of rows) {
      findings.push(
        ...findingsFor({
          schema: r.schema_name,
          table: r.table_name,
          policy: r.policy_name,
          cmd: r.cmd,
          withCheck: r.with_check,
          usingExpr: r.using_expr,
          columns: r.columns ?? [],
          writableColumns: r.writable_columns ?? [],
          vocabularyColumns: [...(proven.get(`${r.schema_name}.${r.table_name}`) ?? [])],
          triggerGuardedColumns: r.trigger_guarded_columns ?? [],
        }),
      );
    }

    const critical = findings.filter((f) => f.severity === "critical");
    const warning = findings.filter((f) => f.severity === "warning");
    const tables = new Set(rows.map((r) => `${r.schema_name}.${r.table_name}`));

    console.log(
      `examined ${tables.size} client-writable table(s) over ${rows.length} permissive write ` +
        `policy/policies (from ${env.from})`,
    );

    const keys = critical.map(keyOf).sort();
    if (process.argv.includes("--update-baseline")) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(keys, null, 2)}\n`, "utf8");
      console.log(`\nbaseline rewritten with ${keys.length} finding(s): ${BASELINE_PATH}`);
      return 0;
    }

    const baseline = readBaseline();
    const fresh = critical.filter((f) => !baseline.has(keyOf(f)));
    const fixed = [...baseline].filter((k) => !keys.includes(k));

    for (const f of fresh) {
      console.error(
        `[FAIL] ${f.schema}.${f.table} · policy ${f.policy} · ${CMD_NAME[f.cmd] ?? f.cmd} · ` +
          `${f.column}\n       ${f.why}`,
      );
    }
    for (const f of warning.slice(0, 40)) {
      console.log(
        `[WARN] ${f.schema}.${f.table} · policy ${f.policy} · ${CMD_NAME[f.cmd] ?? f.cmd} · ` +
          `${f.column}\n       ${f.why}`,
      );
    }
    if (warning.length > 40) console.log(`[WARN] … and ${warning.length - 40} more.`);

    if (fresh.length > 0) {
      console.error(
        `\n${fresh.length} NEW CRITICAL finding(s): a client-writable table leaves an identity or\n` +
          `credential column unpinned. The fix is to REMOVE THE DOOR — a restrictive policy that\n` +
          `refuses the client write, plus a SECURITY DEFINER door that sets the column\n` +
          `server-side — never a pin beside a write that should not exist. Worked example:\n` +
          `  migrations/campaign/seckeys_api_keys_have_exactly_one_door.sql\n` +
          `A finding is NEVER cleared by adding it to the baseline: the baseline only shrinks.`,
      );
      return 1;
    }

    // THE BASELINE ONLY SHRINKS. A stale entry means somebody fixed a table and left the file
    // claiming the defect is still there — which is how a baseline rots into permission.
    if (fixed.length > 0) {
      console.error(
        `\n${fixed.length} baseline entry/entries no longer exist — fixed, or the table is gone:\n` +
          fixed.map((k) => `  ${k}`).join("\n") +
          `\n  Run \`pnpm check:unpinned-security-columns --update-baseline\` to record the win.`,
      );
      return 1;
    }

    console.log(
      `\nno NEW unpinned identity or credential column. ` +
        `${keys.length} known finding(s) still in the baseline, ${warning.length} warning(s).`,
    );
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

main().then(exitAfterDrain, (e: unknown) => {
  console.error(`[FAIL] LIVE PULL FAILED — ${String(e)}`);
  exitAfterDrain(1);
});
