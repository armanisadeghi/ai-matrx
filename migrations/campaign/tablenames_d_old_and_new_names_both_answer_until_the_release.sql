-- chair-step: production still serves a frontend that calls the doors by their OLD names and reads kept_by_the_app; until a newer frontend is live every renamed door answers both. Drops and recreates three set-returning functions to add one column; the inverse puts the previous bodies back.
-- lane: TABLE-NAMES-FINAL
-- lock: custom
-- based-on: custom.table_placement(uuid, uuid, jsonb, boolean) 51d767c8a065c34b970fba8dc9fc16d061061ab4cf6cfd19803d4572d4bc16c1
-- based-on: custom.table_list_everywhere(uuid) cc6d478c2aaffde0e03a50a3f5d6ba80225ce5799b385aa2beb9e84a372d0e7f
-- based-on: custom.data_home_tables(uuid) b959eb1c7b817fd89af2a6b89832b3d6b7aa80b47c9c8ec90657d73710c61025
-- based-on: custom.data_home_tables(uuid, boolean) b23c4407f751d7eaa5b1bd43933e751d36b5204595cd8849a989d3a1652f2ddf
-- based-on: custom.table_facts(uuid) 85e30795a5781f6a986be83f7e999d5aa41ed7ea809ea32f787da85d5a940ae6
--
-- TEMPORARY, to be removed once production serves a frontend newer than 5a2250fb28 (common-docs operations/tasks/data/remove-old-table-names.md):
--  * table_placement, table_list_everywhere, data_home_tables, table_facts and custom."table" carry kept_by_the_app beside platform_owned (same value);
--  * one extra overload per renamed door takes the OLD parameter name p_include_app_tables (as text, so a call naming it resolves to it alone).

CREATE OR REPLACE FUNCTION custom.table_placement(p_organization_id uuid, p_table_id uuid, p_data jsonb, p_is_kernel boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- WHO KEEPS A TABLE, AND WHETHER THE CONTEXT PICKER OFFERS IT (lane SC-1 PLACEMENT).
  --   kept_by_the_app     the store's one flag: true = the app or one of its features keeps it,
  --                       false = the organization's own. Stored, or read off the older facts.
  --   kept_for            WHICH feature: the stored word (context, education, dictionary, …),
  --                       else the one the older facts say, else `app`. Null when not kept.
  --   offered_as_context  whether the context picker offers the Table. Stored, else false: only
  --                       a Table somebody marked (a scope type the mover lands) is a context.
  --   foundation          whether the Table is part of the business's day-one data (lane 10 FD).
  select jsonb_build_object(
           'platform_owned', d.kept,
           'kept_by_the_app', d.kept,
           'kept_for', case when d.kept then coalesce(nullif(btrim(p_data ->> 'kept_for'), ''), d.word, 'app') end,
           'offered_as_context',
             case when jsonb_typeof(p_data -> 'offered_as_context') = 'boolean'
                  then (p_data ->> 'offered_as_context')::boolean else false end,
           -- LANE 10 FD: the business's day-one data (custom.table_is_foundation). Absent = false.
           'foundation', custom.table_is_foundation(p_data))
    from (select w.word,
                 (w.word is not null
                  or coalesce(p_data ->> 'kept_by_the_app', '') = 'true'
                  or coalesce(btrim(p_data ->> 'kept_for'), '') <> '') as kept
            from (select custom.table_kept_for_derived(
                           p_data, p_is_kernel,
                           case when p_is_kernel then false
                                -- the Field graph, asked here and not through custom.table_is_options_table: that
                                -- function is WRITE-PERF-4's and its inverse removes it
                                -- (check:inverses-leave-the-ground-standing, clause d).
                                else exists (select 1 from custom.record f
                                              where f.organization_id = p_organization_id
                                                and f.table_id = custom.field_kernel_id()
                                                and f.deleted_at is null
                                                and f.data ->> 'type' = 'list'
                                                and f.data -> 'config' ->> 'options_table_id' = p_table_id::text) end) as word) w) d
$function$
;

CREATE OR REPLACE FUNCTION custom.table_list_everywhere(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
  v_field  uuid := custom.field_kernel_id();
  v_orgs   uuid[] := '{}'::uuid[];
  v_org    uuid;
  v_tables jsonb;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29;
  -- access-belongs-to-the-person): the Tables the caller may open in EVERY organization she belongs
  -- to. Each organization still meets its own wall (custom.assert_client_may_reach, this door's name)
  -- and its own ladder (custom.query_visible_ids) below; an organization whose wall refuses (42501)
  -- contributes nothing. No permission is changed by this branch.
  --
  -- TABLE-LIST-PERF (2026-10-03, lane data-tables-grid-overhaul; shipped by CHAIR-GRID): ONE STATEMENT
  -- FOR EVERY ORGANIZATION. This branch used to call this same door once per organization, and each
  -- call counted rows, Fields and latest activity Table by Table and asked custom.table_placement (a
  -- scan of the organization's whole Field graph) once per Table: ~25-40 s for admin@admin.com (48
  -- organizations, ~600 Tables) against an 8 s statement limit. Now the walls are asked first, the one
  -- ladder is primed once for all admitted organizations (custom.tables_seen_once_per_group, as
  -- custom.data_home_tables does), and the counts, the Field graph and the placement are read once,
  -- set-based. Same rows, same shape, same order.
  if p_organization_id is null then
    if v_me is null then
      return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        perform custom.assert_client_may_reach(v_org, 'custom.table_list_everywhere');
        v_orgs := v_orgs || v_org;
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
  else
    perform custom.assert_client_may_reach(p_organization_id, 'custom.table_list_everywhere');
    v_orgs := array[p_organization_id];
  end if;

  if cardinality(v_orgs) = 0 then
    return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
  end if;

  -- STORE-READ-PERF-3/4: the one ladder's Table answer for every admitted organization at once; the
  -- answer waits in this statement's memo and each custom.query_visible_ids below reads its own
  -- organization's part. It decides nothing: without it every answer is the same, only slower.
  if v_me is not null then
    perform count(*) from custom.tables_seen_once_per_group(v_me, v_orgs);
  end if;

  with visible as materialized (
    select o.org, v.v as id
      from unnest(v_orgs) as o(org)
      cross join lateral custom.query_visible_ids(o.org, v_kernel) v
  ),
  tbl as materialized (
    select t.*
      from custom.record t
      join visible v on v.org = t.organization_id and v.id = t.id
     where t.table_id = v_kernel
       and t.data_class = 'table'
       and t.deleted_at is null
  ),
  activity as materialized (
    -- rows and latest activity of every listed Table, one grouped read
    select r.organization_id, r.table_id,
           max(r.updated_at) as last_updated,
           count(*) filter (where r.data_class = 'record' and r.deleted_at is null) as row_count
      from (select distinct organization_id, id from tbl) k
      join custom.record r on r.organization_id = k.organization_id and r.table_id = k.id
     group by 1, 2
  ),
  field_counts as materialized (
    -- the Field graph of the admitted organizations, read once: live Fields per Table ...
    select f.organization_id, f.data ->> 'entity_definition_id' as entity_id, count(*) as field_count
      from custom.record f
     where f.organization_id = any (v_orgs)
       and f.table_id = v_field
       and f.data_class = 'field'
       and f.deleted_at is null
     group by 1, 2
  ),
  options_tables as materialized (
    -- ... and which Tables a list Field takes its choices from (custom.table_placement's one
    -- Field-graph question, asked once for every organization instead of once per Table)
    select distinct f.organization_id, f.data -> 'config' ->> 'options_table_id' as id
      from custom.record f
     where f.organization_id = any (v_orgs)
       and f.table_id = v_field
       and f.deleted_at is null
       and f.data ->> 'type' = 'list'
       and f.data -> 'config' ->> 'options_table_id' is not null
  ),
  store as materialized (
    select jsonb_build_object(
             'id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'description', t.data ->> 'description',
             'version', t.version,
             'user_id', t.created_by,
             -- CHAIR-WORLD-LANE: the list's Public mark is the Table's own (published to the web).
             'is_public', t.published_to_web,
             'visibility', t.visibility::text,
             'organization_id', t.organization_id,
             'created_at', t.created_at,
             'updated_at', t.updated_at,
             'last_activity_at', greatest(t.updated_at, a.last_updated),
             'row_count', coalesce(a.row_count, 0),
             'field_count', coalesce(fc.field_count, 0),
             'store', 'records')
           -- SC-1 PLACEMENT: custom.table_placement(t.organization_id, t.id, t.data, false), word for
           -- word, with its one Field-graph question answered from `options_tables` above instead of per Table.
           || (select jsonb_build_object(
                        'platform_owned', d.kept, 'kept_by_the_app', d.kept,
                        'kept_for', case when d.kept then coalesce(nullif(btrim(t.data ->> 'kept_for'), ''), d.word, 'app') end,
                        'offered_as_context',
                          case when jsonb_typeof(t.data -> 'offered_as_context') = 'boolean'
                               then (t.data ->> 'offered_as_context')::boolean else false end)
                 from (select w.word,
                              (w.word is not null
                               or coalesce(t.data ->> 'kept_by_the_app', '') = 'true'
                               or coalesce(btrim(t.data ->> 'kept_for'), '') <> '') as kept
                         from (select custom.table_kept_for_derived(
                                        t.data, false,
                                        ot.id is not null) as word) w) d) as doc
      from tbl t
      left join activity a on a.organization_id = t.organization_id and a.table_id = t.id
      left join field_counts fc on fc.organization_id = t.organization_id and fc.entity_id = t.id::text
      left join options_tables ot on ot.organization_id = t.organization_id and ot.id = t.id::text
  )
  -- The order keys are the door's own (latest activity, then creation, newest first); the Table's id
  -- closes a tie so two calls page the same way (CHAIR-GRID).
  select coalesce(jsonb_agg(x.doc order by (x.doc ->> 'last_activity_at') desc nulls last,
                                           (x.doc ->> 'created_at') desc,
                                           (x.doc ->> 'id')), '[]'::jsonb)
    into v_tables
    -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
    -- default list (custom.table_kept_out_of_lists on its placement word) only with p_include_platform_tables.
    from (select s.doc from store s
           where current_setting('custom.include_platform_tables', true) is not distinct from 'on'
              or not custom.table_kept_out_of_lists(s.doc ->> 'kept_for')) x;

  return jsonb_build_object('success', true, 'tables', v_tables);
end
$function$
;

drop function custom.data_home_tables(uuid);

CREATE OR REPLACE FUNCTION custom.data_home_tables(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone, mine boolean, shared_with_me boolean, platform_owned boolean, kept_by_the_app boolean, kind text, team boolean, system boolean, created_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME (check:store-doors-decide, lane DATA-HOME-2): an
  -- organization named is one the caller may reach, or the call is refused here, naming this door
  -- — never an empty list that reads like "nothing there", and never a refusal from a door the
  -- person did not call. Named nobody, the walk below admits only organizations the caller
  -- reaches (the same custom.assert_client_may_reach arms: iam.has_org_access / portal_admits).
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_tables');
  end if;
  if v_me is null then
    return;
  end if;

  -- STORE-READ-PERF-3 (2026-09-28): ONE WALK FOR EVERY ORGANIZATION. Ask which Tables she sees in
  -- all her organizations at once; the answer waits in this statement's memo, and each
  -- custom.query_visible_ids below (through custom.visible_set) reads its organization's part
  -- instead of walking the ladder again. It decides nothing: without it every answer is the same,
  -- only slower.
  -- DATA-HOME-2 (2026-09-29): an organization whose answer is already in THIS statement's memo is
  -- not walked again — custom.data_home asks once for the whole page and then calls this door.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)
               -- PERF-FIX-2: the key the walk writes ends in the snapshot; without it this never matched
               and platform.memo_k_get('custom.tables_seen:' || v_me::text || ':' || m.organization_id::text
                                       || ':' || pg_catalog.pg_current_snapshot()::text) is null));


  return query
    with orgs as (
      select o.id, o.name::text as name, true as member
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
      union
      select distinct o.id, o.name::text, false
        from iam.permissions g
        join custom.record t
          on t.id = g.resource_id
         and t.table_id = v_kernel
         and t.deleted_at is null
        join iam.organizations o on o.id = t.organization_id and o.archived_at is null
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and not exists (select 1 from iam.organization_member m2
                          where m2.organization_id = o.id and m2.user_id = v_me)
    ),
    admitted as materialized (
      select o.id, o.name, o.member
        from orgs o
       where (case when iam.has_org_access(o.id) then true else custom.portal_admits(o.id) end)
         and custom.store_is_open(o.id)
         -- THE ORGANIZATION FILTER, HONOURED HERE (lane DATA-HOME-2): one organization named,
         -- only its tables are walked, in every lane and kind; none named, every organization.
         -- A NARROWING only: an organization the walk would not admit stays unadmitted.
         and (p_organization_id is null or o.id = p_organization_id)
    ),
    visible as materialized (
      select a.id as org_id, v.v as id
        from admitted a
        cross join lateral custom.query_visible_ids(a.id, v_kernel) v
       where a.member
      union
      select a.id, g.resource_id
        from admitted a
        join iam.permissions g
          on g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
       where not a.member
    ),
    options_ids as materialized (
      -- THE FIELD GRAPH, READ ONCE for every organization walked: which Tables a list column takes
      -- its choices from. custom.table_placement asks this per Table (an EXISTS over the Field
      -- kernel), which cost 21 s for a person in 46 organizations; asked once it is one scan.
      select distinct (f.data -> 'config' ->> 'options_table_id') as id
        from admitted a
        join custom.record f
          on f.organization_id = a.id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
    ),
    team_reach as materialized (
      -- MY TEAM (lane DATA-HOME-2, 2026-09-30): (organization, person) pairs the signed-in person shares a
      -- live team with — iam.my_team_reach, the same answer every *_list_scoped RPC narrows My team by.
      select tr.organization_id, tr.user_id from iam.my_team_reach(null) tr
    ),
    granted as materialized (
      -- SHARED: a live grant on a Table naming the person, given by somebody else.
      select distinct g.resource_id as id
        from iam.permissions g
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and g.created_by is distinct from v_me
    )
    select t.id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           a.id,
           a.name,
           a.member,
           t.visibility::text,
           t.updated_at,
           (t.created_by = v_me),
           (t.id in (select gr.id from granted gr)),
           coalesce((pl.p ->> 'platform_owned')::boolean, false),
    coalesce((pl.p ->> 'platform_owned')::boolean, false),
           -- THE KIND, from the store's own placement (custom.table_placement's kept_for): one word
           -- per thing a person would name. A table the app does not keep is a table.
           case
             when not coalesce((pl.p ->> 'platform_owned')::boolean, false) then 'table'
             when pl.p ->> 'kept_for' = 'app' then
               case substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
                 when 'form' then 'form'
                 when 'view' then 'view'
                 when 'comment' then 'comment'
                 when 'dashboard' then 'dashboard'
                 when 'action' then 'action'
                 when 'checklist' then 'checklist'
                 when 'slots' then 'booking'
                 when 'demo' then 'demo'
                 when 'shapeproof' then 'demo'
                 else 'list'
               end
             when pl.p ->> 'kept_for' = 'choices' then 'list'
             when pl.p ->> 'kept_for' = 'context' then 'scope'
             when pl.p ->> 'kept_for' = 'bookings' then 'booking'
             when pl.p ->> 'kept_for' = 'checklists' then 'checklist'
             when pl.p ->> 'kept_for' = 'workflow' then 'workflow'
             when pl.p ->> 'kept_for' = 'kits' then 'kit'
             when pl.p ->> 'kept_for' = 'store' then 'store'
             else coalesce(nullif(pl.p ->> 'kept_for', ''), 'app')
           end,
           -- MY TEAM: the Table's maker shares a live team with her in its organization.
           exists (select 1 from team_reach tr where tr.organization_id = a.id and tr.user_id = t.created_by),
           -- SYSTEM: the Table lives in an organization the platform itself keeps (iam.organizations.is_system).
           coalesce((select o2.is_system from iam.organizations o2 where o2.id = a.id), false),
           -- THE MAKER (lane DATA-HOME-2, 2026-09-30): the Table's own created_by, so a list outside the
           -- data home (the agent builder's picker) can run the shell's lanes on the same facts.
           t.created_by
      from admitted a
      join visible vis on vis.org_id = a.id
      join custom.record t
        on t.id = vis.id
       and t.organization_id = a.id
       and t.table_id = v_kernel
       and t.deleted_at is null
      cross join lateral (
        -- custom.table_placement's rule, word for word, with its one Field-graph question answered
        -- from options_ids above instead of per row: kept when the store derives a keeper word, or
        -- the document says kept_by_the_app / kept_for; kept_for = the stored word, else the
        -- derived one, else 'app'.
        select jsonb_build_object(
                 'platform_owned', d.kept, 'kept_by_the_app', d.kept,
                 'kept_for', case when d.kept then coalesce(nullif(btrim(t.data ->> 'kept_for'), ''), d.word, 'app') end) as p
          from (select w.word,
                       (w.word is not null
                        or coalesce(t.data ->> 'kept_by_the_app', '') = 'true'
                        or coalesce(btrim(t.data ->> 'kept_for'), '') <> '') as kept
                  from (select custom.table_kept_for_derived(
                                 t.data, t.data_class = 'kernel',
                                 case when t.data_class = 'kernel' then false
                                      -- PERF-FIX-3: a hashed set lookup (an EXISTS in a select list is a correlated
                                      -- CTE scan per row: 1,781 scans of the CTE, ~0.3 ms each)
                                      else (t.id::text in (select o.id from options_ids o)) end) as word offset 0) w) d offset 0
      ) pl
     -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
     -- default list (custom.table_kept_out_of_lists on its placement word) is listed only when the caller
     -- asks with p_include_platform_tables. Every other Table the app keeps (lists, scopes, forms …) is unchanged.
     -- The switch travels as the transaction-local setting custom.include_platform_tables, which only the
     -- two-argument overload sets (and puts back); unset, the Table stays out.
     where current_setting('custom.include_platform_tables', true) is not distinct from 'on'
        or not custom.table_kept_out_of_lists(pl.p ->> 'kept_for');
end;
$function$
;

drop function custom.data_home_tables(uuid, boolean);

CREATE OR REPLACE FUNCTION custom.data_home_tables(p_organization_id uuid, p_include_platform_tables boolean)
 RETURNS TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone, mine boolean, shared_with_me boolean, platform_owned boolean, kept_by_the_app boolean, kind text, team boolean, system boolean, created_by uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- "SHOW APP TABLES" (lane CHAIR-DOORS-2, v6 N-C8): custom.data_home_tables(uuid) with the one switch. It
-- decides nothing itself — the one-argument door (SECURITY DEFINER, its own walls) answers; this only
-- tells it, through the transaction-local custom.include_platform_tables, whether the Tables the app keeps out
-- of default lists are wanted, and puts the setting back as it found it, on every path.
declare
  v_was text := current_setting('custom.include_platform_tables', true);
begin
  perform set_config('custom.include_platform_tables', case when p_include_platform_tables then 'on' else 'off' end, true);
  return query select * from custom.data_home_tables(p_organization_id);
  perform set_config('custom.include_platform_tables', coalesce(v_was, ''), true);
exception when others then
  perform set_config('custom.include_platform_tables', coalesce(v_was, ''), true);
  raise;
end
$function$
;

drop function custom.table_facts(uuid);

CREATE OR REPLACE FUNCTION custom.table_facts(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_id uuid, visibility text, mine boolean, platform_owned boolean, kept_by_the_app boolean, kept_for text, offered_as_context boolean, keeper_group text, keeper_says text, used_in_kind text, used_in_id uuid, used_in_table_id uuid, foundation boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
  v_org uuid;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29):
  -- the facts of every Table the caller may open in every organization she belongs to, each
  -- organization asked through this same door with its name (its own wall, its own ladder). A
  -- refusing organization (42501) contributes nothing. No permission is changed by this branch.
  if p_organization_id is null then
    if v_me is null then
      return;
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        return query select * from custom.table_facts(v_org);
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
    return;
  end if;

  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_facts');
  -- CHAIR-WORLD-LANE-2: a person admitted only to READ a Public Table of this organization is told that its live
  -- Public Tables are public — and nothing else: not who made them, not what keeps them, no other Table.
  if custom.world_reader_only(p_organization_id) then
    return query
      select r.id, 'public'::text, false, false, false, null::text, false, null::text, null::text, null::text,
             null::uuid, null::uuid, false
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.table_kernel_id()
         and r.deleted_at is null
         and r.published_to_web;
    return;
  end if;
  return query
    with t as (
      select r.id, r.shown_to, r.published_to_web, r.created_by, r.data,
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
           -- CD-LADDER (2026-10-03): the lane word, worked out from Shown to and Published to the web;
           -- the row column T-13 retires is not read.
           case when t.published_to_web then 'public' when t.shown_to = 'only_me' then 'personal' else 'internal' end,
           (v_me is not null and t.created_by = v_me),
           (t.p ->> 'platform_owned')::boolean,
           (t.p ->> 'platform_owned')::boolean,
           t.p ->> 'kept_for',
           (t.p ->> 'offered_as_context')::boolean,
           s.keeper_group,
           s.keeper_says,
           case when not (t.p ->> 'platform_owned')::boolean then null else coalesce(s.used_in_kind, 'table') end,
           case when not (t.p ->> 'platform_owned')::boolean then null else coalesce(s.used_in_id, t.id) end,
           case when not (t.p ->> 'platform_owned')::boolean then null
                else coalesce(s.used_in_table_id, case when coalesce(s.used_in_kind, 'table') = 'table' then coalesce(s.used_in_id, t.id) end) end,
           -- LANE 10 FD: the Foundation mark, for every Table, kept or not.
           (t.p ->> 'foundation')::boolean
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
      left join t wt on kw.word = 'workflow' and wt.id = platform.uuid_or_null(kw.ref)
      -- SCOPES-READS-REST (2026-09-29): the scope a context Table belongs to is a live Record of the store.
      left join lateral (select r.id, r.data ->> 'name' as name
                           from custom.record r
                          where kw.word = 'context' and r.organization_id = p_organization_id
                            and r.id = platform.uuid_or_null(kw.ref) and r.data_class = 'record' and r.deleted_at is null) sc on true
      left join lateral (
        select
          case
            when not (t.p ->> 'platform_owned')::boolean then null
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
            when not (t.p ->> 'platform_owned')::boolean then null
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
              then 'Platform table: ' || case kw.ref
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
            when kw.word = 'app' then 'A platform table.'
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

create or replace view custom."table" with (security_invoker=true) as
SELECT id,
    organization_id,
    COALESCE((data ->> 'slug'::text), lower((data ->> 'name'::text))) AS slug,
    (data ->> 'name'::text) AS name,
    COALESCE((data ->> 'label_singular'::text), (data ->> 'name'::text)) AS label_singular,
    COALESCE((data ->> 'label_plural'::text), custom.plural_of((data ->> 'name'::text))) AS label_plural,
    (data ->> 'icon'::text) AS icon,
    (data ->> 'color'::text) AS color,
    COALESCE((data ->> 'type'::text), 'entity'::text) AS type,
    (COALESCE((data ->> 'type'::text), 'entity'::text) = 'detail'::text) AS detail,
    (data ->> 'parent_token'::text) AS parent_token,
    COALESCE(((data ->> 'agent_writable'::text))::boolean, true) AS agent_writable,
    COALESCE((data ->> 'display'::text), 'list'::text) AS display,
    COALESCE(((data ->> 'ordered'::text))::boolean, false) AS ordered,
    COALESCE((data ->> 'weight'::text), 'light'::text) AS weight,
    COALESCE(((data ->> 'retention_days'::text))::integer, 30) AS retention_days,
    (data ->> 'title_field'::text) AS title_field,
    COALESCE((data -> 'fields'::text), '[]'::jsonb) AS fields,
    COALESCE((data -> 'default_sort'::text), '[]'::jsonb) AS default_sort,
    COALESCE((data ->> 'row_order'::text), 'sorted'::text) AS row_order,
    custom.containment_parent(data) AS home_id,
    (data_class = 'kernel'::text) AS is_kernel,
    created_by,
    updated_by,
    created_at,
    updated_at,
    version,
    metadata,
    visibility,
    data,
    ((custom.table_placement(organization_id, id, data, (data_class = 'kernel'::text)) ->> 'kept_by_the_app'::text))::boolean AS kept_by_the_app,
    (custom.table_placement(organization_id, id, data, (data_class = 'kernel'::text)) ->> 'kept_for'::text) AS kept_for,
    ((custom.table_placement(organization_id, id, data, (data_class = 'kernel'::text)) ->> 'offered_as_context'::text))::boolean AS offered_as_context,
    custom.table_is_foundation(data) AS foundation,
    ((custom.table_placement(organization_id, id, data, (data_class = 'kernel'::text)) ->> 'platform_owned'::text))::boolean AS kept_by_the_app
   FROM custom.record r
  WHERE ((table_id = custom.table_kernel_id()) AND (deleted_at IS NULL));

create or replace function custom.data_home(p_include_app_tables text, p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
begin
  -- OLD NAME, kept until production serves a frontend newer than 5a2250fb28 (tablenames_d)
  return custom.data_home(p_organization_id, p_search, p_include_app_tables::boolean);
end;
$function$;

create or replace function custom.data_home_slim(p_include_app_tables text, p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
begin
  -- OLD NAME, kept until production serves a frontend newer than 5a2250fb28 (tablenames_d)
  return custom.data_home_slim(p_organization_id, p_search, p_include_app_tables::boolean);
end;
$function$;

create or replace function custom.records_search(p_include_app_tables text, p_search text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_table_ids uuid[] DEFAULT NULL::uuid[], p_organization_ids uuid[] DEFAULT NULL::uuid[])
 returns TABLE(record_id uuid, table_id uuid, table_name text, name text, organization_id uuid, updated_at timestamp with time zone)
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
begin
  -- OLD NAME, kept until production serves a frontend newer than 5a2250fb28 (tablenames_d)
  return query select * from custom.records_search(p_search, p_limit, p_offset, p_table_ids, p_organization_ids, p_include_app_tables::boolean);
end;
$function$;

create or replace function custom.table_list_everywhere(p_include_app_tables text, p_organization_id uuid)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
begin
  -- OLD NAME, kept until production serves a frontend newer than 5a2250fb28 (tablenames_d)
  return custom.table_list_everywhere(p_organization_id, p_include_app_tables::boolean);
end;
$function$;

create or replace function custom.data_home_tables(p_organization_id uuid, p_include_app_tables text)
 returns TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone, mine boolean, shared_with_me boolean, platform_owned boolean, kept_by_the_app boolean, kind text, team boolean, system boolean, created_by uuid)
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
begin
  return query select * from custom.data_home_tables(p_organization_id, p_include_app_tables::boolean);
end;
$function$;

notify pgrst, 'reload schema';
