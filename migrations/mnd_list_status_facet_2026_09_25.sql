-- migrations/mnd_list_status_facet_2026_09_25.sql
--
-- THE MANDATE STATUS as a list facet + sort key, on both list databases:
-- the admin list (mandate._admin_list_rows) and the member lists
-- (mandate._member_list_rows). Same rule as the client's one reader,
-- features/mandates/status/mandate-status.ts `mandateStatusOf`:
--   disabled — is_enabled is false
--   draft    — on, but nothing fills it (admin seat: no default Holder, no
--              fallback, no live binding; member seat: no winner resolves)
--   active   — otherwise
-- (archived rows — deleted_at set — are outside both corpora.)
-- Only two jsonb keys are added to `vals` and `sortv`; nothing else changes.
--
-- based-on: mandate._admin_list_rows(jsonb, text) e91b8a5c177436a0544652023f6af3db0ff58aa573286b31ed31b39869ad7ec3
-- based-on: mandate._member_list_rows(text, uuid, uuid, text, text[]) 1bfa28d86b0325f8b7e635977cd70c05c3e49671725832944fd323e0b33f8842

CREATE OR REPLACE FUNCTION mandate._admin_list_rows(p_facts jsonb, p_q text)
 RETURNS TABLE(id uuid, mandate_key text, created_by uuid, organization_id uuid, is_system boolean, name text, feature_label text, goal text, description text, h_agent_name text, customized_by text[], serves text[], serves_detail text[], backs_count bigint, home_label text, h_agent_id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, vals jsonb, sortv jsonb, score integer)
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
  v_src boolean;
BEGIN
  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';
  p_facts := coalesce(p_facts, '{}'::jsonb);
  -- The source columns cost a whole-corpus scan read; only when asked.
  v_src := coalesce(p_facts->>'sources', '') = 'all';
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
      -- A PINNED version answers with ITS OWN declarations (2026-09-25):
      -- reading the live agent here made the list/peek show inputs and an
      -- output shape the job does not run with.
      CASE WHEN v.id IS NOT NULL THEN v.output_schema ELSE a.output_schema END AS h_output_schema,
      ARRAY(SELECT e->>'name' FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(coalesce(v.variable_definitions, a.variable_definitions)::jsonb) = 'array'
                   THEN coalesce(v.variable_definitions, a.variable_definitions)::jsonb ELSE '[]'::jsonb END) e
            WHERE jsonb_typeof(e) = 'object' AND coalesce(e->>'name', '') <> '')
      || ARRAY(SELECT e->>'key' FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(coalesce(v.context_policies, a.context_policies)::jsonb) = 'array'
                   THEN coalesce(v.context_policies, a.context_policies)::jsonb ELSE '[]'::jsonb END) e
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
      -- The system organization's own binding: a real override only when it
      -- changes what a member gets (see the header).
      bool_or(b.principal_type = 'org' AND b.organization_id = v_sys AND (
                b.holder_id IS DISTINCT FROM c.default_holder_id
             OR b.holder_version_id IS DISTINCT FROM c.default_holder_version_id
             OR coalesce(b.holder_type, 'agent') IS DISTINCT FROM coalesce(c.default_holder_type, 'agent')
             OR b.config_overrides IS NOT NULL
             OR b.consumption_map IS NOT NULL)) AS k_platform,
      -- The persisted contract verdict on each live binding (contract-check.ts).
      coalesce(bool_or(b.metadata->'contract_check'->>'state' = 'unmet'), false) AS k_unmet,
      coalesce(bool_or(b.metadata->'contract_check'->>'state' = 'met'), false) AS k_met
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
  -- ── Source facts (code-references/data.ts `fetchMandateSourceFacts`) ─────
  ref_types AS (
    SELECT cat.id AS t_id, cat.slug AS t_slug
    FROM platform.categories cat
    WHERE cat.dimension = 'mandate_reference_type' AND cat.deleted_at IS NULL
  ),
  refs AS (
    SELECT btrim(l.mandate_key) AS r_key,
           nullif(l.repo_slug, '') AS r_repo,
           coalesce(t.t_slug, '') IN ('declaration', 'family_declaration') AS r_decl,
           CASE lower(coalesce(l.language, ''))
             WHEN '' THEN NULL
             WHEN 'typescript' THEN 'TypeScript'
             WHEN 'javascript' THEN 'JavaScript'
             WHEN 'python' THEN 'Python'
             WHEN 'config' THEN 'Config'
             ELSE upper(left(l.language, 1)) || substr(l.language, 2) END AS r_lang
    FROM mandate.v_reference_latest l
    LEFT JOIN ref_types t ON t.t_id = l.reference_type_id
    WHERE v_src
      AND l.reference_type_id IS NOT NULL
      AND coalesce(t.t_slug, '') NOT IN ('bypass', 'unclassified')
      AND coalesce(btrim(l.mandate_key), '') <> ''
  ),
  src AS (
    SELECT r.r_key,
           coalesce(array_agg(DISTINCT r.r_repo ORDER BY r.r_repo)
                      FILTER (WHERE r.r_decl AND r.r_repo IS NOT NULL), ARRAY[]::text[]) AS r_declared,
           coalesce(array_agg(DISTINCT r.r_repo ORDER BY r.r_repo)
                      FILTER (WHERE NOT r.r_decl AND r.r_repo IS NOT NULL), ARRAY[]::text[]) AS r_called,
           coalesce(array_agg(DISTINCT r.r_lang ORDER BY r.r_lang)
                      FILTER (WHERE r.r_lang IS NOT NULL), ARRAY[]::text[]) AS r_langs,
           count(*) FILTER (WHERE NOT r.r_decl) AS r_sites
    FROM refs r
    GROUP BY r.r_key
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
      c.metadata->'default_holder_contract_check'->>'state' AS own_check,
      h.*,
      coalesce(k.k_n, 0) AS overrides_count,
      k.k_orgs, coalesce(k.k_personal, false) AS k_personal,
      coalesce(k.k_platform, false) AS k_platform,
      coalesce(k.k_unmet, false) AS k_unmet,
      coalesce(k.k_met, false) AS k_met,
      coalesce(bk.b_n, 0) AS backs_count,
      sv.s_kinds_raw, coalesce(sv.s_detail, ARRAY[]::text[]) AS serves_detail,
      CASE WHEN c.organization_id = v_sys THEN 'System'
           ELSE coalesce(ho.name, 'Organization') END AS home_label,
      coalesce(sr.r_declared, ARRAY[]::text[]) AS src_declared,
      coalesce(sr.r_called, ARRAY[]::text[]) AS src_called,
      coalesce(sr.r_langs, ARRAY[]::text[]) AS src_langs,
      coalesce(sr.r_sites, 0) AS src_sites
    FROM corpus c
    JOIN holder h ON h.h_id = c.id
    LEFT JOIN binds k ON k.k_id = c.id
    LEFT JOIN backs bk ON bk.b_key = c.mandate_key
    LEFT JOIN served sv ON sv.s_key = c.mandate_key
    LEFT JOIN iam.organizations ho ON ho.id = c.organization_id
    LEFT JOIN src sr ON sr.r_key = c.mandate_key
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
      -- WHO-MAY-FILL (owner ruling 2026-09-25): only the SYSTEM answer must be a
      -- system Holder. An org-homed job's default is its own organization's
      -- choice, so it is never 'not a system agent'.
      (s.is_system AND s.h_agent_read AND s.h_agent_type IS DISTINCT FROM 'builtin') AS v_nonsystem,
      -- CASE, not AND: the contract judge is the costly call, and only a
      -- pinned, readable holder of a job that requires output keys needs it.
      CASE WHEN s.h_has_pin AND s.h_agent_id IS NOT NULL AND s.h_agent_read
                AND cardinality(s.required_output_keys) > 0
           -- Same verdict as mandate.missing_output_keys (some required key
           -- the schema does not declare), with the schema read ONCE per row
           -- instead of once per required key.
           THEN NOT (s.required_output_keys <@ mandate.output_schema_keys(s.h_output_schema::jsonb))
           ELSE false END
        AS v_output_unmet,
      CASE WHEN s.own_check = 'unmet' OR s.k_unmet THEN 'Mismatch'
           WHEN s.own_check = 'met' OR s.k_met THEN 'Matches'
           ELSE 'Not checked' END AS contract_check
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
                AND NOT j.k_platform
           THEN ARRAY['Default']
           ELSE coalesce(j.k_orgs, ARRAY[]::text[])
                || CASE WHEN j.k_platform THEN ARRAY['Platform override'] ELSE ARRAY[]::text[] END
                || CASE WHEN j.k_personal THEN ARRAY['Personal'] ELSE ARRAY[]::text[] END
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
      -- THE STATUS (features/mandates/status/mandate-status.ts mandateStatusOf).
      'status',        to_jsonb(ARRAY[CASE WHEN NOT f.is_enabled THEN 'disabled'
                                     WHEN NOT f.h_has_pin AND f.fallback_mandate_key IS NULL AND f.overrides_count = 0 THEN 'draft'
                                     ELSE 'active' END]),
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
                                       ORDER BY bk.o)),
      'contractCheck', to_jsonb(ARRAY[f.contract_check])
    ) || CASE WHEN v_src THEN jsonb_build_object(
      'declaredRepos', to_jsonb(CASE WHEN cardinality(f.src_declared) = 0 THEN ARRAY['None found'] ELSE f.src_declared END),
      'calledFrom',    to_jsonb(CASE WHEN cardinality(f.src_called) = 0 THEN ARRAY['None found'] ELSE f.src_called END),
      'callSites',     to_jsonb(ARRAY[f.src_sites::text]),
      'languages',     to_jsonb(CASE WHEN cardinality(f.src_langs) = 0 THEN ARRAY['None found'] ELSE f.src_langs END)
    ) ELSE '{}'::jsonb END AS vals,
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
      -- Worst first when ascending: draft, disabled, active.
      'status',        CASE WHEN NOT f.is_enabled THEN 1
                            WHEN NOT f.h_has_pin AND f.fallback_mandate_key IS NULL AND f.overrides_count = 0 THEN 0
                            ELSE 2 END,
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
      'createdAt',     coalesce(to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
      -- Worst first when ascending: Mismatch, then Not checked, then Matches.
      'contractCheck', CASE f.contract_check WHEN 'Mismatch' THEN 0 WHEN 'Not checked' THEN 1 ELSE 2 END
    ) || CASE WHEN v_src THEN jsonb_build_object(
      'declaredRepos', lower(array_to_string(f.src_declared, ', ')),
      'calledFrom',    lower(array_to_string(f.src_called, ', ')),
      'callSites',     f.src_sites,
      'languages',     lower(array_to_string(f.src_langs, ', '))
    ) ELSE '{}'::jsonb END AS sortv,
    -- Relevance, ported from the one scorer (public.mtx_search_score) — never
    -- an unranked ILIKE (lib/entity-list/FEATURE.md rule 4).
    CASE WHEN p_q IS NULL THEN 0 ELSE public.mtx_search_score(
      p_q, f.id, f.name, coalesce(f.goal, ''), ARRAY[]::text[], NULL,
      ARRAY[f.mandate_key, f.feature_label, f.h_agent_name],
      f.customized_by || f.serves_detail || ARRAY[coalesce(f.description, '')],
      false) END AS score
  FROM finished f;
END;
$function$
;

CREATE OR REPLACE FUNCTION mandate._member_list_rows(p_q text, p_res_user uuid, p_res_org uuid, p_level text, p_keys text[])
 RETURNS TABLE(id uuid, mandate_key text, created_by uuid, organization_id uuid, is_system boolean, is_personal_home boolean, home_label text, name text, feature_label text, goal text, holder_type text, holder_id uuid, holder_name text, decided_by text, decided_rung text, pin_text text, customized_by text[], health text, origin text, visibility text, is_enabled boolean, updated_at timestamp with time zone, created_at timestamp with time zone, vals jsonb, sortv jsonb, score integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_sys uuid;
  v_res_org_name text;
BEGIN
  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';
  SELECT o.name INTO v_res_org_name FROM iam.organizations o WHERE o.id = p_res_org;
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
      -- KEYS PUSHED DOWN (2026-09-25): a caller that already knows the exact keys it wants
      -- (the feature Intelligence page) narrows the corpus here, so the ladder, holder and
      -- health work runs over those rows only — never the whole corpus filtered afterwards.
      AND (p_keys IS NULL OR m.mandate_key = ANY (p_keys))
      -- SHARE ≠ MOVE (2026-09-25): a mandate stays homed where its creator made it; sharing
      -- adds a grant (iam.permissions, what ShareModal writes) or publishes it. So the corpus
      -- is every home this seat belongs to PLUS every mandate granted to it PLUS every
      -- published one. RLS on mandate.definition is still the ceiling (this function is
      -- SECURITY INVOKER); this only decides what the list LOOKS at.
      AND (CASE WHEN p_level = 'organization'
                THEN m.organization_id = v_sys OR m.organization_id = p_res_org
                  OR m.visibility = 'public'
                  OR m.id IN (SELECT p.resource_id FROM iam.permissions p
                               WHERE p.resource_type = 'mandate'
                                 AND p.granted_to_organization_id = p_res_org
                                 AND p.status <> 'rejected'
                                 AND (p.expires_at IS NULL OR p.expires_at > now()))
                ELSE m.organization_id = v_sys
                  OR m.organization_id IN (SELECT iam.my_orgs())
                  OR m.created_by = v_uid
                  OR m.visibility = 'public'
                  OR m.id IN (SELECT p.resource_id FROM iam.permissions p
                               WHERE p.resource_type = 'mandate'
                                 AND (p.granted_to_user_id = v_uid
                                      OR p.granted_to_organization_id IN (SELECT iam.my_orgs()))
                                 AND p.status <> 'rejected'
                                 AND (p.expires_at IS NULL OR p.expires_at > now())) END)
  ),
  rungs AS (
    SELECT r.* FROM mandate._rungs(ARRAY(SELECT c.id FROM corpus c), p_res_user, p_res_org) r
  ),
  -- The rung that decides: the highest enabled rung that chose a holder and
  -- was not set aside (the system floor is only skipped when it fails the
  -- output contract — mnd_list_scoped's rule, FIX-R1c / FIX-R7).
  winner AS (
    SELECT DISTINCT ON (r.mandate_id)
           r.mandate_id AS w_id, r.rung AS w_rung, r.rung_order AS w_order,
           coalesce(r.holder_type, 'agent') AS w_type, r.holder_id AS w_holder_id,
           r.holder_version_id AS w_version_id, r.holder_live AS w_holder_live,
           r.version_live AS w_version_live
    FROM rungs r
    WHERE r.chose_holder AND r.is_enabled
      AND (r.dropped_reason IS NULL
           OR (r.binding_id IS NULL AND r.dropped_code IS DISTINCT FROM 'output_contract_unmet'))
    ORDER BY r.mandate_id, r.rung_order DESC
  ),
  sys_unmet AS (
    SELECT DISTINCT r.mandate_id AS u_id FROM rungs r
    WHERE r.binding_id IS NULL AND r.dropped_code = 'output_contract_unmet'
  ),
  dropped AS (
    SELECT DISTINCT ON (r.mandate_id) r.mandate_id AS d_id, r.rung_order AS d_order
    FROM rungs r
    WHERE r.binding_id IS NOT NULL AND r.chose_holder AND r.dropped_reason IS NOT NULL
    ORDER BY r.mandate_id, r.rung_order DESC
  ),
  -- Who customized it, from the viewer's seat (see header).
  mine_bound AS (
    SELECT b.mandate_id AS k_id,
      bool_or(p_level = 'person' AND b.principal_type = 'user' AND b.subject_user_id = v_uid) AS k_personal,
      array_agg(DISTINCT coalesce(o.name, 'Organization') ORDER BY coalesce(o.name, 'Organization'))
        FILTER (WHERE b.principal_type = 'org'
                  AND b.organization_id IS DISTINCT FROM v_sys
                  AND (CASE WHEN p_level = 'organization'
                            THEN b.organization_id = p_res_org
                            ELSE b.organization_id IN (SELECT iam.my_orgs()) END)) AS k_orgs
    FROM mandate.binding b
    JOIN corpus c ON c.id = b.mandate_id
    LEFT JOIN iam.organizations o ON o.id = b.organization_id
    WHERE b.deleted_at IS NULL
    GROUP BY b.mandate_id
  ),
  shaped AS MATERIALIZED (
    SELECT
      c.id AS s_id, c.mandate_key AS s_key, c.created_by AS s_created_by,
      c.organization_id AS s_org, (c.organization_id = v_sys) AS s_is_system,
      coalesce(ho.is_personal, false) AS s_personal_home,
      CASE WHEN c.organization_id = v_sys THEN 'System'
           WHEN coalesce(ho.is_personal, false) AND c.created_by = v_uid THEN 'Personal'
           -- Another person's personal workspace is never named: it is theirs.
           WHEN coalesce(ho.is_personal, false) AND c.visibility = 'public' THEN 'Community'
           WHEN coalesce(ho.is_personal, false) THEN 'Shared with you'
           ELSE coalesce(ho.name, 'An organization you are not in') END AS s_home,
      coalesce(NULLIF(btrim(c.label), ''),
        NULLIF(btrim(array_to_string(ARRAY(
          SELECT CASE WHEN w = '' THEN '' ELSE upper(left(w, 1)) || substr(w, 2) END
          FROM unnest(string_to_array(
                 coalesce((SELECT s FROM unnest(string_to_array(c.mandate_key, '.')) WITH ORDINALITY u(s, o)
                            WHERE s <> '' ORDER BY o DESC LIMIT 1), c.mandate_key), '_'))
                 WITH ORDINALITY z(w, o) ORDER BY o), ' ')), ''),
        c.mandate_key) AS s_name,
      CASE WHEN position('.' in c.mandate_key) <= 1 OR right(c.mandate_key, 1) = '.' THEN '(unscoped)'
           WHEN split_part(c.mandate_key, '.', 1) = 'shortcut' THEN 'Shortcuts'
           WHEN split_part(c.mandate_key, '.', 1) = 'app' THEN 'Agent apps'
           ELSE mandate._admin_list_pretty(split_part(c.mandate_key, '.', 1)) END AS s_feature,
      NULLIF(btrim(coalesce(c.goal, '')), '') AS s_goal,
      c.description AS s_description,
      CASE WHEN c.origin = 'code' THEN 'code' ELSE 'soft' END AS s_origin,
      c.visibility::text AS s_visibility,
      c.is_enabled AS s_enabled, c.updated_at AS s_updated, c.created_at AS s_created,
      c.required_output_keys AS s_required,
      w.w_id IS NOT NULL AS s_has_winner, w.w_rung, w.w_type,
      w.w_holder_live, w.w_version_live,
      (su.u_id IS NOT NULL) AS s_sys_unmet,
      (dr.d_id IS NOT NULL AND (w.w_id IS NULL OR dr.d_order > w.w_order)) AS s_set_aside,
      CASE WHEN w.w_type = 'agent' THEN coalesce(dv.agent_id, w.w_holder_id) ELSE w.w_holder_id END AS s_holder_id,
      w.w_version_id AS s_version_id,
      dv.version_number AS s_pinned_version,
      ad.name AS s_agent_name, ad.version AS s_latest_version,
      coalesce(ad.is_archived, false) AS s_agent_archived,
      (w.w_type = 'agent' AND ad.id IS NULL) AS s_agent_missing,
      ad.output_schema AS s_output_schema,
      wd.name AS s_workflow_name,
      coalesce(k.k_personal, false) AS s_personal_bound,
      coalesce(k.k_orgs, ARRAY[]::text[]) AS s_org_bound
    FROM corpus c
    LEFT JOIN iam.organizations ho ON ho.id = c.organization_id
    LEFT JOIN winner w ON w.w_id = c.id
    LEFT JOIN sys_unmet su ON su.u_id = c.id
    LEFT JOIN dropped dr ON dr.d_id = c.id
    LEFT JOIN mine_bound k ON k.k_id = c.id
    LEFT JOIN agent.definition_version dv
           ON w.w_type = 'agent' AND dv.id = w.w_version_id
    LEFT JOIN agent.definition ad
           ON w.w_type = 'agent' AND ad.id = coalesce(dv.agent_id, w.w_holder_id) AND ad.deleted_at IS NULL
    LEFT JOIN workflow.definition wd
           ON w.w_type = 'workflow' AND wd.id = w.w_holder_id
  ),
  finished AS MATERIALIZED (
    SELECT s.*,
      CASE WHEN NOT s.s_has_winner THEN 'None'
           WHEN s.w_type = 'workflow' THEN coalesce(s.s_workflow_name, 'A workflow you cannot open')
           ELSE coalesce(s.s_agent_name, 'An agent you cannot open') END AS f_holder,
      CASE s.w_rung
        WHEN 'user'   THEN 'You'
        WHEN 'org'    THEN coalesce(v_res_org_name, 'Your organization')
        WHEN 'system' THEN 'Default'
        ELSE 'Nobody' END AS f_decided,
      CASE WHEN NOT s.s_has_winner THEN 'None'
           WHEN s.s_version_id IS NOT NULL THEN coalesce('v' || s.s_pinned_version, 'Pinned')
           ELSE 'Latest' END AS f_pin,
      CASE WHEN NOT s.s_personal_bound AND cardinality(s.s_org_bound) = 0 THEN ARRAY['Default']
           ELSE s.s_org_bound || CASE WHEN s.s_personal_bound THEN ARRAY['Personal'] ELSE ARRAY[]::text[] END
      END AS f_customized,
      CASE
        WHEN NOT s.s_enabled THEN 'Turned off'
        WHEN NOT s.s_has_winner AND s.s_sys_unmet THEN 'Output does not match'
        WHEN NOT s.s_has_winner THEN 'Nothing bound'
        WHEN s.s_set_aside THEN 'Override set aside'
        WHEN s.s_agent_missing THEN 'Agent unavailable'
        WHEN s.s_agent_archived THEN 'Agent archived'
        WHEN s.w_holder_live IS FALSE OR s.w_version_live IS FALSE THEN 'Agent unavailable'
        WHEN s.w_type = 'agent'
             AND coalesce(cardinality(mandate.missing_output_keys(s.s_required, s.s_output_schema::jsonb)), 0) > 0
          THEN 'Output does not match'
        WHEN s.s_pinned_version IS NOT NULL AND s.s_latest_version IS NOT NULL
             AND s.s_latest_version > s.s_pinned_version THEN 'Newer version available'
        ELSE 'OK' END AS f_health
    FROM shaped s
  )
  SELECT
    f.s_id, f.s_key, f.s_created_by, f.s_org, f.s_is_system, f.s_personal_home, f.s_home,
    f.s_name, f.s_feature, f.s_goal,
    f.w_type, f.s_holder_id, f.f_holder, f.f_decided, f.w_rung, f.f_pin,
    f.f_customized, f.f_health, f.s_origin, f.s_visibility,
    f.s_enabled, f.s_updated, f.s_created,
    jsonb_build_object(
      'name',         to_jsonb(ARRAY[f.s_name]),
      'featureLabel', to_jsonb(ARRAY[f.s_feature]),
      'mandateKey',   to_jsonb(ARRAY[f.s_key]),
      'holderName',   to_jsonb(ARRAY[f.f_holder]),
      'holderType',   to_jsonb(ARRAY[coalesce(f.w_type, 'none')]),
      'decidedBy',    to_jsonb(ARRAY[f.f_decided]),
      'pinText',      to_jsonb(ARRAY[f.f_pin]),
      'customizedBy', to_jsonb(f.f_customized),
      'health',       to_jsonb(ARRAY[f.f_health]),
      'origin',       to_jsonb(ARRAY[f.s_origin]),
      'visibility',   to_jsonb(ARRAY[f.s_visibility]),
      'homeLabel',    to_jsonb(ARRAY[f.s_home]),
      'isEnabled',    to_jsonb(ARRAY[CASE WHEN f.s_enabled THEN 'true' ELSE 'false' END]),
      -- THE STATUS from this seat (features/mandates/status/mandate-status.ts).
      'status',       to_jsonb(ARRAY[CASE WHEN NOT f.s_enabled THEN 'disabled' WHEN NOT f.s_has_winner THEN 'draft' ELSE 'active' END]),
      'goal',         CASE WHEN f.s_goal IS NULL THEN '[]'::jsonb ELSE to_jsonb(ARRAY[f.s_goal]) END,
      'updatedAt',    to_jsonb(ARRAY(SELECT bk.b FROM buckets bk
                                     WHERE f.s_updated IS NOT NULL AND f.s_updated >= bk.since ORDER BY bk.o)),
      'createdAt',    to_jsonb(ARRAY(SELECT bk.b FROM buckets bk
                                     WHERE f.s_created IS NOT NULL AND f.s_created >= bk.since ORDER BY bk.o))
    ),
    jsonb_build_object(
      'name',         lower(f.s_name),
      'featureLabel', lower(f.s_feature),
      'mandateKey',   lower(f.s_key),
      'holderName',   lower(f.f_holder),
      'holderType',   coalesce(f.w_type, 'none'),
      'decidedBy',    lower(f.f_decided),
      'pinText',      lower(f.f_pin),
      'customizedBy', lower(array_to_string(f.f_customized, ', ')),
      'health',       lower(f.f_health),
      'origin',       f.s_origin,
      'visibility',   f.s_visibility,
      'homeLabel',    lower(f.s_home),
      'isEnabled',    CASE WHEN f.s_enabled THEN 1 ELSE 0 END,
      'status',       CASE WHEN NOT f.s_enabled THEN 1 WHEN NOT f.s_has_winner THEN 0 ELSE 2 END,
      'goal',         lower(coalesce(f.s_goal, '')),
      'updatedAt',    coalesce(to_char(f.s_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
      'createdAt',    coalesce(to_char(f.s_created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')
    ),
    CASE WHEN p_q IS NULL THEN 0 ELSE public.mtx_search_score(
      p_q, f.s_id, f.s_name, coalesce(f.s_goal, ''), ARRAY[]::text[], NULL,
      ARRAY[f.s_key, f.s_feature, f.f_holder],
      f.f_customized || ARRAY[coalesce(f.s_description, '')],
      false) END
  FROM finished f;
END;
$function$
;
