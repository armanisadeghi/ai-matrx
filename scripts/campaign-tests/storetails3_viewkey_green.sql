-- LANE STORE-TAILS-3 — A SAVED-VIEW SETTING IS REFUSED BY NAME, NEVER WITH AN INTERNAL ERROR.
--
-- THE USE CASE. The Birchwood owner saves a "Quoting rooms" view of Rooms (filters: Status is
-- Quoting). Every setting a view keeps passes one guard, custom._view_key_value, by the shape the
-- registry custom.view_keys() gives it. The registry names `filters` (shape `filter`) and three
-- store-written settings (shape `server`) that the guard had no arm for; its last line raised
-- XX000, Postgres's internal error, which no client maps and no person can act on.
--
-- WHAT MAKES IT FAIL (RED on the body before storetails3_a_view_setting_is_refused_by_name_never_an_internal_error.sql):
-- `filters` reaching the guard answers XX000 (V1); any shape answers XX000 (V4, V5); any custom
-- function body still raises XX000 (V6). The member's own view save must keep working (V7).

\set ON_ERROR_STOP on
\timing off
\set suite 'storetails3_viewkey_green.sql'
\set requires 'function:custom._view_key_value|function:custom.view_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

\i scripts/campaign-tests/_storetails3_fixture.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_out jsonb; v_state text; v_msg text; v_n int; v_view text;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- V1. `filters` is judged, not an internal error
  v_out := custom.view_keys_check(v_org, v_rooms, '{"filters": {"status": "Quoting"}}'::jsonb);
  if v_out -> 'filters' is distinct from '{"status": "Quoting"}'::jsonb then
    raise exception 'V1: filters {status: Quoting} came back as %', v_out;
  end if;
  raise notice 'V1 PASS — filters {"status": "Quoting"} judged and kept';

  -- V2. a filters that is not a map is refused by name
  begin
    perform custom.view_keys_check(v_org, v_rooms, '{"filters": "Quoting"}'::jsonb);
    raise exception 'V2: a filters string was accepted';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state <> '22023' or v_msg not like 'A view''s filters are a map%' then
      raise exception 'V2: a filters string answered % "%"', v_state, v_msg;
    end if;
  end;
  raise notice 'V2 PASS — 22023 "%"', v_msg;

  -- V3. a column the table does not have is refused by the filter compiler, never XX000
  v_msg := null;
  begin
    perform custom.view_keys_check(v_org, v_rooms, '{"filters": {"no_such_column": 1}}'::jsonb);
    v_state := 'accepted';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  if v_state = 'XX000' then raise exception 'V3: an unknown column answered an internal error: %', v_msg; end if;
  raise notice 'V3 PASS — an unknown column answers % ("%")', v_state, coalesce(v_msg, '');

  -- V4, V5. a store-written setting, and a shape nobody checks, are named 22023 refusals
  foreach v_msg in array array['server', 'a_shape_nobody_checks'] loop
    begin
      perform custom._view_key_value(v_org, v_rooms, 'table_id', v_msg, '"x"'::jsonb);
      raise exception 'V4/5: shape % was accepted', v_msg;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      if v_state <> '22023' then
        raise exception 'V4/5: shape % answered % (want the named 22023 refusal): %', v_msg, v_state, sqlerrm;
      end if;
    end;
  end loop;
  raise notice 'V4 PASS / V5 PASS — a store-written setting and an unknown shape are named 22023 refusals';

  -- V6. no function body in custom raises XX000 any more
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.prosrc ~ 'errcode\s*=\s*''XX000''';
  if v_n > 0 then raise exception 'V6: % function(s) in custom still raise XX000', v_n; end if;
  raise notice 'V6 PASS — no function in custom raises XX000';

  -- V7. the member's own view save, filters and all, through the door
  perform set_config('role', 'authenticated', true);
  v_view := custom.view_declare(v_org, v_rooms, jsonb_build_object('name', 'Quoting rooms',
              'filters', jsonb_build_object('status', 'Quoting'),
              'definition', jsonb_build_object('layout', 'grid')));
  perform set_config('role', 'postgres', true);
  if v_view is null then raise exception 'V7: the view door returned nothing'; end if;
  raise notice 'V7 PASS — "Quoting rooms" saved through custom.view_declare with its filters (%)', left(v_view, 60);
  raise notice 'storetails3_viewkey_green.sql: ALL PASS (V1-V7)';
end
$t$;

rollback;
