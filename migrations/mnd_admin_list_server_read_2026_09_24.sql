-- mnd_admin_list — THE SERVER READ behind /administration/mandates/list-preview.
--
-- Before this, the admin mandate list loaded every mandate in the corpus into
-- the browser (console rows + bindings + agents + versions + serve links) and
-- paged, sorted, filtered, searched and counted them in memory, because the one
-- list door (`public.mnd_list_scoped`) carries neither creator scope nor the
-- origin/serves/customized-by facts. This function is the EntityListPage server
-- contract for that list (lib/entity-list/FEATURE.md): scope, relevance search,
-- every column's filter and sort, paging, tab counts and per-column facets, all
-- in the database.
--
-- ONE FUNCTION, FOUR MODES (p_mode):
--   'page'    → { total, rows: [{ id, mandate_key, customized_by, serves,
--                 serves_detail, backs_count, home_label }] }
--   'counts'  → { mine, orgs, system, orgs_narrow: [{ id, label, count }] }
--   'facets'  → { <column id>: [{ value, count }] }
--   'agents'  → [agent id, …] every holder agent in the corpus (for the
--               server's impact grades, which are graded per agent)
--
-- THE CORPUS is exactly `mnd_list_scoped`'s home 'all': the system organization
-- plus every organization the caller belongs to, live, non-placeholder. RLS is
-- the ceiling (SECURITY INVOKER); the function is for platform admins only and
-- says so in words otherwise.
--
-- SCOPES (creator, per the owner's ruling in common-docs/systems/mandates/UI-REGISTER.md):
--   mine    created by the caller
--   orgs    homed in one of the caller's organizations (not the system one),
--           narrowable to one organization with p_org_id
--   system  homed in the platform's system organization
--
-- COLUMN VALUES mirror features/mandates/admin-list/fields.ts (THE ONE VALUE
-- READER) and rows.ts / mandate-health.ts `buildRow` exactly, so a filter
-- option, a count and a cell can never disagree. Five facts are CLASSIFIED BY
-- THE aidream SERVER, not stored in the database — coverage, impact grade and
-- blocker, the code declaration (state, language, the feature sub-area) and the
-- code-truth health overlays. The client passes them in `p_facts` (the
-- established `coverage_keys` pattern of mnd_list_scoped: the server classifies,
-- this door only narrows), and only when the query filters, sorts or facets on
-- them:
--   p_facts = {
--     "coverage":      { "known": bool, "red": [key], "orange": [key] },
--     "grade":         { "<grade>": [key] },  "gradeOrder": ["identical", …],
--     "blocker":       { "<blocker>": [key] },
--     "codeState":     { "declared": [key], "import_failed": [key] },
--     "declaredIn":    { "<label>": [key] },
--     "featureLabel":  { "<key>": "<label>" },
--     "health":        { "agentDrift": [key], "importFailed": [key], "contractDrift": [key] }
--   }
-- An absent section reads as the column's "unknown/not graded" value — never
-- as a verdict.
--
-- CUSTOMIZED BY — the system organization's own bindings. 30 live org-principal
-- bindings are held by the system organization itself (all from the 2026-08-30
-- agent.shortcut → binding migration, metadata.role = 'shortcut_pin'). One that
-- names the job's own default holder with no settings and no input mapping
-- changes nothing a member gets, so it reads "Default". One that names a
-- different holder, or carries settings or a mapping, is a platform-wide
-- override that beats the default for everyone, and reads "Platform override".
-- It never reads as the org name "Matrx System".
--
-- Additive: new functions only. No table, policy or existing function changes.

CREATE OR REPLACE FUNCTION mandate._admin_list_match(
  p_vals jsonb, p_filters jsonb, p_skip text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- One filter bag entry per column id (lib/entity-list/types.ts
  -- EntityFilterValue). Mirrors admin-list/service.ts `applyFilters`:
  -- select = any wanted value among the row's values; boolean = the string
  -- 'true'/'false' among them; text = case-insensitive substring of any value.
  SELECT coalesce(bool_and(
    CASE
      WHEN f.value->>'kind' = 'select' THEN
        coalesce(p_vals->f.key, '[]'::jsonb)
          ?| ARRAY(SELECT jsonb_array_elements_text(coalesce(f.value->'values', '[]'::jsonb)))
      WHEN f.value->>'kind' = 'boolean' THEN
        coalesce(p_vals->f.key, '[]'::jsonb) ? (f.value->>'value')
      WHEN f.value->>'kind' = 'text' THEN
        EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_vals->f.key, '[]'::jsonb)) v
                 WHERE position(lower(coalesce(f.value->>'value', '')) in lower(v)) > 0)
      ELSE true
    END), true)
  FROM jsonb_each(coalesce(p_filters, '{}'::jsonb)) f
  WHERE (p_skip IS NULL OR f.key <> p_skip)
    -- A filter on a column this door does not know is ignored, exactly as the
    -- client's `FIELDS[id]` miss was.
    AND p_vals ? f.key;
$function$;

COMMENT ON FUNCTION mandate._admin_list_match(jsonb, jsonb, text) IS
  'Filter predicate of public.mnd_admin_list: one EntityFilters bag against a row''s per-column facet values. Mirrors features/mandates/admin-list/service.ts applyFilters.';

CREATE OR REPLACE FUNCTION mandate._admin_list_pretty(p_segment text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- admin-list/rows.ts `prettySegment`: `content_plan` → "Content Plan", `seo` → "SEO".
  SELECT coalesce(string_agg(
           CASE WHEN lower(w) = ANY (ARRAY['ai','crm','seo','ner','pdf','sms','rag','kg','ir','cx','hr','api','ui'])
                THEN upper(w)
                ELSE upper(left(w, 1)) || substr(w, 2) END,
           ' ' ORDER BY o), '')
  FROM unnest(regexp_split_to_array(coalesce(p_segment, ''), '[_\-\s]+')) WITH ORDINALITY AS t(w, o)
  WHERE w <> '';
$function$;

CREATE OR REPLACE FUNCTION mandate._admin_list_rows(p_facts jsonb, p_q text)
 RETURNS TABLE(id uuid, mandate_key text, created_by uuid, organization_id uuid,
               is_system boolean, name text, feature_label text, goal text,
               description text, h_agent_name text, customized_by text[],
               serves text[], serves_detail text[], backs_count bigint,
               home_label text, h_agent_id uuid, updated_at timestamptz,
               created_at timestamptz, vals jsonb, sortv jsonb, score integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
-- THE ROW BUILDER of public.mnd_admin_list: one row per mandate in the corpus
-- with every column's facet values (`vals`) and sort key (`sortv`). Mirrors
-- features/mandates/admin-list/rows.ts + fields.ts and mandate-health.ts
-- `buildRow`. SECURITY INVOKER: RLS is the ceiling.
DECLARE
  v_sys uuid;
BEGIN
  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';
  p_facts := coalesce(p_facts, '{}'::jsonb);
  RETURN QUERY
  WITH buckets AS (
    SELECT b.b, public.agx_since_bucket(b.b) AS since, b.o
    FROM unnest(ARRAY['1h','24h','7d','30d','90d','1y']) WITH ORDINALITY AS b(b, o)
  ),
  corpus AS (
    SELECT m.*
    FROM mandate.definition m
    WHERE m.deleted_at IS NULL
      AND coalesce(m.metadata->>'migration_status', '') <> 'placeholder'
      AND (m.organization_id = v_sys OR m.organization_id IN (SELECT iam.my_orgs()))
  ),
  backs AS (
    SELECT c.fallback_mandate_key AS b_key, count(*) AS b_n
    FROM corpus c WHERE c.fallback_mandate_key IS NOT NULL GROUP BY 1
  ),
  holder AS (
    -- mandate-health.ts `buildRow`: a pinned version resolves through its
    -- version row; otherwise the holder id IS the agent id.
    SELECT
      c.id AS h_id,
      coalesce(c.default_holder_type, 'agent') AS h_type,
      (c.default_holder_id IS NOT NULL OR c.default_holder_version_id IS NOT NULL) AS h_has_pin,
      c.default_holder_version_id AS h_vid,
      v.version_number AS h_vnum,
      CASE WHEN c.default_holder_version_id IS NOT NULL
           THEN coalesce(a.id, v.agent_id)
           ELSE coalesce(a.id, c.default_holder_id) END AS h_agent_id,
      CASE WHEN c.default_holder_version_id IS NOT NULL
           THEN coalesce(coalesce(a.name, a.id::text), v.name, '(unknown agent)')
           ELSE coalesce(coalesce(a.name, a.id::text), '(unknown agent)') END AS h_agent_name,
      a.agent_type::text AS h_agent_type,
      coalesce(a.is_archived, false) AS h_archived,
      (a.id IS NOT NULL) AS h_agent_read,
      a.output_schema AS h_output_schema,
      ARRAY(SELECT e->>'name' FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(a.variable_definitions::jsonb) = 'array'
                   THEN a.variable_definitions::jsonb ELSE '[]'::jsonb END) e
            WHERE jsonb_typeof(e) = 'object' AND coalesce(e->>'name', '') <> '')
      || ARRAY(SELECT e->>'key' FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(a.context_policies::jsonb) = 'array'
                   THEN a.context_policies::jsonb ELSE '[]'::jsonb END) e
            WHERE jsonb_typeof(e) = 'object' AND coalesce(e->>'key', '') <> '') AS h_declared
    FROM corpus c
    LEFT JOIN agent.definition_version v ON v.id = c.default_holder_version_id
    LEFT JOIN agent.definition a
           ON a.id = CASE WHEN c.default_holder_version_id IS NOT NULL
                          THEN v.agent_id ELSE c.default_holder_id END
  ),
  binds AS (
    SELECT
      b.mandate_id AS k_id,
      count(*) AS k_n,
      array_agg(DISTINCT coalesce(o.name, 'Organization') ORDER BY coalesce(o.name, 'Organization'))
        FILTER (WHERE b.principal_type = 'org' AND b.organization_id IS DISTINCT FROM v_sys) AS k_orgs,
      bool_or(b.principal_type = 'user') AS k_personal,
      bool_or(b.principal_type = 'global') AS k_global,
      -- The system organization's own binding: a real override only when it
      -- changes what a member gets (see the header).
      bool_or(b.principal_type = 'org' AND b.organization_id = v_sys AND (
                b.holder_id IS DISTINCT FROM c.default_holder_id
             OR b.holder_version_id IS DISTINCT FROM c.default_holder_version_id
             OR coalesce(b.holder_type, 'agent') IS DISTINCT FROM coalesce(c.default_holder_type, 'agent')
             OR b.config_overrides IS NOT NULL
             OR b.consumption_map IS NOT NULL)) AS k_platform
    FROM mandate.binding b
    JOIN corpus c ON c.id = b.mandate_id
    LEFT JOIN iam.organizations o ON o.id = b.organization_id
    WHERE b.deleted_at IS NULL
    GROUP BY b.mandate_id
  ),
  links AS (
    SELECT l.key AS l_key, l.kind AS l_kind, l.ord AS l_ord, l.detail AS l_detail
    FROM (
      SELECT s.mandate_key AS key, 'Shortcut'::text AS kind, 1 AS ord,
             CASE WHEN s.surface_name IS NOT NULL
                  THEN coalesce(s.label, 'Shortcut') || ' (' || s.surface_name || ')'
                  ELSE coalesce(s.label, 'Shortcut') END AS detail
      FROM mandate.vw_shortcut s
      WHERE s.deleted_at IS NULL AND s.mandate_key IS NOT NULL
      UNION ALL
      SELECT r.mandate_key, 'Surface', 2, r.surface_name
      FROM ui.ui_surface_agent_role r WHERE r.mandate_key IS NOT NULL
      UNION ALL
      SELECT c.mandate_key, 'Agent app', 3, d.name
      FROM app.definition d JOIN corpus c ON c.id = d.mandate_id
      WHERE d.deleted_at IS NULL
    ) l
  ),
  served AS (
    SELECT l_key AS s_key,
           ARRAY(SELECT DISTINCT x.l_kind FROM links x WHERE x.l_key = l.l_key) AS s_kinds_raw,
           array_agg(DISTINCT l_detail) FILTER (WHERE l_detail IS NOT NULL) AS s_detail
    FROM links l GROUP BY l_key
  ),
  shaped AS MATERIALIZED (
    SELECT
      c.id, c.mandate_key, c.created_by, c.organization_id,
      (c.organization_id = v_sys) AS is_system,
      c.created_at, c.updated_at, c.is_enabled,
      coalesce(NULLIF(btrim(c.label), ''),
        NULLIF(btrim(array_to_string(ARRAY(
          SELECT CASE WHEN w = '' THEN '' ELSE upper(left(w, 1)) || substr(w, 2) END
          FROM unnest(string_to_array(
                 coalesce((SELECT s FROM unnest(string_to_array(c.mandate_key, '.')) WITH ORDINALITY u(s, o)
                            WHERE s <> '' ORDER BY o DESC LIMIT 1), c.mandate_key), '_'))
                 WITH ORDINALITY z(w, o) ORDER BY o), ' ')), ''),
        c.mandate_key) AS name,
      CASE WHEN position('.' in c.mandate_key) <= 1 OR right(c.mandate_key, 1) = '.'
           THEN '(unscoped)' ELSE split_part(c.mandate_key, '.', 1) END AS feature,
      NULLIF(btrim(coalesce(c.goal, '')), '') AS goal,
      c.description,
      c.origin, c.fallback_mandate_key, c.provision_key, c.output_kind,
      coalesce(c.required_output_keys, ARRAY[]::text[]) AS required_output_keys,
      c.draft_inputs,
      h.*,
      coalesce(k.k_n, 0) AS overrides_count,
      k.k_orgs, coalesce(k.k_personal, false) AS k_personal,
      coalesce(k.k_global, false) AS k_global, coalesce(k.k_platform, false) AS k_platform,
      coalesce(bk.b_n, 0) AS backs_count,
      sv.s_kinds_raw, coalesce(sv.s_detail, ARRAY[]::text[]) AS serves_detail,
      CASE WHEN c.organization_id = v_sys THEN 'System'
           ELSE coalesce(ho.name, 'Organization') END AS home_label
    FROM corpus c
    JOIN holder h ON h.h_id = c.id
    LEFT JOIN binds k ON k.k_id = c.id
    LEFT JOIN backs bk ON bk.b_key = c.mandate_key
    LEFT JOIN served sv ON sv.s_key = c.mandate_key
    LEFT JOIN iam.organizations ho ON ho.id = c.organization_id
  ),
  judged AS MATERIALIZED (
    SELECT s.*,
      -- ── server-classified facts (see header) ──────────────────────────────
      CASE WHEN coalesce((p_facts->'coverage'->>'known')::boolean, false) THEN
             CASE WHEN coalesce(p_facts->'coverage'->'red', '[]'::jsonb) ? s.mandate_key THEN 'red'
                  WHEN coalesce(p_facts->'coverage'->'orange', '[]'::jsonb) ? s.mandate_key THEN 'orange'
                  ELSE 'green' END
           ELSE 'unknown' END AS coverage,
      coalesce((SELECT g.key FROM jsonb_each(coalesce(p_facts->'grade', '{}'::jsonb)) g
                 WHERE g.value ? s.mandate_key LIMIT 1), 'ungraded') AS impact_grade,
      coalesce((SELECT g.key FROM jsonb_each(coalesce(p_facts->'blocker', '{}'::jsonb)) g
                 WHERE g.value ? s.mandate_key LIMIT 1), 'ungraded') AS impact_blocker,
      coalesce((SELECT g.key FROM jsonb_each(coalesce(p_facts->'codeState', '{}'::jsonb)) g
                 WHERE g.value ? s.mandate_key LIMIT 1), 'not_in_code') AS code_state,
      (SELECT g.key FROM jsonb_each(coalesce(p_facts->'declaredIn', '{}'::jsonb)) g
        WHERE g.value ? s.mandate_key LIMIT 1) AS declared_in,
      coalesce(p_facts->'featureLabel'->>s.mandate_key,
        CASE s.feature WHEN 'shortcut' THEN 'Shortcuts' WHEN 'app' THEN 'Agent apps'
             ELSE mandate._admin_list_pretty(s.feature) END) AS feature_label,
      -- ── holder verdicts (buildRow) ────────────────────────────────────────
      (s.h_has_pin AND (s.h_agent_id IS NULL OR s.h_agent_type IS NULL)) AS v_unresolved,
      (s.h_agent_read AND s.h_agent_type IS DISTINCT FROM 'builtin') AS v_nonsystem,
      -- CASE, not AND: the contract judge is the costly call, and only a
      -- pinned, readable holder of a job that requires output keys needs it.
      CASE WHEN s.h_has_pin AND s.h_agent_id IS NOT NULL AND s.h_agent_read
                AND cardinality(s.required_output_keys) > 0
           -- Same verdict as mandate.missing_output_keys (some required key
           -- the schema does not declare), with the schema read ONCE per row
           -- instead of once per required key.
           THEN NOT (s.required_output_keys <@ mandate.output_schema_keys(s.h_output_schema::jsonb))
           ELSE false END
        AS v_output_unmet
    FROM shaped s
  ),
  finished AS MATERIALIZED (
    SELECT j.*,
      CASE
        WHEN j.h_has_pin AND coalesce(p_facts->'health'->'agentDrift', '[]'::jsonb) ? j.mandate_key
          THEN 'code ↔ agent drift'
        WHEN coalesce(p_facts->'health'->'importFailed', '[]'::jsonb) ? j.mandate_key
          THEN 'code truth import failed'
        WHEN j.v_unresolved THEN 'unresolved pin'
        WHEN j.v_nonsystem THEN 'not a system agent'
        WHEN j.h_archived THEN 'agent archived'
        WHEN coalesce(p_facts->'health'->'contractDrift', '[]'::jsonb) ? j.mandate_key
          THEN 'code ↔ contract drift'
        WHEN j.v_output_unmet THEN 'output contract unmet'
        WHEN j.h_has_pin THEN 'ok'
        ELSE 'no holder yet' END AS health,
      CASE WHEN NOT j.h_has_pin THEN 'None'
           WHEN j.h_vid IS NOT NULL THEN coalesce('v' || j.h_vnum, 'unknown version')
           ELSE 'Latest' END AS pin_text,
      -- admin-list/rows.ts `customizedByOf`, plus the system-organization rule.
      CASE WHEN coalesce(cardinality(j.k_orgs), 0) = 0 AND NOT j.k_personal
                AND NOT j.k_global AND NOT j.k_platform
           THEN ARRAY['Default']
           ELSE coalesce(j.k_orgs, ARRAY[]::text[])
                || CASE WHEN j.k_platform THEN ARRAY['Platform override'] ELSE ARRAY[]::text[] END
                || CASE WHEN j.k_personal THEN ARRAY['Personal'] ELSE ARRAY[]::text[] END
                || CASE WHEN j.k_global THEN ARRAY['Global'] ELSE ARRAY[]::text[] END
      END AS customized_by,
      CASE WHEN coalesce(cardinality(j.s_kinds_raw), 0) > 0 THEN
             ARRAY(SELECT k FROM unnest(ARRAY['Shortcut', 'Surface', 'Agent app']) WITH ORDINALITY u(k, o)
                   WHERE k = ANY (j.s_kinds_raw) ORDER BY o)
           WHEN j.origin = 'code' THEN ARRAY['Feature code']
           ELSE ARRAY['Nothing found'] END AS serves,
      CASE WHEN j.h_has_pin THEN 'Own default'
           WHEN j.fallback_mandate_key IS NOT NULL
             OR coalesce(p_facts->'coverage'->'orange', '[]'::jsonb) ? j.mandate_key THEN 'Fallback'
           ELSE 'No default' END AS default_state,
      -- mandate-health.ts `inputSummaryOf`: the four input declarations.
      coalesce(
        NULLIF(j.provision_key, ''),
        NULLIF(array_to_string(ARRAY(
          SELECT coalesce(NULLIF(btrim(e->>'description'), ''), btrim(e->>'name'))
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j.draft_inputs) = 'array'
                                         THEN j.draft_inputs ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
          WHERE jsonb_typeof(e) = 'object'
            AND (coalesce(btrim(e->>'description'), '') <> '' OR coalesce(btrim(e->>'name'), '') <> '')
          ORDER BY o), ', '), ''),
        NULLIF(array_to_string(CASE WHEN j.h_agent_read THEN j.h_declared ELSE ARRAY[]::text[] END, ', '), ''),
        'user text only') AS input_summary,
      coalesce(j.output_kind, NULLIF(array_to_string(j.required_output_keys, ', '), ''), 'unspecified')
        AS output_summary
    FROM judged j
  )
  SELECT
    f.id, f.mandate_key, f.created_by, f.organization_id, f.is_system,
    f.name, f.feature_label, f.goal, f.description, f.h_agent_name,
    f.customized_by, f.serves, f.serves_detail, f.backs_count, f.home_label,
    f.h_agent_id, f.updated_at, f.created_at,
    -- Per-column FACET values — admin-list/fields.ts `values`.
    jsonb_build_object(
      'name',          to_jsonb(ARRAY[f.name]),
      'featureLabel',  to_jsonb(ARRAY[f.feature_label]),
      'mandateKey',    to_jsonb(ARRAY[f.mandate_key]),
      'agentName',     to_jsonb(ARRAY[CASE WHEN f.h_type = 'agent' THEN f.h_agent_name ELSE 'Workflow' END]),
      'pinText',       to_jsonb(ARRAY[f.pin_text]),
      'coverage',      to_jsonb(ARRAY[f.coverage]),
      'impactGrade',   to_jsonb(ARRAY[f.impact_grade]),
      'impactBlocker', to_jsonb(ARRAY[f.impact_blocker]),
      'health',        to_jsonb(ARRAY[f.health]),
      'inputSummary',  to_jsonb(ARRAY[f.input_summary]),
      'outputSummary', CASE WHEN f.output_summary = '' THEN '[]'::jsonb ELSE to_jsonb(ARRAY[f.output_summary]) END,
      'overridesCount', to_jsonb(ARRAY[f.overrides_count::text]),
      'customizedBy',  to_jsonb(f.customized_by),
      'isEnabled',     to_jsonb(ARRAY[CASE WHEN f.is_enabled THEN 'true' ELSE 'false' END]),
      'updatedAt',     to_jsonb(ARRAY(SELECT bk.b FROM buckets bk
                                       WHERE f.updated_at IS NOT NULL AND f.updated_at >= bk.since
                                       ORDER BY bk.o)),
      'id',            to_jsonb(ARRAY[f.id::text]),
      'origin',        to_jsonb(ARRAY[CASE WHEN f.origin = 'code' THEN 'code' ELSE 'soft' END]),
      'codeState',     to_jsonb(ARRAY[f.code_state]),
      'declaredIn',    to_jsonb(ARRAY[coalesce(f.declared_in, 'None')]),
      'serves',        to_jsonb(f.serves),
      'defaultState',  to_jsonb(ARRAY[f.default_state]),
      'backsCount',    to_jsonb(ARRAY[f.backs_count::text]),
      'fallbackKey',   to_jsonb(ARRAY[coalesce(f.fallback_mandate_key, 'None')]),
      'homeLabel',     to_jsonb(ARRAY[f.home_label]),
      'goal',          CASE WHEN f.goal IS NULL THEN '[]'::jsonb ELSE to_jsonb(ARRAY[f.goal]) END,
      'createdAt',     to_jsonb(ARRAY(SELECT bk.b FROM buckets bk
                                       WHERE f.created_at IS NOT NULL AND f.created_at >= bk.since
                                       ORDER BY bk.o))
    ) AS vals,
    -- Per-column SORT keys — admin-list/fields.ts `sort`.
    jsonb_build_object(
      'name',          lower(f.name),
      'featureLabel',  lower(f.feature_label),
      'mandateKey',    lower(f.mandate_key),
      'agentName',     lower(f.h_agent_name),
      'pinText',       lower(f.pin_text),
      'coverage',      CASE f.coverage WHEN 'red' THEN 0 WHEN 'orange' THEN 1 ELSE 2 END,
      'impactGrade',   CASE WHEN f.impact_grade = 'ungraded' THEN -1
                            ELSE coalesce((SELECT o - 1 FROM jsonb_array_elements_text(
                                   coalesce(p_facts->'gradeOrder', '["identical","green","orange","red"]'::jsonb))
                                   WITH ORDINALITY g(v, o) WHERE g.v = f.impact_grade), -1) END,
      'impactBlocker', f.impact_blocker,
      'health',        lower(f.health),
      'inputSummary',  lower(f.input_summary),
      'outputSummary', lower(f.output_summary),
      'overridesCount', f.overrides_count,
      'customizedBy',  lower(array_to_string(f.customized_by, ', ')),
      'isEnabled',     CASE WHEN f.is_enabled THEN 1 ELSE 0 END,
      'updatedAt',     coalesce(to_char(f.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
      'id',            f.id::text,
      'origin',        CASE WHEN f.origin = 'code' THEN 'code' ELSE 'soft' END,
      'codeState',     f.code_state,
      'declaredIn',    coalesce(f.declared_in, ''),
      'serves',        array_to_string(f.serves, ', '),
      'defaultState',  lower(f.default_state),
      'backsCount',    f.backs_count,
      'fallbackKey',   lower(coalesce(f.fallback_mandate_key, 'None')),
      'homeLabel',     lower(f.home_label),
      'goal',          lower(coalesce(f.goal, '')),
      'createdAt',     coalesce(to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')
    ) AS sortv,
    -- Relevance, ported from the one scorer (public.mtx_search_score) — never
    -- an unranked ILIKE (lib/entity-list/FEATURE.md rule 4).
    CASE WHEN p_q IS NULL THEN 0 ELSE public.mtx_search_score(
      p_q, f.id, f.name, coalesce(f.goal, ''), ARRAY[]::text[], NULL,
      ARRAY[f.mandate_key, f.feature_label, f.h_agent_name],
      f.customized_by || f.serves_detail || ARRAY[coalesce(f.description, '')],
      false) END AS score
  FROM finished f;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mnd_admin_list(
  p_mode   text  DEFAULT 'page',
  p_scope  text  DEFAULT 'system',
  p_org_id uuid  DEFAULT NULL,
  p_search text  DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_sort   text  DEFAULT 'name',
  p_dir    text  DEFAULT 'asc',
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_facts  jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_mode  text := lower(coalesce(p_mode, 'page'));
  v_scope text := lower(coalesce(p_scope, 'system'));
  v_q     text := NULLIF(lower(btrim(coalesce(p_search, ''))), '');
  v_f     jsonb := coalesce(p_filters, '{}'::jsonb);
  v_facts jsonb := coalesce(p_facts, '{}'::jsonb);
  v_dir   text := CASE WHEN lower(coalesce(p_dir, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  v_sort  text := coalesce(NULLIF(p_sort, ''), 'name');
  v_sys   uuid;
  v_out   jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501',
      message = 'Sign in to list mandates.';
  END IF;
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION USING errcode = '42501',
      message = 'Only a platform administrator can open the admin mandate list.',
      hint    = 'Use your own mandates page instead (public.mnd_list_scoped).';
  END IF;
  IF v_mode NOT IN ('page', 'counts', 'facets', 'agents') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('p_mode %L is not a mode of the admin mandate list.', p_mode),
      hint    = 'Use page, counts, facets or agents.';
  END IF;
  IF v_scope NOT IN ('mine', 'orgs', 'system') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('p_scope %L is not a scope of the admin mandate list.', p_scope),
      hint    = 'Use mine, orgs or system.';
  END IF;

  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';

  -- (rows come from mandate._admin_list_rows — one build per call)

  IF v_mode = 'agents' THEN
    SELECT coalesce(jsonb_agg(DISTINCT a), '[]'::jsonb) INTO v_out FROM (
      SELECT r.h_agent_id AS a FROM mandate._admin_list_rows(v_facts, v_q) r WHERE r.h_agent_id IS NOT NULL
      UNION
      SELECT coalesce(v.agent_id, b.holder_id)
      FROM mandate.binding b
      JOIN mandate._admin_list_rows(v_facts, v_q) r ON r.id = b.mandate_id
      LEFT JOIN agent.definition_version v ON v.id = b.holder_version_id
      WHERE b.deleted_at IS NULL AND coalesce(b.holder_type, 'agent') = 'agent'
        AND coalesce(v.agent_id, b.holder_id) IS NOT NULL
    ) x;
    RETURN v_out;
  END IF;

  IF v_mode = 'counts' THEN
    WITH narrowed AS (
      SELECT r.* FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE (v_q IS NULL OR r.score > 0) AND mandate._admin_list_match(r.vals, v_f)
    )
    SELECT jsonb_build_object(
      'mine',   (SELECT count(*) FROM narrowed n WHERE n.created_by = v_uid),
      'orgs',   (SELECT count(*) FROM narrowed n WHERE NOT n.is_system),
      'system', (SELECT count(*) FROM narrowed n WHERE n.is_system),
      'orgs_narrow', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', o.organization_id, 'label', o.home_label, 'count', o.n)
                         ORDER BY o.home_label)
        FROM (SELECT n.organization_id, n.home_label, count(*) AS n
              FROM narrowed n WHERE NOT n.is_system AND n.organization_id IS NOT NULL
              GROUP BY 1, 2) o), '[]'::jsonb))
    INTO v_out;
    RETURN v_out;
  END IF;

  IF v_mode = 'facets' THEN
    WITH scoped AS (
      SELECT r.* FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE (CASE v_scope
               WHEN 'mine'   THEN r.created_by = v_uid
               WHEN 'orgs'   THEN NOT r.is_system AND (p_org_id IS NULL OR r.organization_id = p_org_id)
               ELSE r.is_system
             END)
        AND (v_q IS NULL OR r.score > 0)
    )
    SELECT coalesce(jsonb_object_agg(c.col, c.opts), '{}'::jsonb) INTO v_out
    FROM (
      SELECT t.col, jsonb_agg(jsonb_build_object('value', t.val, 'count', t.n)
                              ORDER BY t.n DESC, t.val) AS opts
      FROM (
        SELECT cols.col, v.val, count(*) AS n
        FROM (SELECT DISTINCT jsonb_object_keys(r.vals) AS col FROM scoped r) cols
        JOIN scoped r ON mandate._admin_list_match(r.vals, v_f, cols.col)
        CROSS JOIN LATERAL (SELECT DISTINCT x AS val
                            FROM jsonb_array_elements_text(r.vals->cols.col) x) v
        WHERE cols.col NOT IN ('id', 'goal', 'updatedAt', 'createdAt')
        GROUP BY cols.col, v.val
      ) t
      GROUP BY t.col
    ) c;
    RETURN v_out;
  END IF;

  -- page
  WITH scoped AS (
      SELECT r.* FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE (CASE v_scope
               WHEN 'mine'   THEN r.created_by = v_uid
               WHEN 'orgs'   THEN NOT r.is_system AND (p_org_id IS NULL OR r.organization_id = p_org_id)
               ELSE r.is_system
             END)
        AND (v_q IS NULL OR r.score > 0)
    ),
  matched AS (
    SELECT r.*, count(*) OVER () AS total
    FROM scoped r
    WHERE mandate._admin_list_match(r.vals, v_f)
  ),
  ordered AS (
    SELECT m.* FROM matched m
    ORDER BY
      CASE WHEN v_q IS NOT NULL THEN m.score END DESC,
      CASE WHEN v_q IS NULL AND v_dir = 'asc'  AND jsonb_typeof(m.sortv->v_sort) = 'number'
           THEN (m.sortv->>v_sort)::numeric END ASC,
      CASE WHEN v_q IS NULL AND v_dir = 'desc' AND jsonb_typeof(m.sortv->v_sort) = 'number'
           THEN (m.sortv->>v_sort)::numeric END DESC,
      CASE WHEN v_q IS NULL AND v_dir = 'asc'  AND jsonb_typeof(m.sortv->v_sort) = 'string'
           THEN m.sortv->>v_sort END ASC,
      CASE WHEN v_q IS NULL AND v_dir = 'desc' AND jsonb_typeof(m.sortv->v_sort) = 'string'
           THEN m.sortv->>v_sort END DESC,
      CASE WHEN v_q IS NULL AND NOT (m.sortv ? v_sort) THEN lower(m.name) END ASC,
      m.mandate_key ASC
    LIMIT greatest(coalesce(p_limit, 50), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', coalesce((SELECT max(total) FROM matched), 0),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'mandate_key', o.mandate_key,
        'customized_by', to_jsonb(o.customized_by),
        'serves', to_jsonb(o.serves),
        'serves_detail', to_jsonb(o.serves_detail),
        'backs_count', o.backs_count,
        'home_label', o.home_label,
        'feature_label', o.feature_label)) FROM ordered o), '[]'::jsonb))
  INTO v_out;
  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.mnd_admin_list(text, text, uuid, text, jsonb, text, text, integer, integer, jsonb) IS
  'Admin mandate list server read (page | counts | facets | agents) for /administration/mandates/list-preview. Platform admins only; RLS-respecting (INVOKER). Column values mirror features/mandates/admin-list/fields.ts.';

GRANT EXECUTE ON FUNCTION public.mnd_admin_list(text, text, uuid, text, jsonb, text, text, integer, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION mandate._admin_list_match(jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION mandate._admin_list_pretty(text) TO authenticated;
GRANT EXECUTE ON FUNCTION mandate._admin_list_rows(jsonb, text) TO authenticated;
