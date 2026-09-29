-- ── THE COMPARE ─────────────────────────────────────────────────────────────────────────────────
create temp table l8_mismatch (fn text, seat text, arg text, old_answer jsonb, new_answer jsonb) on commit drop;
create temp table l8_count (fn text, n int) on commit drop;
grant all on l8_mismatch, l8_count to authenticated;

create or replace function pg_temp.l8_seat(p_uid uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if p_uid is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    execute 'set local role authenticated';
  else
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
  end if;
end $f$;
grant execute on function pg_temp.l8_seat(uuid) to authenticated;

create or replace function pg_temp.l8_try(p_sql text) returns jsonb language plpgsql as $f$
declare v jsonb;
begin
  execute p_sql into v;
  return coalesce(v, 'null'::jsonb);
exception when others then
  return jsonb_build_object('error', sqlstate, 'message',
    regexp_replace(regexp_replace(sqlerrm, 'pg_temp(_[0-9]+)?\.', '', 'g'), 'l8o_', '', 'g'));
end $f$;
grant execute on function pg_temp.l8_try(text) to authenticated;

-- The older owner list orders scopes by name alone, so two scopes of one name come in whatever
-- order the scan met them (no contract); both answers are compared with ties ordered by id.
create or replace function pg_temp.l8_norm(p jsonb) returns jsonb language sql immutable as $f$
  select case when jsonb_typeof(p) = 'object' and p ? 'scopes' then
    p || jsonb_build_object(
      'scopes', coalesce((select jsonb_agg(e order by e ->> 'name', e ->> 'owner_id') from jsonb_array_elements(p -> 'scopes') e), '[]'::jsonb),
      'scope_types', coalesce((select jsonb_agg(e order by e ->> 'name', e ->> 'owner_id') from jsonb_array_elements(p -> 'scope_types') e), '[]'::jsonb))
  else p end
$f$;
create or replace function pg_temp.l8_cmp(p_fn text, p_seat uuid, p_arg text, p_old text, p_new text) returns void language plpgsql as $f$
declare o jsonb; n jsonb;
begin
  -- A SECURITY DEFINER body runs as its owner whoever calls it: the seat is the signed-in person's
  -- claims alone (auth.uid()), without taking the client role — the harness's own copies of the older
  -- definer bodies hold no client grant (the definer grant guard sweeps it), and nothing else differs.
  if p_fn in ('get_user_dashboard_metrics', 'create_tasks_bulk(scope check)', 'table_facts', 'kg_caller_can_target_scope') then
    execute 'reset role';
    perform set_config('request.jwt.claims', case when p_seat is null then '' else json_build_object('sub', p_seat, 'role', 'authenticated')::text end, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_seat::text, ''), true);
  else
    perform pg_temp.l8_seat(p_seat);
  end if;
  o := pg_temp.l8_try(p_old);
  n := pg_temp.l8_try(p_new);
  if p_fn = 'dict_list_owners_for' then o := pg_temp.l8_norm(o); n := pg_temp.l8_norm(n); end if;
  execute 'reset role';
  insert into l8_count values (p_fn, 1);
  if o is distinct from n then
    insert into l8_mismatch values (p_fn, coalesce(p_seat::text, 'server'), p_arg, o, n);
  end if;
end $f$;

do $g$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = pg_my_temp_schema() loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop; end $g$;
do $cmp$
declare
  u record; o record; x record; s record;
  v_seats uuid[];
begin
  -- every member of every organization that has a scope type, the non-admin test seat, and the server
  select array_agg(distinct om.user_id) into v_seats
    from iam.organization_member om
   where om.organization_id in (select t.organization_id from custom.record t
                                 where t.data_class = 'table' and t.data ->> 'kept_for' = 'context');
  v_seats := v_seats || '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid;

  for u in select unnest(v_seats) as id loop
    -- dictionary, as the person (direct call: the older body under row security)
    perform pg_temp.l8_cmp('dict_list_owners_for', u.id, '',
      format('select pg_temp.l8o_dict_list_owners_for(%L)', u.id), format('select public.dict_list_owners_for(%L)', u.id));
    perform pg_temp.l8_cmp('dict_resolve_for(all)', u.id, '',
      format('select pg_temp.l8o_dict_resolve_for(%L, true, true)', u.id), format('select public.dict_resolve_for(%L, true, true)', u.id));
    perform pg_temp.l8_cmp('dict_rollup_for(user)', u.id, '',
      format('select pg_temp.l8o_dict_rollup_for(''user'', %L)', u.id), format('select public.dict_rollup_for(''user'', %L)', u.id));
    perform pg_temp.l8_cmp('get_user_dashboard_metrics', u.id, '',
      'select pg_temp.l8o_get_user_dashboard_metrics()', 'select public.get_user_dashboard_metrics()');
    perform pg_temp.l8_cmp('_trash_kind_rows(personal)', null, u.id::text,
      format('select jsonb_agg(to_jsonb(x)) from pg_temp.l8o__trash_kind_rows(%L, null, null, array[''scope_type'',''scope'',''context_item''], 1000, 0) x', u.id),
      format('select jsonb_agg(to_jsonb(x)) from public._trash_kind_rows(%L, null, null, array[''scope_type'',''scope'',''context_item''], 1000, 0) x', u.id));
    perform pg_temp.l8_cmp('_trash_kind_counts(personal)', null, u.id::text,
      format('select jsonb_agg(to_jsonb(x) order by x.artifact_kind) from pg_temp.l8o__trash_kind_counts(%L, null, null) x where x.artifact_kind in (''scope_type'',''scope'',''context_item'')', u.id),
      format('select jsonb_agg(to_jsonb(x) order by x.artifact_kind) from public._trash_kind_counts(%L, null, null) x where x.artifact_kind in (''scope_type'',''scope'',''context_item'')', u.id));
    -- the five views, as the person: every row, by id
    perform pg_temp.l8_cmp('v_scope_suggestions', u.id, '',
      'select jsonb_agg(to_jsonb(v) order by v.id, v.stage) from public.v_scope_suggestions v',
      'select jsonb_agg(to_jsonb(v) order by v.id, v.stage) from public.v_scope_suggestions_from_store v');
    perform pg_temp.l8_cmp('v_scope_suggestions_new', u.id, '',
      'select jsonb_agg(to_jsonb(v) order by v.id) from public.v_scope_suggestions_new v',
      'select jsonb_agg(to_jsonb(v) order by v.id) from public.v_scope_suggestions_new_from_store v');
    perform pg_temp.l8_cmp('v_context_item_suggestions', u.id, '',
      'select jsonb_agg(to_jsonb(v) order by v.id) from public.v_context_item_suggestions v',
      'select jsonb_agg(to_jsonb(v) order by v.id) from public.v_context_item_suggestions_from_store v');
    perform pg_temp.l8_cmp('v_kg_alerts', u.id, '',
      'select jsonb_agg(to_jsonb(v) order by v.id) from public.v_kg_alerts v',
      'select jsonb_agg(to_jsonb(v) order by v.id) from public.v_kg_alerts_from_store v');
    perform pg_temp.l8_cmp('v_kg_value_matches', u.id, '',
      'select jsonb_agg(to_jsonb(v) order by v.id) from public.v_kg_value_matches v',
      'select jsonb_agg(to_jsonb(v) order by v.id) from public.v_kg_value_matches_from_store v');
  end loop;

  -- the server's seat for the views (service_role bypasses row security; the owner stands in)
  perform pg_temp.l8_cmp('v_scope_suggestions', null, '',
    'select jsonb_agg(to_jsonb(v) order by v.id, v.stage) from public.v_scope_suggestions v',
    'select jsonb_agg(to_jsonb(v) order by v.id, v.stage) from public.v_scope_suggestions_from_store v');
  perform pg_temp.l8_cmp('v_kg_value_matches', null, '',
    'select jsonb_agg(to_jsonb(v) order by v.id) from public.v_kg_value_matches v',
    'select jsonb_agg(to_jsonb(v) order by v.id) from public.v_kg_value_matches_from_store v');

  -- per organization with a scope type: the organization's rollup (server), its Trash (as an owner or
  -- admin of it), its table facts (as a member)
  for o in
    select t.organization_id as id,
           (select om.user_id from iam.organization_member om
             where om.organization_id = t.organization_id order by (om.role::text not in ('owner','admin')), om.user_id limit 1) as seat
      from custom.record t
     where t.data_class = 'table' and t.data ->> 'kept_for' = 'context'
     group by t.organization_id
  loop
    perform pg_temp.l8_cmp('dict_rollup_for(organization)', null, o.id::text,
      format('select pg_temp.l8o_dict_rollup_for(''organization'', %L)', o.id), format('select public.dict_rollup_for(''organization'', %L)', o.id));
    perform pg_temp.l8_cmp('_trash_kind_rows(organization)', null, o.id::text,
      format('select jsonb_agg(to_jsonb(x)) from pg_temp.l8o__trash_kind_rows(%L, %L, null, array[''scope_type'',''scope'',''context_item''], 1000, 0) x', o.seat, o.id),
      format('select jsonb_agg(to_jsonb(x)) from public._trash_kind_rows(%L, %L, null, array[''scope_type'',''scope'',''context_item''], 1000, 0) x', o.seat, o.id));
    perform pg_temp.l8_cmp('_trash_kind_counts(organization)', null, o.id::text,
      format('select jsonb_agg(to_jsonb(x) order by x.artifact_kind) from pg_temp.l8o__trash_kind_counts(%L, %L, null) x where x.artifact_kind in (''scope_type'',''scope'',''context_item'')', o.seat, o.id),
      format('select jsonb_agg(to_jsonb(x) order by x.artifact_kind) from public._trash_kind_counts(%L, %L, null) x where x.artifact_kind in (''scope_type'',''scope'',''context_item'')', o.seat, o.id));
    if o.seat is not null then
      perform pg_temp.l8_cmp('table_facts', o.seat, o.id::text,
        format('select jsonb_agg(to_jsonb(x) order by x.table_id) from pg_temp.l8o_table_facts(%L) x', o.id),
        format('select jsonb_agg(to_jsonb(x) order by x.table_id) from custom.table_facts(%L) x', o.id));
    end if;
  end loop;

  -- every scope type and scope, by id: its organization (the server's seat, and a member's) and whether
  -- a knowledge-graph write may target it (a member, a non-member); where its id opens (a member)
  for s in
    select 'scope_type' as lvl, t.id, t.organization_id,
           (select om.user_id from iam.organization_member om where om.organization_id = t.organization_id order by om.user_id limit 1) as seat
      from custom.record t where t.data_class = 'table' and t.data ->> 'kept_for' = 'context'
    union all
    select 'scope', r.id, r.organization_id,
           (select om.user_id from iam.organization_member om where om.organization_id = r.organization_id order by om.user_id limit 1)
      from custom.record r join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
       and t.data_class = 'table' and t.data ->> 'kept_for' = 'context'
     where r.data_class = 'record'
       and (r.organization_id in (select id from iam.organizations where name in ('Castellano & Reyes, LLP','Harbor Dental Group','Cedar Ridge Physical Therapy','Titanium','admin''s Workspace'))
            or r.deleted_at is not null or random() < 0.05)
  loop
    perform pg_temp.l8_cmp('dict_owner_org', null, s.lvl || ' ' || s.id,
      format('select to_jsonb(pg_temp.l8o_dict_owner_org(%L, %L))', s.lvl, s.id), format('select to_jsonb(public.dict_owner_org(%L, %L))', s.lvl, s.id));
    perform pg_temp.l8_cmp('dict_owner_org', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', s.lvl || ' ' || s.id,
      format('select to_jsonb(pg_temp.l8o_dict_owner_org(%L, %L))', s.lvl, s.id), format('select to_jsonb(public.dict_owner_org(%L, %L))', s.lvl, s.id));
    if s.seat is not null then
      perform pg_temp.l8_cmp('dict_owner_org', s.seat, s.lvl || ' ' || s.id,
        format('select to_jsonb(pg_temp.l8o_dict_owner_org(%L, %L))', s.lvl, s.id), format('select to_jsonb(public.dict_owner_org(%L, %L))', s.lvl, s.id));
      perform pg_temp.l8_cmp('platform.resolve_id', s.seat, s.id::text,
        format('select pg_temp.l8o_resolve_id(%L)', s.id), format('select platform.resolve_id(%L)', s.id));
    end if;
    if s.lvl = 'scope' then
      perform pg_temp.l8_cmp('kg_caller_can_target_scope', s.seat, s.id::text,
        format('select to_jsonb(pg_temp.l8o_kg_caller_can_target_scope(%L))', s.id), format('select to_jsonb(public.kg_caller_can_target_scope(%L))', s.id));
      perform pg_temp.l8_cmp('kg_caller_can_target_scope', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', s.id::text,
        format('select to_jsonb(pg_temp.l8o_kg_caller_can_target_scope(%L))', s.id), format('select to_jsonb(public.kg_caller_can_target_scope(%L))', s.id));
      -- create_tasks_bulk's scope check, with no task to write (nothing is inserted either way)
      if s.seat is not null then
        perform pg_temp.l8_cmp('create_tasks_bulk(scope check)', s.seat, s.id::text,
          format('select pg_temp.l8o_create_tasks_bulk(''[]''::jsonb, null, null, array[%L]::uuid[])', s.id),
          format('select public.create_tasks_bulk(''[]''::jsonb, null, null, array[%L]::uuid[])', s.id));
      end if;
      perform pg_temp.l8_cmp('create_tasks_bulk(scope check)', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', s.id::text,
        format('select pg_temp.l8o_create_tasks_bulk(''[]''::jsonb, null, null, array[%L]::uuid[])', s.id),
        format('select public.create_tasks_bulk(''[]''::jsonb, null, null, array[%L]::uuid[])', s.id));
    end if;
  end loop;

  -- every context item's id opens where it did (a member)
  for s in
    select f.id, (select om.user_id from iam.organization_member om where om.organization_id = f.organization_id order by om.user_id limit 1) as seat
      from custom.record f join custom.record t on t.organization_id = f.organization_id and t.data_class = 'table'
       and t.data ->> 'kept_for' = 'context' and t.id::text = f.data ->> 'entity_definition_id'
     where f.data_class = 'field'
  loop
    continue when s.seat is null;
    perform pg_temp.l8_cmp('platform.resolve_id', s.seat, s.id::text,
      format('select pg_temp.l8o_resolve_id(%L)', s.id), format('select platform.resolve_id(%L)', s.id));
  end loop;

  -- every item filed under a Tag: the search index's filed-tag words
  for x in select distinct a.source_type, a.source_id from platform.associations a
            where a.target_type = 'scope' and a.deleted_at is null loop
    perform pg_temp.l8_cmp('platform._search_item_filed_tags', null, x.source_type || ' ' || x.source_id,
      format('select to_jsonb(pg_temp.l8o__search_item_filed_tags(%L, %L))', x.source_type, x.source_id),
      format('select to_jsonb(platform._search_item_filed_tags(%L, %L))', x.source_type, x.source_id));
  end loop;

  -- every relation value of every record: what the agent is handed for it
  for x in
    select r.organization_id, r.id, f.data ->> 'key' as key, f.data ->> 'type' as type, r.data
      from custom.record f
      join custom.record r on r.organization_id = f.organization_id and r.table_id = (f.data ->> 'entity_definition_id')::uuid
       and r.data_class = 'record' and r.deleted_at is null
     where f.data_class = 'field' and f.deleted_at is null and f.data ->> 'type' in ('relation', 'entity_reference')
       and r.data ? (f.data ->> 'key')
     limit 20000
  loop
    perform pg_temp.l8_cmp('custom.agent_context_value', null, x.id || ' ' || x.key,
      format('select pg_temp.l8o_agent_context_value(%L::jsonb, %L, %L, %L, %L, 0)', x.data, x.key, x.type, x.organization_id, x.id),
      format('select custom.agent_context_value(%L::jsonb, %L, %L, %L, %L, 0)', x.data, x.key, x.type, x.organization_id, x.id));
  end loop;
end
$cmp$;

select fn, count(*) as compared from l8_count group by fn order by fn;
select fn, count(*) as mismatches from l8_mismatch group by fn order by fn;
select distinct on (fn) fn, seat, arg, left(old_answer::text, 700) as old_answer, left(new_answer::text, 700) as new_answer from l8_mismatch order by fn, arg;

-- where the dictionary owner lists differ, element by element
select m.seat, 'only_old' as side, e.value ->> 'level' as level, e.value ->> 'owner_id' as id, e.value ->> 'name' as name
  from l8_mismatch m, jsonb_array_elements(coalesce(m.old_answer -> 'scopes', '[]') || coalesce(m.old_answer -> 'scope_types', '[]')) e
 where m.fn = 'dict_list_owners_for'
   and not (coalesce(m.new_answer -> 'scopes', '[]') || coalesce(m.new_answer -> 'scope_types', '[]')) @> jsonb_build_array(e.value)
union all
select m.seat, 'only_new', e.value ->> 'level', e.value ->> 'owner_id', e.value ->> 'name'
  from l8_mismatch m, jsonb_array_elements(coalesce(m.new_answer -> 'scopes', '[]') || coalesce(m.new_answer -> 'scope_types', '[]')) e
 where m.fn = 'dict_list_owners_for'
   and not (coalesce(m.old_answer -> 'scopes', '[]') || coalesce(m.old_answer -> 'scope_types', '[]')) @> jsonb_build_array(e.value)
 order by 1, 2 limit 30;
