-- based-on: mandate._member_list_rows(text, uuid, uuid, text) 0266c9b82f7571302c990720c83286137de426378fcb2c5110d2f702882a6f13
-- based-on: public.mnd_member_list(text, text, text, uuid, uuid, text, jsonb, text, text, integer, integer) fc975b5c639ad35f848f5e4f95393b724c4d8a7a8137e9d97e674f863bca2ca9
-- mandate_share_without_move.sql
--
-- SHARE ≠ MOVE for user/org-created mandates (mandates UI register, 2026-09-25).
--
-- A person's soft mandate stays homed in their personal organization and keeps its owner.
-- Sharing is the platform's ordinary sharing, nothing mandate-specific:
--   * to a person or an organization → a grant row in iam.permissions (ShareModal writes it;
--     mandate.definition's generated std_select already honours it through its
--     iam.permissions candidate + iam.has_access('mandate', …));
--   * to everyone → visibility 'public' (the published lane; pub_read + std_select).
--
-- What this file adds (additive only — no policy, enum or kernel change):
--   1. `mandate` in platform.shareable_resource_registry, so the platform ShareModal
--      (get_share_capabilities / resolve_shareable_resource) accepts it.
--   2. mandate._member_list_rows: the list's corpus also looks at mandates GRANTED to this
--      seat and at PUBLISHED ones (RLS stays the ceiling — the function is SECURITY INVOKER);
--      another person's personal workspace is never named ("Shared with you" / "Community").
--   3. Two helpers + public.mnd_member_list: the platform scope vocabulary
--      (lib/list-scope: mine · shared · orgs · public · system) — `shared` = granted to me,
--      `orgs` = homed in OR granted to one of my organizations, `public` = published by
--      somebody else outside my organizations. The organization seat gains `public`.
--
-- Proof (red before, green after): pnpm check:mandate-sharing-lanes


-- 1 ── the platform share dialog accepts a mandate ─────────────────────────────────────
insert into platform.shareable_resource_registry (
  resource_type, schema_name, table_name, id_column, owner_column,
  is_public_column, display_label, url_path_template,
  rls_uses_has_permission, is_active, is_link_shareable,
  content_role, is_scopeable, public_columns, notes, organization_id
) values (
  'mandate', 'mandate', 'definition', 'id', 'created_by',
  null, 'Mandate', '',
  true, true, false,
  null, false, null,
  'User/org soft mandates. Sharing never moves the row: grants live in iam.permissions and '
  'mandate.definition std_select honours them via iam.has_access(''mandate'', …). No id route '
  '(mandate pages are addressed by key), so the emailed link is honestly unavailable.',
  '39c38960-d30c-4840-b0c1-c9960de95582'  -- the registry is platform machinery, homed in Matrx System like every other row
)
on conflict (resource_type) do nothing;

-- 2 ── helpers: which of MY organizations a mandate was shared with; which tab a row is in ──
create or replace function mandate._member_shared_org_ids(p_id uuid, p_level text, p_org_id uuid)
returns uuid[]
language sql
stable
set search_path to 'public'
as $fn$
  select coalesce(array_agg(distinct p.granted_to_organization_id), '{}'::uuid[])
    from iam.permissions p
   where p.resource_type = 'mandate'
     and p.resource_id = p_id
     and p.granted_to_organization_id is not null
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
     and (case when p_level = 'organization' then p.granted_to_organization_id = p_org_id
               else p.granted_to_organization_id in (select iam.my_orgs()) end)
$fn$;

comment on function mandate._member_shared_org_ids(uuid, text, uuid) is
  'The organizations a mandate was SHARED with (iam.permissions grant) that this seat belongs to '
  '(person level) or that is this seat (organization level). Share never moves a mandate.';

create or replace function mandate._member_scope_ok(
  p_scope text, p_level text, p_org_id uuid, p_uid uuid,
  r_id uuid, r_created_by uuid, r_org uuid, r_is_system boolean, r_personal_home boolean,
  r_visibility text)
returns boolean
language sql
stable
set search_path to 'public'
as $fn$
  select case p_scope
    when 'mine' then r_created_by = p_uid
    when 'shared' then r_created_by is distinct from p_uid and exists (
        select 1 from iam.permissions p
         where p.resource_type = 'mandate' and p.resource_id = r_id
           and p.granted_to_user_id = p_uid
           and p.status <> 'rejected'
           and (p.expires_at is null or p.expires_at > now()))
    when 'orgs' then not r_is_system and (
        (not r_personal_home and (case when p_level = 'organization' then r_org = p_org_id
                                       else r_org in (select iam.my_orgs())
                                            and (p_org_id is null or r_org = p_org_id) end))
        or (case when p_org_id is null
                 then cardinality(mandate._member_shared_org_ids(r_id, p_level, p_org_id)) > 0
                 else p_org_id = any(mandate._member_shared_org_ids(r_id, p_level, p_org_id)) end))
    when 'public' then not r_is_system and r_visibility = 'public'
         and r_created_by is distinct from p_uid
         and (case when p_level = 'organization' then r_org is distinct from p_org_id
                   else r_org not in (select iam.my_orgs()) end)
    when 'system' then r_is_system
    else false end
$fn$;

comment on function mandate._member_scope_ok(text, text, uuid, uuid, uuid, uuid, uuid, boolean, boolean, text) is
  'Which list tab a mandate row belongs to, in the platform scope vocabulary (lib/list-scope): '
  'mine = I made it; shared = granted to me; orgs = homed in or granted to one of my organizations; '
  'public = published by someone else outside my organizations; system = the platform''s own.';

grant execute on function mandate._member_shared_org_ids(uuid, text, uuid) to authenticated, service_role;
grant execute on function mandate._member_scope_ok(text, text, uuid, uuid, uuid, uuid, uuid, boolean, boolean, text) to authenticated, service_role;

-- 3 ── the list's corpus sees what was shared with this seat ──────────────────────────────
CREATE OR REPLACE FUNCTION mandate._member_list_rows(p_q text, p_res_user uuid, p_res_org uuid, p_level text)
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
        WHEN 'global' THEN 'Default'
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

-- 4 ── the list's tabs: mine · shared · orgs · public · system ────────────────────────────
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
    IF v_scope NOT IN ('orgs', 'public', 'system') THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = format('p_scope %L is not a scope of the organization mandate list.', p_scope),
        hint    = 'Use orgs, public or system.';
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

  IF v_mode = 'counts' THEN
    WITH narrowed AS (
      SELECT r.* FROM mandate._member_list_rows(v_q, v_res_user, v_res_org, v_level) r
      WHERE (v_q IS NULL OR r.score > 0) AND mandate._admin_list_match(r.vals, v_f)
    )
    SELECT jsonb_build_object(
      'mine',   CASE WHEN v_level = 'person'
                     THEN (SELECT count(*) FROM narrowed n WHERE n.created_by = v_uid) ELSE 0 END,
      'shared', CASE WHEN v_level = 'person'
                     THEN (SELECT count(*) FROM narrowed n
                            WHERE mandate._member_scope_ok('shared', v_level, NULL, v_uid, n.id, n.created_by,
                                    n.organization_id, n.is_system, n.is_personal_home, n.visibility))
                     ELSE 0 END,
      'orgs',   (SELECT count(*) FROM narrowed n
                  WHERE mandate._member_scope_ok('orgs', v_level, p_org_id, v_uid, n.id, n.created_by,
                          n.organization_id, n.is_system, n.is_personal_home, n.visibility)),
      'public', (SELECT count(*) FROM narrowed n
                  WHERE mandate._member_scope_ok('public', v_level, p_org_id, v_uid, n.id, n.created_by,
                          n.organization_id, n.is_system, n.is_personal_home, n.visibility)),
      'system', (SELECT count(*) FROM narrowed n WHERE n.is_system),
      -- One narrowing option per organization a row reaches this person through: its home
      -- (when that is one of their organizations) and every organization it was shared with.
      'orgs_narrow', CASE WHEN v_level = 'organization' THEN '[]'::jsonb ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', o.org_id, 'label', o.label, 'count', o.n)
                         ORDER BY o.label)
        FROM (SELECT x.org_id, coalesce(org.name, 'Organization') AS label, count(DISTINCT x.row_id) AS n
              FROM (SELECT n.id AS row_id, n.organization_id AS org_id
                      FROM narrowed n
                     WHERE NOT n.is_system AND NOT n.is_personal_home
                       AND n.organization_id IN (SELECT iam.my_orgs())
                    UNION ALL
                    SELECT n.id, g.org_id
                      FROM narrowed n
                      CROSS JOIN LATERAL unnest(mandate._member_shared_org_ids(n.id, 'person', NULL)) AS g(org_id)
                     WHERE NOT n.is_system) x
              LEFT JOIN iam.organizations org ON org.id = x.org_id
              GROUP BY 1, 2) o), '[]'::jsonb) END)
    INTO v_out;
    RETURN v_out;
  END IF;

  IF v_mode = 'facets' THEN
    WITH scoped AS (
      SELECT r.* FROM mandate._member_list_rows(v_q, v_res_user, v_res_org, v_level) r
      WHERE mandate._member_scope_ok(v_scope, v_level, p_org_id, v_uid, r.id, r.created_by,
                                     r.organization_id, r.is_system, r.is_personal_home, r.visibility)
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
        WHERE cols.col NOT IN ('goal', 'updatedAt', 'createdAt')
        GROUP BY cols.col, v.val
      ) t
      GROUP BY t.col
    ) c;
    RETURN v_out;
  END IF;

  -- page
  WITH scoped AS (
      SELECT r.* FROM mandate._member_list_rows(v_q, v_res_user, v_res_org, v_level) r
      WHERE mandate._member_scope_ok(v_scope, v_level, p_org_id, v_uid, r.id, r.created_by,
                                     r.organization_id, r.is_system, r.is_personal_home, r.visibility)
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
        'id', o.id, 'mandate_key', o.mandate_key, 'name', o.name,
        'feature_label', o.feature_label, 'goal', o.goal,
        'created_by_me', o.created_by = v_uid,
        'organization_id', o.organization_id, 'is_system', o.is_system,
        'home_label', o.home_label,
        'holder_type', o.holder_type, 'holder_id', o.holder_id, 'holder_name', o.holder_name,
        'decided_by', o.decided_by, 'decided_rung', o.decided_rung, 'pin_text', o.pin_text,
        'customized_by', to_jsonb(o.customized_by), 'health', o.health,
        'origin', o.origin, 'visibility', o.visibility, 'is_enabled', o.is_enabled,
        'updated_at', o.updated_at, 'created_at', o.created_at)) FROM ordered o), '[]'::jsonb))
  INTO v_out;
  RETURN v_out;
END;
$function$;
