-- mandate._admin_list_rows — 'not a system agent' only for a SYSTEM-homed job.
--
-- based-on: mandate._admin_list_rows(jsonb, text) bbec3e41e027d23d6376b21521e808f4fb5018b2d22a31d637fe3156df511207
--
-- Review 2026-09-25: the Health filter showed org-homed jobs held by their own
-- organization's agent as 'not a system agent'. The who-may-fill law (owner
-- ruling 2026-09-25, aidream bindings.py _unrunnable_holder_sentence) requires a
-- system Holder ONLY for the system answer: a system-homed job's default. Live
-- data: every system-homed default is a builtin system agent; 265 org-homed
-- defaults are the org's own agents, which is lawful. Twin: mandate-health.ts buildRow.
-- Body = the LIVE definition (pg_get_functiondef) with only that edit.

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
$function$;
