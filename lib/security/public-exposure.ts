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

/**
 * Exported for `check:anon-column-surface`'s REASON/EXPOSURE AGREEMENT arm: the
 * two lists in this file are two statements about the SAME signed-out visitor,
 * and DD-186 let them contradict each other on 29 relations for three weeks
 * because nothing compared them (V-94, 2026-09-14). Nothing else should consume
 * it — the exposure classifier below is the read path.
 */
export const PUBLIC_EXPOSURE_ALLOWED: ReadonlyArray<PublicExposure> = [
  // — Pricing and plan catalogue, rendered on the public marketing pages —
  { relation: "billing.product", policy: "product_read", cmd: "SELECT", why: "app/(public)/pricing renders the Premium product name + description; loadEducationPricing.ts reads it server-side with no cookie, so as `anon` (measured 2026-09-14, DD-230)" },
  { relation: "billing.price", policy: "price_read", cmd: "SELECT", why: "the same loader's second query — the Premium amount, currency and interval on app/(public)/pricing (measured 2026-09-14, DD-230)" },
  { relation: "billing.capability_limit", policy: "capability_limit_read", cmd: "SELECT", why: "the Free-tier headline caps on app/(public)/pricing — the one billing catalogue read a signed-out visitor really makes, measured live 2026-09-14 (DD-230)" },

  // — Reference/catalogue data with no personal content —
  { relation: "platform.feature_knob", policy: "feature_knob_read", cmd: "SELECT", why: "client feature gating has to resolve before sign-in — TRUE, and measured: 194 anonymous 200s in 24 h, every one select=feature,key,value, which is now the whole bound (DD-230)" },
  { relation: "public.app_config", policy: "app_config_public_read", cmd: "SELECT", why: "client bootstrap config (min supported version); read before auth by design" },

  // — Public tool / UI catalogues the shell needs before auth —
  { relation: "ui.ui_surface_agent_role", policy: "ui_surface_agent_role_read", cmd: "SELECT", why: "fetchSurfaceConfigBundle reads it deliberately as a guest — a genuine guest still receives the public surface config — bounded to the ten columns it selects plus surface_name (DD-230)" },

  // — Deliberately public product surfaces —
  { relation: "extend.wbx_recipe", policy: "pub_read", cmd: "SELECT", why: "browser-automation recipe catalogue; no credentials — discloses which sites/routes we automate, accepted. DD-173 (B-103): the hand-written `wbx_recipe_read_all` (USING true) was superseded by the generated system-variant lane, which publishes only rows whose `visibility` is `public` — derived from `is_active`, so a retired recipe leaves the open web by the flag that already means that." },

  // — Anonymous WRITES: none. All three are closed (DD-181a, 2026-09-13,
  //   migrations/dd181_dd182_recorded_doors_bounded_or_closed.sql). `communication.emails`
  //   never had a writer — the public contact form writes `communication.contact_submissions`
  //   as the service role behind a per-IP rate limit — and the guest flow's real signed-out
  //   writer is `public.record_guest_execution`, a SECURITY DEFINER function owned by the
  //   tables' owner, which never consulted their RLS. A row returns here only with a caller. —

  // — DD-230, 2026-09-14: FOURTEEN more rows left this list, because DD-230 revoked every `anon`
  //   column grant on those relations and a policy that reaches `anon` grants nothing when the role
  //   holds no column: billing.capability, billing.plan_limit, iam.industries,
  //   platform.assurance_level, platform.shareable_resource_registry, platform.source_authority,
  //   tool.executor, tool.mcp_config, tool.mcp_server, ui.ui_client, ui.ui_surface,
  //   ui.ui_surface_client_tool, ui.ui_surface_value and ui.ui_surface_write_target. FIVE of their
  //   reasons were measured FALSE rather than merely stale — `iam.industries` claimed the sign-up
  //   form (/sign-up signed out issues ZERO database requests, and every caller of fetchIndustries()
  //   is an admin or organization surface); `tool.executor` claimed the public tool catalogue (that
  //   is tool.definition, served by app/api/tools through utils/supabase/server-tools-service.ts,
  //   which names its columns and never touches executor); `billing.capability` and
  //   `billing.plan_limit` claimed the public plan-comparison table (/pricing/compare and
  //   /pricing/pledge issue no database read at all); `ui.ui_surface` claimed the shell before
  //   sign-in (no signed-out route asks for it — its anon-shaped traffic is
  //   scripts/check-surface-impact.ts on the SECRET key, which carries no JWT and therefore logs
  //   with an empty role). ANON_COLUMN_SURFACE's header carries the method. —

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
  // ══ DD-230, 2026-09-14 — A SIGNED-OUT READER SEES EXACTLY WHAT THE PUBLIC SURFACES RENDER ════
  //
  // DD-186 declared the signed-out surface. DD-222 settled what a bound MEANS: the columns the
  // signed-out surface renders. DD-226 applied that to 121 relations and left 46 — the catalogue-
  // shaped schemas `ai`, `billing`, `content_ir`, `extend`, `iam`, `platform`, `tool`, `ui` — open,
  // because their readers were said to be "server-side shell catalogue reads that a browser capture
  // cannot see". DD-230 measured those readers. THIRTY-ONE of the 46 had none and are gone from
  // this list entirely; the other FIFTEEN are bounded to the columns their reader actually names.
  // 65 relations / 997 readable columns → 34 relations / 471.
  //
  // 🚨 THE LAST ONE TOOK A VERIFIER TO CLOSE, AND THE LESSON IS WORTH MORE THAN THE COLUMNS.
  // `tool.surface_defaults` was bounded at four rather than closed, on a reader this lane had READ
  // but not RUN: the chrome-extension tool-drift guards in matrx-extend and matrx-local, which do
  // ask for those columns on the publishable key, and whose 18 anonymous 200s a day are real. V-100
  // ran them. matrx-local's read asks for `is_active`, which was never in the bound, and its FIRST
  // read (`tool.binding`, with raise_for_status() and no fallback) 401s anyway; matrx-extend's read
  // sits in the same `Promise.all` as that same 401ing `tool.binding`, so its `try` throws and it
  // falls through to the Management API every time. Eighteen successful anonymous reads a day whose
  // own caller throws the answer away. A relation is not "read by" a caller that cannot use what it
  // gets — so the door closed with no change needed in either peer repo
  // (migrations/dd230_surface_defaults_has_no_signed_out_reader_after_all.sql). When a `why` names a
  // reader, RUN it.
  //
  // 🚨 NEVER READ A `why` HERE AS A MEASUREMENT UNLESS IT SAYS WHAT WAS MEASURED. DD-186 pasted one
  // sentence — "No signed-out reader was found for it in the four-repository census" — onto 53
  // relations, including nine whose reader had been NAMED in this very file and twenty whose
  // PUBLIC_EXPOSURE_ALLOWED row a few hundred lines above says the opposite. That sentence is now
  // gone from every row: each `why` below names its reader by route or file, or says nothing at all
  // because the relation was removed. `check:anon-column-surface`'s fourth arm (REASON/EXPOSURE
  // AGREEMENT) fails the build if a bound ever claims no reader while an exposure row exists, or
  // the reverse.
  //
  // ═══ HOW A READER IS MEASURED — the method, so the next lane does not re-invent it ════════════
  // 1. A REAL SIGNED-OUT BROWSER on production (localStorage holds no `sb-*` key): /, /pricing,
  //    /sign-up, /files, /podcast, /canvas/discover, with every request to db.matrxserver.com read
  //    out of the page's own PerformanceResourceTiming. Result: ONE route issues a database request
  //    at all — /canvas/discover, for canvas.shared_canvas_items, naming exactly its 36 columns.
  // 2. Supabase `edge_logs`, a full 24 h, grouped by `request.path` × `request.sb.jwt.authorization
  //    .payload.role` × `response.status_code`, WITH the verbatim `select=` of every request. The
  //    `request.headers.authorization` field is empty on every row and must never be used.
  // 3. 🚨 THE TRAP IN (2): a caller holding the new-style `sb_secret_` SERVICE key sends NO JWT, so
  //    its log rows carry an empty role and look exactly like an anonymous reader. `ui.ui_surface`,
  //    `ui.ui_surface_value`, `ui.ui_surface_write_target` and `platform.shareable_resource_registry`
  //    were "read anonymously" dozens of times a day by scripts/check-surface-impact.ts and
  //    scripts/regen-shareable-registry-snapshot.ts, both on the secret key. Every candidate was
  //    therefore RE-PROBED over HTTPS with the PUBLISHABLE key and no Authorization header. That
  //    probe — never the log role — decided each row.
  // 4. The code census: every `.from("<table>")` in matrx-frontend, matrx-extend, matrx-local and
  //    aidream, judged against what a person with no account can cause to run. aidream reads this
  //    database as the service role or through matrx-orm; its one publishable-key client always
  //    carries the caller's JWT.
  //
  // ═══ THE SECOND HALF OF A BOUND, WHICH NO NETWORK CAPTURE CAN SHOW YOU ════════════════════════
  // A policy's references to its OWN table's columns need no column privilege. A SUBQUERY inside a
  // policy, against ANOTHER relation, runs with the CALLER's privileges. `content_ir.kind_component`,
  // `kind_edge`, `kind_example` and `kind_surface` are each gated by
  //   USING (… kind_definition_id IN (SELECT p.id FROM content_ir.kind_definition p
  //                                    WHERE p.deleted_at IS NULL AND p.visibility = 'public'))
  // so `anon` must keep SELECT on `content_ir.kind_definition`'s id, deleted_at and visibility or
  // ALL FOUR children answer 42501 — naming the PARENT table, which is what makes it hard to read.
  // THE RULE: the bound is the columns the surface renders PLUS the columns any reachable RLS
  // policy evaluates through a subquery on another relation. `check:anon-column-surface`'s fifth arm
  // (RLS-PREDICATE REACH) proves it, and
  // migrations/dd230_a_column_another_tables_rls_reads_is_part_of_the_bound.sql records the incident.
  //
  // ═══ THE OTHER CLASS DD-230 FOUND: `select("*")` AGAINST A BOUNDED RELATION ═══════════════════
  // PostgREST expands `*` to EVERY column, so a `*` against a relation with a partial column grant
  // is 42501 for the WHOLE request — never a narrowed row. Three live public surfaces were failing
  // that way, silently, when this lane started:
  //   /podcast              "No shows published yet. Be the first — create one in the Studio."
  //                         with four published shows in the table (pc_shows `select=*`).
  //   /podcast/<slug>/feed.xml   404 "Podcast not found" (pc_shows + pc_episodes `select=*`).
  //   /pricing              Premium card "Coming soon / Not available yet" over a live active
  //                         product, because the loader asked for `metadata` (billing.product).
  // Each loader swallowed the error and rendered its empty state. The readers now NAME their
  // columns — features/podcasts/publicColumns.ts, features/education/publishing/publicColumns.ts —
  // and THROW instead of rendering a claim the data never supported. A public reader of a relation
  // in this list must never use `*`.
  //
  // ═══ THE THIRTY REMOVED, AND WHY AN ABSENT ROW IS THE GUARD'S OWN RED ═════════════════════════
  //   ai.api, ai.endpoint, ai.model_alias, ai.offering, ai.setting, ai.voices,
  //   billing.capability, billing.plan_limit,
  //   extend.wbx_demo, wbx_guidance, wbx_highlight, wbx_pattern, wbx_screenshot, wbx_seo_audit,
  //   iam.industries, iam.permissions,
  //   platform.assurance_level, flexible_data, rulebook, shareable_resource_registry, source_authority,
  //   tool.bundle, tool.executor, tool.mcp_config, tool.mcp_server, tool.surface_defaults,
  //   ui.ui_client, ui_surface, ui_surface_client_tool, ui_surface_value, ui_surface_write_target
  // They are ABSENT rather than present with an empty `columns` array: `check:anon-column-surface`
  // fails on an UNDECLARED live relation, so a re-grant is caught by the guard itself. Re-granting
  // any of them is a publishing decision and needs its own register row. Four of their
  // PUBLIC_EXPOSURE_ALLOWED claims were measured FALSE and those rows are deleted above:
  //   iam.industries "the sign-up form, before an account exists" — /sign-up signed out issues ZERO
  //     database requests, and every caller of fetchIndustries() is an admin or org surface;
  //   tool.executor "public tool catalogue" — the public tool catalogue is tool.definition, served
  //     by app/api/tools through utils/supabase/server-tools-service.ts, which names its columns and
  //     never touches executor;
  //   billing.capability / billing.plan_limit "the public pricing comparison table" — /pricing/compare
  //     and /pricing/pledge issue no database read at all;
  //   ui.ui_surface "the shell renders public routes before sign-in" — no signed-out route asks for
  //     it; its anon-shaped traffic is the secret-key guard of (3).
  //
  // Applied by migrations/dd230_<schema>_publishes_exactly_what_a_signed_out_reader_renders.sql
  // (eight files, one per schema) plus the RLS-predicate file above. Every one rehearsed inside a
  // rolled-back transaction first; every one asserts the surviving anon set EQUALS the bound below,
  // that `anon` holds no table-level SELECT, and that `authenticated`'s column count is unchanged.
  //
  // (The DD-226 history for the 121 relations closed before this lane, and the DD-222/DD-218 notes
  // on `agent.exemplar` and `agent.mandate_exemplar`, live in that commit's message and in
  // common-docs/projects/data-doctrine-adoption/REGISTER.md — they are not repeated here.)
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
    relation: "ai.model_definition",
    columns: [
      "id", "name", "common_name", "context_window", "max_tokens", "capabilities",
      "provider_id", "is_deprecated", "is_primary", "is_premium", "mid_fallback_id", "guest_fallback_id",
      "visibility", "deleted_at", "created_at", "updated_at", "release_date", "description",
      "cost_rating", "speed_rating", "retry_fallback_id", "retry_max_attempts", "retired_at", "successor_id",
    ],
    why:
      "GET /api/ai-models — an UNAUTHENTICATED route whose client is getScriptSupabaseClient() "
      + "(publishable key, so it runs as `anon`) and whose answer is CDN-cached to the open internet "
      + "for 12 hours. Its .select() names EXACTLY these 24 columns. MEASURED 2026-09-14 (DD-230): "
      + "replayed over HTTPS with no Authorization header — 200 with all 24; one column outside the "
      + "list is 42501.",
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
    relation: "ai.provider",
    columns: [
      "id", "name",
    ],
    why:
      "The same /api/ai-models route's second query: .select(\"id, name\"), which resolves a model's "
      + "maker from the provider FK. DD-230 (2026-09-14) cut this bound from fifteen columns to those "
      + "TWO: company_description, documentation_link, models_link, provider_models_cache, slug, "
      + "website_url, logo_url, doc_sources, sync_policy, visibility, deleted_at, created_at and "
      + "updated_at were published to the internet and rendered by nobody.",
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
    relation: "billing.capability_limit",
    columns: [
      "capability", "tier", "limit_value", "period",
    ],
    why:
      "The same loader's third query: .select(\"capability, limit_value, period, tier\") for the "
      + "Free-tier headline caps on /pricing. MEASURED 2026-09-14: live anon 200s on production with "
      + "exactly this select. DD-230 cut id, created_at, updated_at and visibility.",
  },
  {
    relation: "billing.plan",
    columns: [
      "plan_key", "name", "audience", "tagline", "rank", "tier",
      "monthly_cents", "annual_cents", "per_seat", "min_seats", "badge", "is_public",
      "is_default", "active", "created_at", "updated_at", "id",
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
    relation: "billing.price",
    columns: [
      "id", "product_id", "unit_amount", "currency", "interval", "active",
    ],
    why:
      "The same loader's second query: id, unit_amount, currency, interval, filtered on product_id "
      + "+ active. DD-230 cut this bound from twelve columns to six — stripe_price_id, "
      + "interval_count, trial_period_days, created_at, updated_at and visibility are not on the "
      + "page.",
  },
  {
    relation: "billing.product",
    columns: [
      "id", "name", "description", "tier", "active", "created_at",
    ],
    why:
      "app/(public)/pricing → features/pricing/education/loadEducationPricing.ts, a SERVER read on "
      + "a public route: a signed-out visitor carries no cookie, so utils/supabase/server runs as "
      + "`anon`. It renders name + description, filters on active and orders by created_at; tier "
      + "names the plan. MEASURED 2026-09-14 (DD-230): that loader was asking for `metadata` too — a "
      + "column DD-186 rightly withholds — so the whole query answered 42501 and the loader, which "
      + "ignored `error`, rendered \"Coming soon\" over a live active product. Five such 401s on "
      + "production in 24 h. The loader now names only these columns and throws on error.",
  },
  {
    relation: "canvas.canvas_items",
    columns: [
      "id", "type", "content", "title", "description", "is_favorited",
      "is_archived", "tags", "session_id", "source_message_id", "task_id", "is_public",
      "created_at", "updated_at", "last_accessed_at", "content_hash", "project_id", "conversation_id",
      "artifact_index", "version", "parent_canvas_id", "source_type", "external_system", "external_id",
      "deleted_at", "visibility", "source_system", "source_id",
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
      "/canvas/discover and /canvas/shared/[token], both app/(public). MEASURED 2026-09-14 (DD-230) "
      + "in a real signed-out browser on production: /canvas/discover issues exactly ONE request to "
      + "db.matrxserver.com, and it names exactly these 36 columns. This row carried DD-186's "
      + "unevidenced census sentence until that measurement replaced it.",
  },
  {
    relation: "content_ir.kind_component",
    columns: [
      "id", "kind_definition_id", "platform", "role", "component_key", "source",
      "component_source", "props_transform", "config", "pinned_kind_version", "is_default", "is_active",
      "sort_order", "created_at", "updated_at", "deleted_at",
    ],
    why:
      "features/content-ir/registry/schema-source-kind-components.ts — the (kind, platform, role) → "
      + "component_key resolver, read by the same anon-capable browser path. Columns are the union of "
      + "the verbatim anon `select=` lists measured in edge_logs over 24 h; created_by, semver, notes "
      + "and the identity columns left (DD-186, DD-230).",
  },
  {
    relation: "content_ir.kind_definition",
    columns: [
      "id", "kind", "label", "data", "sample_data", "emitted_json_schema",
      "is_active", "created_at", "updated_at", "deleted_at", "visibility",
    ],
    why:
      "The Shape System registry — features/content-ir/registry/schema-source-kind-tables.ts and "
      + "the studio's public readers — whose browser client runs as `anon` on a guest surface and "
      + "before a session hydrates. Columns taken from the verbatim anon `select=` lists in Supabase "
      + "edge_logs over 24 h. PLUS `visibility` (and id, deleted_at), which NO surface renders: the "
      + "pub_read policies of kind_component, kind_edge, kind_example and kind_surface each evaluate "
      + "`SELECT p.id FROM content_ir.kind_definition p WHERE p.deleted_at IS NULL AND p.visibility = "
      + "'public'` — a subquery on ANOTHER relation, which runs with the caller's privileges. "
      + "Revoking it made all four children answer 42501 naming this table. See "
      + "migrations/dd230_a_column_another_tables_rls_reads_is_part_of_the_bound.sql. DD-230 cut this "
      + "bound from 18 to 11.",
  },
  {
    relation: "content_ir.kind_edge",
    columns: [
      "parent_definition_id", "field_name", "child_definition_id", "position", "deleted_at",
    ],
    why:
      "The registry's ref graph (parent → child field edges), same reader. Measured anon selects: "
      + "`parent_definition_id,field_name,child_definition_id,deleted_at` and "
      + "`child_definition_id,field_name,position`. DD-230 cut id, pinned_child_version, created_at "
      + "and updated_at.",
  },
  {
    relation: "content_ir.kind_example",
    columns: [
      "id", "kind_definition_id", "data", "is_canonical", "updated_at", "deleted_at",
    ],
    why:
      "features/content-ir/studio/kind-examples.ts. Measured anon select: "
      + "`id,kind_definition_id,is_canonical,data,updated_at`. DD-230 cut nine columns, including "
      + "source, source_ref, validation_status, validated_at and captured_at.",
  },
  {
    relation: "content_ir.kind_surface",
    columns: [
      "id", "kind_definition_id", "surface_type", "token", "parser_strategy", "streaming",
      "is_active", "deleted_at",
    ],
    why:
      "features/content-ir/registry/surface-registry.ts — the ONE enumerable input-surface list. "
      + "Measured anon selects: `surface_type,token,parser_strategy,streaming,kind_definition(kind)` "
      + "and `id,kind_definition_id,surface_type,token,is_active`. DD-230 cut parser_config, "
      + "priority, created_at and updated_at.",
  },
  {
    relation: "education.learn_doc",
    columns: [
      "id", "created_at", "updated_at", "deleted_at", "visibility", "slug",
      "title", "summary", "subject", "letter", "keywords", "sections",
      "related", "content_updated_at", "published_at",
    ],
    why:
      "The published learn-doc list — features/education/publishing/queries.ts, which builds its "
      + "client with getScriptSupabaseClient() (publishable key ⇒ `anon`) and projects "
      + "LEARN_DOC_PUBLIC_SELECT, pinned to this list by lib/security/public-exposure.test.ts. DD-230 "
      + "(2026-09-14) replaced DD-186's unevidenced census sentence, which was false for this "
      + "relation and for the eight below.",
  },
  {
    relation: "extend.wbx_capture",
    columns: [
      "id", "url", "captured_at", "title",
    ],
    why:
      "The Chrome extension, which holds the publishable key and has no account until its user "
      + "signs in. MEASURED 2026-09-14 on production: `select=id,url,captured_at,title` from a real "
      + "browser with no JWT and no referer, looking a capture up by URL. DD-230 cut eleven columns — "
      + "including `soup` and `markdown`, the captured page's own body.",
  },
  {
    relation: "extend.wbx_recipe",
    columns: [
      "recipe_key", "label", "description", "hosts", "routes", "kind",
      "config", "yields_rows", "is_active", "last_verified_at", "created_at", "updated_at",
      "id",
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
    relation: "platform.categories",
    columns: [
      "id", "dimension", "name", "slug", "parent_id", "color",
      "icon", "position", "created_at", "updated_at", "deleted_at", "placement_type",
      "visibility",
    ],
    why:
      "lib/services/agent-apps-admin-service.ts, which builds its client with "
      + "getScriptSupabaseClient() (publishable key ⇒ `anon`). DD-230 (2026-09-14) replaced DD-186's "
      + "unevidenced census sentence, which contradicted the reader B-116 itself had named.",
  },
  {
    relation: "platform.feature_knob",
    columns: [
      "feature", "key", "value",
    ],
    why:
      "lib/knobs/featureKnobs.ts — client feature gating has to resolve before sign-in, which is "
      + "what this relation's PUBLIC_EXPOSURE_ALLOWED row says and it is true. MEASURED 2026-09-14: "
      + "194 anon 200s in 24 h and EVERY ONE of them `select=feature,key,value`. DD-230 cut the bound "
      + "from twenty-three columns to those three; min/max, allowed_values, set_by, basis, "
      + "review_due, bound_value, overridable_by, taxonomy_node_id and the rest are the knob's "
      + "governance, not its value.",
  },
  {
    relation: "platform.v_feature_knob_overdue",
    columns: [
      "feature", "key", "label", "value", "default_value", "unit",
      "basis", "review_due", "days_overdue",
    ],
    why:
      "A view over platform.feature_knob with no RLS policy of its own. DD-230 (2026-09-14) cut its "
      + "parent to three columns and re-measured this one: zero anonymous requests for it in 24 h of "
      + "production edge_logs, no route in any of the four repositories reads it, and zero rows reach "
      + "a signed-out visitor. Bounded here only because the view's own grant is what the guard sees; "
      + "the next narrowing of it is a revoke to zero, not a re-declaration.",
  },
  {
    relation: "podcast.pc_articles",
    columns: [
      "id", "show_id", "episode_id", "kind", "slug", "title",
      "content_markdown", "og_image_url", "canonical_url", "status", "created_at", "updated_at",
      "deleted_at", "visibility",
    ],
    why:
      "/podcast/[slug] and /podcast/[slug]/blog — the public show-notes and blog renderers; "
      + "PC_ARTICLE_PUBLIC_SELECT. Same `select=*` trap, same fix (DD-230).",
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
      "The same public routes plus /podcast/[slug]/chapters.json; PC_EPISODE_PUBLIC_SELECT. Broken "
      + "by the same `select=*` trap and fixed the same way (DD-230).",
  },
  {
    relation: "podcast.pc_shows",
    columns: [
      "id", "slug", "title", "description", "image_url", "author",
      "is_published", "created_at", "updated_at", "og_image_url", "thumbnail_url", "rss_settings",
      "deleted_at", "visibility",
    ],
    why:
      "/podcast, /podcast/[slug] and /podcast/[slug]/feed.xml — a podcast client fetches the feed "
      + "with no account at all. The columns are mirrored in "
      + "features/podcasts/publicColumns.ts#PC_SHOW_PUBLIC_SELECT. 🚨 MEASURED 2026-09-14 (DD-230): "
      + "every one of those routes was asking for `select=*`, PostgREST expands `*` to ALL columns, "
      + "and the five withheld ones made the whole read 42501 — so /podcast rendered \"No shows "
      + "published yet. Be the first\" with four published shows in the table and feed.xml answered "
      + "404 \"Podcast not found\". Named columns, and a thrown error instead of an empty state, are "
      + "the fix.",
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
    relation: "ui.ui_surface_agent_pref",
    columns: [
      "id", "surface_name", "role_name", "agent_id", "kind", "position",
      "settings", "scope_id", "updated_at", "deleted_at",
    ],
    why:
      "The same guest bundle's second query, plus its deleted_at / surface_name filters. 🚨 "
      + "MEASURED 2026-09-14: that query was BROKEN for guests — it asked for user_id and "
      + "organization_id, identity columns `anon` may not select, so the whole bundle answered 42501 "
      + "and the guest surface config its own comment promises never arrived (ten such 401s on "
      + "production in 24 h). The guest branch now omits both; a guest can only ever see rows where "
      + "they are null. DD-230 also cut created_at and visibility.",
  },
  {
    relation: "ui.ui_surface_agent_role",
    columns: [
      "surface_name", "name", "label", "description", "kind", "default_agent_id",
      "max_agents", "allow_custom", "auto_run", "sort_order", "mandate_key",
    ],
    why:
      "features/surfaces/services/surface-config.service.ts#fetchSurfaceConfigBundle, which awaits "
      + "getUser() and then reads DELIBERATELY as a guest — its own comment: \"a genuine guest still "
      + "receives the public surface config\". Its .select() names ten; `surface_name` is the eleventh "
      + "because PostgREST cannot filter on a column the role may not select. DD-230 cut id, "
      + "visibility, created_at, updated_at and synced_from.",
  },
  {
    relation: "ui.ui_surface_config",
    columns: [
      "id", "surface_name", "namespace", "config", "scope_id", "updated_at",
      "deleted_at",
    ],
    why:
      "The same guest bundle's third query — broken for guests in exactly the same way (another ten "
      + "401s in 24 h) and fixed the same way. DD-230 also cut created_at and visibility.",
  },
  {
    relation: "workbench.heatmap_saves",
    columns: [
      "id", "title", "description", "data", "view_settings", "created_at",
      "updated_at", "deleted_at", "visibility",
    ],
    why:
      "/free/zip-code-heatmap/[id] — an app/(public) route that reads this table directly with the "
      + "SSR client, which carries no cookie for a signed-out visitor. DD-230 (2026-09-14) replaced "
      + "DD-186's unevidenced census sentence. Measured caveat: the grant answers 200 but no row "
      + "currently sits on the public side of the gate, so the READER is named from code, not from a "
      + "rendered page.",
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
/**
 * THE SENTENCE THAT IS NEVER EVIDENCE. DD-186 pasted this claim onto 175 bounds
 * without measuring one of them, and it survived into 53 rows that contradicted
 * either their own PUBLIC_EXPOSURE_ALLOWED row or a reader named in this very
 * file. Any rewording of it is caught here, so the class cannot come back under
 * a new phrasing.
 */
const NO_READER_CLAIM =
  /no\s+signed[- ]out\s+reader\s+(was\s+)?(found|exists)|nobody\s+signed[- ]out\s+reads/i;

/** One bound whose reason and whose exposure row disagree about the same visitor. */
export interface ReasonExposureConflict {
  relation: string;
  kind: "claims-no-reader-but-is-exposed" | "exposed-with-no-named-reader";
  why: string;
  exposureWhy?: string;
}

/**
 * REASON/EXPOSURE AGREEMENT (DD-230, 2026-09-14). `ANON_COLUMN_SURFACE` says
 * WHICH columns a signed-out visitor may read and WHY; `PUBLIC_EXPOSURE_ALLOWED`
 * says which policies reach that same visitor and why. A bound that says no
 * signed-out reader exists while an exposure row says "the public pricing page
 * renders this before sign-in" is not a nuance — one of the two is false, and
 * until DD-230 twenty relations carried exactly that pair, `billing.price`,
 * `iam.industries`, `ui.ui_surface` and `tool.executor` among them.
 *
 * A `why` is evidence only when it says what was MEASURED. This is deliberately
 * a TEXT check: the register is prose, the prose is what the next lane reads
 * before it decides whether to revoke a grant, and prose that lies is the defect
 * this arm exists to stop.
 */
export function classifyReasonExposure(): ReasonExposureConflict[] {
  const exposed = new Map(
    PUBLIC_EXPOSURE_ALLOWED.filter((e) => e.cmd === "SELECT" || e.cmd === "ALL").map(
      (e) => [e.relation, e.why] as const,
    ),
  );
  const out: ReasonExposureConflict[] = [];
  for (const d of ANON_COLUMN_SURFACE) {
    if (!NO_READER_CLAIM.test(d.why)) continue;
    const exposureWhy = exposed.get(d.relation);
    out.push(
      exposureWhy !== undefined
        ? {
            relation: d.relation,
            kind: "claims-no-reader-but-is-exposed" as const,
            why: d.why,
            exposureWhy,
          }
        : // A bound with columns granted and no reader is DD-222's contradiction:
          // the grant is the half that is wrong. It never belongs in this list.
          { relation: d.relation, kind: "exposed-with-no-named-reader" as const, why: d.why },
    );
  }
  return out;
}

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
