-- LIMITS-FIX — THE GREEN SUITE. `checkbox` is the record store's fourteenth parity type, and
-- every clause below is run THROUGH THE DOOR A SIGNED-IN PERSON REACHES, FROM THE SEAT A
-- SIGNED-IN PERSON HAS.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/checkbox_green.sql
--
-- 🚨 PART 0 TAKES THE SEAT. Every `custom.*` call after it goes through the grant, the door
-- row and the ladder exactly as a browser's does. A suite that skipped this would run as the
-- role that owns `custom.record`, where every wall opens on its first line and nothing below
-- would have been proved at all.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, is discovered by no sweep, and its
-- single transaction ends in ROLLBACK, so it leaves the database exactly as it found it.
--
-- ITS RED TWIN is `checkbox_red.sql`, which puts the PRE-checkbox bodies back inside a
-- rolled-back transaction and proves clauses 1–7 flip.
--
-- ── THE USE CASE (owner law, 2026-09-21: no fake test data) ───────────────────────────────
-- CEDAR RIDGE PHYSICAL THERAPY, an outpatient clinic, keeps a roster of the contractors who
-- service its clinic equipment — the ultrasound and e-stim units, the hydraulic treatment
-- tables, the hydrocollator. Before a contractor is let into the building the front office
-- has to know two yes/no facts about them: are they INSURED, and has somebody actually SEEN
-- the certificate of insurance. The third state is the entire reason this clinic needs the
-- type: a contractor recorded as NOT insured and a contractor NOBODY HAS ASKED YET are not
-- the same contractor, and the office manager's Monday question is "who have we not asked?".
-- The people below are synthesized; the shapes — trade, hourly rate, COI — are the real ones.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'checkbox_green.sql'
\set requires 'exec:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_tbl  uuid;
  v_f_ins uuid; v_f_coi uuid; v_f_old uuid;
  v_r_hale uuid; v_r_okafor uuid; v_r_delgado uuid;
  v_doc jsonb; v_row jsonb; v_res jsonb; v_csv text;
  v_n integer; v_caught text;
  v_true int; v_false int; v_unset int;
begin
  perform set_config('app.actor_system', 'campaign-test/checkbox_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy', 'cedar-ridge-pt-'||substr(v_org::text,1,8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
  values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/checkbox_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cedar Ridge Clinic')) returning id into v_home;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ══════════════════════════════════════════════════════════════════════════════════════
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
  raise notice 'PART 0 PASSED — the seat is `authenticated` and custom.record is not readable from it.';

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Equipment Contractor','slug','equipment_contractor','type','entity',
    'label_singular','Equipment contractor','label_plural','Equipment contractors',
    'title_field','company','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',2555,
    'fields', jsonb_build_array(jsonb_build_object('name','company')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Trade','plain','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Hourly rate','parity_type','currency','unit','$'));

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 1. THE DOOR TAKES IT, BY BOTH NAMES, AND THE STORE DERIVES WHAT IT IS.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_f_ins := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Insured','type','checkbox'));
  v_f_coi := custom.field_declare(v_org, v_tbl, jsonb_build_object('label','COI verified','parity_type','checkbox'));
  select f.data into v_doc from custom.applicable_fields(v_org, v_tbl, null) f where f.data ->> 'key' = 'insured';
  if v_doc is null then
    raise exception '1: the Insured column was declared and custom.applicable_fields does not show it';
  end if;
  -- READ THE WAY A SCREEN READS IT. `custom.parity_type` is an internal reader a client seat
  -- may not call (and its own derivation is asserted inside the migration that shipped it);
  -- what a person's field panel actually gets is the Field DOCUMENT out of
  -- `custom.applicable_fields`, so that is what is asserted here.
  if (v_doc ->> 'type') <> 'boolean' or (v_doc ->> 'parity_type') <> 'checkbox' then
    raise exception '1: Insured is stored as behaviour "%" calling itself "%", and it should be boolean / checkbox',
                    v_doc ->> 'type', coalesce(v_doc ->> 'parity_type', 'nothing');
  end if;
  -- And the guard AGREED with that declaration: custom._field_type_parity_guard refuses a
  -- Field whose declared parity and derived parity differ, so the row existing is the proof.
  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = 'checkbox' and t.behavior = 'boolean') then
    raise exception '1: custom.parity_field_types() does not ship checkbox as a boolean';
  end if;
  raise notice '1 PASSED — a tick box is declarable by a signed-in person and derives as checkbox.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 2. THE VALUE IS A REAL BOOLEAN GOING IN AND COMING BACK — the exact write crew B was
  --    refused with 23514 "checked takes one of its choices, and it was given a boolean".
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_r_hale := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'company','Hale Medical Equipment Service','trade','Ultrasound and e-stim calibration',
    'hourly_rate', 145, 'insured', true, 'coi_verified', true, 'parent_id', v_home::text));
  v_r_okafor := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'company','Okafor Hydraulics','trade','Treatment table hydraulics',
    'hourly_rate', 118, 'insured', false, 'parent_id', v_home::text));
  -- NOBODY HAS ASKED THIS ONE. The key is simply absent — not false, not null-with-a-value.
  v_r_delgado := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'company','Delgado Plumbing & Heating','trade','Hydrocollator and water lines',
    'hourly_rate', 96, 'parent_id', v_home::text));

  v_doc := custom.read_record(v_org, v_r_hale, true);
  if jsonb_typeof(v_doc -> 'insured') <> 'boolean' or (v_doc -> 'insured') <> 'true'::jsonb then
    raise exception '2: the read door hands back % for a ticked box, and it must hand back a real boolean true',
                    coalesce(jsonb_typeof(v_doc -> 'insured'), 'nothing');
  end if;
  v_doc := custom.read_record(v_org, v_r_okafor, true);
  if jsonb_typeof(v_doc -> 'insured') <> 'boolean' or (v_doc -> 'insured') <> 'false'::jsonb then
    raise exception '2: an unticked box reads back as %, and it must be a real boolean false',
                    coalesce(jsonb_typeof(v_doc -> 'insured'), 'nothing');
  end if;
  v_doc := custom.read_record(v_org, v_r_delgado, true);
  if v_doc ? 'insured' then
    raise exception '2: a contractor nobody has asked carries an answer (%), and never-asked is not false',
                    v_doc -> 'insured';
  end if;
  raise notice '2 PASSED — true, false and never-asked are three different things in the document.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 3. AND IT TAKES NOTHING ELSE. A word is refused by name, so "Yes" typed into a tick box
  --    is a sentence a person can act on rather than a silent true.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_tbl, jsonb_build_object(
      'company','Vance Electrical','insured','Yes','parent_id',v_home::text));
  exception when check_violation then v_caught := sqlerrm;
  end;
  if v_caught is null or v_caught !~ 'ticked' then
    raise exception '3: writing the WORD "Yes" into a tick box was answered with %', coalesce(v_caught,'no refusal at all');
  end if;
  raise notice '3 PASSED — a tick box refuses a word, by name: %', v_caught;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 4. THREE STATES IN THE ANSWERS — group-by separates them, and each filter finds its own.
  --    This is the office manager's Monday question.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.record_aggregate(
    v_org, v_tbl, '["insured"]'::jsonb, '[]'::jsonb, null, '{}'::jsonb, 200, 'viewer');
  if v_n <> 3 then
    raise exception '4: grouping three contractors by Insured gives % group(s), and ticked / unticked / never asked is three', v_n;
  end if;
  select coalesce(sum(a.row_count), 0)::int into v_true from custom.record_aggregate(
    v_org, v_tbl, '[]'::jsonb, '[]'::jsonb, null, '{"insured": true}'::jsonb, 200, 'viewer') a;
  select coalesce(sum(a.row_count), 0)::int into v_false from custom.record_aggregate(
    v_org, v_tbl, '[]'::jsonb, '[]'::jsonb, null, '{"insured": false}'::jsonb, 200, 'viewer') a;
  select coalesce(sum(a.row_count), 0)::int into v_unset from custom.record_aggregate(
    v_org, v_tbl, '[]'::jsonb, '[]'::jsonb, null, '{"insured": null}'::jsonb, 200, 'viewer') a;
  if v_true <> 1 or v_false <> 1 or v_unset <> 1 then
    raise exception '4: insured=true finds %, insured=false finds %, insured=null (never asked) finds % — one each is right',
                    v_true, v_false, v_unset;
  end if;
  -- (A saved view asks the same question through custom.agg_view_admits_state, which a
  -- client seat may not call directly; its three-state behaviour is asserted inside the
  -- migration that shipped it.)
  raise notice '4 PASSED — ticked (%), unticked (%) and never asked (%) are three answers, not two.', v_true, v_false, v_unset;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 5. THE EXPORT CARRIES IT — as a real boolean in the door's own answer, and as a word
  --    a spreadsheet reads back in the CSV.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_res := custom.io_export(v_org, v_tbl, array['company','insured'], 100, 'viewer');
  select r into v_row from jsonb_array_elements(v_res -> 'rows') r
   where r ->> 'company' = 'Hale Medical Equipment Service';
  if v_row is null or jsonb_typeof(v_row -> 'insured') <> 'boolean' then
    raise exception '5: the export writes Insured as %, and it must be a real boolean',
                    coalesce(jsonb_typeof(v_row -> 'insured'), 'nothing at all');
  end if;
  v_csv := custom.io_export_csv(v_org, v_tbl, array['company','insured'], 100, ',', 'viewer');
  if v_csv !~ 'Hale Medical Equipment Service,true' then
    raise exception '5: the CSV export does not carry the tick — it says %', left(v_csv, 300);
  end if;
  raise notice '5 PASSED — the export emits the tick.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 6. THE IMPORT MAPPER KNOWS ONE WHEN IT SEES ONE. The clinic's old spreadsheet writes
  --    the column three different ways, and all three land on a tick box.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  if (custom.io_infer_column(v_org, null, 'Background check cleared',
        '["Yes","No","Yes","Yes","No"]'::jsonb) ->> 'type') <> 'checkbox' then
    raise exception '6: a Yes/No column is not proposed as a tick box — it is proposed as %',
      custom.io_infer_column(v_org, null, 'Background check cleared', '["Yes","No","Yes","Yes","No"]'::jsonb) ->> 'type';
  end if;
  if (custom.io_infer_column(v_org, null, 'W-9 on file', '["1","0","1","1","0","1"]'::jsonb) ->> 'type') <> 'checkbox' then
    raise exception '6: a 1/0 column is not proposed as a tick box';
  end if;
  if (custom.io_infer_column(v_org, null, 'Badge issued', '["✓","✓","✓"]'::jsonb) ->> 'type') <> 'checkbox' then
    raise exception '6: a check-mark column is not proposed as a tick box';
  end if;
  -- (The cell reader that turns "Yes", "0" and "n/a" into a boolean or a refusal is
  -- custom.io_cell, which a client seat may not call directly; it is asserted inside the
  -- migration that shipped it.)
  raise notice '6 PASSED — yes/no, 1/0 and a check mark all read as a tick box.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 7. AND NOTHING WAS CONVERTED. The Yes/No CHOICE column crews declared as a workaround is
  --    still exactly the choice column it was — same behaviour, same parity, same choices.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_f_old := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'label','Parking pass issued','parity_type','select','options', jsonb_build_array('Yes','No')));
  select f.data into v_doc from custom.applicable_fields(v_org, v_tbl, null) f
   where f.data ->> 'key' = 'parking_pass_issued';
  if (v_doc ->> 'type') <> 'list'
     or (v_doc ->> 'parity_type') <> 'select'
     or nullif(v_doc -> 'config' ->> 'options_table_id', '') is null then
    raise exception '7: a Yes/No choice column is now a % / % (choices table %), and this ruling converts NOTHING',
                    v_doc ->> 'type', coalesce(v_doc ->> 'parity_type','nothing'),
                    coalesce(v_doc -> 'config' ->> 'options_table_id','none');
  end if;
  -- And it still stores the CHOICE'S OWN WORD, which is what makes it a different column
  -- from a tick box rather than a slower one.
  perform custom.record_write(v_org, v_tbl, jsonb_build_object(
    'company','Bexley Fire & Safety','trade','Extinguisher inspection',
    'parking_pass_issued','Yes','parent_id',v_home::text));
  raise notice '7 PASSED — an existing Yes/No choice column is untouched.';

  raise notice 'checkbox_green: ALL 7 CLAUSES PASSED from the seat `authenticated`.';
end
$t$;

rollback;
