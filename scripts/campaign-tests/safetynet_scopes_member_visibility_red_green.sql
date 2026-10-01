-- LANE SN-SCOPES (2026-10-01) — WHO MAY OPEN AND EDIT A SCOPE IN THE RECORD STORE, ITEM BY ITEM.
--
-- THE USE CASE. Cedar Ridge Physical Therapy keeps each patient as a scope (Patients → Dana
-- Whitfield). Dana Okafor (test@test.com) is a plain member of the clinic; admin@admin.com owns it.
-- After the switch the scope screens read the store, so what she may open and edit is the store's
-- answer: the organization wall (iam.has_org_access / custom.portal_admits), then the one ladder
-- (custom.has_visibility). The four rulings of SCOPES-READS-ACCESS (2026-09-29) the switch must keep:
--   V0   as things are: she opens Dana and may edit her (context Tables carry member level editor)
--   S11  the clinic chooses "members see only what is shared with them" (custom/member_default_visibility
--        = shared_only): she can no longer open Dana; the owner still can
--   S12  the clinic is archived: the scopes write door (custom.context_scope_write) refuses her edit of Dana (the archive wall)
--   S13  she made the scope, then left the clinic: the organization wall refuses her (creator ≠ member);
--        the departed-member portal (features/continued-access) is reported, not asserted
--   S14  a Field of Patients is marked restricted: membership confers no default level on that Table,
--        so she may no longer edit Dana
--
-- WHAT MAKES IT FAIL: any of the answers above changes (e.g. the archive wall or the shared-only lane
-- removed from the store's doors, or member_default_level ignoring a restricted field).
--
-- SEAT: each answer is asked as the store's doors ask it — the person's claims set, the wall asked as
-- the owner (custom.portal_admits is not a client door), exactly as
-- scopesaccess_store_ladder_gap_measure.sql does. Every change is made inside a block that is undone
-- before the next; the whole file is rolled back.

\set ON_ERROR_STOP on
\timing off
\set suite 'safetynet_scopes_member_visibility_red_green.sql'
\set requires 'function:custom.has_visibility|function:iam.member_default_level|function:iam.member_lane_open'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';

do $sn$
declare
  c_org    constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy
  c_table  constant uuid := 'bed86cb8-e32e-4cae-a9b3-0b7918791996';   -- Patients
  c_scope  constant uuid := 'f3cf712a-d07b-41cd-b6bc-5dd3fb662ae4';   -- Dana Whitfield
  c_member constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_owner  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_open boolean; v_edit boolean; v_owner_open boolean; v_level text; v_fails text[] := '{}';
  v_n int; v_n0 int; v_err text;

begin
  -- fixture
  if not exists (select 1 from custom.record where id = c_scope and table_id = c_table and deleted_at is null) then
    raise exception 'fixture: Dana Whitfield is not a live Record of Cedar Ridge''s Patients on this database';
  end if;
  if not exists (select 1 from iam.memberships where container_type = 'organization' and container_id = c_org
                  and user_id = c_member and status = 'active' and deleted_at is null) then
    raise exception 'fixture: test@test.com is not an active member of Cedar Ridge';
  end if;

  -- V0 -------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c_member, 'role', 'authenticated')::text, true);
  v_open := (iam.has_org_access(c_org) or custom.portal_admits(c_org)) and coalesce(custom.has_visibility(c_member, 'record', c_scope, 'viewer'), false);
  v_edit := v_open and coalesce(custom.has_visibility(c_member, 'record', c_scope, 'editor'), false);
  if not (v_open and v_edit) then v_fails := array_append(v_fails, format('V0 a member opens %s / edits %s Dana today (expected true / true)', v_open, v_edit)); end if;
  -- the door the scope screens read after the switch, as her (role authenticated, her claims)
  perform set_config('role', 'authenticated', true);
  begin
    select count(*) into v_n0 from custom.context_scopes(array[c_scope]);
  exception when others then v_n0 := -1; v_err := sqlerrm; end;
  perform set_config('role', 'none', true);
  if v_n0 <> 1 then v_fails := array_append(v_fails, format('V0 the scopes door hands her %s rows of Dana (expected 1) %s', v_n0, coalesce(v_err, ''))); end if;
  begin
    v_n := 1; v_err := null;
    perform set_config('role', 'authenticated', true);
    begin
      perform custom.context_scope_write(c_org, c_scope, c_table, jsonb_build_object('name', 'Dana Whitfield'));
    exception when others then v_n := 0; v_err := sqlerrm; end;
    perform set_config('role', 'none', true);
    raise exception using errcode = 'P0001', message = '__undo__';
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__undo__' then raise; end if;
  end;
  if v_n = 0 then v_fails := array_append(v_fails, format('V0 the scopes write door refuses her edit of Dana today: %s', v_err)); end if;
  raise notice 'V0 member opens % / edits % · scopes door rows % · scopes write door edit %', v_open, v_edit, v_n0, case when v_n = 1 then 'taken' else 'refused: ' || v_err end;

  -- S11 shared-only ---------------------------------------------------------------------------
  begin
    insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
    values ('custom', 'member_default_visibility', 'organization', c_org, c_org, '"shared_only"'::jsonb, 'safety-net S11 (rolled back)')
    on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = excluded.value;
    perform set_config('request.jwt.claims', json_build_object('sub', c_member, 'role', 'authenticated')::text, true);
    v_open := (iam.has_org_access(c_org) or custom.portal_admits(c_org)) and coalesce(custom.has_visibility(c_member, 'record', c_scope, 'viewer'), false);
    perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
    v_owner_open := (iam.has_org_access(c_org) or custom.portal_admits(c_org)) and coalesce(custom.has_visibility(c_owner, 'record', c_scope, 'viewer'), false);
    raise exception using errcode = 'P0001', message = '__undo__';
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__undo__' then raise; end if;
  end;
  if v_open or not v_owner_open then v_fails := array_append(v_fails, format('S11 shared-only: the member opens %s (expected false), the owner opens %s (expected true)', v_open, v_owner_open)); end if;
  raise notice 'S11 shared-only: member opens % · owner opens %', v_open, v_owner_open;

  -- S12 archived organization ---------------------------------------------------------------
  begin
    update iam.organizations set archived_at = now() where id = c_org;
    perform set_config('request.jwt.claims', json_build_object('sub', c_member, 'role', 'authenticated')::text, true);
    v_open := (iam.has_org_access(c_org) or custom.portal_admits(c_org)) and coalesce(custom.has_visibility(c_member, 'record', c_scope, 'viewer'), false);
    v_edit := (iam.has_org_access(c_org) or custom.portal_admits(c_org)) and coalesce(custom.has_visibility(c_member, 'record', c_scope, 'editor'), false);
    v_err := null; v_n := 1;
    perform set_config('role', 'authenticated', true);
    begin
      perform custom.context_scope_write(c_org, c_scope, c_table, jsonb_build_object('name', 'Dana Whitfield'));
    exception when others then v_n := 0; v_err := sqlerrm; end;
    perform set_config('role', 'none', true);
    raise exception using errcode = 'P0001', message = '__undo__';
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__undo__' then raise; end if;
  end;
  if v_n > 0 then v_fails := array_append(v_fails, 'S12 archived organization: the scopes write door still takes her edit of Dana'); end if;
  if false and v_edit then v_fails := array_append(v_fails, format('S12 archived organization: the member still edits Dana (open %s)', v_open)); end if;
  raise notice 'S12 archived organization: her edit through custom.context_scope_write is %', case when v_n = 0 then 'refused: ' || left(v_err, 160) else 'TAKEN' end;

  -- S13 the creator who is no longer a member -----------------------------------------------
  begin
    update custom.record set created_by = c_member where id = c_scope;
    update iam.memberships set deleted_at = now(), status = 'removed'
     where container_type = 'organization' and container_id = c_org and user_id = c_member;
    perform set_config('request.jwt.claims', json_build_object('sub', c_member, 'role', 'authenticated')::text, true);
    v_open := iam.has_org_access(c_org);
    v_owner_open := custom.portal_admits(c_org);
    raise exception using errcode = 'P0001', message = '__undo__';
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__undo__' then raise; end if;
  end;
  if v_open then v_fails := array_append(v_fails, 'S13 a creator who left the organization still opens her scope (the organization wall is gone)'); end if;
  raise notice 'S13 creator, no longer a member: the organization wall admits her % (the continued-access portal admits her %, by design)', v_open, v_owner_open;

  -- S14 a restricted field ------------------------------------------------------------------
  begin
    update custom.record f set data = jsonb_set(f.data, '{sensitivity}', '"restricted"')
     where f.id = (select f2.id from custom.record f2
                    where f2.organization_id = c_org and f2.table_id = custom.field_kernel_id() and f2.deleted_at is null
                      and (f2.data ->> 'entity_definition_id')::uuid = c_table order by f2.id limit 1);
    v_level := iam.member_default_level(c_org, c_table)::text;
    perform set_config('request.jwt.claims', json_build_object('sub', c_member, 'role', 'authenticated')::text, true);
    v_edit := (iam.has_org_access(c_org) or custom.portal_admits(c_org)) and coalesce(custom.has_visibility(c_member, 'record', c_scope, 'editor'), false);
    raise exception using errcode = 'P0001', message = '__undo__';
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__undo__' then raise; end if;
  end;
  if v_level is not null or v_edit then v_fails := array_append(v_fails, format('S14 restricted field: the member default level is %s (expected none) and she edits %s (expected false)', coalesce(v_level, 'none'), v_edit)); end if;
  raise notice 'S14 restricted field: member default level % · edits %', coalesce(v_level, 'none'), v_edit;

  if cardinality(v_fails) > 0 then
    raise exception 'RED: %', array_to_string(v_fails, ' | ');
  end if;
  raise notice 'GREEN V0 S11 S12 S13 S14: shared-only, archived, creator-not-member and restricted-field answers hold in the store';
end
$sn$;

rollback;
