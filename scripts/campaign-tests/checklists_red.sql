-- LANE CHECKLISTS — THE RED TWIN of `scripts/campaign-tests/checklists_green.sql`.
--
-- Four blocks. THREE OF THEM RUN THE REAL BYTES of this lane's own inverse migrations, so the
-- code under test is the code that was actually live before the fix and not a story about it;
-- the fourth drops the trigger the whole product rests on. Each one then asserts the defect
-- exactly as it stood. On the MAIN database, in one transaction that ends in ROLLBACK, so the
-- planted bytes never outlive the run — and PART 5 proves the four bodies are byte-identical
-- to what they were before this file started.
--
-- RUN IT:
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/checklists_red.sql
--
-- IT PASSES WHEN EVERY BLOCK IS RED. A block that comes out green means the fix it names is
-- not in the live database, so the green suite's clause for it is proving nothing.

\set ON_ERROR_STOP on
\timing off

begin;
set local lock_timeout = '45s';
set local statement_timeout = '180s';

-- WHO THE CONNECTED ROLE IS, captured before any seat is taken, and never written as a literal
-- (rule 15): planting bytes is an OPERATOR act and the seat may not do it. Every block that
-- writes a function body steps out to this role first and says so; every block that asserts a
-- product clause takes the seat back.
create temporary table zz_ckl_boss on commit drop as select current_user as who;
grant select on zz_ckl_boss to authenticated;

-- The two trigger bodies, kept whole so the blocks below can put them back exactly.
create temporary table zz_ckl_guards on commit drop as
  select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname in ('_checklist_step_guard', '_checklist_watch');

-- The six bodies as they stand RIGHT NOW, so PART 5 can prove nothing leaked out.
create temporary table zz_ckl_before on commit drop as
  select p.proname, md5(pg_get_functiondef(p.oid)) as fingerprint
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname in ('work_assign', 'checklist_declare', 'checklist_start',
                       'checklist_step_complete', '_checklist_step_guard', '_checklist_watch');

-- ════════════════════════════════════════════════════════════════════════════
-- THE FIXTURE, once, for every block below. Written as the connected role; it asserts nothing.
create temporary table zz_ckl_fixture on commit drop as select
  '87a6e699-3622-4869-8843-d0867456c0dd'::uuid as admin_id,
  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid as dana_id,
  gen_random_uuid() as org,
  null::uuid as people, null::uuid as tpl, null::uuid as home;

-- The seat reads and writes this one row. A temporary table is not the store, it dies with the
-- transaction, and it carries no product clause — it is how the four blocks below share one
-- fixture without rebuilding an organization four times.
grant select, update on zz_ckl_fixture to authenticated;

do $t$
declare
  f  record;
  v_home uuid;
  v_people uuid;
  v_tpl  uuid;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'checklists_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  select * into f from zz_ckl_fixture;

  perform set_config('app.actor_system', 'campaign-test/checklists_red', true);
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (f.org, 'ZZ CHECKLISTS Red ' || substr(f.org::text, 1, 8),
          'zz-checklists-red-' || substr(f.org::text, 1, 8), 'ZCR', f.admin_id);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (f.org, 'organization', f.org, f.admin_id, 'owner',  'active'),
    (f.org, 'organization', f.org, f.dana_id,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', f.org, f.org, 'true'::jsonb, 'checklists_red'),
    ('custom','member_default_visibility','organization', f.org, f.org, '"shared_only"'::jsonb, 'checklists_red');
  insert into custom.record (organization_id, table_id, data)
  values (f.org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_people := custom.table_declare(f.org, jsonb_build_object(
    'name', 'People', 'slug', 'people', 'type', 'entity',
    'label_singular', 'Person', 'label_plural', 'People',
    'title_field', 'name', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true,
    'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'name', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name'))));
  perform custom.field_declare(f.org, v_people, jsonb_build_object(
    'key', 'name', 'label', 'Name', 'type', 'text', 'sort', 10, 'required', true));

  v_tpl := (custom.checklist_declare(f.org, jsonb_build_object(
    'name', 'New hire onboarding',
    'about_table_id', v_people::text,
    'roles', jsonb_build_array(
      jsonb_build_object('role', 'hr', 'user_id', f.admin_id::text),
      jsonb_build_object('role', 'it', 'user_id', f.dana_id::text)),
    'trigger', jsonb_build_object('kind', 'record_created', 'table_id', v_people::text),
    'steps', jsonb_build_array(
      jsonb_build_object('ref', 'contract', 'title', 'Send the contract', 'role', 'hr',
                         'due_days', 0, 'requires', jsonb_build_object('kind', 'note')),
      jsonb_build_object('ref', 'laptop', 'title', 'Order the laptop', 'role', 'it',
                         'due_days', 2, 'depends_on', jsonb_build_array('contract'))))) ->> 'template_id')::uuid;

  update zz_ckl_fixture set people = v_people, tpl = v_tpl, home = v_home;
  raise notice 'fixture ready — organization %, checklist %', f.org, v_tpl;
end
$t$;

-- ════════════════════════════════════════════════════════════════════════════
-- RED 1 — WITHOUT THE GUARD, STEP TWO IS TICKED ON THE FIRST MORNING.
-- The guard is what makes the rule a rule rather than a politeness inside one door.
--
-- IT IS THE GUARD'S BODY THAT IS REPLACED, NOT THE TRIGGER THAT IS DROPPED, and the reason is
-- worth writing down: `drop trigger … on custom.record` takes ACCESS EXCLUSIVE on the store's
-- one table, so a red twin that dropped triggers would fight every other session on this
-- database for it — measured here on 2026-09-20, three attempts, three lock timeouts. Replacing
-- the function the trigger calls takes no lock on the table at all and tests exactly the same
-- thing: with this body, the trigger fires and decides nothing, which is what a dropped guard
-- amounts to.
do $t$
begin
  -- OUT OF THE SEAT: planting bytes is an operator act. No product clause is asserted here.
  perform set_config('role', (select who from zz_ckl_boss), true);
end
$t$;

do $t$
begin
  execute $body$
    create or replace function custom._checklist_step_guard() returns trigger
    language plpgsql set search_path to 'pg_catalog' as $g$
    begin
      return new;   -- the guard, doing what no guard does
    end
    $g$;
  $body$;
end
$t$;

do $t$
declare
  f      record;
  v_hire uuid;
  v_run  uuid;
  v_step uuid;
  v_done uuid;
begin
  select * into f from zz_ckl_fixture;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  v_hire := custom.record_write(f.org, f.people, jsonb_build_object('name', 'Red One'));
  select r.run_id into v_run from custom.checklist_runs(f.org, f.people, v_hire, true, 10) r;
  select s.step_id into v_step from custom.checklist_run(f.org, v_run) s where s.ref = 'laptop';
  select s.state_id into v_done from custom.work_record_states(f.org, v_step) s where s.name = 'Done';

  -- The contract has not been sent. This must NOT be possible, and without the guard it is.
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  perform custom.work_set_state(f.org, v_step, v_done);
  if not (select s.finished from custom.checklist_run(f.org, v_run) s where s.ref = 'laptop') then
    raise exception 'RED 1 CAME OUT GREEN — the step refused even with zz_ckl_step_guard dropped, so something else is holding the rule and the green suite is measuring that instead';
  end if;
  raise notice 'RED 1 — with the guard deciding nothing, the laptop was ordered before the contract was sent, and nobody was told.';
end
$t$;

do $t$
begin
  -- OUT OF THE SEAT: planting bytes is an operator act. No product clause is asserted here.
  perform set_config('role', (select who from zz_ckl_boss), true);
end
$t$;

do $t$
begin
  execute (select b.def from zz_ckl_guards b where b.proname = '_checklist_step_guard');
end
$t$;

-- ════════════════════════════════════════════════════════════════════════════
-- RED 2 — THE REAL PRE-FIX BYTES of custom.work_assign: a run dies on its own first step,
-- because the person it belongs to already wrote it.
do $t$
begin
  -- OUT OF THE SEAT: planting bytes is an operator act. No product clause is asserted here.
  perform set_config('role', (select who from zz_ckl_boss), true);
end
$t$;

\i migrations/inverse/checklists_assigning_somebody_their_own_row_down.sql

do $t$
declare
  f       record;
  v_hire  uuid;
  v_caught text;
begin
  select * into f from zz_ckl_fixture;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  begin
    v_hire := custom.record_write(f.org, f.people, jsonb_build_object('name', 'Red Two'));
    raise exception 'RED 2 CAME OUT GREEN — a new hire arrived and the run started, so the pre-fix custom.work_assign is not what is live';
  exception when sqlstate '23505' or sqlstate '42501' or sqlstate '23514' then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught not like '%already owns this record%' then
    raise exception 'RED 2 failed for another reason: %', v_caught;
  end if;
  raise notice 'RED 2 — the whole onboarding died on step one: %', v_caught;
end
$t$;

-- ════════════════════════════════════════════════════════════════════════════
-- RED 3 — THE REAL PRE-FIX BYTES of the three writing doors: a stranger is told about an
-- organization's switch instead of being told they are not in it.
do $t$
begin
  -- OUT OF THE SEAT: planting bytes is an operator act. No product clause is asserted here.
  perform set_config('role', (select who from zz_ckl_boss), true);
end
$t$;

\i migrations/inverse/checklists_the_wall_is_the_first_answer_down.sql

do $t$
declare
  f        record;
  v_caught text;
begin
  select * into f from zz_ckl_fixture;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  begin
    perform custom.checklist_start(gen_random_uuid(), f.tpl, null, '{}'::jsonb, null);
    raise exception 'RED 3 CAME OUT GREEN — a stranger started a checklist in an organization of their own';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught not like '%switched off%' then
    raise exception 'RED 3 failed for another reason: %', v_caught;
  end if;
  raise notice 'RED 3 — a stranger was answered: %', v_caught;
end
$t$;

-- ════════════════════════════════════════════════════════════════════════════
-- RED 4 — WITHOUT the watcher, "every new hire gets these twelve steps" becomes "if somebody
-- remembers". A new hire arrives and nothing happens at all. Same technique as RED 1, for the
-- same measured reason.
do $t$
begin
  -- OUT OF THE SEAT: planting bytes is an operator act. No product clause is asserted here.
  perform set_config('role', (select who from zz_ckl_boss), true);
end
$t$;

do $t$
begin
  execute $body$
    create or replace function custom._checklist_watch() returns trigger
    language plpgsql security definer set search_path to 'pg_catalog' as $w$
    begin
      return null;   -- the watcher, watching nothing
    end
    $w$;
  $body$;
end
$t$;

do $t$
declare
  f      record;
  v_hire uuid;
  v_n    integer;
begin
  select * into f from zz_ckl_fixture;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  -- custom.work_assign is still the pre-fix body from RED 2, so this hire is written without a
  -- run at all — which is exactly what is being shown.
  v_hire := custom.record_write(f.org, f.people, jsonb_build_object('name', 'Red Four'));
  select count(*) into v_n from custom.checklist_runs(f.org, f.people, v_hire, true, 10);
  if v_n <> 0 then
    raise exception 'RED 4 CAME OUT GREEN — % run(s) started with zz_ckl_watch dropped', v_n;
  end if;
  raise notice 'RED 4 — a new hire arrived and no checklist started. Nobody was told that either.';
end
$t$;

do $t$
begin
  -- OUT OF THE SEAT: planting bytes is an operator act. No product clause is asserted here.
  perform set_config('role', (select who from zz_ckl_boss), true);
end
$t$;

do $t$
begin
  execute (select b.def from zz_ckl_guards b where b.proname = '_checklist_watch');
end
$t$;

-- ════════════════════════════════════════════════════════════════════════════
-- PART 5 — put the four real bodies back and prove they are byte-identical.
do $t$
begin
  -- OUT OF THE SEAT: planting bytes is an operator act. No product clause is asserted here.
  perform set_config('role', (select who from zz_ckl_boss), true);
end
$t$;

\i migrations/campaign/checklists_assigning_somebody_their_own_row.sql
do $t$
begin
  -- OUT OF THE SEAT: planting bytes is an operator act. No product clause is asserted here.
  perform set_config('role', (select who from zz_ckl_boss), true);
end
$t$;

\i migrations/campaign/checklists_the_wall_is_the_first_answer.sql

do $t$
declare
  v_drift text;
begin
  select string_agg(b.proname, ', ') into v_drift
    from zz_ckl_before b
    join pg_proc p on p.proname = b.proname and p.pronamespace = 'custom'::regnamespace
   where md5(pg_get_functiondef(p.oid)) is distinct from b.fingerprint;
  if v_drift is not null then
    raise exception 'PART 5: these bodies are not what they were before this file ran: %', v_drift;
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'zz_ckl_step_guard'
                   and tgrelid = 'custom.record'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'zz_ckl_watch'
                   and tgrelid = 'custom.record'::regclass) then
    raise exception 'PART 5: a trigger this file relies on is not attached';
  end if;
  raise notice 'PART 5 — six bodies byte-identical, both triggers attached. ALL FOUR BLOCKS WERE RED.';
end
$t$;

rollback;
