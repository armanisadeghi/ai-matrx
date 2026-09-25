-- based-on: mandate._member_scope_ok(text, text, uuid, uuid, uuid, uuid, uuid, boolean, boolean, text) 72916d4b1a983073e4ae7d50985f2e1fc0d06175756229603e631410d2ae07d0
-- based-on: public.mnd_member_list(text, text, text, uuid, uuid, text, jsonb, text, text, integer, integer) 559fb77346b795abdc9602790f7482932b31c52a9b348d42d97570672fbc3934
-- mnd_member_orgs_count_membership_2026_09_25.sql
--
-- FALSE COUNTS (review 2026-09-25): test@test.com — a member of 12 workspaces, one of them
-- another person's personal workspace ("admin's Workspace", 101 live mandates) — saw
-- "My Orgs 0 / No mandates here" on /mandates/list-preview and on
-- /organizations/admin/mandates, while the original /mandates showed 646 (545 system + 101).
--
-- Cause: the `orgs` scope excluded EVERY row homed in a personal workspace
-- (`not r_personal_home`). That exclusion exists so a person's OWN personal rows sit under
-- "Mine" and not twice; it also threw away every workspace the viewer is a member of that
-- happens to be somebody else's personal one — and, at the organization level, the whole
-- list of the very organization the page is about. Membership is access (access is
-- personal): a workspace you belong to is one of your organizations.
--
--   person level  orgs = homed in one of my organizations, except my OWN personal home
--                 (those are "Mine"), or granted to one of them.
--   org level     orgs = homed in THIS organization (personal or not), or granted to it.
--   narrowing     the same rows; another person's personal workspace is labelled
--                 "Shared with you", never by its name.
--
-- Proof (red before, green after): pnpm check:mandate-member-counts

create or replace function mandate._member_scope_ok(p_scope text, p_level text, p_org_id uuid, p_uid uuid, r_id uuid, r_created_by uuid, r_org uuid, r_is_system boolean, r_personal_home boolean, r_visibility text)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  select case p_scope
    when 'mine' then r_created_by = p_uid
    when 'shared' then r_created_by is distinct from p_uid and exists (
        select 1 from iam.permissions p
         where p.resource_type = 'mandate' and p.resource_id = r_id
           and p.granted_to_user_id = p_uid
           and p.status <> 'rejected'
           and (p.expires_at is null or p.expires_at > now()))
    when 'orgs' then not r_is_system and (
        (case when p_level = 'organization' then r_org = p_org_id
              else r_org in (select iam.my_orgs())
                   and not (r_personal_home and r_created_by is not distinct from p_uid)
                   and (p_org_id is null or r_org = p_org_id) end)
        or (case when p_org_id is null
                 then cardinality(mandate._member_shared_org_ids(r_id, p_level, p_org_id)) > 0
                 else p_org_id = any(mandate._member_shared_org_ids(r_id, p_level, p_org_id)) end))
    when 'public' then not r_is_system and r_visibility = 'public'
         and r_created_by is distinct from p_uid
         and (case when p_level = 'organization' then r_org is distinct from p_org_id
                   else r_org not in (select iam.my_orgs()) end)
    when 'system' then r_is_system
    else false end
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
      SELECT r.* FROM mandate._member_list_rows(v_q, v_res_user, v_res_org, v_level, v_keys) r
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
      SELECT r.* FROM mandate._member_list_rows(v_q, v_res_user, v_res_org, v_level, v_keys) r
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
