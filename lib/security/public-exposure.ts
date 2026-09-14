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
  { relation: "extend.wbx_recipe", policy: "pub_read", cmd: "SELECT", why: "browser-automation recipe catalogue; no credentials — discloses which sites/routes we automate, accepted. DD-173 (B-103): the hand-written `wbx_recipe_read_all` (USING true) was superseded by the generated system-variant lane, which publishes only rows whose `visibility` is `public` — derived from `is_active`, so a retired recipe leaves the open web by the flag that already means that." },

  // — Anonymous WRITES: none. All three are closed (DD-181a, 2026-09-13,
  //   migrations/dd181_dd182_recorded_doors_bounded_or_closed.sql). `communication.emails`
  //   never had a writer — the public contact form writes `communication.contact_submissions`
  //   as the service role behind a per-IP rate limit — and the guest flow's real signed-out
  //   writer is `public.record_guest_execution`, a SECURITY DEFINER function owned by the
  //   tables' owner, which never consulted their RLS. A row returns here only with a caller. —

  // — DD-226, 2026-09-14: four rows left this list because the exposures they described stopped
  //   existing. `crm.jurisdiction_policy`, `education.content_certification`,
  //   `education.math_course_structure` and `users.user_follows` each had a SELECT policy reaching
  //   anon AND an anon column grant; the grant is revoked, so the policy now grants nothing and the
  //   relation is no longer client-reachable. The prose on two of them was also simply wrong:
  //   `users.user_follows` claimed "public on creator profiles (/c/{handle})" while that page reads
  //   the SECURITY DEFINER RPC `creator_public_page` and never touches the table, and
  //   `education.math_course_structure` claimed a public curriculum outline no signed-out route
  //   renders. A row here is a declaration of intent, never evidence that a reader exists. —

  // — KNOWN WRONG, tracked. These warn until fixed, then get deleted from here. —
  // (Empty. D257 — `extend.wbx_demo`'s `wbx_demo_svc`, named for the service role but created
  //  TO PUBLIC with USING (true) WITH CHECK (true) on a PostgREST-exposed schema — was closed on
  //  2026-09-14 by migrations/extend_wbx_demo_uuid_identity_dd173.sql, which superseded it for the
  //  generated entity set: `svc_all` TO service_role plus the generated owner lane. Proven in the
  //  same transaction: the owner still writes and reads their own demo, a different non-admin
  //  reads nothing, anonymous reads nothing.)
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
  // ══ DD-226, 2026-09-14 — A DECLARED "NO SIGNED-OUT READER" MEANS ZERO ANON COLUMNS ═══════════
  //
  // DD-186 declared the whole signed-out surface and bounded each relation's columns. On 175 of
  // those relations it wrote the reason "No signed-out reader was found for it in the four-
  // repository census — the bound is what keeps a column added tomorrow from publishing itself",
  // and then left the columns granted. DD-222 (B-113) settled what that reason implies: the bound
  // of a signed-out surface is the set of columns that surface RENDERS, so where there is no
  // signed-out surface the bound is the EMPTY list. A relation cannot simultaneously declare that
  // nobody signed-out reads it and publish its columns to `anon`; the grant is the half that is
  // wrong.
  //
  // 121 relations across 23 schemas were revoked to ZERO on that test
  // (migrations/dd226_<schema>_publishes_nothing_to_a_signed_out_reader.sql, one file per schema,
  // each asserting anon reaches 0 columns and `authenticated`'s count is unchanged). They are gone
  // from this list rather than left with an empty `columns` array — an absent relation is the
  // guard's own RED for a re-grant: `check:anon-column-surface` fails on an UNDECLARED relation.
  // Re-granting any of them is a publishing decision that needs its own register row.
  //
  // 🚨 THE REASON TEXT WAS NOT EVIDENCE, AND THAT IS THE CLASS FINDING. DD-186 pasted the same
  // "no signed-out reader was found" sentence onto relations whose PUBLIC_EXPOSURE_ALLOWED row a
  // few hundred lines above says the opposite in the same file — `billing.price` ("public pricing
  // page renders prices before sign-in"), `iam.industries` ("the sign-up form, before an account
  // exists"), `ui.ui_surface` ("the shell renders public routes before sign-in"), `tool.executor`
  // ("public tool catalogue"), `users.user_follows` ("public on creator profiles"). So this lane
  // re-ran the census per relation instead of trusting the sentence, and the readers it found are
  // NAMED on the rows that stayed. Never read a `why` here as a measurement.
  //
  // KEPT, with a real signed-out reader named and replayable:
  //   workbench.heatmap_saves        /free/zip-code-heatmap/[id] — an app/(public) route that reads
  //                                  the table directly with the SSR client.
  //   canvas.shared_canvas_items     /canvas/discover and /canvas/shared/[token], both app/(public).
  //   ai.model_definition, ai.provider   GET /api/ai-models — an UNAUTHENTICATED route that builds
  //                                  its client with getScriptSupabaseClient() (publishable key), so
  //                                  it runs as `anon`, and CDN-caches the answer.
  //   education.learn_doc            the published learn-doc list, same publishable-key client.
  //   platform.categories            lib/services/agent-apps-admin-service.ts, same client.
  //   podcast.pc_shows / pc_episodes / pc_articles
  //                                  /podcast/[slug]/feed.xml and chapters.json are podcast feeds —
  //                                  a podcast client fetches them with no account — and
  //                                  /podcast/[slug]/blog renders public articles.
  //   agent.message_template         /p/e/message_template, bounded to the exact eight columns
  //                                  PUBLIC_LANE_COLUMNS names (DD-226 revoked the ninth).
  //   app.definition, tool.definition, public.app_config, public.catalog_entries, workbench.notes,
  //   ai.model_public, ai.model_offering, billing.plan, canvas.canvas_items, extend.wbx_recipe —
  //                                  DD-186's own named readers, unchanged.
  //
  // NAMED, NOT SWEPT — 46 relations in the catalogue-shaped schemas `ai`, `billing`, `content_ir`,
  // `extend`, `iam`, `platform`, `tool`, `ui` still carry the same unevidenced reason. They are last
  // on purpose (they hold reference rows, not people's content) AND they are the ones whose readers
  // are hardest to name: app/(core) is NOT auth-gated — its layout renders a guest shell — so the
  // shell's own catalogue reads (features/surfaces/services/*, lib/knobs/featureKnobs.ts,
  // features/tool-registry/**) may genuinely execute as `anon` on a signed-out visit, and revoking
  // them blind would 42501 a guest's first paint. Each needs its request replayed with no JWT before
  // it is closed or bounded. That is DD-226's remaining half, not a decision already taken.
  // (Schema `agent` held SEVEN declared anon bounds until 2026-09-14. FIVE of them —
  //  `cmp_comparison_sets`, `cmp_response_feedback`, `definition`, `shortcut`, `template` — were
  //  revoked to ZERO by DD-222's sibling sweep
  //  (`migrations/dd222b_the_agent_schema_publishes_only_what_a_reader_renders.sql`), on the same
  //  test the base table below was closed on: the bound of a signed-out surface is the columns that
  //  surface renders, and two independent four-repository censuses find no signed-out surface for
  //  any of the five. Two were not latent — measured over HTTPS with no JWT that morning,
  //  `agent.template` served NINE public rows including a full `messages` system prompt ("You are a
  //  high school AP World History Expert…") and `agent.shortcut` served THIRTY including
  //  `pre_execution_message`; `definition` (`messages`), `cmp_response_feedback` (`comment`) and
  //  `cmp_comparison_sets` had the grant open with zero public rows behind it. The anonymous share
  //  link never depended on any of it: `/s/<token>` resolves through the SECURITY DEFINER
  //  `public.resolve_share_token`, which returns the content itself. `agent.message_template` below
  //  keeps its bound — it is the one relation in this schema with a real signed-out reader, and its
  //  9 columns are exactly what `/p/e/message_template/<id>` renders.)
  // (`agent.mandate_exemplar` — the rename alias over the table below — carried this same
  //  22-column anon grant and its own declaration here until 2026-09-14. A "sync live share and
  //  exposure registries" sweep (cced6b5893) DELETED the declaration and left the grant live, and
  //  the guard sat red for a day because nothing ran it. DD-218 revoked anon on the view outright
  //  (no signed-out reader in any of the four repositories, and a temporary alias is never a public
  //  door) and wired this guard into scripts/run-release-gates.sh. Do not re-grant it.)
  //
  // (`agent.exemplar` — the base TABLE — carried a 22-column anon bound here until 2026-09-14,
  //  `user_input`, `variables`, `reference_output` and `reference_artifact` among them: what a
  //  human typed and what it produced. DD-222 revoked it to ZERO
  //  (`migrations/dd222_exemplar_is_closed_to_the_signed_out_reader.sql`). The bound of a
  //  signed-out surface is the columns that surface renders, and the four-repository census finds
  //  no signed-out surface at all — every reader is the browser SESSION client behind the agent
  //  builder (`features/agents/samples/service.ts`) or the mandate bench
  //  (`features/mandates/admin/service.ts`), or the service role
  //  (`scripts/backfill-agent-exemplar-input-content.ts`), and `PUBLIC_LANE_COLUMNS` in
  //  `utils/permissions/publicLane.ts` declares no exemplar type, so `/p/e/exemplar/<id>` does not
  //  exist. Measured before the revoke: an anonymous HTTPS read of `select=id,variables,user_input`
  //  answered 200 (the empty array was the ROW gate — 0 of 876 exemplars are `public` — never the
  //  column gate), and with ONE exemplar flipped to `public` inside a rolled-back transaction,
  //  `anon` read its real `variables` payload. It answers 42501 now. A public exemplar surface is
  //  a publishing decision with its own register row; do not re-grant anon without one.)
  {
    relation: "agent.message_template",
    columns: [
      "id", "label", "content", "role", "created_at", "updated_at",
      "tags", "visibility",
    ],
    why:
      "The indexable public viewer /p/e/message_template reads a public template's display columns "
      + "(utils/permissions/publicLane.ts#PUBLIC_LANE_COLUMNS) — and this list is EXACTLY that one. "
      + "DD-226 (2026-09-14) revoked the ninth, `deleted_at`: the page does not render or filter it "
      + "(`pub_read` already excludes deleted rows), and under DD-222's rule a column the signed-out "
      + "surface does not render is an over-grant however harmless its values look. "
      + "migrations/dd226_agent_message_template_publishes_exactly_what_it_renders.sql",
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
      "id", "plan_key", "name", "audience", "tagline", "rank", "tier",
      "monthly_cents", "annual_cents", "per_seat", "min_seats", "badge", "is_public",
      "is_default", "active", "created_at", "updated_at",
    ],
    why:
      "Anon-readable by the generated `pub_read` lane (rows whose `visibility` is public, derived "
      + "from `active`); every identity, bookkeeping and secret column is revoked at the column "
      + "(DD-186). The guest price list itself renders through `billing.public_plans()`, a definer "
      + "door, not through this table read — the bound is what keeps a column added tomorrow from "
      + "publishing itself. DD-173 (B-103) moved the plan slug off `id` to `plan_key` and granted "
      + "the new uuid `id`, the column the access-delta probe reads to measure this door at all.",
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
      "id", "demo_key", "name", "description", "start_url", "step_count", "parameter_names",
      "body", "is_deleted", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "Column-bounded (DD-186): every identity, bookkeeping and secret column is revoked at the "
      + "column. No signed-out reader was found for it in the four-repository census — the bound is "
      + "what keeps a column added tomorrow from publishing itself. DD-173 (B-103) moved the client "
      + "`demo_<uuid>` pointer off `id` to `demo_key`, granted the new uuid `id` (the column the "
      + "access-delta probe reads to measure this door at all), and replaced the hand-written owner "
      + "policies with the generated entity set — which is what closed D257.",
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
      "id", "recipe_key", "label", "description", "hosts", "routes", "kind",
      "config", "yields_rows", "is_active", "last_verified_at", "created_at", "updated_at",
    ],
    why:
      "Anon-readable by the generated `pub_read` lane; every identity, bookkeeping and secret column is "
      + "revoked at the column (DD-186). THERE IS A REAL SIGNED-OUT READER: matrx-extend's "
      + "`loadRecipes()` (src/lib/data-pattern/recipes.ts) fetches this catalogue with whatever "
      + "session the extension has, including none. DD-173 (B-103) moved the slug off `id` to "
      + "`recipe_key` and granted the new uuid `id` — an opaque surrogate, and the column the "
      + "access-delta probe reads to measure this door at all.",
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
    relation: "workbench.notes",
    columns: [
      "id", "label", "content", "folder_name", "tags", "position",
      "created_at", "updated_at", "folder_id", "file_path", "content_hash", "sync_version",
      "last_device_id", "project_id", "task_id", "visibility", "deleted_at",
    ],
    why:
      "The indexable public viewer /p/e/note reads a public note's display columns (utils/permissions/publicLane.ts#PUBLIC_LANE_COLUMNS).",
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
  // (`extend.wbx_demo`'s three `wbx_demo_owner_*` TO-PUBLIC write policies were here until
  //  2026-09-14: DD-173 B-103 superseded them for the generated entity set, whose write lanes are
  //  all TO authenticated. A stale entry here is as much a lie as a missing one.)
  { relation: "admin.admin_markdown_samples", policy: "admin_markdown_samples_super_admin_all", cmd: "*", reason: "A platform-admin-only sample store. Predicate: is_platform_admin() or is_super_admin() - both null-uid false." },
  { relation: "communication.sms_rate_limits", policy: "Service role only", cmd: "*", reason: "Service-role bookkeeping. Predicate: is_platform_admin() or auth.role() = service_role." },
  { relation: "communication.sms_webhook_logs", policy: "Service role only for webhook logs", cmd: "*", reason: "Service-role webhook log. Predicate: is_platform_admin() or auth.role() = service_role." },
  { relation: "docproc.page_extraction_results", policy: "page_extraction_results_owner_write", cmd: "*", reason: "Owner of the parent extraction job. Predicate: is_platform_admin() or the job owner_id = auth.uid()." },
  { relation: "docproc.page_extraction_runs", policy: "page_extraction_runs_owner_write", cmd: "*", reason: "Owner of the parent extraction job. Predicate: is_platform_admin() or the job owner_id = auth.uid()." },
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
  arm: "relation" | "sequence" | "default" | "policy" | "door" | "birth";
  /** The object: `schema.relation`, `schema.sequence`, a default-privilege entry, `relation :: policy`, or `schema.function`. */
  object: string;
  /** What is live and wrong, in one sentence. */
  detail: string;
  /** What to do about it, naming the real command or the real register. */
  remedy: string;
}

/**
 * ARM 1 - every relation in a PostgREST-exposed schema on which `anon` or PUBLIC holds
 * INSERT, UPDATE, DELETE, MAINTAIN or REFERENCES. MAINTAIN is in the list because
 * PostgreSQL 17 folded REFRESH MATERIALIZED VIEW into it, and a historical
 * `grant all ... to anon` hands it out with the rest.
 *
 * TWO CATALOG SHAPES, because a privilege has two homes and reading one is reading
 * half. `pg_class.relacl` holds a table-level grant; `pg_attribute.attacl` holds a
 * per-column one, and **a table-level REVOKE does not remove a column grant**. The
 * first version of this arm read `relacl` alone and printed "a signed-out caller holds
 * no write privilege anywhere" while `anon` held INSERT and UPDATE on 32 columns of
 * `docproc.processed_documents` (found by V-56, 2026-09-13; proven with these shipped
 * bytes against a planted `grant insert (id, payload) ... to anon`, which returned zero
 * findings). Over HTTPS that table was the one place on the database where a signed-out
 * POST got PAST the privilege gate and was stopped only by RLS - the exact pair DD-193
 * exists to break. A guard that overstates its own scope is how the next column grant
 * goes unnoticed for a year.
 *
 * `shape` is carried through to the finding because the two need DIFFERENT remedies: a
 * `revoke ... on <table> from anon` is a silent no-op against a column grant.
 */
export const ANON_WRITE_RELATION_QUERY = `
  select object, grantee, shape, string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
  from (
    select n.nspname || '.' || c.relname as object,
           case when a.grantee = 0 then 'PUBLIC' else 'anon' end as grantee,
           'table' as shape,
           a.privilege_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
    where c.relkind in ('r','p','v','m','f')
      and a.privilege_type in ('INSERT','UPDATE','DELETE','MAINTAIN','REFERENCES')
      and (a.grantee = 0 or pg_get_userbyid(a.grantee) = 'anon')
      and n.nspname = any($1::text[])
    union all
    select n.nspname || '.' || c.relname as object,
           case when a.grantee = 0 then 'PUBLIC' else 'anon' end as grantee,
           'column' as shape,
           a.privilege_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped
    cross join lateral aclexplode(att.attacl) a
    where c.relkind in ('r','p','v','m','f')
      and a.privilege_type in ('INSERT','UPDATE','REFERENCES')
      and (a.grantee = 0 or pg_get_userbyid(a.grantee) = 'anon')
      and n.nspname = any($1::text[])
  ) t
  group by object, grantee, shape
  order by object, shape
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

/**
 * ARM 6 - THE READ HALF OF THE SAME DEFAULT PRIVILEGES (DD-196). Arm 3 asks whether
 * a table created tomorrow can be WRITTEN by a signed-out caller. This asks whether
 * it can be READ by one, which on 2026-09-13 it could: ten schemas -
 * `communication`, `crm`, `docproc`, `files`, `pdf`, `podcast`, `public`,
 * `scheduler`, `users`, `workflow` - granted `anon` SELECT on every table created in
 * them from then on, five of them on every sequence as well. Proven before DD-196
 * ran, in a rolled-back transaction: `create table communication.b89_probe (id int)`
 * -> `has_table_privilege('anon', ..., 'select')` TRUE, in all ten, with `agent` and
 * `seo` FALSE as the controls. `anon` holds USAGE on those schemas and PostgREST
 * publishes them, so the table was on the internet from the moment it existed -
 * before any policy was written, and whether or not anyone wrote one. A brand-new
 * table has RLS OFF until `iam.apply_rls` runs on it, so for that window the grant
 * IS the access decision.
 *
 * EVERY grantor is measured, not just `postgres`: default privileges are per-role,
 * so a second role that creates tables carries its own set. PUBLIC is measured
 * beside `anon` because PUBLIC reaches every role there is, and a role-name census
 * never sees it - exactly how DD-194's `pg_stat_statements` grant hid.
 *
 * Publishing a table to anonymous readers is a decision somebody makes: an explicit
 * `grant select (<columns>) ... to anon` plus a row in the DD-186 column register.
 */
export const ANON_SELECT_DEFAULT_QUERY = `
  select coalesce(n.nspname, '(all schemas)') || ' (' ||
         case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' else d.defaclobjtype::text end ||
         ', granted by ' || pg_get_userbyid(d.defaclrole) || ')' as object,
         case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee
  from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclobjtype in ('r','S')
    and a.privilege_type = 'SELECT'
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) = 'anon')
    and not (coalesce(n.nspname, '') = any($1::text[]))
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
  relations: Array<{ object: string; privileges: string; grantee: string; shape: "table" | "column" }>;
  sequences: Array<{ object: string; privileges: string }>;
  defaults: Array<{ object: string; privileges: string }>;
  selectDefaults: Array<{ object: string; grantee: string }>;
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
    const grantee = r.grantee === "PUBLIC" ? "public" : "anon";
    const doorLine =
      `If a signed-out caller genuinely must write here, the write goes through a SECURITY DEFINER door ` +
      `recorded in platform.client_callable_door (the record_guest_execution pattern) - never a table grant.`;
    findings.push({
      arm: "relation",
      object: r.object,
      detail:
        r.shape === "column"
          ? `${r.grantee} holds ${r.privileges} on it, granted PER COLUMN (pg_attribute.attacl).`
          : `${r.grantee} holds ${r.privileges} on it.`,
      remedy:
        r.shape === "column"
          ? `A column grant SURVIVES a table-level REVOKE - \`revoke insert, update on ${r.object} from ${grantee};\` ` +
            `would do nothing and read as a fix. Revoke each column by name: ` +
            `\`revoke ${r.privileges.toLowerCase()} (<column>) on ${r.object} from ${grantee};\` for every column in ` +
            `\`select attname from pg_attribute where attrelid = '${r.object}'::regclass and attacl::text like '%${grantee}=%'\`. ` +
            doorLine
          : `revoke insert, update, delete, maintain on ${r.object} from ${grantee};  ` + doorLine,
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

  for (const d of live.selectDefaults) {
    findings.push({
      arm: "birth",
      object: d.object,
      detail: `default privileges grant ${d.grantee} SELECT on every object created here from now on, so a table nobody has decided about is published to the internet the moment it exists (DD-196).`,
      remedy:
        `alter default privileges for role <grantor> in schema <schema> revoke select on tables from ${d.grantee === "PUBLIC" ? "public" : "anon"};  ` +
        `Publishing a relation to anonymous readers is a decision somebody makes: an explicit ` +
        `grant select (<columns>) on <relation> to anon plus a row in ANON_COLUMN_SURFACE saying why (DD-186).`,
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

/* ===============================================================================
 * DD-202 — A NEW FUNCTION IS CLOSED TO `anon` AT BIRTH.
 *
 * PostgreSQL hands every new function EXECUTE to PUBLIC, and PUBLIC reaches
 * `anon`. `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
 * does NOT take it back (measured three ways, 2026-09-13, B-94): the PUBLIC
 * item is the hard-wired default, not a default ACL, and a schema-scoped
 * default privilege merges on top of it. So the enforcement is an event
 * trigger — `close_new_functions_to_anon`, asserted bound + enabled +
 * SECURITY INVOKER by the EXPECTED list in scripts/check-db-guards.ts — and
 * these are the two standing facts that go with it.
 * =============================================================================== */

/**
 * The vendor-managed schemas inside POSTGREST_EXPOSED_SCHEMAS that the birth
 * guard leaves alone — the same boundary DD-193/DD-196 drew.
 */
export const FUNCTION_BIRTH_VENDOR_SCHEMAS = ["graphql_public"] as const;

/** What the DB's `platform.anon_function_birth_schemas()` must return. */
export const EXPECTED_FUNCTION_BIRTH_SCHEMAS: readonly string[] =
  POSTGREST_EXPOSED_SCHEMAS.filter(
    (s) => !(FUNCTION_BIRTH_VENDOR_SCHEMAS as readonly string[]).includes(s),
  );

export interface FunctionBirthFinding {
  kind: string;
  detail: string;
}

/**
 * Two things that must be true for the birth door to stay shut, beyond the
 * event trigger itself:
 *
 *  1. No FUNCTION default privilege — in any governed schema, under any
 *     grantor, plus the global (all-schemas) row — grants `anon` or PUBLIC
 *     EXECUTE. On its own that closes nothing (PUBLIC's EXECUTE is hard-wired);
 *     it exists so the DECLARED default stops promising a grant the guard takes
 *     back one statement later.
 *  2. `platform.anon_function_birth_grandfather` still refuses new rows. It is
 *     the snapshot of what was already open when DD-202 shipped, and it may
 *     only shrink — a writable one would become the place a new function hides.
 */
export const FUNCTION_BIRTH_GUARD_QUERY = `
  select 'anon_execute_default_privilege' as kind,
         coalesce(n.nspname, '<all schemas>') || ' (grantor ' || pg_get_userbyid(d.defaclrole) || ')' as detail
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
   where d.defaclobjtype = 'f'
     and (n.nspname is null or n.nspname = any (platform.anon_function_birth_schemas()))
     and exists (
       select 1 from unnest(d.defaclacl) a
        where (a::text like 'anon=%' or a::text like '=%') and a::text like '%X%')
  union all
  select 'grandfather_table_is_writable',
         'platform.anon_function_birth_grandfather has no BEFORE INSERT refusal trigger — it may only shrink'
   where not exists (
     select 1 from pg_trigger t
      where t.tgrelid = 'platform.anon_function_birth_grandfather'::regclass
        and t.tgname = 'anon_function_birth_grandfather_is_closed'
        and not t.tgisinternal)
  order by 1, 2
`;

/** The schema list the live guard governs, so drift from the TS list is a finding. */
export const FUNCTION_BIRTH_SCHEMAS_QUERY = `
  select unnest(platform.anon_function_birth_schemas()) as schema
  order by 1
`;
