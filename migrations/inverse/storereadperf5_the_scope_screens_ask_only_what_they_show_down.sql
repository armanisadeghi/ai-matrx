-- chair-step: inverse of storereadperf5_the_scope_screens_ask_only_what_they_show.sql — restores the four bodies it replaced verbatim (custom.query_visible_ids, public.get_scope_tree, public.get_user_full_context, custom.context_archived_types), the door row sentence it rewrote, and drops the two helpers it created with their door row. No table, index, policy or data row is touched.
-- lane: STORE-READ-PERF-5
-- based-on: custom.query_visible_ids(uuid, uuid, text) NEW_QVI
-- based-on: public.get_scope_tree(uuid, uuid) NEW_GST
-- based-on: public.get_user_full_context(uuid) NEW_GUF
-- based-on: custom.context_archived_types(uuid) NEW_ARCH

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.query_visible_ids(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_required text DEFAULT 'viewer'::text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user uuid := custom.query_principal();
  v_set  record;
  v_tbl  uuid;
  -- Access ladder T-36: "Shown to" is the list filter ("Only me" hides, never locks). One context
  -- per statement; platform.shown_to_lists decides each row exactly as every other list door does.
  v_ctx  jsonb;
  -- STORE-READ-PERF-4: the Table-kernel answer for every organization of this statement at once.
  v_snap  text;
  v_m     text;
  v_orgs  uuid[];
  v_o     uuid;
  v_sets  jsonb := '[]'::jsonb;
  v_one   record;
begin
  -- The organization wall, before any row is fetched, because this is now a door a
  -- signed-in person may execute directly.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_visible_ids');

  -- A connection with no principal at all is the campaign's own maintenance and is judged by
  -- the ROLE instead, exactly as `custom.query_access_ids` judged it. Unchanged.
  if v_user is null then
    if custom.query_is_store_owner() then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and (p_table_id is null or r.table_id = p_table_id)
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true';
    end if;
    return;
  end if;
  -- STORE-READ-PERF-4 (2026-09-29): THE TABLE LIST, ANSWERED FOR EVERY ORGANIZATION OF THE STATEMENT
  -- AT ONCE. A door that walks many organizations (the data home, the scope tree) first asks
  -- custom.tables_seen_once_per_group for all of them, which names them in this statement's memo.
  -- The first of its per-organization calls here then works out THIS function's own answer — the
  -- same custom.visible_set per organization, the same filters, the same branches, word for word
  -- below — for every one of those organizations in one pass, and leaves each in the memo; the
  -- rest read theirs. Only at viewer, only on the Table kernel, only while the transaction has
  -- written nothing, and never for an organization at one of visible_set's stops (it walks here
  -- as always). Each organization is still decided in its own call, by the wall above, before its
  -- answer is read.
  if p_table_id = custom.table_kernel_id() and p_required = 'viewer'
     and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_snap := pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get('custom.qvi_kernel:' || v_user::text || ':' || p_organization_id::text || ':' || v_snap);
    if v_m is not null then
      return query select x::uuid from unnest(string_to_array(nullif(v_m, ''), ',')) x;
      return;
    end if;
    v_orgs := string_to_array(nullif(platform.memo_k_get('custom.tables_seen_orgs:' || v_user::text || ':' || v_snap), ''), ',')::uuid[];
    -- (an organization at one of visible_set's stops walks on its own, below, without a batch)
    if p_organization_id = any (coalesce(v_orgs, '{}'::uuid[]))
       and not (custom.visible_set(v_user, p_organization_id, custom.table_kernel_id(),
                                   'viewer'::public.permission_level)).o_fallback then
      v_ctx := platform.shown_to_context('record');
      foreach v_o in array v_orgs loop
        v_set := custom.visible_set(v_user, v_o, custom.table_kernel_id(), 'viewer'::public.permission_level);
        continue when v_set.o_fallback;
        v_sets := v_sets || jsonb_build_object('org', v_o, 'all', v_set.o_all_visible,
                    'tv', coalesce(to_jsonb(v_set.o_true_visibility), '[]'::jsonb),
                    'ga', coalesce(to_jsonb(v_set.o_granted_all), '[]'::jsonb),
                    'gv', coalesce(to_jsonb(v_set.o_granted_visible), '[]'::jsonb),
                    'cv', coalesce(to_jsonb(v_set.o_carried_visible), '[]'::jsonb));
      end loop;
      if exists (select 1 from jsonb_array_elements(v_sets) e where (e ->> 'org')::uuid = p_organization_id) then
        for v_one in
          with sets as materialized (
            select (e ->> 'org')::uuid as org, (e ->> 'all')::boolean as all_v,
                   array(select jsonb_array_elements_text(e -> 'tv'))::platform.visibility[] as tv,
                   array(select jsonb_array_elements_text(e -> 'ga'))::uuid[] as ga,
                   array(select jsonb_array_elements_text(e -> 'gv'))::uuid[] as gv,
                   array(select jsonb_array_elements_text(e -> 'cv'))::uuid[] as cv
              from jsonb_array_elements(v_sets) e
          )
          select s.org,
                 coalesce((select string_agg(r.id::text, ',')
                             from custom.record r
                            where r.organization_id = s.org
                              and r.table_id = custom.table_kernel_id()
                              and r.deleted_at is null
                              and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
                              and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
                              and case
                                    when s.all_v then true
                                    when coalesce(array_length(s.tv, 1), 0) > 0 then
                                      ( r.created_by = v_user
                                     or (r.visibility = any (s.tv) and not (r.id = any (s.ga)))
                                     or r.id = any (s.gv)
                                     or r.id = any (s.cv) )
                                    else
                                      ( r.created_by = v_user
                                     or r.id = any (s.gv)
                                     or r.id = any (s.cv) )
                                  end), '') as ids
            from sets s
        loop
          perform platform.memo_k_put('custom.qvi_kernel:' || v_user::text || ':' || v_one.org::text || ':' || v_snap, v_one.ids);
          if v_one.org = p_organization_id then
            v_m := v_one.ids;
          end if;
        end loop;
        return query select x::uuid from unnest(string_to_array(nullif(v_m, ''), ',')) x;
        return;
      end if;
    end if;
  end if;

  v_ctx := platform.shown_to_context('record');

  for v_tbl in
    select distinct r.table_id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.deleted_at is null
       and (p_table_id is null or r.table_id = p_table_id)
  loop
    v_set := custom.visible_set(v_user, p_organization_id, v_tbl,
                                p_required::public.permission_level);

    if v_set.o_fallback then
      raise notice '%', v_set.o_note;
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           -- DOOR-17: a quarantined submission is invisible to every read until a Rule clears it.
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
           -- THE ONE LADDER, per row, exactly as before this file.
           and custom.has_visibility(v_user, 'record', r.id, p_required::public.permission_level);

    elsif v_set.o_all_visible then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx);

    elsif coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
           and ( r.created_by = v_user
              or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
              or r.id = any (v_set.o_granted_visible)
              or r.id = any (v_set.o_carried_visible) );

    else
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
           and ( r.created_by = v_user
              or r.id = any (v_set.o_granted_visible)
              or r.id = any (v_set.o_carried_visible) );
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_scope_tree(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_member boolean;
  v_levels jsonb;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.get_scope_tree_from_the_image(p_org_id, p_type_id);
  end if;
  -- SCOPES-READS-TREE: read from the record store. WHO SEES WHAT is the store's own two
  -- questions, asked exactly as custom.read_record and custom.resolve_context ask them: the
  -- organization's wall (custom.assert_client_may_reach — a member, or somebody the organization
  -- admits from outside: a portal principal, a class member), then the one ladder
  -- (custom.levels_of) for every scope before any is named. DD-112 / CUT-30: plain membership no
  -- longer gates the list ahead of the ladder — whoever the store admits from outside is listed
  -- what was shared with her; an archived organization and a stranger are refused as before.
  v_member := auth.role() = 'service_role';
  if not v_member then
    begin
      perform custom.assert_client_may_reach(p_org_id, 'public.get_scope_tree');
    exception when insufficient_privilege or null_value_not_allowed then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', p_org_id)::text;
    end;
    v_member := (iam.has_org_access(p_org_id)) is true;
  end if;
  if auth.role() is distinct from 'service_role' then
    v_levels := custom.levels_of(auth.uid(), coalesce((
      select array_agg(r.id)
        from custom.record t
        join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null
       where t.organization_id = p_org_id and t.table_id = custom.table_kernel_id() and t.deleted_at is null
         and t.data ->> 'kept_for' = 'context' and (p_type_id is null or t.id = p_type_id)), '{}'::uuid[]));
  end if;
  select jsonb_agg(
    s.row_doc || jsonb_build_object(
      'type_label', s.type_doc -> 'label_singular',
      'type_label_plural', s.type_doc -> 'label_plural',
      'type_icon', coalesce(s.type_doc -> 'icon', 'null'::jsonb),
      'type_color', coalesce(s.type_doc -> 'color', 'null'::jsonb)
    ) order by s.type_sort, s.sort_order, s.name, s.id
  ) into v_result
  from custom.scope_rows_of(p_org_id, case when p_type_id is null then null else array[p_type_id] end) s
  where v_levels is null or coalesce((v_levels -> (s.id::text) ->> 's')::boolean, false);
  if not v_member and v_result is null then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_full_context(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_uid uuid;
    v_result jsonb; v_real_rows jsonb;
    -- rca5d_e: the kernel's SET form, asked once per token, when the caller answers for herself
    -- (the normal case). A per-row kernel call on every task/project of every organization
    -- took 75 s for a 142-organization account (rca5d_c). Another person's context (service role,
    -- admin lane) keeps the per-row kernel call for that person.
    v_self boolean;
    v_project_ids uuid[]; v_task_ids uuid[];
    -- SCOPES-READS-TREE: scopes, scope types and a project's scope tags are read from the record
    -- store; which scopes the person sees is the store's one ladder, asked once for the set.
    v_scopes jsonb;
    v_levels jsonb;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.get_user_full_context_from_the_image(p_user_id);
  end if;
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
    -- 🚨 DD-192: the same defect as get_user_nav_tree, one layer deeper — this one
    -- also hands back the target's scope types, scopes and context items.
    if not (auth.role() = 'service_role' or v_uid = ( SELECT auth.uid()) or public.is_platform_admin()) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    v_self := v_uid is not distinct from (select auth.uid());
    if v_self then
      v_project_ids := iam.accessible_entity_ids('project', 'viewer'::public.permission_level);
      v_task_ids    := iam.accessible_entity_ids('task', 'viewer'::public.permission_level);
    end if;

    -- Only what this answer names (id, name, Table, parent), read straight from the Records of the
    -- person's organizations' live scope Tables, and only in organizations whose wall she passes.
    select coalesce(jsonb_agg(jsonb_build_object('o', r.organization_id, 'id', r.id, 't', r.table_id,
                                                  'ts', coalesce(nullif(t.data ->> 'sort_order', '')::int, 0),
                                                  'n', r.data ->> 'name', 'td', t.data - 'fields',
                                                  'p', coalesce(to_jsonb(nullif(r.data ->> 'parent_id', '')), 'null'::jsonb))), '[]'::jsonb)
      into v_scopes
      from iam.organization_member om
      join custom.record t on t.organization_id = om.organization_id
                          and t.table_id = custom.table_kernel_id()
                          and t.deleted_at is null
                          and t.data ->> 'kept_for' = 'context'
      join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null
     where om.user_id = v_uid
       and iam.has_org_access_for(v_uid, om.organization_id);
    v_levels := custom.levels_of(v_uid, (select array_agg((e ->> 'id')::uuid) from jsonb_array_elements(v_scopes) e));

    with
    user_orgs as (
        select o.id, o.name, o.slug, om.role::text as role
        from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    seen as (
        select (e ->> 'o')::uuid as organization_id, (e ->> 'id')::uuid as id, (e ->> 't')::uuid as table_id,
               (e ->> 'ts')::int as type_sort, e ->> 'n' as name, e -> 'td' as td, e -> 'p' as parent_scope_id
          from jsonb_array_elements(v_scopes) e
         where coalesce((v_levels -> (e ->> 'id') ->> 's')::boolean, false)
    ),
    org_scope_types as (
        select t.organization_id,
            jsonb_agg(jsonb_build_object('id',t.id,'label_singular',t.data -> 'label_singular','label_plural',t.data -> 'label_plural',
                                         'icon',coalesce(t.data -> 'icon','null'::jsonb),'color',coalesce(t.data -> 'color','null'::jsonb),
                                         'sort_order',coalesce(nullif(t.data ->> 'sort_order','')::int,0),'parent_type_id',null,
                                         'max_assignments_per_entity',coalesce(t.data -> 'max_assignments_per_entity','null'::jsonb))
                      order by coalesce(nullif(t.data ->> 'sort_order','')::int,0), t.data ->> 'label_singular', t.id) as types
        from custom.record t
        where t.organization_id in (select id from user_orgs) and t.table_id = custom.table_kernel_id()
          and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
        group by t.organization_id
    ),
    org_scopes as (
        select s.organization_id,
            jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'scope_type_id',s.table_id,'parent_scope_id',s.parent_scope_id,
                                         'type_label',s.td -> 'label_singular','type_icon',coalesce(s.td -> 'icon','null'::jsonb),
                                         'type_color',coalesce(s.td -> 'color','null'::jsonb))
                      order by s.type_sort, s.name, s.id) as scopes
        from seen s group by s.organization_id
    ),
    org_projects as (
        select p.id, p.name, p.slug, p.organization_id,
            coalesce((select jsonb_agg(jsonb_build_object('scope_id',sc.id,'scope_name',sc.name,'type_label',sc.td -> 'label_singular',
                                                          'type_icon',coalesce(sc.td -> 'icon','null'::jsonb),'type_color',coalesce(sc.td -> 'color','null'::jsonb))
                                       order by sc.type_sort, sc.id)
                from (select distinct sa.target_id from platform.associations_live sa
                       where sa.target_type in ('scope', 'record', 'custom_record') and sa.source_type = 'project' and sa.source_id = p.id) tag
                join seen sc on sc.id = tag.target_id), '[]'::jsonb) as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p where p.organization_id in (select id from user_orgs)
          -- RC-A5d (rca5d_c): only projects (and, below, tasks and scopes) this person may open;
          -- a member read the names and task titles of projects they could not open here.
          and (case when v_self then p.id = any(v_project_ids) else iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level) end)
    ),
    all_tasks as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule,
            case
                when p.id is not null and p.organization_id is not null then p.organization_id
                else t.organization_id
            end as organization_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (t.created_by=v_uid or t.assignee_id=v_uid
               or ((t.project_id in (select id from org_projects))
                   and (case when v_self then t.id = any(v_task_ids) else iam.has_access_for(v_uid, 'task', t.id, 'viewer'::public.permission_level) end)))
    )
    select coalesce(jsonb_agg(real_org_obj order by uo_name asc), '[]'::jsonb) into v_real_rows
    from (
        select uo.name as uo_name,
            jsonb_build_object('id',uo.id,'name',uo.name,'slug',uo.slug,'role',uo.role,
                'scope_types',coalesce(ost.types,'[]'::jsonb),'scopes',coalesce(os.scopes,'[]'::jsonb),
                'projects',coalesce((select jsonb_agg(jsonb_build_object('id',op.id,'name',op.name,'slug',op.slug,'scope_tags',op.scope_tags,'open_task_count',op.open_task_count,'total_task_count',op.total_task_count) order by op.name) from org_projects op where op.organization_id=uo.id),'[]'::jsonb),
                'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'title',at.title,'status',at.status,'priority',at.priority,'project_id',at.project_id,'parent_task_id',at.parent_task_id,'due_date',at.due_date,'assignee_id',at.assignee_id,'created_by',at.created_by,'origin',at.origin,'source_type',at.source_type,'source_url',at.source_url,'source_label',at.source_label,'start_date',at.start_date,'completed_at',at.completed_at,'updated_at',at.updated_at,'recurrence_rule',at.recurrence_rule) order by case at.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, at.due_date nulls last) from all_tasks at where at.organization_id=uo.id),'[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo left join org_scope_types ost on ost.organization_id=uo.id left join org_scopes os on os.organization_id=uo.id
    ) sub;
    select jsonb_build_object('organizations', v_real_rows) into v_result;
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_archived_types(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_out    jsonb := '[]'::jsonb;
  v_off    int := 0;
  v_page   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.context_archived_types');
  if v_me is null then
    return v_out;
  end if;
  -- The archived Tables come through the store's own archive door (the ladder, the mask, both
  -- lanes of the archive); of those, the ones the context system kept. Each carries how many of its
  -- scopes were archived, which is what a restore brings back.
  loop
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'document', a.document, 'archived_at', a.archived_at)), '[]'::jsonb)
      into v_page
      from custom.read_records_archived(p_organization_id, v_tables, 'org', false, 200, v_off) a;
    v_out := v_out || coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', (p ->> 'id')::uuid, 'organization_id', p_organization_id,
               'label_singular', p -> 'document' -> 'label_singular', 'label_plural', p -> 'document' -> 'label_plural',
               'icon', p -> 'document' -> 'icon', 'color', p -> 'document' -> 'color',
               'deleted_at', p -> 'archived_at',
               'archived_scope_count', (select count(*) from custom.record r
                                         where r.organization_id = p_organization_id
                                           and r.table_id = (p ->> 'id')::uuid and r.deleted_at is not null)))
        from jsonb_array_elements(v_page) p
       where p -> 'document' ->> 'kept_for' = 'context'), '[]'::jsonb);
    exit when jsonb_array_length(v_page) < 200;
    v_off := v_off + 200;
  end loop;
  return (select coalesce(jsonb_agg(x order by x ->> 'deleted_at' desc), '[]'::jsonb) from jsonb_array_elements(v_out) x);
end;
$function$;

update platform.client_callable_door
   set reason = 'The archived scope types of one organization: decided through custom.assert_client_may_reach in this door''s name; the archived Tables come through custom.read_records_archived (the ladder, the mask), of which the ones the context system kept, each with how many of its scopes are archived. It writes nothing.'
 where schema_name = 'custom' and function_name = 'context_archived_types' and identity_args = 'p_organization_id uuid';

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'seen_among' and identity_args = 'p_user_id uuid, p_ids uuid[]';
drop function custom.seen_among(uuid, uuid[]);
drop function custom._record_shown_to_ctx(uuid[], uuid);
