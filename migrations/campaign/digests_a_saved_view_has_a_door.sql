-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- LANE DIGESTS — THE GAP `subscription_propose` FELL INTO.
--
-- A subscription is a Rule OVER A SAVED VIEW: the view's filter is the whole of
-- "what counts as urgent", which is why that sentence stays editable in English
-- instead of being compiled into a Rule expression nobody can read. So every
-- subscription needs a saved view — and MEASURED on the main database 2026-09-20,
-- there was no door onto `platform.saved_view` for schema `custom` at all. Not a
-- write door, not a read door. The consequences, each one real:
--
--   · `custom.subscription_declare` demands a `saved_view_id` that no client and no
--     agent could obtain, so the door this lane landed an hour ago could only be
--     called with a view somebody had inserted with SQL.
--   · `NotifyRuleEditor` reaches its view list through a HOST PORT
--     (`host.savedViews()`), and with no port bound it says so and offers nothing —
--     honest, and still a screen where subscribing is impossible.
--   · The agent action this lane is for — "text me on a new lead; email me a Monday
--     summary" — cannot make either subscription, because it cannot say what a lead
--     is.
--
-- TWO DOORS, AND THE LADDER THEY ASK.
--
--   custom.view_declare(org, table_id, spec)  VIEWER on the Table. Saving a view is
--                                             not changing the Table: it is writing
--                                             down a question about it, it changes
--                                             nothing anybody else sees unless they
--                                             are told to look, and requiring editor
--                                             would mean the people who read a Table
--                                             could not subscribe to anything in it.
--   custom.views(org, table_id)               VIEWER on the Table. A LIST IS A DOOR,
--                                             NEVER A GRANT ON THE TABLE BEHIND IT:
--                                             opening platform.saved_view to
--                                             `authenticated` would hand the browser
--                                             every surface's views in the
--                                             organization to filter itself.
--
-- The definition is written in the ONE shape `custom.agg_view_admits` and
-- `custom.agg_view_admits_state` already read — `{"table_id": …, "filters": {…}}` —
-- rather than a second predicate language, so a view saved here is a view the
-- notifier admits records to without a translation step in between.
--
-- THE INVERSE: `migrations/inverse/digests_a_saved_view_has_a_door_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.view_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_id      uuid := nullif(p_spec ->> 'view_id', '')::uuid;
  v_name    text := coalesce(nullif(btrim(p_spec ->> 'name'), ''), 'Saved view');
  v_filters jsonb := case when jsonb_typeof(p_spec -> 'filters') = 'object'
                          then p_spec -> 'filters' else '{}'::jsonb end;
  v_def     jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.view_declare');
  -- VIEWER, not editor. Writing down a question about a Table is not changing it.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_declare');

  if p_table_id is null then
    raise exception 'A saved view is a view OF something — name the table.'
      using errcode = '22004';
  end if;

  -- THE ONE SHAPE THE NOTIFIER READS. `custom.agg_view_admits` and
  -- `custom.agg_view_admits_state` both take `{"table_id": …, "filters": {…}}`, so a
  -- view saved here needs no translation before a subscription can be written over it.
  v_def := jsonb_build_object('table_id', p_table_id, 'filters', v_filters)
           || coalesce(case when jsonb_typeof(p_spec -> 'definition') = 'object'
                            then p_spec -> 'definition' - 'table_id' - 'filters' end, '{}'::jsonb);

  if v_id is not null then
    update platform.saved_view
       set name = v_name, definition = v_def, updated_at = now(), version = version + 1
     where id = v_id and organization_id = p_organization_id and deleted_at is null;
    if not found then
      raise exception 'There is no saved view % here.', v_id
        using errcode = '23503',
              hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
    end if;
    return v_id;
  end if;

  insert into platform.saved_view
    (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
  values (v_name, 'custom/records', p_table_id, v_def, p_organization_id,
          custom.query_principal(), 'internal'::platform.visibility)
  returning id into v_id;
  return v_id;
end;
$fn$;

comment on function custom.view_declare(uuid, uuid, jsonb) is
  'DOOR-18: save a view of a Table — its name and its filters — at the VIEWER rung, because writing down a question about a Table is not changing it. The definition is written in the one shape the notifier already admits records against, so a subscription can be written over it with no translation.';

create or replace function custom.views(p_organization_id uuid, p_table_id uuid default null)
returns table(view_id uuid, name text, table_id uuid, filters jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.views');
  return query
    select sv.id, sv.name, nullif(sv.definition ->> 'table_id', '')::uuid,
           coalesce(sv.definition -> 'filters', '{}'::jsonb), sv.created_at
      from platform.saved_view sv
     where sv.organization_id = p_organization_id
       and sv.deleted_at is null
       and sv.surface_key = 'custom/records'
       and (p_table_id is null or (sv.definition ->> 'table_id')::uuid = p_table_id)
       -- A LIST IS A DOOR, NEVER A GRANT ON THE THING BEHIND IT: narrowed in SQL, as
       -- the definer, to Tables this caller can already open — so the list of views
       -- can never reveal a Table.
       and (sv.definition ->> 'table_id')::uuid in
             (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
     order by sv.name;
end;
$fn$;

comment on function custom.views(uuid, uuid) is
  'DOOR-18: the saved views of a Table this person can already open — what a subscription may be written over. Narrowed in SQL as the definer, never by a grant on platform.saved_view.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'view_declare', 'p_organization_id uuid, p_table_id uuid, p_spec jsonb',
   array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there, and custom.assert_store_door applies the product switch before any write. p_table_id is then put to custom.assert_client_may_open at the viewer rung — saving a view is writing down a question about a Table, not changing it — and a table_id from another tenant reads as absent. p_spec is not stored as given: only the name and the filters are read, and the definition is rebuilt in the one shape the notifier admits records against. It writes ONE platform.saved_view row in the caller''s own organization and reads no record.',
   'digests_a_saved_view_has_a_door.sql', null, true, false),
  ('custom', 'views', 'p_organization_id uuid, p_table_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. The rows are then narrowed twice in SQL, as the definer: to surface_key custom/records, and to Tables in custom.query_visible_ids for THIS caller, so a list of views can never reveal a Table. A p_table_id from another tenant returns zero rows. It returns no record and no payload.',
   'digests_a_saved_view_has_a_door.sql', null, true, false)
on conflict do nothing;
