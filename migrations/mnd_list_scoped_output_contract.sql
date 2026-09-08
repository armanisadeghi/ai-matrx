-- mnd_list_scoped: the list judges the OUTPUT half of the contract (FIX-R5)
--
-- THE FINDING (campaign one-resolution, FIX-R4 walk 1, finding 1, left unfixed
-- there and named rather than absorbed): the mandates LIST reported `ok` for a
-- mandate whose holder cannot produce the keys the mandate requires, while the
-- single-mandate admin page — three inches away on the same screen — printed
-- the failure in red. `enforced_holder_contract` keeps the OUTPUT half of a
-- mandate's contract in force ALWAYS, so that holder fails at run time.
--
-- The rule is NOT re-implemented here. `mandate.missing_output_keys` /
-- `mandate.output_schema_keys` (aidream migration 0597) are the one SQL mirror
-- of aidream's `_schema_keys` and the frontend's `outputSchemaKeys`; this door
-- calls them. A holder that declares NO structured output fails every required
-- key — which is what the server already says, in those words — so `NULL` is a
-- verdict here, never a shrug: a SQL door reading `agent.definition` directly is
-- never in the "unread" state the client-side model has to carry.
--
-- Three changes, nothing else:
--   * `resolved` carries the mandate's `required_output_keys`;
--   * `enriched` computes `r_missing_output_keys` from it and the winning
--     holder's `output_schema`;
--   * the health ladder gains `'output contract unmet'`, ranked exactly where
--     the console's own model ranks it — after the reachability verdicts, before
--     drift.
--
-- Plain CREATE OR REPLACE: the signature and the 25-column return shape are
-- UNTOUCHED, so no client type regeneration. Rows changed: 0.

CREATE OR REPLACE FUNCTION public.mnd_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'label'::text, p_dir text DEFAULT 'asc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_home text DEFAULT 'all'::text, p_resolution_for text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, mandate_key text, label text, description text, feature text, provision_key text, offered_count integer, input_kind text, output_kind text, is_enabled boolean, resolved_layer text, resolved_agent_id uuid, resolved_agent_name text, resolved_agent_type text, resolved_use_latest boolean, pinned_version_number integer, latest_version integer, drift text, health text, has_settings_override boolean, updated_at timestamp with time zone, total_count bigint, holder_live boolean, version_live boolean, home_organization_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_q      text := NULLIF(btrim(coalesce(p_search, '')), '');
  v_f      jsonb := coalesce(p_filters, '{}'::jsonb);
  v_sort   text := coalesce(p_sort, 'label');
  v_dir    text := CASE WHEN lower(coalesce(p_dir,'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  v_sys    uuid;
  -- OWNERSHIP — whose mandates are in the corpus at all.
  v_home     text := lower(btrim(coalesce(p_home, 'all')));
  v_home_org uuid;
  -- RESOLUTION — whose ladder is shown for each of them. 'mine' answers "who
  -- fulfils this job FOR ME, in the organization I am working in"; 'org'
  -- answers "who fulfils it for EVERY MEMBER of this organization" — the only
  -- honest answer on an org-settings page, where the admin's own personal
  -- override is irrelevant and used to win anyway.
  v_res      text := lower(coalesce(NULLIF(btrim(coalesce(p_resolution_for,'')),''), p_scope, 'mine'));
  v_res_org  uuid;
  v_res_user uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.key = 'system';

  -- ---- ownership -----------------------------------------------------------
  IF v_home = 'system' THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION USING
        errcode = '42501',
        message = 'Only a platform administrator can list the system organization''s mandates.',
        detail  = 'System mandates decide for every user on the platform, so their list is admin-only.',
        hint    = 'Ask for your own organizations instead: p_home => ''all'', or p_home => ''org:<organization id>''.';
    END IF;
  ELSIF v_home LIKE 'org:%' THEN
    BEGIN
      v_home_org := substring(v_home from 5)::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING
        errcode = '22P02',
        message = format('p_home %L is not a valid organization selector.', p_home),
        hint    = 'Use ''all'', ''system'', or ''org:<organization uuid>''.';
    END;
    IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                    WHERE om.user_id = v_uid AND om.organization_id = v_home_org) THEN
      RAISE EXCEPTION USING
        errcode = '42501',
        message = 'You are not a member of that organization, so its mandates are not yours to list.',
        detail  = format('Organization %L has no membership row for you.', v_home_org),
        hint    = 'Switch to an organization you belong to, or ask an administrator there to add you.';
    END IF;
  ELSIF v_home <> 'all' THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = format('p_home %L is not a home selector.', p_home),
      hint    = 'Use ''all'' (the system organization plus every organization you belong to), ''system'', or ''org:<organization uuid>''.';
  END IF;

  -- ---- resolution ----------------------------------------------------------
  IF v_res NOT IN ('mine', 'org') THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = format('p_resolution_for %L is not a resolution scope.', v_res),
      hint    = 'Use ''mine'' (who fulfils this for me, in the organization I pass) or ''org'' (who fulfils it for every member of the organization I pass).';
  END IF;

  IF v_res = 'org' THEN
    IF p_org_id IS NULL THEN
      RAISE EXCEPTION USING
        errcode = '22023',
        message = 'Resolving for an organization needs to know which one.',
        hint    = 'Pass p_org_id, or ask for p_resolution_for => ''mine''.';
    END IF;
    v_res_user := NULL;   -- personal overrides are excluded, deliberately
  ELSE
    v_res_user := v_uid;
  END IF;

  -- Every organization the caller NAMES is proved. A stale organization after
  -- an org switch is told so; it never silently resolves as somebody else's.
  IF p_org_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                    WHERE om.user_id = v_uid AND om.organization_id = p_org_id) THEN
      RAISE EXCEPTION USING
        errcode = '42501',
        message = 'You are not a member of that organization, so its resolution is not yours to see.',
        detail  = format('Organization %L has no membership row for you.', p_org_id),
        hint    = 'Switch to an organization you belong to before asking what it runs.';
    END IF;
    v_res_org := p_org_id;
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    WHERE om.user_id = v_uid
  ),
  owned AS (
    SELECT m.*
    FROM mandate.definition m
    WHERE m.deleted_at IS NULL
      AND coalesce(m.metadata->>'migration_status','') <> 'placeholder'
      AND (
        CASE
          WHEN v_home = 'system'     THEN m.organization_id = v_sys
          WHEN v_home LIKE 'org:%'   THEN m.organization_id = v_home_org
          ELSE m.organization_id = v_sys
               OR m.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
        END
      )
  ),
  -- THE ONE LADDER. Not a copy of it.
  rungs AS (
    SELECT r.*
    FROM mandate._rungs(ARRAY(SELECT o.id FROM owned o), v_res_user, v_res_org) r
  ),
  -- The DISPLAY projection: this list is Agent-shaped, so the row it shows is
  -- the highest rung that chose an AGENT holder and is enabled. Settings-only
  -- rungs never move the layer; they raise has_settings_override.
  winner AS (
    SELECT DISTINCT ON (r.mandate_id)
           r.mandate_id AS w_id, r.rung AS w_rung, r.holder_id AS w_agent_id,
           r.holder_version_id AS w_version_id, r.holder_live AS w_holder_live,
           r.version_live AS w_version_live
    FROM rungs r
    WHERE r.chose_holder AND r.is_enabled AND r.holder_type = 'agent'
      -- FIX-R1c: a BINDING rung the ladder has already dropped cannot be named
      -- as the resolution. The SYSTEM rung (binding_id IS NULL) is the floor
      -- and is never skipped — Python does not drop it either, so skipping it
      -- here would invent a second disagreement to replace the one being fixed.
      AND (r.binding_id IS NULL OR r.dropped_reason IS NULL)
    ORDER BY r.mandate_id, r.rung_order DESC
  ),
  -- The highest BINDING rung that was set aside — the news this row carries.
  dropped AS (
    SELECT DISTINCT ON (r.mandate_id)
           r.mandate_id AS d_id, r.rung AS d_rung
    FROM rungs r
    WHERE r.binding_id IS NOT NULL AND r.chose_holder
      AND r.holder_type = 'agent' AND r.dropped_reason IS NOT NULL
    ORDER BY r.mandate_id, r.rung_order DESC
  ),
  settings AS (
    SELECT DISTINCT r.mandate_id AS s_id
    FROM rungs r
    WHERE r.is_enabled AND r.config_overrides IS NOT NULL AND r.binding_id IS NOT NULL
  ),
  resolved AS (
    SELECT
      m.id            AS r_id,
      m.mandate_key   AS r_key,
      m.label         AS r_label,
      m.description   AS r_description,
      split_part(m.mandate_key, '.', 1) AS r_feature,
      m.provision_key AS r_provision_key,
      NULL::text      AS r_input_kind,
      m.output_kind   AS r_output_kind,
      m.is_enabled    AS r_enabled,
      m.updated_at    AS r_updated_at,
      m.organization_id AS r_home_org,
      m.required_output_keys AS r_required_output_keys,
      coalesce(w.w_rung, 'system')      AS r_layer,
      w.w_agent_id                      AS r_agent_id_raw,
      w.w_version_id                    AS r_version_id,
      (w.w_version_id IS NULL)          AS r_use_latest,
      w.w_holder_live                   AS r_holder_live,
      w.w_version_live                  AS r_version_live,
      (sb.s_id IS NOT NULL)             AS r_has_settings,
      dr.d_rung                         AS r_dropped_rung,
      coalesce(jsonb_array_length(pr.offered_values), 0) AS r_offered_count
    FROM owned m
    LEFT JOIN winner w   ON w.w_id = m.id
    LEFT JOIN dropped dr ON dr.d_id = m.id
    LEFT JOIN settings sb ON sb.s_id = m.id
    LEFT JOIN mandate.provision pr
           ON pr.provision_key = m.provision_key AND pr.deleted_at IS NULL
  ),
  enriched AS (
    SELECT
      r.*,
      coalesce(dv.agent_id, r.r_agent_id_raw) AS r_agent_id,
      dv.version_number AS r_pinned_version,
      d.name        AS r_agent_name,
      d.agent_type  AS r_agent_type,
      d.version     AS r_latest_version,
      d.is_archived AS r_agent_archived,
      (d.id IS NULL) AS r_agent_missing,
      -- THE OUTPUT HALF OF THE CONTRACT (FIX-R5). `enforced_holder_contract`
      -- keeps it in force ALWAYS, so a holder that cannot produce the mandate's
      -- required keys fails at run time -- and this list called that `ok` while
      -- the single-mandate admin page called the same holder broken, on the same
      -- screen (FIX-R4, walk finding 1). Judged by mandate.missing_output_keys,
      -- the ONE SQL mirror of aidream's `_schema_keys` and the frontend's
      -- `outputSchemaKeys`; a NULL schema declares nothing and so fails every
      -- required key, which is exactly what the server already says in words.
      -- `agent.definition.output_schema` is `json`, not `jsonb`; the cast is
      -- explicit so a future column-type change fails loudly here rather than
      -- silently resolving to a different overload.
      mandate.missing_output_keys(r.r_required_output_keys, d.output_schema::jsonb)
        AS r_missing_output_keys
    FROM resolved r
    LEFT JOIN agent.definition_version dv ON dv.id = r.r_version_id
    LEFT JOIN agent.definition d
           ON d.id = coalesce(dv.agent_id, r.r_agent_id_raw)
          AND d.deleted_at IS NULL
  ),
  shaped AS (
    SELECT
      e.*,
      CASE WHEN e.r_pinned_version IS NOT NULL AND e.r_latest_version IS NOT NULL
                AND e.r_latest_version > e.r_pinned_version
           THEN 'v' || e.r_pinned_version || ' → v' || e.r_latest_version
           ELSE NULL END AS r_drift,
      CASE WHEN NOT e.r_enabled THEN 'disabled'
           -- FIX-R1c: name the rung that was set aside, so `health` and
           -- `resolved_layer` can never disagree again.
           WHEN e.r_dropped_rung IS NOT NULL THEN e.r_dropped_rung || ' rung dropped'
           WHEN e.r_agent_missing THEN 'holder missing'
           WHEN coalesce(e.r_agent_archived, false) THEN 'holder archived'
           WHEN e.r_holder_live IS FALSE THEN 'holder unreachable'
           WHEN e.r_version_live IS FALSE THEN 'version unreachable'
           -- FIX-R5: ranked exactly where the console's own model ranks it --
           -- after the reachability verdicts (a holder you cannot open is a
           -- bigger fact than one whose shape is wrong) and BEFORE drift.
           WHEN coalesce(cardinality(e.r_missing_output_keys), 0) > 0
                THEN 'output contract unmet'
           WHEN e.r_pinned_version IS NOT NULL AND e.r_latest_version IS NOT NULL
                AND e.r_latest_version > e.r_pinned_version THEN 'drift'
           ELSE 'ok' END AS r_health
    FROM enriched e
  ),
  filtered AS (
    SELECT s.* FROM shaped s
    WHERE
      (NOT v_f ? 'label'
        OR s.r_label ILIKE '%' || (v_f->'label'->>'value') || '%'
        OR s.r_key   ILIKE '%' || (v_f->'label'->>'value') || '%')
      AND (NOT v_f ? 'feature'
        OR s.r_feature IN (SELECT jsonb_array_elements_text(v_f->'feature'->'values')))
      AND (NOT v_f ? 'layer'
        OR s.r_layer IN (SELECT jsonb_array_elements_text(v_f->'layer'->'values')))
      AND (NOT v_f ? 'output_kind'
        OR coalesce(NULLIF(s.r_output_kind,''),'__none__')
           IN (SELECT jsonb_array_elements_text(v_f->'output_kind'->'values')))
      AND (NOT v_f ? 'health'
        OR s.r_health IN (SELECT jsonb_array_elements_text(v_f->'health'->'values')))
      AND (NOT v_f ? 'fulfilled_by'
        OR s.r_agent_name ILIKE '%' || (v_f->'fulfilled_by'->>'value') || '%')
      AND (NOT v_f ? 'inputs'
        OR ((v_f->'inputs'->>'value')::boolean = (s.r_provision_key IS NOT NULL)))
      -- COVERAGE BADGE narrowing. The three-state classification lives in ONE
      -- place — aidream services/mandates/coverage.py, read over
      -- GET /mandates/coverage/states — and what arrives here is only the KEY
      -- LIST that server already classified.
      AND (NOT v_f ? 'coverage_keys'
        OR s.r_key IN (SELECT jsonb_array_elements_text(v_f->'coverage_keys'->'values')))
      AND (NOT v_f ? 'updated'
        OR (v_f->'updated'->'values'->>0) IS NULL
        OR s.r_updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
  ),
  scored AS (
    SELECT f.*,
      CASE WHEN v_q IS NULL THEN 0
        ELSE public.mtx_search_score(
          v_q, f.r_id, f.r_label, coalesce(f.r_description,''),
          ARRAY[]::text[], NULL,
          ARRAY[f.r_key, coalesce(f.r_provision_key,'')],
          ARRAY[f.r_feature, coalesce(f.r_agent_name,'')],
          false)
      END AS s_score
    FROM filtered f
  ),
  counted AS (
    SELECT sc.*, count(*) OVER () AS s_total
    FROM scored sc
    WHERE v_q IS NULL OR sc.s_score > 0
  )
  SELECT
    c.r_id, c.r_key, c.r_label, c.r_description, c.r_feature,
    c.r_provision_key, c.r_offered_count, c.r_input_kind, c.r_output_kind,
    c.r_enabled, c.r_layer, c.r_agent_id, c.r_agent_name,
    c.r_agent_type::text, c.r_use_latest, c.r_pinned_version,
    c.r_latest_version, c.r_drift, c.r_health, c.r_has_settings,
    c.r_updated_at, c.s_total,
    c.r_holder_live, c.r_version_live, c.r_home_org
  FROM counted c
  ORDER BY
    CASE WHEN v_q IS NOT NULL THEN c.s_score END DESC,
    CASE WHEN v_sort = 'label'   AND v_dir = 'asc'  THEN c.r_label END ASC,
    CASE WHEN v_sort = 'label'   AND v_dir = 'desc' THEN c.r_label END DESC,
    CASE WHEN v_sort = 'feature' AND v_dir = 'asc'  THEN c.r_feature END ASC,
    CASE WHEN v_sort = 'feature' AND v_dir = 'desc' THEN c.r_feature END DESC,
    CASE WHEN v_sort = 'fulfilled_by' AND v_dir = 'asc'  THEN c.r_agent_name END ASC,
    CASE WHEN v_sort = 'fulfilled_by' AND v_dir = 'desc' THEN c.r_agent_name END DESC,
    CASE WHEN v_sort = 'layer'   AND v_dir = 'asc'  THEN c.r_layer END ASC,
    CASE WHEN v_sort = 'layer'   AND v_dir = 'desc' THEN c.r_layer END DESC,
    CASE WHEN v_sort = 'inputs'  AND v_dir = 'asc'  THEN c.r_offered_count END ASC,
    CASE WHEN v_sort = 'inputs'  AND v_dir = 'desc' THEN c.r_offered_count END DESC,
    CASE WHEN v_sort = 'output_kind' AND v_dir = 'asc'  THEN c.r_output_kind END ASC NULLS LAST,
    CASE WHEN v_sort = 'output_kind' AND v_dir = 'desc' THEN c.r_output_kind END DESC NULLS LAST,
    CASE WHEN v_sort = 'health'  AND v_dir = 'asc'  THEN c.r_health END ASC,
    CASE WHEN v_sort = 'health'  AND v_dir = 'desc' THEN c.r_health END DESC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'asc'  THEN c.r_updated_at END ASC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'desc' THEN c.r_updated_at END DESC,
    c.r_label ASC,
    c.r_id ASC
  LIMIT greatest(coalesce(p_limit, 25), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$
;
