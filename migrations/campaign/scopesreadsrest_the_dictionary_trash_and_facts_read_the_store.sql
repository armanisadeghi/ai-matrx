-- chair-step: lane SCOPES-READS-REST (L8 of SCOPES-CUTOVER-PLAN Phase 2.2). Fourteen function bodies replaced over the record store, contract kept (same signatures, arguments and returned shape; grants kept): the dictionary's dict_list_owners_for / dict_owner_org / dict_resolve_for / dict_rollup_for, kg_caller_can_target_scope, get_user_dashboard_metrics, create_tasks_bulk, platform._search_item_filed_tags, custom.table_facts, custom.agent_context_value, platform.resolve_id, and Trash's _trash_kind_rows / _trash_kind_counts / org_trash_restore. Three NEW read helpers (public._dict_context_owners, public._dict_context_owner_org — declared client doors, then granted — and public._trash_context_rows, service_role only). No DDL on any table, no row touched, no relation lock (function bodies and one registry row per door).
-- based-on: public.dict_list_owners_for(uuid) d650c8685d19ae77a8f442db8a31607b3f3fb8f762429f977225b93cd08aaf0e
-- based-on: public.dict_owner_org(text, uuid) a720d9ef0f0f5b4871da426db4079d202cc177e25266ad25915a161122ad2855
-- based-on: public.dict_resolve_for(uuid, boolean, boolean, uuid[], uuid[], uuid[]) 03a474c649248d53faaa5eae8a55d02ba68dc6f2fdfd6e388958a6f278c72522
-- based-on: public.dict_rollup_for(text, uuid) e0af902a44323d2a181320087b27cac9d80213a498eccc46bef7341011fcbe6c
-- based-on: public.kg_caller_can_target_scope(uuid) 0354af6ea9034d09be4107f367f6c34429c5688e9d74b2b5f3a942280d95df1d
-- based-on: public.get_user_dashboard_metrics() a4f44d944467c672d2de31609e9a9e3d0b0eb072635079748f1b7ac3d5dc2d56
-- based-on: public.create_tasks_bulk(jsonb, uuid, uuid, uuid[], text, uuid, jsonb) 123544f9194735f5d91e279b68399ea18135498fd753c1642c3571ba9b83f991
-- based-on: platform._search_item_filed_tags(text, uuid) 141392a1e4fd2b136d3e3ca47357fcb155455786a34ea0eba3250314856ce7d7
-- based-on: custom.table_facts(uuid) 5ceebe4926db95d8f129a23ab47eaa432a48bb640df4de4da9218109d99cb0bf
-- based-on: custom.agent_context_value(jsonb, text, text, uuid, uuid, bigint) bb6f87aea1d84c3d65a02fe8597fb01f47c3b2e462239ed831ae5cab3208c469
-- based-on: platform.resolve_id(uuid, text) 7b16b5fd4d2b130e3aaf0bcb5037b1c1afb1d5d906f10e3240c230cd55584789
-- based-on: public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer) 8034eb4778a9ca31c450be31c0b7077aea501e568fe8c8291600ec901c5edb00
-- based-on: public._trash_kind_counts(uuid, uuid, uuid) 8a72b584d1ba504a615b3f0d5a3c9e46a154b666889bd16ba8260c118ed00019
-- based-on: public.org_trash_restore(uuid, text, uuid) b4c9f1cb3a03b4656328dcea65bc49cf784cb31a97a6482ea25e069448ab16da
-- lane: SCOPES-READS-REST
-- INVERSE: migrations/inverse/scopesreadsrest_the_dictionary_trash_and_facts_read_the_store_down.sql
-- window-class: function bodies + two door rows; no relation lock. Applied directly (owner, 2026-09-24).
--
-- SCOPES-READS-REST (2026-09-29) — THE REST OF THE DATABASE READERS OF context.* READ THE RECORD STORE.
-- A scope type is a store Table whose document says kept_for = context, a scope is a Record of it, a
-- context item is a Field of it; the ids are the same (measured on production 2026-09-29: 106 of 106
-- types, 9,315 of 9,315 scopes, 283 of 283 items have their twin, archived ones included). Since
-- SCOPES-PRESS-EVERYONE every scope write lands in the store first, so each body below reads the store
-- and answers exactly what it answered from context.* (the shadow compare in
-- scripts/campaign-tests/scopesreadsrest_the_reads_read_the_store_shadow_compare.sh: every member x
-- scope pair, planted divergence RED, 0 mismatches GREEN).
--
-- Not rewritten, on purpose:
--   public.kg_simulated_scope_graph — no caller anywhere (no code, no body, no policy; 0 calls in
--     pg_stat_statements): retired, graveyarded with the tables at the contract (plan 2.2 "retire").
--   custom.context_compare_facts — the parity compare's facts ABOUT THE OLDER SIDE (old_readable,
--     old_active, old versions). Pointing it at the store would make the referee compare the store with
--     itself; it goes with the image at the contract (SCOPES-CONTRACT), not before.

-- ── THE STORE'S CONTEXT ROWS, for the readers that are not store doors (lane SCOPES-READS-REST) ──
-- A scope type is a store Table whose document says kept_for = context; a scope is a Record of such
-- a Table; a context item is a Field of it (SCOPES-CONTEXT: type = Table, scope = Record, item =
-- Field; same ids). These two helpers are SECURITY DEFINER because `authenticated` holds no
-- privilege on custom.record (census 7): the dictionary's per-person bodies stay SECURITY INVOKER
-- and ask here. What a caller is answered is what the older tables' row security answered a member:
-- a signed-in person reads the rows of the organizations they belong to (every scope of the store's
-- context Tables is `internal`), a platform admin reads all, and a connection with no signed-in
-- person (the server, service_role) reads all — exactly the rows the old `std_select` /
-- `scope_types_select` policies and the definer wrappers handed. Archived rows are included, as the
-- old bodies included them.
create or replace function public._dict_context_owners(p_org_ids uuid[], p_ids uuid[] default null)
 returns table(level text, owner_id uuid, name text, organization_id uuid, scope_type_id uuid)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid  uuid := (select auth.uid());
  v_orgs uuid[];
begin
  if v_uid is null or coalesce(public.is_platform_admin(), false) then
    v_orgs := coalesce(p_org_ids, '{}'::uuid[]);
  else
    select coalesce(array_agg(o), '{}'::uuid[]) into v_orgs
      from unnest(coalesce(p_org_ids, '{}'::uuid[])) o
     where o in (select iam.my_orgs());
  end if;
  if cardinality(v_orgs) = 0 then return; end if;
  return query
    with t as (
      select k.id, k.organization_id, k.data
        from custom.record k
       where k.organization_id = any (v_orgs)
         and k.data_class = 'table'
         and k.data ->> 'kept_for' = 'context'
    )
    select 'scope_type'::text, t.id, t.data ->> 'label_singular', t.organization_id, null::uuid
      from t
     where p_ids is null or t.id = any (p_ids)
    union all
    select 'scope'::text, r.id, r.data ->> 'name', r.organization_id, r.table_id
      from t
      join custom.record r
        on r.organization_id = t.organization_id and r.table_id = t.id and r.data_class = 'record'
     where p_ids is null or r.id = any (p_ids);
end;
$function$;
revoke all on function public._dict_context_owners(uuid[], uuid[]) from public, anon;
grant execute on function public._dict_context_owners(uuid[], uuid[]) to service_role;
comment on function public._dict_context_owners(uuid[], uuid[]) is
  'SCOPES-READS-REST (2026-09-29): the scope types (context Tables) and scopes (their Records) of the named organizations, from the record store, for the dictionary''s per-person bodies. A signed-in person is answered only about organizations they belong to (the older tables'' row security); the server and platform admins about any. Archived rows included, as the older bodies read them.';

create or replace function public._dict_context_owner_org(p_level text, p_owner_id uuid)
 returns uuid
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if p_level = 'scope_type' then
    select k.organization_id into v_org
      from custom.record k
     where k.id = p_owner_id and k.data_class = 'table' and k.data ->> 'kept_for' = 'context'
     limit 1;
  elsif p_level = 'scope' then
    select r.organization_id into v_org
      from custom.record r
      join custom.record k
        on k.organization_id = r.organization_id and k.id = r.table_id
       and k.data_class = 'table' and k.data ->> 'kept_for' = 'context'
     where r.id = p_owner_id and r.data_class = 'record'
     limit 1;
  else
    return null;
  end if;
  if v_org is null or v_uid is null or coalesce(public.is_platform_admin(), false) then
    return v_org;
  end if;
  if v_org in (select iam.archived_org_ids()) then
    return null;
  end if;
  if v_org in (select iam.my_orgs()) then
    return v_org;
  end if;
  -- a scope also reaches its creator, a globally readable system organization, or a grant (the older
  -- context.scopes row security); a scope type only its organization's members
  if p_level = 'scope'
     and (exists (select 1 from custom.record r where r.id = p_owner_id and r.created_by = v_uid)
          or v_org in (select so.organization_id from iam.system_orgs so where so.global_readable)
          or coalesce(iam.has_access('scope', p_owner_id, 'viewer'::public.permission_level), false)) then
    return v_org;
  end if;
  return null;
end;
$function$;
revoke all on function public._dict_context_owner_org(text, uuid) from public, anon;
grant execute on function public._dict_context_owner_org(text, uuid) to service_role;
comment on function public._dict_context_owner_org(text, uuid) is
  'SCOPES-READS-REST (2026-09-29): the organization of one scope type (context Table) or scope (its Record), from the record store, for public.dict_owner_org. Null when there is none or the older tables'' row security would not have shown it to the signed-in person.';

CREATE OR REPLACE FUNCTION public.dict_list_owners_for(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_result jsonb; v_is_admin boolean;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;
    PERFORM iam.asks_about_caller(p_user_id, 'public.dict_list_owners_for');

    SELECT EXISTS (SELECT 1 FROM admin.admins a WHERE a.user_id = p_user_id) INTO v_is_admin;

    -- SCOPES-READS-REST (2026-09-29): scope types and scopes are read from the record store
    -- (public._dict_context_owners: context Tables and their Records), never from context.*.
    WITH member_orgs AS (
        SELECT om.organization_id AS org_id
        FROM iam.organization_member om
        WHERE om.user_id = p_user_id
    ),
    personal AS (
        SELECT jsonb_build_object(
            'level', 'user',
            'owner_id', p_user_id,
            'name', 'Personal',
            'entry_count', (SELECT count(*) FROM dictionary.dict_entries e WHERE e.user_id = p_user_id AND e.deleted_at IS NULL),  -- 1355
            'max_inline_chars', (SELECT s.max_inline_chars FROM dictionary.dict_settings s WHERE s.user_id = p_user_id)
        ) AS obj
    ),
    orgs AS (
        SELECT jsonb_build_object(
            'level', 'organization',
            'owner_id', o.id,
            'name', o.name,
            'entry_count', (SELECT count(*) FROM dictionary.dict_entries e WHERE e.organization_id = o.id AND e.deleted_at IS NULL),  -- 1355
            'max_inline_chars', (SELECT s.max_inline_chars FROM dictionary.dict_settings s WHERE s.organization_id = o.id)
        ) AS obj
        FROM iam.organizations o
        WHERE o.id IN (SELECT org_id FROM member_orgs)
    ),
    ctx AS (
        SELECT c.* FROM public._dict_context_owners(
            (SELECT coalesce(array_agg(org_id), '{}'::uuid[]) FROM member_orgs)) c
    ),
    scope_types AS (
        SELECT jsonb_build_object(
            'level', 'scope_type',
            'owner_id', st.id,
            'name', st.label_singular,
            'organization_id', st.organization_id,
            'entry_count', (SELECT count(*) FROM dictionary.dict_entries e WHERE e.scope_type_id = st.id AND e.deleted_at IS NULL),  -- 1355
            'max_inline_chars', (SELECT s.max_inline_chars FROM dictionary.dict_settings s WHERE s.scope_type_id = st.id)
        ) AS obj
        FROM (SELECT c.owner_id AS id, c.name AS label_singular, c.organization_id
                FROM ctx c WHERE c.level = 'scope_type') st
    ),
    scopes AS (
        SELECT jsonb_build_object(
            'level', 'scope',
            'owner_id', sc.id,
            'name', sc.name,
            'organization_id', sc.organization_id,
            'scope_type_id', sc.scope_type_id,
            'entry_count', (SELECT count(*) FROM dictionary.dict_entries e WHERE e.scope_id = sc.id AND e.deleted_at IS NULL),  -- 1355
            'max_inline_chars', (SELECT s.max_inline_chars FROM dictionary.dict_settings s WHERE s.scope_id = sc.id)
        ) AS obj
        FROM (SELECT c.owner_id AS id, c.name, c.organization_id, c.scope_type_id
                FROM ctx c WHERE c.level = 'scope') sc
    )
    SELECT jsonb_build_object(
        'global', CASE WHEN v_is_admin THEN jsonb_build_object(
            'level', 'global',
            'owner_id', NULL,
            'name', 'Global (app-wide)',
            'entry_count', (SELECT count(*) FROM dictionary.dict_entries e WHERE e.user_id IS NULL AND e.organization_id IS NULL AND e.scope_type_id IS NULL AND e.scope_id IS NULL AND e.deleted_at IS NULL)  -- 1355
        ) ELSE NULL END,
        'personal',    (SELECT obj FROM personal),
        'organizations', coalesce((SELECT jsonb_agg(obj ORDER BY obj->>'name') FROM orgs), '[]'::jsonb),
        -- two scopes of one name (a Tag in two organizations) come in a fixed order: by id after name
        'scope_types',   coalesce((SELECT jsonb_agg(obj ORDER BY obj->>'name', obj->>'owner_id') FROM scope_types), '[]'::jsonb),
        'scopes',        coalesce((SELECT jsonb_agg(obj ORDER BY obj->>'name', obj->>'owner_id') FROM scopes), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dict_owner_org(p_level text, p_owner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_org uuid;
BEGIN
    IF p_level = 'user' THEN
        RETURN NULL;
    ELSIF p_level = 'organization' THEN
        SELECT id INTO v_org FROM iam.organizations WHERE id = p_owner_id;
    ELSIF p_level IN ('scope_type', 'scope') THEN
        -- SCOPES-READS-REST (2026-09-29): a scope type is a context Table, a scope its Record.
        v_org := public._dict_context_owner_org(p_level, p_owner_id);
    ELSE
        RAISE EXCEPTION 'dict: unknown level "%"', p_level USING ERRCODE = '22023';
    END IF;

    IF p_level <> 'user' AND v_org IS NULL THEN
        perform platform.refuse_not_found(format('dict: %s "%s" is not available to this account — it may not exist, or your access may not reach it', p_level, p_owner_id));
    END IF;
    RETURN v_org;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dict_resolve_for(p_user_id uuid, p_include_user boolean DEFAULT true, p_all boolean DEFAULT false, p_organization_ids uuid[] DEFAULT '{}'::uuid[], p_scope_type_ids uuid[] DEFAULT '{}'::uuid[], p_scope_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_entries jsonb;
    v_inline integer;
    v_sources integer;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;
    PERFORM iam.asks_about_caller(p_user_id, 'public.dict_resolve_for');

    -- SCOPES-READS-REST (2026-09-29): scope types and scopes are read from the record store
    -- (public._dict_context_owners: context Tables and their Records), never from context.*.
    WITH member_orgs AS (
        SELECT om.organization_id AS org_id
        FROM iam.organization_member om
        WHERE om.user_id = p_user_id
    ),
    ctx AS (
        SELECT c.* FROM public._dict_context_owners(
            (SELECT coalesce(array_agg(org_id), '{}'::uuid[]) FROM member_orgs),
            CASE WHEN p_all THEN NULL ELSE coalesce(p_scope_type_ids, '{}'::uuid[]) || coalesce(p_scope_ids, '{}'::uuid[]) END) c
    ),
    sel AS (
        SELECT 'global'::text AS level, NULL::uuid AS owner_id, 0 AS rank, 'Global'::text AS name
        UNION ALL
        SELECT 'user'::text, p_user_id, 1, 'Personal'::text
        WHERE p_include_user OR p_all
        UNION ALL
        SELECT 'organization', o.id, 2, o.name
        FROM iam.organizations o
        WHERE o.id IN (SELECT org_id FROM member_orgs)
          AND (p_all OR o.id = ANY(p_organization_ids))
        UNION ALL
        SELECT 'scope_type', st.owner_id, 3, st.name
        FROM ctx st
        WHERE st.level = 'scope_type'
          AND (p_all OR st.owner_id = ANY(p_scope_type_ids))
        UNION ALL
        SELECT 'scope', sc.owner_id, 4, sc.name
        FROM ctx sc
        WHERE sc.level = 'scope'
          AND (p_all OR sc.owner_id = ANY(p_scope_ids))
    ),
    raw AS (
        SELECT e.*, sel.rank, sel.level AS source_level, sel.name AS source_name
        FROM dictionary.dict_entries e
        JOIN sel ON (
            (sel.level = 'global'       AND e.user_id IS NULL AND e.organization_id IS NULL AND e.scope_type_id IS NULL AND e.scope_id IS NULL)
         OR (sel.level = 'user'         AND e.user_id = sel.owner_id)
         OR (sel.level = 'organization' AND e.organization_id = sel.owner_id)
         OR (sel.level = 'scope_type'   AND e.scope_type_id = sel.owner_id)
         OR (sel.level = 'scope'        AND e.scope_id = sel.owner_id)
        )
        WHERE e.is_active
          AND e.deleted_at IS NULL  -- 1355
    ),
    ranked AS (
        SELECT DISTINCT ON (lower(term)) *
        FROM raw
        ORDER BY lower(term), rank DESC, updated_at DESC
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'term', r.term,
            'sounds_like', to_jsonb(r.sounds_like),
            'pronunciation', r.pronunciation,
            'ipa', r.ipa,
            'definition', r.definition,
            'category', r.category,
            'source_level', r.source_level,
            'source_name', r.source_name
        ) ORDER BY lower(r.term)
    ) INTO v_entries
    FROM ranked r;

    SELECT s.max_inline_chars INTO v_inline
    FROM dictionary.dict_settings s
    JOIN (
        SELECT 'user'::text AS level, p_user_id AS owner_id, 1 AS rank WHERE p_include_user OR p_all
        UNION ALL SELECT 'organization', o.id, 2 FROM iam.organizations o
            WHERE o.id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_user_id)
              AND (p_all OR o.id = ANY(p_organization_ids))
        UNION ALL SELECT c.level, c.owner_id, CASE c.level WHEN 'scope_type' THEN 3 ELSE 4 END FROM public._dict_context_owners(
                (SELECT coalesce(array_agg(om.organization_id), '{}'::uuid[]) FROM iam.organization_member om WHERE om.user_id = p_user_id),
                CASE WHEN p_all THEN NULL ELSE coalesce(p_scope_type_ids, '{}'::uuid[]) || coalesce(p_scope_ids, '{}'::uuid[]) END) c
            WHERE p_all OR (c.level = 'scope_type' AND c.owner_id = ANY(p_scope_type_ids))
                        OR (c.level = 'scope' AND c.owner_id = ANY(p_scope_ids))
    ) owners ON (
        (owners.level = 'user'         AND s.user_id = owners.owner_id)
     OR (owners.level = 'organization' AND s.organization_id = owners.owner_id)
     OR (owners.level = 'scope_type'   AND s.scope_type_id = owners.owner_id)
     OR (owners.level = 'scope'        AND s.scope_id = owners.owner_id)
    )
    WHERE s.max_inline_chars IS NOT NULL
    ORDER BY owners.rank DESC
    LIMIT 1;

    SELECT count(DISTINCT (source_level, source_name)) INTO v_sources
    FROM (
        SELECT e.*, sel.level AS source_level, sel.name AS source_name
        FROM dictionary.dict_entries e
        JOIN (
            SELECT 'global'::text AS level, NULL::uuid AS owner_id, 'Global'::text AS name
            UNION ALL SELECT 'user'::text, p_user_id, 'Personal'::text WHERE p_include_user OR p_all
            UNION ALL SELECT 'organization', o.id, o.name FROM iam.organizations o
                WHERE o.id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_user_id)
                  AND (p_all OR o.id = ANY(p_organization_ids))
            UNION ALL SELECT c.level, c.owner_id, c.name FROM public._dict_context_owners(
                (SELECT coalesce(array_agg(om.organization_id), '{}'::uuid[]) FROM iam.organization_member om WHERE om.user_id = p_user_id),
                CASE WHEN p_all THEN NULL ELSE coalesce(p_scope_type_ids, '{}'::uuid[]) || coalesce(p_scope_ids, '{}'::uuid[]) END) c
                WHERE p_all OR (c.level = 'scope_type' AND c.owner_id = ANY(p_scope_type_ids))
                            OR (c.level = 'scope' AND c.owner_id = ANY(p_scope_ids))
        ) sel ON (
            (sel.level = 'global'       AND e.user_id IS NULL AND e.organization_id IS NULL AND e.scope_type_id IS NULL AND e.scope_id IS NULL)
         OR (sel.level = 'user'         AND e.user_id = sel.owner_id)
         OR (sel.level = 'organization' AND e.organization_id = sel.owner_id)
         OR (sel.level = 'scope_type'   AND e.scope_type_id = sel.owner_id)
         OR (sel.level = 'scope'        AND e.scope_id = sel.owner_id)
        )
        WHERE e.is_active
          AND e.deleted_at IS NULL  -- 1355
    ) src;

    RETURN jsonb_build_object(
        'entries', coalesce(v_entries, '[]'::jsonb),
        'effective_max_inline_chars', v_inline,
        'source_count', coalesce(v_sources, 0)
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dict_rollup_for(p_level text, p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_entries jsonb;
BEGIN
    -- SCOPES-READS-REST (2026-09-29): scope types and scopes are read from the record store
    -- (public._dict_context_owners: context Tables and their Records), never from context.*.
    WITH ctx AS (
        SELECT c.* FROM public._dict_context_owners(
            CASE p_level
              WHEN 'organization' THEN ARRAY[p_owner_id]
              WHEN 'user' THEN (SELECT coalesce(array_agg(om.organization_id), '{}'::uuid[])
                                  FROM iam.organization_member om WHERE om.user_id = p_owner_id)
              ELSE '{}'::uuid[] END) c
    ),
    raw AS (
        -- GLOBAL
        SELECT e.*, 0 AS rank, 'global'::text AS source_level
        FROM dictionary.dict_entries e
        WHERE p_level = 'global'
          AND e.user_id IS NULL AND e.organization_id IS NULL
          AND e.scope_type_id IS NULL AND e.scope_id IS NULL

        UNION ALL
        -- ORGANIZATION rollup: org(1) + scope_type(2) + scope(3)
        SELECT e.*, 1, 'organization' FROM dictionary.dict_entries e
            WHERE p_level = 'organization' AND e.organization_id = p_owner_id
        UNION ALL
        SELECT e.*, 2, 'scope_type' FROM dictionary.dict_entries e
            JOIN ctx st ON st.level = 'scope_type' AND st.owner_id = e.scope_type_id
            WHERE p_level = 'organization' AND st.organization_id = p_owner_id
        UNION ALL
        SELECT e.*, 3, 'scope' FROM dictionary.dict_entries e
            JOIN ctx sc ON sc.level = 'scope' AND sc.owner_id = e.scope_id
            WHERE p_level = 'organization' AND sc.organization_id = p_owner_id

        UNION ALL
        -- USER rollup: org content(1/2/3) of every membership org + personal(4)
        SELECT e.*, 1, 'organization' FROM dictionary.dict_entries e
            WHERE p_level = 'user' AND e.organization_id IN (
                SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_owner_id)
        UNION ALL
        SELECT e.*, 2, 'scope_type' FROM dictionary.dict_entries e
            JOIN ctx st ON st.level = 'scope_type' AND st.owner_id = e.scope_type_id
            WHERE p_level = 'user' AND st.organization_id IN (
                SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_owner_id)
        UNION ALL
        SELECT e.*, 3, 'scope' FROM dictionary.dict_entries e
            JOIN ctx sc ON sc.level = 'scope' AND sc.owner_id = e.scope_id
            WHERE p_level = 'user' AND sc.organization_id IN (
                SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = p_owner_id)
        UNION ALL
        SELECT e.*, 4, 'user' FROM dictionary.dict_entries e
            WHERE p_level = 'user' AND e.user_id = p_owner_id
    ),
    active AS (SELECT * FROM raw WHERE is_active AND deleted_at IS NULL),  -- 1355
    ranked AS (
        SELECT DISTINCT ON (lower(term)) *
        FROM active
        ORDER BY lower(term), rank DESC, updated_at DESC
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id, 'term', r.term, 'sounds_like', to_jsonb(r.sounds_like),
            'pronunciation', r.pronunciation, 'ipa', r.ipa,
            'definition', r.definition, 'category', r.category,
            'source_level', r.source_level
        ) ORDER BY lower(r.term)
    ) INTO v_entries
    FROM ranked r;

    RETURN jsonb_build_object('entries', coalesce(v_entries, '[]'::jsonb));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.kg_caller_can_target_scope(p_scope_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_scope_id IS NULL OR EXISTS (
    -- SCOPES-READS-REST (2026-09-29): a scope is a Record of a context Table in the record store.
    SELECT 1 FROM custom.record s
      JOIN custom.record k on k.organization_id = s.organization_id and k.id = s.table_id and k.data_class = 'table' and k.data ->> 'kept_for' = 'context'
     WHERE s.id = p_scope_id AND s.data_class = 'record'
       AND (s.created_by = (select auth.uid())
            OR EXISTS (SELECT 1 FROM iam.organization_member om
                        WHERE om.organization_id = s.organization_id
                          AND om.user_id = (select auth.uid())))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('agents',0,'conversations',0,'knowledge_files',0,'published_apps',0,
      'notes',0,'tasks',0,'transcripts',0,'scopes',0,'shortcuts',0,'research_reports',0,'podcasts',0,'messages',0);
  end if;
  return jsonb_build_object(
    'agents',           (select count(*) from agent.definition      where created_by = uid and coalesce(is_archived, false) = false),
    'conversations',    (select count(*) from chat.conversation      where created_by = uid and deleted_at is null),
    'knowledge_files',  (select count(*) from files.files            where created_by = uid and deleted_at is null),
    'published_apps',   (select count(*) from app.definition         where created_by = uid and status = 'published'),
    'notes',            (select count(*) from workbench.notes        where created_by = uid and deleted_at is null),
    'tasks',            (select count(*) from workspace.tasks        where created_by = uid),
    'transcripts',      (select count(*) from transcripts.transcripts where created_by = uid and deleted_at is null),
    -- SCOPES-READS-REST (2026-09-29): my scopes are my Records of context Tables in the record store.
    'scopes',           (select count(*) from custom.record s
                           join custom.record k on k.organization_id = s.organization_id and k.id = s.table_id and k.data_class = 'table' and k.data ->> 'kept_for' = 'context'
                          where s.created_by = uid and s.data_class = 'record'),
    'shortcuts',        (select count(*) from agent.shortcut         where created_by = uid and coalesce(is_active, false) = true),
    'research_reports', (select count(*) from research.rs_topic      where created_by = uid),
    'podcasts',         (select count(*) from podcast.pc_episodes    where created_by = uid),
    'messages',         (select count(*) from communication.dm_messages where sender_id = uid and deleted_at is null)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_tasks_bulk(p_items jsonb, p_project_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_scope_ids uuid[] DEFAULT '{}'::uuid[], p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_task workspace.tasks;
  v_tasks jsonb := '[]'::jsonb;
  v_scope_id uuid;
  v_priority task_priority;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'at most 100 tasks may be created at once' using errcode = '22023';
  end if;
  if p_organization_id is not null
     and coalesce(iam.has_org_access(p_organization_id), false) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('organization_id', p_organization_id)::text;
  end if;
  if p_project_id is not null
     and coalesce(iam.has_access('project', p_project_id, 'editor'), false) is not true then
    raise exception 'not authorized for this project' using errcode = '42501',
            detail = jsonb_build_object('project_id', p_project_id)::text;
  end if;
  if p_entity_type is not null and p_entity_id is not null
     and coalesce(iam.has_access(p_entity_type, p_entity_id, 'editor'), false) is not true then
    raise exception 'not authorized for %', p_entity_type using errcode = '42501',
            detail = jsonb_build_object('entity_id', p_entity_id)::text;
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_scope_ids, '{}'::uuid[])) requested(scope_id)
    -- SCOPES-READS-REST (2026-09-29): a live scope is a live Record of a context Table in the record store.
    left join (custom.record s
               join custom.record k on k.organization_id = s.organization_id and k.id = s.table_id and k.data_class = 'table' and k.data ->> 'kept_for' = 'context')
      on s.id = requested.scope_id and s.data_class = 'record' and s.deleted_at is null
    where s.id is null or coalesce(iam.has_org_access(s.organization_id), false) is not true
  ) then
    raise exception 'one or more requested scopes are not accessible' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_priority := case
      when v_item->>'priority' in ('low','medium','high') then (v_item->>'priority')::task_priority
      else null
    end;
    insert into workspace.tasks (
      title, description, project_id, organization_id, priority, due_date, status, created_by
    ) values (
      coalesce(nullif(trim(v_item->>'title'), ''), 'Untitled task'),
      v_item->>'description', p_project_id, p_organization_id, v_priority,
      case when v_item->>'due_date' is not null then (v_item->>'due_date')::date else null end,
      coalesce(v_item->>'status', 'incomplete'), v_uid
    ) returning * into v_task;

    if p_entity_type is not null and p_entity_id is not null then
      perform public.assoc_add(
        p_entity_type, p_entity_id, 'task', v_task.id, v_task.organization_id,
        v_item->>'title',
        coalesce(p_metadata, '{}'::jsonb)
          || jsonb_build_object('item_index', coalesce((v_item->>'index')::int, 0))
      );
    end if;
    foreach v_scope_id in array coalesce(p_scope_ids, '{}'::uuid[]) loop
      perform public.assoc_add('task', v_task.id, 'scope', v_scope_id, p_organization_id);
    end loop;
    v_tasks := v_tasks || jsonb_build_array(to_jsonb(v_task));
  end loop;
  return jsonb_build_object('tasks', v_tasks);
end;
$function$
;

CREATE OR REPLACE FUNCTION platform._search_item_filed_tags(p_token text, p_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- SCOPES-READS-REST (2026-09-29): the Tags an item is filed under, from the record store — a Tag is a
  -- live Record of the context Table whose slug is `tag`, and filing is the store's edge to it
  -- (`<kind> -> record`, written beside every `<kind> -> scope` edge since the copy).
  select coalesce(array_agg(distinct s.name order by s.name), '{}'::text[])
    from platform.associations a
    join lateral (select r.data ->> 'name' as name
                    from custom.record r
                    join custom.record st
                      on st.organization_id = r.organization_id and st.id = r.table_id
                     and st.data_class = 'table' and st.data ->> 'kept_for' = 'context'
                     and st.data ->> 'slug' = 'tag'
                   where r.id = a.target_id and r.data_class = 'record' and r.deleted_at is null) s on true
   where a.source_type = p_token and a.source_id = p_id and a.target_type in ('record', 'custom_record')
     and a.deleted_at is null
$function$
;

CREATE OR REPLACE FUNCTION custom.table_facts(p_organization_id uuid)
 RETURNS TABLE(table_id uuid, visibility text, mine boolean, kept_by_the_app boolean, kept_for text, offered_as_context boolean, keeper_group text, keeper_says text, used_in_kind text, used_in_id uuid, used_in_table_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_facts');
  return query
    with t as (
      select r.id, r.visibility, r.created_by, r.data,
             custom.table_placement(r.organization_id, r.id, r.data, r.data_class = 'kernel') as p
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.table_kernel_id()
         and r.deleted_at is null
         and r.id in (select v from custom.query_visible_ids(p_organization_id,
                                                             custom.table_kernel_id()) v)
    ),
    -- WHICH COLUMN USES EACH CHOICES TABLE: the list Field whose config names it. The first
    -- one made, when several share it.
    uses as (
      select distinct on (nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid)
             nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid as options_table_id,
             coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') as column_label,
             nullif(f.data ->> 'entity_definition_id', '')::uuid as of_table
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
       order by nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid, f.created_at
    )
    select t.id,
           t.visibility::text,
           (v_me is not null and t.created_by = v_me),
           (t.p ->> 'kept_by_the_app')::boolean,
           t.p ->> 'kept_for',
           (t.p ->> 'offered_as_context')::boolean,
           s.keeper_group,
           s.keeper_says,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null else coalesce(s.used_in_kind, 'table') end,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null else coalesce(s.used_in_id, t.id) end,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null
                else coalesce(s.used_in_table_id, case when coalesce(s.used_in_kind, 'table') = 'table' then coalesce(s.used_in_id, t.id) end) end
      from t
      left join lateral (
        select t.p ->> 'kept_for' as word,
               case t.p ->> 'kept_for'
                 when 'context'  then nullif(t.data -> 'scope_binding' ->> 'scope_id', '')
                 when 'workflow' then nullif(t.data ->> 'parent_id', '')
                 when 'app'      then substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
               end as ref
      ) kw on true
      left join uses u on u.options_table_id = t.id
      left join t ut on ut.id = u.of_table                     -- only a table the caller can open is named
      left join t wt on kw.word = 'workflow' and wt.id::text = kw.ref
      -- SCOPES-READS-REST (2026-09-29): the scope a context Table belongs to is a live Record of the store.
      left join lateral (select r.id, r.data ->> 'name' as name
                           from custom.record r
                          where kw.word = 'context' and r.organization_id = p_organization_id
                            and r.id::text = kw.ref and r.data_class = 'record' and r.deleted_at is null) sc on true
      left join lateral (
        select
          case
            when not (t.p ->> 'kept_by_the_app')::boolean then null
            when kw.word = 'choices' then 'The choices behind your columns'
            when kw.word = 'context' then 'The context system'
            when kw.word = 'checklists' then 'Checklists'
            when kw.word = 'bookings' then 'Bookings'
            when kw.word = 'workflow' then 'Workflows'
            when kw.word = 'store' then 'The store itself'
            when kw.word = 'app' then 'The app'
            else initcap(replace(kw.word, '_', ' '))
          end as keeper_group,
          case
            when not (t.p ->> 'kept_by_the_app')::boolean then null
            when kw.word = 'choices' and u.options_table_id is not null and ut.id is not null
              then format('Kept by the %s column of %s: it holds that column''s choices and opens from there.',
                          u.column_label, coalesce(nullif(ut.data ->> 'name', ''), 'a table'))
            when kw.word = 'choices' and u.options_table_id is not null
              then format('Kept by the %s column of a table you cannot open: it holds that column''s choices.', u.column_label)
            when kw.word = 'choices'
              then 'Kept for a column''s choices. No column uses it now, so only its own page opens it.'
            when kw.word = 'context' and sc.id is not null
              then format('Kept by the context system: it belongs to %s and opens from there.', sc.name)
            when kw.word = 'context' and coalesce((t.p ->> 'offered_as_context')::boolean, false)
              then format('Kept by the context system: each %s in it is a context you can pick for an agent, and opens on its own page.',
                          lower(coalesce(nullif(t.data ->> 'label_singular', ''), 'record')))
            when kw.word = 'context'
              then 'Kept by the context system.'
            when kw.word = 'checklists'
              then 'Kept by checklists: the steps of every checklist run in this organization.'
            when kw.word = 'bookings'
              then format('Kept by bookings: the times people are holding on %s.',
                          coalesce(nullif(regexp_replace(coalesce(t.data ->> 'name', ''), '^Slots for ', ''), ''), 'a booking page'))
            when kw.word = 'workflow' and wt.id is not null
              then format('Kept by the workflow of %s: the states its records move through.', coalesce(nullif(wt.data ->> 'name', ''), 'a table'))
            when kw.word = 'workflow'
              then 'Kept by a table''s workflow: the states its records move through.'
            when kw.word = 'store'
              then 'Part of the store itself: every table is built on it.'
            when kw.word = 'app' and kw.ref is not null
              then 'Kept by the app: ' || case kw.ref
                     when 'view' then 'the saved views of the tables here.'
                     when 'comment' then 'the comments people leave on records.'
                     when 'form' then 'the forms made on the tables here.'
                     when 'dashboard' then 'the dashboards made on the tables here.'
                     when 'action' then 'the action inbox.'
                     when 'checklist' then 'the checklist runs.'
                     when 'slots' then 'the times people are holding on a booking page.'
                     when 'demo' then 'a demonstration of the app''s screens.'
                     when 'shapeproof' then 'a demonstration of the app''s screens.'
                     else 'its own bookkeeping.' end
            when kw.word = 'app' then 'Kept by the app.'
            else format('Kept by %s.', replace(kw.word, '_', ' '))
          end as keeper_says,
          case
            when kw.word = 'context' and sc.id is not null then 'scope'
            when kw.word = 'choices' and ut.id is not null then 'table'
            when kw.word = 'workflow' and wt.id is not null then 'table'
          end as used_in_kind,
          case
            when kw.word = 'context' and sc.id is not null then sc.id
            when kw.word = 'choices' and ut.id is not null then ut.id
            when kw.word = 'workflow' and wt.id is not null then wt.id
          end as used_in_id,
          case
            when kw.word = 'choices' and ut.id is not null then ut.id
            when kw.word = 'workflow' and wt.id is not null then wt.id
          end as used_in_table_id
      ) s on true;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.agent_context_value(p_doc jsonb, p_key text, p_type text, p_organization_id uuid, p_record_id uuid, p_cap bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_val    jsonb := p_doc -> p_key;
  v_ptr    jsonb;
  v_text   text;
  v_bytes  bigint;
  v_size   text;
  v_capped boolean;
  v_files  jsonb;
  v_n      integer;
  v_list   jsonb;
  v_len    integer;
  v_kinds  integer;
  v_kind   text;
  v_items  jsonb;
begin
  -- 1. A VALUE KEPT AS A FILE. The cell holds its first words; the whole text is the file. The
  --    door cannot read a file's bytes, so it hands the words with the file NAMED — an honest
  --    value on its own — and `whole_value.expand` tells the store's client to hand the whole
  --    text instead (matrx_records RecordStore.resolve_context). Under the cap it stays the words
  --    and the file to open, announced.
  if jsonb_typeof(v_val) = 'string' then
    v_ptr := custom.whole_value_pointer_of(p_doc -> '_values', p_doc -> '_sources', p_key);
  end if;
  if v_ptr is not null then
    v_bytes := coalesce((v_ptr ->> 'bytes')::bigint, 0);
    v_size := case when v_bytes >= 1048576 then to_char(round(v_bytes / 1048576.0, 1), 'FM999990.0') || ' MB'
                   else greatest(round(v_bytes / 1024.0), 1)::text || ' KB' end;
    v_capped := p_cap > 0 and v_bytes > p_cap;
    v_text := v_val #>> '{}';
    if v_capped then
      v_text := custom.text_head_bytes(v_text, p_cap);
    end if;
    return jsonb_build_object(
      'value', to_jsonb(v_text || E'…\n\n' || case
        when v_capped then format(
          '[This value is %s, over this organization''s limit of %s bytes for one value handed to an agent, so only its start is here. The whole text is file %s; open it with the files tool to read all of it.]',
          v_size, p_cap, v_ptr ->> 'file_id')
        else format(
          '[This is the start of a %s text. The whole text is file %s; open it with the files tool to read all of it.]',
          v_size, v_ptr ->> 'file_id') end),
      'whole_value', v_ptr || jsonb_build_object(
        'expand', not v_capped, 'cap_bytes', nullif(p_cap, 0),
        'record_id', p_record_id, 'key', p_key));
  end if;

  -- 2. A TEXT IN THE CELL, over the organization's cap: its start and where the rest is, announced.
  if p_cap > 0 and jsonb_typeof(v_val) = 'string' and octet_length(v_val #>> '{}') > p_cap then
    v_bytes := octet_length(v_val #>> '{}');
    return jsonb_build_object(
      'value', to_jsonb(custom.text_head_bytes(v_val #>> '{}', p_cap) || E'…\n\n' || format(
        '[This value is %s bytes, over this organization''s limit of %s bytes for one value handed to an agent, so only its start is here. The whole value is the "%s" field of record %s.]',
        v_bytes, p_cap, p_key, p_record_id)),
      'whole_value', jsonb_build_object(
        'kind', 'capped_in_record', 'record_id', p_record_id, 'key', p_key,
        'bytes', v_bytes, 'cap_bytes', p_cap, 'expand', false));
  end if;

  -- 3. A RELATION TO FILES is the file reference the current context system hands for the same
  --    value (```matrx {kind: reference, type: file, items: [{file_id}]}```), so the agent opens
  --    the file with the files tool instead of being handed a File record id it cannot open.
  if p_type in ('relation', 'entity_reference') and jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) > 0 then
    select jsonb_agg(jsonb_build_object('file_id', fr.data ->> 'file_id') order by x.ord), count(*)
      into v_files, v_n
      from jsonb_array_elements(v_val) with ordinality x(e, ord)
      join custom.record fr
        on jsonb_typeof(x.e) = 'string'
       and (x.e #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and fr.organization_id = p_organization_id
       and fr.id = (x.e #>> '{}')::uuid
       and fr.table_id = custom.file_kernel_id()
       and fr.deleted_at is null
       and coalesce(fr.data ->> 'file_id', '') <> '';
    if v_n = jsonb_array_length(v_val) then
      return jsonb_build_object('value', to_jsonb(E'```matrx\n' || jsonb_pretty(jsonb_build_object(
        'kind', 'reference', 'type', 'file', 'items', v_files, 'matrx_version', 1)) || E'\n```'));
    end if;
  end if;

  -- 4. A REFERENCE THE COPY MADE A RELATION (lane CONTEXT-PARITY). The current context system
  --    holds a reference as its ```matrx reference fence and hands the agent that fence; the copy
  --    rightly lands it as a relation (the Field's target), so the store must hand the SAME fence
  --    back, or the agent sees a bare id with no kind (Castellano & Reyes Matters `client` /
  --    `practice_area`, Titanium Team Members `department` / `reports_to`).
  --    a. An ENTITY REFERENCE ([{id, token, label}], one token): the fence of that kind, with the
  --       label the read door already resolved for this person (never a name they may not read).
  --    b. A RELATION TO SCOPES (each id a Record of a context Table — SCOPES-READS-REST 2026-09-29:
  --       the Table's own `kept_for`, not the copy's provenance mark, so a scope born in the store
  --       after the old tables stop is the same scope):
  --       the scope fence, ids only — exactly the shape the current system's backfill wrote.
  --    Anything else (a native store relation) stays the store's own value.
  if p_type in ('relation', 'entity_reference') and jsonb_typeof(v_val) in ('string', 'array', 'object') then
    v_list := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_len := jsonb_array_length(v_list);
    if v_len > 0 then
      select count(*), count(distinct x.e ->> 'token'), min(x.e ->> 'token'),
             jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', x.e ->> 'id', 'label', x.e ->> 'label'))
                       order by x.ord)
        into v_n, v_kinds, v_kind, v_items
        from jsonb_array_elements(v_list) with ordinality x(e, ord)
       where jsonb_typeof(x.e) = 'object'
         and coalesce(x.e ->> 'id', '') <> ''
         and coalesce(x.e ->> 'token', '') <> '';
      if v_n = v_len and v_kinds = 1 then
        return jsonb_build_object('value', to_jsonb(E'```matrx\n' || jsonb_pretty(jsonb_build_object(
          'kind', 'reference', 'type', v_kind, 'items', v_items, 'matrx_version', 1)) || E'\n```'));
      end if;
      select count(*), jsonb_agg(jsonb_build_object('id', r.id::text) order by x.ord)
        into v_n, v_items
        from jsonb_array_elements(v_list) with ordinality x(e, ord)
        join custom.record r
          on jsonb_typeof(x.e) = 'string'
         and (x.e #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and r.id = (x.e #>> '{}')::uuid
         and r.data_class = 'record'
         and exists (select 1 from custom.record k
                      where k.organization_id = r.organization_id and k.id = r.table_id
                        and k.data_class = 'table' and k.data ->> 'kept_for' = 'context');
      if v_n = v_len then
        return jsonb_build_object('value', to_jsonb(E'```matrx\n' || jsonb_pretty(jsonb_build_object(
          'kind', 'reference', 'type', 'scope', 'items', v_items, 'matrx_version', 1)) || E'\n```'));
      end if;
    end if;
  end if;

  -- 5. ONE FENCE IN A LIST FIELD (lane CONTEXT-PARITY). The current system let an `array` item
  --    hold one string, a ```matrx picklist fence; the copy lands it as a list of one, word for
  --    word (a list Field holds a list). A fence is itself the list of its items, so the agent is
  --    handed the fence exactly as the current system hands it (AI Matrx Features `included_apps`).
  if p_type not in ('relation', 'entity_reference') and jsonb_typeof(v_val) = 'array'
     and jsonb_array_length(v_val) = 1 and jsonb_typeof(v_val -> 0) = 'string'
     and (v_val ->> 0) ~ '^\s*```matrx\s' then
    return jsonb_build_object('value', v_val -> 0);
  end if;

  return jsonb_build_object('value', v_val);
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.resolve_id(p_id uuid, p_side text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_side      text := lower(nullif(btrim(coalesce(p_side, '')), ''));
  v_store     jsonb;
  v_has_new   boolean;
  v_has_old   boolean;
  v_old_org   uuid;
  v_old_live  boolean;
  v_pick      text;
  v_kind      text;
  v_org       uuid;
  v_path      text;
  v_live      boolean := true;
  v_type      uuid;
  v_sides     jsonb;
  c_not_yours constant text :=
    'This link does not open anything for the account you are signed in with. It may belong to '
    'somebody else, or it may have been mistyped. Check which account you are signed in as, or '
    'ask whoever sent it to share it with you.';
begin
  if p_id is null then
    raise exception 'platform.resolve_id: which id?' using errcode = '22004';
  end if;
  if v_side is not null and v_side not in ('new', 'old') then
    raise exception 'A table has an older side and a new side, and "%" is neither.', p_side
      using errcode = '22023',
            hint = 'Ask for side=new or side=old, or leave it out to open the one the id lives on.';
  end if;
  if (select auth.uid()) is null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);
  end if;

  -- The record store answers for its own objects, walled by its own doors.
  v_store := custom.where_id_opens(p_id);

  -- The older store answers through its own row security: this function is SECURITY INVOKER,
  -- so the SELECT below sees exactly the datasets /data/<id> itself would read.
  select d.organization_id, d.deleted_at is null
    into v_old_org, v_old_live
    from workbench.udt_datasets d
   where d.id = p_id;
  v_has_old := found;
  v_has_new := v_store is not null and v_store ->> 'kind' = 'table';

  if v_has_old or v_has_new then
    v_sides := jsonb_build_object('old', v_has_old, 'new', v_has_new);
    if (v_side = 'new' and not v_has_new) or (v_side = 'old' and not v_has_old) then
      return jsonb_build_object(
        'state', 'no_such_side', 'kind', 'table',
        'organization_id', case when v_has_new then (v_store ->> 'organization_id')::uuid else v_old_org end,
        'sides', v_sides,
        'says', case v_side
                  when 'new' then 'This table has no new side yet: it is still only in the older tables. Open it without side= to see it there.'
                  else 'This table has no older side: it was made in the new tables. Open it without side= to see it.'
                end);
    end if;
    v_pick := coalesce(v_side,
                case
                  when v_has_new and v_has_old then
                    case when coalesce((v_store ->> 'live')::boolean, true) and not v_old_live
                         then 'new' else 'old' end
                  when v_has_new then 'new'
                  else 'old'
                end);
    if v_pick = 'new' then
      v_kind := 'table';
      v_org  := (v_store ->> 'organization_id')::uuid;
      v_path := v_store ->> 'path';
      v_live := coalesce((v_store ->> 'live')::boolean, true);
    else
      v_kind := 'older_table';
      v_org  := v_old_org;
      v_path := '/data/' || p_id::text;
      v_live := v_old_live;
    end if;
    -- Asked for by name, a side opens even archived: comparing is the point of asking.
    if v_side is not null then
      v_live := true;
    end if;

  elsif v_side is not null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);

  elsif v_store is not null then
    v_kind := v_store ->> 'kind';
    v_org  := (v_store ->> 'organization_id')::uuid;
    v_path := v_store ->> 'path';
    v_live := coalesce((v_store ->> 'live')::boolean, true);

  else
    -- Everything else, asked as the person through each table's own row security.
    select 'document', d.organization_id, '/documents/' || d.id::text, d.deleted_at is null
      into v_kind, v_org, v_path, v_live
      from workbench.udt_documents d where d.id = p_id;
    if v_kind is null then
      select 'conversation', c.organization_id, '/chat/' || c.id::text, c.deleted_at is null
        into v_kind, v_org, v_path, v_live
        from chat.conversation c where c.id = p_id;
    end if;
    -- SCOPES-READS-REST (2026-09-29): a scope (a Record), a scope type (a Table) and a context item
    -- (a Field) are the record store's own objects and are answered by custom.where_id_opens above;
    -- the older context tables are no longer asked.
  end if;

  if v_kind is null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);
  end if;

  if v_path is null then
    return jsonb_build_object(
      'state', 'no_screen', 'kind', v_kind, 'organization_id', v_org,
      'says', 'This is part of how a table is built — a column, a rule or a person row — and it has no screen of its own. Open the table it belongs to.');
  end if;

  if not v_live then
    return jsonb_build_object(
      'state', 'in_trash', 'kind', v_kind, 'organization_id', v_org,
      'says', 'This was archived. Nothing was deleted: it can be brought back from where it lived.');
  end if;

  -- THE OBJECT'S ORGANIZATION, NAMED ON THE ADDRESS, through the platform's one rule for it
  -- (platform.link_carries_its_organization, `?org=`) — never the caller's selection.
  if v_org is not null then
    v_path := platform.link_carries_its_organization(v_path, v_org);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'state', 'opens', 'kind', v_kind, 'organization_id', v_org, 'path', v_path,
    'sides', v_sides));
end;
$function$
;

-- ── TRASH: THE CONTEXT KINDS FROM THE RECORD STORE (lane SCOPES-READS-REST) ───────────────────────
-- The registry kinds scope_type, scope and context_item used to be read from context.scope_types /
-- context.scopes / context.context_items by the registry loop of public._trash_kind_rows /
-- public._trash_kind_counts and by public.org_trash_restore. They are the store's Tables (kept_for =
-- context), their Records and their Fields, same ids, so this one predicate answers the archived ones
-- — the same two modes and filters the loop applied (personal: mine, plus rows named to me; organization:
-- this organization's, optionally one member's) — and titles them as the loop did (a scope type by its plural label, a scope by
-- its name, a context item by its label), with the "(in <parent>)" suffix the loop took from
-- platform.archived_parent_of: the archived Table a scope or a Field sits in.
-- Unordered and uncut: the callers order by (deleted_at desc, id) and cut, as the loop did.
-- The loop's one further split (a scope marked "personal" listed only in its owner's organization
-- Trash) reads the row column access ladder T-13 retires, which no new body may read; every scope
-- of the store's context Tables is shared with its organization (measured 2026-09-29: 9,315 of
-- 9,315), so the split had nothing to split. Converting it is T-13's (shown_to), not this helper's.
create or replace function public._trash_context_rows(p_token text, p_uid uuid, p_org uuid, p_member uuid)
 returns table(id uuid, title text, deleted_at timestamptz, organization_id uuid, owner_id uuid)
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
  with k as (
    select t.id, t.organization_id, t.created_by, t.deleted_at, t.data,
           left(t.data ->> 'label_plural', 200) as title
      from custom.record t
     where t.data_class = 'table' and t.data ->> 'kept_for' = 'context'
       and (p_org is null or t.organization_id = p_org)
  ), c as (
    -- a scope type
    select k.id, k.title, k.deleted_at, k.organization_id, k.created_by as owner_id,
           null::text as parent_title
      from k
     where p_token = 'scope_type' and k.deleted_at is not null
    union all
    -- a scope: a Record of a context Table
    select r.id, left(r.data ->> 'name', 200), r.deleted_at, r.organization_id, r.created_by,
           case when k.deleted_at is not null then k.title end
      from k
      join custom.record r
        on r.organization_id = k.organization_id and r.table_id = k.id and r.data_class = 'record'
     where p_token = 'scope' and r.deleted_at is not null
    union all
    -- a context item: a Field of a context Table that is not one of the Table's own columns (it carried no organization of its own; in personal
    -- mode the loop printed none, in organization mode its scope type's)
    select f.id, left(f.data ->> 'label', 200), f.deleted_at,
           case when p_org is null then null::uuid else k.organization_id end, f.created_by,
           case when k.deleted_at is not null then k.title end
      from k
      join custom.record f
        on f.organization_id = k.organization_id and f.data_class = 'field'
       and f.data ->> 'entity_definition_id' = k.id::text
     where p_token = 'context_item' and f.deleted_at is not null
       -- a context item is a Field an agent may be handed; the Table's own columns (name, slug, a
       -- class's settings) are Fields kept out of context and were never context items
       and f.data ->> 'context_policy' is distinct from 'exclude'
  )
  select c.id,
         case when c.parent_title is null then c.title
              else coalesce(nullif(btrim(c.title), ''), 'Untitled') || ' (in '
                   || coalesce(nullif(btrim(c.parent_title), ''), 'an archived item') || ')' end,
         c.deleted_at, c.organization_id, c.owner_id
    from c
   where p_uid is not null
     and case
           when p_org is null then
             c.owner_id = p_uid
             or (c.owner_id is distinct from p_uid
                 and c.id in (select g.resource_id from iam.permissions g
                               where g.granted_to_user_id = p_uid and g.resource_type = p_token
                                 and coalesce(g.status, 'active') <> 'rejected'
                                 and (g.expires_at is null or g.expires_at > now())))
           else
             (p_member is null or c.owner_id = p_member)
         end
$function$;
revoke all on function public._trash_context_rows(text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public._trash_context_rows(text, uuid, uuid, uuid) to service_role;
comment on function public._trash_context_rows(text, uuid, uuid, uuid) is
  'SCOPES-READS-REST (2026-09-29): the archived scope types, scopes and context items of Trash, read from the record store (context Tables, their Records and Fields) with the filters and titles the registry loop of public._trash_kind_rows applied to the older context tables. Private to the Trash bodies; granted to no client.';

CREATE OR REPLACE FUNCTION public._trash_kind_rows(p_uid uuid, p_org uuid, p_member uuid, p_kinds text[], p_limit integer, p_offset integer)
 RETURNS TABLE(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean, owner_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. The person (personal mode) or the organization (organization mode, gated by the
-- caller) is the filter; there is no per-row access check and no organization-wide walk here.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) is titled
-- "<title> (in <parent>)" — it is listed, never hidden, and its restore brings the parent back first.
-- A scope type's Field (context_item) carries no organization_id; in organization mode its
-- organization is its scope type's.
-- lane TRASH-COVERAGE-2 (second file): the "(in <parent>)" suffix is computed AFTER the page is cut —
-- an outer select over the limited rows — so it costs one parent lookup per LISTED row, never one per
-- candidate row (org_trash_list file for AI Matrx measured 890.7 ms with it inside the sort; ceiling 300).
-- lane TRASH-COVERAGE-2 (third file): Organization Trash reads a table that carries visibility as TWO
-- bounded index walks — the organization's shared rows, and the caller's own personal rows — instead
-- of one walk that filters out every member's personal row (AI Matrx: 75,540 archived personal files,
-- 3 shared; the one walk read all of them to find three).
-- lane STORE-RESTORE-DOORS: five more record-store kinds — a Field, a Rule, a link between Records, a
-- document template and a dashboard, each removed on its own — read through public._trash_store_children
-- (one predicate with the counts) and titled by public._trash_store_title; restored through their own
-- store door (public._trash_store_restore).
-- lane SCOPES-READS-REST (2026-09-29): the registry's three context kinds (scope_type, scope,
-- context_item) are read from the record store through public._trash_context_rows, never from context.*.
declare
  rec record;
  v_rel regclass;
  v_title text;
  v_org text;
  v_cols text;
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_window int;
  v_title_expr text;
  v_parented boolean;
  v_q text;
  v_wrap text;
  v_kind text[];
begin
  if p_uid is null then return; end if;
  v_window := v_limit + v_offset;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.title_column, e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null
       and e.is_active
       and (p_kinds is null or e.user_artifact_kind = any(p_kinds))
     order by e.user_artifact_kind
  loop
    begin
      if rec.sch = 'context' and rec.token in ('scope_type', 'scope', 'context_item') then
        return query
        select rec.kind::text, rec.token::text, rec.label::text, x.id, x.title,
               x.deleted_at, x.organization_id, (x.owner_id = p_uid), x.owner_id
          from public._trash_context_rows(rec.token, p_uid, p_org, p_member) x
         order by x.deleted_at desc, x.id
         limit v_limit offset v_offset;
        continue;
      end if;

      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        -- Vault credentials: the owner's own, only. Organization mode never lists them.
        if p_org is not null then continue; end if;
        return query execute format(
          'select %L::text, %L::text, %L::text, t.id, t.display_name::text,
                  t.deleted_at, t.organization_id, true, t.user_id
             from users.credential_items t
            where t.user_id = $1 and t.deleted_at is not null
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_limit, v_offset)
          using p_uid;
        continue;
      end if;

      v_title := null;
      -- A scope type's own name is its plural label ("Service areas"); its title_column is the slug.
      select a.attname into v_title
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['label_plural', coalesce(rec.title_column, '')])
       order by (a.attname <> 'label_plural')
       limit 1;
      if v_title is null then
        select a.attname into v_title
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
         order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
         limit 1;
      end if;
      v_org := null;
      select a.attname into v_org
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = 'organization_id'
       limit 1;

      v_title_expr := case when v_title is null then 'null::text' else format('left(t.%I::text, 200)', v_title) end;
      -- The comment kind's title rule (a suggestion shows its replacement, a comment its body, else the quote).
      if rec.token = 'comment' then v_title_expr := 'left(platform.comment_trash_title(t), 200)'; end if;
      -- A Data table row has no title column: its own words, then the table it sits in.
      if rec.token = 'udt_dataset_rows' then
        v_title_expr := 'left(coalesce(nullif(btrim(coalesce(t.data ->> ''name'', t.data ->> ''title'', custom._first_words(t.data))), ''''), ''Untitled row'')'
          || ' || '' (in '' || coalesce((select nullif(btrim(d.table_name), '''') from workbench.udt_datasets d where d.id = t.table_id), ''a table'') || '')'', 200)';
      end if;
      v_parented := rec.token in ('folder', 'file', 'hr_employment', 'workflow_trigger', 'processed_document')
        or exists (select 1 from platform.soft_delete_edge s
                    where s.child_schema = rec.sch and s.child_table = rec.tbl and s.action = 'cascade');
      v_wrap := null;
      if v_parented then
        v_wrap := format(
          'select y.a, y.b, y.c, y.id, '
          || 'coalesce((select coalesce(nullif(btrim(y.t), ''''), ''Untitled'') || '' (in '' || '
          || 'coalesce(nullif(btrim(ap.parent_title), ''''), ''an archived item'') || '')'' '
          || 'from platform.archived_parent_of(%L, y.id) ap limit 1), y.t), '
          || 'y.d, y.o, y.m, y.w from (%%s) y(a, b, c, id, t, d, o, m, w) order by y.d desc, y.id',
          rec.token);
      end if;

      if p_org is not null and v_org is null then continue; end if;

      v_cols := format('%L::text, %L::text, %L::text, t.id, %s, t.deleted_at, %s, (t.%I = $1), t.%I',
        rec.kind, rec.token, rec.label,
        v_title_expr,
        case when v_org is null then 'null::uuid' else format('t.%I', v_org) end,
        rec.owner_col, rec.owner_col);

      if p_org is null then
        -- PERSONAL: what I own, plus what was named to me. Each branch is its own indexed read.
        v_q := format(
          'select * from (
             (select %1$s from %2$I.%3$I t
               where t.%4$I = $1 and t.deleted_at is not null
               order by t.deleted_at desc, t.id limit %5$s)
             union all
             (select %1$s from %2$I.%3$I t
               where t.deleted_at is not null
                 and t.%4$I is distinct from $1
                 and t.id in (select g.resource_id from iam.permissions g
                               where g.granted_to_user_id = $1
                                 and g.resource_type = %6$L
                                 and coalesce(g.status, ''active'') <> ''rejected''
                                 and (g.expires_at is null or g.expires_at > now()))
               order by t.deleted_at desc, t.id limit %5$s)
           ) x
           order by x.deleted_at desc, x.id
           limit %7$s offset %8$s',
          v_cols, rec.sch, rec.tbl, rec.owner_col, v_window, rec.token, v_limit, v_offset);
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid;
      else
        -- ORGANIZATION: this organization's archived rows, optionally one member's. The caller gated it.
        -- A PERSONAL row (visibility = personal) belongs to its owner alone — a member's private
        -- highlight or note never shows in the organization's Trash (verify RC-B11 round 3; access
        -- is personal, Arman 2026-09-23). Its owner still sees it in their own Trash.
        if iam.table_has_visibility(rec.sch, rec.tbl) then
          v_q := format(
            'select * from (
               (select %1$s from %2$I.%3$I t
                 where t.%4$I = $2 and t.deleted_at is not null
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility is distinct from ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
               union all
               (select %1$s from %2$I.%3$I t
                 where t.%5$I = $1 and t.deleted_at is not null
                   and t.%4$I = $2
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility = ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
             ) x
             order by x.deleted_at desc, x.id
             limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset, v_window);
        else
          v_q := format(
            'select %1$s from %2$I.%3$I t
              where t.%4$I = $2 and t.deleted_at is not null
                and ($3::uuid is null or t.%5$I = $3)
              order by t.deleted_at desc, t.id
              limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset);
        end if;
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid, p_org, p_member;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) ────────────────────────────────────────────────────
  -- One physical table (custom.record) holds every Table and Record, so the registry loop above
  -- cannot describe them. Same two modes, same person/organization filter, restored by
  -- custom.record_restore through entity_undelete / org_trash_restore (token `record`).
  -- ── PASSAGE LINKS (annotation trash) ─────────────────────────────────────────────────────────
  -- Only anchored_to associations the person made, removed on their own; personal Trash only (see
  -- the file header). The rest of platform.associations never reaches /trash.
  if p_kinds is null or 'passage_link' = any (p_kinds) then
    return query
    select 'passage_link'::text, 'passage_link'::text, 'Passage link'::text, a.id,
           left(platform.passage_link_trash_title(a), 200),
           a.deleted_at, a.organization_id, (a.created_by = p_uid), a.created_by
      from platform.associations a
     where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null
       and p_org is null and a.created_by = p_uid
     order by a.deleted_at desc, a.id
     limit v_limit offset v_offset;
  end if;

  if to_regclass('custom.record') is null then return; end if;

  if p_kinds is null or 'table' = any (p_kinds) then
    if p_org is null then
      return query
      select 'table'::text, 'record'::text, 'Table'::text, x.id,
             coalesce(nullif(btrim(x.data ->> 'name'), ''), 'Untitled table'),
             x.deleted_at, x.organization_id, (x.created_by = p_uid), x.created_by
        from (
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null
            order by t.deleted_at desc, t.id limit v_window)
          union all
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.data_class = 'table' and t.deleted_at is not null
              and t.created_by is distinct from p_uid
              and t.id in (select g.resource_id from iam.permissions g
                            where g.granted_to_user_id = p_uid
                              and g.resource_type = 'record'
                              and coalesce(g.status, 'active') <> 'rejected'
                              and (g.expires_at is null or g.expires_at > now()))
            order by t.deleted_at desc, t.id limit v_window)
        ) x
       order by x.deleted_at desc, x.id
       limit v_limit offset v_offset;
    else
      return query
      select 'table'::text, 'record'::text, 'Table'::text, t.id,
             coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
             t.deleted_at, t.organization_id, (t.created_by = p_uid), t.created_by
        from custom.record t
       where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
         and (p_member is null or t.created_by = p_member)
       order by t.deleted_at desc, t.id
       limit v_limit offset v_offset;
    end if;
  end if;

  if p_kinds is null or 'record' = any (p_kinds) then
    -- A Record archived on its own, while its Table is live. One inside an archived Table comes
    -- back with the Table, so it is not a second Trash row.
    return query
    select 'record'::text, 'record'::text, 'Record'::text, y.id,
           format('%s (in %s)',
                  coalesce(nullif(btrim(custom.record_words(y.organization_id, y.id)), ''), 'Untitled record'),
                  coalesce(nullif(btrim(y.table_name), ''), 'a table')),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (
        select x.id, x.deleted_at, x.organization_id, x.created_by, x.table_name
          from (
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name' as table_name
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.data_class = 'record' and r.deleted_at is not null
                and r.created_by is distinct from p_uid
                and r.id in (select g.resource_id from iam.permissions g
                              where g.granted_to_user_id = p_uid
                                and g.resource_type = 'record'
                                and coalesce(g.status, 'active') <> 'rejected'
                                and (g.expires_at is null or g.expires_at > now()))
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is not null
                and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
                and (p_member is null or r.created_by = p_member)
              order by r.deleted_at desc, r.id limit v_window)
          ) x
         order by x.deleted_at desc, x.id
         limit v_limit offset v_offset
      ) y
     order by y.deleted_at desc, y.id;
  end if;

  -- ── THE STORE'S OWN THINGS, removed on their own (lane STORE-RESTORE-DOORS) ──────────────────
  foreach v_kind slice 1 in array array[['field','Field'],['rule','Rule'],['relation','Link'],['doc_template','Document template'],['dashboard','Dashboard']] loop
    continue when p_kinds is not null and not (v_kind[1] = any (p_kinds));
    return query
    select v_kind[1], 'record'::text, v_kind[2], y.id,
           coalesce(public._trash_store_title(y.organization_id, y.id), 'Untitled'),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (select c.id, c.organization_id, c.deleted_at, c.created_by
              from public._trash_store_children(p_uid, p_org, p_member, v_kind[1], v_window) c
             order by c.deleted_at desc, c.id
             limit v_limit offset v_offset) y
     order by y.deleted_at desc, y.id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._trash_kind_counts(p_uid uuid, p_org uuid, p_member uuid)
 RETURNS TABLE(artifact_kind text, label text, n bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. Mirrors public._trash_kind_rows row for row; no per-row access check.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: context_item's organization is its scope type's (it has no organization_id).
-- lane STORE-RESTORE-DOORS: the five store kinds, counted through the SAME predicate the listing reads
-- (public._trash_store_children).
-- lane SCOPES-READS-REST (2026-09-29): the three context kinds are counted from the record store through
-- public._trash_context_rows — the same predicate public._trash_kind_rows lists.
declare
  rec record;
  v_rel regclass;
  v_org text;
  v_n bigint;
  v_kind text[];
begin
  if p_uid is null then return; end if;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null and e.is_active
     order by e.user_artifact_kind
  loop
    begin
      v_n := 0;
      if rec.sch = 'context' and rec.token in ('scope_type', 'scope', 'context_item') then
        select count(*) into v_n from public._trash_context_rows(rec.token, p_uid, p_org, p_member);
        if v_n > 0 then
          artifact_kind := rec.kind; label := rec.label; n := v_n; return next;
        end if;
        continue;
      end if;
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        if p_org is not null then continue; end if;
        select count(*) into v_n from users.credential_items t
         where t.user_id = p_uid and t.deleted_at is not null;
      else
        v_org := null;
        select a.attname into v_org
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = 'organization_id'
         limit 1;
        if p_org is null then
          execute format(
            'select (select count(*) from %1$I.%2$I t where t.%3$I = $1 and t.deleted_at is not null)
                  + (select count(*) from %1$I.%2$I t
                      where t.deleted_at is not null and t.%3$I is distinct from $1
                        and t.id in (select g.resource_id from iam.permissions g
                                      where g.granted_to_user_id = $1
                                        and g.resource_type = %4$L
                                        and coalesce(g.status, ''active'') <> ''rejected''
                                        and (g.expires_at is null or g.expires_at > now())))',
            rec.sch, rec.tbl, rec.owner_col, rec.token)
            into v_n using p_uid;
        else
          if v_org is null then continue; end if;
          execute format(
            'select count(*) from %1$I.%2$I t
              where t.%3$I = $1 and t.deleted_at is not null
                and ($2::uuid is null or t.%4$I = $2)',
            rec.sch, rec.tbl, v_org, rec.owner_col)
            into v_n using p_org, p_member;
        end if;
      end if;

      if v_n > 0 then
        artifact_kind := rec.kind; label := rec.label; n := v_n; return next;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) — the same predicates as _trash_kind_rows ──────────
  -- ── PASSAGE LINKS — the same predicate as _trash_kind_rows ─────────────────────────────────
  select count(*) into v_n from platform.associations a
   where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null
     and p_org is null and a.created_by = p_uid;
  if v_n > 0 then
    artifact_kind := 'passage_link'; label := 'Passage link'; n := v_n; return next;
  end if;

  if to_regclass('custom.record') is null then return; end if;

  if p_org is null then
    select (select count(*) from custom.record t
             where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null)
         + (select count(*) from custom.record t
             where t.data_class = 'table' and t.deleted_at is not null
               and t.created_by is distinct from p_uid
               and t.id in (select g.resource_id from iam.permissions g
                             where g.granted_to_user_id = p_uid and g.resource_type = 'record'
                               and coalesce(g.status, 'active') <> 'rejected'
                               and (g.expires_at is null or g.expires_at > now())))
      into v_n;
  else
    select count(*) into v_n from custom.record t
     where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
       and (p_member is null or t.created_by = p_member);
  end if;
  if v_n > 0 then
    artifact_kind := 'table'; label := 'Table'; n := v_n; return next;
  end if;

  if p_org is null then
    select (select count(*) from custom.record r
              join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                  and t.data_class = 'table' and t.deleted_at is null
             where r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null)
         + (select count(*) from custom.record r
              join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                  and t.data_class = 'table' and t.deleted_at is null
             where r.data_class = 'record' and r.deleted_at is not null
               and r.created_by is distinct from p_uid
               and r.id in (select g.resource_id from iam.permissions g
                             where g.granted_to_user_id = p_uid and g.resource_type = 'record'
                               and coalesce(g.status, 'active') <> 'rejected'
                               and (g.expires_at is null or g.expires_at > now())))
      into v_n;
  else
    select count(*) into v_n from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                          and t.data_class = 'table' and t.deleted_at is null
     where r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
       and (p_member is null or r.created_by = p_member);
  end if;
  if v_n > 0 then
    artifact_kind := 'record'; label := 'Record'; n := v_n; return next;
  end if;

  foreach v_kind slice 1 in array array[['field','Field'],['rule','Rule'],['relation','Link'],['doc_template','Document template'],['dashboard','Dashboard']] loop
    select count(*) into v_n from public._trash_store_children(p_uid, p_org, p_member, v_kind[1], null);
    if v_n > 0 then
      artifact_kind := v_kind[1]; label := v_kind[2]; n := v_n; return next;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.org_trash_restore(p_organization_id uuid, p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. An owner or admin of the organization restores one member's archived item that sits
-- in THIS organization. One audit row (iam.org_admin_audit, action trash.restore) and, when the item
-- is somebody else's, an in-app notice to its owner. Never a purge.
-- lane TRASH-TABLES: a record-store Table or Record (token `record`) is restored by
-- custom.record_restore, which asks the store's own ladder for the caller and brings back exactly what
-- its archive took; a refusal is returned as restored=false with the store's sentence.
-- lane TRASH-COVERAGE-2: a row whose parent is archived brings the parent back first, through this
-- same door (audited and noticed as the parent). Kinds with their own restore door go through it:
-- folder (public.restore_folder), scope type (public.restore_scope_type), scope (public.restore_scope),
-- scope type Field (public.restore_context_item), library document (rag.fn_restore_library_document),
-- HR employee (public.hr_employee_restore); a door's
-- refusal is restored=false with a sentence, never a raw update around it.
-- lane STORE-RESTORE-DOORS: a Field, Rule, link, document template or dashboard (token `record`) goes
-- through its own store door (public._trash_store_restore) and a mandate through
-- mandate.definition_restore; the door's own refusal sentence is the answer.
-- lane DOORS-DECIDE-LAST: a Meeting through communication.meet_restore_meeting.
-- lane SCOPES-READS-REST (2026-09-29): a scope type, scope or context item is found, titled and
-- parented from the record store (its context Table, Record or Field), never from context.*; it is
-- still restored through its own door (restore_scope_type / restore_scope / restore_context_item).
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  e record;
  v_rel regclass;
  v_title_col text;
  v_owner uuid;
  v_title text;
  v_label text;
  v_me_name text;
  v_org_name text;
  v_subject text;
  v_body text;
  v_class text;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_ptitle text;
  v_via_parent boolean := false;
  v_res jsonb;
  v_at timestamptz;
  v_title_expr text;
  v_found boolean;
  v_n int;
  v_why text;
  v_ctx boolean;
begin
  if p_token = 'record' then
    select r.created_by, r.data_class,
           case when r.data_class = 'table'
                then coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled table')
                when r.data_class = 'record'
                then coalesce(nullif(btrim(custom.record_words(r.organization_id, r.id)), ''), 'Untitled record')
                else coalesce(public._trash_store_title(r.organization_id, r.id), 'Untitled') end
      into v_owner, v_class, v_title
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id
       and r.deleted_at is not null
       and r.data_class in ('table', 'record', 'field', 'rule', 'relation', 'doc_template', 'dashboard');
    if not found then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;
    begin
      perform public._trash_store_restore(p_organization_id, p_id);
    exception
      when insufficient_privilege then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      when check_violation or unique_violation or no_data_found or raise_exception then
        get stacked diagnostics v_why = message_text;
        return jsonb_build_object('restored', false, 'message', v_why);
    end;
    v_label := case v_class when 'table' then 'Table' when 'record' then 'Record' when 'field' then 'Field'
                            when 'rule' then 'Rule' when 'relation' then 'Link'
                            when 'doc_template' then 'Document template' else 'Dashboard' end;
    select 'record'::text as token, v_label as label into e;
  else
    select t.token, t.user_artifact_kind, t.label, t.schema_name, t.table_name,
           coalesce(t.retention_owner_column, 'created_by') as owner_col, t.title_column, t.feature_owned_restore
      into e
      from platform.entity_types t
     where t.token = p_token and t.is_active and t.user_artifact_kind is not null;
    if not found then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;
    if coalesce(e.feature_owned_restore, false) or e.token in ('credential_item', 'user_secret', 'credential_attachment') then
      raise exception 'Vault items are restored by their owner from their own Trash.' using errcode = '42501';
    end if;
    v_ctx := e.schema_name = 'context' and e.token in ('scope_type', 'scope', 'context_item');
    v_rel := case when v_ctx then null else to_regclass(format('%I.%I', e.schema_name, e.table_name)) end;
    if v_rel is null and not v_ctx then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;

    select a.attname into v_title_col from pg_attribute a
     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
       and a.attname = any (array['label_plural', coalesce(e.title_column, '')])
     order by (a.attname <> 'label_plural') limit 1;
    if v_title_col is null then
      select a.attname into v_title_col from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
       order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
       limit 1;
    end if;

    v_title_expr := case when v_title_col is null then 'null::text' else format('left(t.%I::text, 200)', v_title_col) end;

    -- The parent first: a child of an archived parent only comes back with it.
    for v_i in 1..8 loop
      v_pid := null;
      if v_ctx then
        -- a scope's or a context item's parent is the context Table it sits in, when archived
        select 'scope_type'::text, k.id, left(k.data ->> 'label_plural', 200) into v_ptok, v_pid, v_ptitle
          from custom.record x
          join custom.record k
            on k.organization_id = x.organization_id and k.data_class = 'table'
           and k.data ->> 'kept_for' = 'context' and k.deleted_at is not null
           and k.id = case x.data_class when 'record' then x.table_id
                                        else nullif(x.data ->> 'entity_definition_id', '')::uuid end
         where e.token in ('scope', 'context_item') and x.id = p_id
           and x.data_class = case e.token when 'scope' then 'record' else 'field' end
         limit 1;
      else
      select ap.parent_token, ap.parent_id, ap.parent_title into v_ptok, v_pid, v_ptitle
        from platform.archived_parent_of(e.token, p_id) ap limit 1;
      end if;
      exit when v_pid is null;
      if not exists (select 1 from platform.entity_types t
                      where t.token = v_ptok and t.is_active and t.user_artifact_kind is not null) then
        return jsonb_build_object('restored', false,
          'message', format('It is inside %s, which is archived and is not in this organization''s Trash. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_ptitle), ''), 'something')));
      end if;
      v_res := public.org_trash_restore(p_organization_id, v_ptok, v_pid);
      if not coalesce((v_res ->> 'restored')::boolean, false) then
        return v_res;
      end if;
      v_via_parent := true;
    end loop;

    -- The row, in THIS organization (a scope type's Field reads its organization from its scope type).
    if v_ctx then
      select true, x.created_by,
             left(case e.token when 'scope_type' then x.data ->> 'label_plural'
                               when 'scope' then x.data ->> 'name'
                               else x.data ->> 'label' end, 200),
             x.deleted_at
        into v_found, v_owner, v_title, v_at
        from custom.record x
        join custom.record k
          on k.organization_id = x.organization_id and k.data_class = 'table'
         and k.data ->> 'kept_for' = 'context'
         and k.id = case e.token when 'scope_type' then x.id
                                 when 'scope' then x.table_id
                                 else nullif(x.data ->> 'entity_definition_id', '')::uuid end
       where x.id = p_id and x.organization_id = p_organization_id
         and x.data_class = case e.token when 'scope_type' then 'table'
                                         when 'scope' then 'record' else 'field' end;
    else
      execute format('select true, t.%I, %s, t.deleted_at from %I.%I t where t.id = $1 and t.organization_id = $2',
                     e.owner_col, v_title_expr, e.schema_name, e.table_name)
        into v_found, v_owner, v_title, v_at
        using p_id, p_organization_id;
    end if;
    if not coalesce(v_found, false) or (v_at is null and not v_via_parent) then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;

    if v_at is null then
      -- It came back with its parent (audited and noticed there). A Field comes back in use.
      if e.token = 'context_item' then
        perform public.restore_context_item(p_id);
      end if;
      return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
        'message', format('%s came back with %s.', coalesce(nullif(btrim(v_title), ''), e.label),
                          coalesce(nullif(btrim(v_ptitle), ''), 'what it sits in')));
    end if;

    if e.token in ('folder', 'scope_type', 'scope', 'context_item', 'processed_document', 'hr_employee', 'mandate', 'meet_meeting') then
      begin
        case e.token
          when 'folder' then perform public.restore_folder(p_id);
          when 'scope_type' then perform public.restore_scope_type(p_id);
          when 'scope' then perform public.restore_scope(p_id);
          when 'context_item' then perform public.restore_context_item(p_id);
          when 'processed_document' then perform rag.fn_restore_library_document(p_id);
          when 'mandate' then perform mandate.definition_restore(p_id);
          -- lane DOORS-DECIDE-LAST: a Meeting through Meet's own door (host or co-host).
          when 'meet_meeting' then perform communication.meet_restore_meeting(p_id, null);
          when 'hr_employee' then
            v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
            if not coalesce((v_res ->> 'ok')::boolean, false) then
              return jsonb_build_object('restored', false,
                'message', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                    'Only someone HR allows to restore this person can bring them back.'));
            end if;
        end case;
      exception when insufficient_privilege or raise_exception or no_data_found then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      end;
    else
      execute format(
        'update %I.%I t set deleted_at = null
          where t.id = $1 and t.organization_id = $2 and t.deleted_at is not null
          returning t.%I, %s',
        e.schema_name, e.table_name, e.owner_col, v_title_expr)
        into v_owner, v_title
        using p_id, p_organization_id;
      get diagnostics v_n = row_count;

      -- (EXECUTE never sets FOUND; the row count is the answer.)
      if v_n = 0 then
        return jsonb_build_object('restored', false,
          'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
      end if;
      if e.token = 'workflow' then
        perform workflow.restore_triggers_archived_with(p_id, v_at);
      end if;
    end if;
    v_label := e.label;
  end if;

  perform iam._org_audit(p_organization_id, v_owner, 'trash.restore',
    jsonb_build_object('entity_token', e.token, 'id', p_id, 'label', v_label, 'title', v_title));

  if v_owner is not null and v_owner is distinct from v_me then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(btrim(u.email), ''), 'An organization admin')
      into v_me_name from auth.users u where u.id = v_me;
    select coalesce(nullif(btrim(o.name), ''), 'your organization') into v_org_name
      from iam.organizations o where o.id = p_organization_id;
    v_subject := format('%s restored your %s', coalesce(v_me_name, 'An organization admin'), lower(v_label));
    v_body := format('%s restored "%s" from %s''s Trash. It is back where it was.',
                     coalesce(v_me_name, 'An organization admin'),
                     coalesce(nullif(btrim(v_title), ''), 'Untitled'), coalesce(v_org_name, 'your organization'));
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
    values
      (p_organization_id, 'trash.restored_by_org_admin', 'in_app', v_owner, 'user',
       format('trash.restore:%s:%s:%s', e.token, p_id, extract(epoch from clock_timestamp())::bigint),
       v_subject, left(v_body, 600),
       jsonb_build_object('entity_token', e.token, 'id', p_id, 'by', v_me, 'source', 'org_trash_restore',
                          'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       e.token, p_id, null, 'personal'::platform.visibility)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
    'message', format('%s restored.', coalesce(nullif(btrim(v_title), ''), v_label)));
end;
$function$
;


-- ── THE TWO DICTIONARY HELPERS ARE CLIENT DOORS: declared, then granted ──────────────────────────
-- A signed-in person may call the per-person dictionary bodies (public.dict_list_owners_for /
-- dict_resolve_for / dict_owner_org) about themselves; those bodies are SECURITY INVOKER and ask these
-- two helpers, so the helpers are what the person's call reaches.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers, argument_rules)
values
  ('public', '_dict_context_owners', 'p_org_ids uuid[], p_ids uuid[]',
   array['uuid[]'::regtype::oid, 'uuid[]'::regtype::oid],
   'migrations/campaign/scopesreadsrest_the_dictionary_trash_and_facts_read_the_store.sql (lane SCOPES-READS-REST)',
   'SCOPES-READS-REST: the scope types (context Tables) and scopes (their Records) of named organizations, from the record store, for the SECURITY INVOKER per-person dictionary bodies. A signed-in person is answered only about organizations they belong to (iam.my_orgs, before any row is read); a platform admin and the server about any. It returns names and ids only.',
   false, true,
   '{"version": 1, "arguments": {"p_org_ids": {"type": "uuid[]", "check": "p_org_ids -> intersected with the caller''s own organizations (iam.my_orgs) unless platform admin or server", "foreign": {"note": "a foreign organization is dropped before anything is read", "decided_before_read": true}, "optional": false, "position": 1, "null_rule": {}}, "p_ids": {"type": "uuid[]", "check": "p_ids -> a filter inside the organizations already decided", "foreign": {"note": "narrows the answer; never widens it past p_org_ids", "decided_before_read": true}, "optional": true, "position": 2, "null_rule": {}}}}'::jsonb),
  ('public', '_dict_context_owner_org', 'p_level text, p_owner_id uuid',
   array['text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/scopesreadsrest_the_dictionary_trash_and_facts_read_the_store.sql (lane SCOPES-READS-REST)',
   'SCOPES-READS-REST: the organization of one scope type (context Table) or scope (its Record), from the record store, for public.dict_owner_org. Null for a signed-in person who does not belong to it (iam.my_orgs), so a foreign id and an invented one answer the same.',
   false, true, null)
on conflict (schema_name, function_name, identity_argtypes) do update
  set signed_in_callers = excluded.signed_in_callers, anonymous_callers = excluded.anonymous_callers,
      non_client_lane = null, reason = excluded.reason, declared_by = excluded.declared_by,
      argument_rules = excluded.argument_rules;
grant execute on function public._dict_context_owners(uuid[], uuid[]) to authenticated;
grant execute on function public._dict_context_owner_org(text, uuid) to authenticated;
