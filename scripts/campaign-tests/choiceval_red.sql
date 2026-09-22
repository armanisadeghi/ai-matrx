-- CHOICE-VALUE — THE RED TWIN. It executes the REAL BYTES of this lane's five inverse
-- migrations inside ONE transaction that ends in ROLLBACK, and then asserts — from the same
-- signed-in seat the green suite uses — that every block of `choiceval_green.sql` goes RED.
--
-- Running the inverses for real does two jobs at once: it proves the defects this lane closed
-- were real, and it proves the inverses themselves EXECUTE, which is the only thing that makes
-- them an undo rather than a file nobody has ever run.
--
-- RUN IT from the repository root (against the MAIN database):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/choiceval_red.sql
--
-- NOTHING SURVIVES IT. The organization, the table, the records and every restored body are
-- rolled back together.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'choiceval_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';

create temp table ironline_fixture (k text primary key, v uuid) on commit drop;

-- ── THE FIXTURE, as the connected role. No product clause is asserted here. ───────────────
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_t uuid; v_f_kind uuid; v_f_bikes uuid; v_s1 uuid; v_s2 uuid;
  v_wt uuid; v_f_status uuid; v_w1 uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/choiceval_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Ironline Fitness', 'ironline-fitness-'||substr(v_org::text,1,8), 'IRF', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
  values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/choiceval_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Ironline Fitness — Main Gym')) returning id into v_home;

  perform set_config('role', 'authenticated', true);

  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Classes','slug','classes','type','entity','label_singular','Class',
    'label_plural','Classes','title_field','class_name','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','class_name')),'parent_id',v_home::text,
    'type_field','kind'));
  v_f_kind := custom.field_declare(v_org, v_t, jsonb_build_object(
    'label','Kind','parity_type','select','options', jsonb_build_array('Spin','Yoga')));
  v_f_bikes := custom.field_declare(v_org, v_t, jsonb_build_object(
    'label','Bikes','plain','number','applies_to_types', jsonb_build_array('Spin')));
  v_s1 := custom.record_write(v_org, v_t, jsonb_build_object('class_name','Sunrise Spin','kind','Spin','bikes',5,'parent_id',v_home::text));
  v_s2 := custom.record_write(v_org, v_t, jsonb_build_object('class_name','Evening Yoga','kind','Yoga','parent_id',v_home::text));
  perform custom.share_grant(v_org, v_s2, 'person', c_dana, 'viewer'::public.permission_level);

  -- A work-shaped table: a `status` choice column, which is how REC-69 holds a record's state.
  v_wt := custom.table_declare(v_org, jsonb_build_object(
    'name','Front Desk Tasks','slug','front_desk_tasks','type','entity','label_singular','Task',
    'label_plural','Tasks','title_field','task_name','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','task_name')),'parent_id',v_home::text));
  v_f_status := custom.field_declare(v_org, v_wt, jsonb_build_object(
    'label','Status','parity_type','select','options', jsonb_build_array('Open','In progress','Done')));
  v_w1 := custom.record_write(v_org, v_wt, jsonb_build_object('task_name','Restock towel bins','status','Open','parent_id',v_home::text));

  perform set_config('role', 'postgres', true);
  insert into ironline_fixture (k, v) values
    ('org', v_org), ('home', v_home), ('table', v_t), ('f_kind', v_f_kind), ('f_rad', v_f_bikes),
    ('s1', v_s1), ('s2', v_s2), ('wtable', v_wt), ('w1', v_w1), ('dana', c_dana);
  raise notice 'FIXTURE — one organization, a Class table with a Kind choice and a Bikes that applies to a Spin, two records, a colleague shared one at viewer, and a Task whose Status is a choice.';
end
$t$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- THE INVERSES, FOR REAL, IN DEPENDENCY ORDER.
-- ══════════════════════════════════════════════════════════════════════════════════════════
\i migrations/inverse/choiceval_two_doors_on_the_one_ladder_down.sql
\i migrations/inverse/choiceval_a_state_is_a_word_too_down.sql
\i migrations/inverse/choiceval_the_census_answers_the_operator_down.sql
\i migrations/inverse/choiceval_every_door_says_the_word_down.sql
\i migrations/inverse/choiceval_the_values_become_words_down.sql
\i migrations/inverse/choiceval_a_choice_is_its_own_word_down.sql

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- THE ASSERTIONS, from the seat a signed-in person has.
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org    uuid := (select v from ironline_fixture where k = 'org');
  v_home   uuid := (select v from ironline_fixture where k = 'home');
  v_t      uuid := (select v from ironline_fixture where k = 'table');
  v_s2     uuid := (select v from ironline_fixture where k = 's2');
  v_wt     uuid := (select v from ironline_fixture where k = 'wtable');
  v_w1     uuid := (select v from ironline_fixture where k = 'w1');
  v_new    uuid;
  v_doc    jsonb; v_n integer; v_caught text; v_red integer := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/choiceval_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'the red twin did not take the seat — current_user is %', current_user;
  end if;

  -- RED 0 — THE SEVENTH PASS'S OWN SENTENCE. Writing the type and the column that type selects,
  -- in one go, is refused with a complaint about provenance naming a column that does exist.
  begin
    perform custom.record_write(v_org, v_t, jsonb_build_object('class_name','Dawn Spin','kind','Spin','bikes',2,'parent_id',v_home::text));
    raise exception 'RED 0 IS NOT RED: a Spin with a Bikes was written in one go';
  exception when others then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%no field called "bikes"%' then
      raise exception 'RED 0 IS NOT RED: refused, but not by the provenance sentence: %', v_caught;
    end if;
    v_red := v_red + 1;
    raise notice 'RED 0 — "%": the verdict''s own sentence, restored.', v_caught;
  end;

  -- RED 1 — a choice written as a word is stored as the OPTION RECORD'S ID again.
  v_new := custom.record_write(v_org, v_t, jsonb_build_object('class_name','Noon Spin','kind','Spin','parent_id',v_home::text));
  v_doc := custom.read_record(v_org, v_new, true);
  if (v_doc ->> 'kind') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    raise exception 'RED 1 IS NOT RED: the read door still answers % rather than a uuid', v_doc ->> 'kind';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1 — custom.read_record answers kind = %: the uuid is back.', v_doc ->> 'kind';

  -- RED 2 — T8's own clause: ask what columns THIS record has, using what it stores.
  select count(*) into v_n from custom.applicable_fields(v_org, v_t, v_doc ->> 'kind') f
   where f.data ->> 'key' = 'bikes';
  if v_n <> 0 then
    raise exception 'RED 2 IS NOT RED: asked with the stored value the table still offered Bikes';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 2 — asked what columns this Spin has, the table answers WITHOUT Bikes. That is the seventh pass''s T8 failure, restored.';

  -- RED 3 — the page door hands back the stored token, not the word.
  select count(*) into v_n from custom.read_records(v_org, v_t, false, 50, 0) rr
   where rr.document ->> 'kind' in ('Spin','Yoga');
  if v_n <> 0 then
    raise exception 'RED 3 IS NOT RED: the page door still labelled % row(s)', v_n;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 3 — custom.read_records labels none of the rows.';

  -- RED 4 — the export ships the identifier.
  if exists (select 1 from jsonb_array_elements(custom.io_export(v_org, v_t, null, 100, 'viewer') -> 'rows') x
              where x ->> 'kind' in ('Spin','Yoga')) then
    raise exception 'RED 4 IS NOT RED: the export still carries a readable Kind';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 4 — the export carries no row a person could read a Kind off.';

  -- RED 5 — the group-by names groups nobody can read.
  if exists (select 1 from custom.record_aggregate(v_org, v_t, jsonb_build_array('kind'), '[]'::jsonb, null, '{}'::jsonb, 50, 'viewer') r
              where r.groups ->> 'kind' in ('Spin','Yoga')) then
    raise exception 'RED 5 IS NOT RED: the group-by still names a group "Spin" or "Yoga"';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 5 — every group of the group-by is a 36-character identifier.';

  -- RED 6 — the conversion verb and the census are gone with their doors.
  begin
    perform custom.migrate_choice_keys(v_org, v_t, true);
    raise exception 'RED 6 IS NOT RED: custom.migrate_choice_keys still answers';
  exception when undefined_function then
    v_red := v_red + 1;
    raise notice 'RED 6 — custom.migrate_choice_keys is gone, so nothing can convert what is stored.';
  end;

  -- RED 7 — a work record whose status is a choice cannot change state at all.
  begin
    perform custom.record_update(v_org, v_w1, jsonb_build_object('status','Done'));
    raise exception 'RED 7 IS NOT RED: the status moved without the uuid cast complaining';
  exception when invalid_text_representation then
    get stacked diagnostics v_caught = message_text;
    v_red := v_red + 1;
    raise notice 'RED 7 — moving a Task from Open to Done raises "%": the work layer''s six uuid casts are back.', v_caught;
  end;

  -- RED 8 — a VIEWER can file a change request against a record she may only read.
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform custom.work_approval_request(v_org, v_s2,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('class_name','hers')),
      'campaign-test/choiceval_red');
    v_red := v_red + 1;
    raise notice 'RED 8 — a viewer filed a change request against a record she may only read.';
  exception when insufficient_privilege then
    raise exception 'RED 8 IS NOT RED: the viewer was still refused';
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- RED 9 — and nobody can ask what is stored at all: the census went with its door.
  begin
    perform custom.choice_census(v_org);
    raise exception 'RED 9 IS NOT RED: custom.choice_census still answers';
  exception when undefined_function then
    v_red := v_red + 1;
    raise notice 'RED 9 — custom.choice_census is gone, so no person and no operator can ask what a choice column is holding.';
  end;

  if v_red <> 10 then
    raise exception 'only % of the 10 blocks went red', v_red;
  end if;
  raise notice '% of 10 blocks are RED — the provenance sentence, the uuid value, T8''s columns, the page, the export, the group-by, the conversion verb, the work layer''s casts, the viewer''s request and the census nobody can ask.', v_red;
end
$t$;

rollback;

do $t$
begin
  -- ROLLBACK VERIFIED: the live bodies are this lane's again.
  if (select count(*) from pg_proc p
       where p.pronamespace = 'custom'::regnamespace and p.proname = 'choice_render') <> 1 then
    raise exception 'ROLLBACK DID NOT RESTORE: custom.choice_render is not there';
  end if;
  if (select count(*) from pg_proc p
       where p.pronamespace = 'custom'::regnamespace and p.proname = 'migrate_choice_keys') <> 1 then
    raise exception 'ROLLBACK DID NOT RESTORE: custom.migrate_choice_keys is not there';
  end if;
  if (select count(*) from pg_proc p
       where p.pronamespace = 'custom'::regnamespace and p.proname = 'work_state_id') <> 1 then
    raise exception 'ROLLBACK DID NOT RESTORE: custom.work_state_id is not there';
  end if;
  raise notice 'ROLLBACK VERIFIED — every body this twin replaced is this lane''s again, and the throwaway organization is gone.';
end
$t$;
