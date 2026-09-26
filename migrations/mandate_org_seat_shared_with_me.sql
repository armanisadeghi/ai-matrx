-- based-on: mandate._member_list_rows(text, uuid, uuid, text, text[], boolean) 5d9ab215a2f1bfcd2d958542c0c16dea41204d39205b432e36a04fe2a34a45fe
-- based-on: mandate._member_list_seat(uuid, uuid, text, text[], uuid, uuid, uuid[]) cb51d90097121a5a095eef1cc462076ecbcf34f720b6ba77322cd3e1cf254e25
-- based-on: public.mnd_member_list(text, text, text, uuid, uuid, text, jsonb, text, text, integer, integer) ecc254cbdb814dbb6b7731392d1035c58c37c6d92d6fae579ba576b218953583
-- mandate_org_seat_shared_with_me.sql
--
-- "SHARED WITH ME" IN THE ORGANIZATION SEAT (2026-09-26). An org owner or admin who was given
-- a mandate by name (a share names a person, 2026-09-23) may set it as the organization's
-- default (mandate_org_default_for_shared_mandate.sql) — but the organization's mandate page
-- never listed it, so the choice could only start from the person's own list. Now the
-- organization seat has a `shared` lane: mandates granted to the person in the seat that the
-- organization has not homed or adopted (once adopted they move to the orgs lane).
--   * mandate._member_list_rows — the organization corpus includes personal grants to the viewer;
--   * mandate._member_list_seat — in_shared excludes homed/adopted in the organization seat;
--   * public.mnd_member_list    — the organization seat accepts scope `shared` and counts it.
-- RLS on mandate.definition stays the ceiling.
--
-- Proof: pnpm check:mandate-sharing-lanes

CREATE OR REPLACE FUNCTION mandate._member_list_rows(p_q text, p_res_user uuid, p_res_org uuid, p_level text, p_keys text[], p_light boolean)
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
                  -- SHARED WITH ME (2026-09-26): given to the person in this seat, so an
                  -- owner or admin can adopt it for the organization from here.
                  OR m.id IN (SELECT p.resource_id FROM iam.permissions p
                               WHERE p.resource_type = 'mandate'
                                 AND p.granted_to_user_id = v_uid
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
                                 AND (p.expires_at IS NULL OR p.expires_at > now()))
                  -- ADOPTED (2026-09-26): one of my organizations set it as its default.
                  OR m.id IN (SELECT b.mandate_id FROM mandate.binding b
                               WHERE b.principal_type = 'org'
                                 AND b.organization_id IN (SELECT iam.my_orgs())
                                 AND b.deleted_at IS NULL AND b.is_enabled) END)
  ),
  rungs AS (
    -- LIGHT (2026-09-26): the ladder is the only expensive part of a row (~2 ms each:
    -- per-row access, per-holder reachability for every home-org member, the output
    -- contract). A caller that reads only the definition's own columns (scope, name,
    -- feature, dates, origin, visibility) asks for NO ladder; the ladder columns of a
    -- light row say "None"/"Nobody" and must not be read.
    SELECT r.* FROM mandate._rungs(CASE WHEN p_light THEN ARRAY[]::uuid[]
                                        ELSE ARRAY(SELECT c.id FROM corpus c) END,
                                   p_res_user, p_res_org) r
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
           ON NOT p_light AND w.w_type = 'agent' AND dv.id = w.w_version_id
    LEFT JOIN agent.definition ad
           ON NOT p_light AND w.w_type = 'agent' AND ad.id = coalesce(dv.agent_id, w.w_holder_id) AND ad.deleted_at IS NULL
    LEFT JOIN workflow.definition wd
           ON NOT p_light AND w.w_type = 'workflow' AND wd.id = w.w_holder_id
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

CREATE OR REPLACE FUNCTION mandate._member_list_seat(p_res_user uuid, p_res_org uuid, p_level text, p_keys text[], p_org_id uuid, p_uid uuid, p_my_orgs uuid[])
 RETURNS TABLE(id uuid, mandate_key text, name text, created_by uuid, organization_id uuid, is_system boolean, is_personal_home boolean, visibility text, vals jsonb, sortv jsonb, shared_org_ids uuid[], in_mine boolean, in_shared boolean, in_orgs boolean, in_public boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH light AS (
    SELECT l.* FROM mandate._member_list_rows(NULL, p_res_user, p_res_org, p_level, p_keys, true) l
  ),
  -- An organization this row reaches the seat through without living there: a grant to
  -- it, or its adoption (a live org binding) — mandate._member_shared_org_ids's rule.
  shared AS (
    SELECT x.mandate_id, array_agg(DISTINCT x.org_id) AS org_ids
    FROM (
      SELECT p.resource_id AS mandate_id, p.granted_to_organization_id AS org_id
        FROM iam.permissions p
       WHERE p.resource_type = 'mandate'
         AND p.granted_to_organization_id IS NOT NULL
         AND p.status <> 'rejected'
         AND (p.expires_at IS NULL OR p.expires_at > now())
      UNION ALL
      SELECT b.mandate_id, b.organization_id
        FROM mandate.binding b
       WHERE b.principal_type = 'org'
         AND b.deleted_at IS NULL
         AND b.is_enabled
    ) x
    WHERE (CASE WHEN p_level = 'organization' THEN x.org_id = p_org_id
                ELSE x.org_id = ANY (p_my_orgs) END)
    GROUP BY x.mandate_id
  ),
  -- Granted to this person personally.
  granted AS (
    SELECT DISTINCT p.resource_id AS mandate_id
      FROM iam.permissions p
     WHERE p.resource_type = 'mandate'
       AND p.granted_to_user_id = p_uid
       AND p.status <> 'rejected'
       AND (p.expires_at IS NULL OR p.expires_at > now())
  )
  SELECT l.id, l.mandate_key, l.name, l.created_by, l.organization_id, l.is_system,
         l.is_personal_home, l.visibility, l.vals, l.sortv,
         coalesce(sh.org_ids, '{}'::uuid[]),
         -- mine
         l.created_by = p_uid,
         -- shared (with me personally); in an organization seat, only while the
         -- organization has not homed or adopted it (then it is in the orgs lane)
         l.created_by IS DISTINCT FROM p_uid AND g.mandate_id IS NOT NULL
           AND NOT (p_level = 'organization'
                    AND (l.organization_id = p_org_id
                         OR p_org_id = ANY (coalesce(sh.org_ids, '{}'::uuid[])))),
         -- orgs
         NOT l.is_system AND (
           (CASE WHEN p_level = 'organization' THEN l.organization_id = p_org_id
                 ELSE l.organization_id = ANY (p_my_orgs)
                      AND NOT (l.is_personal_home AND l.created_by IS NOT DISTINCT FROM p_uid)
                      AND (p_org_id IS NULL OR l.organization_id = p_org_id) END)
           OR (CASE WHEN p_org_id IS NULL THEN cardinality(coalesce(sh.org_ids, '{}'::uuid[])) > 0
                    ELSE p_org_id = ANY (coalesce(sh.org_ids, '{}'::uuid[])) END)),
         -- public (the community lane)
         NOT l.is_system AND l.visibility = 'public'
           AND l.created_by IS DISTINCT FROM p_uid
           AND (CASE WHEN p_level = 'organization' THEN l.organization_id IS DISTINCT FROM p_org_id
                     ELSE l.organization_id <> ALL (p_my_orgs) END)
  FROM light l
  LEFT JOIN shared sh ON sh.mandate_id = l.id
  LEFT JOIN granted g ON g.mandate_id = l.id;
$function$;

CREATE OR REPLACE FUNCTION public.mnd_member_list(p_mode text DEFAULT 'page'::text, p_level text DEFAULT 'person'::text, p_scope text DEFAULT 'system'::text, p_org_id uuid DEFAULT NULL::uuid, p_resolve_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'name'::text, p_dir text DEFAULT 'asc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_mode  text := lower(coalesce(p_mode, 'page'));
  v_level text := lower(coalesce(p_level, 'person'));
  v_scope text := lower(coalesce(p_scope, 'system'));
  v_q     text := NULLIF(lower(btrim(coalesce(p_search, ''))), '');
  v_f     jsonb := coalesce(p_filters, '{}'::jsonb);
  v_dir   text := CASE WHEN lower(coalesce(p_dir, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
  v_sort  text := coalesce(NULLIF(p_sort, ''), 'name');
  v_res_user uuid;
  v_res_org  uuid;
  v_out   jsonb;
  -- An exact-key select filter is pushed into the row builder (page and counts only: facets
  -- skip a column's own filter, so they still need every key).
  v_keys  text[] := CASE WHEN v_f->'mandateKey'->>'kind' = 'select'
                              AND jsonb_typeof(v_f->'mandateKey'->'values') = 'array'
                              AND jsonb_array_length(v_f->'mandateKey'->'values') > 0
                         THEN ARRAY(SELECT jsonb_array_elements_text(v_f->'mandateKey'->'values'))
                         END;
  -- ONE LADDER PER ROW SHOWN, NOT PER ROW OWNED (2026-09-26, 57014 on /mandates/list-preview).
  -- Every call used to run the full ladder (`mandate._rungs`: per-row access, per-holder
  -- reachability for every member of the home organization, the output contract — ~2 ms a
  -- row) over the WHOLE corpus (~720 rows for a normal member), three times per page load,
  -- to paint 50 rows and five numbers: 2–3 s a call alone, 8 s+ (the statement timeout)
  -- when the three ran together. These are the only columns that need the ladder; a
  -- question that reads none of them (no search, no filter or sort on them) is answered
  -- from the definition rows alone, and the ladder runs only for the rows it returns.
  v_ladder_cols constant text[] := ARRAY['holderName', 'holderType', 'decidedBy', 'pinText',
                                         'customizedBy', 'health', 'status'];
  v_light_filter boolean;
  v_my_orgs uuid[];
  v_total bigint;
  v_page_keys text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Sign in to list mandates.';
  END IF;
  IF v_mode NOT IN ('page', 'counts', 'facets') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('p_mode %L is not a mode of the mandate list.', p_mode),
      hint    = 'Use page, counts or facets.';
  END IF;
  IF v_level NOT IN ('person', 'organization') THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = format('p_level %L is not a level of the mandate list.', p_level),
      hint    = 'Use person or organization.';
  END IF;

  IF v_level = 'organization' THEN
    IF p_org_id IS NULL THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = 'The organization mandate list needs to know which organization.',
        hint    = 'Pass p_org_id.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                    WHERE om.user_id = v_uid AND om.organization_id = p_org_id) THEN
      RAISE EXCEPTION USING errcode = '42501',
        message = 'You are not a member of that organization, so its mandates are not yours to list.';
    END IF;
    IF v_scope NOT IN ('orgs', 'shared', 'public', 'system') THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = format('p_scope %L is not a scope of the organization mandate list.', p_scope),
        hint    = 'Use orgs, shared, public or system.';
    END IF;
    v_res_user := NULL;          -- personal overrides are each member's own
    v_res_org  := p_org_id;
  ELSE
    IF v_scope NOT IN ('mine', 'shared', 'orgs', 'public', 'system') THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = format('p_scope %L is not a scope of the mandate list.', p_scope),
        hint    = 'Use mine, shared, orgs, public or system.';
    END IF;
    IF p_resolve_org_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM iam.organization_member om
          WHERE om.user_id = v_uid AND om.organization_id = p_resolve_org_id) THEN
      RAISE EXCEPTION USING errcode = '42501',
        message = 'You are not a member of that organization, so what it runs is not yours to see.',
        hint    = 'Switch to an organization you belong to.';
    END IF;
    v_res_user := v_uid;
    v_res_org  := p_resolve_org_id;
  END IF;

  -- Asked ONCE (it was asked per row, per scope, through mandate._member_scope_ok and
  -- mandate._member_shared_org_ids — ~2,000 function calls, each re-running the RLS of
  -- iam.permissions and mandate.binding).
  v_my_orgs := ARRAY(SELECT iam.my_orgs());
  v_light_filter := v_q IS NULL
    AND jsonb_typeof(v_f) = 'object'
    AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(v_f) k WHERE k = ANY (v_ladder_cols));

  -- ── counts ──────────────────────────────────────────────────────────────
  IF v_mode = 'counts' THEN
    WITH narrowed AS (
      SELECT s.* FROM mandate._member_list_seat(v_res_user, v_res_org, v_level, v_keys,
                                                p_org_id, v_uid, v_my_orgs) s
      WHERE CASE WHEN v_light_filter THEN mandate._admin_list_match(s.vals, v_f)
                 -- Search, or a filter on a ladder column: the ladder decides which rows count.
                 ELSE s.id IN (SELECT r.id FROM mandate._member_list_rows(v_q, v_res_user, v_res_org,
                                                                         v_level, v_keys, false) r
                                WHERE (v_q IS NULL OR r.score > 0)
                                  AND mandate._admin_list_match(r.vals, v_f)) END
    )
    SELECT jsonb_build_object(
      'mine',   CASE WHEN v_level = 'person' THEN (SELECT count(*) FROM narrowed n WHERE n.in_mine) ELSE 0 END,
      'shared', (SELECT count(*) FROM narrowed n WHERE n.in_shared),
      'orgs',   (SELECT count(*) FROM narrowed n WHERE n.in_orgs),
      'public', (SELECT count(*) FROM narrowed n WHERE n.in_public),
      'system', (SELECT count(*) FROM narrowed n WHERE n.is_system),
      -- One narrowing option per organization a row reaches this person through: its home
      -- (when that is one of their organizations) and every organization it was shared with.
      'orgs_narrow', CASE WHEN v_level = 'organization' THEN '[]'::jsonb ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', o.org_id, 'label', o.label, 'count', o.n)
                         ORDER BY o.label)
        -- Another person's personal workspace this seat is a MEMBER of is one of its
        -- organizations (membership is access), but it is never named: "Shared with you".
        FROM (SELECT x.org_id,
                     CASE WHEN coalesce(org.is_personal, false) THEN 'Shared with you'
                          ELSE coalesce(org.name, 'Organization') END AS label,
                     count(DISTINCT x.row_id) AS n
              FROM (SELECT n.id AS row_id, n.organization_id AS org_id
                      FROM narrowed n
                     WHERE NOT n.is_system
                       AND NOT (n.is_personal_home AND n.created_by = v_uid)
                       AND n.organization_id = ANY (v_my_orgs)
                    UNION ALL
                    SELECT n.id, g.org_id
                      FROM narrowed n
                      CROSS JOIN LATERAL unnest(n.shared_org_ids) AS g(org_id)
                     WHERE NOT n.is_system) x
              LEFT JOIN iam.organizations org ON org.id = x.org_id
              GROUP BY 1, 2) o), '[]'::jsonb) END)
    INTO v_out;
    RETURN v_out;
  END IF;

  -- The scope is decided without the ladder, so the ladder only ever runs for rows in it.
  v_page_keys := ARRAY(
    SELECT s.mandate_key
      FROM mandate._member_list_seat(v_res_user, v_res_org, v_level,
                                     CASE WHEN v_mode = 'facets' THEN NULL ELSE v_keys END,
                                     p_org_id, v_uid, v_my_orgs) s
     WHERE CASE v_scope WHEN 'mine'   THEN s.in_mine
                        WHEN 'shared' THEN s.in_shared
                        WHEN 'orgs'   THEN s.in_orgs
                        WHEN 'public' THEN s.in_public
                        ELSE s.is_system END
       -- A page that neither searches nor filters or sorts on a ladder column is chosen
       -- from these rows alone (below); the rest need the ladder for the whole scope.
       AND (v_mode = 'facets' OR NOT v_light_filter OR v_sort = ANY (v_ladder_cols)
            OR mandate._admin_list_match(s.vals, v_f))
     ORDER BY
       CASE WHEN v_dir = 'asc'  AND jsonb_typeof(s.sortv->v_sort) = 'number'
            THEN (s.sortv->>v_sort)::numeric END ASC,
       CASE WHEN v_dir = 'desc' AND jsonb_typeof(s.sortv->v_sort) = 'number'
            THEN (s.sortv->>v_sort)::numeric END DESC,
       CASE WHEN v_dir = 'asc'  AND jsonb_typeof(s.sortv->v_sort) = 'string'
            THEN s.sortv->>v_sort END ASC,
       CASE WHEN v_dir = 'desc' AND jsonb_typeof(s.sortv->v_sort) = 'string'
            THEN s.sortv->>v_sort END DESC,
       CASE WHEN NOT (s.sortv ? v_sort) THEN lower(s.name) END ASC,
       s.mandate_key ASC);

  -- ── facets ──────────────────────────────────────────────────────────────
  IF v_mode = 'facets' THEN
    WITH scoped AS (
      SELECT r.* FROM mandate._member_list_rows(v_q, v_res_user, v_res_org, v_level,
                                                v_page_keys, false) r
      WHERE (v_q IS NULL OR r.score > 0)
    )
    SELECT coalesce(jsonb_object_agg(c.col, c.opts), '{}'::jsonb) INTO v_out
    FROM (
      SELECT t.col, jsonb_agg(jsonb_build_object('value', t.val, 'count', t.n)
                              ORDER BY t.n DESC, t.val) AS opts
      FROM (
        -- One pass: each row's own keys, the match only when a filter is set
        -- (mnd_admin_list_facets_one_pass_2026_09_26 — the same fix, the same answer).
        SELECT e.key AS col, v.val, count(*) AS n
        FROM scoped r
        CROSS JOIN LATERAL jsonb_each(r.vals) e
        CROSS JOIN LATERAL (SELECT DISTINCT x AS val
                            FROM jsonb_array_elements_text(e.value) x) v
        WHERE e.key NOT IN ('goal', 'updatedAt', 'createdAt')
          AND (v_f = '{}'::jsonb OR mandate._admin_list_match(r.vals, v_f, e.key))
        GROUP BY e.key, v.val
      ) t
      GROUP BY t.col
    ) c;
    RETURN v_out;
  END IF;

  -- ── page ────────────────────────────────────────────────────────────────
  IF v_light_filter AND NOT (v_sort = ANY (v_ladder_cols)) THEN
    -- v_page_keys is already this scope's matched rows in page order: slice it.
    v_total := coalesce(cardinality(v_page_keys), 0);
    v_page_keys := v_page_keys[greatest(coalesce(p_offset, 0), 0) + 1 :
                               greatest(coalesce(p_offset, 0), 0) + greatest(coalesce(p_limit, 50), 1)];
  ELSE
    WITH matched AS (
      SELECT r.mandate_key, r.name, r.sortv, r.score, count(*) OVER () AS total
      FROM mandate._member_list_rows(v_q, v_res_user, v_res_org, v_level, v_page_keys, false) r
      WHERE (v_q IS NULL OR r.score > 0)
        AND mandate._admin_list_match(r.vals, v_f)
    ),
    ordered AS (
      SELECT m.mandate_key, m.total FROM matched m
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
    SELECT coalesce((SELECT max(m.total) FROM matched m), 0),
           ARRAY(SELECT o.mandate_key FROM ordered o)
      INTO v_total, v_page_keys;
  END IF;

  -- The page's rows, ladder and all — for the page's keys only, in the page's order.
  SELECT jsonb_build_object(
    'total', v_total,
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'mandate_key', o.mandate_key, 'name', o.name,
        'feature_label', o.feature_label, 'goal', o.goal,
        'created_by_me', o.created_by = v_uid,
        'organization_id', o.organization_id, 'is_system', o.is_system,
        'home_label', o.home_label,
        'holder_type', o.holder_type, 'holder_id', o.holder_id, 'holder_name', o.holder_name,
        'decided_by', o.decided_by, 'decided_rung', o.decided_rung, 'pin_text', o.pin_text,
        'customized_by', to_jsonb(o.customized_by), 'health', o.health,
        'origin', o.origin, 'visibility', o.visibility, 'is_enabled', o.is_enabled,
        'updated_at', o.updated_at, 'created_at', o.created_at)
        ORDER BY array_position(v_page_keys, o.mandate_key))
      FROM mandate._member_list_rows(NULL, v_res_user, v_res_org, v_level, v_page_keys, false) o),
      '[]'::jsonb))
  INTO v_out;
  RETURN v_out;
END;
$function$;
