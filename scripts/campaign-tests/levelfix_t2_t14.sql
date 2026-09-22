-- LEVEL-FIX — T2 (note on three records) AND T14'S SECOND HALF (the refusal below the floor),
-- re-asked on the MAIN database after the "viewer means viewer" fix.
--
-- T2 was the fifth independent pass's one FAIL: "the member saw the note before any share was
-- made, and a member can edit what she is shown". Both clauses were the same defect, so both are
-- re-asked here. T14's second half — "an organization attempting to set retention to ten days is
-- refused" — is the clause that pass could not ask, because `custom.history_retention_set` now
-- demands a table and it had none.
--
-- It runs against ONE throwaway organization and deletes it at the end; a census fails the run
-- unless every trace is gone. `admin@admin.com` is the author, `test@test.com` (Dana) is the
-- plain member, `arman@titaniumsuccess.com` (Sam) is the principal shared on nothing.
--
-- The organization is left at `shared_only`, which is what "Dana is a viewer on A ONLY" means:
-- a test whose subject is what a SHARE conveys cannot be run in an organization that shows
-- every member everything by default.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). This suite used to ask `custom.has_visibility`
-- and `custom.effective_level` — neither of which a signed-in person may EXECUTE — while
-- connected as the role that OWNS `custom.record`. In that seat
-- `custom.assert_client_may_reach` returns on its first line, so every clause below proved
-- something about the ladder's internals and nothing about what a person is shown. It now
-- takes the seat `authenticated` in every asserting transaction, proves it holds it, and asks
-- the SAME questions through the doors a browser reaches:
--   has_visibility(dana, …)      → seated AS Dana, `custom.query_can_see(org, id, level)`
--   effective_level(admin, …)    → seated AS the author, `custom.my_level(org, id, 'record')`
--   insert into custom.record    → `custom.record_write` / `custom.table_declare`
--   select … from custom.record  → `custom.read_record(org, id, true)`
-- The fixture's own ids are carried between transactions in the HQ record exactly as before,
-- but the HQ now has a FIXED id so the seat can read it back by the one door that takes an id.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'levelfix_t2_t14.sql'
\set requires 'relation:custom.io_outbox'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG   '\'1ef10000-0000-4a00-8a00-000000000e01\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\set SAM   '\'34ed4fc3-c527-4819-99bf-15c26603b261\''
\set HQ    '\'1ef10000-0000-4a00-8a00-000000000e11\''

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'levelfix_t2_t14', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from custom.field  where organization_id = :ORG;
delete from custom.io_outbox where organization_id = :ORG;
delete from custom.io_comment where organization_id = :ORG;
delete from custom.record_alias where organization_id = :ORG;
delete from custom.visibility_epoch where organization_id = :ORG;
delete from custom.organization_visibility_version where organization_id = :ORG;
delete from history.row_versions where organization_id = :ORG;
delete from history.migration_log where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'LEVELFIX T2 Throwaway', 'levelfix-t2-throwaway', 'LFT', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active'),
       (:ORG, 'organization', :ORG, :SAM,   'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG, :ORG, 'true'::jsonb,          'LEVEL-FIX T2'),
       ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb, 'LEVEL-FIX T2');
commit;

-- ═══════════════════════════════════════ the three Tables, the three records and the note
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_t2_t14', true);
-- 🚨 NO TEMPORARY TABLE. The main database is reached through the pooler in TRANSACTION mode,
-- so two transactions in one psql session are two different backends and a temp table created
-- in the first does not exist in the second. The ids live in the fixture's own HQ record, which
-- is a row every transaction can see, and are read back by name.
do $t$
declare
  v_org   constant uuid := '1ef10000-0000-4a00-8a00-000000000e01';
  v_hq    constant uuid := '1ef10000-0000-4a00-8a00-000000000e11';
  v_korg  constant uuid := '11111111-0000-4000-8000-000000000004';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss  text := current_user;   -- for the one fixture step no client door covers
  v_tp uuid; v_tpe uuid; v_tc uuid; v_tn uuid;
  v_a uuid; v_b uuid; v_c uuid; v_note uuid;
begin
  perform set_config('request.jwt.claims', v_admin_j, true);

  -- A HOME record has no client door of its own (a Home is made by the onboarding path, not by
  -- a person's browser), so this one fixture step is written as the connected role and SAYS SO.
  -- No clause is asserted here.
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, v_korg, 'record', jsonb_build_object('name', 'T2 HQ'), v_admin);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- Four Tables and four records, declared and written THROUGH THE DOORS a person reaches.
  v_tp  := custom.table_declare(v_org, jsonb_build_object('name','Project','slug','t2_project',
    'label_singular','Project','label_plural','Projects','type','entity','display','list','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),'title_field','title',
    'parent_id', v_hq::text));
  v_tpe := custom.table_declare(v_org, jsonb_build_object('name','Person','slug','t2_person',
    'label_singular','Person','label_plural','People','type','entity','display','list','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),'title_field','title',
    'parent_id', v_hq::text));
  v_tc  := custom.table_declare(v_org, jsonb_build_object('name','Class','slug','t2_class',
    'label_singular','Class','label_plural','Classes','type','entity','display','list','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),'title_field','title',
    'parent_id', v_hq::text));
  v_tn  := custom.table_declare(v_org, jsonb_build_object('name','Note','slug','t2_note',
    'label_singular','Note','label_plural','Notes','type','entity','display','list','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),'title_field','title',
    'parent_id', v_hq::text));

  v_a := custom.record_write(v_org, v_tp,  jsonb_build_object('title','Project A'));
  v_b := custom.record_write(v_org, v_tpe, jsonb_build_object('title','Person B'));
  v_c := custom.record_write(v_org, v_tc,  jsonb_build_object('title','Class C'));
  -- "A note's parent is its author": the note hangs off the author's own HQ, not off A, B or C.
  v_note := custom.record_write(v_org, v_tn,
    jsonb_build_object('title','The note', 'parent_id', v_hq::text));

  -- the three REFERENCED CARRYING relations
  perform custom.relation_carry(v_org, v_a, v_note);
  perform custom.relation_carry(v_org, v_b, v_note);
  perform custom.relation_carry(v_org, v_c, v_note);

  -- the ids, carried to the next transaction in the HQ record, written through the write door.
  perform custom.record_update(v_org, v_hq, jsonb_build_object(
    'a', v_a::text, 'b', v_b::text, 'c', v_c::text, 'note', v_note::text, 'tn', v_tn::text), null);

  -- and the door hands them back, which is the only read this suite has.
  if (custom.read_record(v_org, v_hq, true) ->> 'note')::uuid is distinct from v_note then
    raise exception 'FIXTURE FAILED — the ids did not land in the HQ record through the write door.';
  end if;
end $t$;
commit;

-- ═══════════════════════════════════════ T2, clause by clause
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_t2_t14', true);
do $t$
declare
  v_org   constant uuid := '1ef10000-0000-4a00-8a00-000000000e01';
  v_hq    constant uuid := '1ef10000-0000-4a00-8a00-000000000e11';
  v_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_sam_j   constant text := '{"sub":"34ed4fc3-c527-4819-99bf-15c26603b261","role":"authenticated"}';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_doc jsonb;
  v_a uuid; v_c uuid; v_note uuid;
begin
  perform set_config('request.jwt.claims', v_admin_j, true);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  v_doc  := custom.read_record(v_org, v_hq, true);
  v_a    := (v_doc ->> 'a')::uuid;
  v_c    := (v_doc ->> 'c')::uuid;
  v_note := (v_doc ->> 'note')::uuid;

  -- 1. BEFORE ANY SHARE, she does not see it. Asked AS HER, through the door a person has:
  --    `custom.query_can_see` is what a browser reaches; `custom.has_visibility` holds no
  --    client grant and the old suite could only ask it because it owned the table.
  perform set_config('request.jwt.claims', v_dana_j, true);
  if custom.query_can_see(v_org, v_note, 'viewer') then
    raise exception 'T2 FAILED — the member saw the note before anybody shared anything.';
  end if;

  -- 2. Dana is a VIEWER ON A ONLY: she sees the note, and CANNOT EDIT IT.
  perform set_config('request.jwt.claims', v_admin_j, true);
  perform custom.share_grant(v_org, v_a, 'person', v_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', v_dana_j, true);
  if not custom.query_can_see(v_org, v_note, 'viewer') then
    raise exception 'T2 FAILED — shared on A, she does not see the note it carries.';
  end if;
  if custom.query_can_see(v_org, v_note, 'editor') then
    raise exception 'T2 FAILED — a VIEWER on A may EDIT the note A carries. This is the clause '
      'the fifth pass failed.';
  end if;
  -- AND THE SAME ANSWER FROM THE WRITE DOOR, which is where it costs her something: the level
  -- the ladder reports and the level the door enforces are the same level or one of them lies.
  begin
    perform custom.record_update(v_org, v_note, jsonb_build_object('title','Dana was here'), null);
    raise exception 'T2 FAILED — a VIEWER on A rewrote the note through the write door.';
  exception when insufficient_privilege or others then
    if sqlerrm like 'T2 FAILED%' then raise; end if;
  end;

  -- 3. UNSHARE A: she loses it.
  perform set_config('request.jwt.claims', v_admin_j, true);
  perform custom.share_revoke(v_org, v_a, 'person', v_dana);
  perform set_config('request.jwt.claims', v_dana_j, true);
  if custom.query_can_see(v_org, v_note, 'viewer') then
    raise exception 'T2 FAILED — A was unshared and she still sees the note.';
  end if;

  -- 4. SHARE C: she sees it again. THE CONTROL for clauses 1 and 3 — a door that refused her
  --    everything would pass both of them and fail this one.
  perform set_config('request.jwt.claims', v_admin_j, true);
  perform custom.share_grant(v_org, v_c, 'person', v_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', v_dana_j, true);
  if not custom.query_can_see(v_org, v_note, 'viewer') then
    raise exception 'T2 FAILED — shared on C, she does not see the note again.';
  end if;
  if custom.query_can_see(v_org, v_note, 'editor') then
    raise exception 'T2 FAILED — a viewer on C may edit the note.';
  end if;
  -- and she READS it, which is the whole point of a viewer share.
  if (custom.read_record(v_org, v_note, true) ->> 'title') <> 'The note' then
    raise exception 'T2 FAILED — the note she is a viewer of does not read back for her.';
  end if;

  -- 5. THE AUTHOR SEES IT THROUGHOUT. `custom.my_level` is the door's own answer to "what am
  --    I on this record"; `custom.effective_level` is the internal it calls.
  perform set_config('request.jwt.claims', v_admin_j, true);
  if custom.my_level(v_org, v_note, 'record') is distinct from 'admin'::public.permission_level then
    raise exception 'T2 FAILED — the author is at % on their own note.',
      coalesce(custom.my_level(v_org, v_note, 'record')::text, 'nothing');
  end if;

  -- 6. A PRINCIPAL SHARED ON NONE OF A, B, C OR THE AUTHOR DOES NOT SEE IT.
  perform set_config('request.jwt.claims', v_sam_j, true);
  if custom.query_can_see(v_org, v_note, 'viewer') then
    raise exception 'T2 FAILED — a member shared on nothing at all sees the note.';
  end if;
  perform set_config('request.jwt.claims', v_admin_j, true);

  raise notice 'T2 PASSED — from the seat `authenticated`: she sees it only through what carries '
    'it, she cannot edit it or rewrite it, unsharing takes it away, sharing another carrier '
    'brings it back and she reads it, the author holds it throughout, and a principal shared on '
    'nothing does not see it.';
end $t$;
commit;

-- ═══════════════════════════════════════ T14, second half: the refusal below the floor
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_t2_t14', true);
do $t$
declare
  v_org constant uuid := '1ef10000-0000-4a00-8a00-000000000e01';
  v_hq  constant uuid := '1ef10000-0000-4a00-8a00-000000000e11';
  v_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_tn  uuid;
  v_msg text;
  v_caught text;
begin
  perform set_config('request.jwt.claims', v_admin_j, true);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  v_tn := (custom.read_record(v_org, v_hq, true) ->> 'tn')::uuid;

  -- The Table is LIGHT and sits at the thirty-day floor. Ten days is below it.
  begin
    perform custom.history_retention_set(v_org, v_tn, 10);
    raise exception 'T14 FAILED — the organization set retention to ten days on a light Table '
      'whose floor is thirty.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'T14 FAILED%' then raise; end if;
    if v_msg !~* '(30|thirty|floor|less|below|minimum)' then
      raise exception 'T14 FAILED — it was refused, but the sentence does not say what the floor '
        'is or why: %', v_msg;
    end if;
    raise notice 'T14 (second half) PASSED — ten days is refused and the refusal says why: %', v_msg;
  end;
  -- and the floor itself still takes.
  perform custom.history_retention_set(v_org, v_tn, 45);
  raise notice 'T14 (second half) PASSED — and forty-five days is accepted, so the refusal is a '
    'floor and not a wall.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON. `test@test.com` is a plain member of this
  -- organization who was shared ONE record (Class C) and nothing else. How long the
  -- organization keeps its history is not a member's setting — and the refusal is an ACCESS
  -- answer, which the old seat could not ask at all: as the owner of `custom.record`,
  -- `custom.assert_client_may_reach` returned true on its first line for every organization.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', v_dana_j, true);
  v_caught := null;
  begin
    perform custom.history_retention_set(v_org, v_tn, 365);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'T14 FAILED — a plain member set the organization''s history retention.';
  end if;
  -- AND THE CONTROL, so the clause above is not a door that refuses her everything: the
  -- retention of that same Table is something she may ASK, and she may read the record she
  -- was actually given.
  if custom.history_retention(v_org, v_tn) is null then
    raise exception 'T14 FAILED — the member cannot even read the retention she may not set.';
  end if;
  raise notice 'T14 NEGATIVE PASSED — a plain member is refused the setting (%) and still reads '
    'it, so the refusal is a level and not a wall.', left(v_caught, 90);
  perform set_config('request.jwt.claims', v_admin_j, true);
end $t$;
commit;

-- ═══════════════════════════════════════ teardown, and the census of it
-- THE TEARDOWN IS AN OPERATOR STEP, not a person's. There is no client door that empties an
-- organization out of eleven tables, and there should not be; it asserts no product clause.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'levelfix_t2_t14', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from custom.field  where organization_id = :ORG;
delete from custom.io_outbox where organization_id = :ORG;
delete from custom.io_comment where organization_id = :ORG;
delete from custom.record_alias where organization_id = :ORG;
delete from custom.visibility_epoch where organization_id = :ORG;
delete from custom.organization_visibility_version where organization_id = :ORG;
delete from history.row_versions where organization_id = :ORG;
delete from history.migration_log where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;
commit;

do $t$
declare v_n int;
begin
  select (select count(*) from custom.record where organization_id = '1ef10000-0000-4a00-8a00-000000000e01')
       + (select count(*) from iam.organizations where id = '1ef10000-0000-4a00-8a00-000000000e01')
    into v_n;
  if v_n <> 0 then raise exception 'TEARDOWN FAILED — % trace(s) left behind.', v_n; end if;
  raise notice 'TEARDOWN PASSED — census zero. T2 AND T14 SECOND HALF BOTH PASSED FROM THE SEAT.';
end $t$;
