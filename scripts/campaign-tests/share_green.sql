-- SHARE — THE GREEN SUITE. A person can let another person in, and take it back.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/share_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/` and is
-- discovered by no sweep.
--
-- WHY IT IS NOT ONE ROLLED-BACK TRANSACTION. Part 4 asks "who could see this, and between
-- when and when", and history stamps every row with the TRANSACTION timestamp — inside one
-- transaction a share and its revocation share a timestamp to the microsecond and there is no
-- "between" to ask about. So this runs REAL transactions against ONE THROWAWAY organization
-- with fixed ids and deletes it at the end. Step 0 deletes it FIRST as well, so a run that
-- died half way leaves nothing behind, and the last block is a CENSUS that fails unless every
-- trace is gone.
--
-- THE IDENTITIES. `admin@admin.com` owns the throwaway organization; `test@test.com` (Dana) is
-- a plain MEMBER of it; `g2t13.tomas@example.test` (Tomas) is the third seat the ladder is
-- tested against. Nobody's own records are touched. It signs nobody in and reads no credential.
--
-- ITS RED TWIN is `share_red.sql`.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'share_green.sql'
\set requires 'relation:custom.io_outbox'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG    '\'5ba50000-0000-4a00-8a00-000000000a01\''
\set ORG2   '\'5ba50000-0000-4a00-8a00-000000000a02\''
\set ADMIN  '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA   '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\set TOMAS    '\'daeb6d44-a7dd-4085-aba2-5025fb711b79\''
\set HQ     '\'5ba50000-0000-4a00-8a00-000000000101\''
\set TBL    '\'5ba50000-0000-4a00-8a00-000000000201\''
\set REC    '\'5ba50000-0000-4a00-8a00-000000000301\''
\set BOX    '\'5ba50000-0000-4a00-8a00-000000000401\''
\set INBOX  '\'5ba50000-0000-4a00-8a00-000000000402\''

-- ══════════════════════════════════════════════ STEP 0 — a clean slate, both ways
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'share_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG, :ORG2));
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG, :ORG2));
delete from platform.associations where organization_id in (:ORG, :ORG2);
delete from custom.record where organization_id in (:ORG, :ORG2);
delete from custom.field where organization_id in (:ORG, :ORG2);
delete from custom.io_outbox where organization_id in (:ORG, :ORG2);
delete from custom.io_comment where organization_id in (:ORG, :ORG2);
delete from custom.record_alias where organization_id in (:ORG, :ORG2);
delete from custom.visibility_epoch where organization_id in (:ORG, :ORG2);
delete from custom.organization_visibility_version where organization_id in (:ORG, :ORG2);
delete from history.migration_log where organization_id in (:ORG, :ORG2);
delete from history.row_versions where organization_id in (:ORG, :ORG2);
delete from platform.knob_override where organization_id in (:ORG, :ORG2);
delete from iam.memberships where organization_id in (:ORG, :ORG2);
delete from iam.organizations where id in (:ORG, :ORG2);

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG,  'Rincon Plumbing Co',        'rincon-plumbing-share-green',   'RPC', :ADMIN),
       (:ORG2, 'Ironclad Mobile Mechanic',  'ironclad-mobile-mechanic-share-other', 'IMM', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG,  'organization', :ORG,  :ADMIN, 'owner',  'active'),
       (:ORG,  'organization', :ORG,  :DANA,  'member', 'active'),
       (:ORG,  'organization', :ORG,  :TOMAS,   'member', 'active'),
       (:ORG2, 'organization', :ORG2, :ADMIN, 'owner',  'active');
-- `iam.organization_member` is a VIEW over `iam.memberships` (container_type='organization',
-- status='active'), so the rows above are already the picker's rows. Nothing to insert twice.
-- The store is ON for this organization, so its doors take writes and history records them.
-- Membership alone confers NOTHING (VIS-33 `shared_only`), which is what makes every part
-- below mean something: a share is the only thing that could let Dana in.
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG,  :ORG,  'true'::jsonb,          'SHARE green suite'),
       ('custom', 'member_default_visibility', 'organization', :ORG,  :ORG,  '"shared_only"'::jsonb, 'SHARE green suite'),
       ('custom', 'system_enabled',            'organization', :ORG2, :ORG2, 'true'::jsonb,          'SHARE green suite');
commit;

-- ═══════════════════════════════════════════════════════ STEP 1 — the fixtures
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'share_green_suite', true);
do $t$
declare
  v_org   constant uuid := '5ba50000-0000-4a00-8a00-000000000a01';
  v_korg  constant uuid := '11111111-0000-4000-8000-000000000004';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_hq    constant uuid := '5ba50000-0000-4a00-8a00-000000000101';
  v_tbl   constant uuid := '5ba50000-0000-4a00-8a00-000000000201';
  v_rec   constant uuid := '5ba50000-0000-4a00-8a00-000000000301';
  v_box   constant uuid := '5ba50000-0000-4a00-8a00-000000000401';
  v_inbox constant uuid := '5ba50000-0000-4a00-8a00-000000000402';
  t uuid;
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, v_korg, 'record', jsonb_build_object('name', 'SHARE HQ'), v_admin);

  t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Case', 'slug', 'share_case', 'label_singular', 'Case', 'label_plural', 'Cases',
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

  -- The record under test, and a CONTAINER holding a second record — so Part 3 can show the
  -- containment reason beside the direct one, which is the whole point of "and why".
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_rec,   v_org, v_tbl, 'record', jsonb_build_object('title', 'ABC v Smith'), v_admin),
         (v_box,   v_org, v_tbl, 'record', jsonb_build_object('title', 'Matter box'), v_admin),
         (v_inbox, v_org, v_tbl, 'record',
          jsonb_build_object('title', 'Filing inside the box', 'parent_id', v_box::text), v_admin);
end $t$;
commit;

-- ═══════════════════ PART 1 — THE GUARD CLASS: a guard that cannot read refuses everything
begin;
set local statement_timeout = '60s';
do $t$
declare v_n int;
begin
  select count(*) into v_n from iam.grant_path_blanket_refusals();
  if v_n <> 0 then
    raise exception '1a FAILED — % SECURITY INVOKER trigger(s) on a client-writable table still read a table no client may SELECT: %',
      v_n, (select string_agg(g.on_table || '/' || g.guard_function || ' reads ' || g.unreadable_table, '; ')
              from iam.grant_path_blanket_refusals() g);
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'iam._per_table_grant_guard()'::regprocedure) then
    raise exception '1b FAILED — iam._per_table_grant_guard is SECURITY INVOKER again.';
  end if;
  raise notice 'PART 1 PASSED — the census of blanket refusals is zero, and the grant guard reads as the rule.';
end $t$;
commit;

-- ══════════ PART 2 — A REAL PERSON'S SHARE, through the role PostgREST actually serves
begin;
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
-- THE EXACT STATEMENT that raised `42501 permission denied for table record` for every record
-- share anybody ever attempted, until this lane.
-- SUITES-TIDY 2026-09-22 — THROUGH THE DOOR, BECAUSE THE TABLE IS CLOSED NOW.
-- This was a direct INSERT into iam.permissions from the member's seat. DOORS-ONLY-5 dropped
-- the "Users can … permissions for own resources" trio by name and `authenticated` holds SELECT
-- on iam.permissions and nothing else — measured on production and on the clone alike — so
-- Postgres answered `42501 permission denied for table permissions` before any policy was
-- consulted. `custom.share_grant` is the record store's own share door — the one the Share dialog
-- calls for a record — so the clause is now testing the path a person actually has.
-- (`iam.fn_grant_resource_permission` is the FILE side of the same closure and refuses
-- resource_type 'record' by name; a record is shared through the store's door, not that one.)
select custom.share_grant(:ORG::uuid, :REC::uuid, 'user', :TOMAS::uuid, 'viewer'::public.permission_level)
\g (tuples_only=on format=unaligned) /dev/null
reset role;
do $t$
declare v_n int;
begin
  select count(*) into v_n from iam.permissions
   where resource_type = 'record' and resource_id = '5ba50000-0000-4a00-8a00-000000000301'
     and granted_to_user_id = 'daeb6d44-a7dd-4085-aba2-5025fb711b79';
  if v_n <> 1 then raise exception '2a FAILED — the direct share did not land (% rows).', v_n; end if;
  raise notice 'PART 2 PASSED — a signed-in person wrote a record grant through the client role.';
end $t$;
commit;

-- ═══════════ PART 3 — THE STORE'S SHARE DOOR: who, at what level, and WHY, and taking it back
begin;
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;

-- 3a — the vocabulary the screen draws from: four rungs, four lane choices over THREE lanes.
do $t$
declare v_n int; v_lanes int;
begin
  select count(*) into v_n from custom.share_levels();
  if v_n <> 4 then raise exception '3a FAILED — % rungs, expected the four of the one ladder.', v_n; end if;
  if (select count(*) from custom.share_levels() where means is null or btrim(label) = '') > 0 then
    raise exception '3a FAILED — a rung with no sentence saying what it means.';
  end if;
  select count(*) into v_n from custom.share_lanes();
  select count(distinct lane) into v_lanes from custom.share_lanes();
  if v_n <> 4 or v_lanes <> 3 then
    raise exception '3a FAILED — % lane choices over % lanes; VIS-N-4 is three lanes plus discoverable, offered as four choices.', v_n, v_lanes;
  end if;
end $t$;

-- 3b — the picker: the organization's own members, and what each already has on THIS record.
do $t$
declare v_row record;
begin
  select * into v_row from custom.share_people('5ba50000-0000-4a00-8a00-000000000a01',
                                               '5ba50000-0000-4a00-8a00-000000000301')
   where email = 'test@test.com';
  if not found then raise exception '3b FAILED — a member of the organization is not in the picker.'; end if;
  if v_row.already_at is not null then
    raise exception '3b FAILED — Dana holds % before anybody shared with her, under shared_only.', v_row.already_at;
  end if;
  select * into v_row from custom.share_people('5ba50000-0000-4a00-8a00-000000000a01',
                                               '5ba50000-0000-4a00-8a00-000000000301')
   where email = 'g2t13.tomas@example.test';
  if v_row.already_at is distinct from 'viewer'::public.permission_level
     or v_row.already_why is distinct from 'Shared with them directly' then
    raise exception '3b FAILED — the picker does not say Tomas is already in at viewer (got %, %).',
      v_row.already_at, v_row.already_why;
  end if;
end $t$;

-- 3c — share with a person, and the list says who and WHY.
select custom.share_grant(:ORG, :REC, 'person', :DANA, 'viewer') \gset dana_
do $t$
declare v_own int; v_dir int; v_def int;
begin
  select count(*) filter (where reason = 'owner'),
         count(*) filter (where reason = 'direct'),
         count(*) filter (where reason = 'organization default')
    into v_own, v_dir, v_def
    from custom.share_access('5ba50000-0000-4a00-8a00-000000000a01', '5ba50000-0000-4a00-8a00-000000000301');
  if v_own <> 1 then raise exception '3c FAILED — the Owner is not named (% rows).', v_own; end if;
  if v_dir <> 2 then raise exception '3c FAILED — % direct shares, expected Tomas and Dana.', v_dir; end if;
  if v_def <> 0 then raise exception '3c FAILED — an organization-default reason under shared_only.'; end if;
  if (select count(*) from custom.share_access('5ba50000-0000-4a00-8a00-000000000a01','5ba50000-0000-4a00-8a00-000000000301')
       where reason_detail is null or btrim(reason_detail) = '') > 0 then
    raise exception '3c FAILED — a reason with no sentence.';
  end if;
  if (select count(*) from custom.share_access('5ba50000-0000-4a00-8a00-000000000a01','5ba50000-0000-4a00-8a00-000000000301')
       where reason = 'direct' and not revocable) > 0 then
    raise exception '3c FAILED — an admin is shown a direct share the dialog cannot take back.';
  end if;
end $t$;

-- 3d — the containment reason, on the record that is inside the box.
do $t$
declare v_n int; v_detail text;
begin
  -- 🚨 RE-PINNED (lane RED-SUITES-2, 2026-09-21). This asked `min(reason_detail)` and then
  -- required THAT ONE row to name the box. A record now has MORE THAN ONE container — the Table
  -- it lives in is one ("a Table you can see something inside is a Table you may know"), and the
  -- box that carries it is another — so `min()` picks whichever sorts first, and "Anyone who
  -- reaches Case reaches this too" sorts before "Anyone who reaches Matter box reaches this
  -- too". The door was right and the clause was reading an arbitrary row.
  --
  -- Measured: `custom.share_subject_name(org,'record',<the box>)` answers "Matter box", and
  -- `custom.record_words` answers "Matter box" — neither is confused about anything.
  --
  -- The promise is that the thing carrying this record IS NAMED, so that is what is asserted,
  -- over the whole set rather than one row of it. Stricter than the old clause in two ways: it
  -- cannot be satisfied by luck of sort order, and every containment row must carry a sentence.
  select count(*) into v_n
    from custom.share_access('5ba50000-0000-4a00-8a00-000000000a01', '5ba50000-0000-4a00-8a00-000000000402')
   where reason = 'containment';
  if v_n < 1 then raise exception '3d FAILED — the thing that carries this record is not named as a reason.'; end if;
  select string_agg(reason_detail, ' | ' order by reason_detail) into v_detail
    from custom.share_access('5ba50000-0000-4a00-8a00-000000000a01', '5ba50000-0000-4a00-8a00-000000000402')
   where reason = 'containment';
  if v_detail not like '%Matter box%' then
    raise exception '3d FAILED — no containment reason names the container: %', v_detail;
  end if;
end $t$;

-- 3e — re-sharing at a new level is an UPSERT, and it says what changed.
do $t$
declare v_out jsonb; v_n int;
begin
  v_out := custom.share_grant('5ba50000-0000-4a00-8a00-000000000a01', '5ba50000-0000-4a00-8a00-000000000301',
                              'person', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'editor');
  if v_out ->> 'was' <> 'viewer' or v_out ->> 'level' <> 'editor' then
    raise exception '3e FAILED — raising a level did not report the change: %', v_out;
  end if;
  select count(*) into v_n from iam.permissions
   where resource_type = 'record' and resource_id = '5ba50000-0000-4a00-8a00-000000000301'
     and granted_to_user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  if v_n <> 1 then raise exception '3e FAILED — re-sharing made a SECOND grant row (% rows).', v_n; end if;
end $t$;

-- 3f — the refusals, each in its own words: an outsider, and the wall across organizations.
do $t$
declare v_msg text;
begin
  begin
    perform custom.share_grant('5ba50000-0000-4a00-8a00-000000000a01', '5ba50000-0000-4a00-8a00-000000000301',
                               'person', '00000000-0000-4000-8000-0000000000ff', 'viewer');
    raise exception '3f FAILED — a person outside the organization was let in.';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%not in this organization%' then
      raise exception '3f FAILED — the outsider refusal does not say why: %', v_msg;
    end if;
  end;
  begin
    perform custom.share_grant('5ba50000-0000-4a00-8a00-000000000a01', '5ba50000-0000-4a00-8a00-000000000301',
                               'organization', '5ba50000-0000-4a00-8a00-000000000a02', 'viewer');
    raise exception '3f FAILED — a share reached another organization with the wall shut.';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%has not agreed to links%' then
      raise exception '3f FAILED — the wall refusal does not say why: %', v_msg;
    end if;
  end;
end $t$;

-- 3g — the lane choices actually move the thing, and the world lane refuses OUT LOUD.
do $t$
declare v_out jsonb; v_msg text; v_n int;
begin
  v_out := custom.share_lane_set('5ba50000-0000-4a00-8a00-000000000a01', '5ba50000-0000-4a00-8a00-000000000301',
                                 'organization');
  select count(*) into v_n from iam.permissions
   where resource_type = 'record' and resource_id = '5ba50000-0000-4a00-8a00-000000000301'
     and granted_to_organization_id = '5ba50000-0000-4a00-8a00-000000000a01';
  if v_n <> 1 then raise exception '3g FAILED — the organization lane wrote no organization grant.'; end if;
  begin
    perform custom.share_lane_set('5ba50000-0000-4a00-8a00-000000000a01', '5ba50000-0000-4a00-8a00-000000000301', 'world');
    raise exception '3g FAILED — the world lane published while custom/world_publish_enabled is false.';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%world lane is not open%' then
      raise exception '3g FAILED — the world refusal does not name the switch: %', v_msg;
    end if;
  end;
  v_out := custom.share_lane_set('5ba50000-0000-4a00-8a00-000000000a01', '5ba50000-0000-4a00-8a00-000000000301', 'mine');
  select count(*) into v_n from iam.permissions
   where resource_type = 'record' and resource_id = '5ba50000-0000-4a00-8a00-000000000301'
     and granted_to_organization_id = '5ba50000-0000-4a00-8a00-000000000a01';
  if v_n <> 0 then raise exception '3g FAILED — going back to mine left the organization grant standing.'; end if;
end $t$;
reset role;
do $t$ begin raise notice 'PART 3 PASSED — the door shares, lists with reasons, upserts, refuses in sentences and moves lanes.'; end $t$;
commit;

-- ═══════════════════ PART 4 — THE ONE LADDER: admin decides who else may, editor does not
begin;
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
-- Dana holds EDITOR from part 3e. Editor may change the record; it may not decide who else may.
do $t$
declare v_out jsonb;
begin
  if public.may_manage_sharing('record', '5ba50000-0000-4a00-8a00-000000000301') then
    raise exception '4a FAILED — an editor is told they may decide who else sees this.';
  end if;
  v_out := public.share_resource_with_user('record', '5ba50000-0000-4a00-8a00-000000000301',
                                           'daeb6d44-a7dd-4085-aba2-5025fb711b79', 'admin');
  if (v_out ->> 'success')::boolean then raise exception '4a FAILED — an editor shared it.'; end if;
  if v_out ->> 'error' not like '%need Admin%' then
    raise exception '4a FAILED — the refusal does not name the rung: %', v_out ->> 'error';
  end if;
end $t$;
reset role;
-- Raise Dana to admin, from the seat that may.
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
set local role authenticated;
select public.update_permission_level('record', :REC, :DANA, null, 'admin') \gset up_
reset role;
select set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare v_out jsonb; v_n int;
begin
  if not public.may_manage_sharing('record', '5ba50000-0000-4a00-8a00-000000000301') then
    raise exception '4b FAILED — an admin on the record still may not manage sharing.';
  end if;
  -- The one that used to return an EMPTY LIST with no error at all.
  select count(*) into v_n from public.get_resource_permissions('record', '5ba50000-0000-4a00-8a00-000000000301');
  if v_n < 2 then raise exception '4b FAILED — an admin is shown % grants, expected the real list.', v_n; end if;
  v_out := public.revoke_resource_access('record', '5ba50000-0000-4a00-8a00-000000000301',
                                         'daeb6d44-a7dd-4085-aba2-5025fb711b79');
  if not (v_out ->> 'success')::boolean then
    raise exception '4b FAILED — an admin could not revoke: %', v_out ->> 'error';
  end if;
  -- AND THE HONEST HALF: the revoke says what is left rather than implying nothing is.
  if v_out -> 'still_reaches' is null then
    raise exception '4b FAILED — the revoke does not say whether they still reach it.';
  end if;
end $t$;
reset role;
do $t$ begin raise notice 'PART 4 PASSED — admin decides who else may; editor does not; the refusal names the rung.'; end $t$;
commit;

-- ═══════════════════════ PART 5 — HISTORY, written in the same transaction as the grant
begin;
set local statement_timeout = '60s';
do $t$
declare v_ins int; v_upd int; v_del int; v_org_null int;
begin
  select count(*) filter (where operation = 'INSERT'),
         count(*) filter (where operation = 'UPDATE'),
         count(*) filter (where operation = 'DELETE'),
         count(*) filter (where organization_id is null)
    into v_ins, v_upd, v_del, v_org_null
    from history.row_versions
   where entity_type = 'iam.permissions'
     and (row_data ->> 'resource_id')::uuid = '5ba50000-0000-4a00-8a00-000000000301';
  if v_ins < 3 then raise exception '5a FAILED — % share rows in history, expected one per share.', v_ins; end if;
  if v_upd < 1 then raise exception '5a FAILED — a level change wrote no history row.'; end if;
  if v_del < 1 then raise exception '5a FAILED — a revoke wrote no history row.'; end if;
  if v_org_null > 0 then
    raise exception '5a FAILED — % history row(s) filed under no organization at all.', v_org_null;
  end if;
  -- And the audit can name the interval a person held it, replayed from those same rows.
  if not exists (
    select 1 from custom.visibility_as_of('5ba50000-0000-4a00-8a00-000000000a01',
                                          '5ba50000-0000-4a00-8a00-000000000301', now()) v
     where v.held_from is not null) then
    raise exception '5a FAILED — the audit cannot say when access began.';
  end if;
  raise notice 'PART 5 PASSED — every share, level change and revoke is in history under the record''s own organization.';
end $t$;
commit;

-- ═════════════════════════════════════════════════════ TEARDOWN — and the census
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'share_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG, :ORG2));
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG, :ORG2));
delete from platform.associations where organization_id in (:ORG, :ORG2);
delete from custom.record where organization_id in (:ORG, :ORG2);
delete from custom.field where organization_id in (:ORG, :ORG2);
delete from custom.io_outbox where organization_id in (:ORG, :ORG2);
delete from custom.io_comment where organization_id in (:ORG, :ORG2);
delete from custom.record_alias where organization_id in (:ORG, :ORG2);
delete from custom.visibility_epoch where organization_id in (:ORG, :ORG2);
delete from custom.organization_visibility_version where organization_id in (:ORG, :ORG2);
delete from history.migration_log where organization_id in (:ORG, :ORG2);
delete from history.row_versions where organization_id in (:ORG, :ORG2);
delete from platform.knob_override where organization_id in (:ORG, :ORG2);
delete from iam.memberships where organization_id in (:ORG, :ORG2);
delete from iam.organizations where id in (:ORG, :ORG2);
-- LAST, and deliberately after the organization itself: deleting memberships, knob overrides
-- and the organization each write their OWN history rows, so a history sweep placed earlier
-- leaves behind exactly the rows the sweep caused. The census below is what caught it.
delete from iam.permissions where resource_type = 'record'
   and resource_id::text like '5ba50000-0000-4a00-8a00-%';
delete from history.row_versions where organization_id in (:ORG, :ORG2);
delete from history.row_versions where entity_type = 'iam.permissions'
   and (row_data ->> 'resource_id') like '5ba50000-0000-4a00-8a00-%';
do $t$
declare v_n int := 0; v_x int;
begin
  select count(*) into v_x from custom.record where organization_id in
    ('5ba50000-0000-4a00-8a00-000000000a01','5ba50000-0000-4a00-8a00-000000000a02'); v_n := v_n + v_x;
  select count(*) into v_x from iam.organizations where id in
    ('5ba50000-0000-4a00-8a00-000000000a01','5ba50000-0000-4a00-8a00-000000000a02'); v_n := v_n + v_x;
  select count(*) into v_x from history.row_versions where organization_id in
    ('5ba50000-0000-4a00-8a00-000000000a01','5ba50000-0000-4a00-8a00-000000000a02'); v_n := v_n + v_x;
  select count(*) into v_x from iam.permissions p
    where p.resource_type = 'record'
      and p.resource_id::text like '5ba50000-0000-4a00-8a00-%'; v_n := v_n + v_x;
  if v_n <> 0 then raise exception 'TEARDOWN FAILED — % row(s) of this suite are still on the database.', v_n; end if;
  raise notice 'TEARDOWN PASSED — census zero.';
  raise notice 'ALL PARTS PASSED';
end $t$;
commit;
