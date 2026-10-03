-- chair-step: the inverse of migrations/campaign/scopesflip_b_the_scope_readers_read_only_the_store.sql: puts back
--   the seven bodies production ran on 2026-10-03 before the flip (each asks the switch and, OFF, reads context.*).
--   Re-base on production's current bodies before running it (CHAIR-GUIDANCE hazard 4).
-- lane: SCOPES-ON-THE-STORE
-- based-on: public.get_scope_tree(uuid, uuid) 4b7f20fe60faebe0d676cab85b33a04d0f1514c844faf1c17d55e3a5b8c99ba3
-- based-on: public.get_scope_trees(uuid[], uuid) db96410d33a718f541ad0aa5776d881a6697dc4aeffc26f82739c8e4ce92f3c4
-- based-on: public.get_scope_context(uuid, uuid[], boolean) dca3eaf94a3ccb5ae50fcc03c3130d93f095d144217f2bd178495a799581106f
-- based-on: public.get_user_full_context(uuid) d4ffbb8de168872b51557c532dfcb5ecbe5729a6959324df0898e66a1bc62564
-- based-on: public.list_scope_type_items(uuid) 0f1f5eec1022ca61377071bca73d702fa8bb617b3b1e0d92363602adc1c60b97
-- based-on: public.list_scope_types(uuid) 548da118207688538f25a7e298f8493d7b4afc993c2128b2e0618c222c8db29d
-- based-on: public.resolve_full_context(uuid, text, uuid, uuid[], text[]) bf02b37fe2694d8f6129d509f6f66b082672393fc74e46b0666815abfec03e1b

CREATE OR REPLACE FUNCTION public.get_scope_tree(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_member boolean;
  v_seen uuid[];
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
  -- STORE-READ-PERF-5: which scopes she sees is custom.seen_among (the "s" of custom.levels_of,
  -- the one ladder's viewer answer, without the rung this reader never read).
  if auth.role() is distinct from 'service_role' then
    v_seen := custom.seen_among(auth.uid(), coalesce((
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
  where v_seen is null or s.id in (select x from unnest(v_seen) x);
  if not v_member and v_result is null then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_scope_trees(p_org_ids uuid[], p_type_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, answer jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- SCOPES-C (lane 9, 2026-10-02): public.get_scope_tree for many organizations, the readable set worked out once.
begin
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return query
      with readable as materialized (select x.id from context._readable_scope_ids() x(id))
      select o.org,
             coalesce((
               select jsonb_agg(
                 to_jsonb(s) || jsonb_build_object(
                   'type_label', st.label_singular,
                   'type_label_plural', st.label_plural,
                   'type_icon', st.icon,
                   'type_color', st.color
                 ) order by st.sort_order, s.sort_order, s.name
               )
               from context.scopes s
               join context.scope_types st on s.scope_type_id = st.id
               where s.organization_id = o.org
                 and s.deleted_at is null and st.deleted_at is null
                 and s.id in (select r.id from readable r)
                 and (p_type_id is null or s.scope_type_id = p_type_id)
             ), '[]'::jsonb)
        from unnest(p_org_ids) with ordinality as o(org, ord)
       where iam.has_org_access(o.org)
       order by o.ord;
    return;
  end if;
  return query
    select o.org, public.get_scope_tree(o.org, p_type_id)
      from unnest(p_org_ids) with ordinality as o(org, ord)
     where iam.has_org_access(o.org)
     order by o.ord;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_scope_context(p_scope_id uuid, p_item_ids uuid[] DEFAULT NULL::uuid[], p_include_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope  custom.record;
  v_result jsonb;
  v_levels jsonb;
  v_cap    bigint;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.get_scope_context_from_the_image(p_scope_id, p_item_ids, p_include_empty);
  end if;
  -- SCOPES-READS-TREE: the scope is a Record of a live scope Table; its values are the Record's.
  select r.* into v_scope
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.id = p_scope_id
     and r.deleted_at is null
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
     and t.data ->> 'kept_for' = 'context';

  if v_scope.id is null then
    return '{}'::jsonb;
  end if;

  -- THE MEMBRANE: the store's own two questions, as custom.read_record asks them — the
  -- organization's wall, then the one ladder.
  if auth.role() is distinct from 'service_role' then
    begin
      perform custom.assert_client_may_reach(v_scope.organization_id, 'public.get_scope_context');
      v_levels := custom.levels_of(auth.uid(), array[p_scope_id]);
    exception when insufficient_privilege or null_value_not_allowed then
      v_levels := '{}'::jsonb;
    end;
    if not coalesce((v_levels -> (p_scope_id::text) ->> 's')::boolean, false) then
      raise exception '%', format('You do not have access to "%s". Ask someone who can already open it to share it with you.',
                                  v_scope.data ->> 'name')
        using errcode = '42501';
    end if;
  end if;

  -- SCOPES-D-LAST (lane 9, 2026-10-02): A TEXT KEPT AS A FILE IS NEVER HANDED AS ITS FIRST WORDS ALONE.
  -- A value over the store's ceiling is a file; the cell holds its first 1000 characters. Each text
  -- cell is the one agent cell (custom._ctx_agent_cell — what custom.resolve_context and
  -- custom.context_resolve hand): the first words with the file NAMED and `whole_value.expand`, so
  -- the store's client (aidream scope_system/context_source.py) hands the whole text; a text still
  -- waiting for its file is answered whole from the waiting row. Every other cell is unchanged.
  v_cap := custom.agent_context_value_cap(v_scope.organization_id);

  select jsonb_agg(x.cell order by x.srt, x.label, x.fid)
    into v_result
    from (
      select f.id as fid, coalesce(nullif(f.data ->> 'sort', '')::int, 0) as srt, f.data ->> 'label' as label,
             case when p_include_empty then
               (i - 'id' - 'status' - 'tags')
               || jsonb_build_object('item_id', f.id,
                    'has_value', v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null')
               || custom.scope_value_columns(v_scope.organization_id, f.data, i ->> 'value_type', coalesce(a.ac -> 'value', v_scope.data -> (f.data ->> 'key')))
               || case when a.ac ? 'whole_value' then jsonb_build_object('whole_value', a.ac -> 'whole_value') else '{}'::jsonb end
               || jsonb_build_object(
                    'version', case when v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null'
                                    then to_jsonb(coalesce(nullif(v_scope.data -> '_values' -> (f.data ->> 'key') ->> 'ver', '')::int, 1)) end,
                    'updated_at', case when v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null'
                                       then v_scope.data -> '_values' -> (f.data ->> 'key') -> 'at' end)
             else
               jsonb_build_object('item_id', f.id, 'key', i -> 'key', 'slug', i -> 'slug', 'display_name', i -> 'display_name',
                                  'value_type', i -> 'value_type', 'custom_component', i -> 'custom_component',
                                  'allowed_reference_types', i -> 'allowed_reference_types', 'max_items', i -> 'max_items',
                                  'allowed_scope_type_ids', i -> 'allowed_scope_type_ids', 'reference_source', i -> 'reference_source')
               || custom.scope_value_columns(v_scope.organization_id, f.data, i ->> 'value_type', coalesce(a.ac -> 'value', v_scope.data -> (f.data ->> 'key')))
               || case when a.ac ? 'whole_value' then jsonb_build_object('whole_value', a.ac -> 'whole_value') else '{}'::jsonb end
             end as cell
        from custom.scope_items_of(v_scope.organization_id, v_scope.table_id) f
        cross join lateral (select custom.scope_item_row_of(f) as i) j
        cross join lateral (select case when jsonb_typeof(v_scope.data -> (f.data ->> 'key')) = 'string'
                                        then custom._ctx_agent_cell(v_scope.data, v_scope.data, f.data ->> 'key',
                                                                    v_scope.organization_id, v_scope.id, v_cap)
                                   end as ac) a
       where (p_item_ids is null or f.id = any (p_item_ids))
         and (p_include_empty
              or (v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null'))
    ) x;

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
    v_seen uuid[];
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
    -- STORE-READ-PERF-5: custom.seen_among is the "s" of custom.levels_of (the one ladder's viewer
    -- answer) without the rung this reader never read.
    v_seen := custom.seen_among(v_uid, (select array_agg((e ->> 'id')::uuid) from jsonb_array_elements(v_scopes) e));

    with
    user_orgs as (
        select o.id, o.name, o.slug, om.role::text as role
        from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    seen as (
        select (e ->> 'o')::uuid as organization_id, (e ->> 'id')::uuid as id, (e ->> 't')::uuid as table_id,
               (e ->> 'ts')::int as type_sort, e ->> 'n' as name, e -> 'td' as td, e -> 'p' as parent_scope_id
          from jsonb_array_elements(v_scopes) e
         where (e ->> 'id')::uuid in (select x from unnest(v_seen) x)
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
            (select count(*) from projects.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from projects.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from projects.projects p where p.organization_id in (select id from user_orgs)
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
        from projects.tasks t left join projects.projects p on t.project_id = p.id
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

CREATE OR REPLACE FUNCTION public.list_scope_type_items(p_scope_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_org_id uuid;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.list_scope_type_items_from_the_image(p_scope_type_id);
  end if;
  -- SCOPES-READS-TREE: the scope type is its Table; its context items are the Table's Fields.
  select t.organization_id
  into v_org_id
  from custom.record t
  where t.id = p_scope_type_id
    and t.table_id = custom.table_kernel_id()
    and t.deleted_at is null
    and t.data ->> 'kept_for' = 'context';

  if v_org_id is null then
    perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', v_org_id)::text;
  end if;

  select jsonb_agg(custom.scope_item_row_of(f)
    order by coalesce(nullif(f.data ->> 'sort', '')::int, 0), f.data ->> 'label', f.id)
  into v_result
  from custom.scope_items_of(v_org_id, p_scope_type_id) f;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_scope_types(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.list_scope_types_from_the_image(p_org_id);
  end if;
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  -- SCOPES-READS-TREE: every live scope Table of the organization (kept_for = context), as the old
  -- scope type row; scope_count counts its live Records, as it counted live scopes.
  select jsonb_agg(
    custom.scope_type_row_of(t) || jsonb_build_object(
      'parent_type_label', null,
      'scope_count', (select count(*) from custom.record r
                       where r.organization_id = t.organization_id and r.table_id = t.id and r.deleted_at is null)
    ) order by coalesce(nullif(t.data ->> 'sort_order', '')::int, 0), t.data ->> 'label_singular', t.id
  ) into v_result
  from custom.record t
  where t.organization_id = p_org_id
    and t.table_id = custom.table_kernel_id()
    and t.deleted_at is null
    and t.data ->> 'kept_for' = 'context';
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_full_context(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[] DEFAULT NULL::uuid[], p_system_item_refs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- SCOPES-READS-TREE (plan step 2.1): the agent hand-off is the record store's. This is a wrapper
-- over custom.resolve_context, asked as the person it names exactly as aidream's context path asks
-- it (claims {sub, role: authenticated}, the selection as records, no active Table), so every
-- server caller — the old path of build_agent_context, the preview, the inspector — reads what the
-- agents read. Every contributing scope is checked for that person (SC-3'); what is refused is
-- named in `checks`. The old body is kept in this file's inverse (for the golden hand-off, step 4.2).
declare
  v_was text := current_setting('request.jwt.claims', true);
  v_out jsonb;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.resolve_full_context_from_the_image(p_user_id, p_entity_type, p_entity_id, p_scope_ids, p_system_item_refs);
  end if;
  if p_user_id is null then
    raise exception 'public.resolve_full_context resolves context for a person, and none was named.'
      using errcode = '42501',
            hint = 'Pass the id of the person operating the agent.';
  end if;
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  begin
    v_out := custom.resolve_context(p_entity_type, p_entity_id, p_scope_ids, '{}'::uuid[], p_system_item_refs);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_was, ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(v_was, ''), true);
  return v_out;
end;
$function$;
