#!/usr/bin/env npx tsx
/**
 * THE RLS-ON GUARD — no registered relation a client can read is left without a
 * row filter, and no view-backed token is left without a parent to inherit from
 * (DD-161).
 *
 * WHY THIS EXISTS, AND WHAT THE ORIGINAL FINDING GOT WRONG
 * -------------------------------------------------------
 * B-41b §FR1.12 reported `workflow.card` as a registered TABLE with RLS switched
 * off, an `anon` SELECT grant and no policies — "readable by anyone on the
 * internet" — and `content_ir.kind_conformance` as the same shape for any signed-in
 * user over 1,128 rows. Re-measured on 2026-09-12, both are VIEWS carrying
 * `security_invoker=true`, so the parent table's RLS is evaluated AS THE CALLER.
 * Proven with real roles: `anon` reads 0 rows of `workflow.card`; a plain member
 * reads 1,064 rows of `content_ir.kind_conformance` and 1,064 rows of
 * `content_ir.kind_definition` — the same 1,064. Nothing was open. The counts in
 * the finding were a BYPASSRLS superuser's, read as if they were a client's.
 *
 * `relrowsecurity` is FALSE on every view in Postgres and always will be. A guard
 * that reads that column and stops there reports a view as the widest hole in the
 * database and misses the one shape that genuinely is one: a view with
 * `security_invoker` OFF, which runs as its owner and therefore does not evaluate
 * the underlying RLS at all. Its inline `WHERE` is then the entire access contract,
 * written by hand, invisible to `iam.apply_rls`, to `iam.verify_canonical`, and to
 * every door guard that reads `pg_policy`.
 *
 * So this guard asks four questions about REGISTERED relations, and the two that
 * matter are not about `relrowsecurity` at all.
 *
 * WHAT IT FAILS ON
 * ----------------
 *   A — a registered base table with RLS off and any client grant. Zero today. This
 *       is the shape the brief named; it is kept because zero is a measurement that
 *       can change, not a reason to stop looking.
 *   B — ANY view or materialized view a client role can read that runs as its
 *       OWNER (no `security_invoker=true`) over at least one base table carrying
 *       RLS, and which is not DECLARED below with a reason AND the list of classed
 *       tables it was reviewed against. 🚨 DD-164 widened this arm from the
 *       REGISTRY to every such relation in the database: the registry is not a
 *       boundary a leak respects, and `agent.context_menu_view` — unregistered —
 *       published 207 shortcut items to the open internet where RLS admitted 30,
 *       with `anon` INSERT/UPDATE/DELETE on top. The declared base list is
 *       re-derived live from `pg_rewrite`/`pg_depend` every run, recursing through
 *       intermediate views, and a declaration whose view has since gained or lost
 *       a classed table FAILS — that is how a review stops rotting into a rubber
 *       stamp.
 *   C — a registered base table with RLS on, a client grant, and ZERO policies.
 *       Zero today. RLS with no policy denies everything, which is safe and silent:
 *       a screen that shows nothing and explains nothing (law 4).
 *   D — a registered view-backed token with no composition parent. A view cannot
 *       carry a generated policy, so its class can only come from its parent;
 *       `iam.class_lanes` resolves a parentless component to `private`, which is an
 *       orphan's default and not a decision anyone made. Two today before
 *       `dd161_view_backed_tokens_declare_their_parent.sql`, zero after.
 *
 * WHAT IT ONLY REPORTS
 * --------------------
 * UNREGISTERED tables with RLS off that a client can read — 2 today. Printed by
 * name every run because they are real and nobody has ruled on them, and not failed
 * here because that population belongs to B-48/DD-159 and wedging the release gate
 * on another lane's census is how guards get disabled. They are also a live blind
 * spot in `lib/security/public-exposure.ts`'s `UNPROTECTED_RELATION_QUERY`, whose
 * WHERE requires an `anon` privilege and therefore cannot see an
 * `authenticated`-only grant.
 *
 * (Owner-rights VIEWS are no longer in this reported-only bucket — since DD-164
 * they fail in arm B whether registered or not.)
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS — without credentials it exits 1 under
 * --strict and says so loudly otherwise; it never prints a green line it did not earn.
 *
 *   pnpm check:rls-on
 *   pnpm check:rls-on --strict     # exit 1 on any registered finding or UNMEASURED
 *   pnpm check:rls-on --self-test  # RED then GREEN against the real database
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

/**
 * ARM B's declaration list. A row here says: this relation's access contract is its
 * own text rather than the caller's RLS, somebody read that text, and here is who
 * and when. Adding a row is the act of review — never a way to silence the check.
 */
export interface OwnerRightsDeclaration {
  /** `schema.relation` */
  relation: string;
  why: string;
  /**
   * The RLS-carrying base tables this view reads, as reviewed — derived from
   * `pg_rewrite`/`pg_depend`, recursing through intermediate views. A view is not
   * an entity and carries no class of its own, so this list IS its class surface:
   * these are the tables whose policies it bypasses. The guard re-derives it live
   * every run and FAILS the declaration when the two disagree, because the way a
   * reviewed view becomes an unreviewed one is a later edit adding a join nobody
   * looked at.
   */
  bases: readonly string[];
}

const OWNER_RIGHTS_DECLARED: ReadonlyArray<OwnerRightsDeclaration> = [
  {
    relation: "agent.card",
    why:
      "The public agent-card door, reviewed and gated by B-15 / DD-116. The view runs as its owner on purpose: " +
      "`agent.definition`'s anon policy is `visibility = 'public'` and ZERO rows carry that, so an invoker view " +
      "would return nothing to a logged-out visitor and the guest-run flow would die. The card axis is the " +
      "separate `card_visibility` column, and the view's own WHERE is what enforces it. Measured 2026-09-12: " +
      "`set local role anon; select count(*) from agent.card` = 418, every one `card_visibility='public'`. The " +
      "columns are the non-secret projection (name, description, tags, variable_definitions, output_schema); the " +
      "secrets (prompt, model, tools, settings) are not in the view at all.",
    bases: ["agent.definition"],
  },

  /* ── DD-164, reviewed and probed with real roles on 2026-09-12 ──────────────
   * Every row below was measured as `anon` and as a plain member
   * (test@test.com, 4060701e-706a-4c76-b3ca-0bbc69fa5a14) inside a rolled-back
   * transaction, counting the rows the view returns against the rows the base
   * tables' own RLS admits to that same principal. The one that failed that
   * comparison — `agent.context_menu_view` — is not declared here; it was
   * repaired by `migrations/dd164_a_view_is_not_a_door_around_rls.sql`.
   */
  {
    relation: "agent.menu_surface",
    why:
      "Global agent→surface bindings. The view runs as its owner but carries a real caller filter of its own: " +
      "every non-global arm of its WHERE requires `a.role = 'binding:u:' || auth.uid()` or `iam.has_org_access(a.organization_id)`. " +
      "Measured 2026-09-12: `anon` reads 7 rows and a plain member reads the SAME 7, all `role='binding:global'`, all with " +
      "`user_id`, `project_id` and `task_id` NULL — the global lane, which is meant to be visible to a guest so a guest-run " +
      "surface has an agent. The agent columns come through `agent.card`, the reviewed non-secret projection declared above. " +
      "NAMED RESIDUE: a global binding also carries its publishing organization's name, slug, description and logo through the " +
      "`organizations` jsonb. Those are the platform's own publishing orgs, not a customer's private profile, and removing that " +
      "block is a shape change this lane did not make.",
    bases: ["agent.definition", "iam.organizations", "platform.associations", "ui.ui_surface"],
  },
  {
    relation: "ai.model_config",
    why:
      "The model catalog's control/constraint projection. It publishes no person's row: `ai.model_definition` and `ai.provider` " +
      "are the platform's own price list and capability sheet, and neither has a customer-owned row (`created_by` is an admin " +
      "stamp; there is no per-user model). A guest needs it to be offered a model at all. An invoker view would be the better " +
      "shape and is blocked on `ai.offering`/`ai.endpoint` carrying anon-readable policies — that is the AI catalog lane's call, " +
      "not a guess to make inside a security migration.",
    bases: ["ai.model_definition", "ai.provider"],
  },
  {
    relation: "ai.model_offering",
    why:
      "Per-offering pricing in points, for the model picker. Same review as `ai.model_config`: platform catalog facts only. " +
      "Measured 2026-09-12: `anon` reads 236 rows through the view while `ai.offering` and `ai.endpoint` admit 0 directly, so " +
      "this view IS the anon read path for the price list. Flipping it to invoker today returns an empty catalog to every " +
      "logged-out visitor and kills the guest model picker; the honest fix is anon policies on those two catalog tables first.",
    bases: ["ai.endpoint", "ai.model_definition", "ai.offering"],
  },
  {
    relation: "ai.model_public",
    why:
      "The public model catalog (name, capabilities, context window, points per million). Same review and the same blocked " +
      "invoker flip as `ai.model_offering`: under invoker the LEFT JOIN LATERAL onto `ai.offering` would return NULL pricing " +
      "for all 267 models rather than raise, which is law 4's silent wrong answer, so the flip waits for the catalog policies.",
    bases: ["ai.endpoint", "ai.model_definition", "ai.offering", "ai.provider"],
  },
  {
    relation: "chat.admin_conversation_summary",
    why:
      "Despite the name this is a USER's own conversation list with cost and token rollups. Its WHERE is " +
      "`is_platform_admin() OR conversation.created_by = auth.uid()`, and it must run as owner because the rollup crosses " +
      "`runtime.global_meter_entry` and `runtime.global_execution`, which a member cannot read at all — the caller is entitled " +
      "to the TOTAL of rows they may not see one by one. Probed 2026-09-12 as test@test.com: 32 rows, and " +
      "`select count(*) … where user_id <> <that uid>` = 0. Zero of anyone else's.",
    bases: [
      "ai.model_definition", "ai.provider", "chat.conversation", "chat.request", "chat.request_snapshot",
      "chat.tool_call", "chat.user_request", "platform.associations", "platform.user_entity_state",
      "runtime.global_execution", "runtime.global_meter_entry",
    ],
  },
  {
    relation: "chat.admin_user_request_summary",
    why:
      "The same shape and the same reason as `chat.admin_conversation_summary`, one level up: a user's own requests with the " +
      "meter rollup they cannot read row by row. WHERE is `is_platform_admin() OR ur.created_by = auth.uid()`. Probed " +
      "2026-09-12 as test@test.com: 47 rows, 0 of them created by anyone else.",
    bases: ["chat.request", "chat.user_request", "runtime.global_execution", "runtime.global_meter_entry"],
  },
  {
    relation: "platform.admin_auth_user",
    why:
      "The platform-admin user list behind aidream's dashboard. The whole view is `WHERE is_platform_admin()` — a non-admin " +
      "gets the empty set, not a filtered one. Probed 2026-09-12 as test@test.com: 0 rows. It reads `auth.users`, which a " +
      "client cannot reach at all, so owner rights are the mechanism and the gate is the WHERE.",
    bases: ["auth.users"],
  },
  {
    relation: "platform.visible_user_identity",
    why:
      "Id and email of the people you are allowed to see: yourself, anyone in a shared NON-personal organization, everyone if " +
      "you are a platform admin. That is a deliberate disclosure rule written as SQL over `auth.users`, which no client role " +
      "can read directly — an invoker view here would return nothing to anyone. Probed 2026-09-12 as test@test.com (whose " +
      "only org is personal): exactly 1 row, their own.",
    bases: ["auth.users", "iam.memberships", "iam.organizations"],
  },
  {
    relation: "platform.list_scope_registry",
    why:
      "Two columns of the entity registry — `token` and `default_list_scope` — and nothing else. It exists BECAUSE " +
      "`platform.entity_types` carries a RESTRICTIVE `platform_admin_only` policy: reading the table from a browser returned " +
      "`200 []` for every non-admin, so every list on the platform silently opened on `mine` (DD-137c8, and the reason is " +
      "written at `lib/list-scope/index.ts:79`). Owner rights are the point of the view. It publishes platform configuration, " +
      "never a row belonging to a person: measured 2026-09-12 as test@test.com, 342 rows, all registry tokens.",
    bases: ["platform.entity_types"],
  },
];

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!key && m[1] === "SUPABASE_SECRET_KEY") key = v;
      }
      if (url && key) break;
    }
  }
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function door(env: { url: string; key: string }, sql: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${env.url}/rest/v1/rpc/execute_admin_query`, {
    method: "POST",
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      "Content-Type": "application/json",
      "Content-Profile": "public",
      "Accept-Profile": "public",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  const payload = JSON.parse(text) as unknown;
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object" && Array.isArray((payload as { result?: unknown[] }).result)) {
    return (payload as { result: Array<Record<string, unknown>> }).result;
  }
  return [];
}

/** The system schemas nothing in this repo governs. Same list as public-exposure.ts. */
const SKIP_SCHEMAS = `('pg_catalog','information_schema','extensions','graphql','graphql_public',
                       'realtime','storage','vault','auth','net','cron','pgsodium',
                       'supabase_migrations','supabase_functions')`;

/**
 * The one predicate that decides whether a relation's rows are filtered by the
 * CALLER's RLS. A base table: `relrowsecurity`. A view: `security_invoker`, which
 * Postgres spells `true` or `on` depending on how it was written, and which is
 * ABSENT (meaning off) when `reloptions` is null.
 */
const FILTERS_FOR_THE_CALLER = `
  case when c.relkind in ('r','p') then c.relrowsecurity
       else coalesce(array_to_string(c.reloptions, ',') ~ 'security_invoker=(true|on)', false)
  end`;

/**
 * The client grants, from the ACL rather than `information_schema.role_table_grants`
 * — that view omits MATERIALIZED views entirely, so it printed "none" for
 * `chat.mv_tool_refetch_summary` while `authenticated` held SELECT on it.
 */
const CLIENT_GRANTS = `
  (select string_agg(distinct a.grantee::regrole::text || ':' || a.privilege_type, ', '
                     order by a.grantee::regrole::text || ':' || a.privilege_type)
     from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where a.grantee::regrole::text in ('anon','authenticated'))`;

const CLIENT_CAN_READ = `
  (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))`;

const CLIENT_CAN_WRITE = `
  (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
   or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('authenticated', c.oid, 'INSERT')
   or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'DELETE'))`;

const CENSUS_SQL = `
with recursive rel as (
  select et.token,
         n.nspname || '.' || c.relname as relation,
         c.relkind::text as relkind,
         c.oid,
         c.relrowsecurity,
         ${FILTERS_FOR_THE_CALLER} as filters_for_the_caller,
         (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies,
         (select string_agg(g.grantee || ':' || g.privilege_type, ', ' order by g.grantee, g.privilege_type)
            from information_schema.role_table_grants g
           where g.table_schema = n.nspname and g.table_name = c.relname
             and g.grantee in ('anon','authenticated')) as client_grants,
         has_table_privilege('anon', c.oid, 'SELECT') as anon_read,
         ${CLIENT_CAN_WRITE} as client_can_write,
         exists (select 1 from platform.entity_relationships r
                  where r.child_type = et.token and r.kind = 'composition') as has_parent
  from platform.entity_types et
  join pg_namespace n on n.nspname = et.schema_name
  join pg_class c on c.relnamespace = n.oid and c.relname = et.table_name
  where et.is_active and ${CLIENT_CAN_READ}
),
unreg as (
  select n.nspname || '.' || c.relname as relation,
         c.relkind::text as relkind,
         ${FILTERS_FOR_THE_CALLER} as filters_for_the_caller,
         ${CLIENT_GRANTS} as client_grants,
         has_table_privilege('anon', c.oid, 'SELECT') as anon_read
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p','v','m')
    and n.nspname not in ${SKIP_SCHEMAS}
    and ${CLIENT_CAN_READ}
    and not exists (select 1 from platform.entity_types et
                     where et.is_active and et.schema_name = n.nspname and et.table_name = c.relname)
),
-- ARM B's population (DD-164): EVERY view or materialized view a client role can
-- SELECT, registered or not. The registry is not the boundary a leak respects.
allviews as (
  select n.nspname || '.' || c.relname as relation,
         c.oid,
         c.relkind::text as relkind,
         ${FILTERS_FOR_THE_CALLER} as filters_for_the_caller,
         ${CLIENT_GRANTS} as client_grants,
         has_table_privilege('anon', c.oid, 'SELECT') as anon_read,
         ${CLIENT_CAN_WRITE} as client_can_write,
         (select et.token from platform.entity_types et
           where et.is_active and et.schema_name = n.nspname and et.table_name = c.relname limit 1) as token
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('v','m')
    and n.nspname not in ${SKIP_SCHEMAS}
    and ${CLIENT_CAN_READ}
),
-- Which relations does a view actually read? pg_rewrite's _RETURN rule
-- depends on every relation the view text names; recursing through views that
-- sit on views is what stops a chain from laundering the answer (that is how
-- chat.mv_tool_refetch_summary looks like it reads one unclassed view and in
-- fact reads chat.request, chat.tool_call and tool.definition).
edge as (
  select v.oid as root, d.refobjid as child
    from allviews v
    join pg_rewrite rw on rw.rulename = '_RETURN' and rw.ev_class = v.oid
    join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
                    and d.objid = rw.oid
   where d.refobjid <> v.oid
  union
  select e.root, d.refobjid
    from edge e
    join pg_class bc on bc.oid = e.child and bc.relkind in ('v','m')
    join pg_rewrite rw on rw.rulename = '_RETURN' and rw.ev_class = e.child
    join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
                    and d.objid = rw.oid
   where d.refobjid <> e.child
),
ownerrights as (
  select v.relation, v.relkind, v.client_grants, v.anon_read, v.client_can_write, v.token,
         to_json(array(
           select distinct bn.nspname || '.' || bc.relname
             from edge e
             join pg_class bc on bc.oid = e.child and bc.relkind in ('r','p') and bc.relrowsecurity
             join pg_namespace bn on bn.oid = bc.relnamespace
            where e.root = v.oid
            order by 1)) as classed_bases
    from allviews v
   where not v.filters_for_the_caller
)
select json_build_object(
  'registered',   (select count(*) from rel),
  'arm_a',        (select coalesce(json_agg(to_jsonb(r) order by r.relation), '[]'::json) from rel r
                    where r.relkind in ('r','p') and not r.relrowsecurity),
  'arm_b',        (select coalesce(json_agg(to_jsonb(o) order by o.relation), '[]'::json) from ownerrights o),
  'arm_c',        (select coalesce(json_agg(to_jsonb(r) order by r.relation), '[]'::json) from rel r
                    where r.relkind in ('r','p') and r.relrowsecurity and r.policies = 0),
  'arm_d',        (select coalesce(json_agg(to_jsonb(r) order by r.relation), '[]'::json) from rel r
                    where r.relkind in ('v','m') and not r.has_parent),
  'arm_e',        (select coalesce(json_agg(to_jsonb(r) order by r.relation), '[]'::json) from rel r
                    where r.relkind in ('v','m') and r.client_can_write),
  'unreg_tables', (select coalesce(json_agg(to_jsonb(u) order by u.relation), '[]'::json) from unreg u
                    where u.relkind in ('r','p') and not u.filters_for_the_caller)
) as j`;

type Rel = {
  token?: string | null;
  relation: string;
  relkind: string;
  client_grants: string | null;
  anon_read?: boolean;
  policies?: number;
  client_can_write?: boolean;
  /** RLS-carrying base tables this view reads, live (arm B rows only). */
  classed_bases?: string[];
};

export type OwnerRightsVerdict =
  | { finding: false; reason: "no-classed-base" | "declared" }
  | { finding: true; reason: "undeclared" | "bases-drifted"; detail: string };

/**
 * THE PURE RULE for arm B, exported so the self-test can hand it rows it wrote itself.
 *
 * A client-readable view that runs as its owner is a finding when it reads at
 * least one base table that carries RLS — those are the policies it bypasses. It
 * clears in exactly two ways: it reads nothing classed (there is no policy to
 * bypass), or somebody reviewed it AND wrote down the classed tables they
 * reviewed it against. The second half is what keeps a declaration from rotting:
 * the day a join is added to a declared view, the live base set stops matching
 * the reviewed one and the guard fails until somebody looks again.
 */
export function reviewOwnerRights(
  r: Pick<Rel, "relation" | "classed_bases">,
  declared: ReadonlyArray<OwnerRightsDeclaration> = OWNER_RIGHTS_DECLARED,
): OwnerRightsVerdict {
  const live = [...(r.classed_bases ?? [])].sort();
  if (live.length === 0) return { finding: false, reason: "no-classed-base" };
  const d = declared.find((x) => x.relation === r.relation);
  if (!d) {
    return {
      finding: true,
      reason: "undeclared",
      detail: `bypasses RLS on ${live.join(", ")}`,
    };
  }
  const reviewed = [...d.bases].sort();
  if (reviewed.join("|") !== live.join("|")) {
    const added = live.filter((b) => !reviewed.includes(b));
    const gone = reviewed.filter((b) => !live.includes(b));
    return {
      finding: true,
      reason: "bases-drifted",
      detail:
        `the view now reads ${live.join(", ")} but was reviewed against ${reviewed.join(", ")}` +
        (added.length ? ` — ADDED ${added.join(", ")}` : "") +
        (gone.length ? ` — GONE ${gone.join(", ")}` : ""),
    };
  }
  return { finding: false, reason: "declared" };
}

function printRows(rows: Rel[], indent = "     "): void {
  for (const r of rows) {
    const who = r.anon_read ? `${C.r}anon can read${C.x}` : "authenticated";
    console.log(`${indent}${C.d}${r.relation}${r.token ? ` (${r.token})` : ""} — ${who}; grants: ${r.client_grants ?? "none"}${C.x}`);
  }
}

function printOwnerRights(rows: Array<{ rel: Rel; v: OwnerRightsVerdict & { finding: true } }>): void {
  for (const { rel, v } of rows) {
    const who = rel.anon_read ? `${C.r}ANON can read${C.x}` : "authenticated";
    const kind = rel.relkind === "m" ? " [materialized — can NEVER carry security_invoker]" : "";
    console.log(`     ${C.d}${rel.relation}${rel.token ? ` (${rel.token})` : ""}${kind} — ${who}; grants: ${rel.client_grants ?? "none"}${C.x}`);
    console.log(`       ${C.y}${v.reason}${C.x} ${C.d}— ${v.detail}${C.x}`);
  }
}

async function selfTest(env: { url: string; key: string }): Promise<number> {
  console.log(`${C.b}SELF-TEST${C.x} ${C.d}(the rule, and the census that feeds it — RED then GREEN on the real database)${C.x}`);
  let bad = 0;

  const pure: Array<[string, Pick<Rel, "relation" | "classed_bases">, boolean]> = [
    ["RED   — an owner-rights view nobody declared, over a classed table",
      { relation: "zz.undeclared_view", classed_bases: ["zz.secrets"] }, true],
    ["RED   — a DECLARED view that has since gained a base table nobody reviewed",
      { relation: "agent.card", classed_bases: ["agent.definition", "zz.newly_joined"] }, true],
    ["RED   — a DECLARED view that has since LOST a reviewed base table",
      { relation: "agent.card", classed_bases: [] as string[] }, false],
    ["GREEN — the reviewed view, still reading exactly what was reviewed",
      { relation: "agent.card", classed_bases: ["agent.definition"] }, false],
    ["GREEN — an owner-rights view over no table that carries RLS at all",
      { relation: "zz.harmless_view", classed_bases: [] as string[] }, false],
  ];
  for (const [label, row, expect] of pure) {
    if (reviewOwnerRights(row).finding === expect) console.log(`  ${C.g}✓${C.x} ${label}`);
    else { console.log(`  ${C.r}✗${C.x} ${label}`); bad++; }
  }
  // The third row above is deliberately NOT a finding: an empty live base set is
  // the "reads nothing classed" exit, and calling it drift would fail every view
  // whose parent legitimately lost RLS. Named here so the asymmetry is a decision,
  // not an accident.
  console.log(`  ${C.d}(a declared view that loses its last classed base clears through the no-classed-base exit, by design)${C.x}`);

  // The live half. A throwaway schema, a registered token, and the four shapes built
  // for real — because a rule that agrees with itself proves nothing about the SQL
  // that has to find these relations in a 700-table registry.
  const schema = `zz_rls_on_selftest_${Date.now().toString(36)}`;
  const token = `${schema}_t`;
  const viewToken = `${schema}_v`;
  try {
    await door(env, `create schema ${schema}`);
    await door(env, `grant usage on schema ${schema} to authenticated`);
    // A base table with RLS OFF and an authenticated grant — arm A.
    await door(env, `create table ${schema}.t (id uuid primary key default gen_random_uuid())`);
    await door(env, `grant select on ${schema}.t to authenticated`);
    // A view over it with security_invoker OFF — arms B and D.
    await door(env, `create view ${schema}.v as select id from ${schema}.t`);
    // An UNREGISTERED view, two levels up, over a table that DOES carry RLS. It
    // proves the two halves the registry-scoped guard could not: that arm B looks
    // past the registry, and that the classed-base derivation recurses through a
    // view sitting on a view.
    await door(env, `create table ${schema}.classed (id uuid primary key default gen_random_uuid())`);
    await door(env, `alter table ${schema}.classed enable row level security`);
    await door(env, `create view ${schema}.mid as select id from ${schema}.classed`);
    await door(env, `create view ${schema}.leaf as select id from ${schema}.mid`);
    await door(env, `grant select on ${schema}.leaf to authenticated`);
    // SELECT plus the write grants, so arm E has something to find too.
    await door(env, `grant select, insert, update, delete on ${schema}.v to authenticated`);
    // Register both. `_enforce_entity_is_table` refuses a view row, which is itself
    // the D233 finding; step around it exactly as d233 does, for a row we delete.
    await door(env, `insert into platform.entity_types (token, schema_name, table_name, label, is_component, rls_variant)
                     values ('${token}', '${schema}', 't', 'Self-test table', false, 'entity')`);
    await door(env, `alter table platform.entity_types disable trigger _enforce_entity_is_table`);
    try {
      await door(env, `insert into platform.entity_types (token, schema_name, table_name, label, is_component, rls_variant, is_versioned)
                       values ('${viewToken}', '${schema}', 'v', 'Self-test view', true, 'component', false)`);
    } finally {
      await door(env, `alter table platform.entity_types enable trigger _enforce_entity_is_table`);
    }

    const red = await door(env, CENSUS_SQL);
    const j = (red[0] as { j?: Record<string, unknown> })?.j ?? {};
    const inArm = (name: string, rel: string): boolean =>
      ((j[name] as Rel[]) ?? []).some((r) => r.relation === `${schema}.${rel}`);

    for (const [arm, rel, label] of [
      ["arm_a", "t", "a registered base table with RLS off and a client grant"],
      ["arm_b", "leaf", "an UNREGISTERED owner-rights view a client can read (DD-164: the registry is not the boundary)"],
      ["arm_d", "v", "a registered view-backed token with no composition parent"],
      ["arm_e", "v", "a registered view a client can INSERT, UPDATE or DELETE"],
    ] as const) {
      if (inArm(arm, rel)) console.log(`  ${C.g}✓${C.x} RED  — ${arm.toUpperCase().replace("_", " ")} sees ${label}`);
      else { console.log(`  ${C.r}✗${C.x} RED  — ${arm.toUpperCase().replace("_", " ")} MISSED ${label}`); bad++; }
    }

    // The derivation itself, not just the arm: `${schema}.leaf` names only
    // `${schema}.mid`, and the classed table is one more hop down.
    const leafRow = ((j.arm_b as Rel[]) ?? []).find((r) => r.relation === `${schema}.leaf`);
    if (leafRow && (leafRow.classed_bases ?? []).includes(`${schema}.classed`)) {
      console.log(`  ${C.g}✓${C.x} RED  — the classed-base derivation recurses through a view over a view`);
    } else {
      console.log(`  ${C.r}✗${C.x} RED  — the classed-base derivation stopped at the intermediate view (got ${JSON.stringify(leafRow?.classed_bases ?? null)})`);
      bad++;
    }

    // Switching RLS on clears arm A — and lands the table in exactly arm C's shape:
    // RLS on, a client grant, and no policy at all. One statement, two proofs.
    //
    // 🚨 THE SELF-TEST DELIBERATELY NEVER RUNS `CREATE POLICY`. Measured 2026-09-12:
    // through `public.execute_admin_query`, `create policy … using (true)` on an empty
    // one-column table takes 8,127 ms and is cancelled by the door's hard ~8.2 s cap
    // (CLAUDE.md § Migrations, DD-151) — every other statement here is 110-330 ms. So
    // arm C's GREEN half is the OTHER real repair: if nothing should read the table,
    // revoke the grant. Both repairs are honest; only one fits through the door.
    await door(env, `alter table ${schema}.t enable row level security`);
    const armC = await door(env, CENSUS_SQL);
    const jc = (armC[0] as { j?: Record<string, unknown> })?.j ?? {};
    if (((jc.arm_c as Rel[]) ?? []).some((r) => r.relation === `${schema}.t`)) {
      console.log(`  ${C.g}✓${C.x} RED  — ARM C sees a registered table with RLS on, a client grant and no policy`);
    } else {
      console.log(`  ${C.r}✗${C.x} RED  — ARM C missed a registered table with RLS on and no policy`); bad++;
    }

    // GREEN: each of the four repairs, for real, one per arm.
    await door(env, `revoke select on ${schema}.t from authenticated`);          // arm C
    await door(env, `alter view ${schema}.leaf set (security_invoker = true)`);  // arm B
    await door(env, `alter view ${schema}.v set (security_invoker = true)`);     // arms B and the registered half
    await door(env, `insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
                     values ('${viewToken}', '${token}', 'id', 'composition')`); // arm D
    await door(env, `revoke insert, update, delete on ${schema}.v from authenticated`); // arm E

    const green = await door(env, CENSUS_SQL);
    const jg = (green[0] as { j?: Record<string, unknown> })?.j ?? {};
    const stillIn = (name: string, rel: string): boolean =>
      ((jg[name] as Rel[]) ?? []).some((r) => r.relation === `${schema}.${rel}`);

    for (const [arm, rel, label] of [
      ["arm_a", "t", "RLS is switched on"],
      ["arm_c", "t", "the client read grant nobody should have had is revoked"],
      ["arm_b", "leaf", "the view filters for the caller"],
      ["arm_d", "v", "the view token has a composition parent"],
      ["arm_e", "v", "the client write grants are revoked"],
    ] as const) {
      if (!stillIn(arm, rel)) console.log(`  ${C.g}✓${C.x} GREEN — ${arm.toUpperCase().replace("_", " ")} clears once ${label}`);
      else { console.log(`  ${C.r}✗${C.x} GREEN — ${arm.toUpperCase().replace("_", " ")} still flags it after ${label}`); bad++; }
    }
  } finally {
    // The registry rows first: dropping the schema leaves them pointing at nothing.
    try { await door(env, `delete from platform.entity_relationships where child_type in ('${token}','${viewToken}') or parent_type in ('${token}','${viewToken}')`); } catch { /* named for this run */ }
    try { await door(env, `delete from platform.entity_types where token in ('${token}','${viewToken}')`); } catch { /* named for this run */ }
    try { await door(env, `drop schema if exists ${schema} cascade`); } catch { /* unique per run */ }
  }

  console.log(bad === 0
    ? `${C.g}✓${C.x} ${C.b}the guard fails when it should and passes when it should${C.x}`
    : `${C.r}✗${C.x} ${C.b}the guard is not trustworthy${C.x}`);
  return bad === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  console.log(`${C.b}THE RLS-ON GUARD${C.x} ${C.d}(DD-161 — no registered relation a client can read is left without a row filter)${C.x}`);
  const env = loadEnv();
  if (!env) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. This is a FAILURE, not a pass.`);
    return STRICT ? 1 : 0;
  }
  if (SELF_TEST) return selfTest(env);

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await door(env, CENSUS_SQL);
  } catch (e) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the census query failed: ${String(e)}`);
    return STRICT ? 1 : 0;
  }
  const j = (rows[0] as { j?: Record<string, unknown> })?.j;
  if (!j) {
    console.log(`  ${C.r}✗${C.x} UNMEASURED — the census returned nothing`);
    return STRICT ? 1 : 0;
  }

  const armA = (j.arm_a as Rel[]) ?? [];
  const armBAll = (j.arm_b as Rel[]) ?? [];
  const armBJudged = armBAll.map((rel) => ({ rel, v: reviewOwnerRights(rel) }));
  const armB = armBJudged.filter(
    (x): x is { rel: Rel; v: OwnerRightsVerdict & { finding: true } } => x.v.finding,
  );
  const armBDeclared = armBJudged.filter((x) => !x.v.finding && x.v.reason === "declared").length;
  const armBUnclassed = armBJudged.filter((x) => !x.v.finding && x.v.reason === "no-classed-base").length;
  const armC = (j.arm_c as Rel[]) ?? [];
  const armD = (j.arm_d as Rel[]) ?? [];
  const armE = (j.arm_e as Rel[]) ?? [];
  const unregTables = (j.unreg_tables as Rel[]) ?? [];

  console.log(`  ${C.d}${Number(j.registered ?? 0)} registered relations a client role can SELECT${C.x}`);

  let findings = 0;

  if (armA.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ARM A — ${armA.length} registered base table(s) with ${C.b}RLS switched off${C.x} and a client grant. The grant is then the entire security model.`);
    printRows(armA);
  } else {
    console.log(`  ${C.g}✓${C.x} ARM A — every registered base table a client can read has RLS on`);
  }

  if (armB.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ARM B — ${armB.length} view(s) a client can read that run as their ${C.b}OWNER${C.x} over a table that carries RLS (no \`security_invoker=true\`), with no current review. ${C.b}A view is not a door around RLS${C.x} (DD-164).`);
    printOwnerRights(armB);
    console.log(`     ${C.d}Either set \`security_invoker = true\` so the base tables' policies do the work, or — when the view must aggregate rows the caller may not read — revoke the client grant and put it behind the platform-admin door. If its own WHERE really is the contract, read that WHERE, probe it with the real roles, and add it to OWNER_RIGHTS_DECLARED with the classed tables you reviewed it against. A declaration is a review, never a silencer.${C.x}`);
  } else {
    console.log(`  ${C.g}✓${C.x} ARM B — every client-readable view either filters for the caller, reads nothing classed, or carries a reviewed declaration whose base tables still match ${C.d}(${armBDeclared} declared, ${armBUnclassed} over no classed table)${C.x}`);
  }

  if (armC.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ARM C — ${armC.length} registered base table(s) with RLS on, a client grant and ${C.b}zero policies${C.x}. That denies everything and explains nothing — a screen that shows nothing and says nothing (law 4).`);
    printRows(armC);
  } else {
    console.log(`  ${C.g}✓${C.x} ARM C — no registered table denies every client read in silence`);
  }

  if (armD.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ARM D — ${armD.length} registered view-backed token(s) with ${C.b}no composition parent${C.x}. A view cannot carry a generated policy, so its class can only come from its parent — and \`iam.class_lanes\` resolves a parentless component to \`private\`, which is an orphan's default, not a decision.`);
    printRows(armD);
  } else {
    console.log(`  ${C.g}✓${C.x} ARM D — every registered view-backed token inherits from a declared parent`);
  }

  if (armE.length > 0) {
    findings++;
    console.log(`  ${C.r}✗${C.x} ARM E — ${armE.length} registered view(s) a client can ${C.b}INSERT, UPDATE or DELETE${C.x}. A view has no policies of its own, so the only thing standing between that grant and the parent table is the parent's write policy — and when none applies, the statement returns SUCCESS having touched nothing rather than refusing. Nothing announces the day that stops being true.`);
    printRows(armE);
    console.log(`     ${C.d}A projection view is read-only: \`REVOKE INSERT, UPDATE, DELETE ON <view> FROM anon, authenticated\`. If something really does write through one, it needs its own INSTEAD OF trigger and a declaration, not a bare grant.${C.x}`);
  } else {
    console.log(`  ${C.g}✓${C.x} ARM E — no registered view carries a client write grant`);
  }

  console.log(
    `  ${C.y}!${C.x} ${unregTables.length} UNREGISTERED table(s) with RLS off that a client can read — reported, not failed: ` +
    `outside this guard's scope (the registry), and nobody has ruled on them.`,
  );
  printRows(unregTables);
  console.log(`     ${C.d}The RLS-off tables above granted to \`authenticated\` only are invisible to \`lib/security/public-exposure.ts\`'s UNPROTECTED_RELATION_QUERY, whose WHERE requires an \`anon\` privilege.${C.x}`);

  if (findings === 0) {
    console.log(`${C.g}✓${C.x} ${C.b}every registered relation a client can read is filtered, or declared and reviewed${C.x}`);
    return 0;
  }
  return STRICT ? 1 : 0;
}

// `process.exit()` discards anything still in the stdout pipe; a guard that cannot be
// trusted to print what it found is worse than no guard.
main().then((code) => { process.exitCode = code; }).catch((e) => {
  console.error(`${C.r}✗${C.x} check:rls-on crashed: ${String(e)}`);
  process.exitCode = 1;
});
