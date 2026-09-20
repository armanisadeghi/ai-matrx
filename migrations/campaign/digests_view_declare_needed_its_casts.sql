-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.view_declare(uuid, uuid, jsonb) e618135351584494d07fb89702466298c4c1cc2e23582ec04ffe89b6f0f59f21
--
-- THE DEFECT THE SEAT SUITE FOUND ON ITS FIRST RUN, and it made the door useless to
-- everybody: `p_spec -> 'definition' - 'table_id' - 'filters'` is ambiguous, because
-- PostgreSQL cannot choose between `jsonb - text` and `jsonb - text[]` for a bare
-- literal. plpgsql does not catch that when the function is created; it raises at RUN
-- time, so `custom.view_declare` was created cleanly, granted cleanly, and then failed
-- on EVERY call with `42725 operator is not unique: unknown - unknown`. Nobody could
-- save a view, which means nobody could subscribe to anything.
--
-- THE CLASS: a plpgsql body is not type-checked at creation, so a door is not proven
-- by applying it. It is proven by CALLING it from the seat a person sits in — which is
-- what `scripts/campaign-tests/digests_green.sql` now does, in PART 2, before anything
-- else in this lane is believed.

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
  -- THE CASTS ARE NOT DECORATION. Without them PostgreSQL cannot choose between
  -- `jsonb - text` and `jsonb - text[]` for a bare literal and refuses the whole
  -- function at RUN time with 42725 — which is exactly how the first seat suite found
  -- this: every call to this door raised `operator is not unique: unknown - unknown`,
  -- so no saved view could be written by anybody.
  v_def := jsonb_build_object('table_id', p_table_id, 'filters', v_filters)
           || coalesce(case when jsonb_typeof(p_spec -> 'definition') = 'object'
                            then (p_spec -> 'definition') - 'table_id'::text - 'filters'::text
                       end, '{}'::jsonb);

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
