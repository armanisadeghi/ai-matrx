-- chair-step: lane LISTS-AFTER-SWITCH. Lane OLDER-DOORS-AFTER-SWITCH made the Data tables press archive an organization's older pick lists (workbench.udt_structured_lists / _items) with a pointer to their same-id copies in the store (a Table of choices), but every reader of lists — the Lists pages, the list pickers, the agents' `picklist` tool, the picklist variable resolver — still read ONLY the older lists, so a switched organization's lists vanished from /lists and a moved list answered its frozen older choices. And a switched organization could still CREATE a new older table or list: a live table nothing moves. ADDS platform.list_lives_in(uuid) and the client door custom.where_lists_live(uuid[]) (where a list is read and written — the switch's answer, never "does a copy exist?"), platform._store_pick_list_document (a store list in the older list shape), platform._pick_list_born_in_store (a new list of a switched organization is born in the store, same shape back), platform.older_tables_switched(uuid), and the trigger workbench._switched_org_makes_nothing_older on udt_datasets and udt_structured_lists (an INSERT in a switched organization is refused, naming where new ones are made). REPLACES public.get_user_lists_summary (lists the caller's store lists beside the older ones, each marked lives_in), public.get_user_list_with_items, public._d31_impl_get_user_list_with_items, public.get_structured_list_for_selection (a list that lives in the store answers from its copy: same id, same shape, lives_in 'record'), public.create_user_list and public.update_user_list (born in / written to the store in a switched organization), and the older table reads public.get_table_row, public.get_table_cell, public.get_table_column, public.list_table_rows, public.list_table_columns, public.udt_table_profile, public.udt_column_facets and both public.export_user_table_as_csv (same rows, marked moved_to like the reads OLDER-DOORS-AFTER-SWITCH marked).
-- based-on: public.get_user_lists_summary(uuid) 6ac27e560052cb89d7b13e1a7e5524ea9051ae1a9b8465c6da9381849761cac1
-- based-on: public.get_user_list_with_items(uuid) ca8e64aeffe669a09bab34f1344221b8c3911b4da05eb8df798448578caf3d89
-- based-on: public._d31_impl_get_user_list_with_items(uuid) be29b00e4be1d1a1e8ec61f5a020f203832ab9a98b8de40adca06a0db792c61e
-- based-on: public.get_structured_list_for_selection(uuid) e80c56df47991b07495c5a7589ee6dc842b452ee3f9601b6d88f242feb808195
-- based-on: public.create_user_list(character varying, text, uuid, boolean, boolean, boolean, jsonb, uuid) 9b5886e04c555b541af22c27489566b29741791ecb28a1aa9468620d5d37c927
-- based-on: public.update_user_list(uuid, character varying, text, boolean, boolean, boolean, jsonb) 43e52890779db4aa8ddd854290e2723d576298ec6cd3a482b75a8f87df593219
-- based-on: public.get_table_row(jsonb) a7f9d4fa06428f0b3572800102c691b649d3f6c105c052d5070d798cbbf9ed1d
-- based-on: public.get_table_cell(jsonb) a2c094dece970010d18325d0536bcf7560a2bca07c6c79f59c085ccddd11001f
-- based-on: public.get_table_column(jsonb) 0ecf1d309b1f5758594c4c008216724debca3fcfab5d75230a925429c54ae797
-- based-on: public.list_table_rows(jsonb, integer, integer, text, text) d320c8d5a70deb3559e7d531716351e0c7a8df42979b6bb8e985189c26f42e80
-- based-on: public.list_table_columns(jsonb) 0f90ec3dfe629c0bb5f1efd6aab09fb7a01bb9e6a42d3cc9a459c74559cea0d7
-- based-on: public.udt_table_profile(uuid, integer) 153745fcec7408eda767a9317465f818583f647761831d3c3e6ebeb41c733484
-- based-on: public.udt_column_facets(uuid, text, integer, text) 10d5b8149129188525f4705a8d12688bf730ee3739fac61937c434612e379cf4
-- based-on: public.export_user_table_as_csv(uuid) 28945839cfe3c915e85cd03a503be965f91f065e70cafe6dda0471ae342ec52f
-- based-on: public.export_user_table_as_csv(uuid, text, text) b62d8405e54c7fb3a0a363cf3420b299fa2e2c340f400d5724a2e7c7e8458bd5
-- lane: LISTS-AFTER-SWITCH
-- INVERSE: migrations/inverse/listsafter_a_pick_lists_read_and_are_born_where_the_switch_says_down.sql

-- ── 1. IS THIS ORGANIZATION'S DATA TABLES SWITCH ON THE NEW SYSTEM? ───────────────────────────
create or replace function platform.older_tables_switched(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select p_organization_id is not null
     and coalesce((platform._cutover_seam_last_done('older_tables', p_organization_id)).direction, 'old') = 'new';
$$;

comment on function platform.older_tables_switched(uuid) is
  'LISTS-AFTER-SWITCH: true when the organization''s last done Data tables press went to the new system. The one question the older create doors and the INSERT guard ask; Switch back makes it false again.';

revoke all on function platform.older_tables_switched(uuid) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', 'older_tables_switched', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/listsafter_a_pick_lists_read_and_are_born_where_the_switch_says.sql (lane LISTS-AFTER-SWITCH)',
       'p_organization_id is only looked up in platform.cutover_seam_press; it returns one boolean and names nothing.',
       'server_only: called only from inside SECURITY DEFINER doors (the older create doors, the INSERT guard, platform.list_lives_in); EXECUTE is revoked from every client role.',
       false, false
  from pg_proc p where p.oid = 'platform.older_tables_switched(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;


-- ── 2. IS THIS STORE TABLE A PICK LIST? ───────────────────────────────────────────────────────
-- Two ways a Table of choices is a list: the mover copied it from an older list
-- (metadata.moved_from.table), or it was born as one in a switched organization
-- (metadata.pick_list, stamped by platform._pick_list_born_in_store only).
insert into platform.metadata_reserved_keys (table_token, key, reason)
values ('record', 'pick_list',
        'LISTS-AFTER-SWITCH: marks a record-store Table that was born as a pick list (a list of choices) in an organization whose Data tables switch is on the new system — {born, by, at}. Written ONLY by platform._pick_list_born_in_store (public.create_user_list''s store arm, in the person''s seat); read by the list doors (get_user_lists_summary, platform.list_lives_in) to tell a list from any other Table. A list copied from an older list carries moved_from instead.')
on conflict (table_token, key) do nothing;

create or replace function platform._is_store_pick_list(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select coalesce(p_metadata #>> '{moved_from,table}' = 'workbench.udt_structured_lists', false)
      or coalesce(p_metadata ? 'pick_list', false);
$$;

revoke all on function platform._is_store_pick_list(jsonb) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', '_is_store_pick_list', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/listsafter_a_pick_lists_read_and_are_born_where_the_switch_says.sql (lane LISTS-AFTER-SWITCH)',
       'A pure predicate over the jsonb it is handed; it reads no table.',
       'server_only: called only from inside the list doors; EXECUTE is revoked from every client role.',
       false, false
  from pg_proc p where p.oid = 'platform._is_store_pick_list(jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;


-- ── 3. WHERE IS THIS LIST READ AND WRITTEN? ───────────────────────────────────────────────────
--   'older'  — a live older list (whatever the switch says: an organization that switched before
--              the press archived lists keeps its live older lists until it presses again), or an
--              archived older list that did not move with a switch (Trash).
--   'record' — a list that moved with its organization's switch (and its copy is there), or an id
--              the older store never held (a list born in the store).
create or replace function platform.list_lives_in(p_list_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_org   uuid;
  v_live  boolean;
  v_found boolean;
begin
  if p_list_id is null then
    return null;
  end if;
  select true, l.organization_id, l.deleted_at is null into v_found, v_org, v_live
    from workbench.udt_structured_lists l where l.id = p_list_id;
  if v_found is not true then
    return 'record';
  end if;
  if v_live then
    return 'older';
  end if;
  if platform._older_list_moved_by_switch(p_list_id)
     and exists (select 1 from custom.record t
                  where t.organization_id = v_org and t.id = p_list_id
                    and t.data_class = 'table' and t.deleted_at is null) then
    return 'record';
  end if;
  return 'older';
end;
$$;

comment on function platform.list_lives_in(uuid) is
  'LISTS-AFTER-SWITCH: where the pick list <id> is read and written — older (a live older list, or one archived without a switch) or record (it moved with its organization''s switch, or the older store never held it). Decided by the switch and the list''s own row, never by whether a copy exists.';

revoke all on function platform.list_lives_in(uuid) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', 'list_lives_in', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/listsafter_a_pick_lists_read_and_are_born_where_the_switch_says.sql (lane LISTS-AFTER-SWITCH)',
       'p_list_id is only looked up by primary key (workbench.udt_structured_lists, custom.record); it returns one word and names nothing.',
       'server_only: called only from inside SECURITY DEFINER list doors and custom.where_lists_live (which decides who may be told); EXECUTE is revoked from every client role.',
       false, false
  from pg_proc p where p.oid = 'platform.list_lives_in(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

create or replace function custom.where_lists_live(p_list_ids uuid[])
returns table(list_id uuid, lives_in text, address text, why text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_me     uuid  := auth.uid();
begin
  if v_me is null and v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask where a list lives.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_list_ids), 0) > 1000 then
    raise exception 'Ask about at most 1000 lists at once (% were asked).', cardinality(p_list_ids) using errcode = '22023';
  end if;
  return query
    select i.id,
           h.lives_in,
           '/lists/' || i.id::text,
           case h.lives_in
             when 'older' then 'It is an older pick list: the Lists pages, list pickers and the agents'' picklist tool read and write the older list.'
             else 'It lives in the new system (the record store) as a Table of choices, same id; the store''s own doors decide whether you may open it.'
           end
      from (select distinct u.id from unnest(coalesce(p_list_ids, '{}'::uuid[])) as u(id) where u.id is not null) i
      cross join lateral (select platform.list_lives_in(i.id) as lives_in) l
      -- WHO MAY BE TOLD `older` (the same rule custom.where_tables_live keeps): a person is told
      -- an older list's home only when she may open it; anyone else hears `record`, the word an
      -- id nobody minted answers, and the store's doors then say "not found" for it.
      cross join lateral (
        select case
                 when l.lives_in is distinct from 'older' or v_me is null then l.lives_in
                 when exists (select 1 from workbench.udt_structured_lists o
                               where o.id = i.id
                                 and (o.user_id = v_me or o.created_by = v_me or o.is_public or o.public_read)) then l.lives_in
                 when coalesce(iam.has_access('structured_list', i.id, 'viewer'::public.permission_level), false) then l.lives_in
                 when custom.has_visibility(v_me, 'record', i.id, 'viewer'::public.permission_level) then l.lives_in
                 else 'record'
               end as lives_in) h;
end;
$$;

comment on function custom.where_lists_live(uuid[]) is
  'LISTS-AFTER-SWITCH: for each pick list id, where it is read and written (older | record), its address (/lists/<id>, the same for both) and one sentence. The one app-side answer every Lists page, list picker and the picklist tool asks before choosing the older editor or the store''s table page.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'custom', 'where_lists_live', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/listsafter_a_pick_lists_read_and_are_born_where_the_switch_says.sql (lane LISTS-AFTER-SWITCH)',
       'Answers only older | record per id, a fixed sentence and the id''s own address. A person is told `older` only for an older list she may open (owner, public, iam.has_access viewer, or the one ladder custom.has_visibility on its store copy); every other id answers `record`, exactly as an id nobody minted — so it names no list, no organization and no item, and cannot be used to probe for ids.',
       true
  from pg_proc p where p.oid = 'custom.where_lists_live(uuid[])'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function custom.where_lists_live(uuid[]) to authenticated, service_role;


-- ── 4. A STORE LIST, IN THE OLDER LIST SHAPE ──────────────────────────────────────────────────
-- The Table of choices is the list: its name, its description, and one Record per choice with
-- name / description / help_text / group_name / icon (the mover's words for label / description /
-- help_text / group_name / icon_name). A choice's description is shown only to an editor, as the
-- older list does (0064 picklist description secrecy). p_viewer null = the server lane.
create or replace function platform._store_pick_list_document(p_list_id uuid, p_viewer uuid, p_shape text default 'detail')
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_t      custom.record;
  v_editor boolean;
begin
  select t.* into v_t
    from custom.record t
   where t.id = p_list_id and t.data_class = 'table' and t.deleted_at is null
   limit 1;
  if v_t.id is null then
    return null;
  end if;
  if p_viewer is not null
     and not coalesce(custom.has_visibility(p_viewer, 'record', p_list_id, 'viewer'::public.permission_level), false) then
    return null;
  end if;
  v_editor := p_viewer is null
              or coalesce(custom.has_visibility(p_viewer, 'record', p_list_id, 'editor'::public.permission_level), false);

  return jsonb_build_object(
    'list_id', v_t.id,
    'list_name', coalesce(nullif(v_t.data ->> 'name', ''), 'List'),
    'description', v_t.data ->> 'description',
    'created_at', v_t.created_at,
    'updated_at', v_t.updated_at,
    'is_public', false,
    'public_read', false,
    'organization_id', v_t.organization_id,
    'lives_in', 'record',
    'address', '/lists/' || v_t.id::text,
    'table_address', '/data/' || v_t.id::text,
    'moved_to', case when platform._older_list_moved_by_switch(v_t.id) then workbench.older_table_moved_to(v_t.id) end,
    'items_grouped', (
      select jsonb_object_agg(g.group_name, g.items)
        from (
          select coalesce(nullif(c.data ->> 'group_name', ''), 'Ungrouped') as group_name,
                 jsonb_agg(
                   case when p_shape = 'selection' then
                     jsonb_build_object('id', c.id, 'label', c.data ->> 'name', 'help_text', c.data ->> 'help_text',
                                        'group_name', c.data ->> 'group_name', 'icon_name', c.data ->> 'icon')
                   else
                     jsonb_build_object('id', c.id, 'label', c.data ->> 'name',
                                        'description', case when v_editor then c.data ->> 'description' end,
                                        'help_text', c.data ->> 'help_text')
                   end
                   order by coalesce(o.created_at, c.created_at), c.id) as items
            from custom.record c
            left join workbench.udt_structured_list_items o on o.id = c.id
           where c.organization_id = v_t.organization_id
             and c.table_id = v_t.id
             and c.data_class = 'record'
             and c.deleted_at is null
             and (p_viewer is null
                  or coalesce(custom.has_visibility(p_viewer, 'record', c.id, 'viewer'::public.permission_level), false))
           group by 1
        ) g)
  );
end;
$$;

comment on function platform._store_pick_list_document(uuid, uuid, text) is
  'LISTS-AFTER-SWITCH: the store''s copy of a pick list (a Table of choices, same id) in the shape the older list reads answer (get_user_list_with_items: detail; get_structured_list_for_selection: selection), plus lives_in = record and its address. Null when p_viewer may not see the Table. Private.';

revoke all on function platform._store_pick_list_document(uuid, uuid, text) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', '_store_pick_list_document', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/listsafter_a_pick_lists_read_and_are_born_where_the_switch_says.sql (lane LISTS-AFTER-SWITCH)',
       'Answers null unless p_viewer may see the Table (custom.has_visibility viewer); each choice is filtered by the same ladder and a choice''s description is shown only to an editor.',
       'server_only: called only from inside the older list reads (SECURITY DEFINER) with the caller''s own auth.uid() as p_viewer; EXECUTE is revoked from every client role.',
       false, false
  from pg_proc p where p.oid = 'platform._store_pick_list_document(uuid,uuid,text)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;


-- ── 5. A NEW LIST OF A SWITCHED ORGANIZATION IS BORN IN THE STORE ─────────────────────────────
-- Exactly what records-ui `declareTable` does for a person (a Home in the person kernel, the
-- Table under it with its columns in ONE table_declare), with the list's five columns, then its
-- choices in one record_write_many — all in the caller's own seat, so the store's own doors and
-- guards decide. Items take the older door's words (Label / Description / Help Text / Group) or
-- the plain ones (label / description / help_text / group_name / icon_name).
create or replace function platform._pick_list_born_in_store(
  p_organization_id uuid, p_list_name text, p_description text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_name  text := coalesce(nullif(btrim(p_list_name), ''), 'List');
  v_home  uuid;
  v_table uuid;
  v_rows  jsonb[];
  v_ids   uuid[];
  v_item  jsonb;
begin
  if auth.uid() is null then
    raise exception 'A new list in an organization whose Data tables moved to the new system is made in the store, in the person''s own seat — this call has no signed-in person.'
      using errcode = '42501',
            hint = 'Call create_user_list as the person (the frontend''s client, or the server''s act-as-user session).';
  end if;

  v_home := custom.record_write(p_organization_id, custom.person_kernel_id(),
                                jsonb_build_object('name', v_name || ' Home'));
  v_table := custom.table_declare(p_organization_id, jsonb_build_object(
    'name', v_name,
    'slug', left(trim(both '_' from lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '_', 'g'))), 40)
            || '_' || left(replace(gen_random_uuid()::text, '-', ''), 6),
    'type', 'entity',
    'label_singular', v_name,
    'label_plural', v_name,
    'display', 'list',
    'weight', 'light',
    'ordered', false,
    'row_order', 'manual',
    'title_field', 'name',
    'retention_days', 365,
    'agent_writable', true,
    'default_sort', '[]'::jsonb,
    'parent_id', v_home,
    'fields', jsonb_build_array(
      jsonb_build_object('name', 'name', 'key', 'name', 'label', 'Name', 'type', 'text'),
      jsonb_build_object('name', 'description', 'key', 'description', 'label', 'Description', 'type', 'long_text'),
      jsonb_build_object('name', 'help_text', 'key', 'help_text', 'label', 'Help text', 'type', 'text'),
      jsonb_build_object('name', 'group_name', 'key', 'group_name', 'label', 'Group', 'type', 'text'),
      jsonb_build_object('name', 'icon', 'key', 'icon', 'label', 'Icon', 'type', 'text'))));

  if nullif(btrim(p_description), '') is not null then
    perform custom.record_update(p_organization_id, v_table, jsonb_build_object('description', btrim(p_description)));
  end if;
  update custom.record
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'pick_list', jsonb_build_object('born', 'public.create_user_list', 'by', auth.uid(), 'at', now()))
   where organization_id = p_organization_id and id = v_table;

  if jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    for v_item in select * from jsonb_array_elements(p_items) loop
      continue when coalesce(nullif(btrim(coalesce(v_item ->> 'Label', v_item ->> 'label')), ''), '') = '';
      v_rows := v_rows || jsonb_strip_nulls(jsonb_build_object(
        'name', coalesce(v_item ->> 'Label', v_item ->> 'label'),
        'description', coalesce(v_item ->> 'Description', v_item ->> 'description'),
        'help_text', coalesce(v_item ->> 'Help Text', v_item ->> 'help_text'),
        'group_name', coalesce(v_item ->> 'Group', v_item ->> 'group_name'),
        'icon', coalesce(v_item ->> 'icon_name', v_item ->> 'Icon', v_item ->> 'icon')));
    end loop;
    if coalesce(cardinality(v_rows), 0) > 0 then
      v_ids := custom.record_write_many(p_organization_id, v_table, v_rows);
    end if;
  end if;

  return jsonb_build_object(
    'list_id', v_table,
    'list_name', v_name,
    'description', nullif(btrim(p_description), ''),
    'lives_in', 'record',
    'address', '/lists/' || v_table::text,
    'organization_id', p_organization_id,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'label', c.data ->> 'name', 'description', c.data ->> 'description',
               'help_text', c.data ->> 'help_text', 'group_name', c.data ->> 'group_name') order by c.created_at, c.id)
        from custom.record c
       where c.organization_id = p_organization_id and c.table_id = v_table
         and c.data_class = 'record' and c.deleted_at is null), '[]'::jsonb));
end;
$$;

comment on function platform._pick_list_born_in_store(uuid, text, text, jsonb) is
  'LISTS-AFTER-SWITCH: makes a new pick list as a Table of choices in the record store (Home + Table with the five list columns + one Record per choice), in the caller''s own seat, and answers the shape public.create_user_list answers plus lives_in = record. Called only by public.create_user_list when the organization''s Data tables switch is on the new system.';

revoke all on function platform._pick_list_born_in_store(uuid, text, text, jsonb) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', '_pick_list_born_in_store', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/listsafter_a_pick_lists_read_and_are_born_where_the_switch_says.sql (lane LISTS-AFTER-SWITCH)',
       'Writes only through the store''s own doors (custom.record_write, custom.table_declare, custom.record_update, custom.record_write_many) in the caller''s seat, so the organization wall, the store switch and every shape guard decide; refuses a call with no signed-in person.',
       'server_only: called only from public.create_user_list after its own caller and organization checks; EXECUTE is revoked from every client role.',
       false, false
  from pg_proc p where p.oid = 'platform._pick_list_born_in_store(uuid,text,text,jsonb)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;


-- ── 5b. THE SERVER'S TWO VIEWS: EVERY PICK LIST AND EVERY CHOICE, WHERE THEY LIVE ─────────────
-- The server reads lists by raw SQL (aidream user_data/picklists_queries.py: the agents'
-- picklist tool, the picklist REST router, the picklist variable resolver). These two views
-- are the older tables' shape, answered from wherever each list lives (platform.list_lives_in's
-- rule, set-wise): a live older list from the older rows; a list that moved with its
-- organization's switch, or was born in the store, from its Table of choices — same ids. The
-- server lane only: every client role is refused (a client reads lists through the doors).
create or replace view workbench.pick_list_live with (security_invoker = true) as
  select l.id, l.list_name::text as list_name, l.description, l.user_id, l.organization_id,
         l.is_public, l.public_read, l.created_at, l.updated_at, 'older'::text as lives_in
    from workbench.udt_structured_lists l
   where l.deleted_at is null
  union all
  select t.id, coalesce(nullif(t.data ->> 'name', ''), 'List'), t.data ->> 'description', t.created_by, t.organization_id,
         false, false, coalesce(o.created_at, t.created_at), t.updated_at, 'record'::text
    from custom.record t
    left join workbench.udt_structured_lists o on o.id = t.id
   where t.table_id = custom.table_kernel_id()
     and t.data_class = 'table'
     and t.deleted_at is null
     and platform._is_store_pick_list(t.metadata)
     and (o.id is null or (o.deleted_at is not null and platform._older_list_moved_by_switch(o.id)));

comment on view workbench.pick_list_live is
  'LISTS-AFTER-SWITCH: every pick list, wherever it lives — the live older lists, and the store''s Tables of choices that moved with their organization''s switch or were born there (same id), in the older list columns plus lives_in (older | record). Server lane only.';

create or replace view workbench.pick_list_item_live with (security_invoker = true) as
  select i.id, i.list_id, i.label::text as label, i.description, i.help_text, i.group_name::text as group_name,
         i.icon_name::text as icon_name, i.organization_id, i.created_at, i.updated_at, 'older'::text as lives_in
    from workbench.udt_structured_list_items i
    join workbench.udt_structured_lists l on l.id = i.list_id and l.deleted_at is null
   where i.deleted_at is null
  union all
  select c.id, c.table_id, c.data ->> 'name', c.data ->> 'description', c.data ->> 'help_text', c.data ->> 'group_name',
         c.data ->> 'icon', c.organization_id, coalesce(oi.created_at, c.created_at), c.updated_at, 'record'::text
    from workbench.pick_list_live pl
    join custom.record c on c.organization_id = pl.organization_id and c.table_id = pl.id
    left join workbench.udt_structured_list_items oi on oi.id = c.id
   where pl.lives_in = 'record'
     and c.data_class = 'record'
     and c.deleted_at is null;

comment on view workbench.pick_list_item_live is
  'LISTS-AFTER-SWITCH: every live choice of every pick list in workbench.pick_list_live, from wherever its list lives (older rows, or the Records of its Table of choices — same ids), in the older item columns plus lives_in. Server lane only.';

revoke all on workbench.pick_list_live from public, anon, authenticated;
revoke all on workbench.pick_list_item_live from public, anon, authenticated;
grant select on workbench.pick_list_live to service_role;
grant select on workbench.pick_list_item_live to service_role;


-- ── 6. A SWITCHED ORGANIZATION MAKES NOTHING NEW IN THE OLDER STORE ───────────────────────────
-- The decision sits on the two tables every older create door ends in, so every door decides it
-- the same way: create_user_table_with_fields, create_new_user_table_dynamic, create_user_list's
-- older arm, context.provision_scope_dataset, PostgREST inserts, the server's raw SQL and ORM.
create or replace function workbench._switched_org_makes_nothing_older()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
begin
  if platform.older_tables_switched(new.organization_id) then
    raise exception '%',
      case when tg_table_name = 'udt_structured_lists'
           then 'This organization switched its Data tables to the new system, so a new list is made there, not in the older lists. Make it on /lists (or through create_user_list, which makes it in the new system).'
           else 'This organization switched its Data tables to the new system, so a new table is made there, not in the older tables. Make it on /data (New table) — it is born in the new system.' end
      using errcode = '23514',
            detail = 'organization=' || new.organization_id,
            hint = 'Nothing was created. Switch back on the organization''s settings page (Data) returns the organization to the older tables.';
  end if;
  return new;
end;
$$;

comment on function workbench._switched_org_makes_nothing_older() is
  'LISTS-AFTER-SWITCH: refuses an INSERT of a new older table (udt_datasets) or pick list (udt_structured_lists) in an organization whose Data tables switch is on the new system, naming where new ones are made. Bound to both tables so every create door decides it once.';

revoke all on function workbench._switched_org_makes_nothing_older() from public, anon, authenticated;

create or replace trigger _0_switched_org_makes_nothing_older
  before insert on workbench.udt_datasets
  for each row execute function workbench._switched_org_makes_nothing_older();
create or replace trigger _0_switched_org_makes_nothing_older
  before insert on workbench.udt_structured_lists
  for each row execute function workbench._switched_org_makes_nothing_older();


-- ── 7. THE LIST DOORS ASK WHERE THE LIST LIVES ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_lists_summary(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
begin
  if (auth.role() = 'service_role' or p_user_id = ( SELECT auth.uid())) is not true then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  -- lane LISTS-AFTER-SWITCH: the caller's lists wherever they live — the live older lists, and
  -- the store's Tables of choices (copied from an older list that moved with its organization's
  -- switch, or born in the store). A store copy whose older list is still live is the older
  -- list's copy, not a second list: it is listed once, as the older list.
  select jsonb_agg(x.doc order by x.created_at desc)
    into v_result
    from (
      select l.created_at,
             jsonb_build_object(
               'list_id', l.id,
               'list_name', l.list_name,
               'description', l.description,
               'created_at', l.created_at,
               'updated_at', l.updated_at,
               'lives_in', 'older',
               'item_count', (
                 select count(*)
                 from workbench.udt_structured_list_items i
                 where i.list_id = l.id
                   and i.deleted_at is null
               ),
               'group_count', (
                 select count(distinct i.group_name)
                 from workbench.udt_structured_list_items i
                 where i.list_id = l.id
                   and i.deleted_at is null
               )
             ) as doc
        from workbench.udt_structured_lists l
       where l.user_id = p_user_id
         and l.deleted_at is null
      union all
      select coalesce(o.created_at, t.created_at),
             jsonb_build_object(
               'list_id', t.id,
               'list_name', coalesce(nullif(t.data ->> 'name', ''), 'List'),
               'description', t.data ->> 'description',
               'created_at', coalesce(o.created_at, t.created_at),
               'updated_at', t.updated_at,
               'lives_in', 'record',
               'organization_id', t.organization_id,
               'item_count', c.n,
               'group_count', c.g
             )
        from custom.record t
        left join workbench.udt_structured_lists o on o.id = t.id
        cross join lateral (
          select count(*) as n, count(distinct nullif(r.data ->> 'group_name', '')) as g
            from custom.record r
           where r.organization_id = t.organization_id and r.table_id = t.id
             and r.data_class = 'record' and r.deleted_at is null) c
       where t.table_id = custom.table_kernel_id()
         and t.data_class = 'table'
         and t.deleted_at is null
         and t.created_by = p_user_id
         and platform._is_store_pick_list(t.metadata)
         and platform.list_lives_in(t.id) = 'record'
    ) x;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- lane LISTS-AFTER-SWITCH: a list that lives in the store answers from its copy (same id,
  -- same shape, lives_in = record); the store's own ladder decides who may read it.
  if platform.list_lives_in(p_list_id) = 'record' then
    if (auth.role() = 'service_role'
        or coalesce(custom.has_visibility((select auth.uid()), 'record', p_list_id, 'viewer'::public.permission_level), false)) is not true then
      raise exception 'viewer access required for list %', p_list_id using errcode = '42501';
    end if;
    return public._d31_impl_get_user_list_with_items(p_list_id);
  end if;
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id
        -- lane OLDER-DOORS-AFTER-SWITCH: a list that moved with the switch still reads (marked moved).
        and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id))
        and (l.is_public or l.public_read or l.user_id = (select auth.uid()))
    )
    or coalesce(iam.has_access('structured_list', p_list_id, 'viewer'::public.permission_level), false)
  ) is not true then
    raise exception 'viewer access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public._d31_impl_get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_result jsonb;
    v_is_editor boolean := false;
begin
    -- lane LISTS-AFTER-SWITCH: a list that lives in the store answers from its copy.
    if platform.list_lives_in(p_list_id) = 'record' then
      return platform._store_pick_list_document(
        p_list_id, case when auth.role() = 'service_role' then null else (select auth.uid()) end, 'detail');
    end if;

    select (l.user_id = (select auth.uid())
            or iam.has_access('structured_list', l.id, 'editor'::public.permission_level))
      into v_is_editor
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id));

    select jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'created_at', l.created_at, 'updated_at', l.updated_at,
        'is_public', l.is_public, 'public_read', l.public_read,
        'lives_in', 'older',
        'address', '/lists/' || l.id::text,
        -- lane OLDER-DOORS-AFTER-SWITCH: marked moved when the list moved with the switch.
        'moved_to', workbench.older_table_moved_to(l.id),
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id, 'label', i.label,
                        'description', case when v_is_editor then i.description else null end,
                        'help_text', i.help_text
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id));
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_structured_list_for_selection(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
    -- lane LISTS-AFTER-SWITCH: a list that lives in the store answers from its copy; the
    -- store's ladder is the gate (null for a viewer who may not see it, as the older gate is).
    if platform.list_lives_in(p_list_id) = 'record' then
      return platform._store_pick_list_document(
        p_list_id, case when auth.role() = 'service_role' then null else (select auth.uid()) end, 'selection');
    end if;
    select jsonb_build_object(
        'list_id', l.id,
        'list_name', l.list_name,
        'description', l.description,
        'is_public', l.is_public,
        'public_read', l.public_read,
        'lives_in', 'older',
        'moved_to', workbench.older_table_moved_to(l.id),
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id,
                        'label', i.label,
                        'help_text', i.help_text,
                        'group_name', i.group_name,
                        'icon_name', i.icon_name
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      -- lane OLDER-DOORS-AFTER-SWITCH: a list that moved with the switch still reads (marked moved).
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id))
      -- 🚨 THE GATE (DD-169 batch 3). Mirrors udt_structured_lists' std_select + pub_read.
      and (l.created_by = (select auth.uid())
        or l.visibility = 'public'::platform.visibility
        or iam.has_access('structured_list', l.id, 'viewer'::public.permission_level));
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_user_list(p_list_name character varying, p_description text, p_user_id uuid, p_is_public boolean, p_authenticated_read boolean DEFAULT false, p_public_read boolean DEFAULT false, p_items jsonb DEFAULT '[]'::jsonb, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_list_id uuid;
    v_item jsonb;
    v_result jsonb;
begin
    if p_organization_id is null then
      raise exception 'create_user_list requires the initiating organization_id'
        using errcode = '23502',
              hint = 'Pass the organization the person is working in. Never infer it.';
    end if;
    if not (auth.role() = 'service_role' or p_user_id = (select auth.uid())) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    if auth.role() is distinct from 'service_role'
       and not iam.has_org_access(p_organization_id) then
      raise exception 'access denied: caller cannot file a list in organization %', p_organization_id
        using errcode = '42501';
    end if;

    -- lane LISTS-AFTER-SWITCH: an organization whose Data tables moved to the new system makes
    -- its new lists there (a Table of choices), never in the older lists nothing reads.
    if platform.older_tables_switched(p_organization_id) then
      return platform._pick_list_born_in_store(p_organization_id, p_list_name, p_description, coalesce(p_items, '[]'::jsonb));
    end if;

    insert into workbench.udt_structured_lists (
        list_name, description, user_id, is_public, public_read, organization_id
    )
    values (
        p_list_name, p_description, p_user_id, p_is_public, p_public_read, p_organization_id
    )
    returning id into v_list_id;

    for v_item in select * from jsonb_array_elements(p_items) loop
        insert into workbench.udt_structured_list_items (
            label, description, help_text, group_name,
            user_id, is_public, public_read, list_id, organization_id
        )
        values (
            v_item->>'Label', v_item->>'Description', v_item->>'Help Text', v_item->>'Group',
            p_user_id, p_is_public, p_public_read, v_list_id, p_organization_id
        );
    end loop;

    select jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'lives_in', 'older',
        'items', (
            select jsonb_agg(jsonb_build_object(
                'id', i.id, 'label', i.label, 'description', i.description,
                'help_text', i.help_text, 'group_name', i.group_name
            ))
            from workbench.udt_structured_list_items i where i.list_id = l.id
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = v_list_id;

    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_list(p_list_id uuid, p_list_name character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean, p_public_read boolean DEFAULT NULL::boolean, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org  uuid;
  v_item jsonb;
  v_rows jsonb[];
  v_old  uuid;
begin
  -- lane LISTS-AFTER-SWITCH: a list that lives in the store is written through the store's own
  -- doors in the caller's seat (rename / describe the Table; p_items replaces the choices: the
  -- current ones are archived — soft, restorable — and the new ones written).
  if platform.list_lives_in(p_list_id) = 'record' then
    select t.organization_id into v_org
      from custom.record t where t.id = p_list_id and t.data_class = 'table' and t.deleted_at is null limit 1;
    if v_org is null then
      raise exception 'there is no list with the id % in the new system', p_list_id using errcode = '02000';
    end if;
    if (auth.role() = 'service_role'
        or coalesce(custom.has_visibility((select auth.uid()), 'record', p_list_id, 'editor'::public.permission_level), false)) is not true then
      raise exception 'owner access required for list %', p_list_id using errcode = '42501';
    end if;
    if nullif(btrim(coalesce(p_list_name, '')), '') is not null or p_description is not null then
      perform custom.record_update(v_org, p_list_id, jsonb_strip_nulls(jsonb_build_object(
        'name', nullif(btrim(coalesce(p_list_name, '')), ''), 'description', p_description)));
    end if;
    if p_items is not null then
      for v_old in select c.id from custom.record c
                    where c.organization_id = v_org and c.table_id = p_list_id
                      and c.data_class = 'record' and c.deleted_at is null loop
        perform custom.record_delete(v_org, v_old);
      end loop;
      for v_item in select * from jsonb_array_elements(p_items) loop
        continue when coalesce(nullif(btrim(coalesce(v_item ->> 'Label', v_item ->> 'label')), ''), '') = '';
        v_rows := v_rows || jsonb_strip_nulls(jsonb_build_object(
          'name', coalesce(v_item ->> 'Label', v_item ->> 'label'),
          'description', coalesce(v_item ->> 'Description', v_item ->> 'description'),
          'help_text', coalesce(v_item ->> 'Help Text', v_item ->> 'help_text'),
          'group_name', coalesce(v_item ->> 'Group', v_item ->> 'group_name'),
          'icon', coalesce(v_item ->> 'icon_name', v_item ->> 'icon')));
      end loop;
      if coalesce(cardinality(v_rows), 0) > 0 then
        perform custom.record_write_many(v_org, p_list_id, v_rows);
      end if;
    end if;
    return platform._store_pick_list_document(p_list_id, null, 'detail') - 'items_grouped'
           || jsonb_build_object('items', coalesce((
                select jsonb_agg(jsonb_build_object(
                         'id', c.id, 'label', c.data ->> 'name', 'description', c.data ->> 'description',
                         'help_text', c.data ->> 'help_text', 'group_name', c.data ->> 'group_name') order by c.created_at, c.id)
                  from custom.record c
                 where c.organization_id = v_org and c.table_id = p_list_id
                   and c.data_class = 'record' and c.deleted_at is null), '[]'::jsonb));
  end if;

  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id and l.user_id = (select auth.uid())
    )
  ) is not true then
    raise exception 'owner access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_list(
    p_list_id, p_list_name, p_description, p_is_public,
    p_authenticated_read, p_public_read, p_items
  );
end;
$function$;


-- ── 8. THE OLDER TABLE READS THAT STILL ANSWERED UNMARKED ─────────────────────────────────────
-- Same rows. An envelope (an object the door builds) always carries moved_to (null for a live
-- table), as the reads OLDER-DOORS-AFTER-SWITCH marked do; a row or column object and each
-- element of an array carry it only when the table moved, so a live table's bytes are unchanged;
-- a CSV of a moved table begins with one line that says where the table went.

CREATE OR REPLACE FUNCTION public.get_table_row(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  v_row_id uuid := (ref->>'row_id')::uuid;
  j jsonb;
  v_moved jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id));
  END IF;

  j := (
    SELECT to_jsonb(d)
    FROM workbench.udt_dataset_rows d
    WHERE d.table_id = v_table_id
      AND d.id = v_row_id
  );

  IF j IS NULL THEN
    RAISE EXCEPTION 'Row not found';
  END IF;

  -- lane LISTS-AFTER-SWITCH: marked when the table moved with its organization's switch.
  v_moved := workbench.older_table_moved_to(v_table_id);
  IF v_moved IS NOT NULL THEN
    j := j || jsonb_build_object('moved_to', v_moved);
  END IF;

  RETURN j;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_table_cell(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  v_row_id uuid := (ref->>'row_id')::uuid;
  v_field_name text := ref->>'column_name';
  v_display_name text := ref->>'column_display_name';
  v_resolved_field text;
  v_value jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id));
  END IF;

  IF v_field_name IS NULL THEN
    SELECT tf.field_name INTO v_resolved_field
    FROM workbench.udt_dataset_fields tf
    WHERE tf.table_id = v_table_id
      AND tf.display_name = v_display_name
    LIMIT 1;
  ELSE
    v_resolved_field := v_field_name;
  END IF;

  IF v_resolved_field IS NULL THEN
    RAISE EXCEPTION 'Column not found';
  END IF;

  SELECT d.data -> v_resolved_field
  INTO v_value
  FROM workbench.udt_dataset_rows d
  WHERE d.table_id = v_table_id
    AND d.id = v_row_id;

  -- lane LISTS-AFTER-SWITCH: moved_to (null for a live table).
  IF v_value IS NULL THEN
    RETURN jsonb_build_object('value', null, 'field', v_resolved_field, 'moved_to', workbench.older_table_moved_to(v_table_id));
  END IF;

  RETURN jsonb_build_object('value', v_value, 'field', v_resolved_field, 'moved_to', workbench.older_table_moved_to(v_table_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_table_column(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  v_field_name text := ref->>'column_name';
  v_display_name text := ref->>'column_display_name';
  j jsonb;
  v_moved jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id));
  END IF;

  SELECT to_jsonb(tf)
  INTO j
  FROM workbench.udt_dataset_fields tf
  WHERE tf.table_id = v_table_id
    AND (
      (v_field_name IS NOT NULL AND tf.field_name = v_field_name)
      OR (v_field_name IS NULL AND v_display_name IS NOT NULL AND tf.display_name = v_display_name)
    )
  LIMIT 1;

  IF j IS NULL THEN
    RAISE EXCEPTION 'Column not found';
  END IF;

  -- lane LISTS-AFTER-SWITCH: marked when the table moved with its organization's switch.
  v_moved := workbench.older_table_moved_to(v_table_id);
  IF v_moved IS NOT NULL THEN
    j := j || jsonb_build_object('moved_to', v_moved);
  END IF;

  RETURN j;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_table_rows(ref jsonb, limit_rows integer DEFAULT 100, offset_rows integer DEFAULT 0, order_by text DEFAULT 'created_at'::text, order_dir text DEFAULT 'desc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  j jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id));
  END IF;

  IF order_by NOT IN ('created_at','updated_at','id') THEN
    order_by := 'created_at';
  END IF;
  IF lower(order_dir) NOT IN ('asc','desc') THEN
    order_dir := 'desc';
  END IF;

  j := (
    SELECT jsonb_build_object(
      'rows', jsonb_agg(to_jsonb(d)),
      'total', (SELECT COUNT(*)::int FROM workbench.udt_dataset_rows dd WHERE dd.table_id = v_table_id)
    )
    FROM (
      SELECT d.*
      FROM workbench.udt_dataset_rows d
      WHERE d.table_id = v_table_id
      ORDER BY
        CASE WHEN order_by = 'created_at' AND lower(order_dir) = 'asc' THEN d.created_at END ASC,
        CASE WHEN order_by = 'created_at' AND lower(order_dir) = 'desc' THEN d.created_at END DESC,
        CASE WHEN order_by = 'updated_at' AND lower(order_dir) = 'asc' THEN d.updated_at END ASC,
        CASE WHEN order_by = 'updated_at' AND lower(order_dir) = 'desc' THEN d.updated_at END DESC,
        CASE WHEN order_by = 'id' AND lower(order_dir) = 'asc' THEN d.id END ASC,
        CASE WHEN order_by = 'id' AND lower(order_dir) = 'desc' THEN d.id END DESC,
        -- `d.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        d.id DESC
      LIMIT limit_rows OFFSET offset_rows
    ) d
  );

  -- lane LISTS-AFTER-SWITCH: moved_to (null for a live table).
  RETURN COALESCE(j, jsonb_build_object('rows','[]'::jsonb,'total',0))
         || jsonb_build_object('moved_to', workbench.older_table_moved_to(v_table_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_table_columns(ref jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  -- lane LISTS-AFTER-SWITCH: each column carries moved_to when the table moved with its switch.
  SELECT COALESCE(
    jsonb_agg((to_jsonb(tf) - 'validation_rules' - 'default_value')
              || case when m.moved_to is null then '{}'::jsonb else jsonb_build_object('moved_to', m.moved_to) end
              ORDER BY tf.field_order, tf.created_at),
    '[]'::jsonb
  )
  FROM workbench.udt_dataset_fields tf
  CROSS JOIN (SELECT workbench.older_table_moved_to((ref->>'table_id')::uuid) AS moved_to) m
  WHERE tf.table_id = (ref->>'table_id')::uuid;
$function$;

CREATE OR REPLACE FUNCTION public.udt_table_profile(p_table_id uuid, p_preview_values integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_preview INTEGER := LEAST(GREATEST(COALESCE(p_preview_values, 12), 1), 100);
    v_result  JSONB;
    v_rows    INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM workbench.udt_datasets WHERE id = p_table_id) THEN
        perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, or your access may not reach it', p_table_id));
    END IF;

    SELECT count(*)::int INTO v_rows
    FROM workbench.udt_dataset_rows WHERE table_id = p_table_id;

    SELECT jsonb_build_object(
        'success',    true,
        'table_id',   p_table_id,
        'total_rows', v_rows,
        -- lane LISTS-AFTER-SWITCH: moved_to (null for a live table).
        'moved_to',   workbench.older_table_moved_to(p_table_id),
        'columns',    COALESCE(jsonb_agg(col ORDER BY col_order), '[]'::jsonb)
    )
    INTO v_result
    FROM (
        SELECT
            f.field_order AS col_order,
            jsonb_build_object(
                'field_name',     f.field_name,
                'display_name',   f.display_name,
                'data_type',      f.data_type::text,
                'is_required',    f.is_required,
                'format',         f.metadata -> 'format',
                'filled',         s.filled,
                'blank',          s.blank,
                'distinct_count', s.distinct_count,
                'max_length',     s.max_length,
                'looks_numeric',  s.looks_numeric,
                'looks_url',      s.looks_url,
                'looks_email',    s.looks_email,
                'looks_bool',     s.looks_bool,
                'top_values',     COALESCE(s.top_values, '[]'::jsonb)
            ) AS col
        FROM workbench.udt_dataset_fields f
        CROSS JOIN LATERAL (
            WITH scoped AS (
                SELECT nullif(btrim(r.data ->> f.field_name), '') AS v
                FROM workbench.udt_dataset_rows r
                WHERE r.table_id = p_table_id
            )
            SELECT
                count(v)::int                          AS filled,
                count(*) FILTER (WHERE v IS NULL)::int  AS blank,
                count(DISTINCT v)::int                  AS distinct_count,
                COALESCE(max(length(v)), 0)::int        AS max_length,
                count(*) FILTER (
                    WHERE v ~ '^-?[0-9][0-9,]*(\.[0-9]+)?$')::int  AS looks_numeric,
                count(*) FILTER (
                    WHERE v ~* '^https?://\S+$')::int              AS looks_url,
                count(*) FILTER (
                    WHERE v ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$')::int AS looks_email,
                count(*) FILTER (
                    WHERE lower(v) IN ('true','false','yes','no','y','n','1','0'))::int AS looks_bool,
                (
                    SELECT jsonb_agg(jsonb_build_object('value', t.v, 'count', t.c)
                                     ORDER BY t.c DESC, t.v ASC)
                    FROM (
                        SELECT v, count(*)::int AS c
                        FROM scoped
                        WHERE v IS NOT NULL AND length(v) <= 300
                        GROUP BY v
                        ORDER BY count(*) DESC, v ASC
                        LIMIT v_preview
                    ) t
                ) AS top_values
            FROM scoped
        ) s
        WHERE f.table_id = p_table_id
    ) cols;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.udt_column_facets(p_table_id uuid, p_field_name text, p_limit integer DEFAULT 50, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
    v_result JSONB;
BEGIN
    IF p_field_name IS NULL OR btrim(p_field_name) = '' THEN
        RAISE EXCEPTION 'udt_column_facets: p_field_name is required';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id AND field_name = p_field_name
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM workbench.udt_datasets WHERE id = p_table_id) THEN
            perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, or your access may not reach it', p_table_id));
        END IF;
        RAISE EXCEPTION 'udt_column_facets: field % is not a column of table %',
            p_field_name, p_table_id;
    END IF;

    WITH scoped AS (
        SELECT nullif(btrim(r.data ->> p_field_name), '') AS v
        FROM workbench.udt_dataset_rows r
        WHERE r.table_id = p_table_id
          AND (p_search_term IS NULL
               OR r.data::text ILIKE '%' || p_search_term || '%')
    ),
    totals AS (
        SELECT
            count(*)::int                                              AS total_rows,
            count(v)::int                                              AS filled,
            count(*) FILTER (WHERE v IS NULL)::int                     AS blank,
            count(DISTINCT v)::int                                     AS distinct_count,
            COALESCE(max(length(v)), 0)::int                           AS max_length,
            count(DISTINCT v) FILTER (WHERE length(v) > 300)::int      AS unlistable
        FROM scoped
    ),
    top_values AS (
        SELECT v, count(*)::int AS c
        FROM scoped
        WHERE v IS NOT NULL AND length(v) <= 300
        GROUP BY v
        ORDER BY count(*) DESC, v ASC
        LIMIT v_limit
    )
    SELECT jsonb_build_object(
        'success',        true,
        'table_id',       p_table_id,
        'field_name',     p_field_name,
        'total_rows',     t.total_rows,
        'filled',         t.filled,
        'blank',          t.blank,
        'distinct_count', t.distinct_count,
        'max_length',     t.max_length,
        'unlistable',     t.unlistable,
        'limit',          v_limit,
        'truncated',      (t.distinct_count - t.unlistable) > v_limit,
        -- lane LISTS-AFTER-SWITCH: moved_to (null for a live table).
        'moved_to',       workbench.older_table_moved_to(p_table_id),
        'values',         COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', tv.v, 'count', tv.c)
                             ORDER BY tv.c DESC, tv.v ASC)
            FROM top_values tv
        ), '[]'::jsonb)
    )
    INTO v_result
    FROM totals t;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.export_user_table_as_csv(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_csv TEXT := '';
    v_header TEXT := '';
    v_fields JSONB;
    v_field JSONB;
    v_field_name TEXT;
    v_row RECORD;
    v_value TEXT;
    v_moved JSONB := workbench.older_table_moved_to(p_table_id);
BEGIN
    SELECT jsonb_agg(ROW_TO_JSON(f)::jsonb ORDER BY field_order)
    INTO v_fields
    FROM workbench.udt_dataset_fields f
    WHERE table_id = p_table_id;

    IF v_fields IS NULL OR jsonb_array_length(v_fields) = 0 THEN
        RETURN '';
    END IF;

    FOR v_index IN 0..jsonb_array_length(v_fields)-1 LOOP
        v_field := v_fields->v_index;

        IF v_header != '' THEN
            v_header := v_header || ',';
        END IF;

        v_header := v_header || '"' || REPLACE(v_field->>'display_name', '"', '""') || '"';
    END LOOP;

    v_csv := v_header || E'\n';

    FOR v_row IN
        SELECT id, data
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id
        ORDER BY created_at
    LOOP
        v_header := '';

        FOR v_index IN 0..jsonb_array_length(v_fields)-1 LOOP
            v_field := v_fields->v_index;
            v_field_name := v_field->>'field_name';

            IF v_header != '' THEN
                v_header := v_header || ',';
            END IF;

            v_value := v_row.data->>v_field_name;

            IF v_value IS NOT NULL THEN
                v_header := v_header || '"' || REPLACE(v_value, '"', '""') || '"';
            ELSE
                v_header := v_header || '""';
            END IF;
        END LOOP;

        v_csv := v_csv || v_header || E'\n';
    END LOOP;

    -- lane LISTS-AFTER-SWITCH: a moved table's export says so on its first line.
    IF v_moved IS NOT NULL THEN
        v_csv := '"' || REPLACE(v_moved->>'says', '"', '""') || '"' || E'\n' || v_csv;
    END IF;

    RETURN v_csv;
END;
$function$;

CREATE OR REPLACE FUNCTION public.export_user_table_as_csv(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_csv TEXT := '';
    v_header TEXT := '';
    v_fields JSONB;
    v_field JSONB;
    v_field_name TEXT;
    v_valid_sort_field TEXT;
    v_row RECORD;
    v_value TEXT;
    v_query TEXT;
    v_moved JSONB := workbench.older_table_moved_to(p_table_id);
BEGIN
    SELECT jsonb_agg(ROW_TO_JSON(f)::jsonb ORDER BY field_order)
    INTO v_fields
    FROM workbench.udt_dataset_fields f
    WHERE table_id = p_table_id;

    IF v_fields IS NULL OR jsonb_array_length(v_fields) = 0 THEN
        RETURN '';
    END IF;

    IF p_sort_field IS NOT NULL THEN
        SELECT field_name INTO v_valid_sort_field
        FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id
        AND (field_name = p_sort_field OR display_name = p_sort_field)
        LIMIT 1;
    END IF;

    FOR v_index IN 0..jsonb_array_length(v_fields)-1 LOOP
        v_field := v_fields->v_index;
        IF v_header != '' THEN
            v_header := v_header || ',';
        END IF;
        v_header := v_header || '"' || REPLACE(v_field->>'display_name', '"', '""') || '"';
    END LOOP;

    v_csv := v_header || E'\n';

    v_query := 'SELECT id, data FROM workbench.udt_dataset_rows WHERE table_id = $1';

    IF v_valid_sort_field IS NOT NULL THEN
        v_query := v_query || ' ORDER BY (data->>''' || v_valid_sort_field || ''')';
        IF p_sort_direction = 'desc' THEN
            v_query := v_query || ' DESC';
        ELSE
            v_query := v_query || ' ASC';
        END IF;
    ELSE
        v_query := v_query || ' ORDER BY created_at';
    END IF;

    FOR v_row IN EXECUTE v_query USING p_table_id
    LOOP
        v_header := '';
        FOR v_index IN 0..jsonb_array_length(v_fields)-1 LOOP
            v_field := v_fields->v_index;
            v_field_name := v_field->>'field_name';
            IF v_header != '' THEN
                v_header := v_header || ',';
            END IF;
            v_value := v_row.data->>v_field_name;
            IF v_value IS NOT NULL THEN
                v_header := v_header || '"' || REPLACE(v_value, '"', '""') || '"';
            ELSE
                v_header := v_header || '""';
            END IF;
        END LOOP;
        v_csv := v_csv || v_header || E'\n';
    END LOOP;

    -- lane LISTS-AFTER-SWITCH: a moved table's export says so on its first line.
    IF v_moved IS NOT NULL THEN
        v_csv := '"' || REPLACE(v_moved->>'says', '"', '""') || '"' || E'\n' || v_csv;
    END IF;

    RETURN v_csv;
END;
$function$;
