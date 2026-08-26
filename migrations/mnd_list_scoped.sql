-- mnd_list_scoped — the Mandates browse surface (/agents/mandates) RPC triple.
--
-- Mandates are platform rows (system-org, public visibility): every caller sees
-- the same registry, so this surface declares the single scope 'mine' and the
-- scope machinery collapses (the canvas/maps precedent, formalized here as an
-- RPC because the PER-CALLER columns below cannot ride PostgREST honestly:
-- resolved_layer needs the caller's user+org bindings, drift needs the
-- definition_version join, and every column must sort/filter server-side).
--
-- Invariants carried from the template (lib/list-scope/FEATURE.md):
-- ORDER BY ends in id · deleted_at IS NULL · count(*) OVER () AS total_count ·
-- one p_filters jsonb bag · everything filters/sorts server-side · SECURITY
-- DEFINER enforces membership itself (the org-binding leg joins
-- iam.organization_member on auth.uid(); no passed-in org id is trusted) ·
-- qualified relation columns · enums cast at the wire.
-- Relevance: public.mtx_search_score (THE generic scorer), never a new copy.
-- Date buckets: public.agx_since_bucket (existing generic bucket→timestamp).

CREATE OR REPLACE FUNCTION public.mnd_list_scoped(
  p_scope     text    DEFAULT 'mine',
  p_org_id    uuid    DEFAULT NULL,
  p_search    text    DEFAULT NULL,
  p_sort      text    DEFAULT 'label',
  p_dir       text    DEFAULT 'asc',
  p_filters   jsonb   DEFAULT '{}'::jsonb,
  p_limit     integer DEFAULT 25,
  p_offset    integer DEFAULT 0
)
RETURNS TABLE(
  id                    uuid,
  mandate_key           text,
  label                 text,
  description           text,
  feature               text,
  provision_key         text,
  offered_count         integer,
  input_kind            text,
  output_kind           text,
  is_enabled            boolean,
  resolved_layer        text,      -- 'user' | 'org' | 'system' for THIS caller
  resolved_agent_id     uuid,      -- master definition id of the effective Holder
  resolved_agent_name   text,
  resolved_agent_type   text,
  resolved_use_latest   boolean,
  pinned_version_number integer,   -- NULL when floating
  latest_version        integer,
  drift                 text,      -- 'v2 → v4' when pinned and behind, else NULL
  health                text,      -- 'ok'|'drift'|'holder archived'|'holder missing'|'disabled'
  has_settings_override boolean,
  updated_at            timestamptz,
  total_count           bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_q      text := NULLIF(btrim(coalesce(p_search, '')), '');
  v_f      jsonb := coalesce(p_filters, '{}'::jsonb);
  v_sort   text := coalesce(p_sort, 'label');
  v_dir    text := CASE WHEN lower(coalesce(p_dir,'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH my_orgs AS (
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    WHERE om.user_id = v_uid
  ),
  -- The caller's deciding bindings. Only an agent-swapping binding moves the
  -- layer (mirrors resolve_mandate); settings-only bindings surface separately.
  user_b AS (
    SELECT DISTINCT ON (b.mandate_id)
           b.mandate_id AS ub_mandate_id, b.agent_id AS ub_agent_id,
           b.agent_version_id AS ub_version_id, b.use_latest AS ub_use_latest,
           b.updated_at AS ub_updated_at
    FROM agent.mandate_binding b
    WHERE b.deleted_at IS NULL AND b.is_enabled
      AND b.principal_type = 'user' AND b.subject_user_id = v_uid
      AND (b.agent_id IS NOT NULL OR b.agent_version_id IS NOT NULL)
    ORDER BY b.mandate_id, b.updated_at DESC, b.id
  ),
  org_b AS (
    SELECT DISTINCT ON (b.mandate_id)
           b.mandate_id AS ob_mandate_id, b.agent_id AS ob_agent_id,
           b.agent_version_id AS ob_version_id, b.use_latest AS ob_use_latest
    FROM agent.mandate_binding b
    JOIN my_orgs mo ON mo.org_id = b.organization_id
    WHERE b.deleted_at IS NULL AND b.is_enabled
      AND b.principal_type = 'org'
      AND (b.agent_id IS NOT NULL OR b.agent_version_id IS NOT NULL)
    ORDER BY b.mandate_id, b.updated_at DESC, b.id
  ),
  settings_b AS (
    SELECT DISTINCT b.mandate_id AS sb_mandate_id
    FROM agent.mandate_binding b
    WHERE b.deleted_at IS NULL AND b.is_enabled
      AND b.config_overrides IS NOT NULL
      AND (
        (b.principal_type = 'user' AND b.subject_user_id = v_uid)
        OR (b.principal_type = 'org'
            AND b.organization_id IN (SELECT mo2.org_id FROM my_orgs mo2))
      )
  ),
  resolved AS (
    SELECT
      m.id            AS r_id,
      m.mandate_key   AS r_key,
      m.label         AS r_label,
      m.description   AS r_description,
      split_part(m.mandate_key, '.', 1) AS r_feature,
      m.provision_key AS r_provision_key,
      m.input_kind    AS r_input_kind,
      m.output_kind   AS r_output_kind,
      m.is_enabled    AS r_enabled,
      m.updated_at    AS r_updated_at,
      CASE WHEN ub.ub_mandate_id IS NOT NULL THEN 'user'
           WHEN ob.ob_mandate_id IS NOT NULL THEN 'org'
           ELSE 'system' END AS r_layer,
      CASE WHEN ub.ub_mandate_id IS NOT NULL THEN ub.ub_agent_id
           WHEN ob.ob_mandate_id IS NOT NULL THEN ob.ob_agent_id
           ELSE m.default_agent_id END AS r_agent_id_raw,
      CASE WHEN ub.ub_mandate_id IS NOT NULL THEN ub.ub_version_id
           WHEN ob.ob_mandate_id IS NOT NULL THEN ob.ob_version_id
           ELSE m.default_agent_version_id END AS r_version_id,
      CASE WHEN ub.ub_mandate_id IS NOT NULL THEN coalesce(ub.ub_use_latest, false)
           WHEN ob.ob_mandate_id IS NOT NULL THEN coalesce(ob.ob_use_latest, false)
           ELSE coalesce(m.use_latest, false) END AS r_use_latest,
      (sb.sb_mandate_id IS NOT NULL) AS r_has_settings,
      coalesce(jsonb_array_length(pr.offered_values), 0) AS r_offered_count
    FROM agent.mandate m
    LEFT JOIN user_b ub ON ub.ub_mandate_id = m.id
    LEFT JOIN org_b  ob ON ob.ob_mandate_id = m.id
    LEFT JOIN settings_b sb ON sb.sb_mandate_id = m.id
    LEFT JOIN agent.provision pr
           ON pr.provision_key = m.provision_key AND pr.deleted_at IS NULL
    WHERE m.deleted_at IS NULL
      AND coalesce(m.metadata->>'migration_status','') <> 'placeholder'
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
      (d.id IS NULL) AS r_agent_missing
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
           WHEN e.r_agent_missing THEN 'holder missing'
           WHEN coalesce(e.r_agent_archived, false) THEN 'holder archived'
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
    c.r_updated_at, c.s_total
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
$function$;

REVOKE ALL ON FUNCTION public.mnd_list_scoped(text,uuid,text,text,text,jsonb,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.mnd_list_scoped(text,uuid,text,text,text,jsonb,integer,integer) TO authenticated;

-- Counts: one scope, so one number — but the shape matches the shell contract.
CREATE OR REPLACE FUNCTION public.mnd_list_scope_counts(
  p_search text DEFAULT NULL
)
RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 'mine'::text, NULL::uuid, NULL::text, count(*)::bigint
  FROM public.mnd_list_scoped('mine', NULL, p_search, 'label', 'asc',
                              '{}'::jsonb, 1000000, 0) r;
END;
$function$;

REVOKE ALL ON FUNCTION public.mnd_list_scope_counts(text) FROM public;
GRANT EXECUTE ON FUNCTION public.mnd_list_scope_counts(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mnd_list_facets(
  p_search text DEFAULT NULL
)
RETURNS TABLE(kind text, value text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT r.feature AS b_feature, r.resolved_layer AS b_layer,
           r.output_kind AS b_output_kind, r.health AS b_health
    FROM public.mnd_list_scoped('mine', NULL, p_search, 'label', 'asc',
                                '{}'::jsonb, 1000000, 0) r
  )
  SELECT 'feature'::text, b.b_feature, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'layer'::text, b.b_layer, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'output_kind'::text, COALESCE(NULLIF(b.b_output_kind,''),'__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'health'::text, b.b_health, count(*) FROM base b GROUP BY 2;
END;
$function$;

REVOKE ALL ON FUNCTION public.mnd_list_facets(text) FROM public;
GRANT EXECUTE ON FUNCTION public.mnd_list_facets(text) TO authenticated;
