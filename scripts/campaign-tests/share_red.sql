-- SHARE — THE RED TWIN. Each of this lane's five claims, taken back, inside ONE transaction
-- that is ROLLED BACK at the end.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/share_red.sql
--
-- It puts the PRE-SHARE behaviour back — the SECURITY INVOKER guard, the created_by-only
-- ownership check, a share list with no reasons, the capture closed, a flat lane list — and
-- proves each one produces exactly the defect this lane found. Then it rolls back and VERIFIES
-- the rollback, so the database is left exactly as it was.
--
-- A guard you cannot show failing is not a guard.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'share_red.sql'
\set requires 'row:platform.feature_knob:feature = 'custom' and key = 'member_default_visibility''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG    '\'5bd50000-0000-4a00-8a00-000000000a01\''
\set ADMIN  '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA   '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\set HQ     '\'5bd50000-0000-4a00-8a00-000000000101\''
\set REC    '\'5bd50000-0000-4a00-8a00-000000000301\''

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'share_red_suite', true);

-- ─────────────────────────────────────────────────────────── the fixture, inside the rollback
insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'Ironclad Mobile Mechanic', 'ironclad-mobile-mechanic-share-red', 'IMM', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG, :ORG, 'true'::jsonb,          'SHARE red twin'),
       ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb, 'SHARE red twin');
insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
values (:HQ,  :ORG, '11111111-0000-4000-8000-000000000004', 'record',
        jsonb_build_object('name', 'Ironclad Mobile Mechanic HQ'), :ADMIN),
       (:REC, :ORG, '11111111-0000-4000-8000-000000000004', 'record',
        jsonb_build_object('name', 'Roadside Call #4471 - Alternator Replacement', 'parent_id', :HQ), :ADMIN);

-- ══════ BLOCK 1 — the guard that cannot read what it guards refuses every share
alter function iam._per_table_grant_guard() security invoker;
do $t$
declare v_n int;
begin
  select count(*) into v_n from iam.grant_path_blanket_refusals()
   where guard_function like 'iam._per_table_grant_guard%';
  if v_n <> 1 then
    raise exception 'BLOCK 1 NOT RED — the census does not name the guard it just broke.';
  end if;
  raise notice 'BLOCK 1 IS RED — the census names iam._per_table_grant_guard reading custom.record.';
end $t$;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare v_msg text;
begin
  begin
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
    values ('record', '5bd50000-0000-4a00-8a00-000000000301',
            '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'viewer',
            '87a6e699-3622-4869-8843-d0867456c0dd');
    raise exception 'BLOCK 1 NOT RED — the share landed with the guard back as SECURITY INVOKER.';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%permission denied for table record%' then
      raise exception 'BLOCK 1 NOT RED — refused, but not by the privilege error: %', v_msg;
    end if;
    raise notice 'BLOCK 1 IS RED — a real person''s share dies with "%", exactly as it did before this lane.', v_msg;
  end;
end $t$;
reset role;
alter function iam._per_table_grant_guard() security definer;

-- ══════ BLOCK 2 — the second ladder: only `created_by` may share, so `admin` cannot
select public.share_resource_with_user('record', :REC, :DANA, 'admin') \gset seed_
create or replace function public.may_manage_sharing(p_resource_type text, p_resource_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog' as $$
  -- THE PRE-SHARE QUESTION, restored verbatim in shape: one column, one comparison.
  select iam.owner_of(p_resource_type, p_resource_id) = (select auth.uid());
$$;
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare v_out jsonb; v_n int;
begin
  if public.may_manage_sharing('record', '5bd50000-0000-4a00-8a00-000000000301') then
    raise exception 'BLOCK 2 NOT RED — the created_by-only check still admits an admin.';
  end if;
  v_out := public.share_resource_with_user('record', '5bd50000-0000-4a00-8a00-000000000301',
                                           '34ed4fc3-c527-4819-99bf-15c26603b261', 'viewer');
  if (v_out ->> 'success')::boolean then
    raise exception 'BLOCK 2 NOT RED — an admin shared while the narrow check was in force.';
  end if;
  -- AND THE WORST OF THE SIX: an empty list, with no error at all.
  select count(*) into v_n from public.get_resource_permissions('record', '5bd50000-0000-4a00-8a00-000000000301');
  if v_n <> 0 then
    raise exception 'BLOCK 2 NOT RED — the grant list is not empty for an admin (% rows).', v_n;
  end if;
  raise notice 'BLOCK 2 IS RED — an admin on the record cannot share, cannot revoke, and is shown ZERO grants with no error.';
end $t$;
reset role;

-- ══════ BLOCK 3 — a share list with no reasons: only the grant rows, nothing else
create or replace function custom.share_access(p_organization_id uuid, p_subject_id uuid)
returns table (principal_kind text, principal_id uuid, principal_label text,
               level public.permission_level, reason text, reason_detail text,
               via_type text, via_id uuid, revocable boolean)
language sql stable security definer set search_path to 'pg_catalog' as $$
  -- THE PRE-SHARE SHAPE: the grant rows and nothing else — no Owner, no organization default,
  -- no container, no lane. Exactly what `get_resource_permissions` has always returned.
  select 'person'::text, p.granted_to_user_id, p.granted_to_user_id::text,
         p.permission_level, 'direct'::text, null::text, null::text, null::uuid, true
    from iam.permissions p
   where p.resource_type = 'record' and p.resource_id = p_subject_id;
$$;
do $t$
declare v_own int; v_cont int;
begin
  select count(*) filter (where reason = 'owner'),
         count(*) filter (where reason = 'containment')
    into v_own, v_cont
    from custom.share_access('5bd50000-0000-4a00-8a00-000000000a01', '5bd50000-0000-4a00-8a00-000000000301');
  if v_own <> 0 or v_cont <> 0 then
    raise exception 'BLOCK 3 NOT RED — the reduced list still carries reasons.';
  end if;
  raise notice 'BLOCK 3 IS RED — "who has access" lists grants only: the Owner, the organization''s own default and the thing that carries the record are all invisible.';
end $t$;

-- ══════ BLOCK 4 — the capture gone: a share that reaches history nowhere
alter table iam.permissions disable trigger zzz_history_grant_capture;  -- matrx-real-data:allow zzz_history_grant_capture is the real live trigger name from migrations/campaign/w3_hist_grant_capture.sql, not fixture data
do $t$
declare v_id uuid; v_n int;
begin
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
  values ('record', '5bd50000-0000-4a00-8a00-000000000301',
          '34ed4fc3-c527-4819-99bf-15c26603b261', 'viewer',
          '87a6e699-3622-4869-8843-d0867456c0dd')
  returning id into v_id;
  select count(*) into v_n from history.row_versions
   where entity_type = 'iam.permissions' and row_id = v_id;
  if v_n <> 0 then
    raise exception 'BLOCK 4 NOT RED — the capture still wrote % row(s) with its trigger disabled.', v_n;
  end if;
  raise notice 'BLOCK 4 IS RED — a share lands and history records nothing, so "who could see this, and when" answers nobody and the audit this lane relies on is a second store away from being needed.';
end $t$;
alter table iam.permissions enable trigger zzz_history_grant_capture;  -- matrx-real-data:allow zzz_history_grant_capture is the real live trigger name from migrations/campaign/w3_hist_grant_capture.sql, not fixture data

-- ══════ BLOCK 5 — a flat lane list: the four choices collapse and one of them disappears
create or replace function custom.share_lanes()
returns table (choice text, lane text, discoverable boolean, label text, means text)
language sql stable security definer set search_path to 'pg_catalog' as $$
  -- THE FLAT LIST the memory rule forbids: three rows, no discoverable flag, "anyone with the
  -- link" gone entirely.
  select * from (values
    ('mine',         'mine',         false, 'Private', 'Only me.'),
    ('organization', 'organization', false, 'My organization', 'Everyone here.'),
    ('world',        'world',        true,  'Public', 'Everyone.')
  ) as t(choice, lane, discoverable, label, means);
$$;
do $t$
declare v_msg text;
begin
  if (select count(*) from custom.share_lanes()) <> 3 then
    raise exception 'BLOCK 5 NOT RED — the flat list is not flat.';
  end if;
  begin
    perform custom.share_lane_set('5bd50000-0000-4a00-8a00-000000000a01',
                                  '5bd50000-0000-4a00-8a00-000000000301', 'community');
    raise exception 'BLOCK 5 NOT RED — the community choice survived the flattening.';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    raise notice 'BLOCK 5 IS RED — "anyone with the link" no longer exists: %', v_msg;
  end;
end $t$;

do $t$ begin raise notice '5 of 5 blocks are RED'; end $t$;
rollback;

-- ════════════════════════════════════════════════ THE ROLLBACK, verified out loud
do $t$
declare v_n int;
begin
  if not (select p.prosecdef from pg_proc p where p.oid = 'iam._per_table_grant_guard()'::regprocedure) then
    raise exception 'ROLLBACK NOT VERIFIED — the grant guard is still SECURITY INVOKER.';
  end if;
  select count(*) into v_n from iam.grant_path_blanket_refusals();
  if v_n <> 0 then raise exception 'ROLLBACK NOT VERIFIED — % blanket refusal(s) remain.', v_n; end if;
  if (select count(*) from custom.share_lanes()) <> 4 then
    raise exception 'ROLLBACK NOT VERIFIED — the lane list did not come back.';
  end if;
  if (select count(*) from custom.share_access('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f',
        (select r.id from custom.record r
          where r.organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f' and r.deleted_at is null
          limit 1)) where reason = 'owner') <> 1 then
    raise exception 'ROLLBACK NOT VERIFIED — custom.share_access did not come back with its reasons.';
  end if;
  select count(*) into v_n from iam.organizations where id = '5bd50000-0000-4a00-8a00-000000000a01';
  if v_n <> 0 then raise exception 'ROLLBACK NOT VERIFIED — the throwaway organization survived.'; end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'iam.permissions'::regclass
                    and t.tgname = 'zzz_history_grant_capture' and t.tgenabled <> 'D') then  -- matrx-real-data:allow zzz_history_grant_capture is the real live trigger name from migrations/campaign/w3_hist_grant_capture.sql, not fixture data
    raise exception 'ROLLBACK NOT VERIFIED — the grant capture trigger is still disabled.';
  end if;
  raise notice 'ROLLBACK VERIFIED — every reversal is gone and census is zero.';
end $t$;
