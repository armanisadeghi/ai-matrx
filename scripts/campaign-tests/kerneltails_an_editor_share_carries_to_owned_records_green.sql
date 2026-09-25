-- LANE KERNEL-TAILS — AN EDITOR SHARE CARRIES TO THE RECORDS A RECORD OWNS (chair ruling for
-- v1store_fixes_green 4d): the way a Notion sub-page inherits its parent's share, unless the child
-- carries its own explicit grant.
--
-- THE REAL USE CASE: Trailhead & Torch Journeys, Bar Harbor desk. admin@admin.com owns the desk's
-- "Trip orders" Table. Order PO-1 (the Acadia sunrise kayak trip) OWNS its line items — PO-2, the
-- kayak rental, which owns PO-3, the dry-bag add-on. Dana (test@test.com, a plain member) is
-- named EDITOR on PO-1 because she runs that trip.
--   E1  Dana deletes PO-1, and its owned line items go with it (PO-2 and PO-3 archived), exactly
--       as the store's cascade intends — she was refused PO-2 at "viewer" before this lane.
--   E2  Order PO-4 owns PO-5, and PO-5 carries Dana's OWN viewer grant (the guide notes she may
--       only read). Dana is named editor on PO-4 too, and deleting PO-4 is refused on PO-5 — the
--       child's own grant decides — and nothing of PO-4 is archived.
--   E3  Unrelated records are untouched: PO-6 (same Table, owned by nothing) stays live and Dana
--       still may not delete it; PO-7, CARRIED (relation_carry) by PO-1 but not owned, stays live.
--
-- RUN IT (clone or production; ONE rolled-back transaction; psql -f needs the sandbox disabled):
--   psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/kerneltails_an_editor_share_carries_to_owned_records_green.sql
-- ITS RED: before kerneltails_an_editor_share_carries_to_owned_records.sql (and after its inverse)
-- E1 fails: "You hold the viewer level on this record, and custom.record_delete needs the editor level."

\set ON_ERROR_STOP on
\timing off

\set suite 'kerneltails_an_editor_share_carries_to_owned_records_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '180s';
set local lock_timeout = '20s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  constant uuid := '5ba5aa1e-0000-4a00-8a00-000000000e01';
  v_home uuid; v_t uuid;
  po1 uuid; po2 uuid; po3 uuid; po4 uuid; po5 uuid; po6 uuid; po7 uuid;
  v_caught text;
  v_live integer;
begin
  perform set_config('app.actor_system', 'campaign-test/kerneltails_owned_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Trailhead & Torch Journeys — Bar Harbor Desk', 'trailhead-torch-bar-harbor-kt', 'TTB', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
    (v_org, 'organization', v_org, c_dana, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'kerneltails owned green');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Bar Harbor desk'))
  returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'type','entity','name','Trip orders','slug','trip_orders',
    'label_singular','Order','label_plural','Orders','display','page','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted',
    'agent_writable',true,'title_field','name','parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name','name'))));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  po1 := custom.record_write(v_org, v_t, jsonb_build_object('name','PO-1 Acadia sunrise kayak trip'));
  po2 := custom.record_write(v_org, v_t, jsonb_build_object('name','PO-2 Kayak rental, two singles'));
  po3 := custom.record_write(v_org, v_t, jsonb_build_object('name','PO-3 Dry-bag add-on'));
  po4 := custom.record_write(v_org, v_t, jsonb_build_object('name','PO-4 Cadillac Mountain night hike'));
  po5 := custom.record_write(v_org, v_t, jsonb_build_object('name','PO-5 Guide notes and permit'));
  po6 := custom.record_write(v_org, v_t, jsonb_build_object('name','PO-6 Schoodic bike day'));
  po7 := custom.record_write(v_org, v_t, jsonb_build_object('name','PO-7 Tide chart for the week'));
  perform custom.relation_own(v_org, po1, po2);
  perform custom.relation_own(v_org, po2, po3);
  perform custom.relation_own(v_org, po4, po5);
  perform custom.relation_carry(v_org, po1, po7);
  perform custom.share_grant(v_org, po1, 'user', c_dana, 'editor'::public.permission_level);
  perform custom.share_grant(v_org, po4, 'user', c_dana, 'editor'::public.permission_level);
  perform custom.share_grant(v_org, po5, 'user', c_dana, 'viewer'::public.permission_level);

  -- E1
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_caught := null;
  begin
    perform custom.record_delete(v_org, po1);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is not null then
    raise exception 'E1 FAILED — Dana, named editor on PO-1, could not delete it with its owned line items: %', v_caught;
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  if (custom.record_resolve(v_org, po1) ->> 'live')::boolean
     or (custom.record_resolve(v_org, po2) ->> 'live')::boolean
     or (custom.record_resolve(v_org, po3) ->> 'live')::boolean then
    raise exception 'E1 FAILED — PO-1 or an owned line item is still live after Dana deleted PO-1';
  end if;
  raise notice 'E1 PASSED — the named editor deleted PO-1, and its owned PO-2 and PO-3 went with it';

  -- E2
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_caught := null;
  begin
    perform custom.record_delete(v_org, po4);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like 'You hold the viewer level on this record%' then
    raise exception 'E2 FAILED — PO-5 carries Dana''s own viewer grant and deleting PO-4 was not refused on it (%)', coalesce(v_caught, 'no refusal');
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  if not (custom.record_resolve(v_org, po4) ->> 'live')::boolean or not (custom.record_resolve(v_org, po5) ->> 'live')::boolean then
    raise exception 'E2 FAILED — the refused delete archived PO-4 or PO-5 anyway';
  end if;
  raise notice 'E2 PASSED — the child''s own viewer grant decides: "%"', left(v_caught, 90);

  -- E3
  if not (custom.record_resolve(v_org, po6) ->> 'live')::boolean or not (custom.record_resolve(v_org, po7) ->> 'live')::boolean then
    raise exception 'E3 FAILED — an unrelated or merely carried record was archived with PO-1';
  end if;
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_caught := null;
  begin
    perform custom.record_delete(v_org, po6);
  exception when others then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'E3 FAILED — Dana deleted PO-6, which nobody shared with her and nothing she is named on owns';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'E3 PASSED — PO-6 and the carried PO-7 are untouched, and Dana still may not delete PO-6';
end $t$;

\echo 'ALL PASSED — kerneltails_an_editor_share_carries_to_owned_records_green'
rollback;
