-- draft: mandate-cost-ui lane — proven on the clone; waiting for the owner's go before production
-- based-on: mandate._admin_list_rows(jsonb, text) 32b18425473d0956a750fefeeebe164d54aa71ffeb3d6323ef617c37f00956fb
-- based-on: mandate._admin_list_read(text, text, text, uuid, text, jsonb, text, text, integer, integer, jsonb) 282aa7531262db472b3256d194ca66287c9cdd2dfe8e222d80eba5d9ce8be853
--
-- THE ADMIN MANDATE LIST LEARNS MODEL AND SPEND (Arman, 2026-10-08: "show me
-- mandates and their costs … points and actual dollar amounts for a given
-- period … the current model … filter by one or more models").
--
-- mandate._admin_list_rows (the one row builder of both admin mandate doors):
--   * vals.model   — the default Holder's model first ('Workflow' for a
--                    workflow Holder, 'No holder' when none), then every other
--                    model a live binding's own Holder runs on. A select filter
--                    on `model` matches a mandate using ANY of the chosen models
--                    (mandate._admin_list_match), and the facets list them.
--   * sortv.model  — the default Holder's model.
--   * sortv.spendUsd / sortv.spendPoints — only when the client sends
--                    p_facts.spend ({mandate_key: usd}); read by the client
--                    from the usage ledger (platform.drill_ask, ai_usage by
--                    feature 'mandate:<key>') for the chosen period.
-- mandate._admin_list_read (page mode):
--   * rows[].models — vals.model, for the Model cell.
--   * spend_total   — the spend of every row the filters match, when sent.
-- Nothing is written; no table, index or grant changes. Inverse:
-- migrations/inverse/mnd_admin_list_model_and_spend_columns_down.sql.

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
      -- THE WHOLE PLATFORM (Arman, 2026-09-26): the admin seat never narrows to the viewer's own orgs.
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
      -- THE MODEL (mandate cost columns, 2026-10-08): a pinned version runs on
      -- ITS model; otherwise the agent's own.
      CASE WHEN v.id IS NOT NULL THEN v.model_id ELSE a.model_id END AS h_model_id,
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
  bind_models AS (
    -- Every live binding that names its own Holder, by the model that Holder
    -- runs on ('Workflow' for a workflow Holder). A binding that only changes
    -- configuration runs on the default Holder and adds nothing here.
    SELECT b.mandate_id AS bm_id,
           array_agg(DISTINCT CASE WHEN coalesce(b.holder_type, 'agent') = 'workflow' THEN 'Workflow'
                                   ELSE coalesce(NULLIF(btrim(bmd.common_name), ''), bmd.name, 'Model not set') END)
             AS bm_models
    FROM mandate.binding b
    JOIN corpus c ON c.id = b.mandate_id
    LEFT JOIN agent.definition_version bv
           ON bv.id = b.holder_version_id AND coalesce(b.holder_type, 'agent') <> 'workflow'
    LEFT JOIN agent.definition ba
           ON ba.id = coalesce(bv.agent_id, b.holder_id) AND coalesce(b.holder_type, 'agent') <> 'workflow'
    LEFT JOIN ai.model_definition bmd
           ON bmd.id = CASE WHEN bv.id IS NOT NULL THEN bv.model_id ELSE ba.model_id END
    WHERE b.deleted_at IS NULL
      AND (b.holder_id IS NOT NULL OR b.holder_version_id IS NOT NULL)
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
      FROM app.definition d
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.mandates) = 'array' THEN d.mandates ELSE '[]'::jsonb END) AS am(job)
      JOIN corpus c ON c.mandate_key = am.job->>'key'
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
      -- THE OWNER: System, or the organization that homes it, by its own name.
      mandate._admin_owner_label(c.organization_id, c.organization_id = v_sys) AS home_label,
      coalesce(sr.r_declared, ARRAY[]::text[]) AS src_declared,
      coalesce(sr.r_called, ARRAY[]::text[]) AS src_called,
      coalesce(sr.r_langs, ARRAY[]::text[]) AS src_langs,
      coalesce(sr.r_sites, 0) AS src_sites,
      CASE WHEN NOT h.h_has_pin THEN 'No holder'
           WHEN h.h_type = 'workflow' THEN 'Workflow'
           ELSE coalesce(NULLIF(btrim(dm.common_name), ''), dm.name, 'Model not set') END AS model_default,
      coalesce(bm.bm_models, ARRAY[]::text[]) AS bind_models
    FROM corpus c
    JOIN holder h ON h.h_id = c.id
    LEFT JOIN binds k ON k.k_id = c.id
    LEFT JOIN backs bk ON bk.b_key = c.mandate_key
    LEFT JOIN served sv ON sv.s_key = c.mandate_key
    LEFT JOIN iam.organizations ho ON ho.id = c.organization_id
    LEFT JOIN src sr ON sr.r_key = c.mandate_key
    LEFT JOIN bind_models bm ON bm.bm_id = c.id
    LEFT JOIN ai.model_definition dm ON dm.id = h.h_model_id
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
      'contractCheck', to_jsonb(ARRAY[f.contract_check]),
      -- THE MODEL: the default Holder's first, then every other model a
      -- binding runs on — a filter matches a mandate using ANY of them.
      'model',         to_jsonb(ARRAY[f.model_default]
                                || ARRAY(SELECT DISTINCT x FROM unnest(f.bind_models) x
                                         WHERE x <> f.model_default ORDER BY x))
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
      'contractCheck', CASE f.contract_check WHEN 'Mismatch' THEN 0 WHEN 'Not checked' THEN 1 ELSE 2 END,
      'model',         lower(f.model_default)
    ) || CASE WHEN p_facts ? 'spend' THEN jsonb_build_object(
      -- THE SPEND COLUMNS: the period's cost per mandate key, read by the client
      -- from the usage ledger (platform.drill_ask, ai_usage by feature) and
      -- packed into p_facts.spend. Points are dollars at one rate, so both
      -- columns sort on the same figure.
      'spendUsd',      coalesce((p_facts->'spend'->>f.mandate_key)::numeric, 0),
      'spendPoints',   coalesce((p_facts->'spend'->>f.mandate_key)::numeric, 0)
    ) ELSE '{}'::jsonb END || CASE WHEN v_src THEN jsonb_build_object(
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

CREATE OR REPLACE FUNCTION mandate._admin_list_read(p_lane text, p_mode text, p_scope text, p_org_id uuid, p_search text, p_filters jsonb, p_sort text, p_dir text, p_limit integer, p_offset integer, p_facts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_lane  text := lower(coalesce(p_lane, ''));
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
  -- THE TWO LANES (Arman, 2026-09-26). The admin mandate page manages the
  -- SYSTEM mandates and nothing else; looking into an organization's or a
  -- person's mandates is tech support and lives on its own route.
  IF v_lane = 'system' THEN
    IF v_scope <> 'system' THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = format('The admin mandate list manages system mandates only; %L is not one of its views.', p_scope),
        hint    = 'Look up an organization''s or a person''s mandates with public.mnd_admin_support_list (Mandate support lookup).';
    END IF;
  ELSIF v_lane = 'support' THEN
    IF v_scope NOT IN ('orgs', 'users', 'all') THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = format('p_scope %L is not a view of the mandate support lookup.', p_scope),
        hint    = 'Use orgs, users or all. System mandates are managed on the admin mandate list (public.mnd_admin_list).';
    END IF;
  ELSE
    RAISE EXCEPTION USING errcode = '22023',
      message = format('p_lane %L is not a lane of the admin mandate read.', p_lane),
      hint    = 'Use system (public.mnd_admin_list) or support (public.mnd_admin_support_list).';
  END IF;

  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';

  -- (rows come from mandate._admin_list_rows — one build per call)

  IF v_mode = 'agents' THEN
    SELECT coalesce(jsonb_agg(DISTINCT a), '[]'::jsonb) INTO v_out FROM (
      SELECT r.h_agent_id AS a FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE r.h_agent_id IS NOT NULL AND (v_lane = 'support' OR r.is_system)
      UNION
      SELECT coalesce(v.agent_id, b.holder_id)
      FROM mandate.binding b
      JOIN mandate._admin_list_rows(v_facts, v_q) r ON r.id = b.mandate_id
      LEFT JOIN agent.definition_version v ON v.id = b.holder_version_id
      WHERE b.deleted_at IS NULL AND coalesce(b.holder_type, 'agent') = 'agent'
        AND coalesce(v.agent_id, b.holder_id) IS NOT NULL
        AND (v_lane = 'support' OR r.is_system)
    ) x;
    RETURN v_out;
  END IF;

  IF v_mode = 'counts' THEN
    WITH narrowed AS (
      SELECT r.* FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE (v_q IS NULL OR r.score > 0) AND mandate._admin_list_match(r.vals, v_f)
    )
    SELECT CASE WHEN v_lane = 'system' THEN
      -- The management page has ONE corpus and no tabs: the system's own.
      jsonb_build_object('system', (SELECT count(*) FROM narrowed n WHERE n.is_system))
    ELSE jsonb_build_object(
      'users',  (SELECT count(*) FROM narrowed n WHERE mandate._admin_owner_level(n.organization_id, n.is_system) = 'user'),
      'all',    (SELECT count(*) FROM narrowed n),
      'orgs',   (SELECT count(*) FROM narrowed n WHERE mandate._admin_owner_level(n.organization_id, n.is_system) = 'org'),
      'orgs_narrow', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', o.organization_id, 'label', o.home_label, 'count', o.n)
                         ORDER BY o.home_label)
        FROM (SELECT n.organization_id, n.home_label, count(*) AS n
              FROM narrowed n WHERE mandate._admin_owner_level(n.organization_id, n.is_system) = 'org' AND n.organization_id IS NOT NULL
              GROUP BY 1, 2) o), '[]'::jsonb),
      'users_narrow', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', u.organization_id, 'label', u.owner_label, 'count', u.n)
                         ORDER BY u.owner_label)
        FROM (SELECT n.organization_id, mandate._admin_owner_label(n.organization_id, n.is_system) AS owner_label, count(*) AS n
              FROM narrowed n WHERE mandate._admin_owner_level(n.organization_id, n.is_system) = 'user' AND n.organization_id IS NOT NULL
              GROUP BY 1, 2) u), '[]'::jsonb)) END
    INTO v_out;
    RETURN v_out;
  END IF;

  IF v_mode = 'facets' THEN
    WITH scoped AS (
      SELECT r.* FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE (CASE v_scope
               WHEN 'system' THEN r.is_system
               WHEN 'all'    THEN true
               WHEN 'orgs'   THEN mandate._admin_owner_level(r.organization_id, r.is_system) = 'org' AND (p_org_id IS NULL OR r.organization_id = p_org_id)
               WHEN 'users'  THEN mandate._admin_owner_level(r.organization_id, r.is_system) = 'user' AND (p_org_id IS NULL OR r.organization_id = p_org_id)
               ELSE false
             END)
        AND (v_q IS NULL OR r.score > 0)
    )
    SELECT coalesce(jsonb_object_agg(c.col, c.opts), '{}'::jsonb) INTO v_out
    FROM (
      SELECT t.col, jsonb_agg(jsonb_build_object('value', t.val, 'count', t.n)
                              ORDER BY t.n DESC, t.val) AS opts
      FROM (
        -- One pass: each row's own keys, the match only when a filter is set.
        SELECT e.key AS col, v.val, count(*) AS n
        FROM scoped r
        CROSS JOIN LATERAL jsonb_each(r.vals) e
        CROSS JOIN LATERAL (SELECT DISTINCT x AS val
                            FROM jsonb_array_elements_text(e.value) x) v
        WHERE e.key NOT IN ('id', 'goal', 'updatedAt', 'createdAt')
          AND (v_f = '{}'::jsonb OR mandate._admin_list_match(r.vals, v_f, e.key))
        GROUP BY e.key, v.val
      ) t
      GROUP BY t.col
    ) c;
    RETURN v_out;
  END IF;

  -- page
  WITH scoped AS (
      SELECT r.* FROM mandate._admin_list_rows(v_facts, v_q) r
      WHERE (CASE v_scope
               WHEN 'system' THEN r.is_system
               WHEN 'all'    THEN true
               WHEN 'orgs'   THEN mandate._admin_owner_level(r.organization_id, r.is_system) = 'org' AND (p_org_id IS NULL OR r.organization_id = p_org_id)
               WHEN 'users'  THEN mandate._admin_owner_level(r.organization_id, r.is_system) = 'user' AND (p_org_id IS NULL OR r.organization_id = p_org_id)
               ELSE false
             END)
        AND (v_q IS NULL OR r.score > 0)
    ),
  matched AS (
    SELECT r.*, count(*) OVER () AS total
    FROM scoped r
    WHERE mandate._admin_list_match(r.vals, v_f)
  ),
  ordered AS MATERIALIZED (
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
  ),
  -- ── The page's own rows (header, 3) ─────────────────────────────────────
  page_defs AS MATERIALIZED (
    SELECT d.* FROM mandate.definition d
    WHERE d.deleted_at IS NULL AND d.id IN (SELECT o.id FROM ordered o)
  ),
  page_binds AS MATERIALIZED (
    SELECT b.* FROM mandate.binding b
    WHERE b.deleted_at IS NULL AND b.mandate_id IN (SELECT o.id FROM ordered o)
  ),
  rungs AS (
    SELECT coalesce(d.default_holder_type, 'agent') AS r_type,
           d.default_holder_id AS r_id, d.default_holder_version_id AS r_vid
    FROM page_defs d
    UNION ALL
    SELECT coalesce(b.holder_type, 'agent'), b.holder_id, b.holder_version_id
    FROM page_binds b
  ),
  agent_versions AS MATERIALIZED (
    SELECT v.id, v.agent_id, v.version_number, v.name,
           v.variable_definitions, v.context_policies, v.output_schema
    FROM agent.definition_version v
    WHERE v.id IN (SELECT r.r_vid FROM rungs r WHERE r.r_type <> 'workflow' AND r.r_vid IS NOT NULL)
  ),
  agents AS (
    SELECT a.id, a.name, a.version, a.is_archived, a.agent_type, a.auto_context_disabled,
           a.variable_definitions, a.context_policies, a.output_schema
    FROM agent.definition a
    WHERE a.id IN (SELECT r.r_id FROM rungs r WHERE r.r_type <> 'workflow' AND r.r_id IS NOT NULL
                   UNION SELECT av.agent_id FROM agent_versions av WHERE av.agent_id IS NOT NULL)
  ),
  workflows AS (
    SELECT w.id, w.name, w.is_archived
    FROM workflow.definition w
    WHERE w.id IN (SELECT r.r_id FROM rungs r WHERE r.r_type = 'workflow' AND r.r_id IS NOT NULL)
  ),
  workflow_versions AS (
    SELECT wv.id, wv.definition_id, wv.version_number
    FROM workflow.definition_version wv
    WHERE wv.id IN (SELECT r.r_vid FROM rungs r WHERE r.r_type = 'workflow' AND r.r_vid IS NOT NULL)
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
        'owner_level', mandate._admin_owner_level(o.organization_id, o.is_system),
        'owner_label', mandate._admin_owner_label(o.organization_id, o.is_system),
        'feature_label', o.feature_label,
        'contract_check', o.vals->'contractCheck'->>0,
        -- Mandate Candidates (F4): the open candidate's cell, derived from its
        -- child rows every read (never stored twice). NULL = no open candidate.
        'candidate', mandate._admin_list_candidate(o.id),
        -- THE MODEL: default Holder's model first, then each other model a binding runs on.
        'models', o.vals->'model')) FROM ordered o), '[]'::jsonb),
    -- THE SPEND TOTAL of every row the filters match (all pages), when the
    -- client sent the period's spend; absent otherwise.
    'spend_total', CASE WHEN v_facts ? 'spend'
                        THEN (SELECT coalesce(sum((m.sortv->>'spendUsd')::numeric), 0) FROM matched m) END,
    'console', jsonb_build_object(
      'mandates', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.mandate_key) FROM page_defs d), '[]'::jsonb),
      'bindings', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at) FROM page_binds b), '[]'::jsonb),
      'agents', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM agents a), '[]'::jsonb),
      'versions', coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM agent_versions v), '[]'::jsonb),
      'workflows', coalesce((SELECT jsonb_agg(to_jsonb(w)) FROM workflows w), '[]'::jsonb),
      'workflow_versions', coalesce((SELECT jsonb_agg(to_jsonb(wv)) FROM workflow_versions wv), '[]'::jsonb)))
  INTO v_out;
  RETURN v_out;
END;
$function$;
