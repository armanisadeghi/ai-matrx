-- LANE GRID-PRIMITIVES, G14 — A KNOWN OUTSIDER IS GRANTED AT ONCE.
--
-- THE USE CASE (_gridprim_clinic.sql): Cedar Ridge Veterinary Clinic's owner, Dr. Ana Whitfield
-- (admin@admin.com), shares the Appointments table with the clinic's outside bookkeeper,
-- Marisol Vega (test@test.com), who already has an AI Matrx account but is NOT on the clinic's
-- staff. Google Docs does this at once: she can open it immediately and is told so. The
-- bookkeeper's colleague, who has no account yet, gets an invitation instead.
--
-- WHAT MAKES IT FAIL: a known account that must follow a link first; an outsider made a member,
-- or able to see a table she was not given; no notification; the organization's outside-sharing
-- switch ignored; a viewer passing the share on.
-- RED before the files (door absent), GREEN after (and RED without the chair-step grant).

\set ON_ERROR_STOP on
\timing off
\set suite 'gridprim_g14_green.sql'
\set requires 'function:custom.table_share_outside_invite|function:custom._share_write_person'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';
do $g$ begin
  if not has_function_privilege('authenticated', 'custom.table_share_outside_grant(uuid, uuid, text, public.permission_level)', 'execute') then
    raise exception 'G14-grant: a signed-in person holds no EXECUTE on custom.table_share_outside_grant';
  end if;
  if not exists (select 1 from communication.notification_event_type where event_key = 'share.table_granted' and deleted_at is null and enabled) then
    raise exception 'G14-kind: there is no live share.table_granted notification kind';
  end if;
end $g$;
\i scripts/campaign-tests/_gridprim_clinic.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_sup uuid; v_res jsonb; v_n integer;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into v_sup from gp where k = 'other_table';

  -- Marisol is the OUTSIDE bookkeeper: not on the clinic's staff. The clinic turns outside
  -- sharing OFF for this half. The platform default is ON since
  -- migrations/campaign/sharegate_naming_a_person_is_the_only_act.sql (Store-ON-by-default,
  -- Arman 2026-09-23), so "off" is the organization's own explicit override, never the default.
  delete from iam.memberships where organization_id = v_org and user_id = c_dana;
  delete from platform.knob_override where feature = 'custom' and key = 'external_principal_enabled'
     and scope_kind = 'organization' and scope_id = v_org;
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'external_principal_enabled', 'organization', v_org, v_org, 'false'::jsonb,
          'Cedar Ridge keeps its appointments inside the clinic until the bookkeeper is engaged');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform custom.read_records(v_org, v_appts);
    raise exception 'G14a: the bookkeeper read the clinic before anything was shared';
  exception when insufficient_privilege then null;
  end;

  -- The switch is the organization's: off, the share is refused and nothing is written.
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    perform custom.table_share_outside_grant(v_org, v_appts, 'test@test.com', 'viewer');
    raise exception 'G14b: shared outside while the clinic has outside sharing turned off';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'postgres', true);
  delete from platform.knob_override where feature = 'custom' and key = 'external_principal_enabled'
     and scope_kind = 'organization' and scope_id = v_org;
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'external_principal_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'Cedar Ridge shares its appointments with its outside bookkeeper');
  perform set_config('role', 'authenticated', true);

  -- A known account: granted at once, told so, not a member.
  v_res := custom.table_share_outside_grant(v_org, v_appts, 'test@test.com', 'viewer');
  if not coalesce((v_res ->> 'granted')::boolean, false) or coalesce((v_res ->> 'invited')::boolean, true)
     or v_res ->> 'person' is distinct from 'outside_account' or (v_res ->> 'user_id')::uuid is distinct from c_dana then
    raise exception 'G14c: the known account was not granted at once: %', v_res;
  end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from communication.notification n
   where n.event_key = 'share.table_granted' and n.recipient_user_id = c_dana
     and n.organization_id = v_org and n.target_id = v_appts;
  if v_n < 1 then raise exception 'G14d: no share.table_granted notification was queued for her (%)', v_res; end if;
  select count(*) into v_n from iam.organization_member m where m.organization_id = v_org and m.user_id = c_dana;
  if v_n <> 0 then raise exception 'G14e: the bookkeeper was made a member of the clinic'; end if;
  perform set_config('role', 'authenticated', true);
end $t$;

-- Her next request is its own statement, as it is in the app.
do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_sup uuid; v_res jsonb; v_n integer;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into v_sup from gp where k = 'other_table';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_n from custom.read_records(v_org, v_appts);
  if v_n <> 10 then raise exception 'G14f: the bookkeeper reads % appointments at once, not 10', v_n; end if;
  begin
    perform custom.read_records(v_org, v_sup);
    raise exception 'G14g: the bookkeeper opened the suppliers table she was not given';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.table_share_outside_grant(v_org, v_appts, 'admin@admin.com', 'viewer');
    raise exception 'G14h: a viewer passed the share on';
  exception when insufficient_privilege then null;
  end;
  raise notice 'G14 PASS — the bookkeeper (an existing account, not staff) reads the 10 appointments at once, is notified, is not a member, sees no other table, and cannot pass it on; with outside sharing off nothing was shared.';

  -- No account yet: an invitation, exactly the invite door's.
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_res := custom.table_share_outside_grant(v_org, v_appts, 'lena.okafor.books@example.com', 'viewer');
  if not coalesce((v_res ->> 'invited')::boolean, false) or coalesce((v_res ->> 'granted')::boolean, true)
     or v_res ->> 'person' is distinct from 'no_account' or v_res ->> 'invitation_id' is null then
    raise exception 'G14i: an address with no account was not invited: %', v_res;
  end if;
  begin
    perform custom.table_share_outside_grant(v_org, v_appts, 'c0ffee00-1b2c-4d3e-8f00-000000000abc', 'viewer');
    raise exception 'G14j: an invented account id was shared with';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'G14 PASS — an address with no account gets the invitation; an invented account id is refused.';
  raise notice 'GRIDPRIM G14 GREEN — every part passed.';
end $t$;
rollback;
