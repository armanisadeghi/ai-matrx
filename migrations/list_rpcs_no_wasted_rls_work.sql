-- lane: list-perf-2 (public *_list_scoped RPCs), 2026-09-28
-- based-on: iam.team_members_resolved(uuid[]) adb0710d4f799d2133a6239ba3e1fa0c037cd03354039c7a644532c08c739ae5
-- based-on: platform.shown_to_context(text) 8dda98a4039bdcb28d1d81a4317b6ac776a4c36603f1ee89623e5c663c597ab7
-- based-on: public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 0531356ee5a59a04eb57d56f82b9fec954987f017a38935ef236cc1532b6bd92
-- based-on: public.ivw_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) c63000171116d28794bfad2ae0ab1f1b99c69b24ef1bd17e123ea74b39615eca
-- based-on: public.mkt_initiative_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 6eb2ab4256b01c3185c7938bef97687e46bce377ff5083d8bf992e72c9de8181
-- based-on: public.seo_rank_target_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) d509a3d5b185b1b683021055ebd495531577f6512a6b1e745ea6bdcd089362e5
-- based-on: public.shx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) e3462d91fabaab1d40a443fa520e7124d835236324c2853568cc918133076463
-- based-on: public.trx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) b74fbd5a98c9ba421fd38a6c13bddfb73b602bd6827de04d03f8b076b15dad74
-- based-on: public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 45e0ce21c023e6e5cf6e0f9de25d463d73b0f8e4c46e6e0b2cc1a2006c384903
-- based-on: public.edu_library_scope_rows(text) 30aebaeeec684749008b315b0daf69146355e1e61365243c533771ac790f66d9
-- based-on: public.crm_inbox_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 7533612839d58ce3ad36b2b6ff1b533d6778f940b9b50d96079c5d76b6b86dbd
--
-- The public *_list_scoped RPCs (the /education/library list and ten other entity lists) spent
-- most of their time on work whose result was thrown away or recomputed. Measured on production
-- as admin@admin.com and test@test.com, server-side (EXPLAIN ANALYZE execution + planning), min of
-- 3-5, by ablation against copies of the functions in pg_temp:
--
--   1. THE SHOWN-TO CONTEXT WAS BUILT FOR LANES THAT NEVER READ IT. platform.shown_to_context(token)
--      loops over the viewer's organizations calling platform.shown_to_default and
--      iam.teammate_user_ids for each (~190 ms for an admin in 47 organizations, ~50 ms for a
--      member of 13). Every list computed it in DECLARE, but only the organization / team lanes
--      pass it to platform.shown_to_lists. edu_library_scope_rows built it for FOUR tokens on every
--      call (~720 ms of a ~1.1 s /education/library page for an admin). Fix: the eight lists build
--      v_ctx only when v_scope is 'orgs' or 'team'; the other lanes never touched it.
--   2. THE TEAMMATES WERE RECOMPUTED PER TOKEN. They depend only on (viewer, organization), so
--      shown_to_context now caches them per transaction across tokens (a second GUC key beside the
--      existing per-token one) — the library's four tokens and trx's two pay once.
--   3. A NESTED LANGUAGE sql FUNCTION WAS RE-PLANNED PER CALL (invariant 9 again).
--      iam.team_members_resolved (LANGUAGE sql, SET search_path, a recursive CTE) is called once
--      per organization from iam.teammate_user_ids and was parsed and planned on every call:
--      ~3.6 ms per organization whether or not it had a team. LANGUAGE plpgsql, same query.
--   4. A COMPUTED JOIN KEY DEFEATED THE INDEX ON A ROW-SECURED TABLE. crm_inbox_list_scoped joined
--      seo.reputation_case / seo.backlink on NULLIF(jsonb #>> ...)::uuid. That expression is not
--      leakproof, so PostgreSQL may not evaluate it before the tables' RLS quals and could not use
--      the primary key: it scanned both tables and built their full RLS access sets (~1.2 s for an
--      admin) to decorate three rows. The `contextual` CTE is now MATERIALIZED, so the key is a plain
--      column and each join is a primary-key lookup.
--   5. ONE ROW-SECURED TABLE READ TWICE. seo_rank_target_list_scoped read seo.rank_observation in
--      two laterals; each built that table's RLS access set (iam.accessible_entity_ids for
--      seo_collection_run, ~0.8 s for an admin) independently. One MATERIALIZED read now feeds both.
--
-- Every function returns the same rows, in the same order, with the same values: proven before
-- apply by hashing the ordered output of the live function and its replacement in ONE
-- repeatable-read snapshot per viewer, across lanes, sorts, directions, searches, filters and pages,
-- as admin@admin.com and test@test.com (numbers in the commit message). iam.team_members_resolved
-- was compared row-for-row on every organization's team set, iam.teammate_user_ids on every live
-- membership, and platform.shown_to_context on every list token.
--
-- Not fixed here (out of this file's reach, named so the next reader does not re-measure it): the
-- residual cost of seo_rank_target / trx / cvx / mnd is the RLS on their tables —
-- iam.accessible_entity_ids('seo_collection_run' | 'seo_rank_target' | 'transcript' |
-- 'studio_session') costs 0.3-0.8 s for an admin — plus platform.visible_user_identity (~0.1 s for
-- an admin) and mandate._rungs (~0.7 s) inside mnd_list_scoped.
set local lock_timeout = '3s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION iam.team_members_resolved(p_team_ids uuid[])
 RETURNS TABLE(team_id uuid, user_id uuid, role text, is_listed boolean, is_from_hr boolean, listed_since timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  -- LANGUAGE plpgsql on purpose (lib/list-scope/FEATURE.md, invariant 9): a LANGUAGE sql function
  -- called from another function's statement is parsed and planned again on every call; this one is
  -- called once per organization by iam.teammate_user_ids. Same query, character for character.
  return query
with recursive live_team as (
    select t.id, t.organization_id, t.hr_department_id
      from iam.team t
     where t.id = any(coalesce(p_team_ids, '{}'::uuid[]))
       and t.deleted_at is null
  ),
  org_member as (
    select m.container_id as organization_id, m.user_id
      from iam.memberships m
     where m.container_type = 'organization'
       and m.status = 'active'
       and m.deleted_at is null
       and m.container_id in (select lt.organization_id from live_team lt)
  ),
  listed as (
    select m.container_id as team_id, m.user_id, m.role, m.created_at
      from iam.memberships m
      join live_team lt on lt.id = m.container_id and lt.organization_id = m.organization_id
     where m.container_type = 'team'
       and m.status = 'active'
       and m.deleted_at is null
       and exists (select 1 from org_member om
                    where om.organization_id = lt.organization_id and om.user_id = m.user_id)
  ),
  dept_tree(team_id, organization_id, department_id) as (
    select lt.id, lt.organization_id, d.id
      from live_team lt
      join hr.department d
        on d.id = lt.hr_department_id and d.organization_id = lt.organization_id and d.deleted_at is null
       and coalesce(d.is_active, true)
    union
    select dt.team_id, dt.organization_id, d.id
      from dept_tree dt
      join hr.department d
        on d.parent_department_id = dt.department_id and d.organization_id = dt.organization_id
       and d.deleted_at is null and coalesce(d.is_active, true)
  ),
  in_department as (
    select distinct dt.team_id, e.id as employee_id, e.login_user_id as user_id, dt.organization_id
      from dept_tree dt
      join hr.employee e
        on e.organization_id = dt.organization_id
       and e.deleted_at is null
       and e.login_user_id is not null
       and not coalesce(e.directory_opt_out, false)
      left join hr.position_assignment pa
        on pa.id = e.current_position_assignment_id and pa.deleted_at is null
     where coalesce(pa.department_id, e.current_department_id) = dt.department_id
       -- 1347: HR hides contractors from peers when the organization turned that off.
       and (coalesce(pa.worker_class, 'employee') <> 'contractor'
            or coalesce((hr._hr_knob('hr.employees', 'contractor_directory_visible', dt.organization_id, null) #>> '{}')::boolean, true))
  ),
  from_hr as (
    select distinct i.team_id, i.user_id
      from in_department i
     where exists (select 1 from org_member om
                    where om.organization_id = i.organization_id and om.user_id = i.user_id)
       and hr.employee_directory_status(i.employee_id, current_date) in ('active', 'on_leave')
  )
  select coalesce(l.team_id, h.team_id),
         coalesce(l.user_id, h.user_id),
         coalesce(l.role, 'member'),
         l.user_id is not null,
         h.user_id is not null,
         l.created_at
    from listed l
    full join from_hr h on h.team_id = l.team_id and h.user_id = l.user_id;
end
$function$;

CREATE OR REPLACE FUNCTION platform.shown_to_context(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_key text := 'platform.shown_to_ctx_' || md5(coalesce(p_token, ''));
  -- The teammates of each organization do not depend on the token, so they are worked out once per
  -- transaction for ALL tokens (a library list asks for four tokens; iam.teammate_user_ids costs
  -- about 1 ms per organization, and an admin belongs to dozens).
  v_team_key constant text := 'platform.shown_to_team';
  v_cached jsonb;
  v_team jsonb;
  v_team_out jsonb := '{}'::jsonb;
  v_d platform.shown_to;
  v_t jsonb;
  r record;
begin
  if v_uid is null then
    return v_out;
  end if;
  -- Once per transaction per (viewer, token): a counts RPC calls its list RPC dozens of times.
  v_cached := nullif(current_setting(v_key, true), '')::jsonb;
  if v_cached is not null and v_cached ->> 'u' = v_uid::text then
    return v_cached -> 'c';
  end if;
  v_team := nullif(current_setting(v_team_key, true), '')::jsonb;
  if v_team is not null and v_team ->> 'u' = v_uid::text then
    v_team := v_team -> 't';
  else
    v_team := null;
  end if;
  -- An archived organization is closed (ACCESS LADDER T-33): membership of one grants no
  -- access, so iam.has_org_access(org) — and iam.teammate_user_ids underneath it — refuses
  -- it. This loop used to read raw iam.organization_member with no archived filter, so
  -- ANY viewer who had ever belonged to an org that later got archived hit that refusal as
  -- an unhandled exception on their very first list read here, killing every "Shown to"
  -- gated list (fc_set/assessment/edu_library/agx/ivw/mkt_initiative/rsx/seo_rank_target/
  -- shx/trx/wfx) for that person. Filter to the same live-membership set iam.my_orgs()
  -- already uses so a stale archived row never reaches iam.teammate_user_ids.
  -- (page-pass 2026-09-28, RC via education.fc_set_list_counts on test@test.com.)
  for r in
    select om.organization_id
    from iam.organization_member om
    join iam.organizations o on o.id = om.organization_id and o.archived_at is null
    where om.user_id = v_uid
  loop
    v_d := platform.shown_to_default(p_token, r.organization_id, v_uid);
    v_t := v_team -> r.organization_id::text;
    if v_t is null then
      v_t := to_jsonb(coalesce(iam.teammate_user_ids(v_uid, r.organization_id), array[v_uid]));
    end if;
    v_team_out := v_team_out || jsonb_build_object(r.organization_id::text, v_t);
    v_out := v_out || jsonb_build_object(r.organization_id::text, jsonb_build_object('d', v_d, 't', v_t));
  end loop;
  perform set_config(v_team_key, jsonb_build_object('u', v_uid, 't', v_team_out)::text, true);
  perform set_config(v_key, jsonb_build_object('u', v_uid, 'c', v_out)::text, true);
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, created_by uuid, organization_id uuid, organization_name text, task_id uuid, source_agent_id uuid, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('agent')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  -- Column filters, keyed by column id. '__none__' is the sentinel for
  -- "has no value" (uncategorized / untagged).
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  -- The system scope is the only one that reads the builtin corpus; a platform
  -- admin reads all of it, everyone else the published built-ins. Resolved
  -- once so the scan is not per-row.
  v_is_admin boolean := public.is_platform_admin();
BEGIN
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team') THEN
    v_ctx := platform.shown_to_context('agent');
  END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'agx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','public','system','platform_orgs','platform_users','platform_all') THEN
    RAISE EXCEPTION 'agx_list_scoped: unknown scope %', v_scope; END IF;
  -- Whitelist covers EVERY column the table can show. Anything else falls back
  -- rather than erroring, so a stale client can never break the page.
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT a.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM agent.definition a WHERE v_scope='mine' AND a.created_by = v_uid
    UNION ALL
    SELECT a.*, (a.created_by = v_uid), CASE WHEN a.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM agent.definition a
    WHERE v_scope IN ('orgs','team') AND (p_org_id IS NULL OR a.organization_id = p_org_id) AND a.organization_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (a.organization_id, a.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(a.shown_to, a.visibility, a.created_by, a.organization_id, v_uid, v_ctx)
    UNION ALL
    SELECT a.*, false, perm.permission_level::text FROM agent.definition a
    JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
    UNION ALL
    -- DISTINCT ON needs its own ORDER BY (deterministic access_level when
    -- several org grants exist) — hence the subquery wrapper. (D134)
    SELECT * FROM (
      SELECT DISTINCT ON (a.id) a.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM agent.definition a
      JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='agent'
          AND p2.resource_id=a.id AND p2.granted_to_user_id=v_uid)
      ORDER BY a.id, perm.permission_level::text
    ) org_shared
    UNION ALL
    -- PUBLIC = what a tenant PUBLISHED: the agent's CARD is public (card_visibility, the one
    -- column the publish path writes; the body can never be public — CHECK). The card rows come
    -- through agent.public_card_rows(), a definer that projects card fields only, because RLS
    -- hides a stranger's agent body from this invoker function (2026-09-26).
    SELECT a.*, false, 'public'::text FROM agent.public_card_rows() a
    WHERE v_scope='public' AND a.created_by IS DISTINCT FROM v_uid
    UNION ALL
    -- SYSTEM: the platform's own builtin corpus. Every signed-in person reads
    -- the PUBLISHED built-ins (card_visibility = 'public', the one column the
    -- publish path writes) and does not own them; a platform admin also reads
    -- the unpublished rest and owns them — the row-level affordances (rename,
    -- favorite, delete) are what the System Agents page exists to give them.
    -- (2026-09-27: this arm was admin-only, so /agents/all never showed the
    -- 500+ public built-ins to anyone.)
    SELECT a.*, v_is_admin, 'system'::text FROM agent.definition a
    WHERE v_scope='system' AND (v_is_admin OR a.card_visibility = 'public'::platform.visibility)
    UNION ALL
    -- ADMIN PLATFORM SCOPES (Arman, 2026-09-26: "No one acts as themselves in
    -- admin"). The whole platform, never the viewer: every organization's
    -- agents, every person's own agents, or everything. Admin-only.
    SELECT a.*, (a.agent_type = 'builtin'), 'platform'::text FROM agent.definition a
    LEFT JOIN iam.organizations po ON po.id = a.organization_id
    WHERE v_is_admin AND (
         (v_scope='platform_orgs' AND a.organization_id IS NOT NULL
            AND a.organization_id IS DISTINCT FROM (SELECT so.organization_id FROM iam.system_orgs so WHERE so.key = 'system')
            AND (p_org_id IS NULL OR a.organization_id = p_org_id))
      OR (v_scope='platform_users' AND a.organization_id IS NULL
            AND (p_org_id IS NULL OR a.organization_id = p_org_id))
      OR v_scope='platform_all')
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by
  ),
  filtered AS (
    SELECT j.* FROM joined j
    -- The corpus a scope reads. Every user-facing scope reads user agents;
    -- `system` reads the builtin corpus and NOTHING else, so a builtin can
    -- never leak into Mine/Orgs/Shared/Public and a user agent can never
    -- masquerade as a platform agent.
    WHERE (v_scope = 'platform_all' OR j.agent_type = (CASE WHEN v_scope='system' THEN 'builtin' ELSE 'user' END))
      AND j.deleted_at IS NULL
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.is_archived IS TRUE
             WHEN 'all' THEN true
             ELSE j.is_archived IS NOT TRUE END)
      AND (v_search IS NULL
        OR j.name ILIKE '%'||v_search||'%'
        OR j.description ILIKE '%'||v_search||'%'
        OR j.category ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(coalesce(j.tags, ARRAY[]::text[])) t
                   WHERE t ILIKE '%'||v_search||'%')
        OR (p_deep AND j.messages::text ILIKE '%'||v_search||'%'))
      -- Per-column TEXT filters
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- Per-column MULTI-SELECT filters
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'version'
           OR j.version::text IN (SELECT jsonb_array_elements_text(v_f->'version'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      -- DATE filters: a date column's finite value set is "how recently".
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      -- BOOLEAN filters
      AND (NOT v_f ? 'favorite'
           OR platform.my_favorite('agent', j.id) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, public.agx_search_score(
      v_search, f.id, f.name, f.description, f.category, f.tags,
      f.model_id, f.agent_type, f.s_owner_email,
      p_deep AND f.messages::text ILIKE '%'||v_search||'%'
    ) AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.id, c.agent_type, c.name, c.description, c.model_id, c.category,
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, platform.my_favorite('agent', c.id),
    c.visibility::text, c.created_by, c.organization_id, c.s_org_name, c.task_id, c.source_agent_id, c.version, c.created_at, c.updated_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE FIRST when searching. A name match must outrank a description
    -- match; ordering a search by updated_at buries the thing you asked for.
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    -- Favorites pinned to the top of EVERY sort. This is the product default:
    -- what you starred is what you reach for.
    CASE WHEN p_favorites_first THEN platform.my_favorite('agent', c.id) END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.created_at END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.created_at END ASC,
    CASE WHEN v_sort='name' AND v_dir='desc' THEN lower(c.name) END DESC,
    CASE WHEN v_sort='name' AND v_dir='asc' THEN lower(c.name) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.description,'')) END ASC,
    CASE WHEN v_sort='category' AND v_dir='desc' THEN lower(coalesce(c.category,'')) END DESC,
    CASE WHEN v_sort='category' AND v_dir='asc' THEN lower(coalesce(c.category,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='access_level' AND v_dir='desc' THEN lower(coalesce(c.s_access,'')) END DESC,
    CASE WHEN v_sort='access_level' AND v_dir='asc' THEN lower(coalesce(c.s_access,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN lower(c.visibility::text) END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN lower(c.visibility::text) END ASC,
    CASE WHEN v_sort='version' AND v_dir='desc' THEN c.version END DESC,
    CASE WHEN v_sort='version' AND v_dir='asc' THEN c.version END ASC,
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN platform.my_favorite('agent', c.id) END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN platform.my_favorite('agent', c.id) END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN c.is_archived END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN c.is_archived END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ivw_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, vision_statement text, stage text, current_round integer, open_questions bigint, visibility text, user_id uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('interview_session')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team') THEN
    v_ctx := platform.shown_to_context('interview_session');
  END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ivw_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','public') THEN
    RAISE EXCEPTION 'ivw_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','title','stage','current_round',
                    'open_questions','organization_name','owner_email','visibility') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT s.id AS u_id,
      coalesce(nullif(s.title,''),'Untitled interview') AS u_title,
      coalesce(s.vision_statement,'') AS u_vision,
      s.stage::text AS u_stage,
      s.current_round AS u_round,
      (SELECT count(*) FROM interview.question q
        WHERE q.session_id = s.id
          AND q.state IN ('open','partially_answered','dodged')) AS u_open_q,
      s.visibility::text AS u_visibility,
      s.created_by AS u_user_id,
      s.organization_id AS u_org_id,
      s.created_at AS u_created,
      s.updated_at AS u_updated,
      s.shown_to AS u_shown
    FROM interview.session s
    WHERE s.deleted_at IS NULL
  ),
  scoped AS (
    SELECT u.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM unified u WHERE v_scope='mine' AND u.u_user_id = v_uid
    UNION ALL
    SELECT u.*, (u.u_user_id = v_uid), CASE WHEN u.u_user_id = v_uid THEN 'owner' ELSE 'org' END::text FROM unified u
    WHERE v_scope IN ('orgs','team') AND (p_org_id IS NULL OR u.u_org_id = p_org_id) AND u.u_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (u.u_org_id, u.u_user_id) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(u.u_shown, u.u_visibility::platform.visibility, u.u_user_id, u.u_org_id, v_uid, v_ctx)
    UNION ALL
    SELECT u.*, false, perm.permission_level::text FROM unified u
    JOIN iam.permissions perm
      ON perm.resource_type = 'interview_session'
      AND perm.resource_id = u.u_id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT * FROM (
      SELECT DISTINCT ON (u.u_id) u.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM unified u
      JOIN iam.permissions perm
        ON perm.resource_type = 'interview_session'
        AND perm.resource_id = u.u_id
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2
          WHERE p2.resource_type = 'interview_session'
            AND p2.resource_id = u.u_id
            AND p2.granted_to_user_id = v_uid)
      ORDER BY u.u_id, perm.permission_level::text
    ) org_shared
    UNION ALL
    SELECT u.*, false, 'public'::text FROM unified u
    WHERE v_scope='public' AND u.u_user_id IS DISTINCT FROM v_uid AND u.u_visibility='public'
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, au.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.u_org_id
    LEFT JOIN platform.visible_user_identity au ON au.id = s.u_user_id
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE (v_search IS NULL
        OR j.u_title ILIKE '%'||v_search||'%'
        OR j.u_vision ILIKE '%'||v_search||'%')
      AND (NOT v_f ? 'title' OR j.u_title ILIKE '%'||(v_f->'title'->>'value')||'%')
      AND (NOT v_f ? 'vision_statement' OR j.u_vision ILIKE '%'||(v_f->'vision_statement'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'stage'
           OR j.u_stage IN (SELECT jsonb_array_elements_text(v_f->'stage'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.u_visibility IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'updated'
           OR j.u_updated >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.u_created >= public.agx_since_bucket(v_f->'created'->'values'->>0))
  ),
  scored AS (
    SELECT f.*, CASE WHEN v_search IS NOT NULL AND coalesce(p_limit, 25) > 1
      THEN public.ivw_search_score(
        v_search, f.u_id, f.u_title, f.u_vision, f.u_stage, f.s_owner_email)
      ELSE 0 END AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.u_id, c.u_title, c.u_vision, c.u_stage, c.u_round, c.u_open_q,
    c.u_visibility, c.u_user_id, c.u_org_id, c.s_org_name,
    c.u_created, c.u_updated,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.u_updated END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.u_updated END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.u_created END ASC,
    CASE WHEN v_sort='title' AND v_dir='desc' THEN lower(c.u_title) END DESC,
    CASE WHEN v_sort='title' AND v_dir='asc' THEN lower(c.u_title) END ASC,
    CASE WHEN v_sort='stage' AND v_dir='desc' THEN c.u_stage END DESC,
    CASE WHEN v_sort='stage' AND v_dir='asc' THEN c.u_stage END ASC,
    CASE WHEN v_sort='current_round' AND v_dir='desc' THEN c.u_round END DESC,
    CASE WHEN v_sort='current_round' AND v_dir='asc' THEN c.u_round END ASC,
    CASE WHEN v_sort='open_questions' AND v_dir='desc' THEN c.u_open_q END DESC,
    CASE WHEN v_sort='open_questions' AND v_dir='asc' THEN c.u_open_q END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN c.u_visibility END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN c.u_visibility END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mkt_initiative_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated_at'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, description text, brand_id uuid, brand_name text, status text, objective text, goal text, starts_on date, ends_on date, budget_amount numeric, budget_currency text, organization_id uuid, created_by uuid, visibility text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_ctx jsonb; v_scope text:=lower(coalesce(p_scope, platform.entity_default_list_scope('marketing_initiative')));
  v_sort text:=lower(coalesce(p_sort,'updated_at')); v_f jsonb:=coalesce(p_filters,'{}');
  v_search text:=nullif(btrim(coalesce(p_search,'')),'');
begin
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team') THEN
    v_ctx := platform.shown_to_context('marketing_initiative');
  END IF;
  if v_uid is null then raise exception 'mkt_initiative_list_scoped: not authenticated'; end if;
  if v_scope not in ('mine','team','orgs','shared','public') then raise exception 'unknown scope %',v_scope; end if;
  if v_sort not in ('name','description','brand_name','status','objective','goal','starts_on','ends_on','budget_amount','budget_currency','created_at','updated_at') then v_sort:='updated_at'; end if;
  return query with scoped as (
    select i.* from marketing.initiative i where v_scope='mine' and i.created_by=v_uid
    union select i.* from marketing.initiative i where v_scope IN ('orgs','team')
      and (p_org_id is null or i.organization_id = p_org_id) and i.organization_id in (select iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (i.organization_id, i.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(i.shown_to, i.visibility, i.created_by, i.organization_id, v_uid, v_ctx)
    union select i.* from marketing.initiative i join iam.permissions p on p.resource_type='marketing_initiative' and p.resource_id=i.id
      where v_scope='shared' and i.created_by is distinct from v_uid and (p.granted_to_user_id=v_uid or p.granted_to_organization_id in (
        select om.organization_id from iam.organization_member om where om.user_id=v_uid
      ))
    union select i.* from marketing.initiative i where v_scope='public' and i.created_by is distinct from v_uid and i.visibility='public'
  ), joined as (select s.*,b.name b_name from scoped s left join web.brand b on b.id=s.brand_id where s.deleted_at is null),
  filtered as (select j.*,public.mkt_initiative_search_score(v_search,j.id,j.name,j.description,j.goal,j.b_name) score
    from joined j where (v_search is null or public.mkt_initiative_search_score(v_search,j.id,j.name,j.description,j.goal,j.b_name)>0)
    and (not v_f?'name' or j.name ilike '%'||(v_f->'name'->>'value')||'%')
    and (not v_f?'description' or coalesce(j.description,'') ilike '%'||(v_f->'description'->>'value')||'%')
    and (not v_f?'brand_name' or coalesce(j.b_name,'') in (select jsonb_array_elements_text(v_f->'brand_name'->'values')))
    and (not v_f?'status' or j.status in (select jsonb_array_elements_text(v_f->'status'->'values')))
    and (not v_f?'objective' or j.objective in (select jsonb_array_elements_text(v_f->'objective'->'values')))
    and (not v_f?'goal' or coalesce(j.goal,'') ilike '%'||(v_f->'goal'->>'value')||'%')
    and (not v_f?'budget_currency' or j.budget_currency in (select jsonb_array_elements_text(v_f->'budget_currency'->'values')))
    and (not v_f?'starts_on' or j.starts_on>=public.mkt_initiative_since_bucket(v_f->'starts_on'->'values'->>0)::date)
    and (not v_f?'ends_on' or j.ends_on>=public.mkt_initiative_since_bucket(v_f->'ends_on'->'values'->>0)::date)
    and (not v_f?'created_at' or j.created_at>=public.mkt_initiative_since_bucket(v_f->'created_at'->'values'->>0))
    and (not v_f?'updated_at' or j.updated_at>=public.mkt_initiative_since_bucket(v_f->'updated_at'->'values'->>0))
    and (not v_f?'budget_amount' or case v_f->'budget_amount'->'values'->>0 when 'none' then j.budget_amount is null when 'lt1k' then j.budget_amount<1000 when '1k-10k' then j.budget_amount>=1000 and j.budget_amount<10000 when '10k+' then j.budget_amount>=10000 else true end)
  ), counted as (select f.*,count(*) over() n from filtered f)
  select c.id,c.name,c.description,c.brand_id,c.b_name,c.status,c.objective,c.goal,c.starts_on,c.ends_on,c.budget_amount,c.budget_currency,c.organization_id,c.created_by,c.visibility::text,c.version,c.created_at,c.updated_at,c.n
  from counted c order by
    case when v_search is not null then c.score end desc,
    case when v_sort='name' and lower(p_dir)='asc' then c.name end asc, case when v_sort='name' and lower(p_dir)<>'asc' then c.name end desc,
    case when v_sort='description' and lower(p_dir)='asc' then c.description end asc, case when v_sort='description' and lower(p_dir)<>'asc' then c.description end desc,
    case when v_sort='brand_name' and lower(p_dir)='asc' then c.b_name end asc, case when v_sort='brand_name' and lower(p_dir)<>'asc' then c.b_name end desc,
    case when v_sort='status' and lower(p_dir)='asc' then c.status end asc, case when v_sort='status' and lower(p_dir)<>'asc' then c.status end desc,
    case when v_sort='objective' and lower(p_dir)='asc' then c.objective end asc, case when v_sort='objective' and lower(p_dir)<>'asc' then c.objective end desc,
    case when v_sort='goal' and lower(p_dir)='asc' then c.goal end asc, case when v_sort='goal' and lower(p_dir)<>'asc' then c.goal end desc,
    case when v_sort='starts_on' and lower(p_dir)='asc' then c.starts_on end asc, case when v_sort='starts_on' and lower(p_dir)<>'asc' then c.starts_on end desc,
    case when v_sort='ends_on' and lower(p_dir)='asc' then c.ends_on end asc, case when v_sort='ends_on' and lower(p_dir)<>'asc' then c.ends_on end desc,
    case when v_sort='budget_amount' and lower(p_dir)='asc' then c.budget_amount end asc, case when v_sort='budget_amount' and lower(p_dir)<>'asc' then c.budget_amount end desc,
    case when v_sort='budget_currency' and lower(p_dir)='asc' then c.budget_currency end asc, case when v_sort='budget_currency' and lower(p_dir)<>'asc' then c.budget_currency end desc,
    case when v_sort='created_at' and lower(p_dir)='asc' then c.created_at end asc, case when v_sort='created_at' and lower(p_dir)<>'asc' then c.created_at end desc,
    case when v_sort='updated_at' and lower(p_dir)='asc' then c.updated_at end asc, case when v_sort='updated_at' and lower(p_dir)<>'asc' then c.updated_at end desc,c.id
  limit greatest(1,least(p_limit,200)) offset greatest(p_offset,0);
end $function$;

CREATE OR REPLACE FUNCTION public.seo_rank_target_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'created_at'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(target_id uuid, site_id uuid, site_name text, site_domain text, brand_id uuid, keyword_id uuid, keyword text, engine text, device text, search_type text, tracking_label text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, organization_id uuid, organization_name text, owner_email text, is_owner boolean, access_level text, latest_position integer, previous_position integer, movement integer, best_position integer, last_checked_at timestamp with time zone, history_observed_at timestamp with time zone[], history_organic_rank integer[], total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('seo_rank_target')));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'created_at'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team') THEN
    v_ctx := platform.shown_to_context('seo_rank_target');
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_rank_target_list_scoped: not authenticated';
  END IF;
  IF v_scope NOT IN ('mine', 'team','orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'seo_rank_target_list_scoped: unknown scope %', v_scope;
  END IF;
  IF v_sort NOT IN (
    'keyword', 'site_name', 'tracking_label', 'device', 'latest_position',
    'movement', 'best_position', 'last_checked_at', 'is_active', 'created_at'
  ) THEN
    v_sort := 'created_at';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id AS b_target_id,
      coalesce(t.site_id, target_page.site_id) AS b_site_id,
      s.name AS b_site_name,
      s.domain AS b_site_domain,
      s.brand_id AS b_brand_id,
      s.visibility AS b_site_visibility,
      CASE
        WHEN s.id IS NOT NULL
        THEN iam.has_access('web_site', s.id, 'viewer')
        ELSE false
      END AS b_site_accessible,
      t.target_page_id AS b_target_page_id,
      t.keyword_id AS b_keyword_id,
      k.phrase AS b_keyword,
      t.engine AS b_engine,
      t.device AS b_device,
      t.search_type AS b_search_type,
      public.seo_rank_tracking_label(t.engine, t.search_type) AS b_tracking_label,
      t.is_active AS b_is_active,
      t.created_at AS b_created_at,
      t.updated_at AS b_updated_at,
      t.created_by AS b_created_by,
      t.organization_id AS b_org_id,
      o.name AS b_org_name,
      au.email::text AS b_owner_email,
      t.shown_to AS b_shown, t.visibility AS b_visibility
    FROM seo.rank_target t
    JOIN seo.keyword k ON k.id = t.keyword_id AND k.deleted_at IS NULL
    LEFT JOIN web.page target_page
      ON target_page.id = t.target_page_id AND target_page.deleted_at IS NULL
    LEFT JOIN web.site s
      ON s.id = coalesce(t.site_id, target_page.site_id) AND s.deleted_at IS NULL
    LEFT JOIN iam.organizations o ON o.id = t.organization_id
    LEFT JOIN platform.visible_user_identity au ON au.id = t.created_by
    WHERE t.deleted_at IS NULL
  ),
  scoped AS (
    SELECT b.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM base b
    WHERE v_scope = 'mine' AND b.b_created_by = v_uid

    UNION ALL

    SELECT b.*, (b.b_created_by = v_uid), CASE WHEN b.b_created_by = v_uid THEN 'owner' ELSE 'org' END::text
    FROM base b
    WHERE v_scope IN ('orgs','team')
      AND (p_org_id IS NULL OR b.b_org_id = p_org_id) AND b.b_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (b.b_org_id, b.b_created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(b.b_shown, b.b_visibility, b.b_created_by, b.b_org_id, v_uid, v_ctx)

    UNION ALL

    SELECT b.*, false, 'shared'::text
    FROM base b
    WHERE v_scope = 'shared'
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND (
        public.has_permission('seo_rank_target', b.b_target_id, 'viewer')
        OR (b.b_target_page_id IS NOT NULL AND public.has_permission('web_page', b.b_target_page_id, 'viewer'
        ))
        OR (b.b_site_id IS NOT NULL AND public.has_permission('web_site', b.b_site_id, 'viewer'
        ))
        OR (b.b_brand_id IS NOT NULL AND public.has_permission('web_brand', b.b_brand_id, 'viewer'
        ))
      )

    UNION ALL

    SELECT b.*, false, 'public'::text
    FROM base b
    WHERE v_scope = 'public'
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND b.b_site_visibility = 'public'::platform.visibility
  ),
  -- ONE row-secured read of the observations (lib/list-scope/FEATURE.md, invariant 11). The two
  -- laterals below used to read seo.rank_observation separately, and each read built that table's
  -- full RLS access set (~0.8 s for an admin) on its own. Same rows (same predicate, same snapshot).
  obs90 AS MATERIALIZED (
    SELECT ro.rank_target_id, ro.id, ro.observed_at, ro.organic_rank
    FROM seo.rank_observation ro
    WHERE ro.rank_target_id IN (SELECT sc.b_target_id FROM scoped sc)
      AND ro.observed_at >= now() - interval '90 days'
  ),
  enriched AS (
    SELECT
      s.*,
      obs.latest_position AS e_latest_position,
      obs.previous_position AS e_previous_position,
      CASE
        WHEN obs.latest_position IS NOT NULL AND obs.previous_position IS NOT NULL
        THEN obs.previous_position - obs.latest_position
      END AS e_movement,
      obs.best_position AS e_best_position,
      obs.last_checked_at AS e_last_checked_at
    FROM scoped s
    LEFT JOIN LATERAL (
      SELECT
        (array_agg(ro.organic_rank ORDER BY ro.observed_at DESC, ro.id DESC)
          FILTER (WHERE ro.organic_rank IS NOT NULL))[1] AS latest_position,
        (array_agg(ro.organic_rank ORDER BY ro.observed_at DESC, ro.id DESC)
          FILTER (WHERE ro.organic_rank IS NOT NULL))[2] AS previous_position,
        min(ro.organic_rank) FILTER (WHERE ro.organic_rank IS NOT NULL) AS best_position,
        max(ro.observed_at) AS last_checked_at
      FROM obs90 ro
      WHERE ro.rank_target_id = s.b_target_id
    ) obs ON true
  ),
  filtered AS (
    SELECT e.*
    FROM enriched e
    WHERE (
      v_search IS NULL
      OR e.b_keyword ILIKE '%' || v_search || '%'
      OR coalesce(e.b_site_name, '') ILIKE '%' || v_search || '%'
      OR coalesce(e.b_site_domain, '') ILIKE '%' || v_search || '%'
      OR e.b_tracking_label ILIKE '%' || v_search || '%'
    )
      AND (NOT v_f ? 'keyword'
        OR e.b_keyword ILIKE '%' || (v_f->'keyword'->>'value') || '%')
      AND (NOT v_f ? 'site_name'
        OR coalesce(e.b_site_name, '') ILIKE '%' || (v_f->'site_name'->>'value') || '%'
        OR coalesce(e.b_site_domain, '') ILIKE '%' || (v_f->'site_name'->>'value') || '%')
      AND (NOT v_f ? 'tracking_label' OR e.b_tracking_label IN (
        SELECT jsonb_array_elements_text(v_f->'tracking_label'->'values')
      ))
      AND (NOT v_f ? 'device' OR e.b_device IN (
        SELECT jsonb_array_elements_text(v_f->'device'->'values')
      ))
      AND (NOT v_f ? 'latest_position' OR public.seo_rank_position_bucket(e.e_latest_position) IN (
        SELECT jsonb_array_elements_text(v_f->'latest_position'->'values')
      ))
      AND (NOT v_f ? 'movement' OR CASE
        WHEN e.e_movement IS NULL THEN 'unknown'
        WHEN e.e_movement > 0 THEN 'improved'
        WHEN e.e_movement < 0 THEN 'declined'
        ELSE 'unchanged'
      END IN (SELECT jsonb_array_elements_text(v_f->'movement'->'values')))
      AND (NOT v_f ? 'best_position' OR public.seo_rank_position_bucket(e.e_best_position) IN (
        SELECT jsonb_array_elements_text(v_f->'best_position'->'values')
      ))
      AND (NOT v_f ? 'last_checked_at' OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_f->'last_checked_at'->'values') bucket
        WHERE CASE bucket
          WHEN 'never' THEN e.e_last_checked_at IS NULL
          ELSE e.e_last_checked_at >= public.agx_since_bucket(bucket)
        END
      ))
      AND (NOT v_f ? 'is_active'
        OR e.b_is_active IS NOT DISTINCT FROM (v_f->'is_active'->>'value')::boolean)
      AND (NOT v_f ? 'created_at' OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_f->'created_at'->'values') bucket
        WHERE e.b_created_at >= public.agx_since_bucket(bucket)
      ))
  ),
  scored AS (
    SELECT f.*, CASE
      WHEN v_search IS NULL THEN 0
      WHEN lower(f.b_keyword) = lower(v_search) THEN 10000
      WHEN lower(f.b_keyword) LIKE lower(v_search) || '%' THEN 5000
      WHEN f.b_keyword ILIKE '%' || v_search || '%' THEN 3000
      WHEN coalesce(f.b_site_name, '') ILIKE '%' || v_search || '%' THEN 1000
      WHEN coalesce(f.b_site_domain, '') ILIKE '%' || v_search || '%' THEN 800
      ELSE 100
    END AS s_search_score
    FROM filtered f
  ),
  counted AS (
    SELECT s.*, count(*) OVER () AS s_total_count
    FROM scored s
  ),
  page_rows AS (
    SELECT c.*
    FROM counted c
    ORDER BY
      CASE WHEN v_search IS NOT NULL THEN c.s_search_score END DESC NULLS LAST,
      CASE WHEN v_sort = 'keyword' AND v_dir = 'desc' THEN lower(c.b_keyword) END DESC,
      CASE WHEN v_sort = 'keyword' AND v_dir = 'asc' THEN lower(c.b_keyword) END ASC,
      CASE WHEN v_sort = 'site_name' AND v_dir = 'desc' THEN lower(coalesce(c.b_site_name, '')) END DESC,
      CASE WHEN v_sort = 'site_name' AND v_dir = 'asc' THEN lower(coalesce(c.b_site_name, '')) END ASC,
      CASE WHEN v_sort = 'tracking_label' AND v_dir = 'desc' THEN lower(c.b_tracking_label) END DESC,
      CASE WHEN v_sort = 'tracking_label' AND v_dir = 'asc' THEN lower(c.b_tracking_label) END ASC,
      CASE WHEN v_sort = 'device' AND v_dir = 'desc' THEN lower(c.b_device) END DESC,
      CASE WHEN v_sort = 'device' AND v_dir = 'asc' THEN lower(c.b_device) END ASC,
      CASE WHEN v_sort = 'latest_position' AND v_dir = 'desc' THEN c.e_latest_position END DESC NULLS LAST,
      CASE WHEN v_sort = 'latest_position' AND v_dir = 'asc' THEN c.e_latest_position END ASC NULLS LAST,
      CASE WHEN v_sort = 'movement' AND v_dir = 'desc' THEN c.e_movement END DESC NULLS LAST,
      CASE WHEN v_sort = 'movement' AND v_dir = 'asc' THEN c.e_movement END ASC NULLS LAST,
      CASE WHEN v_sort = 'best_position' AND v_dir = 'desc' THEN c.e_best_position END DESC NULLS LAST,
      CASE WHEN v_sort = 'best_position' AND v_dir = 'asc' THEN c.e_best_position END ASC NULLS LAST,
      CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'desc' THEN c.e_last_checked_at END DESC NULLS LAST,
      CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'asc' THEN c.e_last_checked_at END ASC NULLS LAST,
      CASE WHEN v_sort = 'is_active' AND v_dir = 'desc' THEN c.b_is_active END DESC,
      CASE WHEN v_sort = 'is_active' AND v_dir = 'asc' THEN c.b_is_active END ASC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN c.b_created_at END DESC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN c.b_created_at END ASC,
      c.b_target_id
    LIMIT greatest(coalesce(p_limit, 25), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT
    p.b_target_id,
    CASE WHEN p.b_site_accessible THEN p.b_site_id END,
    CASE WHEN p.b_site_accessible THEN p.b_site_name END,
    CASE WHEN p.b_site_accessible THEN p.b_site_domain END,
    CASE WHEN p.b_site_accessible THEN p.b_brand_id END,
    p.b_keyword_id,
    p.b_keyword,
    p.b_engine,
    p.b_device,
    p.b_search_type,
    p.b_tracking_label,
    p.b_is_active,
    p.b_created_at,
    p.b_updated_at,
    p.b_created_by,
    p.b_org_id,
    p.b_org_name,
    p.b_owner_email,
    p.s_is_owner,
    p.s_access,
    p.e_latest_position,
    p.e_previous_position,
    p.e_movement,
    p.e_best_position,
    p.e_last_checked_at,
    coalesce(history.observed_at, ARRAY[]::timestamptz[]),
    coalesce(history.organic_rank, ARRAY[]::integer[]),
    p.s_total_count
  FROM page_rows p
  LEFT JOIN LATERAL (
    SELECT
      array_agg(ro.observed_at ORDER BY ro.observed_at ASC, ro.id ASC) AS observed_at,
      array_agg(ro.organic_rank ORDER BY ro.observed_at ASC, ro.id ASC) AS organic_rank
    FROM obs90 ro
    WHERE ro.rank_target_id = p.b_target_id
  ) history ON true
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN p.s_search_score END DESC NULLS LAST,
    CASE WHEN v_sort = 'keyword' AND v_dir = 'desc' THEN lower(p.b_keyword) END DESC,
    CASE WHEN v_sort = 'keyword' AND v_dir = 'asc' THEN lower(p.b_keyword) END ASC,
    CASE WHEN v_sort = 'site_name' AND v_dir = 'desc' THEN lower(coalesce(p.b_site_name, '')) END DESC,
    CASE WHEN v_sort = 'site_name' AND v_dir = 'asc' THEN lower(coalesce(p.b_site_name, '')) END ASC,
    CASE WHEN v_sort = 'tracking_label' AND v_dir = 'desc' THEN lower(p.b_tracking_label) END DESC,
    CASE WHEN v_sort = 'tracking_label' AND v_dir = 'asc' THEN lower(p.b_tracking_label) END ASC,
    CASE WHEN v_sort = 'device' AND v_dir = 'desc' THEN lower(p.b_device) END DESC,
    CASE WHEN v_sort = 'device' AND v_dir = 'asc' THEN lower(p.b_device) END ASC,
    CASE WHEN v_sort = 'latest_position' AND v_dir = 'desc' THEN p.e_latest_position END DESC NULLS LAST,
    CASE WHEN v_sort = 'latest_position' AND v_dir = 'asc' THEN p.e_latest_position END ASC NULLS LAST,
    CASE WHEN v_sort = 'movement' AND v_dir = 'desc' THEN p.e_movement END DESC NULLS LAST,
    CASE WHEN v_sort = 'movement' AND v_dir = 'asc' THEN p.e_movement END ASC NULLS LAST,
    CASE WHEN v_sort = 'best_position' AND v_dir = 'desc' THEN p.e_best_position END DESC NULLS LAST,
    CASE WHEN v_sort = 'best_position' AND v_dir = 'asc' THEN p.e_best_position END ASC NULLS LAST,
    CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'desc' THEN p.e_last_checked_at END DESC NULLS LAST,
    CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'asc' THEN p.e_last_checked_at END ASC NULLS LAST,
    CASE WHEN v_sort = 'is_active' AND v_dir = 'desc' THEN p.b_is_active END DESC,
    CASE WHEN v_sort = 'is_active' AND v_dir = 'asc' THEN p.b_is_active END ASC,
    CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN p.b_created_at END DESC,
    CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN p.b_created_at END ASC,
    p.b_target_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.shx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, kind text, label text, family text, authoring_owner text, is_active boolean, has_component boolean, visibility text, origin text, organization_id uuid, organization_name text, created_by uuid, owner_email text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('content_ir_kind')));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_system_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
BEGIN
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team') THEN
    v_ctx := platform.shown_to_context('content_ir_kind');
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'shx_list_scoped: not authenticated';
  END IF;
  IF v_scope NOT IN ('mine', 'team','orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'shx_list_scoped: unknown scope %', v_scope;
  END IF;
  IF v_sort NOT IN (
    'label', 'kind', 'family', 'authoring_owner', 'status', 'component',
    'visibility', 'origin', 'organization_name', 'owner_email',
    'access_level', 'version', 'created', 'updated'
  ) THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT kd.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'mine' AND kd.created_by = v_uid

    UNION ALL

    SELECT kd.*, (kd.created_by = v_uid), CASE WHEN kd.created_by = v_uid THEN 'owner' ELSE 'org' END::text
    FROM content_ir.kind_definition kd
    WHERE v_scope IN ('orgs','team')
      AND (p_org_id IS NULL OR kd.organization_id = p_org_id) AND kd.organization_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (kd.organization_id, kd.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(kd.shown_to, kd.visibility, kd.created_by, kd.organization_id, v_uid, v_ctx)

    UNION ALL

    SELECT kd.*, false, permission.permission_level::text
    FROM content_ir.kind_definition kd
    JOIN iam.permissions permission
      ON permission.resource_type = 'content_ir_kind'
     AND permission.resource_id = kd.id
     AND permission.granted_to_user_id = v_uid
    WHERE v_scope = 'shared'
      AND kd.created_by IS DISTINCT FROM v_uid

    UNION ALL

    SELECT org_shared.*
    FROM (
      SELECT DISTINCT ON (kd.id)
        kd.*, false AS s_is_owner, permission.permission_level::text AS s_access
      FROM content_ir.kind_definition kd
      JOIN iam.permissions permission
        ON permission.resource_type = 'content_ir_kind'
       AND permission.resource_id = kd.id
       AND permission.granted_to_organization_id IN (
         SELECT om.organization_id
         FROM iam.organization_member om
         WHERE om.user_id = v_uid
       )
      WHERE v_scope = 'shared'
        AND kd.created_by IS DISTINCT FROM v_uid
        AND NOT EXISTS (
          SELECT 1
          FROM iam.permissions direct_permission
          WHERE direct_permission.resource_type = 'content_ir_kind'
            AND direct_permission.resource_id = kd.id
            AND direct_permission.granted_to_user_id = v_uid
        )
      ORDER BY kd.id, permission.permission_level::text
    ) org_shared

    UNION ALL

    SELECT kd.*, false, 'public'::text
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'public'
      AND kd.created_by IS DISTINCT FROM v_uid
      AND kd.visibility = 'public'
  ),
  enriched AS (
    SELECT
      scoped.*,
      organization.name AS s_org_name,
      owner_user.email::text AS s_owner_email,
      EXISTS (
        SELECT 1
        FROM content_ir.kind_component component
        WHERE component.kind_definition_id = scoped.id
          AND component.is_active
          AND component.deleted_at IS NULL
          AND component.role = 'output'
          AND component.component_key <> 'generic_structured'
      ) AS s_has_component,
      CASE
        WHEN scoped.organization_id = v_system_org THEN 'system'
        ELSE 'organization'
      END AS s_origin,
      CASE
        WHEN jsonb_typeof(scoped.metadata -> 'family') = 'string'
          THEN scoped.metadata ->> 'family'
        ELSE NULL
      END AS s_family
    FROM scoped
    LEFT JOIN iam.organizations organization ON organization.id = scoped.organization_id
    LEFT JOIN platform.visible_user_identity owner_user ON owner_user.id = scoped.created_by
  ),
  filtered AS (
    SELECT enriched.*
    FROM enriched
    WHERE enriched.deleted_at IS NULL
      AND enriched.is_contract_artifact IS NOT TRUE
      AND (
        v_search IS NULL
        OR enriched.label ILIKE '%' || v_search || '%'
        OR enriched.kind ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_family, '') ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_org_name, '') ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_owner_email, '') ILIKE '%' || v_search || '%'
      )
      AND (NOT v_filters ? 'label' OR enriched.label ILIKE '%' || (v_filters -> 'label' ->> 'value') || '%')
      AND (NOT v_filters ? 'kind' OR enriched.kind ILIKE '%' || (v_filters -> 'kind' ->> 'value') || '%')
      AND (NOT v_filters ? 'organization_name' OR coalesce(enriched.s_org_name, '') ILIKE '%' || (v_filters -> 'organization_name' ->> 'value') || '%')
      AND (NOT v_filters ? 'owner_email' OR coalesce(enriched.s_owner_email, '') ILIKE '%' || (v_filters -> 'owner_email' ->> 'value') || '%')
      AND (NOT v_filters ? 'family' OR coalesce(enriched.s_family, '__none__') IN (SELECT jsonb_array_elements_text(v_filters -> 'family' -> 'values')))
      AND (NOT v_filters ? 'authoring_owner' OR enriched.authoring_owner IN (SELECT jsonb_array_elements_text(v_filters -> 'authoring_owner' -> 'values')))
      AND (NOT v_filters ? 'status' OR (CASE WHEN enriched.is_active THEN 'active' ELSE 'inactive' END) IN (SELECT jsonb_array_elements_text(v_filters -> 'status' -> 'values')))
      AND (NOT v_filters ? 'component' OR (CASE WHEN enriched.s_has_component THEN 'custom' ELSE 'generic' END) IN (SELECT jsonb_array_elements_text(v_filters -> 'component' -> 'values')))
      AND (NOT v_filters ? 'visibility' OR enriched.visibility::text IN (SELECT jsonb_array_elements_text(v_filters -> 'visibility' -> 'values')))
      AND (NOT v_filters ? 'origin' OR enriched.s_origin IN (SELECT jsonb_array_elements_text(v_filters -> 'origin' -> 'values')))
      AND (NOT v_filters ? 'access_level' OR enriched.s_access IN (SELECT jsonb_array_elements_text(v_filters -> 'access_level' -> 'values')))
      AND (NOT v_filters ? 'version' OR enriched.version::text IN (SELECT jsonb_array_elements_text(v_filters -> 'version' -> 'values')))
      AND (NOT v_filters ? 'created' OR enriched.created_at >= public.shx_since_bucket(v_filters -> 'created' -> 'values' ->> 0))
      AND (NOT v_filters ? 'updated' OR enriched.updated_at >= public.shx_since_bucket(v_filters -> 'updated' -> 'values' ->> 0))
  ),
  scored AS (
    SELECT filtered.*, public.shx_search_score(
      v_search,
      filtered.label,
      filtered.kind,
      filtered.s_family,
      filtered.s_owner_email,
      filtered.s_org_name
    ) AS s_score
    FROM filtered
  ),
  counted AS (
    SELECT scored.*, count(*) OVER () AS s_total
    FROM scored
  )
  SELECT
    counted.id,
    counted.kind,
    counted.label,
    counted.s_family,
    counted.authoring_owner,
    counted.is_active,
    counted.s_has_component,
    counted.visibility::text,
    counted.s_origin,
    counted.organization_id,
    counted.s_org_name,
    counted.created_by,
    counted.s_owner_email,
    counted.version,
    counted.created_at,
    counted.updated_at,
    counted.s_is_owner,
    counted.s_access,
    counted.s_total
  FROM counted
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN counted.s_score END DESC NULLS LAST,
    CASE WHEN v_sort = 'label' AND v_dir = 'asc' THEN lower(counted.label) END ASC,
    CASE WHEN v_sort = 'label' AND v_dir = 'desc' THEN lower(counted.label) END DESC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'asc' THEN lower(counted.kind) END ASC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'desc' THEN lower(counted.kind) END DESC,
    CASE WHEN v_sort = 'family' AND v_dir = 'asc' THEN lower(coalesce(counted.s_family, '')) END ASC,
    CASE WHEN v_sort = 'family' AND v_dir = 'desc' THEN lower(coalesce(counted.s_family, '')) END DESC,
    CASE WHEN v_sort = 'authoring_owner' AND v_dir = 'asc' THEN counted.authoring_owner END ASC,
    CASE WHEN v_sort = 'authoring_owner' AND v_dir = 'desc' THEN counted.authoring_owner END DESC,
    CASE WHEN v_sort = 'status' AND v_dir = 'asc' THEN counted.is_active END ASC,
    CASE WHEN v_sort = 'status' AND v_dir = 'desc' THEN counted.is_active END DESC,
    CASE WHEN v_sort = 'component' AND v_dir = 'asc' THEN counted.s_has_component END ASC,
    CASE WHEN v_sort = 'component' AND v_dir = 'desc' THEN counted.s_has_component END DESC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'asc' THEN counted.visibility::text END ASC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'desc' THEN counted.visibility::text END DESC,
    CASE WHEN v_sort = 'origin' AND v_dir = 'asc' THEN counted.s_origin END ASC,
    CASE WHEN v_sort = 'origin' AND v_dir = 'desc' THEN counted.s_origin END DESC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'asc' THEN lower(coalesce(counted.s_org_name, '')) END ASC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'desc' THEN lower(coalesce(counted.s_org_name, '')) END DESC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'asc' THEN lower(coalesce(counted.s_owner_email, '')) END ASC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'desc' THEN lower(coalesce(counted.s_owner_email, '')) END DESC,
    CASE WHEN v_sort = 'access_level' AND v_dir = 'asc' THEN counted.s_access END ASC,
    CASE WHEN v_sort = 'access_level' AND v_dir = 'desc' THEN counted.s_access END DESC,
    CASE WHEN v_sort = 'version' AND v_dir = 'asc' THEN counted.version END ASC,
    CASE WHEN v_sort = 'version' AND v_dir = 'desc' THEN counted.version END DESC,
    CASE WHEN v_sort = 'created' AND v_dir = 'asc' THEN counted.created_at END ASC,
    CASE WHEN v_sort = 'created' AND v_dir = 'desc' THEN counted.created_at END DESC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'asc' THEN counted.updated_at END ASC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'desc' THEN counted.updated_at END DESC,
    counted.id
  LIMIT greatest(coalesce(p_limit, 25), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, kind text, title text, description text, status text, folder_name text, tags text[], duration_seconds numeric, word_count integer, is_draft boolean, session_id uuid, transcript_id uuid, segment_index integer, visibility text, created_by uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('studio_session')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team') THEN
    v_ctx := jsonb_build_object('transcript', platform.shown_to_context('transcript'), 'studio_session', platform.shown_to_context('studio_session'));
  END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'trx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','public') THEN
    RAISE EXCEPTION 'trx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','title','description','kind','status',
                    'folder_name','tags','duration','word_count',
                    'organization_name','owner_email','visibility','draft') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT t.id AS u_id, 'transcript'::text AS u_kind,
      coalesce(nullif(t.title,''),'Untitled transcript') AS u_title,
      coalesce(t.description,'') AS u_description,
      CASE WHEN t.is_draft THEN 'draft' ELSE 'final' END AS u_status,
      coalesce(nullif(t.folder_name,''),'Transcripts') AS u_folder,
      coalesce(t.tags, ARRAY[]::text[]) AS u_tags,
      CASE WHEN t.metadata->>'duration' ~ '^[0-9]+\.?[0-9]*$'
           THEN (t.metadata->>'duration')::numeric END AS u_duration,
      CASE WHEN t.metadata->>'wordCount' ~ '^[0-9]+$'
           THEN (t.metadata->>'wordCount')::integer END AS u_words,
      coalesce(t.is_draft,false) AS u_draft,
      NULL::uuid AS u_session_id, NULL::uuid AS u_transcript_id,
      NULL::integer AS u_segment_index,
      t.visibility::text AS u_visibility, t.created_by AS u_user_id,
      t.organization_id AS u_org_id, t.created_at AS u_created, t.updated_at AS u_updated,
      (p_deep AND v_search IS NOT NULL AND t.segments::text ILIKE '%'||v_search||'%') AS u_deep_hit,
      t.shown_to AS u_shown, 'transcript'::text AS u_token
    FROM transcripts.transcripts t
    WHERE t.deleted_at IS NULL
    UNION ALL
    SELECT s.id, CASE WHEN s.source='cleanup' THEN 'cleanup' ELSE 'session' END,
      coalesce(nullif(s.title,''),'Untitled session'), ''::text,
      coalesce(s.status,''),
      NULL::text, ARRAY[]::text[],
      nullif(s.total_duration_ms,0)::numeric / 1000.0,
      NULL::integer, false,
      NULL::uuid, s.transcript_id, NULL::integer,
      s.visibility::text, s.created_by, s.organization_id, s.created_at, s.updated_at,
      false, s.shown_to, 'studio_session'::text
    FROM transcripts.studio_sessions s
    WHERE s.deleted_at IS NULL
    UNION ALL
    SELECT r.id, 'unsorted'::text,
      'Recording ' || (r.segment_index + 1)::text, ''::text,
      'unsorted'::text,
      NULL::text, ARRAY[]::text[],
      CASE WHEN r.ended_at IS NOT NULL AND r.ended_at > r.started_at
           THEN extract(epoch FROM (r.ended_at - r.started_at)) END,
      NULL::integer, false,
      r.session_id, NULL::uuid, r.segment_index,
      coalesce(ps.visibility::text,'personal'), r.user_id,
      coalesce(r.organization_id, ps.organization_id),
      r.started_at, coalesce(r.detached_at, r.updated_at, r.started_at),
      false, ps.shown_to, 'studio_session'::text
    FROM transcripts.studio_recording_segments r
    LEFT JOIN transcripts.studio_sessions ps ON ps.id = r.session_id
    WHERE r.detached_at IS NOT NULL AND r.archived_at IS NULL AND r.deleted_at IS NULL
      AND (ps.id IS NULL OR ps.deleted_at IS NULL)
  ),
  scoped AS (
    SELECT u.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM unified u WHERE v_scope='mine' AND u.u_user_id = v_uid
    UNION ALL
    SELECT u.*, (u.u_user_id = v_uid), CASE WHEN u.u_user_id = v_uid THEN 'owner' ELSE 'org' END::text FROM unified u
    WHERE v_scope IN ('orgs','team') AND (p_org_id IS NULL OR u.u_org_id = p_org_id) AND u.u_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (u.u_org_id, u.u_user_id) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(u.u_shown, u.u_visibility::platform.visibility, u.u_user_id, u.u_org_id, v_uid, v_ctx -> u.u_token)
    UNION ALL
    SELECT u.*, false, perm.permission_level::text FROM unified u
    JOIN iam.permissions perm
      ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
      AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT * FROM (
      SELECT DISTINCT ON (u.u_id) u.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM unified u
      JOIN iam.permissions perm
        ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
        AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2
          WHERE p2.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
            AND p2.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
            AND p2.granted_to_user_id=v_uid)
      ORDER BY u.u_id, perm.permission_level::text
    ) org_shared
    UNION ALL
    SELECT u.*, false, 'public'::text FROM unified u
    WHERE v_scope='public' AND u.u_user_id IS DISTINCT FROM v_uid AND u.u_visibility='public'
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, au.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.u_org_id
    LEFT JOIN platform.visible_user_identity au ON au.id = s.u_user_id
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE (v_search IS NULL
        OR j.u_title ILIKE '%'||v_search||'%'
        OR j.u_description ILIKE '%'||v_search||'%'
        OR coalesce(j.u_folder,'') ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(j.u_tags) t WHERE t ILIKE '%'||v_search||'%')
        OR j.u_deep_hit)
      AND (NOT v_f ? 'title' OR j.u_title ILIKE '%'||(v_f->'title'->>'value')||'%')
      AND (NOT v_f ? 'description' OR j.u_description ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'kind'
           OR j.u_kind IN (SELECT jsonb_array_elements_text(v_f->'kind'->'values')))
      AND (NOT v_f ? 'status'
           OR coalesce(nullif(j.u_status,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'status'->'values')))
      AND (NOT v_f ? 'folder_name'
           OR (j.u_kind = 'transcript'
               AND coalesce(nullif(j.u_folder,''),'__none__') IN (
                     SELECT jsonb_array_elements_text(v_f->'folder_name'->'values'))))
      AND (NOT v_f ? 'visibility'
           OR j.u_visibility IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'tags'
           OR (j.u_kind = 'transcript'
               AND ((j.u_tags && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
                    OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
                        AND coalesce(array_length(j.u_tags,1),0) = 0))))
      AND (NOT v_f ? 'duration'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'duration'->'values') b
                      WHERE public.trx_duration_matches(j.u_duration, b)))
      AND (NOT v_f ? 'word_count'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'word_count'->'values') b
                      WHERE public.trx_words_matches(j.u_words, b)))
      AND (NOT v_f ? 'updated'
           OR j.u_updated >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.u_created >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      AND (NOT v_f ? 'draft'
           OR j.u_draft IS NOT DISTINCT FROM (v_f->'draft'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, CASE WHEN v_search IS NOT NULL AND coalesce(p_limit, 25) > 1
      THEN public.trx_search_score(
        v_search, f.u_id, f.u_title, f.u_description, f.u_kind, f.u_folder,
        f.u_tags, f.s_owner_email, f.u_deep_hit)
      ELSE 0 END AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.u_id, c.u_kind, c.u_title, c.u_description, c.u_status, c.u_folder,
    c.u_tags, c.u_duration, c.u_words, c.u_draft, c.u_session_id,
    c.u_transcript_id, c.u_segment_index, c.u_visibility, c.u_user_id,
    c.u_org_id, c.s_org_name, c.u_created, c.u_updated,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.u_updated END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.u_updated END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.u_created END ASC,
    CASE WHEN v_sort='title' AND v_dir='desc' THEN lower(c.u_title) END DESC,
    CASE WHEN v_sort='title' AND v_dir='asc' THEN lower(c.u_title) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.u_description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.u_description,'')) END ASC,
    CASE WHEN v_sort='kind' AND v_dir='desc' THEN c.u_kind END DESC,
    CASE WHEN v_sort='kind' AND v_dir='asc' THEN c.u_kind END ASC,
    CASE WHEN v_sort='status' AND v_dir='desc' THEN lower(coalesce(c.u_status,'')) END DESC,
    CASE WHEN v_sort='status' AND v_dir='asc' THEN lower(coalesce(c.u_status,'')) END ASC,
    CASE WHEN v_sort='folder_name' AND v_dir='desc' THEN lower(coalesce(c.u_folder,'')) END DESC,
    CASE WHEN v_sort='folder_name' AND v_dir='asc' THEN lower(coalesce(c.u_folder,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.u_tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.u_tags,','),'')) END ASC,
    CASE WHEN v_sort='duration' AND v_dir='desc' THEN c.u_duration END DESC NULLS LAST,
    CASE WHEN v_sort='duration' AND v_dir='asc' THEN c.u_duration END ASC NULLS LAST,
    CASE WHEN v_sort='word_count' AND v_dir='desc' THEN c.u_words END DESC NULLS LAST,
    CASE WHEN v_sort='word_count' AND v_dir='asc' THEN c.u_words END ASC NULLS LAST,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN c.u_visibility END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN c.u_visibility END ASC,
    CASE WHEN v_sort='draft' AND v_dir='desc' THEN c.u_draft END DESC,
    CASE WHEN v_sort='draft' AND v_dir='asc' THEN c.u_draft END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.wfx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, description text, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, card_visibility text, created_by uuid, organization_id uuid, organization_name text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, step_count integer, run_count bigint, last_run_id uuid, last_run_status text, last_run_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('workflow')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team') THEN
    v_ctx := platform.shown_to_context('workflow');
  END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'wfx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','public') THEN
    RAISE EXCEPTION 'wfx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived','steps','runs','last_run','status') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT d.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM workflow.definition d WHERE v_scope='mine' AND d.created_by = v_uid
    UNION ALL
    SELECT d.*, (d.created_by = v_uid), CASE WHEN d.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM workflow.definition d
    WHERE v_scope IN ('orgs','team') AND (p_org_id IS NULL OR d.organization_id = p_org_id) AND d.organization_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (d.organization_id, d.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(d.shown_to, d.visibility, d.created_by, d.organization_id, v_uid, v_ctx)
    UNION ALL
    SELECT d.*, false, perm.permission_level::text FROM workflow.definition d
    JOIN iam.permissions perm ON perm.resource_type='workflow' AND perm.resource_id=d.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND d.created_by IS DISTINCT FROM v_uid
    UNION ALL
    SELECT DISTINCT ON (d.id) d.*, false, perm.permission_level::text
    FROM workflow.definition d
    JOIN iam.permissions perm ON perm.resource_type='workflow' AND perm.resource_id=d.id
      AND perm.granted_to_organization_id IN (
        SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
    WHERE v_scope='shared' AND d.created_by IS DISTINCT FROM v_uid
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='workflow'
        AND p2.resource_id=d.id AND p2.granted_to_user_id=v_uid)
    UNION ALL
    -- PUBLIC = the workflow's CARD is public. Rows come through workflow.public_card_rows()
    -- (card fields only) because RLS hides a stranger's workflow body from this invoker (2026-09-26).
    SELECT d.*, false, 'public'::text FROM workflow.public_card_rows() d
    WHERE v_scope='public' AND d.created_by IS DISTINCT FROM v_uid
  ),
  joined AS (
    SELECT s.*,
      o.name AS s_org_name,
      u.email::text AS s_owner_email,
      coalesce(jsonb_array_length(s.nodes), 0) AS s_steps,
      coalesce(r.s_runs, 0::bigint) AS s_runs,
      r.s_last_run_id, r.s_last_run_status, r.s_last_run_at
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by
    LEFT JOIN LATERAL (
      SELECT (array_agg(x.id ORDER BY x.created_at DESC))[1] AS s_last_run_id,
             (array_agg(x.status ORDER BY x.created_at DESC))[1] AS s_last_run_status,
             max(x.created_at) AS s_last_run_at,
             count(*) AS s_runs
      FROM workflow.run x
      WHERE x.definition_id = s.id AND x.deleted_at IS NULL
    ) r ON true
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE j.deleted_at IS NULL
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.is_archived IS TRUE
             WHEN 'all' THEN true
             ELSE j.is_archived IS NOT TRUE END)
      AND (v_search IS NULL
        OR j.name ILIKE '%'||v_search||'%'
        OR j.description ILIKE '%'||v_search||'%'
        OR j.category ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(coalesce(j.tags, ARRAY[]::text[])) t
                   WHERE t ILIKE '%'||v_search||'%')
        OR (p_deep AND j.nodes::text ILIKE '%'||v_search||'%'))
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'version'
           OR j.version::text IN (SELECT jsonb_array_elements_text(v_f->'version'->'values')))
      AND (NOT v_f ? 'status'
           OR coalesce(nullif(j.s_last_run_status,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'status'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      AND (NOT v_f ? 'last_run'
           OR j.s_last_run_at >= public.agx_since_bucket(v_f->'last_run'->'values'->>0))
      AND (NOT v_f ? 'steps'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'steps'->'values') b
                      WHERE public.wfx_bucket_matches(j.s_steps::bigint, b)))
      AND (NOT v_f ? 'runs'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'runs'->'values') b
                      WHERE public.wfx_bucket_matches(j.s_runs, b)))
      AND (NOT v_f ? 'favorite'
           OR platform.my_favorite('workflow', j.id) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, public.mtx_search_score(
      v_search, f.id, f.name, f.description, f.tags, f.s_owner_email,
      ARRAY[f.category], ARRAY[f.s_last_run_status],
      p_deep AND f.nodes::text ILIKE '%'||v_search||'%'
    ) AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.id, c.name, c.description, c.category,
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, platform.my_favorite('workflow', c.id),
    c.visibility::text, c.card_visibility::text,
    c.created_by, c.organization_id, c.s_org_name, c.version,
    c.created_at, c.updated_at, c.s_steps, c.s_runs,
    c.s_last_run_id, c.s_last_run_status, c.s_last_run_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN p_favorites_first THEN platform.my_favorite('workflow', c.id) END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.created_at END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.created_at END ASC,
    CASE WHEN v_sort='name' AND v_dir='desc' THEN lower(c.name) END DESC,
    CASE WHEN v_sort='name' AND v_dir='asc' THEN lower(c.name) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.description,'')) END ASC,
    CASE WHEN v_sort='category' AND v_dir='desc' THEN lower(coalesce(c.category,'')) END DESC,
    CASE WHEN v_sort='category' AND v_dir='asc' THEN lower(coalesce(c.category,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='access_level' AND v_dir='desc' THEN lower(coalesce(c.s_access,'')) END DESC,
    CASE WHEN v_sort='access_level' AND v_dir='asc' THEN lower(coalesce(c.s_access,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN lower(c.visibility::text) END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN lower(c.visibility::text) END ASC,
    CASE WHEN v_sort='version' AND v_dir='desc' THEN c.version END DESC,
    CASE WHEN v_sort='version' AND v_dir='asc' THEN c.version END ASC,
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN platform.my_favorite('workflow', c.id) END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN platform.my_favorite('workflow', c.id) END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN c.is_archived END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN c.is_archived END ASC,
    CASE WHEN v_sort='steps' AND v_dir='desc' THEN c.s_steps END DESC,
    CASE WHEN v_sort='steps' AND v_dir='asc' THEN c.s_steps END ASC,
    CASE WHEN v_sort='runs' AND v_dir='desc' THEN c.s_runs END DESC,
    CASE WHEN v_sort='runs' AND v_dir='asc' THEN c.s_runs END ASC,
    CASE WHEN v_sort='last_run' AND v_dir='desc' THEN c.s_last_run_at END DESC NULLS LAST,
    CASE WHEN v_sort='last_run' AND v_dir='asc' THEN c.s_last_run_at END ASC NULLS LAST,
    CASE WHEN v_sort='status' AND v_dir='desc' THEN lower(coalesce(c.s_last_run_status,'')) END DESC,
    CASE WHEN v_sort='status' AND v_dir='asc' THEN lower(coalesce(c.s_last_run_status,'')) END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.edu_library_scope_rows(p_scope text DEFAULT 'mine'::text)
 RETURNS TABLE(id uuid, kind text, subtype text, title text, description text, status text, visibility text, created_by uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  -- THE NARROWEST OF THE FOUR TOKENS THIS LIST UNIONS. `min` over ('mine','orgs') is 'mine', which
  -- is the rule spelled as arithmetic: one token that opens on itself keeps the whole library on
  -- itself. `platform.entity_default_list_scope` is the one mapper from the registry word
  -- `organization` to this vocabulary's `orgs` (§3.3 item 4 — we do not rename a live parameter
  -- vocabulary to make a new column prettier).
  v_default text := (
    SELECT min(platform.entity_default_list_scope(t))
      FROM unnest(ARRAY['fc_set','assessment','study_media','note']) AS t);
  v_scope text := lower(coalesce(p_scope, v_default));
BEGIN
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team') THEN
    v_ctx := jsonb_build_object('fc_set', platform.shown_to_context('fc_set'), 'assessment', platform.shown_to_context('assessment'), 'study_media', platform.shown_to_context('study_media'), 'note', platform.shown_to_context('note'));
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'edu_library_scope_rows: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_scope NOT IN ('mine', 'team', 'orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'edu_library_scope_rows: unknown scope %', v_scope USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT
      s.id AS u_id,
      'fc_set'::text AS u_kind,
      'flashcards'::text AS u_subtype,
      coalesce(nullif(s.name, ''), 'Untitled flashcard deck') AS u_title,
      coalesce(s.description, '') AS u_description,
      'ready'::text AS u_status,
      s.visibility::text AS u_visibility,
      s.created_by AS u_created_by,
      s.organization_id AS u_organization_id,
      s.created_at AS u_created_at,
      s.updated_at AS u_updated_at,
      s.shown_to AS u_shown
    FROM education.fc_set s
    WHERE s.deleted_at IS NULL

    UNION ALL

    SELECT
      a.id,
      'assessment'::text,
      a.assessment_kind,
      coalesce(nullif(a.title, ''), 'Untitled assessment'),
      coalesce(a.description, ''),
      coalesce(nullif(a.status, ''), 'draft'),
      a.visibility::text,
      a.created_by,
      a.organization_id,
      a.created_at,
      a.updated_at,
      a.shown_to
    FROM education.assessment a
    WHERE a.deleted_at IS NULL

    UNION ALL

    SELECT
      m.id,
      'study_media'::text,
      m.media_kind,
      coalesce(nullif(m.title, ''), 'Untitled study media'),
      coalesce(m.description, ''),
      coalesce(nullif(m.status, ''), 'draft'),
      m.visibility::text,
      m.created_by,
      m.organization_id,
      m.created_at,
      m.updated_at,
      m.shown_to
    FROM education.study_media m
    WHERE m.deleted_at IS NULL

    UNION ALL

    SELECT
      n.id,
      'note'::text,
      'notes'::text,
      coalesce(nullif(n.label, ''), 'Untitled note'),
      coalesce(nullif(n.folder_name, ''), 'Study note'),
      'ready'::text,
      n.visibility::text,
      n.created_by,
      n.organization_id,
      n.created_at,
      n.updated_at,
      n.shown_to
    FROM workbench.notes n
    WHERE n.deleted_at IS NULL
      -- ONLY notes marked for Education (the Study Notes folder). A plain note is the Notes app's.
      AND n.folder_name = 'Study Notes'
  ),
  scoped AS (
    SELECT
      u.*,
      true AS s_is_owner,
      'owner'::text AS s_access_level
    FROM unified u
    WHERE v_scope = 'mine'
      AND u.u_created_by = v_uid

    UNION ALL

    -- ORGS — NO PREDICATE. This arm is the whole point of DD-137c: the organization's library is
    -- whatever RLS already lets this person read, the viewer's own rows included. It carries no
    -- membership test (RLS decides membership), no visibility test (RLS decides visibility), and no
    -- `created_by IS DISTINCT FROM` (excluding your own work from "everyone's" is the bug).
    SELECT
      u.*,
      (u.u_created_by = v_uid),
      CASE WHEN u.u_created_by = v_uid THEN 'owner' ELSE 'org' END::text
    FROM unified u
    WHERE v_scope IN ('orgs', 'team')
      -- DD-137c7: the organization tab shows the organizations this person belongs to,
      -- personal included. No visibility test, no owner test — RLS decided both already.
      AND u.u_organization_id IN (SELECT iam.my_orgs())
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(u.u_shown, u.u_visibility::platform.visibility, u.u_created_by, u.u_organization_id, v_uid, v_ctx -> u.u_kind)
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (u.u_organization_id, u.u_created_by) IN
           (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(NULL) r))

    UNION ALL

    SELECT
      u.*,
      false,
      'shared'::text
    FROM unified u
    WHERE v_scope = 'shared'
      AND u.u_created_by IS DISTINCT FROM v_uid
      AND EXISTS (
        SELECT 1
        FROM iam.permissions p
        WHERE p.resource_type = u.u_kind
          AND p.resource_id = u.u_id
          AND p.status = 'active'
          AND (p.expires_at IS NULL OR p.expires_at > now())
          AND (
            p.granted_to_user_id = v_uid
            OR p.granted_to_organization_id IN (
              SELECT om.organization_id
              FROM iam.organization_member om
              WHERE om.user_id = v_uid
            )
          )
      )

    UNION ALL

    SELECT
      u.*,
      false,
      'public'::text
    FROM unified u
    WHERE v_scope = 'public'
      AND u.u_created_by IS DISTINCT FROM v_uid
      AND u.u_visibility = 'public'
  )
  SELECT
    s.u_id,
    s.u_kind,
    s.u_subtype,
    s.u_title,
    s.u_description,
    s.u_status,
    s.u_visibility,
    s.u_created_by,
    s.u_organization_id,
    o.name,
    s.u_created_at,
    s.u_updated_at,
    s.s_is_owner,
    s.s_access_level,
    au.email::text
  FROM scoped s
  LEFT JOIN iam.organizations o ON o.id = s.u_organization_id
  LEFT JOIN platform.visible_user_identity au ON au.id = s.u_created_by;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_inbox_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'occurred'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, occurred_at timestamp with time zone, created_at timestamp with time zone, channel_code text, subject text, snippet text, thread_key text, classification text, evidence text, handled boolean, handled_at timestamp with time zone, party_id uuid, party_name text, party_kind text, employer_id uuid, employer_name text, outreach_list_id uuid, outreach_list_name text, outreach_list_status text, member_id uuid, member_status text, step integer, outbound_id uuid, outbound_subject text, outbound_sent_at timestamp with time zone, sending_identity_id uuid, sending_identity_label text, reputation_case_id uuid, reputation_case_label text, reputation_case_site_id uuid, reputation_case_brand_id uuid, backlink_id uuid, backlink_label text, backlink_site_id uuid, backlink_brand_id uuid, organization_id uuid, organization_name text, is_owner boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_scope  text := lower(coalesce(p_scope, platform.entity_default_list_scope('crm_interaction')));
  v_dir    text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort   text := lower(coalesce(p_sort, 'occurred'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f      jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'crm_inbox_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs') THEN
    RAISE EXCEPTION 'crm_inbox_list_scoped: unsupported scope % (this surface declares mine|orgs)', v_scope;
  END IF;
  IF v_sort NOT IN ('occurred','created','party_name','subject','snippet','classification',
                    'outreach_list_name','sending_identity_label','employer_name','step',
                    'handled','channel','organization_name','member_status','why') THEN
    v_sort := 'occurred';
  END IF;

  RETURN QUERY
  WITH reachable_parties AS (
    SELECT unnest(iam.accessible_entity_ids('party'::text, 'viewer'::permission_level)) AS party_id
  ),
  inbound AS (
    SELECT
      i.id                       AS u_id,
      coalesce(i.occurred_at, i.created_at) AS u_occurred,
      i.created_at               AS u_created,
      i.channel_code             AS u_channel,
      coalesce(nullif(btrim(i.subject), ''), '(no subject)') AS u_subject,
      left(coalesce(i.body, ''), 400) AS u_snippet,
      i.body                     AS u_body,
      i.thread_key               AS u_thread_key,
      public.crm_inbound_label(i.attributes)    AS u_classification,
      public.crm_inbound_evidence(i.attributes) AS u_evidence,
      (i.attributes #>> '{inbox,handled_at}')::timestamptz AS u_handled_at,
      i.party_id                 AS u_party_id,
      i.outreach_list_id         AS u_list_id,
      i.organization_id          AS u_org_id,
      -- WHOSE reply: the campaign's owner (the runner acts as them, D-W1-3), else the person who saved
      -- the row. Never i.created_by: crm.interaction is a component, so the database rewrites
      -- created_by to the PARTY's owner (db-rules §6d-1). NULL is unknown, never a fallback.
      coalesce((SELECT ol.created_by FROM crm.outreach_list ol WHERE ol.id = i.outreach_list_id),
               i.updated_by)       AS u_created_by,
      i.assigned_to              AS u_assigned_to
    FROM crm.interaction i
    WHERE i.deleted_at IS NULL
      AND i.direction = 'inbound'
      -- THE RLS CEILING, RESTATED (crm.interaction std_select).
      AND (i.party_id IN (SELECT rp.party_id FROM reachable_parties rp)
           OR iam.has_access('crm_interaction'::text, i.id, 'viewer'::permission_level))
  ),
  scoped AS (
    -- MINE — the runner acts as the campaign owner (D-W1-3), so an ingested
    -- reply on my campaign is mine (u_created_by is that person, see above). Assignment counts too: a
    -- reply handed to me is mine to answer.
    SELECT b.*, true AS s_is_owner
    FROM inbound b
    WHERE v_scope = 'mine'
      AND (b.u_created_by = v_uid OR b.u_assigned_to = v_uid)
    UNION ALL
    SELECT b.*, (b.u_created_by = v_uid) AS s_is_owner
    FROM inbound b
    WHERE v_scope IN ('orgs','team')
      AND (p_org_id IS NULL OR b.u_org_id = p_org_id) AND b.u_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (b.u_org_id, b.u_created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
  ),
  -- The outbound step this reply answers: same Gmail thread, sent at or before
  -- the reply. D-W1-5 — correlation is by thread_key, never RFC822 Message-ID.
  -- MATERIALIZED on purpose (lib/list-scope/FEATURE.md, invariant 11): the joins below key on
  -- x_*_id, which are computed (NULLIF over jsonb, cast to uuid). Inlined, that computed key is
  -- not leakproof, so PostgreSQL may not use it as an index condition against a row-secured table
  -- (seo.reputation_case, seo.backlink) and scanned every row of both, building their full RLS
  -- access sets (~1.2 s for an admin) to answer three rows. Materialized, the key is a plain
  -- column and each join is a primary-key lookup. Same rows, same values.
  contextual AS MATERIALIZED (
    SELECT
      s.*,
      ob.id           AS x_outbound_id,
      ob.subject      AS x_outbound_subject,
      coalesce(ob.occurred_at, ob.created_at) AS x_outbound_sent_at,
      ob.attempt_number::integer AS x_step,
      nullif(ob.attributes #>> '{outreach_single_send,reputation_case_id}', '')::uuid AS x_reputation_case_id,
      nullif(ob.attributes #>> '{outreach_single_send,backlink_id}', '')::uuid        AS x_backlink_id,
      nullif(ob.attributes #>> '{outreach_single_send,member_id}', '')::uuid          AS x_member_id
    FROM scoped s
    LEFT JOIN LATERAL (
      SELECT o.*
      FROM crm.interaction o
      WHERE o.deleted_at IS NULL
        AND o.direction = 'outbound'
        AND s.u_thread_key IS NOT NULL
        AND o.thread_key = s.u_thread_key
        AND coalesce(o.occurred_at, o.created_at) <= s.u_occurred
      ORDER BY coalesce(o.occurred_at, o.created_at) DESC, o.id
      LIMIT 1
    ) ob ON true
  ),
  joined AS (
    SELECT
      c.*,
      pt.display_name                AS j_party_name,
      pt.party_kind                  AS j_party_kind,
      pt.primary_employer_party_id   AS j_employer_id,
      emp.display_name               AS j_employer_name,
      ol.name                        AS j_list_name,
      ol.status                      AS j_list_status,
      ol.sending_identity_id         AS j_identity_id,
      coalesce(nullif(si.from_name, ''), si.from_address) AS j_identity_label,
      org.name                       AS j_org_name,
      mem.id                         AS j_member_id,
      mem.status                     AS j_member_status,
      coalesce(nullif(rc.headline,''), nullif(rc.source_title,''), rc.source_domain) AS j_case_label,
      rc.site_id                     AS j_case_site_id,
      rcs.brand_id                   AS j_case_brand_id,
      coalesce(nullif(bl.source_url,''), bl.source_domain) AS j_backlink_label,
      bl.site_id                     AS j_backlink_site_id,
      bls.brand_id                   AS j_backlink_brand_id,
      -- HANDLED. Two independent, honest signals; neither is a new table:
      --   (a) a human pressed "Mark handled" -> attributes.inbox.handled_at
      --   (b) we already answered -> a later outbound in the same thread
      -- (b) means replying through the ONE send primitive clears the row on its
      -- own, so the queue cannot rot behind a forgotten checkbox.
      (c.u_handled_at IS NOT NULL
       OR EXISTS (
            SELECT 1 FROM crm.interaction r
            WHERE r.deleted_at IS NULL
              AND r.direction = 'outbound'
              AND c.u_thread_key IS NOT NULL
              AND r.thread_key = c.u_thread_key
              AND coalesce(r.occurred_at, r.created_at) > c.u_occurred
          )) AS j_handled
    FROM contextual c
    LEFT JOIN crm.party pt              ON pt.id  = c.u_party_id
    LEFT JOIN crm.party emp             ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.outreach_list ol      ON ol.id  = c.u_list_id
    LEFT JOIN crm.sending_identity si   ON si.id  = ol.sending_identity_id
    LEFT JOIN iam.organizations org     ON org.id = c.u_org_id
    LEFT JOIN crm.outreach_list_member mem ON mem.id = c.x_member_id AND mem.deleted_at IS NULL
    LEFT JOIN seo.reputation_case rc    ON rc.id  = c.x_reputation_case_id
    LEFT JOIN web.site rcs              ON rcs.id = rc.site_id
    LEFT JOIN seo.backlink bl           ON bl.id  = c.x_backlink_id
    LEFT JOIN web.site bls              ON bls.id = bl.site_id
  ),
  filtered AS (
    SELECT j.*,
      (p_deep AND v_search IS NOT NULL AND coalesce(j.u_body,'') ILIKE '%'||v_search||'%') AS f_deep_hit
    FROM joined j
    WHERE (v_search IS NULL
        OR coalesce(j.j_party_name,'')   ILIKE '%'||v_search||'%'
        OR j.u_subject                   ILIKE '%'||v_search||'%'
        OR j.u_snippet                   ILIKE '%'||v_search||'%'
        OR coalesce(j.j_list_name,'')    ILIKE '%'||v_search||'%'
        OR coalesce(j.j_employer_name,'')ILIKE '%'||v_search||'%'
        OR (p_deep AND coalesce(j.u_body,'') ILIKE '%'||v_search||'%'))
      AND (NOT v_f ? 'party_name'  OR coalesce(j.j_party_name,'') ILIKE '%'||(v_f->'party_name'->>'value')||'%')
      AND (NOT v_f ? 'subject'     OR j.u_subject ILIKE '%'||(v_f->'subject'->>'value')||'%')
      AND (NOT v_f ? 'snippet'     OR j.u_snippet ILIKE '%'||(v_f->'snippet'->>'value')||'%')
      AND (NOT v_f ? 'employer_name' OR coalesce(j.j_employer_name,'') ILIKE '%'||(v_f->'employer_name'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.j_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- "Why we wrote" is a projection of the two motivating records; it filters
      -- and sorts like every other column rather than being the one exempt.
      AND (NOT v_f ? 'why'
           OR coalesce(j.j_case_label, j.j_backlink_label, '') ILIKE '%'||(v_f->'why'->>'value')||'%')
      AND (NOT v_f ? 'classification'
           OR coalesce(nullif(j.u_classification,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'classification'->'values')))
      AND (NOT v_f ? 'outreach_list_name'
           OR coalesce(nullif(j.j_list_name,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'outreach_list_name'->'values')))
      AND (NOT v_f ? 'sending_identity_label'
           OR coalesce(nullif(j.j_identity_label,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'sending_identity_label'->'values')))
      AND (NOT v_f ? 'member_status'
           OR coalesce(nullif(j.j_member_status,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'member_status'->'values')))
      AND (NOT v_f ? 'channel'
           OR j.u_channel IN (SELECT jsonb_array_elements_text(v_f->'channel'->'values')))
      AND (NOT v_f ? 'handled'
           OR j.j_handled IS NOT DISTINCT FROM (v_f->'handled'->>'value')::boolean)
      AND (NOT v_f ? 'step'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'step'->'values') b
                      WHERE public.crm_step_matches(j.x_step, b)))
      AND (NOT v_f ? 'occurred' OR j.u_occurred >= public.agx_since_bucket(v_f->'occurred'->'values'->>0))
      AND (NOT v_f ? 'created'  OR j.u_created  >= public.agx_since_bucket(v_f->'created'->'values'->>0))
  ),
  scored AS (
    -- Only a real page pays for per-row plpgsql scoring; the counts/facets
    -- callers come through with LIMIT 1 (same guard as trx_list_scoped).
    SELECT f.*, CASE WHEN v_search IS NOT NULL AND coalesce(p_limit, 25) > 1
      THEN public.crm_inbox_search_score(
        v_search, f.u_id, f.j_party_name, f.u_subject, f.u_snippet,
        f.j_list_name, f.j_employer_name, f.u_classification, f.f_deep_hit)
      ELSE 0 END AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT
    c.u_id, c.u_occurred, c.u_created, c.u_channel, c.u_subject, c.u_snippet,
    c.u_thread_key, c.u_classification, c.u_evidence, c.j_handled, c.u_handled_at,
    c.u_party_id, c.j_party_name, c.j_party_kind::text, c.j_employer_id, c.j_employer_name,
    c.u_list_id, c.j_list_name, c.j_list_status::text,
    c.j_member_id, c.j_member_status::text, c.x_step,
    c.x_outbound_id, c.x_outbound_subject, c.x_outbound_sent_at,
    c.j_identity_id, c.j_identity_label,
    c.x_reputation_case_id, c.j_case_label, c.j_case_site_id, c.j_case_brand_id,
    c.x_backlink_id, c.j_backlink_label, c.j_backlink_site_id, c.j_backlink_brand_id,
    c.u_org_id, c.j_org_name, c.s_is_owner, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE FIRST while searching (lib/entity-list/FEATURE.md rule 4).
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='occurred'   AND v_dir='desc' THEN c.u_occurred END DESC,
    CASE WHEN v_sort='occurred'   AND v_dir='asc'  THEN c.u_occurred END ASC,
    CASE WHEN v_sort='created'    AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created'    AND v_dir='asc'  THEN c.u_created END ASC,
    CASE WHEN v_sort='party_name' AND v_dir='desc' THEN lower(coalesce(c.j_party_name,'')) END DESC,
    CASE WHEN v_sort='party_name' AND v_dir='asc'  THEN lower(coalesce(c.j_party_name,'')) END ASC,
    CASE WHEN v_sort='subject'    AND v_dir='desc' THEN lower(c.u_subject) END DESC,
    CASE WHEN v_sort='subject'    AND v_dir='asc'  THEN lower(c.u_subject) END ASC,
    CASE WHEN v_sort='snippet'    AND v_dir='desc' THEN lower(c.u_snippet) END DESC,
    CASE WHEN v_sort='snippet'    AND v_dir='asc'  THEN lower(c.u_snippet) END ASC,
    CASE WHEN v_sort='classification' AND v_dir='desc' THEN lower(coalesce(c.u_classification,'')) END DESC,
    CASE WHEN v_sort='classification' AND v_dir='asc'  THEN lower(coalesce(c.u_classification,'')) END ASC,
    CASE WHEN v_sort='outreach_list_name' AND v_dir='desc' THEN lower(coalesce(c.j_list_name,'')) END DESC,
    CASE WHEN v_sort='outreach_list_name' AND v_dir='asc'  THEN lower(coalesce(c.j_list_name,'')) END ASC,
    CASE WHEN v_sort='sending_identity_label' AND v_dir='desc' THEN lower(coalesce(c.j_identity_label,'')) END DESC,
    CASE WHEN v_sort='sending_identity_label' AND v_dir='asc'  THEN lower(coalesce(c.j_identity_label,'')) END ASC,
    CASE WHEN v_sort='employer_name' AND v_dir='desc' THEN lower(coalesce(c.j_employer_name,'')) END DESC,
    CASE WHEN v_sort='employer_name' AND v_dir='asc'  THEN lower(coalesce(c.j_employer_name,'')) END ASC,
    CASE WHEN v_sort='member_status' AND v_dir='desc' THEN lower(coalesce(c.j_member_status,'')) END DESC,
    CASE WHEN v_sort='member_status' AND v_dir='asc'  THEN lower(coalesce(c.j_member_status,'')) END ASC,
    CASE WHEN v_sort='channel'  AND v_dir='desc' THEN c.u_channel END DESC,
    CASE WHEN v_sort='channel'  AND v_dir='asc'  THEN c.u_channel END ASC,
    CASE WHEN v_sort='step'     AND v_dir='desc' THEN c.x_step END DESC NULLS LAST,
    CASE WHEN v_sort='step'     AND v_dir='asc'  THEN c.x_step END ASC NULLS LAST,
    CASE WHEN v_sort='handled'  AND v_dir='desc' THEN c.j_handled END DESC,
    CASE WHEN v_sort='handled'  AND v_dir='asc'  THEN c.j_handled END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.j_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc'  THEN lower(coalesce(c.j_org_name,'')) END ASC,
    CASE WHEN v_sort='why' AND v_dir='desc' THEN lower(coalesce(c.j_case_label, c.j_backlink_label,'')) END DESC,
    CASE WHEN v_sort='why' AND v_dir='asc'  THEN lower(coalesce(c.j_case_label, c.j_backlink_label,'')) END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;
