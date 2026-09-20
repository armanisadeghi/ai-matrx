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
 *      would have destroyed;
 *   6. THE IDENTITY SHELL — `auth.users` on the branch carries NO production
 *      email address, NO user or app metadata and NO password hash outside the
 *      two test identities, and every other row is banned in GoTrue's own eyes.
 *      This is the proof V0's `W0-DATA` FAIL was missing: the lane's stated
 *      falsifiable exit (`select email from auth.users where email is not null`
 *      returning only corpus and test identities) was FALSE on the live branch —
 *      336 real customer and staff addresses — while the build log recorded the
 *      lane DONE, because nothing in `--verify`, in `run.ts` or in the log had
 *      ever run the query the row named. It runs here now, on EVERY run,
 *      including `--verify`.
 *
 * WHERE IT MAY RUN. The branch, never production. The branch connection comes
 * from the one variable `common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF`
 * names, and is verified against that file; production is opened READ ONLY and
 * is never written by any statement here.
 *
 *   npx tsx scripts/gate-corpus/restore-graph.ts            copy + prove
 *   npx tsx scripts/gate-corpus/restore-graph.ts --verify   prove only, copy nothing
 *   …--verify --max-boundary-age=<hours>                    move the freshness ceiling
 *
 * `--verify` compares the branch to the BOUNDARY THE COPY RECORDED — a row in
 * `restore_graph.run` on the branch holding the production snapshot id,
 * the per-table counts taken inside it, and the branch-only rows the policy kept
 * — never to a fresh read of production. Production takes new association rows
 * all day; a verifier that re-reads it fails because the world moved, which says
 * nothing about whether the copy is intact.
 *
 * 🚨 AND THAT BOUNDARY HAS A MAXIMUM AGE THAT FAILS (ATTACK-7 finding 6). Because
 * the comparison is against the recorded copy, `--verify` used to pass no matter
 * how old the copy was, while printing "production's 4603" — a snapshot wearing
 * the present tense. Production takes ≈18 new `iam.permissions` grants an hour, so
 * across the campaign's 56-hour critical path the branch copy can be ≈1,000 grants
 * behind. Every `--verify` now measures the boundary's age IN THE DATABASE —
 * `now() - prod_taken_at`, the expression `W7-GATE`'s exit names, which is why
 * `prod_taken_at` is a `timestamptz` and not the `text` it used to be (ATTACK-7
 * finding 14) — prints it pass or fail alongside the effective ceiling, and EXITS
 * NON-ZERO by name when it is over, with the remedy: re-run the copy (`W0-DATA`'s
 * restore) and re-verify. See `./boundary-age.ts` for why the default is 12 hours.
 *
 * Exit 0 only when all six proofs pass and the boundary is inside the ceiling.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadDbEnv } from "../lib/direct-db";
import { loadBranchDbEnv, loadBranchRef } from "../lib/migration-target";
import { boundaryVerdict } from "./boundary-verdict";
import { DOOR_MISSING_TOLERANCE, doorSurfaceVerdict } from "./door-surface";
import {
  DEFAULT_MAX_BOUNDARY_AGE_HOURS,
  boundaryAgeVerdict,
  formatAgeHours,
  parseMaxBoundaryAgeHours,
} from "./boundary-age";
import {
  type Marker,
  type TableMergeCounts,
  campaignOwnedPredicate,
  countCampaignOwned,
  countSpared,
  emptyCounts,
  mergeDeleteSql,
  mergeInsertSql,
  resolveMarker,
  withSnapshotKeys,
} from "./merge-plan";
// The TEXT half of the personal-data contract lives in the guard; this file
// holds the MEASURED half. See `PERSONAL_DATA_TABLES`'s own header.
import { PERSONAL_DATA_TABLES } from "./identity-shell-contract";

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
 * arm reads it (none does). It is a SHELL too: its `client_secret_hash` is
 * synthesised to a constant, because NO SECRET OR CREDENTIAL COLUMN IS EVER READ
 * FROM PRODUCTION INTO THE BRANCH (chair's ruling, 2026-09-16). That rule is
 * enforced over EVERY `auth.*` entry of this list, without a database, by
 * `identity-shell-contract.ts`.
 */
interface CopyTable {
  readonly table: string;
  readonly policy: "upsert" | "replace";
  /** A statement run on the BRANCH right after this table's rows land, announced by `note`. */
  readonly afterCopy?: { readonly sql: string; readonly note: string };
  /** A SHELL: only these columns are read from production. See `auth.users`. */
  readonly columns?: readonly string[];
  /**
   * SYNTHESISED, NOT COPIED. Column name → a SQL expression evaluated ON
   * PRODUCTION in place of that column, so production's real value never
   * crosses the wire at all. A column named here is still WRITTEN (the branch
   * gets a value), it is simply not production's value. Every synthesised
   * column is printed by name on every run, next to the expression that made
   * it — see `synthesizedNote`.
   */
  readonly synthesize?: Readonly<Record<string, string>>;
  readonly columnsNote?: string;
  /** Not owned by the connecting role. Proven at run time to need no owner right. */
  readonly notOurs?: boolean;
  /**
   * THE TABLE'S OWN CAMPAIGN-OWNERSHIP PREDICATE, for a REGISTRY whose campaign
   * rows sit on primary keys PRODUCTION ALSO HOLDS.
   *
   * §13's `origin` column and the `absent-from-production-snapshot` fallback both
   * answer "is this row ours?" — and both answer NO for a campaign knob whose
   * `(feature, key)` production also carries, which is exactly the row whose
   * value must not move. A table that declares this gets `declared-predicate`
   * instead, and the merge's upsert, delete, spared-count and before/after counts
   * all read it. `{alias}` is substituted with whatever alias the statement uses.
   */
  readonly campaignOwned?: { readonly template: string; readonly because: string };
}

const COPY_TABLES: readonly CopyTable[] = [
  // ── the access half — parents first, in foreign-key order ────────────────
  {
    table: "auth.users",
    policy: "upsert",
    /**
     * AN ID-ONLY SHELL, and every word of that is load-bearing.
     *
     * 🚨 THE DEFECT THIS SHAPE CLOSES (V0's W0-DATA FAIL, 2026-09-16). Until
     * this run, `email`, `raw_user_meta_data` and `raw_app_meta_data` were
     * COPIED, under a comment that redefined "shell" to mean "no authentication
     * secret" rather than "id only". The measured result on the branch was
     * **336 real production email addresses** — staff, and several hundred
     * customers' personal gmail/yahoo/comcast/icloud addresses — and 336
     * user-metadata blobs, sitting in a second database with production's
     * grants transplanted onto it and a PostgREST API on the public internet.
     * The build book's own falsifiable exit (`select email from auth.users
     * where email is not null` returning only corpus and test identities) was
     * FALSE on the live branch while the log recorded the lane DONE.
     *
     * WHAT CROSSES THE WIRE NOW. The `id` the whole access graph's foreign keys
     * point at, plus the non-identifying bookkeeping GoTrue needs to read the
     * row at all (`aud`, `role`, `instance_id`, the timestamps, the flags).
     * NOTHING THAT NAMES A PERSON. `email`, `raw_user_meta_data` and
     * `raw_app_meta_data` are in `synthesize` below, which means production's
     * own SQL replaces them in the SELECT: the real values are never read, never
     * transmitted, and never held in this process's memory.
     *
     * CONSEQUENCE, stated rather than discovered at 3 a.m.: NOBODY CAN SIGN IN
     * ON THE BRANCH AS A COPIED USER — no password hash is copied AND every
     * copied row is written `banned_until` far-future, which GoTrue itself
     * honours, so the refusal does not rest on the absence of a hash alone.
     * Exactly two identities can sign in on the branch, `test@test.com` and
     * `admin@admin.com`, and they are CREATED by `mintSignInIdentities()` after
     * the copy — given their branch-only passwords from the environment — not
     * copied from production.
     */
    columns: [
      "id",
      // `instance_id` is NOT a secret — it is the zero UUID on every Supabase
      // project — and leaving it NULL made every copied row INVISIBLE TO GOTRUE,
      // not merely unable to sign in: the branch's own auth admin API answered
      // `404 user_not_found` for `test@test.com` while the row sat in
      // `auth.users` with the right id and the right email (measured
      // 2026-09-16). W0-CORPUS's exit needs that identity to EXIST on the branch
      // before it can be given a branch-only password, and four wave-6 client
      // lanes sign in as it.
      "instance_id",
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
    /**
     * THE THREE COLUMNS THAT NAME A PERSON, AND THE ONE THAT DISARMS THE ROW.
     * Each expression is evaluated INSIDE production's own read-only snapshot,
     * in place of the column, so the real value never leaves production.
     *
     * · `email` — `u-<first 8 of the id>@corpus.invalid`. A shell still needs an
     *   email because GoTrue and several branch lanes read the column, and
     *   `.invalid` is the reserved TLD that can never resolve or receive mail
     *   (RFC 2606). The first 8 hex characters of a v4 UUID are unique across
     *   production's few hundred identities, and that uniqueness is ASSERTED on
     *   production before a single row is written (`users_email_partial_key` is
     *   unique) rather than hoped for — see `assertSyntheticUniqueness`.
     * · `raw_user_meta_data` / `raw_app_meta_data` — `{}`. These hold names,
     *   avatar URLs, phone numbers and provider identifiers. Empty is the only
     *   honest stand-in; no lane reads them on the branch.
     * · `banned_until` — the year 9999. GoTrue's own `IsBanned()` refuses a
     *   password grant, a magic link and a refresh for such a row, so "a copied
     *   identity cannot sign in" is enforced by the auth server and not merely
     *   implied by a NULL password hash. `mintSignInIdentities()` clears it for
     *   exactly the two test identities.
     */
    synthesize: {
      email: `'u-' || left("id"::text, 8) || '@corpus.invalid'`,
      raw_user_meta_data: `'{}'::jsonb`,
      raw_app_meta_data: `'{}'::jsonb`,
      banned_until: `timestamptz '9999-12-31 00:00:00+00'`,
    },
    /**
     * 🚨 AN OMITTED COLUMN IS NOT ALWAYS AN EMPTY ONE (measured 2026-09-16).
     *
     * `confirmation_token`, `recovery_token`, `email_change_token_new` and
     * `email_change` have no default on this table, so leaving them out wrote
     * NULL — and GoTrue scans all four into Go `string`s. The branch's own auth
     * admin API therefore answered
     *   500 {"error_code":"unexpected_failure","msg":"Database error loading user"}
     * for EVERY copied identity: not "cannot sign in", which is the intent, but
     * "cannot be read at all", which is not. An empty credential is the empty
     * string; NULL is a missing column. This normalisation runs after the copy,
     * is counted, and is printed.
     */
    afterCopy: {
      sql:
        `update auth.users set confirmation_token = coalesce(confirmation_token, ''), ` +
        `recovery_token = coalesce(recovery_token, ''), ` +
        `email_change_token_new = coalesce(email_change_token_new, ''), ` +
        `email_change = coalesce(email_change, '') ` +
        `where confirmation_token is null or recovery_token is null ` +
        `or email_change_token_new is null or email_change is null`,
      note:
        "auth.users: the four credential columns with no default were written EMPTY rather than " +
        "NULL — GoTrue reads them as strings and a NULL makes the whole identity unreadable by " +
        "the branch's own auth API. No password and no token was copied; an empty credential is " +
        "still an empty credential",
    },
    columnsNote:
      "ID-ONLY SHELL. COPIED from production: the id, and the non-identifying bookkeeping GoTrue " +
      "needs to read the row (instance_id, aud, role, the timestamps, the flags). SYNTHESISED, " +
      "never read from production: email (u-<first 8 of id>@corpus.invalid), raw_user_meta_data " +
      "({}), raw_app_meta_data ({}), banned_until (year 9999). LEFT UNSET: every password, token " +
      "and email/phone-change column. So NO real email address, NO user or app metadata and NO " +
      "credential of any production person reaches this branch, and every copied row is banned in " +
      "GoTrue's own eyes. The two identities that CAN sign in here — test@test.com and " +
      "admin@admin.com — are created after the copy with BRANCH-ONLY passwords from the " +
      "environment, not copied",
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
  {
    table: "auth.oauth_clients",
    policy: "upsert",
    /**
     * 🚨 NO CREDENTIAL COLUMN IS EVER READ FROM PRODUCTION (chair's ruling,
     * 2026-09-16, the same class as the identity shells above).
     *
     * THE DEFECT THIS SHAPE CLOSES (V0's re-verify §R6). This entry was
     * `{ table, policy, notOurs }` — no column list and no filter — so the copy
     * took ALL of production's `auth.oauth_clients`, including **87
     * `client_secret_hash` values**, onto a branch whose PostgREST API is on the
     * public internet. `W0-DATA`'s row described a two-row copy; the code took
     * the table whole. Nothing named a person, which is why it was a ruling and
     * not a second FAIL — but a credential hash is a credential, and the guard
     * that would have caught it (`identity-shell-contract.ts`) audited
     * `auth.users` alone.
     *
     * WHAT CROSSES THE WIRE NOW. The `id` the extension and the desktop client
     * present, and the non-secret registration facts §5.9's lanes read back
     * (`redirect_uris`, `grant_types`, `client_name`/`client_uri`/`logo_uri`,
     * `registration_type`, `client_type`, `token_endpoint_auth_method`, the
     * timestamps). `client_secret_hash` is SYNTHESISED to one constant,
     * unusable string, so production's hashes are never read, never
     * transmitted and never held by this process.
     *
     * CONSEQUENCE, stated rather than discovered at 3 a.m.: NO CLIENT CAN
     * COMPLETE A CONFIDENTIAL-CLIENT FLOW ON THE BRANCH with a production
     * secret — the stored value is not a bcrypt digest at all, so the compare
     * fails for every secret including the real one. A branch lane that needs a
     * working OAuth client registers its own and gives it its own secret, the
     * same way `mintSignInIdentities()` mints the two sign-in identities.
     */
    columns: [
      "id",
      "client_secret_hash",
      "registration_type",
      "redirect_uris",
      "grant_types",
      "client_name",
      "client_uri",
      "logo_uri",
      "created_at",
      "updated_at",
      "deleted_at",
      "client_type",
      "token_endpoint_auth_method",
    ],
    /**
     * A CONSTANT, and deliberately not a hash-shaped one. GoTrue compares the
     * presented secret against this with bcrypt; a string that is not a bcrypt
     * digest can never compare equal, and it SAYS what it is when an operator
     * reads the column instead of looking like a credential somebody might try
     * to crack. It derives from no production value, so nothing about the real
     * secret — not its length, not its cost factor, not whether two clients
     * share one — survives the copy.
     */
    synthesize: {
      client_secret_hash: `'NO-PRODUCTION-SECRET-WAS-COPIED-ONTO-THIS-REHEARSAL-BRANCH'`,
    },
    columnsNote:
      "NO CREDENTIAL IS COPIED. COPIED from production: the client id and the non-secret " +
      "registration facts the extension and desktop lanes read (redirect_uris, grant_types, " +
      "client_name, client_uri, logo_uri, registration_type, client_type, " +
      "token_endpoint_auth_method, the timestamps). SYNTHESISED, never read from production: " +
      "client_secret_hash — one constant, unusable string that is not a bcrypt digest, so no " +
      "confidential-client flow on this branch can succeed with a production secret. A branch " +
      "lane that needs a working OAuth client registers its own",
    notOurs: true,
  },
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
  // The sharing registry. `iam.has_permission_for` reads it, and until 2026-09-16
  // it was not copied at all: the branch was left carrying the GATE CORPUS's own
  // rows for `scope` and `rulebook` (url_path_template `/corpus/...`, `scope`
  // pointing at `corpus.corpus_scope` instead of `context.scopes`), so every
  // sharing answer the rehearsal gave for those two tokens was measured against a
  // registry production does not have. `upsert` keeps the corpus's own
  // `corpus%` rows and puts production's back over the top of the clobbered ones.
  { table: "platform.shareable_resource_registry", policy: "upsert" },
  { table: "platform.association_types", policy: "upsert" },
  { table: "platform.entity_relationships", policy: "upsert" },
  { table: "platform.associations", policy: "replace" },
  { table: "platform.reachability", policy: "replace" },
  // ── the two arms that read entity tables of their own ────────────────────
  /**
   * 🚨 WITHOUT THIS TABLE THE BRANCH CANNOT BE GIVEN PRODUCTION'S FUNCTION
   *    PRIVILEGES AT ALL (measured 2026-09-16).
   *
   * A DB-wide event trigger REVOKES client EXECUTE on a SECURITY DEFINER
   * function that has no `platform.client_callable_door` row — inside the GRANT
   * itself, with a WARNING and a `platform.ddl_guard_log` row. Production holds
   * **1,000** door rows; the branch held **ZERO**, so
   *
   *   grant execute on function public.is_platform_admin() to authenticated;  -- GRANT
   *   select has_function_privilege('authenticated','public.is_platform_admin()','EXECUTE');
   *   -- false
   *
   * every time, for every function, however many times it was granted. The
   * consequence is not subtle: `platform`'s RLS policies call those functions, so
   * an authenticated read of any RLS-protected table on the branch answers
   * `403 permission denied for function is_platform_admin` with the schema
   * exposed and every table grant in place — which is `W6-GRID`'s first act.
   */
  {
    table: "platform.client_callable_door",
    policy: "upsert",
    campaignOwned: {
      template: "{alias}.schema_name = 'custom'",
      because:
        "the campaign's own doors are the ones in schema `custom` — today `custom.record_write`, " +
        "W1-STORE's single write door. Production holds door rows of its own and will hold more; " +
        "this predicate is about WHOSE row it is, not about whether production has heard of it.",
    },
  },
  /**
   * EVERY ORGANIZATION-CONFIGURABLE BEHAVIOUR ON THE PLATFORM, and without it the
   * rehearsal answers knob questions the real system stopped asking.
   *
   * Measured 2026-09-17: production 769 rows, the branch TEN — all ten this
   * campaign's own `custom/*` guards. So every knob read on the branch fell
   * through to a compiled default, and a lane rehearsing a knob-gated path was
   * rehearsing against a default production has already moved off.
   *
   * 🚨 AND IT IS THE REASON `campaignOwned` EXISTS. Production holds FOURTEEN
   * `feature = 'custom'` rows — earlier lanes landed their guards there — so a
   * plain upsert on the primary key `(feature, key)` would write production's
   * value over this branch's campaign guards. Several of those guards are the OFF
   * switch (§6). A refresh that turned them ON mid-run would not fail loudly; it
   * would quietly make every OFF-path proof in the campaign false. The declared
   * predicate keeps the campaign's knobs exactly as its lanes left them, and the
   * four `custom` rows production has and the branch does not stay ABSENT — a
   * lane's guard is its lane's to land, never the refresh's to import.
   *
   * No secret column: every production row was scanned for secret-shaped content
   * and the only hits are the WORDS inside prose ("risk-", "kiosk", "token
   * budget"). `updated_by` is synthesised to NULL anyway — it is a real person's
   * user id, it has no foreign key, and who last turned a production knob is not
   * a fact a rehearsal branch needs.
   */
  {
    table: "platform.feature_knob",
    policy: "upsert",
    synthesize: { updated_by: "null::uuid" },
    campaignOwned: {
      template: "{alias}.feature = 'custom'",
      because:
        "this campaign's knobs are its `custom/*` guards, and production holds rows on those same " +
        "(feature, key) keys — so neither `origin` nor absence-from-the-snapshot can protect them, " +
        "and an unguarded upsert would turn the campaign's own OFF switch ON.",
    },
  },
  { table: "platform.entity_grants", policy: "upsert" },
  { table: "platform.rulebook", policy: "upsert" },
  { table: "seo.starter_pack", policy: "upsert" },
  // ── THE CRM HALF: `crm.party` and the tables its record page reads ────────
  /**
   * 🚨 THE ONLY TABLES IN THIS LIST THAT HOLD REAL PEOPLE, AND THE ONLY ONES
   *    WHOSE EVERY PERSONAL COLUMN IS MADE UP ON PRODUCTION.
   *
   * WHY THEY ARE HERE. `W1-STORE` put REC-40's first retrofit on `crm.party`
   * (`custom_fields`, nullable, no default), and its OFF proof is ANSWER
   * IDENTITY: every existing read returns the same values with one extra key
   * whose value is null. A branch holding ONE party row — `W1-ORG`'s own
   * baseline — cannot prove that about a 1,905-row table, and the record page
   * around it reads four more tables. Measured on production 2026-09-18:
   * `party` 1,905 · `party_contact_point` 1,375 · `contact_medium` 1,410 ·
   * `affiliation` 6 · `address` 0.
   *
   * WHAT IS DELIBERATELY NOT HERE. `crm.interaction` (26 production rows): the
   * answer-identity read does not touch it and it carries ~55 columns of free
   * text — subject lines, bodies, recording URLs, provider ids. A table nobody
   * needs is a table whose personal columns nobody has to get right.
   * `platform.categories` is not here either: this lane's writes are confined to
   * `crm.*`, so `outsideFks()` nulls the four nullable references into it and
   * says so — the measured cost is ONE row's `party.lifecycle_stage_id`, and the
   * answer-identity statement names that row rather than rounding it away.
   *
   * EVERY PERSONAL COLUMN IS SYNTHESISED ON PRODUCTION, IN THE SELECT — 57 of
   * them across the five tables — so the real value is never read, never
   * transmitted and never held by this process, exactly as `auth.users`'s four
   * are. Two rules every expression obeys, and both are load-bearing:
   *
   *   · NULL-NESS IS PRESERVED (`case when "col" is null then null else … end`).
   *     `party_person_facet` and `party_org_facet` are CHECK constraints written
   *     over exactly these columns' nullability — a blanket stand-in raises 23514
   *     on every organization row.
   *   · `primary_domain` DERIVES FROM THE ROW ID, because `party_org_domain_key`
   *     is UNIQUE over `(organization_id, lower(primary_domain))`. That is not
   *     hoped for: `assertSyntheticUniqueness`'s pass above asks PRODUCTION,
   *     over the real rows, before a single row is written.
   *
   * AND THE GUARD IS DENY-BY-DEFAULT. `identity-shell-contract.ts`'s
   * `PERSONAL_DATA_TABLES` says that on these five tables EVERY copied column is
   * either synthesised or exempt — structurally by pattern (a uuid key, a clock
   * reading, a flag, a counter), or by one of 45 exact keys in `NOT_PERSONAL`,
   * each carrying its own written reason. Adding a column to one of these tables
   * therefore fails the guard until somebody says which it is. The `auth.*`
   * secret deny-list runs over them too, so a future `crm.*.password_hash` is
   * refused by the OLD rule as well as the new one.
   *
   * ORDER: `party` first (its own parent), then `affiliation`, `contact_medium`
   * and `address`, then `party_contact_point`, which points at all four.
   * `assertCopyOrder` checks it against the branch's real FK graph, and
   * `party`'s THREE self-references are resolved by `selfReferencingFks`'s
   * second pass — five non-null `primary_employer_party_id` values across four
   * batches of 483 is the 23503 that mechanism exists for.
   */
  {
    table: "crm.party",
    policy: "upsert",
    synthesize: {
      display_name: `'Party ' || left("id"::text, 8)`,
      sort_name: `case when "sort_name" is null then null else 'Party ' || left("id"::text, 8) end`,
      name_key: `case when "name_key" is null then null else 'party ' || left("id"::text, 8) end`,
      aka: `'{}'::text[]`,
      first_name: `case when "first_name" is null then null else 'First' || left("id"::text, 4) end`,
      middle_name: `case when "middle_name" is null then null else 'Middle' || left("id"::text, 4) end`,
      last_name: `case when "last_name" is null then null else 'Last' || left("id"::text, 4) end`,
      preferred_name: `case when "preferred_name" is null then null else 'Preferred' || left("id"::text, 4) end`,
      name_prefix: `case when "name_prefix" is null then null else 'Px' end`,
      name_suffix: `case when "name_suffix" is null then null else 'Sx' end`,
      pronouns: `case when "pronouns" is null then null else 'they/them' end`,
      date_of_birth: `case when "date_of_birth" is null then null else date '1970-01-01' end`,
      headline: `case when "headline" is null then null else 'Headline ' || left("id"::text, 8) end`,
      legal_name: `case when "legal_name" is null then null else 'Legal ' || left("id"::text, 8) end`,
      primary_domain: `case when "primary_domain" is null then null else 'd-' || left("id"::text, 8) || '.invalid' end`,
      tax_id: `case when "tax_id" is null then null else 'TAX-' || left("id"::text, 8) end`,
      registration_number: `case when "registration_number" is null then null else 'REG-' || left("id"::text, 8) end`,
      bio: `case when "bio" is null then null else 'Biography withheld from the rehearsal branch.' end`,
      job_title: `case when "job_title" is null then null else 'Title ' || left("id"::text, 8) end`,
      do_not_contact_reason: `case when "do_not_contact_reason" is null then null else 'withheld' end`,
      source_detail: `case when "source_detail" is null then null else 'withheld' end`,
      attributes: `'{}'::jsonb`,
      metadata: `'{}'::jsonb`,
      field_provenance: `'{}'::jsonb`,
    },
    columnsNote:
      "EVERY COLUMN IS COPIED; the 24 column(s) below are SYNTHESISED ON PRODUCTION and never read: " +
      "display_name sort_name name_key aka first_name middle_name last_name preferred_name " +
      "name_prefix name_suffix pronouns date_of_birth headline legal_name primary_domain tax_id " +
      "registration_number bio job_title do_not_contact_reason source_detail attributes metadata " +
      "field_provenance.",
  },
  {
    table: "crm.affiliation",
    policy: "upsert",
    synthesize: {
      title: `case when "title" is null then null else 'Title ' || left("id"::text, 8) end`,
      department: `case when "department" is null then null else 'Department ' || left("id"::text, 8) end`,
      metadata: `'{}'::jsonb`,
    },
    columnsNote:
      "EVERY COLUMN IS COPIED; the 3 column(s) below are SYNTHESISED ON PRODUCTION and never read: " +
      "title department metadata.",
  },
  {
    table: "crm.contact_medium",
    policy: "upsert",
    synthesize: {
      value_raw: `'m-' || left("id"::text, 8) || '@corpus.invalid'`,
      value_key: `'m-' || left("id"::text, 8) || '@corpus.invalid'`,
      display_value: `case when "display_value" is null then null else 'm-' || left("id"::text, 8) || '@corpus.invalid' end`,
      external_id: `case when "external_id" is null then null else 'ext-' || left("id"::text, 8) end`,
      handle: `case when "handle" is null then null else 'h-' || left("id"::text, 8) end`,
      profile_url: `case when "profile_url" is null then null else 'https://corpus.invalid/' || left("id"::text, 8) end`,
      consent_source: `case when "consent_source" is null then null else 'withheld' end`,
      consent_source_url: `case when "consent_source_url" is null then null else 'https://corpus.invalid/' || left("id"::text, 8) end`,
      consent_evidence: `'{}'::jsonb`,
      suppression_reason: `case when "suppression_reason" is null then null else 'withheld' end`,
      details: `'{}'::jsonb`,
      metadata: `'{}'::jsonb`,
    },
    columnsNote:
      "EVERY COLUMN IS COPIED; the 12 column(s) below are SYNTHESISED ON PRODUCTION and never read: " +
      "value_raw value_key display_value external_id handle profile_url consent_source " +
      "consent_source_url consent_evidence suppression_reason details metadata.",
  },
  {
    table: "crm.address",
    policy: "upsert",
    synthesize: {
      label: `case when "label" is null then null else 'Label ' || left("id"::text, 8) end`,
      line1: `case when "line1" is null then null else '1 Corpus Way' end`,
      line2: `case when "line2" is null then null else 'Unit ' || left("id"::text, 4) end`,
      line3: `case when "line3" is null then null else 'Floor ' || left("id"::text, 4) end`,
      locality: `case when "locality" is null then null else 'Corpusville' end`,
      region: `case when "region" is null then null else 'CP' end`,
      postal_code: `case when "postal_code" is null then null else '00000' end`,
      plus4: `case when "plus4" is null then null else '0000' end`,
      formatted_address: `case when "formatted_address" is null then null else '1 Corpus Way, Corpusville CP 00000' end`,
      latitude: `case when "latitude" is null then null else 0.0::numeric(9,6) end`,
      longitude: `case when "longitude" is null then null else 0.0::numeric(9,6) end`,
      place_id: `case when "place_id" is null then null else 'place-' || left("id"::text, 8) end`,
      timezone: `case when "timezone" is null then null else 'UTC' end`,
      metadata: `'{}'::jsonb`,
    },
    columnsNote:
      "EVERY COLUMN IS COPIED; the 14 column(s) below are SYNTHESISED ON PRODUCTION and never read: " +
      "label line1 line2 line3 locality region postal_code plus4 formatted_address latitude " +
      "longitude place_id timezone metadata.",
  },
  {
    table: "crm.party_contact_point",
    policy: "upsert",
    synthesize: {
      label: `case when "label" is null then null else 'Label ' || left("id"::text, 8) end`,
      extension: `case when "extension" is null then null else '000' end`,
      opt_out_source: `case when "opt_out_source" is null then null else 'withheld' end`,
      metadata: `'{}'::jsonb`,
    },
    columnsNote:
      "EVERY COLUMN IS COPIED; the 4 column(s) below are SYNTHESISED ON PRODUCTION and never read: " +
      "label extension opt_out_source metadata.",
  },
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

interface SelfFk {
  readonly name: string;
  readonly column: string;
  /** The column of the SAME table it points at — very nearly always the primary key. */
  readonly parentColumn: string;
}

/**
 * 🚨 SELF-REFERENCING FOREIGN KEYS — the batched copy's 23503, and why nothing
 * else in this file catches it.
 *
 * A table that points at ITSELF (`crm.party.primary_employer_party_id`, and two
 * more on the same table: `canonical_id`, `source_party_id`) is copied in
 * batches of `floor(30000 / ncols)` rows — 483 for a 62-column table — ORDERED BY
 * PRIMARY KEY. A plain foreign key's referential-integrity check fires at the END
 * OF EACH STATEMENT, so a referrer that lands in batch 1 whose parent sorts into
 * batch 3 aborts the WHOLE copy with
 *
 *   23503 insert or update on table "party" violates foreign key constraint
 *   "party_primary_employer_party_id_fkey"
 *
 * and takes the run's single transaction down with it. It is invisible to every
 * existing mechanism: `assertCopyOrder` skips `parent === t` outright, and
 * `outsideFks` only looks at parents OUTSIDE the copy set. The old comment in
 * `assertCopyOrder` said such columns "hold zero non-null values — measured",
 * which was true of the tables in the set on 2026-09-16 and is a measurement, not
 * a property.
 *
 * THE FIX IS GENERAL AND DERIVED FROM THE CATALOGUE, not configured per table:
 * every VALIDATED, single-column, NULLABLE foreign key whose `conrelid` equals
 * its `confrelid` is written NULL during the copy, its `(primary key, value)`
 * pairs are kept, and one `update … from (values …)` pass per column resolves
 * them after that table's last batch lands — inside the SAME transaction, with
 * the same triggers still disabled. Announced by column and count on every run.
 *
 * A NOT NULL self-reference cannot be deferred at all and is a refusal, by name:
 * there is no value to write in the meantime.
 */
async function selfReferencingFks(client: pg.Client, qualified: string): Promise<SelfFk[]> {
  const r = await client.query<{
    conname: string;
    cols: string[];
    fcols: string[];
    notnull: boolean;
  }>(
    `select c.conname,
            (select array_agg(a.attname::text order by k.ord)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols,
            (select array_agg(a.attname::text order by k.ord)
               from unnest(c.confkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as fcols,
            (select coalesce(bool_or(a.attnotnull), false)
               from unnest(c.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as notnull
       from pg_constraint c
      where c.conrelid = $1::regclass and c.confrelid = c.conrelid and c.contype = 'f'
        and c.convalidated
      order by c.conname`,
    [qualified],
  );
  const out: SelfFk[] = [];
  for (const row of r.rows) {
    if (row.cols.length !== 1) {
      throw new Error(
        `${qualified}: ${row.conname} is a COMPOSITE self-referencing foreign key. The copy writes ` +
          `in batches ordered by primary key, so it would abort 23503 on a referrer whose parent ` +
          `sorts into a later batch, and this script's two-pass resolution is single-column. Add ` +
          `the composite case here rather than hoping the column is always null.`,
      );
    }
    if (row.notnull) {
      throw new Error(
        `${qualified}.${row.cols[0]} is NOT NULL and references ${qualified} itself (${row.conname}). ` +
          `A batched copy cannot defer it — there is no value to write in the meantime — and a ` +
          `single-statement copy of this table is not what this script does.`,
      );
    }
    out.push({ name: row.conname, column: row.cols[0]!, parentColumn: row.fcols[0]! });
  }
  return out;
}

/** Every primary key the BRANCH currently holds for a table, in the copy's key shape. */
async function branchKeysOf(branch: pg.Client, qualified: string): Promise<Set<string>> {
  const pk = await pkOf(branch, qualified);
  const rows = await branch.query(
    `select ${pk.map((c) => `"${c}"::text as "${c}"`).join(", ")} from ${qualified}`,
  );
  return new Set(
    rows.rows.map((r) => pk.map((c) => String((r as Record<string, unknown>)[c])).join("\\0")),
  );
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

/**
 * THE UNIQUE KEYS THAT ARE NOT THE PRIMARY KEY — and why an `upsert` is not
 * complete without them (measured 2026-09-16, and it aborted the whole copy).
 *
 * `on conflict (<pk>) do update` reconciles the PRIMARY key and nothing else, so a
 * production row that is NEW by id and COLLIDES by natural key with a row the branch
 * already holds raises 23505 and takes the run down. It happened on the real branch:
 *
 *   duplicate key value violates unique constraint
 *   "permissions_resource_type_resource_id_granted_to_user_id_key"
 *   Key (resource_type, resource_id, granted_to_user_id)=(hr_workflow_instance, …) already exists
 *
 * — a grant production revoked and re-issued under a new id since the last copy. The
 * branch is meant to hold PRODUCTION's rows, so the branch's stale row goes, by name and
 * with a count, before the incoming row lands.
 */
async function secondaryUniquesOf(
  client: pg.Client,
  qualified: string,
  pk: readonly string[],
): Promise<string[][]> {
  const r = await client.query<{ conname: string; cols: string[] }>(
    `select c.conname,
            -- attname is of type name, and node-pg has no array parser for name[]:
            -- without the ::text cast this comes back as the STRING "{a,b}" and every
            -- use of it as an array throws.
            array(select a.attname::text
                    from unnest(c.conkey) with ordinality k(attnum, ord)
                    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
                   order by k.ord) as cols
       from pg_constraint c
      where c.conrelid = $1::regclass and c.contype = 'u'
      order by c.conname`,
    [qualified],
  );
  const pkKey = [...pk].sort().join(",");
  return r.rows.map((x) => x.cols).filter((cols) => [...cols].sort().join(",") !== pkKey);
}

/**
 * THE TWO IDENTITIES THAT CAN SIGN IN ON THE BRANCH, and nobody else.
 *
 * Both are the workspace's documented TEST accounts, and neither is copied: the
 * copy leaves every `auth.users` row an id-only shell with a synthetic
 * `@corpus.invalid` address, empty metadata, no password hash and a far-future
 * `banned_until`. These two rows are then CREATED — their real test address
 * written on, the ban lifted, and a BRANCH-ONLY password set from the
 * environment. So the set of people who can sign in on the rehearsal branch is
 * exactly the set of people who could sign in on a database we had built from
 * nothing, which is the whole point of a shell.
 *
 * Their production ids are LOOKED UP (`where email = $1`, two known test
 * addresses) rather than copied, because the access graph's foreign keys point
 * at those ids and a corpus that recognised a different id would prove nothing.
 *
 * 🚨 THE ADDRESSES ARE LITERALS, AND THAT IS DELIBERATE (measured 2026-09-16).
 * The first revision of this step read the address from `TEST_USER_EMAIL`,
 * which in `../aidream/.env` holds `arman@armansadeghi.com` — his REAL
 * production account. One run therefore wrote his real address back onto a
 * shell and gave it the shared test password. An env var is a value, never the
 * decision about WHOSE identity gets a password: the two test accounts are
 * named here, in code, and only their PASSWORDS come from the environment.
 */
const SIGN_IN_IDENTITIES = [
  { email: "test@test.com", passwordVar: "TEST_USER_PASSWORD", passwordDefault: "Password1234#" },
  { email: "admin@admin.com", passwordVar: "AI_ADMIN_PASSWORD", passwordDefault: undefined },
] as const;

/**
 * The environment, then this repo's env files, then the aidream checkout's
 * `.env` — the same order `scripts/lib/direct-db-env.ts` resolves the five
 * connection variables in. Values are used, NEVER printed.
 */
function secretsBag(): Record<string, string | undefined> {
  const files = [
    resolve(ROOT, ".env.local"),
    resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ];
  const bag: Record<string, string | undefined> = {};
  for (const path of [...files].reverse()) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue; // an absent env file is not an error; the caller says what it needed
    }
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) bag[m[1]!] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
    }
  }
  return { ...bag, ...process.env };
}

/** The two addresses whose branch rows are real sign-in identities, in order. */
function signInEmails(): string[] {
  return SIGN_IN_IDENTITIES.map((i) => i.email);
}

/**
 * Turn exactly two of the shells back into usable sign-in identities. Returns
 * the number of failures so the caller's exit code carries them.
 */
async function mintSignInIdentities(prod: pg.Client, branch: pg.Client): Promise<number> {
  const bag = secretsBag();
  let failures = 0;
  const bad = (what: string) => {
    failures += 1;
    console.error(`${FAIL}${what}`);
  };

  const crypt = await branch.query<{ n: string }>(
    `select count(*)::text n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.proname in ('crypt','gen_salt') and n.nspname = 'extensions'`,
  );
  if (Number(crypt.rows[0]!.n) < 2) {
    bad(
      `the branch has no extensions.crypt/gen_salt (pgcrypto), so no branch-only password can be ` +
        `written. Remedy: create extension pgcrypto with schema extensions; on the branch. The ` +
        `copy is intact — every identity is a shell and NOBODY can sign in until this is fixed.`,
    );
    return failures;
  }

  for (const spec of SIGN_IN_IDENTITIES) {
    const email = spec.email;
    const password = (bag[spec.passwordVar] ?? spec.passwordDefault ?? "").trim();
    if (!password) {
      bad(
        `${email}: no password — ${spec.passwordVar} is not in the environment, this repo's env ` +
          `files or ../aidream/.env. Remedy: set it there. The identity stays a BANNED SHELL and ` +
          `every lane that signs in as ${email} on the branch will fail loudly rather than ` +
          `silently walking as the anon key.`,
      );
      continue;
    }
    const found = await prod.query<{ id: string }>(
      `select id::text id from auth.users where email = $1`,
      [email],
    );
    if (found.rowCount !== 1) {
      bad(
        `${email}: production holds ${found.rowCount} row(s) with that address, not 1, so there ` +
          `is no id for the access graph's foreign keys to agree with. Nothing was written for ` +
          `this identity.`,
      );
      continue;
    }
    const id = found.rows[0]!.id;
    const res = await branch.query(
      `update auth.users
          set email = $2,
              email_confirmed_at = coalesce(email_confirmed_at, now()),
              banned_until = null,
              -- CREATED, not copied: production's own metadata for these two rows
              -- (avatar URLs, capability flags such as mcp.full_access) is NOT
              -- carried over. A branch identity holds what a freshly created one
              -- would hold, and a lane that needs more says so out loud.
              raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
              raw_user_meta_data = '{"email_verified": true}'::jsonb,
              encrypted_password = extensions.crypt($3, extensions.gen_salt('bf')),
              confirmation_token = '', recovery_token = '',
              email_change_token_new = '', email_change = '',
              updated_at = now()
        where id = $1::uuid`,
      [id, email, password],
    );
    if (res.rowCount !== 1) {
      bad(
        `${email}: the branch has no auth.users row for ${id}, so the copy did not carry the ` +
          `identity the access graph points at. Nothing was written.`,
      );
      continue;
    }
    console.log(
      `${OK}${email.padEnd(16)} CREATED on the branch as a real sign-in identity (id ${id}) — ` +
        `branch-only password from ${spec.passwordVar}, never printed; production's password ` +
        `hash and metadata were not read`,
    );
  }
  return failures;
}

/** The boundary the copy recorded, so `--verify` never re-reads a moving source. */
// NOT in `public`: the live platform._ddl_guard() event trigger refuses a NEW
// table there by name ("public keeps functions and RPCs, never tables"), and it
// is live on the branch. Its own schema, so `W0-CORPUS` owning `corpus` and this
// lane owning its boundary never collide.
const RUN_SCHEMA = "restore_graph";
const RUN_TABLE = `${RUN_SCHEMA}.run`;

/**
 * §13's RECEIPT. Created by `migrations/rehearsal/campaign_watch_refresh_run.sql`
 * through the migration runner (`pnpm db:apply … --target branch`) and NOT by
 * this script: `ensureRunTable` above is the older boundary table and predates
 * the rule, but a table `W7-GATE` reads as its entry is campaign machinery, and
 * campaign machinery is created by a file in `migrations/`, never by a script
 * that happens to be running. A merge whose receipt table is missing REFUSES and
 * names the file — it does not create it.
 */
const REFRESH_RUN_TABLE = "campaign_watch.refresh_run";
const REFRESH_RUN_MIGRATION = "migrations/rehearsal/campaign_watch_refresh_run.sql";

/**
 * THE DOOR SURFACE, and why `--verify` fails on it (W0-DATA's row, 2026-09-17).
 *
 * A DB-wide event trigger REVOKES client EXECUTE on any SECURITY DEFINER
 * function with no `platform.client_callable_door` row, INSIDE the GRANT itself.
 * So a function production has added since the copy has no door row on the
 * branch, its client EXECUTE grant silently does not stick, and an authenticated
 * read against that surface answers `403 permission denied for function …` —
 * with the schema exposed and every table grant in place. Nine wave-2 and wave-6
 * lanes issue real HTTP reads against that surface hours before THE REFRESH
 * would fix it, so the copy's door surface is compared on EVERY `--verify`.
 *
 * THE COMPARISON IS BY NAME AND BY DEFINITION HASH, never by count. A count
 * cannot tell "production added five doors" from "five doors changed their
 * policy and five were removed". The door's own name is its catalogue identity —
 * `client_callable_door_catalog_identity_key` is UNIQUE on
 * (schema_name, function_name, identity_argtypes) — and its DEFINITION is the
 * policy the row states: who may call it, under what gate, with what reason.
 *
 * THE TWO VERDICTS, and they are deliberately not the same:
 *   · a door production holds that the branch LACKS is the ageing the copy
 *     cannot help — new functions land all day. W0-DATA's row allows FIVE and
 *     fails by name past that, with "re-run the copy" as the printed remedy.
 *   · a door both hold whose DEFINITION differs is not ageing, it is the branch
 *     carrying a different policy from the one production enforces, and ONE is
 *     too many. No tolerance.
 */
const DOOR_TABLE = "platform.client_callable_door";
const DOOR_SURFACE_SQL =
  `select schema_name || '.' || function_name || '(' || identity_args || ')' as door,
          md5(coalesce(gate_predicate,'') || '|' || anonymous_callers::text || '|' ||
              coalesce(anonymous_purpose,'') || '|' || signed_in_callers::text || '|' ||
              coalesce(non_client_lane,'') || '|' || coalesce(reason,'')) as def_hash
     from ${DOOR_TABLE}`;

/**
 * 🚨 THE NAME IS `identity_args`, NOT `identity_argtypes`, AND THAT IS THE WHOLE
 * TRICK (measured 2026-09-17).
 *
 * `identity_argtypes` is `oid[]`, and a type OID MEANS NOTHING ACROSS TWO
 * DATABASES. The copy writes production's OIDs onto the branch verbatim, so
 * rendering them through `::regtype::text` resolves to production's types on
 * production and to whatever happens to hold those OIDs on the branch — for a
 * built-in type the numbers agree, for every custom one they do not, and
 * `public.update_context_item` rendered as
 *   (uuid,text,text,text,context_value_type,…)   on production
 *   (uuid,text,text,text,1698626,…)              on the branch
 * so twenty doors that are present on BOTH databases were reported missing from
 * the branch, and the clause failed for a reason that had nothing to do with the
 * door surface. `identity_args` is the declared argument list as TEXT — portable,
 * unique per overload, and the string an operator would recognise.
 */

/**
 * §13 point 4 names two tables, and it names them because they are the two the
 * campaign's own lanes write into: `W1-REL` stores relations as associations,
 * and every wave-3 to wave-6 lane writes the same two tables. They are also
 * exactly the copy set's `replace` tables — the ones a bare re-run empties.
 */
const MARKER_TABLES = COPY_TABLES.filter((t) => t.policy === "replace").map((t) => t.table);

async function ensureRunTable(branch: pg.Client): Promise<void> {
  await branch.query(`create schema if not exists ${RUN_SCHEMA}`);
  await branch.query(
    `create table if not exists ${RUN_TABLE} (
       id bigserial primary key,
       ran_at timestamptz not null default now(),
       prod_snapshot text not null,
       prod_taken_at timestamptz not null,
       counts jsonb not null,
       extras jsonb not null default '{}'::jsonb
     )`,
  );
  // 🚨 ATTACK-7 finding 14. `prod_taken_at` was `text`, so `W7-GATE`'s exit
  // clause — written as `now() - prod_taken_at` — raised
  //   42883: operator does not exist: timestamp with time zone - text
  // and the staleness check the book requires could not run at all. The column is
  // a POINT IN TIME, so it is stored as one; casting at every read site would have
  // left the next reader to remember the cast, and the gate's own text names the
  // uncast expression. Existing rows migrate in place and keep reading: every
  // value ever written came from production's `now()::text`
  // (`2026-09-16 03:49:55.480409+00`), which `::timestamptz` parses exactly.
  // Idempotent, and it does nothing at all on a table already converted.
  const current = (
    await branch.query<{ t: string }>(
      `select data_type t from information_schema.columns
        where table_schema = $1 and table_name = 'run' and column_name = 'prod_taken_at'`,
      [RUN_SCHEMA],
    )
  ).rows[0]?.t;
  if (current && current !== "timestamp with time zone") {
    await branch.query(
      `alter table ${RUN_TABLE}
         alter column prod_taken_at type timestamptz using prod_taken_at::timestamptz`,
    );
    console.log(
      `${OK}${RUN_TABLE}.prod_taken_at migrated ${current} → timestamptz ` +
        `${C.dim}(ATTACK-7 finding 14: \`now() - prod_taken_at\` raised 42883)${C.reset}`,
    );
  }
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
 * the copy set. Self-references are skipped HERE because no ordering of the list
 * can fix them — a table cannot be copied before itself — and they are handled
 * instead by `selfReferencingFks()`'s two-pass resolution, which writes the
 * column NULL during the copy and resolves it after the table's last batch. (The
 * comment this replaces said such columns "hold zero non-null values —
 * measured"; that was a reading of one day's data, and `crm.party` carries five.)
 * NOT VALID constraints are ignored because the copy drops and re-creates them
 * around itself.
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
  // ── §13: THE REFRESH IS A MERGE, AND IT IS A DIFFERENT OPERATION ─────────
  // Not a re-run of the first restore under another name. `--merge` upserts
  // production's rows on each copied table's own primary key and deletes only
  // rows the new snapshot lacks WHOSE MARKER SAYS THE CAMPAIGN DID NOT WRITE
  // THEM; the first restore's `delete from` is what §13 exists to stop happening
  // ninety minutes before the terminal gate.
  const mergeMode = process.argv.includes("--merge");
  // `W2-EPOCH`'s wave-2 rehearsal (§13.5) sets the flag `W7-GATE` requires.
  const rehearsalFlag = process.argv.includes("--rehearsal");
  const laneArg = process.argv.find((a) => a.startsWith("--lane="))?.slice("--lane=".length);
  if (mergeMode && verifyOnly) {
    console.error(
      `${FAIL}--merge and --verify are different operations: one writes the branch, the other ` +
        `only reads it. Run them one after the other, in §13's order: --merge, then run.ts, then ` +
        `--verify.`,
    );
    return 2;
  }
  if (rehearsalFlag && !mergeMode) {
    console.error(
      `${FAIL}--rehearsal marks a MERGE as §13.5's wave-2 rehearsal in the receipt. There is no ` +
        `receipt without --merge.`,
    );
    return 2;
  }
  if (mergeMode)
    console.log(
      `${C.bold}${INFO}--merge — THE REFRESH (BUILD-BOOK §13). Production's rows are UPSERTED on ` +
        `each table's own primary key; nothing the campaign wrote is deleted or overwritten; one ` +
        `receipt row lands in ${REFRESH_RUN_TABLE}.${C.reset}`,
    );
  // Parsed BEFORE a connection is opened: a typo'd ceiling must refuse here, not
  // become the default halfway through a run that then reports itself green.
  let maxBoundaryAge: { hours: number; explicit: boolean };
  try {
    maxBoundaryAge = parseMaxBoundaryAgeHours(process.argv);
  } catch (err) {
    console.error(`${FAIL}${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  console.log(
    `${INFO}boundary freshness ceiling: ${formatAgeHours(maxBoundaryAge.hours)}` +
      (maxBoundaryAge.explicit
        ? ` ${C.yellow}(set explicitly with --max-boundary-age; the default is ` +
          `${formatAgeHours(DEFAULT_MAX_BOUNDARY_AGE_HOURS)})${C.reset}`
        : ` ${C.dim}(the default; --max-boundary-age=<hours> moves it)${C.reset}`),
  );
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
  /** WHEN the snapshot every floor line is measured against was taken. Carried so
   *  those lines can name it: "production's 4603" was a snapshot wearing the
   *  present tense (ATTACK-7 finding 6), and a reader at 3 a.m. read it as a live
   *  count. On a copy run it is this run's own snapshot; on `--verify` it is the
   *  recorded boundary's. */
  let boundaryTakenAt: string | undefined;
  /** production's primary keys per table, collected during the copy, so PROOF 3
   *  is an exact set comparison and not a count that two errors could cancel. */
  const copiedKeys = new Map<string, Set<string>>();
  /** §13's marker, per MARKER table, resolved against the live branch table. */
  const markers = new Map<string, Marker>();
  /** What the merge did, per table — the receipt's `per_table`. */
  const mergeCounts = new Map<string, TableMergeCounts>();
  /** §13 point 4's two numbers, which `W7-GATE` requires to be EQUAL. */
  const campaignBefore: Record<string, number> = {};
  const campaignAfter: Record<string, number> = {};
  /** Production's snapshot primary keys for the marker tables. */
  const snapshotKeys = new Map<string, Set<string>>();
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
    boundaryTakenAt = snap.takenAt;
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
      // 🚨 ONE TRANSACTION ON THE BRANCH, FROM THE FIRST TRIGGER DISABLE TO THE LAST
      //    CONSTRAINT PUT BACK (measured 2026-09-16 — the failure mode is not theoretical).
      //
      //    `platform.associations` and `platform.reachability` are `replace`: they are
      //    EMPTIED and then refilled. Until this line the two halves were separate
      //    autocommitted statements, so a failure anywhere between them left the branch
      //    holding an EMPTY GRAPH with the run's own error as the only notice. It happened:
      //    `iam.permissions` raised 23505 on a natural key, the run aborted, triggers were
      //    put back, and the branch was left with 0 associations and 0 reachability rows —
      //    the exact state ATTACK-8 finding 3 reported the gate cannot see.
      //
      //    DDL is transactional in Postgres, so the trigger disables and the FK drops roll
      //    back with the data. A rollback therefore restores the branch to what it was and
      //    `restoreGuards()` has nothing left to do — which is why the catch below rolls
      //    back FIRST and says so.
      await branch.query("begin");
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

      // ── THE TWO PATHS, and the whole of §13 is the difference between them ─
      //
      // THE FIRST RESTORE empties a `replace` table and refills it. That is
      // correct exactly once — before any lane has written a row — and
      // `W0-CORPUS`'s entry says so in those words.
      //
      // THE REFRESH (`--merge`) does not empty anything. It upserts production's
      // rows on the table's own primary key and deletes only what the new
      // snapshot lacks and the marker says the campaign did not write.
      if (!mergeMode) {
        for (const { table: t, policy } of [...COPY_TABLES].reverse()) {
          if (policy !== "replace") continue;
          const before = Number((await branch.query<{ n: string }>(`select count(*)::text n from ${t}`)).rows[0]!.n);
          await branch.query(`delete from ${t}`);
          console.log(`${INFO}${t}: replace — removed ${before} pre-existing branch row(s)`);
        }
      } else {
        for (const t of MARKER_TABLES) {
          const pk = await pkOf(prod, t);
          // Read inside the SAME repeatable-read snapshot every count came from,
          // so "production does not hold this key" means it at one instant and
          // not across a moving read.
          const keyRows = await prod.query(
            `select ${pk.map((c) => `"${c}"::text as "${c}"`).join(", ")} from ${t}`,
          );
          snapshotKeys.set(
            t,
            new Set(
              keyRows.rows.map((r) =>
                pk.map((c) => String((r as Record<string, unknown>)[c])).join("\\0"),
              ),
            ),
          );
          const marker = await resolveMarker(
            branch,
            t,
            COPY_TABLES.find((c) => c.table === t)?.campaignOwned,
          );
          markers.set(t, marker);
          campaignBefore[t] = await countCampaignOwned(
            branch,
            t,
            marker,
            () => branchKeysOf(branch, t),
            snapshotKeys.get(t)!,
          );
          if (marker.kind === "declared-predicate")
            console.log(
              `${OK}${t.padEnd(30)} marker ${C.bold}${marker.template.replaceAll("{alias}", t.split(".").pop()!)}${C.reset} ` +
                `(the table's own) — ${campaignBefore[t]} campaign-owned row(s) before the merge, and ` +
                `neither the upsert nor the delete may touch one. ${marker.because}`,
            );
          else if (marker.kind === "origin-column")
            console.log(
              `${OK}${t.padEnd(30)} marker ${C.bold}${marker.column} = '${marker.value}'${C.reset} ` +
                `(§13's own) — ${campaignBefore[t]} campaign-owned row(s) before the merge, and ` +
                `neither the upsert nor the delete may touch one`,
            );
          else
            console.log(
              `${C.yellow}[WARN]${C.reset} ${t}: ${marker.because} ${campaignBefore[t]} row(s) ` +
                `are campaign-owned under that rule before the merge.`,
            );
        }
      }

      for (const entry of COPY_TABLES) {
        const { table: t, policy } = entry;
        const only = entry.columns;
        const allCols = await columnsOf(prod, t);
        // 🚨 THE PERSONAL-DATA CENSUS, MEASURED AGAINST PRODUCTION'S CATALOGUE.
        // `identity-shell-contract.ts` judges these tables column by column out
        // of a declared list, and a declared list rots the moment production
        // grows a column — it would read green while a person's new value went
        // over the wire. So the list is checked against the real shape here,
        // before a row moves, and a difference is a refusal in either direction:
        // a column production has and the census lacks is UNJUDGED, and one the
        // census has and production lacks means the guard is judging a table
        // that no longer exists in that shape.
        const census = PERSONAL_DATA_TABLES[t];
        if (census) {
          const live = allCols.map((c) => c.name);
          const added = live.filter((c) => !census.includes(c));
          const gone = census.filter((c) => !live.includes(c));
          if (added.length || gone.length) {
            fail(
              `${t}: production's columns and PERSONAL_DATA_TABLES's census disagree` +
                (added.length
                  ? `\n    production has, the census does not: ${added.join(", ")} — UNJUDGED by ` +
                    `the personal-data guard, so a real value would be copied with nothing saying so`
                  : "") +
                (gone.length
                  ? `\n    the census has, production does not: ${gone.join(", ")} — the guard is ` +
                    `judging a shape this table no longer has`
                  : "") +
                `\n    Update PERSONAL_DATA_TABLES and say, for each new column, whether it is ` +
                `synthesised or why it names nobody. Nothing was written.`,
            );
            return 1;
          }
          console.log(
            `${OK}${t}: personal-data census agrees with production — ${census.length} columns, ` +
              `each synthesised, structural, or carrying a written reason`,
          );
        }
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
        // SYNTHESISED COLUMNS — the values production's own SQL makes up in
        // place of the real ones. A name that is not a column of the table is a
        // stale list, and a stale list here means a PERSON'S REAL VALUE would be
        // copied silently, so it is a refusal rather than a warning.
        const synth = entry.synthesize ?? {};
        const synthNames = Object.keys(synth);
        {
          const known = new Set(allCols.map((c) => c.name));
          const unknown = synthNames.filter((c) => !known.has(c));
          if (unknown.length) {
            fail(
              `${t}: synthesize names ${unknown.join(", ")}, which production's ${t} does not ` +
                `have. Fix the list — a stale name here copies the real value instead.`,
            );
            return 1;
          }
          const notCopied = synthNames.filter((c) => !cols.some((x) => x.name === c));
          if (notCopied.length) {
            fail(
              `${t}: synthesize names ${notCopied.join(", ")}, which this copy does not write at ` +
                `all. Either copy the column (synthesised) or drop it from synthesize — a name ` +
                `that reaches neither is a disclosure that lies.`,
            );
            return 1;
          }
        }
        const quoted = cols.map((c) => `"${c.name}"`).join(", ");
        // Read EVERY column as Postgres's own text form; see Column.typ.
        const selectList = cols
          .map((c) =>
            synth[c.name]
              ? `(${synth[c.name]})::text as "${c.name}"`
              : `"${c.name}"::text as "${c.name}"`,
          )
          .join(", ");
        if (synthNames.length) {
          console.log(
            `${C.yellow}[WARN]${C.reset} ${t}: SYNTHESISED, NOT COPIED — ` +
              synthNames.map((n) => `${n} := ${synth[n]}`).join("; ") +
              `. Production's real value for these column(s) is never read, never transmitted and ` +
              `never held by this process. A lane that needs the real value must read production.`,
          );
        }
        const pkQuoted = pk.map((c) => `"${c}"`).join(", ");
        const setList = cols
          .filter((c) => !pk.includes(c.name))
          .map((c) => `"${c.name}" = excluded."${c.name}"`)
          .join(", ");
        // In MERGE mode every table is upserted, `replace` included, so every
        // table needs the natural-key reconciliation an upsert needs — a
        // production row that is NEW by id and collides by natural key with a
        // branch row raises 23505 and takes the run down (measured 2026-09-16 on
        // `iam.permissions`).
        const secondaryUniques =
          policy === "upsert" || mergeMode ? await secondaryUniquesOf(prod, t, pk) : [];
        // A SYNTHESISED value that lands in a UNIQUE index must still be unique,
        // and "it is derived from a UUID so of course it is" is exactly the
        // assumption that aborts a copy halfway through on 23505. Asked of
        // PRODUCTION, over the real rows, before a single row is written.
        //
        // Read from `pg_index`, not `pg_constraint`, because the one that
        // matters here is not a constraint: `auth.users`'s email uniqueness is
        // the PARTIAL unique index `users_email_partial_key … where is_sso_user
        // = false`, which `secondaryUniquesOf` cannot see at all. The index's
        // own predicate is carried into the check, so a partial index is
        // checked over exactly the rows it governs.
        if (synthNames.length) {
          const uniq = await prod.query<{ cols: string[]; pred: string | null; name: string }>(
            `select ci.relname as name,
                    array(select a.attname::text
                            from unnest(i.indkey) with ordinality k(attnum, ord)
                            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
                           order by k.ord) as cols,
                    pg_get_expr(i.indpred, i.indrelid) as pred
               from pg_index i
               join pg_class ci on ci.oid = i.indexrelid
              where i.indrelid = $1::regclass and i.indisunique and i.indislive`,
            [t],
          );
          for (const { cols: uk, pred, name } of uniq.rows) {
            if (!uk.some((c) => synthNames.includes(c))) continue;
            const expr = uk
              .map((c) => (synth[c] ? `(${synth[c]})::text` : `"${c}"::text`))
              .join(" || '\\0' || ");
            const where = pred ? ` where ${pred}` : "";
            const dup = await prod.query<{ n: string; e: string | null }>(
              `select count(*)::text n, min(k) e from ` +
                `(select ${expr} k from ${t}${where} group by 1 having count(*) > 1) x`,
            );
            const n = Number(dup.rows[0]!.n);
            if (n > 0) {
              fail(
                `${t}: the synthesised value for unique index ${name} (${uk.join(", ")}) ` +
                  `collides on ${n} production row group(s) — e.g. "${dup.rows[0]!.e}". Widen ` +
                  `the expression; nothing was written.`,
              );
              return 1;
            }
            console.log(
              `${OK}${t}: the synthesised (${uk.join(", ")}) is unique across every production ` +
                `row ${name} governs`,
            );
          }
        }
        let displaced = 0;
        const rowsPerBatch = Math.max(1, Math.floor(MAX_PARAMS / cols.length));
        const prodKeys = new Set<string>();
        const unresolvedRefs = new Map<string, number>();
        const outside = await outsideFks(branch, t, COPY_NAMES);
        const nulled = new Map<string, number>();
        // SELF-REFERENCING FOREIGN KEYS: written NULL now, resolved in one pass
        // per column after this table's last batch lands. See `selfReferencingFks`.
        const selfFks = await selfReferencingFks(branch, t);
        const deferred = new Map<string, Array<{ key: unknown[]; value: unknown }>>(
          selfFks.map((f) => [f.column, []]),
        );
        if (selfFks.length)
          console.log(
            `${INFO}${t}: ${selfFks.length} self-referencing foreign key(s) — ` +
              selfFks.map((f) => `${f.column} → ${f.parentColumn} (${f.name})`).join("; ") +
              `. Each is written NULL during the batched copy and resolved in one pass afterwards, ` +
              `inside this same transaction; a batch whose parent sorts later would abort 23503.`,
          );
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
            for (const sf of selfFks) {
              const v = r[sf.column];
              if (v === null || v === undefined) continue;
              deferred.get(sf.column)!.push({ key: pk.map((c) => r[c]), value: v });
              r[sf.column] = null;
            }
            const ph = cols.map((c, j) => {
              values.push(r[c.name]);
              const n = i * cols.length + j + 1;
              return c.isRegclass ? `to_regclass($${n})` : `$${n}::${c.typ}`;
            });
            return `(${ph.join(",")})`;
          });
          // Clear the branch's stale rows that collide on a NATURAL key before the
          // incoming rows land. `on conflict (<pk>)` cannot see them, and one of them
          // aborted the whole copy on 2026-09-16.
          for (const uk of secondaryUniques) {
            const ukCols = uk.filter((c) => cols.some((x) => x.name === c));
            if (ukCols.length !== uk.length) continue; // a shell that does not carry the key
            const carried = [...new Set([...ukCols, ...pk])];
            const typeOf = (name: string) => cols.find((c) => c.name === name)!.typ;
            const dv: unknown[] = [];
            const dTuples = page.rows.map((row, i) => {
              const r = row as Record<string, unknown>;
              const ph = carried.map((c, j) => {
                dv.push(r[c]);
                return `$${i * carried.length + j + 1}::${typeOf(c)}`;
              });
              return `(${ph.join(",")})`;
            });
            const on = ukCols.map((c) => `b."${c}" = p."${c}"`).join(" and ");
            const differs = pk.map((c) => `b."${c}" is distinct from p."${c}"`).join(" or ");
            // 🚨 THIS DELETE IS A DELETE, and §13 forbids deleting a row the
            // campaign wrote — including this way. `platform.associations`
            // carries `associations_unique`, so a campaign-written association
            // CAN collide by natural key with an incoming production row under a
            // different id, and today's code would have removed it silently.
            //
            // With §13's marker the delete simply excludes campaign rows. WITHOUT
            // it — the fallback marker cannot be written as a predicate over the
            // row — the displacement is SKIPPED ENTIRELY on a marker table and
            // the incoming row is left to fail loudly on 23505. A merge that
            // aborts is recoverable; a campaign graph deleted quietly is not.
            const marker = markers.get(t);
            const keep = mergeMode && marker ? campaignOwnedPredicate(marker, "b") : null;
            if (mergeMode && marker && !keep) {
              if (offset === 0)
                console.log(
                `${C.yellow}[WARN]${C.reset} ${t}: the natural-key displacement for ` +
                  `(${uk.join(", ")}) is SKIPPED this run — with no \`${"origin"}\` column there is ` +
                  `no way to tell a campaign row from a stale production one, and this merge will ` +
                  `not guess. A genuine collision fails 23505 and rolls the whole merge back.`,
                );
              continue;
            }
            const res = await branch.query(
              `delete from ${t} b using (values ${dTuples.join(",")}) ` +
                `as p(${carried.map((c) => `"${c}"`).join(", ")}) where ${on} and (${differs})` +
                (keep ? ` and not (${keep})` : ""),
              dv,
            );
            displaced += res.rowCount ?? 0;
          }
          if (mergeMode) {
            // §13 point 2. EVERY table is upserted on its OWN primary key —
            // `replace` included, because a merge does not empty anything — and
            // the `do update` carries the marker, so a row the campaign wrote is
            // returned by nothing and changed by nothing.
            const res = await branch.query<{ inserted: boolean }>(
              mergeInsertSql({
                table: t,
                quotedColumns: quoted,
                quotedPk: pkQuoted,
                setList,
                tuples: tuples.join(","),
                marker: markers.get(t) ?? { kind: "absent-from-production-snapshot", because: "" },
              }),
              values,
            );
            const counts = mergeCounts.get(t) ?? emptyCounts();
            for (const row of res.rows) row.inserted ? (counts.inserted += 1) : (counts.updated += 1);
            // A row of this batch that came back from nothing is a row the
            // marker's WHERE refused to overwrite. That is the number §13 point 2
            // is about, and it is measured rather than inferred.
            counts.skipped_conflict += page.rows.length - res.rows.length;
            mergeCounts.set(t, counts);
          } else {
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
          }
          copied += page.rows.length;
        }
        copiedKeys.set(t, prodKeys);
        // ── PASS TWO: the self-references, now that every row of this table is
        //    on the branch. Same transaction, same disabled triggers. In MERGE
        //    mode a campaign-owned row is excluded exactly as the upsert
        //    excludes it — the refresh does not reach into a row the campaign
        //    wrote, by this door either.
        for (const sf of selfFks) {
          const pairs = deferred.get(sf.column)!;
          if (pairs.length === 0) {
            console.log(
              `${INFO}${t}.${sf.column}: 0 of ${copied} copied row(s) carry a self-reference — ` +
                `nothing to resolve.`,
            );
            continue;
          }
          const marker = markers.get(t);
          const keep = mergeMode && marker ? campaignOwnedPredicate(marker, "b") : null;
          if (mergeMode && marker && !keep) {
            console.log(
              `${C.yellow}[WARN]${C.reset} ${t}.${sf.column}: ${pairs.length} self-reference(s) are ` +
                `NOT resolved this run — the campaign-ownership marker cannot be written as a ` +
                `predicate, so this pass cannot tell a campaign row from a production one and will ` +
                `not guess. The column stays NULL on those rows; W1-REL's \`origin\` column is the ` +
                `remedy.`,
            );
            continue;
          }
          const colType = cols.find((c) => c.name === sf.column)!.typ;
          const perRow = pk.length + 1;
          const rowsPerPass = Math.max(1, Math.floor(MAX_PARAMS / perRow));
          let resolved = 0;
          for (let i = 0; i < pairs.length; i += rowsPerPass) {
            const slice = pairs.slice(i, i + rowsPerPass);
            const vals: unknown[] = [];
            const tuples2 = slice.map((p, n) => {
              const ph = [
                ...pk.map((c, j) => {
                  vals.push(p.key[j]);
                  return `$${n * perRow + j + 1}::${cols.find((x) => x.name === c)!.typ}`;
                }),
                (() => {
                  vals.push(p.value);
                  return `$${n * perRow + pk.length + 1}::${colType}`;
                })(),
              ];
              return `(${ph.join(",")})`;
            });
            const vCols = [...pk.map((c) => `"${c}"`), `"__v"`].join(", ");
            const on = pk.map((c) => `b."${c}" = v."${c}"`).join(" and ");
            const res = await branch.query(
              `update ${t} b set "${sf.column}" = v."__v" ` +
                `from (values ${tuples2.join(",")}) as v(${vCols}) ` +
                `where ${on}` +
                (keep ? ` and not (${keep})` : ""),
              vals,
            );
            resolved += res.rowCount ?? 0;
          }
          if (resolved !== pairs.length) {
            fail(
              `${t}.${sf.column}: production has ${pairs.length} row(s) carrying a self-reference ` +
                `but only ${resolved} were resolved on the branch. The column is left NULL on the ` +
                `rest, which is a silently different graph — nothing about this table can be ` +
                `trusted until it is explained.`,
            );
          } else {
            console.log(
              `${OK}${t}.${sf.column}: ${resolved} self-reference(s) resolved after the last batch ` +
                `(${sf.name}) — written NULL during the copy so a referrer could not outrun its parent`,
            );
          }
        }
        console.log(`${OK}${t.padEnd(30)} ${policy} — ${copied} production row(s) written`);
        if (entry.afterCopy) {
          const res = await branch.query(entry.afterCopy.sql);
          console.log(
            `${INFO}${entry.afterCopy.note} — ${res.rowCount ?? 0} row(s) normalised`,
          );
        }
        if (displaced)
          console.log(
            `${C.yellow}[WARN]${C.reset} ${t}: ${displaced} branch row(s) were removed because a ` +
              `production row carried the same NATURAL key under a different primary key — a grant ` +
              `or registry row re-issued since the last copy. The branch holds production's row.`,
          );
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

      // ── §13 point 2, second half: what the new snapshot no longer holds ────
      //
      // The ONLY deletion a merge performs. It removes a row production has
      // dropped since the copy — and it removes it only when the marker says the
      // campaign did not write it. Under the fallback marker there is no such
      // predicate and therefore NO DELETE AT ALL: the branch keeps a row
      // production has dropped, which is a stale row, and a stale row is
      // recoverable where a deleted campaign graph is not.
      if (mergeMode) {
        for (const t of MARKER_TABLES) {
          const marker = markers.get(t)!;
          const counts = mergeCounts.get(t) ?? emptyCounts();
          const pk = await pkOf(branch, t);
          const cols = await columnsOf(branch, t);
          const pkTypes = pk.map((c) => cols.find((x) => x.name === c)!.typ);
          const keysTable = await withSnapshotKeys(branch, t, pk, pkTypes, snapshotKeys.get(t)!);
          const sql = mergeDeleteSql({ table: t, pk, keysTable, marker });
          if (!sql) {
            console.log(
              `${C.yellow}[WARN]${C.reset} ${t}: the merge deleted NOTHING. ` +
                `${marker.kind === "origin-column" ? "" : marker.because} ` +
                `Remedy: once W1-REL has landed \`origin\`, this same command deletes exactly the ` +
                `rows production no longer holds and nothing else.`,
            );
          } else {
            const res = await branch.query(sql);
            counts.deleted = res.rowCount ?? 0;
            console.log(
              `${OK}${t.padEnd(30)} merge — deleted ${counts.deleted} row(s) production's new ` +
                `snapshot no longer holds, every one of them with ` +
                `${marker.kind === "origin-column" ? `${marker.column} distinct from '${marker.value}'` : "no marker"}`,
            );
          }
          // §13 point 2's number: campaign-owned rows the delete phase SPARED.
          // Under the fallback marker that is every row absent from production's
          // new snapshot, which is also `campaignAfter` — computed once, below,
          // and handed in rather than derived twice.
          const branchNow = await branchKeysOf(branch, t);
          let absentFromSnapshot = 0;
          for (const k of branchNow) if (!snapshotKeys.get(t)!.has(k)) absentFromSnapshot += 1;
          counts.skipped_campaign_owned = await countSpared(
            branch,
            t,
            marker,
            keysTable,
            absentFromSnapshot,
          );
          mergeCounts.set(t, counts);
          campaignAfter[t] = await countCampaignOwned(
            branch,
            t,
            marker,
            () => branchKeysOf(branch, t),
            snapshotKeys.get(t)!,
          );
          const before = campaignBefore[t] ?? 0;
          const after = campaignAfter[t] ?? 0;
          if (after !== before)
            fail(
              `§13: ${t} held ${before} campaign-owned row(s) before the merge and ${after} after. ` +
                `A merge that changes that number has deleted or overwritten something the ` +
                `campaign wrote, which is the one thing THE REFRESH exists to make impossible. ` +
                `The whole merge is rolled back below.`,
            );
          else
            console.log(
              `${OK}${t.padEnd(30)} campaign-owned rows ${before} → ${after} — unchanged by the ` +
                `merge (${counts.inserted} production row(s) inserted, ${counts.updated} updated, ` +
                `${counts.skipped_campaign_owned} left untouched as campaign-owned)`,
            );
        }
        if (failures)
          throw new Error(
            `the merge did not preserve the campaign's own rows — rolling back so the branch is ` +
              `exactly as it was found`,
          );
        // ── §13 point 4: THE RECEIPT, and it is what the gate reads ──────────
        // Inside the merge's own transaction, so a receipt exists if and only if
        // the merge it describes committed.
        const haveReceipt = await branch.query<{ n: string }>(
          `select count(*)::text n from information_schema.tables
            where table_schema = 'campaign_watch' and table_name = 'refresh_run'`,
        );
        if (haveReceipt.rows[0]!.n === "0")
          throw new Error(
            `${REFRESH_RUN_TABLE} does not exist on this branch, and this script does not create ` +
              `it: W7-GATE's entry is campaign machinery and campaign machinery is created by a ` +
              `migration. Remedy: pnpm db:apply ${REFRESH_RUN_MIGRATION} --target branch`,
          );
        const perTable: Record<string, TableMergeCounts> = {};
        for (const [t, c] of mergeCounts) perTable[t] = c;
        const markerLabels = [...new Set([...markers.values()].map((m) => m.kind))];
        await branch.query(
          `insert into ${REFRESH_RUN_TABLE}
             (lane, prod_snapshot, prod_taken_at, marker, per_table,
              campaign_rows_before, campaign_rows_after, rehearsed_in_wave_2)
           values ($1, $2, $3::timestamptz, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)`,
          [
            laneArg ?? null,
            snap.snapshot,
            snap.takenAt,
            markerLabels.join("+"),
            JSON.stringify(perTable),
            JSON.stringify(campaignBefore),
            JSON.stringify(campaignAfter),
            rehearsalFlag,
          ],
        );
        console.log(
          `${OK}receipt written to ${REFRESH_RUN_TABLE} — snapshot ${snap.snapshot}, marker ` +
            `${markerLabels.join("+")}, rehearsed_in_wave_2 ${rehearsalFlag}. W7-GATE reads this row.`,
        );
      }

      // ── Put everything back, then PROVE it is back ────────────────────────
      await restoreGuards();
      await branch.query("commit");
      console.log(
        `${OK}the copy committed as ONE transaction — until it did, the branch held its ` +
          `previous graph, and a failure would have left it exactly as it was found`,
      );

      // ── The two sign-in identities, CREATED after the shells landed ───────
      // Deliberately AFTER the commit and outside it: this step writes two rows
      // and touches nothing the graph proofs read, so a failure here must not
      // roll back a 40,000-row copy — it must be reported, loudly, with the
      // remedy, while the branch keeps the graph it just took.
      failures += await mintSignInIdentities(prod, branch);
    }

    // ── PROOF 6: THE IDENTITY SHELL ─────────────────────────────────────────
    // The query `W0-DATA`'s own row nominates as the thing that makes the lane
    // "unable to pass while broken", run by the script on EVERY run — copy and
    // `--verify` alike. It reports COUNTS and never a single address: printing
    // the offenders to prove a privacy failure would be the privacy failure.
    {
      const emails = signInEmails();
      // THREE KINDS OF ROW, and the difference decides every clause below.
      // A row's own address says which it is, because the shell's address is
      // MADE from its id (`u-<first 8>@corpus.invalid`) and nothing else here
      // wears that shape.
      const TWO = `email = any($1::text[])`; //            the two sign-in identities
      const SHELL = `email like 'u-%@corpus.invalid'`; //  a copied production id
      const CORPUS = `email like '%@corpus.invalid' and ${SHELL} is not true`; // the gate corpus's own principals
      // node-pg refuses a bind carrying a parameter the statement never names,
      // so a clause that does not mention the two identities is sent without it.
      const q = async (what: string) =>
        Number(
          (
            await branch.query<{ n: string }>(
              `select count(*)::text n from auth.users where ${what}`,
              what.includes("$1") ? [emails] : [],
            )
          ).rows[0]!.n,
        );
      // The clause the lane's exit names, word for word.
      const named = await q(
        `email is not null and not (${TWO}) and not (${CORPUS}) and not (${SHELL})`,
      );
      const meta = await q(
        `(raw_user_meta_data::text <> '{}' or raw_app_meta_data::text <> '{}') ` +
          `and (email is null or (not (${TWO}) and not (${CORPUS})))`,
      );
      // The corpus's own principals are exempt from the address and metadata
      // clauses (they ARE the corpus), but NOT from this one: a password hash
      // anywhere but the two named identities means something can sign in on
      // this branch that nobody declared.
      const hashed = await q(`encrypted_password is not null and (email is null or not (${TWO}))`);
      const unbanned = await q(`(${SHELL}) and (banned_until is null or banned_until <= now())`);
      const total = Number(
        (await branch.query<{ n: string }>(`select count(*)::text n from auth.users`)).rows[0]!.n,
      );
      const signInReady = (
        await branch.query<{ n: string }>(
          `select count(*)::text n from auth.users
            where email = any($1::text[]) and encrypted_password is not null
              and (banned_until is null or banned_until <= now())`,
          [emails],
        )
      ).rows[0]!.n;
      if (named)
        fail(
          `auth.users carries ${named} email address(es) that are neither a synthetic ` +
            `@corpus.invalid shell nor ${emails.join(" / ")}. The copy took a real person's ` +
            `address. Remedy: the address columns belong in COPY_TABLES' auth.users ` +
            `\`synthesize\`, and this branch must be overwritten before anything else runs.`,
        );
      if (meta)
        fail(
          `auth.users carries ${meta} non-empty raw_user_meta_data/raw_app_meta_data blob(s) ` +
            `outside the two sign-in identities — names, avatars and provider ids that were ` +
            `meant to be synthesised to {}.`,
        );
      if (hashed)
        fail(`auth.users carries ${hashed} password hash(es) outside the two sign-in identities.`);
      if (unbanned)
        fail(
          `${unbanned} shell identity(ies) are not banned, so GoTrue would treat them as ` +
            `sign-in candidates rather than refusing them outright.`,
        );
      if (!named && !meta && !hashed && !unbanned)
        console.log(
          `${OK}THE IDENTITY SHELL — of ${total} auth.users row(s): 0 real email addresses, ` +
            `0 metadata blobs and 0 password hashes outside ${emails.join(" / ")}, and every ` +
            `shell is banned. ${signInReady} of ${emails.length} sign-in identity(ies) are usable`,
        );
      if (Number(signInReady) !== emails.length)
        fail(
          `only ${signInReady} of ${emails.length} sign-in identity(ies) (${emails.join(" / ")}) ` +
            `can actually sign in on the branch. Every client lane that walks the grid as one of ` +
            `them would fall back to the anon key and measure the wrong posture.`,
        );
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
        else if (policy === "replace" && !mergeMode && extra.length)
          fail(`${t}: ${extra.length} branch row(s) production does not hold — a replace table must be exactly production's (e.g. ${extra[0]?.replace(/\u0000/g, "|")})`);
        else if (policy === "replace" && mergeMode && extra.length) {
          // A MERGE is ALLOWED to leave rows production does not hold — that is
          // the whole point of §13 — but only rows the CAMPAIGN owns. Under
          // §13's own marker an extra carrying no marker is a row nobody can
          // account for, and it fails by name. Under the FALLBACK marker every
          // extra is campaign-owned by that marker's own definition, so the line
          // proves less than it will once `origin` exists — and it SAYS SO
          // rather than reading like a pass it has not earned.
          const marker = markers.get(t)!;
          const owned = campaignOwnedPredicate(marker, t.split(".").pop()!);
          if (marker.kind === "origin-column" && owned) {
            const alias = t.split(".").pop();
            const unmarked = Number(
              (
                await branch.query<{ n: string }>(
                  `select count(*)::text n from ${t} as ${alias} where not (${owned})`,
                )
              ).rows[0]!.n,
            );
            // Every row that is NOT campaign-marked must be one of production's
            // snapshot rows; anything left over is a row nobody can account for.
            const unaccounted = unmarked - (prodKeys.size - missing.length);
            if (unaccounted > 0)
              fail(
                `${t}: ${unaccounted} branch row(s) are neither in production's snapshot nor ` +
                  `marked ${marker.column} = '${marker.value}' — the merge cannot account for them.`,
              );
            else
              console.log(
                `${OK}${t.padEnd(30)} all ${prodKeys.size} snapshot row(s) present, +${extra.length} ` +
                  `campaign-owned row(s) kept by the merge`,
              );
          } else
            console.log(
              `${OK}${t.padEnd(30)} all ${prodKeys.size} snapshot row(s) present, +${extra.length} ` +
                `row(s) production does not hold — campaign-owned BY THE FALLBACK MARKER'S OWN ` +
                `DEFINITION, which is weaker than §13's and tightens when W1-REL lands the origin column`,
            );
        }
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
        // A `replace` base is exact ONLY on the first restore. After §13's MERGE
        // it keeps the campaign's own rows, so its views derive production's
        // count PLUS however many of those extras satisfy them — the same range
        // an `upsert` base has always had, for the same reason (measured
        // 2026-09-17: the first merge run derived 6,199 containment edges
        // against production's 6,191 and failed a rule written for a table that
        // is emptied first).
        const slack = policy === "upsert" || mergeMode ? (extrasKept[base] ?? 0) : 0;
        extrasKept[view] = n - want;
        if (n < want || n > want + slack)
          fail(
            `${view} (derived from ${base}, never copied): branch derives ${n}, production's snapshot ` +
              `held ${want}` +
              (slack
                ? ` and ${base} kept ${slack} branch-only row(s), so anything from ${want} to ${want + slack} is honest — ${n} is not`
                : ` and ${base} was emptied and refilled, so the count must be exact`),
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
          // $2 is cast by name: `snap.takenAt` is production's `now()::text`, and the
          // column is a timestamptz (ATTACK-7 finding 14) — never left to inference.
          `insert into ${RUN_TABLE} (prod_snapshot, prod_taken_at, counts, extras) values ($1, $2::timestamptz, $3::jsonb, $4::jsonb)`,
          [snap.snapshot, snap.takenAt, JSON.stringify(snap.counts), JSON.stringify(extrasKept)],
        );
        console.log(`${OK}boundary recorded in ${RUN_TABLE} — this is what --verify compares against`);
      }
    } else {
      await ensureRunTable(branch);
      // `now() - prod_taken_at` is `W7-GATE`'s own expression, measured by the
      // database and not by this process's clock — the branch is the one clock both
      // the gate and the copy agree on. It runs because the column is a timestamptz
      // (ATTACK-7 finding 14); before that it raised 42883.
      const last = await branch.query<{
        ran_at: string; prod_snapshot: string; prod_taken_at: string; age_hours: string | null;
        counts: Record<string, number>; extras: Record<string, number>;
      }>(
        `select ran_at::text,
                prod_snapshot,
                prod_taken_at::text,
                (extract(epoch from (now() - prod_taken_at)) / 3600.0)::text as age_hours,
                counts,
                extras
           from ${RUN_TABLE} order by id desc limit 1`,
      );
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
        boundaryTakenAt = boundary.prod_taken_at;
        // 🚨 ATTACK-7 finding 6 — THE CEILING. Printed every run, pass or fail.
        const ageVerdict = boundaryAgeVerdict(
          Number(boundary.age_hours ?? Number.NaN),
          maxBoundaryAge.hours,
          boundary.prod_taken_at,
        );
        if (ageVerdict.ok) console.log(`${OK}${ageVerdict.message}`);
        else fail(ageVerdict.message);
        for (const t of TABLES) {
          const n = Number((await branch.query<{ n: string }>(`select count(*)::text n from ${t}`)).rows[0]!.n);
          const verdict = boundaryVerdict(t, n, boundary.counts[t], boundary.extras[t]);
          if (verdict.ok) console.log(`${OK}${verdict.message}`);
          else fail(verdict.message);
        }
      }
    }

    // ── THE DOOR SURFACE — `--verify` only, and by NAME, never by count ─────
    // See DOOR_TABLE above for why a missing door row is not a cosmetic drift.
    // Production is read here, deliberately: this is the ONE clause that must
    // compare the copy to the world as it is NOW rather than to the recorded
    // boundary, because the harm — a client EXECUTE grant that does not stick —
    // is caused by the gap between them and by nothing else. It is a SELECT.
    if (verifyOnly) {
      const read = async (c: pg.Client) => {
        const r = await c.query<{ door: string; def_hash: string }>(DOOR_SURFACE_SQL);
        return new Map(r.rows.map((x) => [x.door, x.def_hash] as const));
      };
      const verdict = doorSurfaceVerdict(await read(prod), await read(branch), DOOR_MISSING_TOLERANCE);
      if (verdict.ok) console.log(`${OK}${verdict.message}`);
      else fail(verdict.message);
    }

    // ── PROOF 4: THE ANTI-VACUITY FLOOR — the access half is not empty ──────
    // ATTACK-4 findings 1 and 25. `W7-GATE`'s anti-vacuity clause counted the
    // two tables that were being copied and could not see the tables that were
    // empty. This proof counts the ones whose emptiness makes an access proof
    // pass over nothing, against the count THE COPY'S SNAPSHOT of production held,
    // and it is the list a gate clause cites.
    //
    // 🚨 ATTACK-7 finding 6 — TENSE. This line used to read
    //   [ OK ] floor iam.permissions 4609 ≥ production's 4603
    // which reads as a live production count and is not one: on `--verify` it is a
    // number frozen at the copy, hours old. It now names the snapshot and when it
    // was taken, so nobody has to know which run produced it.
    {
      const asOf = boundaryTakenAt
        ? `the copy's snapshot of production, taken ${boundaryTakenAt}`
        : `the copy's snapshot of production`;
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
              `ANTI-VACUITY: ${t} holds ${n} row(s) on the branch, ${asOf} held ${floor}. ` +
                `Every "over the copied real graph" clause would pass over a set this size and prove nothing.`,
            );
          else console.log(`${OK}floor ${t.padEnd(30)} ${n} ≥ ${floor} — ${asOf}`);
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
    // ROLL BACK FIRST. The whole copy — the emptied `replace` tables, the disabled
    // triggers, the dropped constraints — is one transaction, so this puts the branch back
    // exactly as it was found. `restoreGuards()` afterwards would try to ADD constraints
    // that the rollback already brought back, so it is not called on this path; the
    // rollback's result is read back and printed rather than assumed.
    const rolledBack = await branch
      .query("rollback")
      .then(() => true)
      .catch((e) => {
        console.error(`${FAIL}the rollback itself failed: ${(e as Error).message}`);
        return false;
      });
    if (rolledBack) {
      const left = await branch
        .query<{ a: string; r: string }>(
          `select (select count(*)::text from platform.associations) a,
                  (select count(*)::text from platform.reachability) r`,
        )
        .then((x) => x.rows[0])
        .catch(() => undefined);
      console.error(
        `${INFO}rolled back — the branch is as it was found` +
          (left ? ` (${left.a} associations, ${left.r} reachability rows).` : "."),
      );
    } else {
      console.error(`${INFO}restoring the branch's triggers and constraints before exiting…`);
      await restoreGuardsRef?.();
    }
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
