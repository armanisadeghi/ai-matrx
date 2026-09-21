-- W1-RULE — THE RED TWIN of `w1_rule_t8.sql`, ON THE MAIN DATABASE, FROM THE SEAT
-- `authenticated`.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_rule_red.sql
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). It used to refuse to run anywhere
-- but the rehearsal branch and it performed every write as the role that OWNS
-- `custom.record`. The owner's 2026-09-18 ruling is that there is no production: everything
-- is the main database. Every ASSERTED write below now goes through the door a signed-in
-- person reaches, and the things no door covers — removing the guard under test, and calling
-- the evaluator directly — step OUT of the seat, say so, and assert no product clause while
-- out.
--
-- A guard that cannot be demonstrated FAILING is not a guard. Each transaction removes one of
-- W1-RULE's guards by REPLACING ITS TRIGGER FUNCTION WITH A PASS-THROUGH, performs from the
-- seat the very write the green suite proves is refused, and asserts it LANDS — then rolls
-- the whole thing back, guard included. Nothing here takes ACCESS EXCLUSIVE on
-- `custom.record`: `DROP TRIGGER` and `ALTER TABLE … DISABLE TRIGGER` lock the whole live
-- table against every other session for as long as the transaction runs, and on this database
-- that stalls the rest of the campaign.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/` and no sweep can see it.
--
--   RED 1  custom._rule_shape_guard — REC-15 and REC-17 at SAVE time: without it, a Rule that
--          names a field, points at a field that is not there, asks for a node nobody
--          implements, serves a fifth use and computes a hand-filled field all land in one
--          row through `custom.record_write` and READ BACK THROUGH `custom.read_record`,
--          which is how it would reach a consumer. And the EVALUATOR is the second line of
--          defence, never the first — running it refuses instead.
--   RED 2  custom._record_rule_uses — the two uses: without it, a square with unequal sides
--          is STORED through the write door and no worked-out answer is produced at all.
--   RED 3  REC-17's id-not-name mechanism, shown from the OTHER side: with every guard ON and
--          the Field's name changed, an ID-keyed reading of the Rule answers FALSE and
--          refuses, and a NAME-keyed reading of the same test answers UNDECIDED, so the bad
--          square would be stored. This is the RED for the green suite's rename clause — the
--          one clause a removed guard cannot demonstrate, because what is being tested is
--          the resolver and not the trigger.
--   RED 4  the forged worked-out answer: without the trigger, `_computed` is whatever the
--          writer says it is, a value nothing produced reaches a person through the read
--          door, and it reports a Rule version that never existed.
--   RED 5  custom.assert_client_may_change — the ACCESS wall §K credits, and the one clause
--          no trigger holds: without it `test@test.com`, a member who was shared nothing,
--          rewrites the Rule that judges everybody else's squares.

\set ON_ERROR_STOP on
\timing off

-- ── RED 1: THE RULE SHAPE GUARD (REC-15 and REC-17 at save time) ──────────────────────
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- OUT OF THE SEAT: no client door removes a production guard. Nothing is asserted here.
create or replace function custom._rule_shape_guard() returns trigger
  language plpgsql as $g$ begin return new; end $g$;

do $r1$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_tbl     constant uuid := '11111111-0004-4000-8000-000000000001';
  v_f_title constant uuid := '11111111-0004-4000-8000-000000000010';
  v_landed  uuid;
  v_j       jsonb;
  v_boss    text := current_user;
begin
  if (pg_control_system()).system_identifier <> 7642734024280108049 then
    raise exception 'w1_rule_red.sql runs on the MAIN database only, and this is %',
                    (pg_control_system()).system_identifier;
  end if;
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_rule_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_rule_red');

  -- PART 0 — TAKE THE SEAT AND PROVE IT.
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

  v_landed := custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
    'name','Floor tile sides must match','kind','predicate','scope_table_id', v_tbl::text,
    'uses', jsonb_build_array('validate','summarise'),
    'applies_to_types','[]'::jsonb,
    'use_types', jsonb_build_object('compute', jsonb_build_array('square')),
    'target_field_id', v_f_title::text,
    'expr', jsonb_build_object('op','frobnicate','args', jsonb_build_array(
              jsonb_build_object('field_name','width'),
              jsonb_build_object('field','11111111-9999-4000-8000-000000000099')))));
  if v_landed is null then
    raise exception 'RED 1: the write did not land with custom._rule_shape_guard gone';
  end if;

  -- AND IT READS BACK THROUGH THE DOOR A CONSUMER HAS.
  v_j := custom.read_record(v_org, v_landed, true);
  if not ((v_j -> 'expr' -> 'args' -> 0) ? 'field_name') then
    raise exception 'RED 1: the field NAME reference did not survive — REC-17''s save-time refusal is doing nothing else';
  end if;
  if (v_j -> 'expr' ->> 'op') <> 'frobnicate' then
    raise exception 'RED 1: the node nobody implements did not survive';
  end if;
  if not ((v_j -> 'uses') ? 'summarise') then
    raise exception 'RED 1: the fifth use did not survive';
  end if;
  if (v_j ->> 'target_field_id')::uuid <> v_f_title then
    raise exception 'RED 1: the hand-filled target field did not survive';
  end if;

  -- AND THE EVALUATOR IS THE SECOND LINE OF DEFENCE, not the first: run it and the refusal
  -- comes from `custom.rule_eval` instead. That is why the save-time walk exists at all — the
  -- Rule is refused while the person writing it is still looking at it. `custom.rule_run`
  -- holds no client grant, so this half steps OUT and says so.
  perform set_config('role', v_boss, true);
  begin
    perform custom.rule_run(v_org, v_landed, '{"width":4,"height":5}'::jsonb);
    raise exception 'RED 1: the broken Rule ANSWERED — neither the guard nor the evaluator refused it';
  exception when sqlstate '22023' then
    null;  -- expected: the evaluator refuses what the removed guard let through
  end;
  perform set_config('role', 'authenticated', true);
  raise notice 'RED 1 CONFIRMED — with custom._rule_shape_guard gone, a Rule naming a field, pointing at an absent field, asking for an unknown node, serving a fifth use, narrowing a use it does not have and computing a hand-filled field LANDS through custom.record_write and reads back through custom.read_record';
end;
$r1$;

rollback;

-- ── RED 2: THE TWO USES (REC-15 on the store) ─────────────────────────────────────────
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- OUT OF THE SEAT.
create or replace function custom._record_rule_uses() returns trigger
  language plpgsql as $g$ begin return new; end $g$;

do $r2$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_tbl     constant uuid := '11111111-0004-4000-8000-000000000001';
  v_landed  uuid;
  v_j       jsonb;
  v_n       integer;
  v_boss    text := current_user;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_rule_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_rule_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2: this suite did not take the seat — current_user is %', current_user;
  end if;

  v_landed := custom.record_write(v_org, v_tbl, '{"title":"Operatory 3 floor tile","kind":"square","width":4,"height":5}'::jsonb);
  if v_landed is null then
    raise exception 'RED 2: the write did not land with custom._record_rule_uses gone';
  end if;
  v_j := custom.read_record(v_org, v_landed, true);
  if (v_j ->> 'width') <> '4' or (v_j ->> 'height') <> '5' then
    raise exception 'RED 2: the square with unequal sides did not survive';
  end if;
  if v_j ? 'sides_equal' then
    raise exception 'RED 2: a worked-out answer appeared with the compute use gone';
  end if;
  -- `custom.computed_provenance` is the store's own and holds no client grant, so this half
  -- steps OUT and says so.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.computed_provenance(v_org, v_landed);
  if v_n <> 0 then
    raise exception 'RED 2: custom.computed_provenance returned % rows for a record nothing computed', v_n;
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'RED 2 CONFIRMED — with custom._record_rule_uses gone, a square whose sides differ IS STORED through custom.record_write and no worked-out answer is produced: both of this lane''s uses are that one guard';
end;
$r2$;

rollback;

-- ── RED 3: REC-17'S MECHANISM, FROM THE OTHER SIDE ────────────────────────────────────
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $r3$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_f_width constant uuid := '11111111-0004-4000-8000-000000000012';
  v_f_hgt   constant uuid := '11111111-0004-4000-8000-000000000013';
  v_rule    constant uuid := '11111111-0004-4000-8000-000000000101';
  v_expr    jsonb;
  v_j       jsonb;
  v_boss    text := current_user;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_rule_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_rule_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 3: this suite did not take the seat — current_user is %', current_user;
  end if;

  -- EVERY GUARD IS ON. The Field is renamed through the door a person renames a column with,
  -- exactly as the green suite's §D does.
  perform custom.migrate_rename(v_org, v_f_width, 'Breadth', 'w1_rule_red RED 3');
  v_expr := custom.read_record(v_org, v_rule, true) -> 'expr';

  -- THE ID-KEYED READING (what is built): decided, and false — so the bad square is refused.
  -- Asked from the seat, the way a person asks it.
  begin
    perform custom.record_write(v_org, '11111111-0004-4000-8000-000000000001'::uuid,
      '{"title":"Operatory 5 floor tile","kind":"square","width":4,"height":5}'::jsonb);
    raise exception 'RED 3 INCONCLUSIVE: the id-keyed Rule stopped refusing the bad square';
  exception when check_violation then null;
  end;

  -- THE NAME-KEYED READING (what REC-17 forbids), written out as the literal LABEL the Rule
  -- would have been authored against: it finds nothing at all, so it answers UNDECIDED, which
  -- the validate use does not refuse — and the bad square would be saved. `custom.rule_eval`
  -- and `custom.rule_truth` hold no client grant, so this half steps OUT and says so.
  perform set_config('role', v_boss, true);
  v_j := custom.rule_eval(v_org, jsonb_build_object('op','eq','args', jsonb_build_array(
           jsonb_build_object('const', ('{"breadth":4,"height":5}'::jsonb -> 'width')),
           jsonb_build_object('const', ('{"breadth":4,"height":5}'::jsonb -> 'height')))),
           '{}'::jsonb);
  if custom.rule_truth(v_j) is not null then
    raise exception 'RED 3: the name-keyed reading answered %, and it was supposed to find nothing at all', v_j;
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'RED 3 CONFIRMED — after the Width field is renamed the ID-keyed Rule still answers FALSE and refuses, and a NAME-keyed reading of the same test answers UNDECIDED and refuses nothing: REC-17 is the difference between the bad square being caught and being stored';
end;
$r3$;

rollback;

-- ── RED 4: THE FORGED WORKED-OUT ANSWER ───────────────────────────────────────────────
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- OUT OF THE SEAT.
create or replace function custom._record_rule_uses() returns trigger
  language plpgsql as $g$ begin return new; end $g$;

do $r4$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_tbl     constant uuid := '11111111-0004-4000-8000-000000000001';
  v_landed  uuid;
  v_src     jsonb;
  v_v       jsonb;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_rule_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_rule_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 4: this suite did not take the seat — current_user is %', current_user;
  end if;

  v_landed := custom.record_write(v_org, v_tbl,
    '{"title":"Reception floor tile","kind":"square","width":2,"height":2,
      "_computed":{"title":{"value":"forged","rule_id":"11111111-0004-4000-8000-000000000101","rule_version":99}}}'::jsonb);
  if v_landed is null then raise exception 'RED 4: the write did not land'; end if;

  -- AND IT REACHES A PERSON THROUGH THE READ DOOR, overriding the typed Title and wearing a
  -- Rule version that never existed.
  if (custom.read_record(v_org, v_landed, true) ->> 'title') <> 'forged' then
    raise exception 'RED 4: the forged answer did not reach custom.read_record — it reads %',
                    custom.read_record(v_org, v_landed, true) ->> 'title';
  end if;
  select v.value, v.source into v_v, v_src from custom.value_read(v_org, v_landed, 'title') v;
  if (v_v #>> '{}') <> 'forged' then raise exception 'RED 4: the versioned read does not carry the forged answer'; end if;
  if (v_src ->> 'rule_version')::integer is distinct from 99 then
    raise exception 'RED 4: the forged provenance did not survive — it says version %', v_src ->> 'rule_version';
  end if;
  raise notice 'RED 4 CONFIRMED — with custom._record_rule_uses gone, a worked-out answer no Rule works out is stored, overrides the typed Title through custom.read_record, and tells a person it came from Rule version 99, which never existed';
end;
$r4$;

rollback;

-- ── RED 5: THE ACCESS WALL ────────────────────────────────────────────────────────────
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $r5$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_rule    constant uuid := '11111111-0004-4000-8000-000000000101';
  v_boss    text := current_user;
  v_seen    text;
begin
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_rule_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_rule_red');

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 5: this suite did not take the seat — current_user is %', current_user;
  end if;

  -- THE WALL IS THERE: as test@test.com the rewrite is refused.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_seen := null;
  begin
    perform custom.record_update(v_org, v_rule, '{"message":"Dana says anything goes"}'::jsonb);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null then
    raise exception 'RED 5 INCONCLUSIVE: she could already rewrite the Rule, so §K proves nothing';
  end if;

  -- OUT OF THE SEAT: the one predicate that asks whether this person may change this row.
  perform set_config('role', v_boss, true);
  create or replace function custom.assert_client_may_change(
    p_organization_id uuid, p_subject_id uuid, p_door text,
    p_required public.permission_level default 'admin'::public.permission_level,
    p_subject_word text default 'record')
    returns void language plpgsql stable set search_path to 'pg_catalog'
  as $g$ begin return; end $g$;
  perform set_config('role', 'authenticated', true);

  -- AND NOW SHE DOES IT.
  perform custom.record_update(v_org, v_rule, '{"message":"Dana says anything goes"}'::jsonb);
  if (custom.read_record(v_org, v_rule, true) ->> 'message') <> 'Dana says anything goes' then
    raise exception 'RED 5 INCONCLUSIVE: the rewrite was still refused, so §K is held by something other than custom.assert_client_may_change';
  end if;
  raise notice 'RED 5 CONFIRMED — with custom.assert_client_may_change neutered, test@test.com rewrote the Rule that judges everybody else''s squares to "%"',
               custom.read_record(v_org, v_rule, true) ->> 'message';
end;
$r5$;

rollback;
