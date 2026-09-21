-- LEVEL-FIX — THE GREEN SUITE. "VIEWER" MEANS VIEWER, THROUGH THE REAL DOORS, FROM TWO SEATS.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/levelfix_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/` and is discovered
-- by no sweep.
--
-- WHAT IT PROVES. The fifth independent pass shared a record with a colleague at VIEWER through
-- the Share dialog, and she rewrote it, deleted it and created her own — and kept editing after
-- the share was revoked. The two doors disagreed in the same breath: `custom.share_access` said
-- `viewer` and the read door said `editor`. Every part below is that walk, driven through the
-- SAME doors a browser reaches, as role `authenticated` carrying each person's claims.
--
-- THE ORGANIZATION IS BUILT THE WAY A NEW CUSTOMER'S IS: the store switch on, and EVERY OTHER
-- KNOB LEFT AT ITS SHIPPED DEFAULT. That is the whole point — the defect was invisible to the
-- earlier suites because they set `custom/member_default_visibility = shared_only` first.
--
-- THE IDENTITIES. `admin@admin.com` owns the throwaway organization; `test@test.com` (Dana) is a
-- plain MEMBER of it. Nobody's own records are touched. It signs nobody in and reads no credential.
--
-- ITS RED TWIN is `levelfix_red.sql`.

\set ON_ERROR_STOP on
\timing off

\set ORG    '\'1ef10000-0000-4a00-8a00-000000000b01\''
\set ADMIN  '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA   '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\set HQ     '\'1ef10000-0000-4a00-8a00-000000000b11\''
\set TBL    '\'1ef10000-0000-4a00-8a00-000000000b21\''
\set REC    '\'1ef10000-0000-4a00-8a00-000000000b31\''
-- The CONTROL organization: identical in every way except that its store switch is OFF, which
-- is where `iam.has_access_for_base` keeps the 2026-08-12 editor cap untouched.
\set ORG2   '\'1ef10000-0000-4a00-8a00-000000000b02\''
\set TBL2   '\'1ef10000-0000-4a00-8a00-000000000b22\''
\set REC2   '\'1ef10000-0000-4a00-8a00-000000000b32\''

-- ══════════════════════════════════════════════ STEP 0 — a clean slate, both ways
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG, :ORG2));
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG, :ORG2));
delete from platform.associations where organization_id in (:ORG, :ORG2);
delete from custom.record where organization_id in (:ORG, :ORG2);
delete from custom.field  where organization_id in (:ORG, :ORG2);
delete from custom.io_outbox where organization_id in (:ORG, :ORG2);
delete from custom.io_comment where organization_id in (:ORG, :ORG2);
delete from custom.record_alias where organization_id in (:ORG, :ORG2);
delete from custom.visibility_epoch where organization_id in (:ORG, :ORG2);
delete from custom.organization_visibility_version where organization_id in (:ORG, :ORG2);
delete from history.row_versions where organization_id in (:ORG, :ORG2);
delete from history.migration_log where organization_id in (:ORG, :ORG2);
delete from platform.knob_override where organization_id in (:ORG, :ORG2);
delete from iam.memberships where organization_id in (:ORG, :ORG2);
delete from iam.organizations where id in (:ORG, :ORG2);

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG,  'LEVELFIX Green Throwaway',         'levelfix-green-throwaway',   'LFG', :ADMIN),
       (:ORG2, 'LEVELFIX Green Control (store off)', 'levelfix-green-control',   'LFC', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG,  'organization', :ORG,  :ADMIN, 'owner',  'active'),
       (:ORG,  'organization', :ORG,  :DANA,  'member', 'active'),
       (:ORG2, 'organization', :ORG2, :ADMIN, 'owner',  'active'),
       (:ORG2, 'organization', :ORG2, :DANA,  'member', 'active');
-- THE ONLY KNOB SET. Everything else is the shipped default, which is the configuration the
-- fifth pass used and the configuration a real first-time admin gets.
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', :ORG,  :ORG,  'true'::jsonb, 'LEVEL-FIX green suite'),
       ('custom', 'system_enabled', 'organization', :ORG2, :ORG2, 'true'::jsonb, 'LEVEL-FIX green suite');
commit;

begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
do $t$
declare
  v_org   constant uuid := '1ef10000-0000-4a00-8a00-000000000b01';
  v_korg  constant uuid := '11111111-0000-4000-8000-000000000004';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_hq    constant uuid := '1ef10000-0000-4a00-8a00-000000000b11';
  v_tbl   constant uuid := '1ef10000-0000-4a00-8a00-000000000b21';
  v_rec   constant uuid := '1ef10000-0000-4a00-8a00-000000000b31';
  t uuid;
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, v_korg, 'record', jsonb_build_object('name', 'LEVELFIX Green HQ'), v_admin);

  t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Case', 'slug', 'levelfix_green_case', 'label_singular', 'Case', 'label_plural', 'Cases',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));
  if t is distinct from v_tbl then
    update custom.record set id = v_tbl where organization_id = v_org and id = t;
    update custom.record set data = data || jsonb_build_object('entity_definition_id', v_tbl::text)
     where organization_id = v_org and table_id = custom.field_kernel_id()
       and (data ->> 'entity_definition_id')::uuid = t;
    update custom.field set entity_definition_id = v_tbl where organization_id = v_org and entity_definition_id = t;
  end if;

  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_rec, v_org, v_tbl, 'record', jsonb_build_object('title', 'The admin''s record'), v_admin);
end $t$;
commit;

-- THE CONTROL. The same fixture in the second organization, whose switch is then turned OFF —
-- so part 1c can ask the access kernel a question about a row the suite owns instead of about
-- somebody's real data, and prove the arm this lane did NOT change is still exactly as it was.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
do $t$
declare
  v_org2  constant uuid := '1ef10000-0000-4a00-8a00-000000000b02';
  v_korg  constant uuid := '11111111-0000-4000-8000-000000000004';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_tbl2  constant uuid := '1ef10000-0000-4a00-8a00-000000000b22';
  v_rec2  constant uuid := '1ef10000-0000-4a00-8a00-000000000b32';
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_tbl2, v_org2, v_korg, 'record', jsonb_build_object('name', 'LEVELFIX Control HQ'), v_admin),
         (v_rec2, v_org2, v_tbl2, 'record', jsonb_build_object('title', 'The control record'), v_admin);
end $t$;
update platform.knob_override set value = 'false'::jsonb
 where organization_id = :ORG2 and feature = 'custom' and key = 'system_enabled';
commit;

-- ═══════════════════════ PART 1 — THE RUNG. Membership alone is the organization's own level.
begin;
set local statement_timeout = '60s';
do $t$
declare
  v_org   constant uuid := '1ef10000-0000-4a00-8a00-000000000b01';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_tbl   constant uuid := '1ef10000-0000-4a00-8a00-000000000b21';
  v_rec   constant uuid := '1ef10000-0000-4a00-8a00-000000000b31';
  v_org2  constant uuid := '1ef10000-0000-4a00-8a00-000000000b02';
  v_rec2  constant uuid := '1ef10000-0000-4a00-8a00-000000000b32';
  v_lvl public.permission_level;
begin
  -- 1a — the two doors agree. This is the defect in one line: `custom.effective_level` (what the
  -- read door decides) and `iam.member_default_level` (what the Access tab reports).
  v_lvl := custom.effective_level(v_dana, v_org, v_rec, 'record');
  if v_lvl is distinct from iam.member_default_level(v_org, v_tbl) then
    raise exception '1a FAILED — the read door says % and the organization''s knob says %. '
      'Two doors, two answers, which is the whole defect.',
      coalesce(v_lvl::text, 'nothing'), coalesce(iam.member_default_level(v_org, v_tbl)::text, 'nothing');
  end if;
  if v_lvl is distinct from 'viewer'::public.permission_level then
    raise exception '1a FAILED — a plain member of an organization with every knob at its shipped '
      'default reads % on a record somebody else made, and the shipped default is viewer.', v_lvl;
  end if;
  -- 1b — and she may not write it.
  if custom.has_visibility(v_dana, 'record', v_rec, 'editor'::public.permission_level) then
    raise exception '1b FAILED — membership alone still confers editor.';
  end if;
  -- 1c — THE ARM THIS LANE DID NOT CHANGE. The whole fix is gated on `custom/system_enabled`:
  -- where an organization has not turned the store on, `iam.has_access_for_base` keeps the
  -- 2026-08-12 editor cap byte-for-byte, which is what makes applying it safe for every table
  -- on this platform. The control organization is identical except for that one switch.
  if not iam.has_access_for(v_dana, 'record', v_rec2, 'editor'::public.permission_level) then
    raise exception '1c FAILED — the organization-member lane lost its editor cap in an '
      'organization whose store switch is OFF. This lane was supposed to change NOTHING until '
      'an organization turns the store on.';
  end if;
  if custom.effective_level(v_dana, v_org2, v_rec2, 'record') is distinct from 'editor'::public.permission_level then
    raise exception '1c FAILED — the control organization (store off) answers % instead of the '
      'editor it always answered.', coalesce(custom.effective_level(v_dana, v_org2, v_rec2, 'record')::text, 'nothing');
  end if;
  raise notice 'PART 1 PASSED — membership alone confers the organization''s own level (viewer), '
    'the read door and the knob agree, and an organization whose switch is off still answers '
    'exactly what it always answered.';
end $t$;
commit;

-- ═══════════════ PART 2 — THE TWO SEATS, THROUGH THE REAL DOORS. Viewer cannot write.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
-- The admin shares the record at VIEWER, exactly as the Share dialog does.
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
values ('record', :REC, :DANA, 'viewer', :ADMIN);
reset role;

-- Now Dana's seat. Everything below is what a browser would reach.
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare
  v_org  constant uuid := '1ef10000-0000-4a00-8a00-000000000b01';
  v_tbl  constant uuid := '1ef10000-0000-4a00-8a00-000000000b21';
  v_rec  constant uuid := '1ef10000-0000-4a00-8a00-000000000b31';
  v_said text;
  v_new  uuid;
begin
  -- 2a — the Access tab and the door say the same word.
  select level::text into v_said from custom.share_access(v_org, v_rec)
   where principal_kind = 'person' and reason = 'direct';
  if v_said is distinct from 'viewer' then
    raise exception '2a FAILED — the share door reports %, expected viewer.', coalesce(v_said, 'nothing');
  end if;

  -- 2b — SHE CAN READ IT. A viewer is a viewer, not a stranger.
  perform custom.read_record(v_org, v_rec, false);

  -- 2c — SHE CANNOT REWRITE IT. This is `record_update` → version 7 in the fifth pass.
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('title', 'Dana was here'), null);
    raise exception '2c FAILED — a VIEWER rewrote the owner''s record through custom.record_update.';
  exception when insufficient_privilege then
    null;
  end;

  -- 2d — SHE CANNOT DELETE IT. This is `record_delete` → accepted, gone.
  begin
    perform custom.record_delete(v_org, v_rec);
    raise exception '2d FAILED — a VIEWER deleted the owner''s record through custom.record_delete.';
  exception when insufficient_privilege then
    null;
  end;

  -- 2e — AND SHE CANNOT ADD ONE OF HER OWN TO THE TABLE. A table nobody gave her editor on is
  -- not a table she may write into; `custom.record_write` asks for editor ON THE TABLE.
  begin
    v_new := custom.record_write(v_org, v_tbl, jsonb_build_object('title', 'Dana''s own'));
    raise exception '2e FAILED — a VIEWER created record % in the admin''s table.', v_new;
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'PART 2 PASSED — shared at viewer: she reads it, and update, delete and create '
    'are all refused in the store''s own sentence.';
end $t$;
reset role;
-- 2f — and the value is where the owner left it. Asked OUTSIDE her seat on purpose: no client
-- role holds a SELECT privilege anywhere in schema `custom` and none ever will (census 7 of
-- check:store-doors-decide), so reading the row to check it is the suite's job, not hers.
do $t$
begin
  if (select r.data ->> 'title' from custom.record r
       where r.id = '1ef10000-0000-4a00-8a00-000000000b31') is distinct from 'The admin''s record' then
    raise exception '2f FAILED — the record''s title moved.';
  end if;
  if not exists (select 1 from custom.record r
                  where r.id = '1ef10000-0000-4a00-8a00-000000000b31' and r.deleted_at is null) then
    raise exception '2f FAILED — the record is gone.';
  end if;
  if exists (select 1 from custom.record r
              where r.organization_id = '1ef10000-0000-4a00-8a00-000000000b01'
                and r.data ->> 'title' = 'Dana''s own') then
    raise exception '2f FAILED — the viewer''s own record landed in the table.';
  end if;
  raise notice 'PART 2f PASSED — the value is unmoved, the record is still there, and nothing '
    'she tried to create exists.';
end $t$;
commit;

-- ═══════════════ PART 3 — RAISING IT WORKS, AND REVOKING IT TAKES EFFECT ON THE NEXT CALL.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
update iam.permissions set permission_level = 'editor'
 where resource_type = 'record' and resource_id = :REC and granted_to_user_id = :DANA;
commit;

begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare
  v_org constant uuid := '1ef10000-0000-4a00-8a00-000000000b01';
  v_rec constant uuid := '1ef10000-0000-4a00-8a00-000000000b31';
begin
  -- 3a — EDITOR really edits. A cap that refused everybody would pass part 2 and be useless.
  perform custom.record_update(v_org, v_rec, jsonb_build_object('title', 'Dana may edit now'), null);
end $t$;
reset role;
do $t$
begin
  if (select r.data ->> 'title' from custom.record r
       where r.id = '1ef10000-0000-4a00-8a00-000000000b31') is distinct from 'Dana may edit now' then
    raise exception '3a FAILED — the editor''s write did not land.';
  end if;
  raise notice 'PART 3 PASSED — raised to editor through the same grant row, the same door takes '
    'the write.';
end $t$;
commit;

begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
delete from iam.permissions
 where resource_type = 'record' and resource_id = :REC and granted_to_user_id = :DANA;
commit;

-- ═══════════════ PART 4 — REVOKED. The organization's own setting is what is left, and the
--                 organization can say it is nothing.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare
  v_org constant uuid := '1ef10000-0000-4a00-8a00-000000000b01';
  v_rec constant uuid := '1ef10000-0000-4a00-8a00-000000000b31';
begin
  -- 4a — the very next call. She is back to the organization's default and no further: the
  -- fifth pass's `record_update` → version 11 AFTER the revoke.
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('title', 'after the revoke'), null);
    raise exception '4a FAILED — she edited the record AFTER the share was revoked.';
  exception when insufficient_privilege then
    null;
  end;
end $t$;
reset role;
do $t$
begin
  if custom.effective_level('4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid,
                            '1ef10000-0000-4a00-8a00-000000000b01'::uuid,
                            '1ef10000-0000-4a00-8a00-000000000b31'::uuid, 'record')
       is distinct from 'viewer'::public.permission_level then
    raise exception '4a FAILED — after the revoke she is not at the organization default.';
  end if;
  if (select r.data ->> 'title' from custom.record r
       where r.id = '1ef10000-0000-4a00-8a00-000000000b31') = 'after the revoke' then
    raise exception '4a FAILED — the refused write landed anyway.';
  end if;
  raise notice 'PART 4a PASSED — the revoke takes effect on the next call, with no cache to '
    'invalidate: she is back to the organization''s own default and no further.';
end $t$;
commit;

begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb,
        'LEVEL-FIX green suite');
commit;

begin;
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare
  v_org constant uuid := '1ef10000-0000-4a00-8a00-000000000b01';
  v_rec constant uuid := '1ef10000-0000-4a00-8a00-000000000b31';
begin
  -- 4b — REVOKED CANNOT READ, in an organization that has said membership alone shows nothing.
  begin
    perform custom.read_record(v_org, v_rec, false);
    raise exception '4b FAILED — a person shared on nothing, in an organization set to '
      'shared_only, still opened the record.';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PART 4b PASSED — revoked, in an organization whose members are shown only what '
    'is shared: the door has nothing to show her.';
end $t$;
reset role;
commit;

-- ═══════════════ PART 5 — THE ORGANIZATION MAY CHOOSE MORE, AND A SHARE STILL CAPS THE PERSON.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
delete from platform.knob_override
 where organization_id = :ORG and feature = 'custom' and key = 'member_default_visibility';
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'member_default_level', 'organization', :ORG, :ORG, '"editor"'::jsonb,
        'LEVEL-FIX green suite');
commit;

begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
do $t$
declare
  v_org  constant uuid := '1ef10000-0000-4a00-8a00-000000000b01';
  v_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_rec  constant uuid := '1ef10000-0000-4a00-8a00-000000000b31';
begin
  -- 5a — the knob is SETTABLE at all. Until this lane it was `overridable_by = {}`, so this
  -- override was written and ignored, and the organization had no say in its own answer.
  if custom.effective_level(v_dana, v_org, v_rec, 'record') is distinct from 'editor'::public.permission_level then
    raise exception '5a FAILED — the organization set custom/member_default_level to editor and '
      'its member is still at %. The knob is not reaching the door.',
      coalesce(custom.effective_level(v_dana, v_org, v_rec, 'record')::text, 'nothing');
  end if;
  -- 5b — AND A VIEWER SHARE STILL CAPS HER. VIS-19: a per-thing grant overrides the role
  -- default, in both directions. This is the clause that makes "share at Viewer" mean
  -- something in an organization that is generous by default.
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
  values ('record', v_rec, v_dana, 'viewer', '87a6e699-3622-4869-8843-d0867456c0dd');
  if custom.has_visibility(v_dana, 'record', v_rec, 'editor'::public.permission_level) then
    raise exception '5b FAILED — a deliberate VIEWER share was unioned with the organization''s '
      'editor default and silently raised back to editor.';
  end if;
  -- 5c — and a PUBLIC grant may only ADD: publishing a record must never take a level away
  -- from the organization's own members.
  delete from iam.permissions
   where resource_type = 'record' and resource_id = v_rec and granted_to_user_id = v_dana;
  insert into iam.permissions (resource_type, resource_id, is_public, permission_level, created_by)
  values ('record', v_rec, true, 'viewer', '87a6e699-3622-4869-8843-d0867456c0dd');
  if not custom.has_visibility(v_dana, 'record', v_rec, 'editor'::public.permission_level) then
    raise exception '5c FAILED — publishing the record to the world LOWERED what the '
      'organization''s own members reach. A public grant is addressed to nobody and may only add.';
  end if;
  raise notice 'PART 5 PASSED — the organization may choose editor, a deliberate viewer share '
    'still caps that one person, and a public grant only ever adds.';
end $t$;
commit;

-- ═══════════════ PART 6 — THE CENSUS, ON THE WHOLE DATABASE.
begin;
set local statement_timeout = '60s';
do $t$
declare v_n int; v_who text;
begin
  select count(*), string_agg(organization_name || '/' || member_email || ' ' || records_over::text, '; ')
    into v_n, v_who
    from iam.member_level_overreach();
  if v_n <> 0 then
    raise exception '6 FAILED — % member(s) on this database reach more than their grants and '
      'their organization''s knob justify: %', v_n, v_who;
  end if;
  raise notice 'PART 6 PASSED — the overreach census is zero for every organization on this '
    'database.';
end $t$;
commit;

-- ═══════════════════════════════════════════════════════════ TEARDOWN, AND THE CENSUS OF IT
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG, :ORG2));
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG, :ORG2));
delete from platform.associations where organization_id in (:ORG, :ORG2);
delete from custom.record where organization_id in (:ORG, :ORG2);
delete from custom.field  where organization_id in (:ORG, :ORG2);
delete from custom.io_outbox where organization_id in (:ORG, :ORG2);
delete from custom.io_comment where organization_id in (:ORG, :ORG2);
delete from custom.record_alias where organization_id in (:ORG, :ORG2);
delete from custom.visibility_epoch where organization_id in (:ORG, :ORG2);
delete from custom.organization_visibility_version where organization_id in (:ORG, :ORG2);
delete from history.row_versions where organization_id in (:ORG, :ORG2);
delete from history.migration_log where organization_id in (:ORG, :ORG2);
delete from platform.knob_override where organization_id in (:ORG, :ORG2);
delete from iam.memberships where organization_id in (:ORG, :ORG2);
delete from iam.organizations where id in (:ORG, :ORG2);
commit;

do $t$
declare v_n int;
begin
  select (select count(*) from custom.record where organization_id in ('1ef10000-0000-4a00-8a00-000000000b01','1ef10000-0000-4a00-8a00-000000000b02'))
       + (select count(*) from iam.organizations where id in ('1ef10000-0000-4a00-8a00-000000000b01','1ef10000-0000-4a00-8a00-000000000b02'))
       + (select count(*) from platform.knob_override where organization_id in ('1ef10000-0000-4a00-8a00-000000000b01','1ef10000-0000-4a00-8a00-000000000b02'))
    into v_n;
  if v_n <> 0 then raise exception 'TEARDOWN FAILED — % trace(s) left behind.', v_n; end if;
  raise notice 'TEARDOWN PASSED — census zero.';
  raise notice 'ALL PARTS PASSED.';
end $t$;
