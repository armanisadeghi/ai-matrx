-- inverse of migrations/campaign/suitehealth2_every_door_decides_in_its_own_body.sql — restores the five bodies exactly as they were live on
-- production and the dev clone on 2026-09-25 (md5 of pg_get_functiondef identical on both).

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.where_id_opens(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := custom.query_principal();
  v_tables   uuid := custom.table_kernel_id();
  v_shows    uuid := custom.presentation_kernel_id();
  v_id       uuid := p_id;
  v_org      uuid;
  v_table    uuid;
  v_class    text;
  v_data     jsonb;
  v_live     boolean;
  v_quar     boolean;
  v_wall     uuid;
  v_kind     text;
  v_path     text;
  v_first    uuid;
  v_booking  boolean;
begin
  -- A signed-out caller is nobody's; the anonymous doors of this store decide their own requests.
  if p_id is null or v_me is null then
    return null;
  end if;

  -- ── 1. A RECORD OF THE STORE — a Table, a record, a dashboard, a digest rule ───────────────
  select r.organization_id, r.table_id, r.data_class, r.data, r.deleted_at is null,
         coalesce(r.metadata ->> 'quarantine', 'false') = 'true'
    into v_org, v_table, v_class, v_data, v_live, v_quar
    from custom.record r
   where r.id = p_id
   limit 1;

  if v_org is null then
    -- A MERGED ID ANSWERS WITH ITS SURVIVOR, as custom.record_resolve does: the old id is not a
    -- secret; what it resolves to is a record, decided on the one ladder like any other.
    select a.organization_id, a.new_id into v_org, v_id
      from custom.record_alias a
     where a.old_id = p_id and a.revoked_at is null
     limit 1;
    if v_org is not null then
      select r.table_id, r.data_class, r.data, r.deleted_at is null,
             coalesce(r.metadata ->> 'quarantine', 'false') = 'true'
        into v_table, v_class, v_data, v_live, v_quar
        from custom.record r
       where r.organization_id = v_org and r.id = v_id;
      if not found then
        v_org := null;
      end if;
    end if;
  end if;

  if v_org is not null then
    if v_table = v_tables then
      v_kind := 'table';      v_wall := v_id;
      v_path := '/data-v2/' || v_id::text;
    elsif v_table = v_shows and v_class = custom.dashboard_class() then
      -- custom.dashboards: ONE WALL, AND IT IS THE TABLE'S.
      v_kind := 'dashboard';  v_wall := nullif(v_data ->> 'subject_table_id', '')::uuid;
      v_path := '/data-v2/' || v_wall::text || '?dashboard=' || v_id::text;
    elsif v_class = 'rule' and v_data ? 'subscription' then
      -- custom.subscriptions: the Table, and then the recipient or an admin of the Table.
      v_kind := 'digest';     v_wall := nullif(v_data ->> 'scope_table_id', '')::uuid;
      if not (nullif(v_data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me
              or custom._where_id_may_open(v_org, v_wall, 'admin'::public.permission_level)) then
        return null;
      end if;
      v_path := '/data-v2/' || v_wall::text || '?rail=notifications&item=' || v_id::text;
    elsif exists (select 1 from custom.record k
                   where k.id = v_table and k.table_id = v_tables and k.data_class = 'kernel') then
      -- A Field, a Rule, a Person row: part of how a table is built. Real, and screenless.
      v_kind := 'table_part'; v_wall := v_id;
      v_path := null;
    else
      -- DOOR-17: a quarantined submission is invisible to every read until a Rule clears it.
      if v_quar then
        return null;
      end if;
      v_kind := 'record';     v_wall := v_id;
      v_path := '/data-v2/' || v_table::text || '?record=' || v_id::text;
    end if;

  else
    -- ── 2. A FORM OR A BOOKING PAGE — custom.forms / custom.bookings wall on the Table ───────
    select f.organization_id, f.table_id, f.deleted_at is null, coalesce(f.presentation ? 'booking', false)
      into v_org, v_wall, v_live, v_booking
      from custom.anon_form f
     where f.id = p_id;
    if v_org is not null then
      v_kind := case when v_booking then 'booking' else 'form' end;
      v_path := '/data-v2/' || v_wall::text || '?rail=' || case when v_booking then 'bookings' else 'forms' end
                || '&item=' || p_id::text;
    else
      -- ── 3. A PORTAL — custom.list_portals walls on its clients Table ─────────────────────
      select p.organization_id, p.client_table_id, p.archived_at is null
        into v_org, v_wall, v_live
        from custom.portal p
       where p.id = p_id;
      if v_org is not null then
        v_kind := 'portal';
        -- The row opens on a table the portal SHOWS, as the hub's Portals row does: its clients
        -- table's own rail truthfully says the portal is not part of it (VERIFIER-15 H5).
        select pt.table_id into v_first
          from custom.portal_table pt
          left join custom.record t on t.organization_id = pt.organization_id and t.id = pt.table_id
         where pt.portal_id = p_id
         order by coalesce(t.data ->> 'name', ''), pt.table_id
         limit 1;
        v_path := '/data-v2/' || coalesce(v_first, v_wall)::text || '?rail=portals&item=' || p_id::text;
      else
        -- ── 4. A RENDERED DOCUMENT — custom.doc_render_read walls on its record ────────────
        select d.organization_id, d.record_id, d.deleted_at is null
          into v_org, v_wall, v_live
          from custom.doc_render d
         where d.id = p_id;
        if v_org is null then
          return null;
        end if;
        v_kind := 'rendered_document';
        v_path := '/d/' || p_id::text;
      end if;
    end if;
  end if;

  if not custom._where_id_may_open(v_org, v_wall) then
    return null;
  end if;

  return jsonb_build_object(
    'kind',            v_kind,
    'organization_id', v_org,
    'path',            v_path,
    'live',            coalesce(v_live, true),
    'resolved_id',     v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_home(p_table_id uuid, p_to_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_opens jsonb;
  v_plan  jsonb;
begin
  if p_table_id is null or v_me is null then
    return null;
  end if;
  -- THE ACCESS DECISION IS THE STORE'S ONE ANSWER: custom.where_id_opens answers only when this
  -- person may open the Table (the organization wall, then the ladder), and says nothing about a
  -- Table she was not given — the same silence as an id that does not exist.
  v_opens := custom.where_id_opens(p_table_id);
  if v_opens is null or v_opens ->> 'kind' is distinct from 'table' then
    return null;
  end if;
  -- NOT custom.assert_client_may_open: its first question is the organization wall
  -- (custom.assert_client_may_reach), which refuses a person a table was SHARED with from
  -- outside while the organization's outside-access switch is off — and she may open it (the
  -- share door and where_id_opens both say so). The name of where it lives is hers to read
  -- whenever the table is (SHARE-GATE-OFF's walk: "Lives in: Organization unknown" for an
  -- outsider while the banner below named the organization — a screen that lied).
  v_plan := custom._table_move_plan((v_opens ->> 'resolved_id')::uuid, p_to_organization_id, v_me);
  if v_plan is null then
    return null;
  end if;
  return (v_plan - '_carry')
         || jsonb_build_object('path', v_opens ->> 'path', 'live', v_opens -> 'live');
end;
$function$;

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
  v_made_home boolean := false;
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

  -- A TABLE HAS TO LIVE SOMEWHERE, AND WHERE IT LIVES IN THE DESTINATION IS THE STORE'S FACT, NOT
  -- THE PERSON'S (MOVE-AND-OUTSIDER, VERIFIER-19 finding 1). A table the app made sits in its own
  -- Home record ("<name> Home"), which stays where it is; a table in the source organization's
  -- record goes to the destination's record; so the moved Table is always put in the destination
  -- organization's own record. An organization the store never gave one (G11 made the Home
  -- optional at provision) gets it here, named after the organization, in the same transaction:
  -- a person is never refused for a fact the store owns. The answer says it was made.
  if v_home_to is null then
    insert into custom.record (organization_id, table_id, data)
    values (p_to_organization_id, custom.organization_kernel_id(),
            jsonb_build_object('name', coalesce(nullif(btrim(v_to_name), ''), 'Organization')))
    returning id into v_home_to;
    v_made_home := true;
  end if;

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
                    when custom.containment_parent(x.data) = any (v_all) then x.data
                    else jsonb_set(x.data, '{parent_id}', to_jsonb(v_home_to::text)) end
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
    'waves',   v_wave,
    'home',    jsonb_build_object('id', v_home_to, 'made', v_made_home));

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

CREATE OR REPLACE FUNCTION custom.doc_render_read(p_organization_id uuid, p_render_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_d record; v_org_name text;
begin
  -- A DOCUMENT IS FOUND BY ITS ID, AND ONLY BY ITS ID (2026-09-23). This used to look for the
  -- document inside p_organization_id — which every client filled with the person's currently
  -- SELECTED organization — so the link `document_propose` hands a person failed for its own
  -- author whenever another organization happened to be selected. Access is decided by the
  -- PERSON (organization-is-the-container rule 5): the organization checked is the one the
  -- document actually lives in, and p_organization_id is accepted and ignored so no caller breaks.
  select d.id, d.organization_id, d.template_id, d.record_id, d.table_id, d.template_version,
         d.body, d.content_hash, d.rendered_at
    into v_d
    from custom.doc_render d
   where d.id = p_render_id and d.deleted_at is null;
  if v_d.id is null then
    raise exception 'There is no document %.', p_render_id
      using errcode = '02000';
  end if;
  -- THE ACCESS QUESTION IS ASKED ABOUT THE RECORD, IN ITS OWN ORGANIZATION, which is where the
  -- words came from. Whoever may open the record may read what it says.
  perform custom.assert_client_may_open(v_d.organization_id, v_d.record_id, 'custom.doc_render_read',
                                        'viewer'::public.permission_level, 'record');
  select o.name into v_org_name from iam.organizations o where o.id = v_d.organization_id;
  return jsonb_build_object('render_id', v_d.id, 'template_id', v_d.template_id,
                            'record_id', v_d.record_id, 'table_id', v_d.table_id,
                            'document_version', v_d.template_version, 'body', v_d.body,
                            'content_hash', v_d.content_hash, 'rendered_at', v_d.rendered_at,
                            'organization_id', v_d.organization_id,
                            'organization_name', v_org_name,
                            -- Whether this person belongs to that organization, so the page offers
                            -- "switch to it" only to a member and never to somebody it was shared with.
                            'viewer_is_member', iam.has_org_access(v_d.organization_id));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.resolve_context(p_entity_type text, p_entity_id uuid, p_record_ids uuid[] DEFAULT NULL::uuid[], p_table_ids uuid[] DEFAULT NULL::uuid[], p_system_item_refs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid := custom.query_principal();
  v_org_id      uuid;
  v_project_id  uuid;
  v_task_id     uuid;
  v_cands       jsonb := '[]'::jsonb;   -- [{record_id, via}] in contribution order
  v_checks      jsonb := '[]'::jsonb;   -- one row per candidate: admitted or refused, and why
  v_withheld    jsonb := '[]'::jsonb;   -- a field the person may not see on an admitted record
  v_admitted    jsonb := '[]'::jsonb;   -- [{record_id, organization_id, table_id, name, type_label, via}]
  v_tables      jsonb := '[]'::jsonb;
  v_scope_labels jsonb := '{}'::jsonb;
  v_variables   jsonb := '{}'::jsonb;
  v_sources     jsonb := '{}'::jsonb;
  v_cells       jsonb := '{}'::jsonb;
  v_cell        jsonb;
  v_where       jsonb;
  v_doc         jsonb;
  v_hidden      jsonb;
  v_table       custom.record;
  v_title_field text;
  v_label       text;
  v_name        text;
  v_inject      text;
  v_org         uuid;
  v_rec         uuid;
  v_via         text;
  v_versions    jsonb;
  c             jsonb;
  v_cap         bigint;
  v_val         jsonb;
  v_whole       jsonb;
  a             jsonb;
  f             record;
  rec           record;
  v_levels      jsonb;
  v_rcache      jsonb := '{}'::jsonb;
  v_wheres      jsonb;
  v_tcache      jsonb := '{}'::jsonb;
  v_tid         uuid;
  v_tbl         jsonb;
begin
  if v_me is null then
    raise exception 'custom.resolve_context resolves context for a person, and nobody is signed in.'
      using errcode = '42501',
            hint = 'The server calls this door acting as the person operating the agent (DOOR-1).';
  end if;

  -- ── THE ENTITY: where the turn lives (read exactly as public.resolve_full_context reads it) ─
  if p_entity_type = 'task' then
    select t.project_id, p.organization_id, t.id
      into v_project_id, v_org_id, v_task_id
      from workspace.tasks t left join workspace.projects p on t.project_id = p.id
     where t.id = p_entity_id;
  elsif p_entity_type = 'project' then
    select p.organization_id, p.id into v_org_id, v_project_id
      from workspace.projects p where p.id = p_entity_id;
  elsif p_entity_type = 'conversation' then
    select c2.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'conversation' and a2.source_id = c2.id
               and a2.target_type = 'project' and a2.organization_id = c2.organization_id
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           c2.task_id
      into v_org_id, v_project_id, v_task_id
      from chat.conversation c2 where c2.id = p_entity_id;
  elsif p_entity_type = 'note' then
    select n.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'project'
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'task'
             order by a2.position nulls last, a2.created_at, a2.id limit 1)
      into v_org_id, v_project_id, v_task_id
      from workbench.notes n where n.id = p_entity_id;
  end if;

  -- ── THE CANDIDATES, in the old resolver's own order: the entity's tags, else its project's,
  --    then the selection. A tag is read by its TARGET ID whichever token the edge carries —
  --    `scope` today, its copy `record` (SC-4 P4, role context_tag; `custom_record` is the retired
  --    tier-2 token, read too so an edge under either store token is the same tag: grouped by
  --    target id, one candidate) (same id, CUT-4) — and in
  --    ANY organization, because the edge belongs to the entity's organization and the record
  --    to its own (Brightline's task, Harborline's app).
  select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'entity_tag') order by t.first_at, t.target_id), '[]'::jsonb)
    into v_cands
    from (select a2.target_id, min(a2.created_at) as first_at
            from platform.associations_live a2
           where a2.source_type = p_entity_type and a2.source_id = p_entity_id
             and a2.target_type in ('scope', 'record', 'custom_record')
           group by a2.target_id) t;

  if jsonb_array_length(v_cands) = 0 and v_project_id is not null and p_entity_type <> 'project' then
    select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'project_tag') order by t.first_at, t.target_id), '[]'::jsonb)
      into v_cands
      from (select a2.target_id, min(a2.created_at) as first_at
              from platform.associations_live a2
             where a2.source_type = 'project' and a2.source_id = v_project_id
               and a2.target_type in ('scope', 'record', 'custom_record')
             group by a2.target_id) t;
  end if;

  if p_record_ids is not null then
    select v_cands || coalesce(jsonb_agg(jsonb_build_object('record_id', s.id, 'via', 'selection') order by s.ord), '[]'::jsonb)
      into v_cands
      from unnest(p_record_ids) with ordinality as s(id, ord)
     where s.id is not null
       and not (v_cands @> jsonb_build_array(jsonb_build_object('record_id', s.id)));
  end if;

  -- ── EVERY CANDIDATE CHECKED FOR THE PERSON — the one rule changed on purpose ──────────────
  -- The old resolver checked only the selection; a tag and a project's tag delivered every
  -- cell to whoever ran the turn. Here each record, however it arrived, is asked through
  -- custom.where_id_opens: organization members, direct and outside grants, and (P7's read
  -- arm) a scope membership on that record. What is refused is NAMED in `checks`, never
  -- dropped in silence.
  -- STORE-READ-PERF-2: the ladder is asked about every candidate at once, for the person the read
  -- door reads as (auth.uid(), as custom.read_record does), and each read below is handed its
  -- answer; the Table's value and choice plans ride from one record to the next in v_rcache.
  v_levels := custom.levels_of(auth.uid(),
                (select array_agg((e ->> 'record_id')::uuid) from jsonb_array_elements(v_cands) e));
  -- STORE-READ-PERF-3: where each candidate opens, asked ONCE for the whole set — one lookup of
  -- their homes, the organization wall once per organization, and the ladder's viewer answer
  -- taken from v_levels (asked above for the same person) — each answer exactly
  -- custom.where_id_opens(<id>).
  v_wheres := custom._where_ids_open_with(
                (select array_agg((e ->> 'record_id')::uuid) from jsonb_array_elements(v_cands) e),
                auth.uid(), v_levels);
  for c in select value from jsonb_array_elements(v_cands) loop
    v_rec := (c ->> 'record_id')::uuid;
    v_via := c ->> 'via';
    v_where := v_wheres -> (v_rec::text);
    if v_where is null then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_opened',
        'says', 'This scope is not one you may open in the record store — it has not been shared with you, or it has not been copied into the store yet.');
      continue;
    end if;
    if v_where ->> 'kind' <> 'record' then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_a_record', 'kind', v_where ->> 'kind',
        'says', 'That id opens something that is not a record, so it carries no context values.');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'in_trash', 'organization_id', v_where -> 'organization_id',
        'says', 'This scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;

    v_org := (v_where ->> 'organization_id')::uuid;
    begin
      select w.o_doc, w.o_cache into v_doc, v_rcache
        from custom._read_record_with(v_org, v_rec, false, v_levels, v_rcache) w;
    exception when others then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'door_refused', 'organization_id', v_org, 'sqlstate', sqlstate, 'says', sqlerrm);
      continue;
    end;

    -- STORE-READ-PERF-3: the record's Table is looked up once per Table, not once per record.
    v_tid := (select x.table_id from custom.record x where x.organization_id = v_org and x.id = v_rec);
    v_tbl := case when v_tid is not null then v_tcache -> (v_tid::text) end;
    if v_tbl is null then
      select r.* into v_table
        from custom.record r
       where r.id = v_tid
         and r.table_id = custom.table_kernel_id()
       limit 1;
      v_tbl := jsonb_build_object('id', v_table.id,
        'title_field', coalesce(nullif(v_table.data ->> 'title_field', ''), 'name'),
        'label', coalesce(nullif(v_table.data ->> 'label_singular', ''), nullif(v_table.data ->> 'name', ''), 'record'));
      if v_tid is not null then
        v_tcache := v_tcache || jsonb_build_object(v_tid::text, v_tbl);
      end if;
    end if;
    v_title_field := v_tbl ->> 'title_field';
    v_label := v_tbl ->> 'label';
    v_name := coalesce(nullif(v_doc ->> v_title_field, ''), v_rec::text);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);

    v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', true,
      'organization_id', v_org, 'table_id', (v_tbl ->> 'id')::uuid, 'name', v_name);
    -- THE TRIPLE, so the compare page can say which side is behind (copy lag) rather than
    -- merely that two values differ. INSPECTOR-TAILS (2026-09-25): read from the record this
    -- door has just opened for the person (custom.read_record above), the same `_values` /
    -- `_derived` / `_computed` metadata custom.record_values_versioned reads, for the same keys
    -- (the record's values plus its `_values` entries). It used to CALL that door once per
    -- record, and the door re-asked the organization wall, the record ladder and the whole field
    -- mask the read door had just answered — about 23 ms a record, 400 of the 850 ms a type of
    -- 17 scopes took. Proven identical on 70 live scope records before the swap.
    select coalesce(jsonb_object_agg(k.key, jsonb_build_object(
             'value_version', coalesce((x.data -> '_values' -> k.key ->> 'ver')::integer, 1),
             'written_at', coalesce((x.data -> '_values' -> k.key ->> 'at')::timestamptz,
                                    (x.data -> '_derived' -> k.key ->> 'at')::timestamptz,
                                    (x.data -> '_computed' -> k.key ->> 'at')::timestamptz))),
           '{}'::jsonb)
      into v_versions
      from custom.record x
      cross join lateral (
        select j.key from jsonb_object_keys(v_doc) j(key) where left(j.key, 1) <> '_'
        union
        select j.key from jsonb_object_keys(coalesce(x.data -> '_values', '{}'::jsonb)) j(key)
      ) k
     where x.organization_id = v_org and x.id = v_rec;
    -- BIG-VALUES-READERS: this organization's cap on one context value handed to an agent
    -- (0, the default, is no cap: the agent gets the whole text, exactly as the old path does).
    v_cap := custom.agent_context_value_cap(v_org);
    v_admitted := v_admitted || jsonb_build_object('record_id', v_rec, 'organization_id', v_org,
      'table_id', (v_tbl ->> 'id')::uuid, 'name', v_name, 'type_label', lower(v_label), 'via', v_via,
      'doc', v_doc - '_hidden' - '_alternates' - '_retired' - '_redirected_from' - '_redirect_says',
      'hidden', v_hidden, 'title_field', v_title_field, 'versions', v_versions, 'cap', v_cap);
  end loop;

  -- ── THE ACTIVE TABLES with no record chosen ("I'm working in Clients") — named, for the person ─
  if p_table_ids is not null then
    v_wheres := custom._where_ids_open_with(p_table_ids);
    select coalesce(jsonb_agg(t.id), '[]'::jsonb) into v_tables
      from unnest(p_table_ids) t(id)
     where coalesce(v_wheres -> (t.id::text) ->> 'kind', '') = 'table';
  end if;

  -- ── SCOPE LABELS: every admitted record's name under its Table's singular label ────────────
  select coalesce(jsonb_object_agg(x.type_label, x.names), '{}'::jsonb)
    into v_scope_labels
    from (
      select e ->> 'type_label' as type_label,
             case when count(*) > 1 then jsonb_agg(e ->> 'name' order by e ->> 'name')
                  else to_jsonb(min(e ->> 'name')) end as names
        from jsonb_array_elements(v_admitted) e
       group by e ->> 'type_label'
    ) x;

  -- ── THE SYSTEM LANE: System context stays its own table (§5 D10), and a System item is read
  --    only when it is NAMED (lane CONTEXT-VALUES-NAMED-2): p_system_item_refs, the same ids-or-keys
  --    list public.resolve_full_context takes; NULL or empty reads none ─────────────────────────
  for rec in (
    select sci.id as context_item_id, sci.key, sci.description,
           sci.value_type::text as value_type, sci.value as value
      from context.named_system_context_items(p_system_item_refs) sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type != 'dataset'
     order by sci.sort_order asc, sci.key asc
  ) loop
    continue when rec.value is null;
    v_cell := jsonb_build_object(
      'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
      'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  for rec in (
    select sci.id as context_item_id, sci.key, sci.description, sci.display_name,
           sci.feed_config as feed_config
      from context.named_system_context_items(p_system_item_refs) sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type = 'dataset'
       and sci.feed_config ? 'data_store_id'
     order by sci.sort_order asc, sci.key asc
  ) loop
    v_cell := jsonb_build_object(
      'key', rec.key,
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code'),
      'type', 'dataset', 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code',
          'hint', 'Knowledge resource — query it with the RAG tools, e.g. knowledge_search(data_store_id=<data_store_id>).'),
      'type', 'dataset', 'inject_as', 'reference', 'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  -- ── THE RECORDS' FIELDS: every declared Field of each admitted record, except its title and a
  --    Field declared `exclude` — in Table, Field and record order, as the old resolver orders
  --    scope type, context item and scope. A Field this person may not see is WITHHELD and
  --    named; a relation (a reference) moves to the on-demand tier, where DYN-17 says it belongs
  --    — the one declared tier move.
  for rec in (
    select e.value as a, fr.id as field_id, fr.data ->> 'key' as fkey, fr.data ->> 'type' as ftype,
           fr.data ->> 'label' as flabel, fr.data ->> 'description' as fdesc,
           coalesce(nullif(fr.data ->> 'sort', '')::int, 0) as fsort
      from jsonb_array_elements(v_admitted) with ordinality e(value, ord)
      join custom.record fr
        on fr.organization_id = (e.value ->> 'organization_id')::uuid
       and fr.table_id = custom.field_kernel_id()
       and fr.deleted_at is null
       and (fr.data ->> 'entity_definition_id')::uuid = (e.value ->> 'table_id')::uuid
     where fr.data ->> 'key' is distinct from (e.value ->> 'title_field')
       and coalesce(fr.data ->> 'context_policy', 'include') <> 'exclude'
     order by e.value ->> 'type_label', coalesce(nullif(fr.data ->> 'sort', '')::int, 0),
              e.value ->> 'name', e.value ->> 'record_id'
  ) loop
    a := rec.a;
    if (a -> 'hidden') ? rec.fkey then
      v_withheld := v_withheld || jsonb_build_object(
        'record_id', a -> 'record_id', 'record_name', a -> 'name', 'key', rec.fkey,
        'reason', coalesce(a -> 'hidden' -> rec.fkey ->> 'reason', 'this field is not visible at your level'));
      continue;
    end if;
    continue when (a -> 'doc' -> rec.fkey) is null or jsonb_typeof(a -> 'doc' -> rec.fkey) = 'null';
    v_inject := case when rec.ftype in ('relation', 'entity_reference') then 'tool_accessible' else 'direct' end;
    -- BIG-VALUES-READERS: what the agent is handed for this value. A value kept as a file is
    -- its whole text (the store's client reads the file the door names in `whole_value`), or,
    -- under the organization's cap, its first words and the file to open — never the first
    -- words alone. A relation to files is the file reference the old path hands.
    v_val := custom.agent_context_value(a -> 'doc', rec.fkey, rec.ftype, (a ->> 'organization_id')::uuid,
                                        (a ->> 'record_id')::uuid, coalesce((a ->> 'cap')::bigint, 0));
    v_whole := v_val -> 'whole_value';
    v_val := v_val -> 'value';
    v_cell := jsonb_build_object(
      'key', rec.fkey, 'value', v_val, 'type', rec.ftype,
      'description', coalesce(rec.fdesc, rec.flabel),
      'context_item_id', rec.field_id,
      'scope_id', a -> 'record_id', 'scope_name', a -> 'name', 'scope_type_id', a -> 'table_id',
      'organization_id', a -> 'organization_id', 'via', a -> 'via',
      'value_version', a -> 'versions' -> rec.fkey -> 'value_version',
      'written_at', a -> 'versions' -> rec.fkey -> 'written_at',
      'source', 'scope:' || (a ->> 'name'))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end;
    v_variables := v_variables || jsonb_build_object(rec.fkey, jsonb_build_object(
      'value', v_val, 'type', rec.ftype, 'inject_as', v_inject,
      'source', 'scope:' || (a ->> 'name'), 'description', coalesce(rec.fdesc, rec.flabel),
      'cells', coalesce(v_variables -> rec.fkey -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end);
    v_sources := v_sources || jsonb_build_object(rec.fkey, 'scope:' || (a ->> 'name'));
    v_cells := v_cells || jsonb_build_object(rec.field_id::text,
      coalesce(v_cells -> rec.field_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  return jsonb_build_object(
    'scope_labels', v_scope_labels,
    'variables',    v_variables,
    'sources',      v_sources,
    'cell_values',  v_cells,
    'context', jsonb_build_object(
      'user_id', v_me, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
      'scope_ids', coalesce((select jsonb_agg(e -> 'record_id') from jsonb_array_elements(v_admitted) e), '[]'::jsonb),
      'table_ids', v_tables),
    'checks',       v_checks,
    'withheld',     v_withheld,
    'resolved_at',  extract(epoch from now()),
    'read_as',      'the person operating this agent',
    'through',      'custom.where_id_opens for every contributing record, then custom.read_record under that record''s own organization');
end;
$function$;
