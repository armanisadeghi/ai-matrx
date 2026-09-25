-- chair-step: this puts back the two bodies sc1t_a_table_moves_with_the_tables_inside_it.sql
--   replaced — custom._table_move_plan(uuid, uuid, uuid) and custom.table_move(uuid, uuid, integer)
--   — byte for byte what pg_get_functiondef answered on the dev clone on 2026-09-24 before it ran
--   (the bodies SC-1' wrote in sc1p_a_table_says_where_it_lives_and_its_owner_can_move_it.sql),
--   and their two comments. Nothing else is touched: no table, trigger, policy or grant.
--   A Table already moved together with the tables inside it stays where it was moved; after this
--   a move of a table with tables inside its rows is refused again with the sentence, and a move
--   writes no change events.
-- lane: SC-1-TAILS
-- based-on: custom._table_move_plan(uuid,uuid,uuid) 64fc4dc0901448cd379e4e4022f20c8828280d6fa1b41be068d5c39ff13243f9
-- based-on: custom.table_move(uuid,uuid,integer) 7ca144f23aec631f115faf7e6e0c9f35084a5ca8814deddda98e9f254b72036f
-- lock: custom

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom._table_move_plan(p_table_id uuid, p_to uuid, p_me uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tables   uuid := custom.table_kernel_id();
  v_fieldk   uuid := custom.field_kernel_id();
  v_t        record;
  v_org      uuid;
  v_org_name text;
  v_name     text;
  v_may      boolean := false;
  v_why_not  text;
  v_general  text[] := array[]::text[];
  v_carry_t  uuid[];            -- tables that move: the table and its own choice lists
  v_fields   uuid[];
  v_recs     uuid[];
  v_others   uuid[];            -- rules, dashboards, templates, relations that move
  v_all      uuid[];
  v_idre     text;
  r          record;
  v_dest     jsonb := '[]'::jsonb;
  v_to_why   text;
  v_counts   jsonb;
  v_shared   text;
  v_home_like boolean;
begin
  select t.* into v_t
    from custom.record t
   where t.id = p_table_id and t.table_id = v_tables
   limit 1;
  if not found then
    return null;
  end if;
  v_org  := v_t.organization_id;
  v_name := coalesce(nullif(btrim(v_t.data ->> 'name'), ''), 'This table');
  select o.name into v_org_name from iam.organizations o where o.id = v_org;
  v_org_name := coalesce(v_org_name, 'its organization');

  -- WHO MAY MOVE IT: the person who made it, or an owner or admin of its organization.
  v_may := p_me is not null
           and (v_t.created_by = p_me or iam.is_org_manager(v_org, p_me));
  if not v_may then
    v_why_not := format('Only the person who made %s or an owner or admin of %s can move it.',
                        v_name, v_org_name);
  end if;

  -- ── what the store or the app keeps never moves by itself ──
  if v_t.data_class = 'kernel' then
    v_general := v_general || format('%s is one of the record store''s own tables, so it stays where it is.', v_name);
  elsif coalesce((v_t.data ->> 'kept_by_the_app')::boolean, false) or v_t.data ? 'scope_binding' then
    v_general := v_general || format(
      'The app keeps %s for %s, so it moves with what uses it, not by itself.',
      v_name,
      coalesce(case v_t.data ->> 'kept_for'
                 when 'context' then 'the context system'
                 when 'choices' then 'a column''s choices'
                 else nullif(v_t.data ->> 'kept_for', '') end,
               'one of its features'));
  end if;
  if v_t.deleted_at is not null then
    v_general := v_general || format('%s is in the trash. Restore it first, then move it.', v_name);
  end if;

  -- ── where it sits: a HOME (its organization's record, a person's space, a "Home" folder, a
  -- kernel row) moves with nothing and is re-pointed; a row of another Table or a Table is a
  -- container, and a Table inside a container moves with it, not by itself ──
  if custom.containment_parent(v_t.data) is not null then
    select coalesce(nullif(btrim(p.data ->> 'name'), ''), nullif(btrim(p.data ->> 'title'), ''), 'another record'),
           (p.table_id is null or p.data_class = 'kernel'
            or exists (select 1 from custom.record k where k.id = p.table_id and k.data_class = 'kernel'))
           and p.table_id is distinct from v_tables
      into v_shared, v_home_like
      from custom.record p
     where p.organization_id = v_org and p.id = custom.containment_parent(v_t.data);
    if not coalesce(v_home_like, true) then
      v_general := v_general || format('%s lives inside %s, so it moves with that, not by itself.',
                                       v_name, coalesce(v_shared, 'another record'));
    end if;
  end if;

  -- ── the carry set ──
  -- Its own choice lists: a kept choices Table every one of whose using columns is on this Table.
  select coalesce(array_agg(distinct o.id), array[]::uuid[]) into v_carry_t
    from custom.record f
    join custom.record o
      on o.organization_id = v_org
     and o.id = nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid
     and o.table_id = v_tables
   where f.organization_id = v_org and f.table_id = v_fieldk
     and f.data ->> 'entity_definition_id' = p_table_id::text
     and coalesce((o.data ->> 'kept_by_the_app')::boolean, false)
     and not exists (select 1 from custom.record g
                      where g.organization_id = v_org and g.table_id = v_fieldk
                        and g.deleted_at is null
                        and g.data -> 'config' ->> 'options_table_id' = o.id::text
                        and g.data ->> 'entity_definition_id' is distinct from p_table_id::text);
  v_carry_t := array[p_table_id] || v_carry_t;

  -- Choice lists it shares with a Table that stays: named, refused.
  for r in
    select distinct coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other
      from custom.record f
      join custom.record g
        on g.organization_id = v_org and g.table_id = v_fieldk and g.deleted_at is null
       and g.data -> 'config' ->> 'options_table_id' = f.data -> 'config' ->> 'options_table_id'
       and g.data ->> 'entity_definition_id' is distinct from p_table_id::text
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(g.data ->> 'entity_definition_id', '')::uuid
     where f.organization_id = v_org and f.table_id = v_fieldk and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = p_table_id::text
       and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
     limit 3
  loop
    v_general := v_general || format(
      'Its %s column shares its choices with %s, which stays in %s. Give one of them its own choices first.',
      r.col, r.other, v_org_name);
  end loop;

  select coalesce(array_agg(f.id), array[]::uuid[]) into v_fields
    from custom.record f
   where f.organization_id = v_org and f.table_id = v_fieldk
     and (f.data ->> 'entity_definition_id')::uuid = any (v_carry_t);

  select coalesce(array_agg(x.id), array[]::uuid[]) into v_recs
    from custom.record x
   where x.organization_id = v_org and x.table_id = any (v_carry_t);

  select coalesce(array_agg(x.id), array[]::uuid[]) into v_others
    from custom.record x
   where x.organization_id = v_org
     and not (x.id = any (v_carry_t))
     and (   (x.data_class = 'rule'               and x.data ->> 'scope_table_id'   = p_table_id::text)
          or (x.data_class = custom.dashboard_class() and x.data ->> 'subject_table_id' = p_table_id::text)
          or (x.data_class = 'doc_template'       and x.data ->> 'renders_table_id' = p_table_id::text)
          or (x.data_class = 'checklist_template' and x.data ->> 'about_table_id'   = p_table_id::text)
          or (x.data_class = 'relation'
              and nullif(x.data ->> 'from', '')::uuid = any (v_recs)
              and nullif(x.data ->> 'to',   '')::uuid = any (v_recs)));

  v_all := v_carry_t || v_fields || v_recs || v_others;

  -- ── links that would cross the wall ──
  for r in
    select coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other
      from custom.record f
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(f.data ->> 'relation_target', '')::uuid
     where f.organization_id = v_org and f.id = any (v_fields) and f.deleted_at is null
       and nullif(f.data ->> 'relation_target', '') is not null
       and not (nullif(f.data ->> 'relation_target', '')::uuid = any (v_carry_t))
     limit 3
  loop
    v_general := v_general || format(
      'Its %s column links to %s, which stays in %s. Links do not cross organizations: remove that column or move %s first.',
      r.col, r.other, v_org_name, r.other);
  end loop;
  for r in
    select coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as col,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), 'another table') as other
      from custom.record f
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = nullif(f.data ->> 'entity_definition_id', '')::uuid
     where f.organization_id = v_org and f.table_id = v_fieldk and f.deleted_at is null
       and not (f.id = any (v_fields))
       and nullif(f.data ->> 'relation_target', '')::uuid = any (v_carry_t)
     limit 3
  loop
    v_general := v_general || format(
      '%s links to this table through its %s column and stays in %s. Remove that column or move %s first.',
      r.other, r.col, v_org_name, r.other);
  end loop;
  if exists (select 1 from custom.record x
              where x.organization_id = v_org and x.data_class = 'relation' and x.deleted_at is null
                and not (x.id = any (v_others))
                and (nullif(x.data ->> 'from', '')::uuid = any (v_recs)
                     or nullif(x.data ->> 'to', '')::uuid = any (v_recs))) then
    v_general := v_general || format(
      'Some of its rows are linked to rows in other tables of %s. Those links would break, so remove them first.',
      v_org_name);
  end if;

  -- ── containment across the edge of what moves ──
  for r in
    select coalesce(nullif(btrim(t2.data ->> 'name'), ''), 'a table') as inner_name
      from custom.record t2
     where t2.organization_id = v_org and t2.table_id = v_tables and t2.deleted_at is null
       and not (t2.id = any (v_carry_t))
       and custom.containment_parent(t2.data) = any (v_recs)
     limit 3
  loop
    v_general := v_general || format(
      '%s lives inside one of its rows. Moving a table together with the tables inside it is not built yet: take %s out first.',
      r.inner_name, r.inner_name);
  end loop;
  if exists (select 1 from custom.record x
              where x.organization_id = v_org and x.id = any (v_recs)
                and custom.containment_parent(x.data) is not null
                and not (custom.containment_parent(x.data) = any (v_all))) then
    v_general := v_general || 'Some of its rows live inside records of another table. Take them out first.';
  end if;
  if exists (select 1 from custom.record x
              where x.organization_id = v_org and x.table_id <> v_tables and x.deleted_at is null
                and not (x.id = any (v_all))
                and custom.containment_parent(x.data) = any (v_recs)) then
    v_general := v_general || 'Records of other tables live inside its rows. Take them out first.';
  end if;

  -- ── what else in the organization still uses it ──
  for r in
    select p.title from custom.portal p
     where p.organization_id = v_org and p.archived_at is null
       and (p.client_table_id = any (v_carry_t)
            or exists (select 1 from custom.portal_table pt
                        where pt.portal_id = p.id and pt.table_id = any (v_carry_t)))
     limit 3
  loop
    v_general := v_general || format(
      'The client portal "%s" shows it. Take it out of that portal first.', r.title);
  end loop;
  if exists (select 1 from iam.permissions g
              where g.resource_type = 'record' and g.resource_id = any (v_carry_t)
                and g.granted_to_organization_id = v_org
                and g.status <> 'rejected'
                and (g.expires_at is null or g.expires_at > now())) then
    v_general := v_general || format(
      'It is shared with everyone in %s. Stop sharing it with the whole organization first, so nobody keeps access by accident.',
      v_org_name);
  end if;
  v_idre := array_to_string(array(select x::text from unnest(v_carry_t || v_fields) x), '|');
  for r in
    select x.data_class as cls,
           coalesce(nullif(btrim(x.data ->> 'name'), ''), nullif(btrim(x.data ->> 'label'), ''), 'something') as nm,
           coalesce(nullif(btrim(ot.data ->> 'name'), ''), null) as of_table
      from custom.record x
      left join custom.record ot
        on ot.organization_id = v_org and ot.id = x.table_id and ot.table_id = v_tables
     where x.organization_id = v_org and x.deleted_at is null
       and x.table_id is distinct from v_fieldk            -- a column of another table is named above
       and not (x.id = any (v_all))
       -- A row of a table THE APP keeps (its own bookkeeping — the older saved-views copy, a
       -- choice list) follows the table by id and holds nothing in place.
       and not (ot.id is not null
                and coalesce((custom.table_placement(ot.organization_id, ot.id, ot.data, false) ->> 'kept_by_the_app')::boolean, false))
       and x.data::text ~ v_idre
     limit 3
  loop
    v_general := v_general || format(
      '%s "%s"%s still uses it and stays in %s. Change it first.',
      initcap(replace(case r.cls when 'record' then 'row' else r.cls end, '_', ' ')),
      r.nm,
      case when r.of_table is not null and r.cls = 'record' then format(' of %s', r.of_table) else '' end,
      v_org_name);
  end loop;

  -- ── where it may go: every organization this person belongs to, but this one ──
  for r in
    select o.id, o.name::text as name, m.role::text as role
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id and o.archived_at is null
     where m.user_id = p_me and o.id <> v_org
     order by o.is_personal desc, o.name
  loop
    v_to_why := null;
    if not custom.store_is_open(r.id) then
      v_to_why := format('%s does not keep its data in the record store yet.', r.name);
    elsif exists (select 1 from custom.record d
                   where d.organization_id = r.id and d.table_id = v_tables and d.deleted_at is null
                     and lower(coalesce(d.data ->> 'slug', d.data ->> 'name'))
                       = lower(coalesce(v_t.data ->> 'slug', v_t.data ->> 'name'))) then
      v_to_why := format('%s already has a table called %s. Rename one of them first.', r.name, v_name);
    end if;
    v_dest := v_dest || jsonb_build_object('id', r.id, 'name', r.name, 'role', r.role,
                                           'ok', v_to_why is null, 'why', v_to_why);
  end loop;

  v_counts := jsonb_build_object(
    'fields',  (select count(*) from custom.record f where f.organization_id = v_org and f.id = any (v_fields)
                  and (f.data ->> 'entity_definition_id')::uuid = p_table_id and f.deleted_at is null),
    'records', (select count(*) from custom.record x where x.organization_id = v_org
                  and x.table_id = p_table_id and x.deleted_at is null),
    'in_trash', (select count(*) from custom.record x where x.organization_id = v_org
                  and x.table_id = p_table_id and x.deleted_at is not null),
    'choice_lists', coalesce(array_length(v_carry_t, 1), 1) - 1,
    'with_it', coalesce(array_length(v_others, 1), 0));

  return jsonb_build_object(
    'table',        jsonb_build_object('id', p_table_id, 'name', v_name, 'version', v_t.version),
    'organization', jsonb_build_object('id', v_org, 'name', v_org_name),
    'may_move',     v_may,
    'why_not',      v_why_not,
    'held_by',      to_jsonb(v_general),
    'destinations', v_dest,
    'carries',      v_counts,
    -- internal: the ids that move. The doors strip this before a client reads the answer.
    '_carry',       jsonb_build_object('tables', to_jsonb(v_carry_t), 'fields', to_jsonb(v_fields),
                                       'records', to_jsonb(v_recs), 'others', to_jsonb(v_others)));
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.table_move(p_table_id uuid, p_to_organization_id uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me      uuid := custom.query_principal();
  v_opens   jsonb;
  v_plan    jsonb;
  v_from    uuid;
  v_id      uuid;
  v_to_name text;
  v_dest    jsonb;
  v_tables  uuid[];
  v_fields  uuid[];
  v_recs    uuid[];
  v_others  uuid[];
  v_all     uuid[];
  v_rows    uuid[];
  v_forms   uuid[];
  v_home_from uuid;
  v_home_to   uuid;
  v_n       bigint;
  v_moved   jsonb := '{}'::jsonb;
  v_version integer;
begin
  if v_me is null then
    raise exception 'Sign in to move a table.' using errcode = '42501';
  end if;
  if p_table_id is null or p_to_organization_id is null then
    raise exception 'Say which table to move and which organization it goes to.' using errcode = '22004';
  end if;

  v_opens := custom.where_id_opens(p_table_id);
  if v_opens is null or v_opens ->> 'kind' is distinct from 'table' then
    raise exception 'That table is not one you have been given, so nothing moved.'
      using errcode = '42501',
            hint = 'The store says the same for a table you may not open and one that does not exist.';
  end if;
  v_from := (v_opens ->> 'organization_id')::uuid;
  v_id   := (v_opens ->> 'resolved_id')::uuid;
  -- where_id_opens is the store's one "may she open it" (custom._where_id_may_open). Whether she
  -- may MOVE it is the plan's: its maker, or an owner/admin of its organization.

  v_plan := custom._table_move_plan(v_id, p_to_organization_id, v_me);

  if not coalesce((v_plan ->> 'may_move')::boolean, false) then
    raise exception '%', v_plan ->> 'why_not' using errcode = '42501';
  end if;
  if p_to_organization_id = v_from then
    raise exception '% is already in %.', v_plan #>> '{table,name}', v_plan #>> '{organization,name}'
      using errcode = '22023';
  end if;
  select d into v_dest from jsonb_array_elements(v_plan -> 'destinations') d
   where d ->> 'id' = p_to_organization_id::text;
  if v_dest is null then
    raise exception 'You are not a member of that organization, so % cannot go there.', v_plan #>> '{table,name}'
      using errcode = '42501',
            hint = 'A table moves only into an organization you belong to.';
  end if;
  v_to_name := v_dest ->> 'name';
  if not coalesce((v_dest ->> 'ok')::boolean, false) then
    raise exception '%', v_dest ->> 'why' using errcode = '55000';
  end if;
  if jsonb_array_length(v_plan -> 'held_by') > 0 then
    raise exception '%', v_plan -> 'held_by' ->> 0
      using errcode = '55000',
            detail = (v_plan -> 'held_by')::text,
            hint = format('Nothing moved. %s stays in %s until this is sorted.',
                          v_plan #>> '{table,name}', v_plan #>> '{organization,name}');
  end if;
  v_version := (v_plan #>> '{table,version}')::integer;
  if p_expected_version is not null and p_expected_version <> v_version then
    raise exception 'Someone changed % while you were deciding. Look again, then move it.', v_plan #>> '{table,name}'
      using errcode = '40001';
  end if;

  select array(select (x #>> '{}')::uuid from jsonb_array_elements(v_plan #> '{_carry,tables}') x)  into v_tables;
  select array(select (x #>> '{}')::uuid from jsonb_array_elements(v_plan #> '{_carry,fields}') x)  into v_fields;
  select array(select (x #>> '{}')::uuid from jsonb_array_elements(v_plan #> '{_carry,records}') x) into v_recs;
  select array(select (x #>> '{}')::uuid from jsonb_array_elements(v_plan #> '{_carry,others}') x)  into v_others;
  v_all  := v_tables || v_fields || v_recs || v_others;
  v_rows := v_tables || v_recs;

  -- THE ORGANIZATION'S OWN RECORD, on both sides (asked here: custom.organization_home_id is
  -- G11's and its inverse removes it — check:inverses-leave-the-ground-standing, clause d).
  v_home_from := (select h.id from custom.record h
                   where h.organization_id = v_from and h.table_id = custom.organization_kernel_id()
                     and h.deleted_at is null order by h.created_at, h.id limit 1);
  v_home_to   := (select h.id from custom.record h
                   where h.organization_id = p_to_organization_id and h.table_id = custom.organization_kernel_id()
                     and h.deleted_at is null order by h.created_at, h.id limit 1);

  -- THE MARK custom._store_door reads: this transaction moves rows out of v_from. Cleared below.
  perform set_config('custom.table_move_from', v_from::text, true);

  -- THE ORDER IS THE WALL'S: what a row points at arrives before the row. Tables first (the
  -- moved Table re-homed under the new organization's own home, or under none), then Fields
  -- (they name their Table), then Records, then what rides along.
  update custom.record t
     set organization_id = p_to_organization_id,
         -- Its HOME is re-pointed: its organization's record becomes the new organization's
         -- (when it has one); any other home (a person's space, a "Home" folder) stays behind
         -- and the Table sits at the top of the new organization. The plan already refused a
         -- Table that lives inside another Table's row.
         data = case
                  when custom.containment_parent(t.data) is null then t.data
                  when custom.containment_parent(t.data) = any (v_all) then t.data   -- moves with it
                  when custom.containment_parent(t.data) = v_home_from and v_home_to is not null
                    then jsonb_set(t.data, '{parent_id}', to_jsonb(v_home_to::text))
                  else t.data - 'parent_id' end
   where t.organization_id = v_from and t.id = any (v_tables);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('tables', v_n);

  update custom.record f set organization_id = p_to_organization_id
   where f.organization_id = v_from and f.id = any (v_fields);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('fields', v_n);

  update custom.record x set organization_id = p_to_organization_id
   where x.organization_id = v_from and x.id = any (v_recs);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('records', v_n);

  update custom.record x set organization_id = p_to_organization_id
   where x.organization_id = v_from and x.id = any (v_others);
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('with_it', v_n);
  perform set_config('custom.table_move_from', '', true);

  -- What hangs off its rows, keyed by the Table or by one of its rows.
  update custom.io_comment c set organization_id = p_to_organization_id
   where c.organization_id = v_from and (c.table_id = any (v_tables) or c.record_id = any (v_rows));
  update custom.io_import i set organization_id = p_to_organization_id
   where i.organization_id = v_from and i.table_id = any (v_tables);
  update custom.io_outbox o set organization_id = p_to_organization_id
   where o.organization_id = v_from and (o.table_id = any (v_tables) or o.record_id = any (v_rows));
  update custom.agent_table_origin a set organization_id = p_to_organization_id
   where a.organization_id = v_from and a.table_id = any (v_tables);
  update custom.doc_render d set organization_id = p_to_organization_id
   where d.organization_id = v_from and (d.table_id = any (v_tables) or d.record_id = any (v_rows));
  update custom.doc_signature s set organization_id = p_to_organization_id
   where s.organization_id = v_from and s.record_id = any (v_rows);
  update custom.external_link l set organization_id = p_to_organization_id
   where l.organization_id = v_from and l.record_id = any (v_rows);
  select coalesce(array_agg(f.id), array[]::uuid[]) into v_forms
    from custom.anon_form f where f.organization_id = v_from and f.table_id = any (v_tables);
  update custom.anon_form f set organization_id = p_to_organization_id
   where f.organization_id = v_from and f.id = any (v_forms);
  update custom.anon_inbound i set organization_id = p_to_organization_id
   where i.organization_id = v_from and i.table_id = any (v_tables);
  update custom.anon_submission s set organization_id = p_to_organization_id
   where s.organization_id = v_from and (s.table_id = any (v_tables) or s.form_id = any (v_forms));
  update custom.anon_replay s set organization_id = p_to_organization_id
   where s.organization_id = v_from and s.table_id = any (v_tables);
  update custom.anon_token k set organization_id = p_to_organization_id
   where k.organization_id = v_from and (k.form_id = any (v_forms) or k.record_id = any (v_rows));
  update custom.anon_hit h set organization_id = p_to_organization_id
   where h.organization_id = v_from and h.form_id = any (v_forms);
  update custom.anon_form_draft d set organization_id = p_to_organization_id
   where d.organization_id = v_from and d.form_id = any (v_forms);
  update custom.record_alias a set organization_id = p_to_organization_id
   where a.organization_id = v_from and a.new_id = any (v_all);
  update platform.saved_view v set organization_id = p_to_organization_id
   where v.organization_id = v_from and v.subject_id = any (v_tables);
  update platform.associations a set organization_id = p_to_organization_id
   where a.organization_id = v_from
     and ((a.source_type = 'record' and a.source_id = any (v_all))
          or (a.target_type = 'record' and a.target_id = any (v_all)));

  -- ITS HISTORY GOES WITH IT. A version is the history OF A ROW; the row now answers in the new
  -- organization, so "who changed this and when" must still answer there.
  update history.row_versions v set organization_id = p_to_organization_id
   where v.entity_type = 'custom.record' and v.organization_id = v_from and v.row_id = any (v_all);

  -- THE MOVE ITSELF IS A VERSION OF THE TABLE. The store's capture triggers pair old and new rows
  -- by (organization, id), so a row that changed organization is not paired by them; this writes
  -- the one version that says what happened, who did it, and from where.
  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier,
          migration_id, operation_name)
  select 'custom.record', t.id, t.organization_id, t.version, 'UPDATE',
         to_jsonb(t) || jsonb_build_object('moved_from_organization_id', v_from),
         v_me, platform.actor_tier(), null, 'table_move'
    from custom.record t
   where t.organization_id = p_to_organization_id and t.id = v_id;

  -- What the visibility cache remembers about these rows was worked out in the old organization.
  -- It is a cache (VIS-7): emptied for them, it is rebuilt on the next read. (Not
  -- custom.bump_epoch: W2-EPOCH's inverse removes it — check:inverses-leave-the-ground-standing.)
  delete from custom.visibility_cache c
   where c.item_id = any (v_all) or c.container_id = any (v_all);

  return jsonb_build_object(
    'moved', true,
    'table', v_plan -> 'table',
    'from',  v_plan -> 'organization',
    'to',    jsonb_build_object('id', p_to_organization_id, 'name', v_to_name),
    'carried', v_moved,
    'path',  '/data-v2/' || v_id::text);
end;
$function$

;

comment on function custom._table_move_plan(uuid, uuid, uuid) is
  'SC-1'' (owner 2026-09-23: "see what org this data is in … and set the org"). The ONE place that '
  'decides what moving a Table to another organization carries and what refuses it, for both '
  'custom.table_home and custom.table_move. Internal: no client grant; it trusts its caller to have '
  'decided that the person may open the Table.';

comment on function custom.table_move(uuid, uuid, integer) is
  'SC-1''. Moves a Table — with its Fields, Records, own choice lists, rules, dashboards, templates, '
  'forms, comments, links, saved views, associations and history — into another organization the '
  'caller belongs to, or refuses with ONE sentence (custom._table_move_plan decides both). Only the '
  'person who made the Table or an owner/admin of its organization may. Refused means nothing moved.';
