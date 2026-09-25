-- INVERSE of migrations/campaign/moveout_a_move_finds_the_destination_s_home.sql.
-- Restores custom.table_move(uuid, uuid, integer) byte for byte to the body it replaced
-- (based-on e7e6ba70790acd0160a86b70f0713c314d6f666061f37c462e92d717ffd3e32c). An Organization
-- record the up made for a destination is left in place (a record, never deleted).
set local lock_timeout = '2s';
set local statement_timeout = '60s';

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
  v_pending uuid[];
  v_ids     uuid[];
  v_home_from uuid;
  v_home_to   uuid;
  v_n       bigint;
  v_wave    integer := 0;
  v_moved   jsonb := '{}'::jsonb;
  v_version integer;
  v_events  bigint;
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

  -- IN CONTAINMENT ORDER (SC-1-TAILS). The containment guard and the wall judge every row as it
  -- lands, so a row moves only once everything it points at that is ALSO moving has moved: its
  -- container (parent_id), its Table (table_id), the Table its Field belongs to. The Table first,
  -- then its Fields and rows, then the Tables inside those rows, then theirs — one statement a
  -- wave. The moved Table itself is re-homed under the new organization's own record (or at its
  -- top); a row whose container moves with it keeps its container.
  v_pending := v_tables || v_fields || v_recs;
  loop
    v_wave := v_wave + 1;
    select coalesce(array_agg(x.id), array[]::uuid[]) into v_ids
      from custom.record x
     where x.organization_id = v_from
       and x.id = any (v_pending)
       and not exists (
             select 1 from custom.record p
              where p.organization_id = v_from
                and p.id = any (v_pending)
                and p.id <> x.id
                and (   p.id = x.table_id
                     or p.id = nullif(x.data ->> 'entity_definition_id', '')::uuid
                     -- a Field waits on the Tables it points at when they move too (the wall judges it)
                     or (x.table_id = custom.field_kernel_id()
                         and (p.id = nullif(x.data ->> 'relation_target', '')::uuid
                              or p.id = nullif(x.data -> 'config' ->> 'options_table_id', '')::uuid))
                     or (x.id <> v_id and p.id = custom.containment_parent(x.data))
                     -- a row is judged against its Table's Fields, so they land first
                     or (x.table_id <> custom.field_kernel_id()
                         and p.table_id = custom.field_kernel_id()
                         and p.data ->> 'entity_definition_id' = x.table_id::text)));
    exit when coalesce(array_length(v_ids, 1), 0) = 0;

    -- THE EDGES OF THIS WAVE'S ROWS GO FIRST, AND ASLEEP. A row that lands in the new organization
    -- re-states its relation edges there (custom._relation_associations, as an INSERT), and an
    -- edge still filed under the old organization would be judged there against a Field that has
    -- already left (platform.enforce_relation_edge: "there is no field … in this organization").
    -- So each live edge starting at a row of this wave is re-filed under the new organization
    -- while retired and marked as this move's (the edge contract does not judge a retired row);
    -- the row's own trigger wakes the ones its value still states, and the sweep after the loop
    -- wakes the rest. An edge that was already retired is re-filed as it is.
    update platform.associations a
       set organization_id  = p_to_organization_id,
           deleted_at       = coalesce(a.deleted_at, now()),
           deleted_via_type = case when a.deleted_at is null then 'table_move' else a.deleted_via_type end,
           deleted_via_id   = case when a.deleted_at is null then v_id else a.deleted_via_id end
     where a.organization_id = v_from
       and a.source_type = 'record' and a.source_id = any (v_ids)
       and a.relation_field_id is not null;

    update custom.record x
       set organization_id = p_to_organization_id,
           data = case
                    when x.id <> v_id then x.data
                    when custom.containment_parent(x.data) is null then x.data
                    when custom.containment_parent(x.data) = any (v_all) then x.data
                    when custom.containment_parent(x.data) = v_home_from and v_home_to is not null
                      then jsonb_set(x.data, '{parent_id}', to_jsonb(v_home_to::text))
                    else x.data - 'parent_id' end
     where x.organization_id = v_from
       and x.id = any (v_ids);
    get diagnostics v_n = row_count;
    exit when v_n = 0;
    v_pending := array(select p.id from custom.record p
                        where p.organization_id = v_from and p.id = any (v_pending));
    exit when coalesce(array_length(v_pending, 1), 0) = 0;
    if v_wave > 64 then exit; end if;
  end loop;
  -- The edges this move put to sleep and no row's trigger woke: woken, in the new organization.
  update platform.associations a
     set deleted_at = null, deleted_via_type = null, deleted_via_id = null
   where a.organization_id = p_to_organization_id
     and a.deleted_via_type = 'table_move' and a.deleted_via_id = v_id
     and a.deleted_at is not null;
  if coalesce(array_length(v_pending, 1), 0) > 0 then
    raise exception 'Some of what % carries points at itself in a circle, so nothing moved.', v_plan #>> '{table,name}'
      using errcode = '55000',
            hint = 'REC-8: containment is a tree. The store found rows that wait on each other; report this with the table''s name.';
  end if;
  v_moved := v_moved || jsonb_build_object(
    'tables',  (select count(*) from custom.record t where t.organization_id = p_to_organization_id and t.id = any (v_tables)),
    'fields',  coalesce(array_length(v_fields, 1), 0),
    'records', coalesce(array_length(v_recs, 1), 0),
    'waves',   v_wave);

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
  -- AN EDGE IS FILED UNDER THE ORGANIZATION OF THE ROW IT STARTS AT (REL-12). One that starts at
  -- a moving row goes with it; one that starts at a row that stays and points at a moving row
  -- stays, and holds its value across the wall the plan already found open. An edge from
  -- something that is not a record (a file, a note) naming a moving row goes with the row, as
  -- before.
  update platform.associations a set organization_id = p_to_organization_id
   where a.organization_id = v_from
     and ((a.source_type = 'record' and a.source_id = any (v_all))
          or (a.source_type <> 'record' and a.target_type = 'record' and a.target_id = any (v_all)));

  -- ITS HISTORY GOES WITH IT. A version is the history OF A ROW; the row now answers in the new
  -- organization, so "who changed this and when" must still answer there.
  update history.row_versions v set organization_id = p_to_organization_id
   where v.entity_type = 'custom.record' and v.organization_id = v_from and v.row_id = any (v_all);

  -- THE MOVE ITSELF IS A VERSION OF EACH TABLE IT CARRIED. The store's capture triggers pair old
  -- and new rows by (organization, id), so a row that changed organization is not paired by
  -- them; this writes the one version per Table that says what happened, who did it, from where.
  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier,
          migration_id, operation_name)
  select 'custom.record', t.id, t.organization_id, t.version, 'UPDATE',
         to_jsonb(t) || jsonb_build_object('moved_from_organization_id', v_from,
                                           'moved_with_table_id', case when t.id <> v_id then v_id end),
         v_me, platform.actor_tier(), null, 'table_move'
    from custom.record t
   where t.organization_id = p_to_organization_id and t.id = any (v_tables) and t.data_class = 'table';

  -- A MOVE IS A CHANGE EVENT (SC-1-TAILS). The capture triggers pair by (organization, id) and so
  -- see nothing here; the door writes the pair itself, on the store's one outbox, so matrx-local's
  -- sync, pg_notify('records_changed') and the realtime broadcast learn of it in this transaction:
  -- every live row it moved is `deleted` where it was and `created` where it is. Written AFTER the
  -- outbox re-key above, so these rows are never re-keyed themselves.
  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  select side.org, 'records.changed', x.id, x.table_id, side.op, '[]'::jsonb,
         jsonb_build_object(
           'user_id',   v_me,
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  'table_move',
           'moved_table_id', v_id,
           'moved_from_organization_id', v_from,
           'moved_to_organization_id', p_to_organization_id),
         side.org::text || ':' || x.id::text || ':' || coalesce(x.version, 0)::text || ':' || side.op
           || ':table_move:' || txid_current()::text,
         nullif(current_setting('custom.op_id', true), '')::uuid
    from custom.record x
   cross join (values (v_from, 'deleted'), (p_to_organization_id, 'created')) side(org, op)
   where x.organization_id = p_to_organization_id and x.id = any (v_all) and x.deleted_at is null
   order by side.op desc, x.id
  on conflict do nothing;
  get diagnostics v_events = row_count;
  v_moved := v_moved || jsonb_build_object('events', v_events);

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
$function$;
