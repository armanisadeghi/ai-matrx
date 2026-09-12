/**
 * PUBLIC EXPOSURE — the single declaration of what a logged-out visitor may reach.
 *
 * ONE list, two consumers: the release gate (`scripts/check-db-guards.ts`, fourth
 * detector) and the admin scoreboard (`/administration/reporting/public-exposure`).
 * Never copy it — a second list is a second truth, and the whole point of this
 * file is that there is exactly one place where "we meant this" is recorded.
 *
 * WHY IT EXISTS. On 2026-08-25 a policy named `guests_can_check_own_limits` was
 * found with the predicate `USING (true)`. Any anonymous caller could download
 * 21,840 rows of `ip_address`, `fingerprint` and the fingerprint-to-account
 * linkage using only the publishable key that ships in the frontend bundle.
 * Nothing flagged it, because a policy NAME is not a policy and nothing compared
 * the two.
 *
 * THE CONTRACT: every exposure is declared here WITH A REASON, or the gate fails.
 *   - Adding a row is the act of declaring intent. If the exposure is wrong, fix
 *     the policy — never add a row to silence the check.
 *   - `defect` marks a known-wrong we have not fixed yet: it warns instead of
 *     failing, and the row is deleted when the defect is.
 *   - The key includes the COMMAND, so a policy widening SELECT to ALL surfaces
 *     as a NEW undeclared exposure rather than passing silently.
 *
 * REACHABILITY IS THREE LAYERS and checking one cries wolf:
 *   1. an RLS policy granting anon/PUBLIC UNCONDITIONAL access (literally `true`
 *      — the deliberate `visibility = 'public'` family is gated and does NOT
 *      count);
 *   2. the `anon` role actually holding schema USAGE + the table privilege; and
 *   3. PostgREST exposing the schema.
 * The query below checks 1 AND 2 — the two the database can answer. Layer 3 lives
 * in PostgREST config, outside SQL; where it matters, the reason text says so.
 * That is deliberately conservative: a table failing 3 but passing 1+2 is still
 * misconfigured and one config change from live.
 *
 * 🚨 THE BLIND SPOT THIS FILE HAD FOR 18 DAYS, closed 2026-09-12. Layer 1 reads
 * `pg_policy`. **A table with RLS switched OFF has no policy rows at all**, so
 * the widest-open shape in Postgres — no RLS, plus an `anon` grant — produced
 * ZERO rows here and passed silently. It was not theoretical:
 * `public._schema_migration_slot_grandfather` sat that way with SELECT, INSERT,
 * UPDATE *and* DELETE granted to `anon`, 41 rows, in the PostgREST-exposed
 * `public` schema. Deleting those rows disarms `migration_slot_guard.sql`. A
 * detector that can only see policies cannot see a table that has none, so
 * `UNPROTECTED_RELATION_QUERY` below is the second arm: RLS off + any client-role
 * grant = a finding, with its own short allowlist. Fix in aidream migration 0646.
 *
 * Full write-up: common-docs/systems/platform/access/POLICY_OVERLAP.md
 */

export interface PublicExposure {
  /** `schema.table` */
  relation: string;
  policy: string;
  /** SELECT / INSERT / UPDATE / DELETE / ALL */
  cmd: string;
  why: string;
  /** Set when this exposure is known-wrong and tracked — warns instead of passing. */
  defect?: string;
}

/** One live row of unconditional anon-reachable access, as the database sees it. */
export interface LiveExposure {
  relation: string;
  policy: string;
  cmd: string;
  write_open: boolean;
}

export type ExposureStatus = "declared" | "tracked" | "undeclared";

export interface ClassifiedExposure extends LiveExposure {
  status: ExposureStatus;
  why?: string;
  defect?: string;
}

const PUBLIC_EXPOSURE_ALLOWED: ReadonlyArray<PublicExposure> = [
  // — Pricing and plan catalogue, rendered on the public marketing pages —
  { relation: "billing.product", policy: "product_read", cmd: "SELECT", why: "public pricing page renders products before sign-in" },
  { relation: "billing.price", policy: "price_read", cmd: "SELECT", why: "public pricing page renders prices before sign-in" },
  { relation: "billing.plan_limit", policy: "plan_limit_public_read", cmd: "SELECT", why: "plan comparison table on the public pricing page" },
  { relation: "billing.capability", policy: "capability_read", cmd: "SELECT", why: "plan capability catalogue shown on the public pricing page" },
  { relation: "billing.capability_limit", policy: "capability_limit_read", cmd: "SELECT", why: "plan capability limits shown on the public pricing page" },

  // — Reference/catalogue data with no personal content —
  { relation: "crm.jurisdiction_policy", policy: "jurisdiction_policy_select_all", cmd: "SELECT", why: "outreach-compliance reference rules; jurisdictional policy, no personal data" },
  { relation: "iam.industries", policy: "industries_select_all", cmd: "SELECT", why: "industry picker must populate on the sign-up form, before an account exists" },
  { relation: "platform.assurance_level", policy: "assurance_level_select_all", cmd: "SELECT", why: "static reference enum" },
  { relation: "platform.source_authority", policy: "source_authority_select_all", cmd: "SELECT", why: "static reference enum" },
  { relation: "platform.shareable_resource_registry", policy: "shareable_resource_registry_select", cmd: "SELECT", why: "entity-type registry — describes shapes, contains no user rows" },
  { relation: "platform.feature_knob", policy: "feature_knob_read", cmd: "SELECT", why: "client feature gating has to resolve before sign-in" },
  { relation: "public.app_config", policy: "app_config_public_read", cmd: "SELECT", why: "client bootstrap config (min supported version); read before auth by design" },

  // — Public tool / UI catalogues the shell needs before auth —
  { relation: "tool.executor", policy: "ref_select", cmd: "SELECT", why: "public tool catalogue" },
  { relation: "tool.mcp_config", policy: "ref_select", cmd: "SELECT", why: "public tool catalogue" },
  { relation: "tool.mcp_server", policy: "ref_select", cmd: "SELECT", why: "public tool catalogue" },
  { relation: "tool.surface_defaults", policy: "ref_select", cmd: "SELECT", why: "public tool catalogue" },
  { relation: "ui.ui_client", policy: "ui_client_read_anon", cmd: "SELECT", why: "surface catalogue — the shell renders public routes before sign-in" },
  { relation: "ui.ui_surface", policy: "ui_surface_read_anon", cmd: "SELECT", why: "surface catalogue — the shell renders public routes before sign-in" },
  { relation: "ui.ui_surface_value", policy: "ui_surface_value_read_anon", cmd: "SELECT", why: "surface catalogue values for public routes" },
  { relation: "ui.ui_surface_agent_role", policy: "ui_surface_agent_role_read", cmd: "SELECT", why: "surface catalogue agent roles for public routes" },
  { relation: "ui.ui_surface_client_tool", policy: "ui_surface_client_tool_read_anon", cmd: "SELECT", why: "surface catalogue client tools for public routes" },
  { relation: "ui.ui_surface_write_target", policy: "ui_surface_write_target_read_anon", cmd: "SELECT", why: "surface catalogue write targets for public routes" },

  // — Deliberately public product surfaces —
  { relation: "education.content_certification", policy: "cc_public_read", cmd: "SELECT", why: "certification badges shown on public education content" },
  { relation: "education.math_course_structure", policy: "Public can view course structure", cmd: "SELECT", why: "public curriculum outline" },
  { relation: "users.user_follows", policy: "Follows are viewable by everyone", cmd: "SELECT", why: "follow graph is public on creator profiles (/c/{handle})" },
  { relation: "extend.wbx_recipe", policy: "wbx_recipe_read_all", cmd: "SELECT", why: "browser-automation recipe catalogue; no credentials — discloses which sites/routes we automate, accepted" },

  // — Anonymous WRITES: each is a public form or the guest flow. INSERT only. —
  { relation: "communication.emails", policy: "form_insert", cmd: "INSERT", why: "public contact form submits without an account; INSERT only, anon cannot read the table back" },
  { relation: "users.guest_executions", policy: "Allow guest execution inserts", cmd: "INSERT", why: "a guest must be able to create their own usage row before signing up; INSERT only — the anon READ of this table was the 2026-08-25 leak and is closed" },
  { relation: "users.guest_execution_log", policy: "Allow guest execution inserts", cmd: "INSERT", why: "per-execution guest usage log; INSERT only, same guest flow" },

  // — KNOWN WRONG, tracked. These warn until fixed, then get deleted from here. —
  {
    relation: "extend.wbx_demo",
    policy: "wbx_demo_svc",
    cmd: "ALL",
    why: "policy named for the service role but created TO PUBLIC — anon can read AND write. Table is empty so nothing has leaked. The `extend` schema IS PostgREST-exposed, so this one is internet-reachable. Needs the matrx-extend owner to confirm the extension does not write as anon, then scope it to service_role.",
    defect: "D257",
  },
];

/**
 * Layers 1 + 2. `polroles = '{0}'` is PUBLIC, which includes anon.
 */
export const PUBLIC_EXPOSURE_QUERY = `
  select n.nspname || '.' || c.relname as relation,
         p.polname as policy,
         case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
              when 'd' then 'DELETE' else 'ALL' end as cmd,
         (p.polcmd in ('a','w','d','*')
          and (has_table_privilege('anon', c.oid, 'INSERT')
            or has_table_privilege('anon', c.oid, 'UPDATE')
            or has_table_privilege('anon', c.oid, 'DELETE'))) as write_open
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where p.polpermissive
    and (p.polroles = '{0}'::oid[]
         or 'anon' = any(select pg_get_userbyid(x) from unnest(p.polroles) x))
    and (pg_get_expr(p.polqual, p.polrelid) = 'true'
         or pg_get_expr(p.polwithcheck, p.polrelid) = 'true')
    and has_schema_privilege('anon', n.nspname, 'USAGE')
    and (has_table_privilege('anon', c.oid, 'SELECT')
      or has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE'))
  order by write_open desc, 1, 2
`;

export const exposureKey = (e: {
  relation: string;
  policy: string;
  cmd: string;
}): string => `${e.relation}::${e.policy}::${e.cmd}`;

/**
 * Joins what the database actually allows against what we declared. `stale` is a
 * declaration with no matching live exposure — the exposure is gone and the row
 * should be deleted, so the list cannot rot into fiction.
 */
export function classifyExposures(live: LiveExposure[]): {
  rows: ClassifiedExposure[];
  undeclared: ClassifiedExposure[];
  tracked: ClassifiedExposure[];
  stale: PublicExposure[];
} {
  const declared = new Map(
    PUBLIC_EXPOSURE_ALLOWED.map((e) => [exposureKey(e), e]),
  );
  const liveKeys = new Set(live.map(exposureKey));

  const rows: ClassifiedExposure[] = live.map((l) => {
    const d = declared.get(exposureKey(l));
    if (!d) return { ...l, status: "undeclared" as const };
    return {
      ...l,
      status: (d.defect ? "tracked" : "declared") as ExposureStatus,
      why: d.why,
      defect: d.defect,
    };
  });

  return {
    rows,
    undeclared: rows.filter((r) => r.status === "undeclared"),
    tracked: rows.filter((r) => r.status === "tracked"),
    stale: PUBLIC_EXPOSURE_ALLOWED.filter((e) => !liveKeys.has(exposureKey(e))),
  };
}

/* ===========================================================================
 * THE SECOND ARM — RELATIONS WITH NO RLS AT ALL.
 *
 * Everything above reasons about POLICIES. This part reasons about their
 * ABSENCE, which is the wider hole and the one nothing was watching: a table
 * with `relrowsecurity = false` has no `pg_policy` rows, so no amount of
 * policy-reading finds it however open it is. If `anon` or `authenticated`
 * holds a privilege on such a table and the schema is reachable, every row is
 * readable — and every DELETE is executable — by whoever holds the publishable
 * key that ships in the frontend bundle.
 *
 * The bar for the allowlist here is HIGHER than for a policy exposure, because
 * there is no predicate doing any work: the grant is the whole security model.
 * =========================================================================== */

export interface UnprotectedRelation {
  /** `schema.table` */
  relation: string;
  /** Comma-separated privileges the client roles hold, e.g. "anon:SELECT". */
  client_grants: string;
  write_open: boolean;
}

export interface UnprotectedDeclaration {
  relation: string;
  why: string;
  defect?: string;
}

/**
 * Declared "RLS off on purpose" relations. Empty is the correct steady state —
 * a row here says a table's entire protection is its GRANT list and somebody
 * decided that on purpose. `public._schema_migration_slot_grandfather` is NOT
 * listed: it is being closed by aidream migration 0646, which is why this
 * detector is red until that migration is applied.
 */
const UNPROTECTED_ALLOWED: ReadonlyArray<UnprotectedDeclaration> = [];

/** RLS disabled + a client role holding any privilege + the schema reachable. */
export const UNPROTECTED_RELATION_QUERY = `
  select n.nspname || '.' || c.relname as relation,
         (select string_agg(g.grantee || ':' || g.privilege_type, ', ' order by g.grantee, g.privilege_type)
            from information_schema.role_table_grants g
           where g.table_schema = n.nspname
             and g.table_name = c.relname
             and g.grantee in ('anon','authenticated')) as client_grants,
         (has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE')) as write_open
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p')
    and not c.relrowsecurity
    and n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public',
                          'realtime','storage','vault','auth','net','cron','pgsodium',
                          'supabase_migrations','supabase_functions')
    and has_schema_privilege('anon', n.nspname, 'USAGE')
    and (has_table_privilege('anon', c.oid, 'SELECT')
      or has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE'))
  order by write_open desc, 1
`;

export interface ClassifiedUnprotected extends UnprotectedRelation {
  status: ExposureStatus;
  why?: string;
  defect?: string;
}

export function classifyUnprotected(live: UnprotectedRelation[]): {
  rows: ClassifiedUnprotected[];
  undeclared: ClassifiedUnprotected[];
  tracked: ClassifiedUnprotected[];
  stale: UnprotectedDeclaration[];
} {
  const declared = new Map(UNPROTECTED_ALLOWED.map((d) => [d.relation, d]));
  const liveNames = new Set(live.map((l) => l.relation));

  const rows: ClassifiedUnprotected[] = live.map((l) => {
    const d = declared.get(l.relation);
    if (!d) return { ...l, status: "undeclared" as const };
    return {
      ...l,
      status: (d.defect ? "tracked" : "declared") as ExposureStatus,
      why: d.why,
      defect: d.defect,
    };
  });

  return {
    rows,
    undeclared: rows.filter((r) => r.status === "undeclared"),
    tracked: rows.filter((r) => r.status === "tracked"),
    stale: UNPROTECTED_ALLOWED.filter((d) => !liveNames.has(d.relation)),
  };
}
