-- based-on: mandate._member_list_rows(text, uuid, uuid, text, text[]) 58f8dcf88c85e3cb120ae08ed7c29732992307a6658388962b6da8d5438fffe8
-- mandate_org_default_lists_adopted.sql
--
-- ORG DEFAULT FOR A SHARED MANDATE, the list half (companion of
-- mandate_org_default_for_shared_mandate.sql). The member list's corpus
-- (mandate._member_list_rows) looked only at homes, organization grants, personal grants and
-- published mandates, so a mandate an organization ADOPTED — a live org binding its owner or
-- admin set on a mandate shared with them — never reached the organization's own list. The
-- corpus now includes it (organization seat: that organization; person seat: any of my
-- organizations). RLS on mandate.definition stays the ceiling: a member the mandate never
-- reached still does not see it.
--
-- Proof (red before, green after): pnpm check:mandate-sharing-lanes

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
                  -- ADOPTED (2026-09-26): the organization set it as its default.
                  OR m.id IN (SELECT b.mandate_id FROM mandate.binding b
                               WHERE b.principal_type = 'org' AND b.organization_id = p_res_org
                                 AND b.deleted_at IS NULL AND b.is_enabled)
                ELSE m.organization_id = v_sys
                  OR m.organization_id IN (SELECT iam.my_orgs())
                  OR m.created_by = v_uid
                  OR m.visibility = 'public'
                  OR m.id IN (SELECT p.resource_id FROM iam.permissions p
                               WHERE p.resource_type = 'mandate'
                                 AND (p.granted_to_user_id = v_uid
                                      OR p.granted_to_organization_id IN (SELECT iam.my_orgs()))
                                 AND p.status <> 'rejected'
                                 AND (p.expires_at IS NULL OR p.expires_at > now()))
                  -- ADOPTED (2026-09-26): one of my organizations set it as its default.
                  OR m.id IN (SELECT b.mandate_id FROM mandate.binding b
                               WHERE b.principal_type = 'org'
                                 AND b.organization_id IN (SELECT iam.my_orgs())
                                 AND b.deleted_at IS NULL AND b.is_enabled) END)
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
$function$;
