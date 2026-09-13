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

  // — Anonymous WRITES: none. All three are closed (DD-181a, 2026-09-13,
  //   migrations/dd181_dd182_recorded_doors_bounded_or_closed.sql). `communication.emails`
  //   never had a writer — the public contact form writes `communication.contact_submissions`
  //   as the service role behind a per-IP rate limit — and the guest flow's real signed-out
  //   writer is `public.record_guest_execution`, a SECURITY DEFINER function owned by the
  //   tables' owner, which never consulted their RLS. A row returns here only with a caller. —

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

/* ===========================================================================
 * THE THIRD ARM — WHICH COLUMNS A SIGNED-OUT VISITOR CAN READ (DD-182).
 *
 * The two arms above ask WHICH RELATIONS anon can reach. Neither asks WHICH
 * COLUMNS, and a table can be legitimately public row-wise while carrying a
 * column that is nobody's business. That is not hypothetical: on 2026-09-13
 * `public.catalog_entries` — the remote-catalog table the matrx-local desktop
 * app MUST read before anyone signs in — was serving `updated_by`, a platform
 * admin's user uuid, to the publishable key over HTTPS, while the SAME
 * feature's other public path (aidream's unauthenticated
 * `GET /api/catalogs/{app}`) deliberately stripped that column as "server
 * bookkeeping, not client data". The two public paths of one feature
 * disagreed, and nothing could see it, because both arms above were green:
 * the row predicate was fine, RLS was on, the policy was declared.
 *
 * It got wider the same morning without anyone deciding to. The DD-173 base
 * retrofit added `organization_id`, `created_by`, `metadata`, `version` and
 * `visibility` to that table, and `select=*` handed every one of them to
 * anonymous callers the moment the column existed. A column added to a table
 * that happens to be anon-readable is a publishing decision, and nobody was
 * making it.
 *
 * RLS CANNOT EXPRESS THIS. A policy filters rows, never columns. The only
 * layer that bounds columns is the GRANT — which is also why this arm is
 * durable: `iam.apply_rls` issues no GRANT of any kind, so a regeneration
 * cannot quietly undo a column bound.
 *
 * WHAT A ROW HERE MEANS: this relation is readable by `anon`, on purpose, and
 * these are the ONLY columns a signed-out visitor may see. The guard
 * (`pnpm check:anon-column-surface`) fails when the live grant and this list
 * differ in EITHER direction — a widened surface is a leak, and a narrowed one
 * means a client is about to get a 42501 nobody predicted.
 *
 * SCOPE — THE WHOLE SIGNED-OUT READ SURFACE, NOT A SAMPLE (DD-186, 2026-09-13).
 * Every relation a signed-out visitor can address is declared here: all 194 in
 * the schemas PostgREST actually exposes. That is the point — the guard is RED
 * on an UNDECLARED RELATION as well as an undeclared column, so granting `anon`
 * SELECT on something new fails the gate instead of passing unnoticed.
 *
 * How the list got to 194 from the 284 relations that carried an `anon` SELECT
 * privilege on the morning of 2026-09-13: 74 had no SELECT-capable policy
 * reaching `anon` at all (no signed-out reader could exist — revoked), 3 were
 * RLS-bypassing views with no signed-out reader in any of the four repositories
 * (closed), and 13 sit in schemas PostgREST does not expose.
 *
 * THE 13 NOT COVERED, named rather than silently skipped: `storage.*`,
 * `realtime.*`, `net.*` and `extensions.pg_stat_statements(_info)`. PostgREST
 * refuses them by schema ("Only the following schemas are exposed: ..."), so no
 * publishable key can reach them, and the first three are vendor-managed tables
 * whose grants Supabase itself maintains. `extensions.pg_stat_statements` is
 * ours and grants `anon` every recorded SQL text on this database; it is not
 * internet-reachable today, and it is a finding in the Data Doctrine register
 * rather than a row here.
 *
 * =========================================================================== */

export interface AnonColumnSurface {
  /** `schema.table` */
  relation: string;
  /** Exactly the columns `anon` may SELECT. Order is irrelevant. */
  columns: readonly string[];
  why: string;
}

export const ANON_COLUMN_SURFACE: ReadonlyArray<AnonColumnSurface> = [
  {
    relation: "admin.admin_markdown_samples",
    columns: [
      "id", "name", "description", "content", "detected_blocks", "created_at",
      "updated_at",
    ],
    why:
      "Anon-readable by the policy `admin_markdown_samples_super_admin_all`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "agent.cmp_comparison_sets",
    columns: [
      "id", "name", "project_id", "task_id", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "agent.cmp_response_feedback",
    columns: [
      "id", "conversation_id", "request_id", "rating", "comment", "comparison_set_id",
      "created_at", "updated_at", "overall", "rank", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "agent.definition",
    columns: [
      "id", "agent_type", "name", "description", "messages", "variable_definitions",
      "model_id", "model_tiers", "settings", "output_schema", "tools", "custom_tools",
      "context_policies", "category", "tags", "is_active", "is_archived", "is_favorite",
      "task_id", "source_agent_id", "source_snapshot_at", "created_at", "updated_at", "mcp_servers",
      "rag_awareness_mode", "rag_awareness_fragment", "rag_awareness_refreshed_at", "tool_config", "default_rag_boost", "skill_config",
      "matrx_actions", "ui_gates", "visibility", "card_visibility", "deleted_at", "updated_by_tier",
      "updated_by_system", "auto_context_disabled", "input_kind", "input_contract", "input_contract_hash", "output_contract_hash",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "agent.exemplar",
    columns: [
      "id", "mandate_id", "label", "variables", "user_input", "reference_output",
      "reference_artifact", "source", "captured_agent_id", "captured_model_id", "position", "is_active",
      "created_at", "updated_at", "deleted_at", "visibility", "agent_id", "status",
      "agent_version", "input_contract_hash", "output_contract_hash", "source_conversation_id",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "agent.mandate_exemplar",
    columns: [
      "id", "mandate_id", "label", "variables", "user_input", "reference_output",
      "reference_artifact", "source", "captured_agent_id", "captured_model_id", "position", "is_active",
      "created_at", "updated_at", "deleted_at", "visibility", "agent_id", "status",
      "agent_version", "input_contract_hash", "output_contract_hash", "source_conversation_id",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "agent.message_template",
    columns: [
      "id", "label", "content", "role", "created_at", "updated_at",
      "tags", "deleted_at", "visibility",
    ],
    why:
      "The indexable public viewer /p/e/message_template reads a public template's display columns (utils/permissions/publicLane.ts#PUBLIC_LANE_COLUMNS).",
  },
  {
    relation: "agent.shortcut",
    columns: [
      "id", "category_id", "label", "description", "icon_name", "keyboard_shortcut",
      "sort_order", "agent_id", "enabled_features", "scope_mappings", "display_mode", "allow_chat",
      "auto_run", "show_pre_execution_gate", "is_active", "created_at", "updated_at", "agent_version_id",
      "use_latest", "show_variable_panel", "variables_panel_style", "show_definition_messages", "show_definition_message_content", "hide_reasoning",
      "hide_tool_results", "pre_execution_message", "bypass_gate_seconds", "default_user_input", "default_variables", "context_overrides",
      "llm_overrides", "context_mappings", "response_density", "json_extraction", "surface_name", "value_mappings",
      "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "agent.template",
    columns: [
      "id", "name", "description", "category", "tags", "is_featured",
      "use_count", "messages", "variable_definitions", "model_id", "model_tiers", "settings",
      "output_schema", "tools", "custom_tools", "context_policies", "mcp_servers", "is_archived",
      "source_agent_id", "created_at", "updated_at", "tool_config", "visibility", "deleted_at",
      "auto_context_disabled",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ai.api",
    columns: [
      "id", "visibility", "created_at", "updated_at", "deleted_at", "name",
      "display_name", "translator_key", "transport", "rules", "request_defaults", "description",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ai.endpoint",
    columns: [
      "id", "visibility", "created_at", "updated_at", "deleted_at", "vendor",
      "internal_name", "display_name", "base_url", "auth_ref", "byok_secret_key", "priority",
      "is_active", "notes", "doc_sources",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ai.model_alias",
    columns: [
      "id", "visibility", "created_at", "updated_at", "deleted_at", "alias",
      "model_id", "kind", "notes",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ai.model_definition",
    columns: [
      "id", "name", "common_name", "context_window", "max_tokens", "capabilities",
      "provider_id", "is_deprecated", "is_primary", "is_premium", "mid_fallback_id", "guest_fallback_id",
      "visibility", "deleted_at", "created_at", "updated_at", "release_date", "description",
      "cost_rating", "speed_rating", "retry_fallback_id", "retry_max_attempts", "retired_at", "successor_id",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ai.model_offering",
    columns: [
      "offering_id", "model_id", "model_name", "model_common_name", "priority", "is_available",
      "usage_basis", "points_per_million_input", "points_per_million_output", "points_per_million_cached_input", "effective_capabilities", "token_billed",
      "served_via", "served_via_endpoint_id", "model_is_deprecated",
    ],
    why:
      "The routable-offering half of the anonymous model catalog, read beside ai.model_public by the same hook. security_invoker OFF; kept for the same reason.",
  },
  {
    relation: "ai.model_public",
    columns: [
      "id", "name", "common_name", "capabilities", "context_window", "max_tokens",
      "is_primary", "is_premium", "mid_fallback_id", "guest_fallback_id", "release_date", "description",
      "cost_rating", "speed_rating", "maker", "usage_basis", "token_billed", "points_per_million_input",
      "points_per_million_output", "is_deprecated", "retired_at", "successor_id",
    ],
    why:
      "The anonymous model catalog — features/ai-models/hooks/useModelCatalog.ts: \"user → ai.model_public (anon + authenticated; masked, points pricing)\". A view with security_invoker OFF, so it does not consult RLS; kept because it is meant to be world-readable.",
  },
  {
    relation: "ai.offering",
    columns: [
      "id", "model_id", "provider_model_id", "priority", "is_available", "pricing",
      "usage_basis", "capabilities_override", "override", "notes", "visibility", "created_at",
      "updated_at", "deleted_at", "token_billed", "endpoint_id", "api_id", "pricing_verified_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ai.provider",
    columns: [
      "id", "name", "company_description", "documentation_link", "models_link", "provider_models_cache",
      "visibility", "deleted_at", "created_at", "updated_at", "slug", "website_url",
      "logo_url", "doc_sources", "sync_policy",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ai.setting",
    columns: [
      "id", "key", "value_type", "canonical_min", "canonical_max", "canonical_values",
      "default_value", "ui", "description", "visibility", "created_at", "updated_at",
      "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ai.voices",
    columns: [
      "id", "provider", "provider_voice_id", "name", "voice_type", "gender",
      "accent", "age", "language", "languages", "tags", "quality_score",
      "description", "style", "sample_file_id", "sample_url", "preview_url", "enabled",
      "is_verified", "sort_order", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "app.definition",
    columns: [
      "id", "project_id", "task_id", "agent_id", "agent_version_id", "use_latest",
      "slug", "name", "tagline", "description", "category", "tags",
      "component_code", "component_language", "allowed_imports", "variable_schema", "layout_config", "styling_config",
      "app_kind", "shared_context_policies", "preview_image_url", "favicon_url", "status", "is_featured",
      "is_verified", "rate_limit_per_ip", "rate_limit_window_hours", "rate_limit_authenticated", "pinned_version", "total_executions",
      "total_tokens_used", "total_cost", "unique_users_count", "success_rate", "avg_execution_time_ms", "last_execution_at",
      "created_at", "updated_at", "published_at", "search_tsv", "shell_kind", "shell_config",
      "slot_overrides", "slot_code", "visibility", "deleted_at", "mandate_id",
    ],
    why:
      "The public app page /p/[slug] renders a signed-out visitor's app: name, tagline, description, preview_image_url, favicon_url.",
  },
  {
    relation: "billing.capability",
    columns: [
      "capability", "enforced", "period", "min_tier", "updated_at", "usage_source",
      "id", "created_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "billing.capability_limit",
    columns: [
      "capability", "tier", "limit_value", "period", "id", "created_at",
      "updated_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "billing.plan",
    columns: [
      "id", "name", "audience", "tagline", "rank", "tier",
      "monthly_cents", "annual_cents", "per_seat", "min_seats", "badge", "is_public",
      "is_default", "active", "created_at", "updated_at",
    ],
    why:
      "Anon-readable by the policy `plan_public_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "billing.plan_limit",
    columns: [
      "plan_id", "capability", "period", "limit_value", "note", "updated_at",
      "id", "created_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "billing.price",
    columns: [
      "id", "stripe_price_id", "product_id", "unit_amount", "currency", "interval",
      "interval_count", "trial_period_days", "active", "created_at", "updated_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "billing.product",
    columns: [
      "id", "stripe_product_id", "name", "description", "tier", "active",
      "created_at", "updated_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "canvas.canvas_items",
    columns: [
      "id", "type", "content", "title", "description", "is_favorited",
      "is_archived", "tags", "session_id", "source_message_id", "task_id", "is_public",
      "created_at", "updated_at", "last_accessed_at", "content_hash", "project_id", "conversation_id",
      "artifact_index", "parent_canvas_id", "source_type", "external_system", "external_id", "deleted_at",
      "visibility", "source_system", "source_id", "version",
    ],
    why:
      "Anon-readable by the policy `pub_read`. `version` is deliberately IN this list and is the one "
      + "exception on the whole surface: the canvas UI reads it on a SHARED artifact "
      + "(features/canvas/core/CanvasBody.tsx keys its render on row.version; "
      + "ensureArtifactPersisted.ts reports it), and canvasArtifactService.getById / .getBySource are "
      + "the shared-view path a signed-out visitor reaches on /s/[token] and /canvas/shared. It is a "
      + "monotonic integer on a row the visitor may already see and names no person, organization or "
      + "secret — do not revoke it on the strength of the column's name "
      + "(migrations/dd186_canvas_item_version_is_public.sql). Still revoked here: user_id, "
      + "organization_id, created_by, updated_by, metadata.",
  },

  {
    relation: "canvas.shared_canvas_items",
    columns: [
      "id", "title", "description", "canvas_type", "canvas_data", "thumbnail_url",
      "creator_username", "creator_display_name", "original_id", "forked_from", "version_number", "fork_count",
      "view_count", "like_count", "share_count", "comment_count", "play_count", "completion_rate",
      "has_scoring", "high_score", "high_score_user", "average_score", "total_attempts", "visibility",
      "allow_remixes", "require_attribution", "featured", "tags", "categories", "created_at",
      "updated_at", "published_at", "last_played_at", "trending_score", "search_vector", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "chat.agent_memory",
    columns: [
      "id", "memory_type", "scope", "scope_id", "key", "content",
      "importance", "access_count", "last_accessed_at", "expires_at", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "chat.agent_run",
    columns: [
      "id", "kind", "status", "input_fingerprint", "request", "result",
      "error", "total_cost", "created_at", "updated_at", "episode_id", "last_heartbeat_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "chat.conversation",
    columns: [
      "id", "title", "system_instruction", "config", "status", "message_count",
      "forked_from_id", "forked_at_position", "created_at", "updated_at", "deleted_at", "last_model_id",
      "parent_conversation_id", "variables", "overrides", "description", "keywords", "task_id",
      "source_app", "source_feature", "is_ephemeral", "initial_agent_id", "initial_agent_version_id", "is_favorite",
      "cache_state", "last_context_breakdown", "sandbox_instance_id", "last_request_status", "last_request_id", "app_instance_id",
      "exclude_from_kg", "conversation_type", "visibility", "origin_class",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "chat.user_request",
    columns: [
      "id", "total_input_tokens", "total_output_tokens", "total_cached_tokens", "total_tokens", "total_cost",
      "total_duration_ms", "api_duration_ms", "tool_duration_ms", "iterations", "total_tool_calls", "status",
      "finish_reason", "error", "created_at", "completed_at", "deleted_at", "source_app",
      "source_feature", "agent_id", "agent_version_id", "last_activity_at", "updated_at", "origin_class",
      "origin_witness", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "code.code_file_folders",
    columns: [
      "id", "parent_folder_id", "project_id", "workspace_id", "name", "description",
      "icon_name", "color", "sort_order", "is_active", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "code.code_files",
    columns: [
      "id", "folder_id", "project_id", "workspace_id", "task_id", "name",
      "path", "language", "content", "content_hash", "s3_key", "s3_bucket",
      "is_readonly", "tags", "created_at", "updated_at", "repository_id", "deleted_at",
      "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "code.code_repositories",
    columns: [
      "id", "root_folder_id", "project_id", "workspace_id", "name", "description",
      "git_url", "git_branch", "git_provider", "git_commit_sha", "s3_bucket", "s3_prefix",
      "last_synced_at", "sync_status", "sync_error", "is_active", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.dm_conversations",
    columns: [
      "id", "type", "group_name", "group_image_url", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.meet_call_invites",
    columns: [
      "id", "room_name", "mode", "caller_user_id", "caller_name", "caller_avatar_url",
      "callee_ids", "conversation_id", "expires_at", "state", "decline_message", "settled_at",
      "created_at", "updated_at", "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.meet_meetings",
    columns: [
      "id", "room_name", "slug", "title", "kind", "host_user_id",
      "scheduled_for", "scheduled_duration_minutes", "started_at", "ended_at", "locked", "lobby_enabled",
      "recording_policy", "ai_enabled", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.notification",
    columns: [
      "id", "event_key", "recipient_user_id", "channel", "dedupe_key", "payload",
      "subject", "body", "to_address", "status", "attempt_count", "next_attempt_at",
      "claimed_by", "lease_expires_at", "provider", "provider_message_id", "error_code", "error_message",
      "sent_at", "created_at", "updated_at", "visibility", "recipient_kind", "recipient_party_id",
      "recipient_actor_token_id", "recipient_label", "delivered_at", "read_at", "read_channel", "acted_at",
      "outcome", "outcome_at", "target_kind", "target_id", "deep_link",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.notification_event_override",
    columns: [
      "id", "event_key", "enabled", "default_channels", "config_patch", "created_at",
      "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.notification_event_type",
    columns: [
      "id", "event_key", "label", "description", "default_channels", "config",
      "enabled", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.notification_preference",
    columns: [
      "id", "event_key", "channel", "enabled", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.sms_consent",
    columns: [
      "id", "consent_type", "status", "opted_in_at", "opted_out_at", "opt_in_method",
      "opt_out_method", "opt_in_keyword", "opt_out_keyword", "created_at", "updated_at", "deleted_at",
      "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.sms_conversations",
    columns: [
      "id", "external_phone_number", "our_phone_number", "status", "conversation_type", "ai_agent_id",
      "last_message_at", "last_message_preview", "last_message_direction", "message_count", "unread_count", "created_at",
      "updated_at", "deleted_at", "visibility", "provider", "provider_account_id", "destination_identity_id",
      "program_key", "party_id", "contact_medium_id", "contact_point_id", "interaction_id", "chat_conversation_id",
      "agent_version_id", "identity_status", "agent_id", "canonical_agent_version_id",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.sms_notification_preferences",
    columns: [
      "id", "sms_enabled", "dm_notifications", "task_notifications", "job_completion_notifications", "system_alerts",
      "marketing_messages", "ai_agent_messages", "quiet_hours_enabled", "quiet_hours_start", "quiet_hours_end", "timezone",
      "max_messages_per_hour", "max_messages_per_day", "created_at", "updated_at", "deleted_at", "visibility",
      "preferred_agent_id", "preferred_agent_version_id", "assistant_destination_id", "assistant_program_key",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.sms_notifications",
    columns: [
      "id", "message_id", "notification_type", "category", "reference_type", "reference_id",
      "status", "failure_reason", "scheduled_for", "sent_at", "created_at", "deleted_at",
      "visibility", "updated_at", "idempotency_key", "interaction_id",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.sms_phone_numbers",
    columns: [
      "id", "twilio_sid", "friendly_name", "capabilities", "number_type", "is_active",
      "assigned_at", "released_at", "created_at", "updated_at", "deleted_at", "visibility",
      "provider", "provider_account_id", "program_key", "assistant_enabled",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.sms_rate_limits",
    columns: [
      "id", "window_start", "window_type", "message_count",
    ],
    why:
      "Anon-readable by the policy `Service role only`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "communication.sms_webhook_logs",
    columns: [
      "id", "webhook_type", "twilio_sid", "raw_payload", "processed", "processing_error",
      "created_at", "provider", "provider_account_id", "provider_event_key", "message_id", "processing_attempts",
      "claimed_at", "lease_expires_at", "processed_at",
    ],
    why:
      "Anon-readable by the policy `Service role only for webhook logs`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "content_ir.kind_component",
    columns: [
      "id", "kind_definition_id", "platform", "role", "component_key", "source",
      "component_source", "props_transform", "config", "pinned_kind_version", "is_default", "is_active",
      "sort_order", "created_at", "updated_at", "deleted_at", "semver", "notes",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "content_ir.kind_definition",
    columns: [
      "id", "kind", "label", "authoring_owner", "data", "sample_data",
      "emitted_block_schema", "emitted_json_schema", "emitted_fingerprint", "is_active", "created_at", "updated_at",
      "deleted_at", "visibility", "capture_until", "capture_target", "is_contract_artifact", "variants",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "content_ir.kind_edge",
    columns: [
      "id", "parent_definition_id", "field_name", "child_definition_id", "pinned_child_version", "position",
      "created_at", "updated_at", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "content_ir.kind_example",
    columns: [
      "id", "kind_definition_id", "kind_version", "data", "label", "description",
      "source", "source_ref", "is_canonical", "validation_status", "validated_at", "captured_at",
      "created_at", "updated_at", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "content_ir.kind_surface",
    columns: [
      "id", "kind_definition_id", "surface_type", "token", "parser_strategy", "parser_config",
      "streaming", "priority", "is_active", "created_at", "updated_at", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "context.scopes",
    columns: [
      "id", "scope_type_id", "parent_scope_id", "name", "description", "settings",
      "created_at", "updated_at", "slug", "sort_order", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.blocklist_entry",
    columns: [
      "id", "subject_kind", "subject_value", "reason", "source", "party_id",
      "expires_at", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.contact_medium",
    columns: [
      "id", "channel", "platform_slug", "value_raw", "value_key", "display_value",
      "external_id", "handle", "profile_url", "line_type", "phone_country", "calling_time_zone",
      "is_role_address", "mx_valid", "verification_status", "verified_at", "bounce_type", "bounce_count",
      "first_bounced_at", "last_bounced_at", "complaint_at", "unsubscribed_at", "dnc_state", "dnc_checked_at",
      "suppressed_at", "suppression_reason", "suppression_expires_at", "details", "created_at", "updated_at",
      "deleted_at", "visibility", "is_contactable", "consent_basis", "consent_source", "consent_source_url",
      "consent_recorded_at", "consent_evidence_at", "consent_expires_at", "consent_jurisdiction", "consent_evidence", "subscriber_kind",
      "source_disclosed_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.deal",
    columns: [
      "id", "name", "description", "pipeline_id", "stage_id", "stage_entered_at",
      "status", "amount", "currency", "expected_close_date", "closed_at", "probability",
      "primary_party_id", "assigned_to", "lost_reason_id", "lost_reason_note", "source", "source_detail",
      "sort_order", "attributes", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.enrichment_call",
    columns: [
      "id", "provider", "operation", "cache_key", "request", "response",
      "result_count", "status", "error", "credits_used", "estimated_cost_usd", "latency_ms",
      "expires_at", "party_id", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.jurisdiction_policy",
    columns: [
      "country_code", "country_name", "region", "cold_b2b", "cold_b2c", "conditions",
      "unsubscribe_validity_days", "honor_within_hours", "requires_postal_address", "requires_source_disclosure", "requires_role_relevance", "distinguishes_subscriber_kind",
      "citation", "ratified_at", "ratified_note", "notes", "is_active", "created_at",
      "updated_at", "id", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.outreach_list",
    columns: [
      "id", "name", "description", "list_kind", "status", "definition",
      "started_at", "ended_at", "created_at", "updated_at", "deleted_at", "visibility",
      "sending_identity_id", "paused_at", "paused_by", "pause_reason", "paused_by_kind", "lane",
      "lawful_basis", "lia_interest", "lia_necessity", "lia_balancing", "lia_completed_at", "lia_completed_by",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.party",
    columns: [
      "id", "party_kind", "display_name", "sort_name", "name_key", "aka",
      "first_name", "middle_name", "last_name", "preferred_name", "name_prefix", "name_suffix",
      "pronouns", "date_of_birth", "headline", "legal_name", "primary_domain", "industry_id",
      "employee_band", "founded_year", "tax_id", "registration_number", "bio", "avatar_file_id",
      "timezone", "locale", "canonical_id", "source_party_id", "source_synced_at", "locked_fields",
      "expert_status", "claimed_by", "claimed_at", "assigned_to", "lifecycle_stage_id", "lifecycle_stage_changed_at",
      "became_customer_at", "rating_id", "source", "source_detail", "do_not_contact", "do_not_contact_reason",
      "linked_organization_id", "primary_employer_party_id", "job_title", "attributes", "created_at", "updated_at",
      "deleted_at", "visibility", "record_class", "created_by_tier", "created_by_system", "updated_by_tier",
      "updated_by_system",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.registry_ingest_run",
    columns: [
      "id", "source_slug", "pass_key", "params", "status", "cursor",
      "lease_owner", "lease_expires_at", "heartbeat_at", "started_at", "finished_at", "last_completed_at",
      "next_due_at", "run_count", "requests_made", "items_seen", "organizations_created", "organizations_matched",
      "people_created", "people_skipped_no_identifier", "candidates_created", "estimated_cost_usd", "lifetime", "error",
      "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.registry_source",
    columns: [
      "id", "slug", "label", "homepage_url", "terms_url", "terms_version",
      "licence_class", "ingest_status", "allows_persistence", "allows_customer_use", "allows_person_promotion", "permitted_fields",
      "refresh_cadence_days", "deletion_feed", "crawl_policy", "api_base_url", "rate_limit_per_second", "review_due_at",
      "notes", "declared_at", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.saved_view",
    columns: [
      "id", "name", "description", "definition", "last_used_at", "created_at",
      "updated_at", "deleted_at", "visibility", "list_key",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.sending_identity",
    columns: [
      "id", "display_name", "provider", "connection_id", "provider_account", "from_address",
      "from_address_key", "from_name", "reply_to", "sending_domain", "status", "status_changed_at",
      "paused_by_kind", "paused_at", "paused_by", "pause_reason", "pause_code", "resumed_at",
      "resumed_by", "domain_verification_token", "domain_verified_at", "domain_checked_at", "domain_check_error", "spf_pass",
      "dkim_pass", "dmarc_pass", "auth_checked_at", "auth_detail", "warmup_started_at", "warmup_completed_at",
      "warmup_day", "daily_cap", "hourly_cap", "min_interval_seconds", "max_interval_seconds", "quiet_hours_start",
      "quiet_hours_end", "send_weekends", "default_recipient_timezone", "health", "health_computed_at", "last_send_at",
      "attributes", "created_at", "updated_at", "deleted_at", "visibility", "postal_name",
      "postal_line1", "postal_line2", "postal_city", "postal_region", "postal_code", "postal_country",
      "domain_registered_at", "domain_age_checked_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "crm.sending_policy",
    columns: [
      "id", "outreach_enabled", "disabled_at", "disabled_by", "disabled_reason", "disabled_by_kind",
      "enabled_at", "enabled_by", "notes", "attributes", "created_at", "updated_at",
      "deleted_at", "visibility", "postal_name", "postal_line1", "postal_line2", "postal_city",
      "postal_region", "postal_code", "postal_country", "postal_verified_at", "privacy_notice_url",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "docproc.page_extraction_results",
    columns: [
      "id", "run_id", "page_run_id", "job_id", "file_id", "payload",
      "source_pages", "canonical_page", "created_at",
    ],
    why:
      "Anon-readable by the policy `page_extraction_results_owner_write/page_extraction_results_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "docproc.page_extraction_runs",
    columns: [
      "id", "job_id", "status", "trigger_source", "triggered_by", "chunk_count",
      "completed_chunks", "failed_chunks", "result_count", "total_cost", "total_tokens", "started_at",
      "finished_at", "error", "created_at",
    ],
    why:
      "Anon-readable by the policy `page_extraction_runs_owner_write/page_extraction_runs_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "education.content_certification",
    columns: [
      "id", "resource_type", "resource_id", "note", "certified_at", "human_verified_at",
      "created_at", "updated_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "education.learn_doc",
    columns: [
      "id", "created_at", "updated_at", "deleted_at", "visibility", "slug",
      "title", "summary", "subject", "letter", "keywords", "sections",
      "related", "content_updated_at", "published_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "education.math_course_structure",
    columns: [
      "id", "course_name", "topic_name", "module_name", "module_description", "lesson_name",
      "lesson_objectives", "lesson_content", "sort_order", "created_at", "updated_at",
    ],
    why:
      "Anon-readable by the policy `Public can view course structure`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "education.math_problems",
    columns: [
      "id", "title", "course_name", "topic_name", "module_name", "description",
      "intro_text", "final_statement", "problem_statement", "solutions", "hint", "resources",
      "difficulty_level", "related_content", "sort_order", "is_published", "created_at", "updated_at",
    ],
    why:
      "Anon-readable by the policy `Public can view published math problems`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "education.quiz_sessions",
    columns: [
      "id", "title", "state", "is_completed", "created_at", "updated_at",
      "completed_at", "quiz_content_hash", "quiz_metadata", "category", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "education.study_media",
    columns: [
      "id", "created_at", "updated_at", "deleted_at", "visibility", "media_kind",
      "title", "description", "status", "source_kind", "source_id", "source_title",
      "config", "trust", "run_id", "episode_id", "audio_file_id", "audio_format",
      "duration_seconds", "ir_envelope", "diagram_kind",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "extend.wbx_capture",
    columns: [
      "id", "url", "captured_at", "title", "description", "lang",
      "soup", "markdown", "ld_json", "media_count", "pattern_id", "created_at",
      "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "extend.wbx_demo",
    columns: [
      "id", "name", "description", "start_url", "step_count", "parameter_names",
      "body", "is_deleted", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `wbx_demo_owner_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "extend.wbx_guidance",
    columns: [
      "id", "domain", "kind", "caption", "origin_url", "data",
      "created_at", "updated_at", "is_deleted", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `wbx_guidance_owner_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "extend.wbx_highlight",
    columns: [
      "id", "conversation_id", "mode", "url", "domain", "page_title",
      "color", "text", "anchor", "is_deleted", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "extend.wbx_pattern",
    columns: [
      "id", "name", "domain", "route_pattern", "list_root_selector", "fields",
      "last_used_at", "created_at", "kind", "config", "target_user_table_id", "last_run_at",
      "last_status", "last_run_count", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "extend.wbx_recipe",
    columns: [
      "id", "label", "description", "hosts", "routes", "kind",
      "config", "yields_rows", "is_active", "last_verified_at", "created_at", "updated_at",
    ],
    why:
      "Anon-readable by the policy `wbx_recipe_read_all`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "extend.wbx_screenshot",
    columns: [
      "id", "page_url_canonical", "page_url_full", "page_title", "file_id", "file_url",
      "width", "height", "mime_type", "byte_length", "source", "captured_at",
      "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "extend.wbx_seo_audit",
    columns: [
      "id", "url", "audited_at", "signals", "recommendations", "flesch_reading_ease",
      "word_count", "notes", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "files.analysis",
    columns: [
      "file_id", "mime_type", "status", "analyzer_version", "detectors_run", "progress",
      "classification", "page_count", "summary_counts", "text_source_map", "thumbnail_url", "started_at",
      "completed_at", "updated_at", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `file_analysis_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "files.analysis_result",
    columns: [
      "id", "file_id", "detector_kind", "detector_version", "confidence_tier", "status",
      "text_sources", "elapsed_ms", "summary", "payload", "payload_uri", "payload_bytes",
      "error", "created_at", "page_id",
    ],
    why:
      "Anon-readable by the policy `file_analysis_result_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "files.file_rag_jobs",
    columns: [
      "id", "file_id", "status", "trigger_source", "scheduled_for", "started_at",
      "completed_at", "attempt_count", "skipped_reason", "error", "created_at", "updated_at",
    ],
    why:
      "Anon-readable by the policy `cld_file_rag_jobs_owner_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "files.files",
    columns: [
      "id", "file_path", "file_name", "mime_type", "size_bytes", "checksum",
      "visibility", "current_version", "parent_folder_id", "created_at", "updated_at", "deleted_at",
      "parent_file_id", "derivation_kind", "derivation_metadata", "duplicate_of_file_id", "canonical_processed_document_id", "width",
      "height", "duration_ms",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "files.folders",
    columns: [
      "id", "folder_path", "folder_name", "parent_id", "visibility", "created_at",
      "updated_at", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "files.idempotency",
    columns: [
      "idempotency_key", "request_hash", "endpoint", "status_code", "response_body", "resource_id",
      "resource_type", "created_at", "expires_at",
    ],
    why:
      "Anon-readable by the policy `cld_idempotency_owner_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "files.uploads_inflight",
    columns: [
      "id", "file_id", "file_path", "bucket", "key", "multipart_upload_id",
      "upload_length", "upload_offset", "visibility", "mime_type", "file_name", "idempotency_key",
      "parts", "status", "expires_at", "created_at", "updated_at",
    ],
    why:
      "Anon-readable by the policy `cld_uploads_inflight_owner_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "files.webhook_deliveries",
    columns: [
      "id", "webhook_id", "attempt", "status", "http_status", "latency_ms",
      "error_message", "next_attempt_at", "created_at", "completed_at", "activity_log_id", "net_request_id",
      "signature", "dispatched_at",
    ],
    why:
      "Anon-readable by the policy `cld_webhook_deliveries_owner_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "files.webhooks",
    columns: [
      "id", "target_url", "description", "is_active", "event_types", "resource_types",
      "last_attempt_at", "last_success_at", "consecutive_failures", "max_consecutive_failures", "created_at", "updated_at",
    ],
    why:
      "Anon-readable by the policy `cld_webhooks_owner_all`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "iam.industries",
    columns: [
      "id", "slug", "name", "facet", "parent_id", "default_template_id",
      "description", "is_active", "sort_order", "created_at", "updated_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "iam.permissions",
    columns: [
      "id", "resource_type", "resource_id", "granted_to_user_id", "granted_to_organization_id", "is_public",
      "permission_level", "created_at", "status", "reviewed_by", "reviewed_at", "review_note",
      "expires_at",
    ],
    why:
      "Anon-readable by the policy `Users can view relevant permissions`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "legal.wc_claim",
    columns: [
      "id", "created_at", "applicant_name", "person_id", "date_of_birth", "date_of_injury",
      "age_at_doi", "occupational_code", "weekly_earnings", "gender", "case_number", "evaluator_name",
      "comments", "project_id", "is_public", "tags", "updated_at", "p_s_date",
      "job_offer_date", "large_employer", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ops.app_log",
    columns: [
      "id", "ts", "level", "level_no", "logger_name", "feature",
      "route", "message", "exc_type", "traceback", "request_id", "conversation_id",
      "process_pid", "host_role", "classified", "created_at", "stage",
    ],
    why:
      "Anon-readable by the policy `app_log_self_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "pdf.pdf_redaction_audits",
    columns: [
      "id", "parent_file_id", "file_id", "reason", "redaction_kind", "redaction_params",
      "tier_used", "status", "bytes_removed_estimate", "regions_count", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "pdf.pdf_redaction_key_escrow",
    columns: [
      "id", "session_id", "file_id", "wrapped_key", "wrap_alg", "created_at",
      "revoked_at",
    ],
    why:
      "Anon-readable by the policy `pdf_redaction_key_escrow_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "platform.assurance_level",
    columns: [
      "slug", "label", "blurb", "rank", "is_active", "created_at",
      "updated_at", "id", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "platform.categories",
    columns: [
      "id", "dimension", "name", "slug", "parent_id", "color",
      "icon", "position", "created_at", "updated_at", "deleted_at", "placement_type",
      "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "platform.feature_knob",
    columns: [
      "feature", "key", "value", "default_value", "value_type", "unit",
      "min_value", "max_value", "allowed_values", "label", "description", "set_by",
      "basis", "review_due", "created_at", "updated_at", "overridable_by", "override_direction",
      "bound_value", "ui", "taxonomy_node_id", "propagation", "public_read",
    ],
    why:
      "Anon-readable by the policy `feature_knob_read_anon`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "platform.flexible_data",
    columns: [
      "id", "label", "slug", "data", "created_at", "updated_at",
      "deleted_at", "visibility", "category_id",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "platform.rulebook",
    columns: [
      "id", "name", "slug", "description", "source", "sections",
      "rules", "status", "visibility", "created_at", "updated_at", "deleted_at",
      "industry_id", "source_rulebook_id", "source_version", "source_synced_at", "source_authority", "assurance_level",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "platform.shareable_resource_registry",
    columns: [
      "resource_type", "table_name", "id_column", "owner_column", "is_public_column", "display_label",
      "url_path_template", "rls_uses_has_permission", "is_active", "notes", "created_at", "updated_at",
      "content_role", "is_scopeable", "schema_name", "public_columns", "is_link_shareable", "id",
      "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "platform.source_authority",
    columns: [
      "slug", "label", "blurb", "rank", "is_active", "created_at",
      "updated_at", "id", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "platform.v_feature_knob_overdue",
    columns: [
      "feature", "key", "label", "value", "default_value", "unit",
      "basis", "review_due", "days_overdue",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "podcast.pc_articles",
    columns: [
      "id", "show_id", "episode_id", "kind", "slug", "title",
      "content_markdown", "og_image_url", "canonical_url", "status", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "podcast.pc_episodes",
    columns: [
      "id", "slug", "show_id", "title", "description", "audio_url",
      "image_url", "video_url", "display_mode", "episode_number", "duration_seconds", "is_published",
      "created_at", "updated_at", "og_image_url", "thumbnail_url", "host_count", "speakers",
      "script", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "podcast.pc_race",
    columns: [
      "id", "topic", "request", "status", "arms", "verdict_winner",
      "verdict_notes", "verdict_at", "error", "completed_at", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "podcast.pc_shows",
    columns: [
      "id", "slug", "title", "description", "image_url", "author",
      "is_published", "created_at", "updated_at", "og_image_url", "thumbnail_url", "rss_settings",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "podcast.pc_studio_runs",
    columns: [
      "id", "status", "input_data_type", "podcast_type", "request", "title",
      "description", "script", "audio_url", "image_urls", "video_urls", "image_prompts",
      "video_prompts", "selected_cover_url", "show_id", "episode_id", "episode_slug", "error",
      "created_at", "updated_at", "backend_run_id", "host_count", "speakers", "deleted_at",
      "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "public.app_config",
    columns: [
      "app", "schema_version", "min_supported_app_version", "config", "updated_at", "id",
      "created_at", "visibility",
    ],
    why:
      "matrx-local reads this pre-login for its remote config (app/services/app_config/client.py), naming these five columns; aidream's public /api/app-config/{app} is the fallback path.",
  },
  {
    relation: "public.catalog_entries",
    columns: [
      "id", "app", "kind", "key", "schema_version", "payload",
      "artifact_url", "artifact_sha256", "artifact_size_bytes", "min_app_version", "is_active", "sort_order",
      "notes", "updated_at",
    ],
    why:
      "The matrx-local desktop app fetches its remote catalogs pre-login with the publishable key "
      + "(matrx-local/app/services/catalogs/client.py), so the read itself is correct and must stay. "
      + "These fourteen columns are the feature's own declared public contract — the exact set "
      + "aidream's unauthenticated GET /api/catalogs/{app} publishes in services/catalogs/service.py. "
      + "Deliberately absent: updated_by, created_by, organization_id, metadata, version, visibility.",
  },
  {
    relation: "public.current_user_is_admin",
    columns: [
      "is_admin", "admin_level",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "public.pdf_unified_pages",
    columns: [
      "page_id", "processed_document_id", "file_id", "page_number", "page_index", "raw_text",
      "cleaned_text", "section_kind", "section_title", "is_continuation", "width", "height",
      "extract_rotation", "used_ocr", "image_cld_file_id", "file_page_id", "user_status", "user_rotation",
      "excluded_at", "user_modified", "thumbnail_url",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "public.v_context_item_suggestions",
    columns: [
      "id", "scope_type_id", "suggested_key", "display_name", "rationale", "example_value",
      "example_source_kind", "example_source_id", "confidence", "status", "created_at", "decided_at",
      "decided_by", "suppressed_until", "scope_type_label", "scope_type_label_plural", "scope_type_icon", "scope_type_slug",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "public.v_kg_alerts",
    columns: [
      "id", "source_kind", "source_id", "target_scope_id", "target_slot_key", "kind",
      "severity", "description", "suggested_action", "evidence", "confidence", "status",
      "created_at", "decided_at", "decided_by", "viewed_at", "scope_name",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "public.v_kg_sweep_effectiveness",
    columns: [
      "sweep_run_row_id", "sweep_run_id", "trigger_type", "scope_type_id", "run_status", "suggestions_created",
      "entities_selected", "llm_calls", "cost_usd", "started_at", "completed_at", "suggestions_tracked",
      "pending", "accepted", "rejected", "deferred", "expired",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "public.v_kg_value_matches",
    columns: [
      "id", "source_kind", "source_id", "kg_entity_id", "target_scope_id", "target_context_item_id",
      "target_slot_key", "matched_value", "current_value_snapshot", "mention_count", "evidence_chunk_id", "confidence",
      "created_at", "scope_name", "scope_slug", "scope_type_label", "scope_type_icon", "item_label",
      "item_key",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "public.v_ner_canonicalizer_shadow",
    columns: [
      "id", "source_kind", "source_id", "run_id", "input_pair_count", "agent_input_json",
      "agent_output_json", "agent_merge_group_count", "deterministic_groups_json", "deterministic_merge_group_count", "comparison_json", "agreed_merge_surface_count",
      "agent_only_merge_surface_count", "deterministic_only_merge_surface_count", "agent_model", "agent_cost_usd", "agent_elapsed_ms", "agent_error",
      "status", "created_at",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "public.v_scope_suggestion_stats",
    columns: [
      "status", "is_starred", "n",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "public.v_scope_suggestions",
    columns: [
      "id", "stage", "source_kind", "source_id", "kg_entity_id", "target_scope_id",
      "target_item_id", "target_slot", "suggested_value", "current_value_snapshot", "match_kind", "confidence",
      "status", "context_snippet", "decision_note", "is_starred", "viewed_at", "created_at",
      "decided_at", "decided_by", "suppressed_until", "org_name", "org_slug", "scope_type_id",
      "scope_type_label", "scope_type_slug", "scope_type_icon", "scope_name", "scope_slug", "item_label",
      "item_key",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "public.v_scope_suggestions_new",
    columns: [
      "id", "source_kind", "source_id", "scope_type_id", "scope_type_label", "suggested_name",
      "suggested_slot_values", "reasoning", "confidence", "status", "created_at", "decided_at",
      "decided_by", "suppressed_until", "resolved_scope_type_label", "scope_type_icon", "scope_type_slug",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "rag.context_item_suggestions",
    columns: [
      "id", "scope_type_id", "suggested_key", "display_name", "rationale", "example_value",
      "example_source_kind", "example_source_id", "confidence", "status", "created_at", "decided_at",
      "decided_by", "suppressed_until", "sweep_run_id", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "rag.kg_alerts",
    columns: [
      "id", "source_kind", "source_id", "target_scope_id", "target_slot_key", "kind",
      "severity", "description", "suggested_action", "evidence", "confidence", "status",
      "created_at", "decided_at", "decided_by", "viewed_at", "deleted_at", "updated_at",
      "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "rag.kg_sweep_queue",
    columns: [
      "id", "change_type", "entity_id", "scope_type_id", "status", "enqueued_at",
      "claim_at", "claimed_at", "sweep_run_id", "updated_at", "deleted_at", "visibility",
      "created_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "rag.kg_sweep_run",
    columns: [
      "id", "run_id", "trigger_type", "trigger_entity_id", "scope_type_id", "status",
      "change_count", "documents_considered", "entities_enumerated", "entities_excluded_resolved", "entities_after_dedup", "entities_selected",
      "entities_deferred", "batches", "llm_calls", "tokens_in", "tokens_out", "cost_usd",
      "suggestions_created", "started_at", "completed_at", "error", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "rag.kg_value_matches",
    columns: [
      "id", "source_kind", "source_id", "kg_entity_id", "target_scope_id", "target_context_item_id",
      "target_slot_key", "matched_value", "current_value_snapshot", "mention_count", "evidence_chunk_id", "confidence",
      "created_at", "deleted_at", "updated_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "rag.ner_canonicalizer_shadow",
    columns: [
      "id", "source_kind", "source_id", "run_id", "input_pair_count", "agent_input_json",
      "agent_output_json", "agent_merge_group_count", "deterministic_groups_json", "deterministic_merge_group_count", "comparison_json", "agreed_merge_surface_count",
      "agent_only_merge_surface_count", "deterministic_only_merge_surface_count", "agent_model", "agent_cost_usd", "agent_elapsed_ms", "agent_error",
      "status", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "rag.scope_suggestions",
    columns: [
      "id", "source_kind", "source_id", "scope_type_id", "scope_type_label", "suggested_name",
      "suggested_slot_values", "reasoning", "confidence", "status", "created_at", "decided_at",
      "decided_by", "suppressed_until", "sweep_run_id", "deleted_at", "updated_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "research.rs_source_keywords",
    columns: [
      "id", "topic_id", "url", "title", "description", "hostname",
      "source_type", "origin", "rank", "page_age", "thumbnail_url", "extra_snippets",
      "raw_search_result", "is_included", "is_stale", "scrape_status", "discovered_at", "last_seen_at",
      "keyword_id", "rank_for_keyword",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "research.rs_template",
    columns: [
      "id", "name", "description", "keyword_templates", "default_tags", "default_search_params",
      "agent_config", "autonomy_level", "created_at", "updated_at", "visibility", "deleted_at",
      "intent_key",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "research.rs_topic",
    columns: [
      "id", "name", "autonomy_level", "default_search_provider", "default_search_params", "good_scrape_threshold",
      "scrapes_per_keyword", "status", "template_id", "agent_config", "created_at", "updated_at",
      "description", "max_keywords", "analyses_per_keyword", "max_keyword_syntheses", "max_topic_syntheses", "max_documents",
      "max_tag_consolidations", "max_auto_tag_calls", "tone_profile", "outputs", "tag_suggestions", "visibility",
      "deleted_at", "videos_per_keyword", "intent_key", "intent_brief", "refresh_interval_hours", "next_refresh_at",
      "refresh_claim_token", "refresh_claim_expires_at", "last_refresh_at", "last_refresh_outcome", "last_refresh_error", "last_refresh_trigger",
      "consecutive_refresh_failures",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "scheduler.sch_task",
    columns: [
      "id", "kind", "title", "description", "queue", "surfaces",
      "enabled", "expires_at", "tags", "next_due_at", "last_run_at", "created_at",
      "updated_at", "deleted_at", "visibility", "taxonomy_node_id",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "skill.definition",
    columns: [
      "id", "skill_id", "label", "description", "skill_type", "body",
      "icon_name", "model_preference", "allowed_tools", "trigger_patterns", "disable_auto_invocation", "platform_targets",
      "semver", "config", "category_id", "parent_skill_id", "is_active", "sort_order",
      "project_id", "task_id", "created_at", "updated_at", "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "skill.render_definition",
    columns: [
      "id", "block_id", "label", "description", "icon_name", "template",
      "sort_order", "is_active", "skill_id", "category_id", "project_id", "task_id",
      "created_at", "updated_at", "visibility", "deleted_at", "block_type",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "tool.bundle",
    columns: [
      "id", "name", "description", "lister_tool_id", "is_active", "created_at",
      "updated_at", "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "tool.definition",
    columns: [
      "id", "name", "description", "parameters", "output_schema", "annotations",
      "category", "tags", "icon", "semver", "admin_only", "tier",
      "gating", "dedupe_exempt", "validation_exempt", "source_kind", "managed_by_server_id", "max_client_wait_seconds",
      "tool_group", "is_active", "deactivated_at", "created_at", "updated_at", "visibility",
      "deleted_at", "updated_by_tier", "updated_by_system", "side_effect_class",
    ],
    why:
      "matrx-extend asks for name+description before login to build its tool descriptions (src/lib/tools/descriptions.ts).",
  },
  {
    relation: "tool.executor",
    columns: [
      "name", "description", "parent_executor_name", "mcp_server_id", "config", "is_active",
      "created_at", "updated_at", "id", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "tool.mcp_config",
    columns: [
      "id", "server_id", "label", "config_type", "is_default", "command",
      "args", "env_schema", "requires_docker", "npm_package", "pip_package", "min_node_version",
      "notes", "created_at", "updated_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "tool.mcp_server",
    columns: [
      "id", "slug", "name", "vendor", "description", "category",
      "icon_url", "color", "website_url", "docs_url", "endpoint_url", "transport",
      "auth_strategy", "oauth_scopes", "oauth_client_id", "is_official", "is_featured", "has_remote",
      "has_local", "supports_mcp_apps", "status", "sort_order", "created_at", "updated_at",
      "last_synced_at", "discovery_ttl_seconds", "last_sync_error", "last_tested_at", "last_test_ok", "last_test_status_code",
      "last_test_latency_ms", "last_test_error", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "tool.surface_defaults",
    columns: [
      "surface_name", "always_include_tools", "always_include_bundles", "never_include_tools", "never_include_bundles", "arg_defaults",
      "arg_injection", "notes", "is_active", "created_at", "updated_at", "id",
      "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "transcripts.studio_cleaned_segments",
    columns: [
      "id", "session_id", "run_id", "pass_index", "t_start", "t_end",
      "text", "trigger_cause", "superseded_at", "created_at", "recording_segment_id", "processor_key",
    ],
    why:
      "Anon-readable by the policy `studio_cleaned_segments_public_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "transcripts.studio_concept_items",
    columns: [
      "id", "session_id", "run_id", "pass_index", "t_start", "t_end",
      "kind", "label", "description", "confidence", "created_at",
    ],
    why:
      "Anon-readable by the policy `studio_concept_items_public_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "transcripts.studio_module_segments",
    columns: [
      "id", "session_id", "run_id", "pass_index", "module_id", "block_type",
      "t_start", "t_end", "payload", "created_at",
    ],
    why:
      "Anon-readable by the policy `studio_module_segments_public_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "transcripts.studio_raw_segments",
    columns: [
      "id", "session_id", "recording_segment_id", "chunk_index", "t_start", "t_end",
      "text", "speaker", "source", "created_at",
    ],
    why:
      "Anon-readable by the policy `studio_raw_segments_public_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "transcripts.studio_session_settings",
    columns: [
      "session_id", "cleaning_shortcut_id", "cleaning_interval_ms", "concept_shortcut_id", "concept_interval_ms", "module_id",
      "module_shortcut_id", "module_interval_ms", "column_widths", "show_prior_modules", "created_at", "updated_at",
      "context_items", "custom_slots", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `studio_session_settings_public_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "transcripts.studio_sessions",
    columns: [
      "id", "project_id", "transcript_id", "title", "status", "module_id",
      "started_at", "ended_at", "total_duration_ms", "audio_storage_path", "created_at", "updated_at",
      "assistant_conversation_id", "source", "assistant_conversations", "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "transcripts.transcripts",
    columns: [
      "id", "title", "description", "segments", "audio_file_path", "video_file_path",
      "source_type", "tags", "folder_name", "created_at", "updated_at", "is_draft",
      "draft_saved_at", "project_id", "task_id", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ui.ui_client",
    columns: [
      "name", "description", "is_active", "sort_order", "created_at", "updated_at",
      "id", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ui.ui_surface",
    columns: [
      "name", "client_name", "description", "is_active", "sort_order", "created_at",
      "updated_at", "url_pattern", "executor_name", "parent_surface_name", "execution_mode", "supports_dictionary",
      "id", "intro", "label", "value_groups", "readiness", "readiness_note",
      "overlay_id", "last_checked_at", "last_check", "check_claimed_at",
    ],
    why:
      "Anon-readable by the policy `ui_surface_read_anon`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ui.ui_surface_agent_pref",
    columns: [
      "id", "surface_name", "role_name", "agent_id", "kind", "position",
      "settings", "scope_id", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ui.ui_surface_agent_role",
    columns: [
      "surface_name", "name", "label", "description", "kind", "default_agent_id",
      "max_agents", "allow_custom", "auto_run", "sort_order", "created_at", "updated_at",
      "mandate_key", "synced_from", "id", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ui.ui_surface_client_tool",
    columns: [
      "surface_name", "name", "label", "description", "input_schema", "mode",
      "created_at", "updated_at", "synced_from", "id", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ui.ui_surface_config",
    columns: [
      "id", "surface_name", "namespace", "config", "scope_id", "created_at",
      "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ui.ui_surface_value",
    columns: [
      "surface_name", "name", "label", "description", "value_type", "always_available",
      "typical_char_count", "sort_order", "created_at", "updated_at", "auto_context", "group_key",
      "synced_from", "id", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "ui.ui_surface_write_target",
    columns: [
      "surface_name", "name", "label", "description", "value_type", "mode",
      "updates_value", "group_key", "sort_order", "created_at", "updated_at", "apply_policy",
      "synced_from", "kind_key", "id", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.feedback_comments",
    columns: [
      "id", "feedback_id", "author_type", "author_name", "content", "created_at",
    ],
    why:
      "Anon-readable by the policy `Users can view comments on own feedback`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.guest_execution_log",
    columns: [
      "id", "guest_id", "resource_type", "resource_id", "resource_name", "task_id",
      "success", "error_message", "tokens_used", "cost", "execution_time_ms", "user_agent",
      "referer", "created_at",
    ],
    why:
      "Anon-readable by the policy `Only service role can read guest executions`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.guest_executions",
    columns: [
      "id", "user_agent", "total_executions", "first_execution_at", "last_execution_at", "daily_reset_at",
      "daily_executions", "is_blocked", "blocked_until", "blocked_reason", "converted_to_user_id", "converted_at",
      "created_at", "updated_at", "auth_user_id",
    ],
    why:
      "Anon-readable by the policy `Only service role can read guest executions`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.invitation_requests",
    columns: [
      "id", "status",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.profiles",
    columns: [
      "id", "display_name", "avatar_url", "status_text", "is_online", "last_seen_at",
      "created_at", "updated_at", "deleted_at", "visibility", "creator_handle", "creator_public",
      "creator_tagline", "creator_bio", "creator_links", "creator_featured", "creator_published_at", "age_band",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.system_announcements",
    columns: [
      "id", "title", "message", "announcement_type", "is_active", "created_at",
      "updated_at", "min_display_seconds", "target_user_id", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.user_achievements",
    columns: [
      "id", "achievement_type", "achievement_data", "unlocked_at", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.user_analysis_preferences",
    columns: [
      "per_detector_enabled", "default_tier_per_detector", "custom_patterns", "default_redaction_mode", "per_file_type_overrides", "substitute_formats",
      "updated_at", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `user_analysis_preferences_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.user_follows",
    columns: [
      "id", "follower_id", "following_id", "created_at",
    ],
    why:
      "Anon-readable by the policy `Follows are viewable by everyone`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.user_form_profile",
    columns: [
      "legal_first_name", "legal_middle_name", "legal_last_name", "preferred_name", "name_suffix", "pronouns",
      "date_of_birth", "phones", "emails", "social_handles", "website_url", "shipping_line1",
      "shipping_line2", "shipping_city", "shipping_region", "shipping_postal_code", "shipping_country", "billing_same_as_shipping",
      "billing_line1", "billing_line2", "billing_city", "billing_region", "billing_postal_code", "billing_country",
      "company_name", "job_title", "emergency_contacts", "images", "custom_fields", "created_at",
      "updated_at", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `user_form_profile_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.user_markdown_samples",
    columns: [
      "id", "name", "description", "content", "detected_blocks", "created_at",
      "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "users.user_memory",
    columns: [
      "id", "path", "content", "labels", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workbench.heatmap_saves",
    columns: [
      "id", "title", "description", "data", "view_settings", "created_at",
      "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workbench.note_folders",
    columns: [
      "id", "name", "parent_id", "path", "position", "created_at",
      "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workbench.notes",
    columns: [
      "id", "label", "content", "folder_name", "tags", "position",
      "created_at", "updated_at", "folder_id", "file_path", "content_hash", "sync_version",
      "last_device_id", "project_id", "task_id", "visibility", "deleted_at",
    ],
    why:
      "The indexable public viewer /p/e/note reads a public note's display columns (utils/permissions/publicLane.ts#PUBLIC_LANE_COLUMNS).",
  },
  {
    relation: "workbench.udt_dataset_row_versions",
    columns: [
      "id", "row_id", "table_id", "data", "prior_data", "change_kind",
      "changed_at",
    ],
    why:
      "Anon-readable by the policy `udt_row_versions_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workbench.udt_datasets",
    columns: [
      "id", "table_name", "description", "is_public", "created_at", "updated_at",
      "row_ordering_config", "project_id", "task_id", "workbook_id", "sheet_index", "validation_mode",
      "template_id", "template_version", "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workbench.udt_document_snapshots",
    columns: [
      "id", "document_id", "snapshot", "label", "origin", "created_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workbench.udt_documents",
    columns: [
      "id", "document_name", "description", "source", "original_file_id", "project_id",
      "task_id", "is_public", "created_at", "updated_at", "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workbench.udt_structured_lists",
    columns: [
      "id", "created_at", "updated_at", "list_name", "description", "is_public",
      "public_read", "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workbench.udt_workbooks",
    columns: [
      "id", "workbook_name", "description", "source", "original_file_id", "project_id",
      "task_id", "is_public", "created_at", "updated_at", "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workbench.working_documents",
    columns: [
      "id", "title", "content", "created_at", "updated_at", "kind",
      "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workflow.card",
    columns: [
      "id", "name", "description", "category", "tags", "variables",
      "step_count", "is_active", "created_at", "updated_at", "card_visibility",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "workflow.comparison",
    columns: [
      "id", "title", "status", "request", "shared_inputs", "arms",
      "verdict_winner", "verdict_notes", "verdict_at", "metrics", "error", "completed_at",
      "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workflow.definition",
    columns: [
      "id", "name", "description", "nodes", "edges", "viewport",
      "channels", "strict_channels", "entry_nodes", "is_active", "is_archived", "is_favorite",
      "tags", "category", "project_id", "task_id", "source_definition_id", "source_snapshot_at",
      "created_at", "updated_at", "max_concurrent_runs", "visibility", "deleted_at", "variables",
      "updated_by_tier", "updated_by_system", "engram_state", "confirmed_success_count", "promotion_threshold_k", "grounding_score",
      "compiled_at", "demoted_at", "demotion_reason", "engram_version_tags", "engram_counter_since", "card_visibility",
      "input_kind", "output_kind",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workflow.run",
    columns: [
      "id", "thread_id", "parent_run_id", "definition_id", "definition_version_id", "definition_hash",
      "status", "input", "output", "error", "interrupt_payload", "steps_executed",
      "last_checkpoint_id", "project_id", "task_id", "conversation_id", "agent_id", "agent_version_id",
      "created_at", "started_at", "completed_at", "max_recovery_retries", "recovery_retry_count", "event_seq",
      "visibility", "deleted_at", "updated_at", "request_attribution_complete",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workflow.runtime_surface",
    columns: [
      "id", "definition_id", "name", "audience", "profile", "is_default",
      "schema_version", "config", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workflow.template",
    columns: [
      "id", "name", "description", "category", "definition", "preview_image_url",
      "popularity", "is_published", "created_at", "updated_at", "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workflow.trigger",
    columns: [
      "id", "definition_id", "definition_version_id", "name", "description", "kind",
      "cron_expression", "timezone", "webhook_secret", "default_inputs", "max_steps", "is_active",
      "last_fired_at", "last_run_id", "next_run_at", "fire_count", "project_id", "task_id",
      "created_at", "updated_at", "visibility", "deleted_at", "callback_url", "event_source",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workflow.trigger_event",
    columns: [
      "id", "trigger_id", "entity_key", "payload", "status", "claim_at",
      "claimed_at", "attempts", "max_attempts", "run_id", "last_error", "created_at",
      "updated_at",
    ],
    why:
      "Anon-readable by the policy `wf_trigger_event_parent_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workflow.v_definition_catalog",
    columns: [
      "id", "name", "description", "category", "tags", "is_favorite",
      "is_active", "is_archived", "visibility", "created_at", "updated_at", "engram_state",
      "step_count", "last_run_id", "last_run_status", "last_run_at", "run_count",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "workflow.v_engram_confirmed_run",
    columns: [
      "run_id", "definition_id", "definition_hash", "completed_at",
    ],
    why:
      "A view anon can address with no RLS policy of its own; zero rows reach a signed-out "
      + "visitor today and no signed-out reader was found in the four-repository census. Bounded at "
      + "the column (DD-186) so a column added tomorrow is closed by default.",
  },
  {
    relation: "workflow.work_item",
    columns: [
      "id", "run_id", "set_name", "seq", "canonical_key", "payload",
      "state", "attempts", "max_attempts", "wave", "discovered_by", "claim_holder",
      "claimed_at", "lease_expires_at", "error", "created_at", "completed_at",
    ],
    why:
      "Anon-readable by the policy `wf_work_item_parent_select`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workspace.projects",
    columns: [
      "id", "name", "description", "created_at", "updated_at", "slug",
      "settings", "status", "priority", "start_date", "target_date", "deleted_at",
      "visibility",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workspace.tasks",
    columns: [
      "id", "title", "description", "project_id", "status", "due_date",
      "created_at", "updated_at", "parent_task_id", "priority", "assignee_id", "settings",
      "visibility", "deleted_at", "completed_at", "origin", "source_type", "source_id",
      "source_url", "source_label", "dedupe_key", "start_date", "due_time", "timezone",
      "recurrence_rule", "reminders",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workspace.threads",
    columns: [
      "id", "active_tab", "position", "title", "created_at", "updated_at",
      "anchor_type", "anchor_id", "visibility", "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
  {
    relation: "workspace.war_rooms",
    columns: [
      "id", "title", "description", "icon", "color", "active_thread_id",
      "last_opened_at", "created_at", "updated_at", "anchor_type", "anchor_id", "visibility",
      "deleted_at",
    ],
    why:
      "Anon-readable by the policy `pub_read`; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). No signed-out reader was found for it in the four-repository "
      + "census — the bound is what keeps a column added tomorrow from publishing itself.",
  },
];

export interface LiveAnonColumn {
  relation: string;
  column: string;
}

/**
 * Every (relation, column) a signed-out visitor can actually SELECT: the
 * relation is reachable (schema USAGE), has a permissive SELECT-capable policy
 * naming `anon` or PUBLIC, and `anon` holds the column privilege. Restricted to
 * the relations declared above — this arm reports on decisions somebody made,
 * not on the whole database (see the scope note).
 */
/**
 * The PostgREST-exposed schemas — the server's own list, taken verbatim from the
 * error it returns for a schema it refuses ("Only the following schemas are
 * exposed: ..."). A relation outside these cannot be addressed by any
 * publishable key; see the SCOPE note above for the 13 that fall outside.
 */
export const POSTGREST_EXPOSED_SCHEMAS = [
  "api", "public", "graphql_public", "rag", "scraper", "workflow", "files", "legal",
  "knowledge", "agent", "ai", "app", "chat", "context", "skill", "tool", "workspace",
  "work", "admin", "billing", "browser", "canvas", "code", "communication", "content_ir",
  "crm", "dictionary", "docproc", "education", "extend", "graveyard", "growth", "hindsight",
  "history", "iam", "interview", "marketing", "meta", "ops", "pdf", "plan", "platform",
  "podcast", "research", "runtime", "scheduler", "seo", "transcripts", "ui", "users",
  "web", "workbench", "assignment", "audit", "batch", "mandate", "commerce",
] as const;

/**
 * EVERY (relation, column) a signed-out visitor can actually SELECT: the schema
 * is one PostgREST exposes, `anon` holds USAGE on it, and `anon` holds the
 * column privilege. Deliberately NOT restricted to the declared relations — a
 * relation that shows up here and is not in the register IS the finding.
 *
 * There is no policy condition. There used to be, to keep the noise down while
 * only two relations were declared; it would now HIDE the exact thing this arm
 * exists to catch — a grant standing on a relation whose policy is closed today
 * and reopens tomorrow, and an RLS-bypassing view, which has no policy at all.
 */
export const ANON_COLUMN_SURFACE_QUERY = `
  select n.nspname || '.' || c.relname as relation,
         a.attname as column
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where c.relkind in ('r','p','v','m','f')
    and n.nspname = any($1::text[])
    and has_schema_privilege('anon', n.nspname, 'USAGE')
    and has_column_privilege('anon', c.oid, a.attnum, 'SELECT')
  order by 1, 2
`;

export interface ColumnSurfaceDrift {
  relation: string;
  /** Anon can read these and nobody declared them. */
  extra: string[];
  /** Declared but anon cannot read them — a client is about to get a 42501. */
  missing: string[];
  /** The relation itself is not in the register at all. */
  undeclared?: boolean;
}

export function classifyAnonColumns(live: LiveAnonColumn[]): ColumnSurfaceDrift[] {
  const byRelation = new Map<string, Set<string>>();
  for (const l of live) {
    if (!byRelation.has(l.relation)) byRelation.set(l.relation, new Set());
    byRelation.get(l.relation)!.add(l.column);
  }
  const drift: ColumnSurfaceDrift[] = [];
  const declared = new Set(ANON_COLUMN_SURFACE.map((d) => d.relation));
  for (const d of ANON_COLUMN_SURFACE) {
    const actual = byRelation.get(d.relation) ?? new Set<string>();
    const want = new Set(d.columns);
    const extra = [...actual].filter((c) => !want.has(c)).sort();
    const missing = [...want].filter((c) => !actual.has(c)).sort();
    if (extra.length || missing.length) drift.push({ relation: d.relation, extra, missing });
  }
  // A relation nobody declared is the loudest of the three findings: somebody
  // granted `anon` SELECT on something and no register row says why.
  for (const [relation, cols] of byRelation) {
    if (declared.has(relation)) continue;
    drift.push({ relation, extra: [...cols].sort(), missing: [], undeclared: true });
  }
  return drift;
}

/* ===============================================================================
 * THE ANON WRITE SURFACE (DD-193) - what a signed-out caller may CHANGE.
 *
 * DD-186 decided which COLUMNS a signed-out visitor may read. This is the other
 * axis, and its answer is shorter: an anonymous caller writes ONLY through a
 * declared SECURITY DEFINER door - `record_guest_execution`, `outreach_unsubscribe`,
 * `log_client_error`, `meet_record_consent`, the eight `hr_kiosk_*` functions - every
 * one of which is a row in `platform.client_callable_door` with a recorded gate.
 * NEVER through a table privilege. There is no allowlist of blanket anon INSERT /
 * UPDATE / DELETE grants here, because the correct number of them is zero and an
 * allowlist is how it stops being zero.
 *
 * Measured before this register existed (2026-09-13): 286 relations in a
 * PostgREST-exposed schema granted `anon` a write privilege, seven schemas granted
 * it on every table created in them from then on, and `iam.organizations` carried
 * two write policies written `TO PUBLIC`.
 * =============================================================================== */

/** Schemas whose grants Supabase maintains, not us. */
export const VENDOR_MANAGED_SCHEMAS = [
  "graphql", "graphql_public", "storage", "realtime", "net", "cron", "extensions",
] as const;

export interface PublicWritePolicyOfRecord {
  /** `schema.relation` the policy sits on. */
  relation: string;
  /** The policy's exact name. */
  policy: string;
  /** `pg_policy.polcmd`: a = INSERT, w = UPDATE, d = DELETE, * = ALL. */
  cmd: string;
  /** WHO this policy is really for, and the predicate that says so. */
  reason: string;
}

/**
 * Write-capable RLS policies that are written `TO PUBLIC` - i.e. to every role,
 * `anon` included - and are KNOWN to be identity-gated, each triaged by reading its
 * predicate on 2026-09-13. Every one requires `is_platform_admin()`, `auth.role() =
 * 'service_role'`, or `auth.uid()` matching an owner; `auth.uid()` is null for a
 * signed-out caller, so none of them can ever admit one.
 *
 * They are recorded rather than rewritten because the thing that made them dangerous
 * was the PAIR - a `TO PUBLIC` write policy standing beside an anon table grant - and
 * DD-193 removed the grants. `iam.organizations` was the exception: its two were
 * rescoped to `authenticated` through DD-147's supersede path, because that table's
 * policy set already named the role on its other four policies and the two odd ones
 * out were plainly an oversight.
 *
 * A write policy reaching PUBLIC or `anon` that is NOT in this list is a finding: say
 * who it is for and why a null `auth.uid()` cannot satisfy it, or scope it to a role.
 */
export const PUBLIC_WRITE_POLICIES_OF_RECORD: ReadonlyArray<PublicWritePolicyOfRecord> = [
  { relation: "admin.admin_markdown_samples", policy: "admin_markdown_samples_super_admin_all", cmd: "*", reason: "A platform-admin-only sample store. Predicate: is_platform_admin() or is_super_admin() - both null-uid false." },
  { relation: "communication.sms_rate_limits", policy: "Service role only", cmd: "*", reason: "Service-role bookkeeping. Predicate: is_platform_admin() or auth.role() = service_role." },
  { relation: "communication.sms_webhook_logs", policy: "Service role only for webhook logs", cmd: "*", reason: "Service-role webhook log. Predicate: is_platform_admin() or auth.role() = service_role." },
  { relation: "context.scope_dataset_instances", policy: "scope_dataset_instances_internal_only", cmd: "*", reason: "Platform-internal dataset instances. Predicate: is_platform_admin()." },
  { relation: "docproc.page_extraction_results", policy: "page_extraction_results_owner_write", cmd: "*", reason: "Owner of the parent extraction job. Predicate: is_platform_admin() or the job owner_id = auth.uid()." },
  { relation: "docproc.page_extraction_runs", policy: "page_extraction_runs_owner_write", cmd: "*", reason: "Owner of the parent extraction job. Predicate: is_platform_admin() or the job owner_id = auth.uid()." },
  { relation: "extend.wbx_demo", policy: "wbx_demo_owner_delete", cmd: "d", reason: "Row owner. Predicate: is_platform_admin() or created_by = auth.uid(). (Defect D257 tracks this table separately.)" },
  { relation: "extend.wbx_demo", policy: "wbx_demo_owner_insert", cmd: "a", reason: "Row owner. Predicate: is_platform_admin() or created_by = auth.uid(). (Defect D257 tracks this table separately.)" },
  { relation: "extend.wbx_demo", policy: "wbx_demo_owner_update", cmd: "w", reason: "Row owner. Predicate: is_platform_admin() or created_by = auth.uid(). (Defect D257 tracks this table separately.)" },
  { relation: "extend.wbx_guidance", policy: "wbx_guidance_owner_delete", cmd: "d", reason: "Row owner. Predicate: is_platform_admin() or created_by = auth.uid()." },
  { relation: "extend.wbx_guidance", policy: "wbx_guidance_owner_insert", cmd: "a", reason: "Row owner. Predicate: is_platform_admin() or created_by = auth.uid()." },
  { relation: "extend.wbx_guidance", policy: "wbx_guidance_owner_update", cmd: "w", reason: "Row owner. Predicate: is_platform_admin() or created_by = auth.uid()." },
  { relation: "files.analysis", policy: "file_analysis_insert", cmd: "a", reason: "File-analysis owner. Predicate: is_platform_admin() or owner_id = auth.uid()." },
  { relation: "files.analysis", policy: "file_analysis_update", cmd: "w", reason: "File-analysis owner. Predicate: is_platform_admin() or owner_id = auth.uid()." },
  { relation: "files.analysis_result", policy: "file_analysis_result_insert", cmd: "a", reason: "Owner of the parent file. Predicate: is_platform_admin() or files.files.created_by = auth.uid()." },
  { relation: "files.webhooks", policy: "cld_webhooks_owner_all", cmd: "*", reason: "Webhook owner. Predicate: is_platform_admin() or owner_id = auth.uid()." },
  { relation: "pdf.pdf_redaction_key_escrow", policy: "pdf_redaction_key_escrow_insert", cmd: "a", reason: "Escrow owner. Predicate: is_platform_admin() or owner_id = auth.uid()." },
  { relation: "pdf.pdf_redaction_key_escrow", policy: "pdf_redaction_key_escrow_update", cmd: "w", reason: "Escrow owner. Predicate: is_platform_admin() or owner_id = auth.uid()." },
  { relation: "rag.data_store_members", policy: "data_store_members_via_store_all", cmd: "*", reason: "Creator or org member of the parent data store. Predicate: is_platform_admin() or data_stores.created_by = auth.uid() or is_member_of_organization(...)." },
  { relation: "users.feedback_comments", policy: "Users can comment on own feedback", cmd: "a", reason: "Author of the parent feedback row. Predicate: is_platform_admin() or feedback_id in (the caller own user_feedback)." },
  { relation: "users.user_analysis_preferences", policy: "user_analysis_preferences_delete", cmd: "d", reason: "The user themselves. Predicate: is_platform_admin() or user_id = auth.uid()." },
  { relation: "users.user_analysis_preferences", policy: "user_analysis_preferences_insert", cmd: "a", reason: "The user themselves. Predicate: is_platform_admin() or user_id = auth.uid()." },
  { relation: "users.user_analysis_preferences", policy: "user_analysis_preferences_update", cmd: "w", reason: "The user themselves. Predicate: is_platform_admin() or user_id = auth.uid()." },
  { relation: "users.user_follows", policy: "Users can follow others", cmd: "a", reason: "The follower themselves. Predicate: is_platform_admin() or auth.uid() = follower_id." },
  { relation: "users.user_follows", policy: "Users can unfollow", cmd: "d", reason: "The follower themselves. Predicate: is_platform_admin() or auth.uid() = follower_id." },
  { relation: "users.user_form_profile", policy: "user_form_profile_delete", cmd: "d", reason: "The user themselves. Predicate: is_platform_admin() or user_id = auth.uid()." },
  { relation: "users.user_form_profile", policy: "user_form_profile_insert", cmd: "a", reason: "The user themselves. Predicate: is_platform_admin() or user_id = auth.uid()." },
  { relation: "users.user_form_profile", policy: "user_form_profile_update", cmd: "w", reason: "The user themselves. Predicate: is_platform_admin() or user_id = auth.uid()." },
  { relation: "users.user_secrets", policy: "Users manage own secrets", cmd: "*", reason: "The user themselves. Predicate: auth.uid() = user_id." },
  { relation: "workbench.udt_document_snapshots", policy: "udt_document_snapshots_insert", cmd: "a", reason: "Creator or editor of the parent document. Predicate: is_platform_admin() or udt_documents.created_by = auth.uid() or iam.has_access(editor)." },
  { relation: "workbench.udt_workbook_snapshots", policy: "udt_workbook_snapshots_insert", cmd: "a", reason: "Creator or editor of the parent workbook. Predicate: is_platform_admin() or udt_workbooks.created_by = auth.uid() or iam.has_access(editor)." },];

export interface AnonWriteFinding {
  /** Which arm found it - the five questions this surface is made of. */
  arm: "relation" | "sequence" | "default" | "policy" | "door";
  /** The object: `schema.relation`, `schema.sequence`, a default-privilege entry, `relation :: policy`, or `schema.function`. */
  object: string;
  /** What is live and wrong, in one sentence. */
  detail: string;
  /** What to do about it, naming the real command or the real register. */
  remedy: string;
}

/**
 * ARM 1 - every relation in a PostgREST-exposed schema on which `anon` or PUBLIC holds
 * INSERT, UPDATE, DELETE or MAINTAIN. MAINTAIN is in the list because PostgreSQL 17
 * folded REFRESH MATERIALIZED VIEW into it, and a historical `grant all ... to anon`
 * hands it out with the rest.
 */
export const ANON_WRITE_RELATION_QUERY = `
  select n.nspname || '.' || c.relname as object,
         case when a.grantee = 0 then 'PUBLIC' else 'anon' end as grantee,
         string_agg(distinct a.privilege_type, ', ' order by a.privilege_type) as privileges
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where c.relkind in ('r','p','v','m','f')
    and a.privilege_type in ('INSERT','UPDATE','DELETE','MAINTAIN')
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) = 'anon')
    and n.nspname = any($1::text[])
  group by 1, 2
  order by 1
`;

/** ARM 2 - UPDATE or USAGE on a sequence is `nextval`/`setval`: a write. */
export const ANON_WRITE_SEQUENCE_QUERY = `
  select n.nspname || '.' || c.relname as object,
         string_agg(distinct a.privilege_type, ', ' order by a.privilege_type) as privileges
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where c.relkind = 'S'
    and pg_get_userbyid(a.grantee) = 'anon'
    and a.privilege_type in ('UPDATE','USAGE')
    and not (n.nspname = any($1::text[]))
  group by 1
  order by 1
`;

/**
 * ARM 3 - the default privileges, which is where this surface came from and where it
 * would silently come back. A default ACL granting `anon` a write means the NEXT
 * `create table` in that schema re-opens the door with nobody deciding anything.
 */
export const ANON_WRITE_DEFAULT_QUERY = `
  select coalesce(n.nspname, '(all schemas)') || ' (' ||
         case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' else d.defaclobjtype::text end ||
         ', granted by ' || pg_get_userbyid(d.defaclrole) || ')' as object,
         string_agg(distinct a.privilege_type, ', ' order by a.privilege_type) as privileges
  from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclobjtype in ('r','S')
    and pg_get_userbyid(a.grantee) = 'anon'
    and a.privilege_type in ('INSERT','UPDATE','DELETE','MAINTAIN','USAGE')
    and not (coalesce(n.nspname, '') = any($1::text[]))
  group by 1
  order by 1
`;

/** ARM 4 - every write-capable policy that reaches PUBLIC or `anon`. */
export const ANON_WRITE_POLICY_QUERY = `
  select n.nspname || '.' || c.relname as relation,
         p.polname as policy,
         p.polcmd::text as cmd,
         case when 0 = any(p.polroles) then 'PUBLIC'
              else array_to_string(array(select rolname from pg_roles where oid = any(p.polroles)), ',') end as roles
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where p.polcmd::text in ('a','w','d','*')
    and (0 = any(p.polroles) or (select oid from pg_roles where rolname = 'anon') = any(p.polroles))
    and n.nspname = any($1::text[])
  order by 1, 2
`;

/**
 * ARM 5 - the doors themselves. A SECURITY DEFINER function a signed-out caller can
 * EXECUTE, whose body writes, is the ONLY legitimate anonymous write path - and it is
 * only legitimate when `platform.client_callable_door` records it with its gate. A
 * door with no row is a write nobody declared, which is the same defect as a table
 * grant wearing a different hat.
 */
export const ANON_WRITE_DOOR_QUERY = `
  select n.nspname || '.' || p.proname as object,
         (select count(*) from platform.client_callable_door d
           where d.schema_name = n.nspname and d.function_name = p.proname)::int as door_rows
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and p.prorettype <> 'trigger'::regtype::oid
    and exists (select 1 from aclexplode(p.proacl) a
                 where a.privilege_type = 'EXECUTE' and pg_get_userbyid(a.grantee) = 'anon')
    and p.prosrc ~* '(^|[^a-z_.])(insert into|update |delete from|merge into)'
    and not (n.nspname = any($1::text[]))
  order by 1
`;

export interface LiveAnonWrite {
  relations: Array<{ object: string; privileges: string; grantee: string }>;
  sequences: Array<{ object: string; privileges: string }>;
  defaults: Array<{ object: string; privileges: string }>;
  policies: Array<{ relation: string; policy: string; cmd: string; roles: string }>;
  doors: Array<{ object: string; door_rows: number }>;
}

const policyKey = (relation: string, policy: string) => `${relation} ${policy}`;

/**
 * The whole comparison, in one place so the guard and its self-test cannot disagree.
 * Every finding carries the command that fixes it - a refusal that does not say what
 * to do is the same defect this register exists to end.
 */
export function classifyAnonWrites(live: LiveAnonWrite): AnonWriteFinding[] {
  const findings: AnonWriteFinding[] = [];

  for (const r of live.relations) {
    findings.push({
      arm: "relation",
      object: r.object,
      detail: `${r.grantee} holds ${r.privileges} on it.`,
      remedy:
        `revoke insert, update, delete, maintain on ${r.object} from ${r.grantee === "PUBLIC" ? "public" : "anon"};  ` +
        `If a signed-out caller genuinely must write here, the write goes through a SECURITY DEFINER door ` +
        `recorded in platform.client_callable_door (the record_guest_execution pattern) - never a table grant.`,
    });
  }

  for (const s of live.sequences) {
    findings.push({
      arm: "sequence",
      object: s.object,
      detail: `anon holds ${s.privileges} on this sequence, which is nextval/setval - a write.`,
      remedy: `revoke update, usage on sequence ${s.object} from anon;`,
    });
  }

  for (const d of live.defaults) {
    findings.push({
      arm: "default",
      object: d.object,
      detail: `default privileges grant anon ${d.privileges} on every object created here from now on.`,
      remedy:
        `alter default privileges for role postgres in schema <schema> revoke insert, update, delete, maintain on tables from anon;  ` +
        `This is how the anon write surface re-opens with nobody deciding anything (DD-193).`,
    });
  }

  const declaredPolicies = new Set(PUBLIC_WRITE_POLICIES_OF_RECORD.map((p) => policyKey(p.relation, p.policy)));
  const livePolicies = new Set(live.policies.map((p) => policyKey(p.relation, p.policy)));
  for (const p of live.policies) {
    if (declaredPolicies.has(policyKey(p.relation, p.policy))) continue;
    findings.push({
      arm: "policy",
      object: `${p.relation} :: ${p.policy}`,
      detail: `a write-capable policy (polcmd '${p.cmd}') reaches ${p.roles} - every role on this database, anon included - and nothing declares it.`,
      remedy:
        `Scope it to the role that uses it (create policy ... to authenticated) through iam.supersede_bespoke_policies, ` +
        `or add it to PUBLIC_WRITE_POLICIES_OF_RECORD in lib/security/public-exposure.ts saying who it is for and why a null auth.uid() cannot satisfy it.`,
    });
  }
  for (const p of PUBLIC_WRITE_POLICIES_OF_RECORD) {
    if (livePolicies.has(policyKey(p.relation, p.policy))) continue;
    findings.push({
      arm: "policy",
      object: `${p.relation} :: ${p.policy}`,
      detail: "the register declares this PUBLIC write policy and it is not on the database.",
      remedy:
        `Delete the row from PUBLIC_WRITE_POLICIES_OF_RECORD in lib/security/public-exposure.ts. ` +
        `The register must not describe a database that no longer exists - a stale row is how the next reader mistakes a closed door for an open one.`,
    });
  }

  for (const d of live.doors) {
    if (d.door_rows > 0) continue;
    findings.push({
      arm: "door",
      object: d.object,
      detail: "a SECURITY DEFINER function anon can EXECUTE writes to the database, and platform.client_callable_door has no row for it.",
      remedy:
        `Declare it: insert the door row with its gate_predicate and reason, the way DD-169 declared the others. ` +
        `If no signed-out caller needs it, revoke execute on the function from anon instead.`,
    });
  }

  return findings;
}
