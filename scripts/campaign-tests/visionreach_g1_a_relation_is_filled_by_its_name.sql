-- VISION-REACH G1 — A RELATION IS FILLED FROM THE NAME OF THE RECORD IT POINTS AT, THROUGH EVERY DOOR.
--
-- THE BREAK THIS CATCHES (the sitting dry run, 2026-10-02, stop 9; measured on the clone the same
-- day): a clinic's export named every referring physician by name and every name matched a record —
-- yet the write doors every paste, agent, table-API and MCP write goes through refused a name
-- outright ("points at something that is not there"), the import cell matched only byte-exactly and
-- took a several-records cell as one name, and no door let a screen ask which record a name names.
--
-- WHAT IT ASSERTS, from the seat (`role authenticated`, admin@admin.com's claims, owner of a fresh
-- disposable organization; test@test.com as a member who was shown nothing):
--   1  custom.record_write takes "dr. marisol  gutierrez" (case and spacing differ) as that physician
--   2  two physicians named "Dr. Alan Lee" are REFUSED by name (23514), never one picked
--   3  a name matching nobody is REFUSED by name (23514)
--   4  a several-records column takes a list of names, each resolved
--   5  custom.record_update resolves a name the same way
--   6  the import doors (custom.io_import_rows -> custom.io_cell) match case-insensitively, split a
--      several-records cell, and refuse an ambiguous name for its row alone
--   7  custom.relation_names_match answers 2 / 1 / 0 matches for an ambiguous / matching / unknown name
--   8  a member who may see none of the physicians matches NOTHING through the door (no leak)
--   9  an id still passes through untouched (the control: the fix resolves names, it does not
--      reinterpret ids)
--
-- RUN IT (clone or main; one transaction ending in ROLLBACK — nothing persists):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/visionreach_g1_a_relation_is_filled_by_its_name.sql
-- RED: on the bodies before migrations/campaign/visionreach_g1_a_relation_is_filled_by_its_name.sql it
-- fails naming 1, 4, 5, 6, 7 and 8 (and 2, 3 refuse with the old, wrong sentence); GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'visionreach_g1_a_relation_is_filled_by_its_name.sql'
\set requires 'grant:authenticated:custom.record_write'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
set local lock_timeout = '90s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_phys uuid; v_pat uuid;
  v_gut uuid; v_lee1 uuid; v_lee2 uuid; v_oka uuid;
  v_rec  uuid;
  v_doc  jsonb; v_ans jsonb; v_cell jsonb;
  v_fail text[] := '{}';
  v_state text; v_msg text;
begin
  perform set_config('app.actor_system', 'campaign-test/visionreach_g1', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy', 'cedar-ridge-pt-'||substr(v_org::text,1,8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/visionreach_g1'),
    ('custom','member_default_visibility','organization',v_org,v_org,'"shared_only"'::jsonb,
     'campaign-test/visionreach_g1');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cedar Ridge Physical Therapy — Front Desk')) returning id into v_home;

  -- THE SEAT.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;

  v_phys := custom.table_declare(v_org, jsonb_build_object(
    'name','Referring physicians','slug','physicians_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Physician','label_plural','Physicians','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  v_pat := custom.table_declare(v_org, jsonb_build_object(
    'name','Patients','slug','patients_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Patient','label_plural','Patients','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object(
    'key','referring_physician','label','Referring physician','type','relation','relation_target', v_phys));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object(
    'key','care_team','label','Care team','type','relation','relation_target', v_phys, 'multi', true));

  v_gut  := custom.record_write(v_org, v_phys, jsonb_build_object('name','Dr. Marisol Gutierrez','parent_id',v_home::text));
  v_lee1 := custom.record_write(v_org, v_phys, jsonb_build_object('name','Dr. Alan Lee','parent_id',v_home::text));
  v_lee2 := custom.record_write(v_org, v_phys, jsonb_build_object('name','Dr. Alan Lee','parent_id',v_home::text));
  v_oka  := custom.record_write(v_org, v_phys, jsonb_build_object('name','Dr. Samuel Okafor','parent_id',v_home::text));

  -- 9 (control). An id passes through untouched.
  begin
    v_rec := custom.record_write(v_org, v_pat, jsonb_build_object(
      'name','Sarah Sanchez','referring_physician', v_oka::text,'parent_id',v_home::text));
    v_doc := custom.read_record(v_org, v_rec);
    if v_doc ->> 'referring_physician' is distinct from v_oka::text then
      v_fail := v_fail || ('9 an id written into the relation came back as ' || coalesce(v_doc ->> 'referring_physician','null'));
    end if;
  exception when others then
    v_fail := v_fail || ('9 CONTROL: writing an id into the relation failed: ' || sqlerrm);
  end;

  -- 1. A name, written differently, through the ordinary write door.
  begin
    v_rec := custom.record_write(v_org, v_pat, jsonb_build_object(
      'name','Jacob Torres','referring_physician','dr. marisol  gutierrez','parent_id',v_home::text));
    v_doc := custom.read_record(v_org, v_rec);
    if v_doc ->> 'referring_physician' is distinct from v_gut::text then
      v_fail := v_fail || ('1 record_write stored ' || coalesce(v_doc ->> 'referring_physician','null') || ' for "dr. marisol  gutierrez"');
    end if;
  exception when others then
    v_fail := v_fail || ('1 record_write refused a name that names exactly one physician: ' || sqlerrm);
  end;

  -- 2. Two records of that name: refused by name, never one picked.
  begin
    v_rec := custom.record_write(v_org, v_pat, jsonb_build_object(
      'name','Maria Chen','referring_physician','Dr. Alan Lee','parent_id',v_home::text));
    v_fail := v_fail || '2 record_write LINKED "Dr. Alan Lee" although two physicians carry that name'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state <> '23514' or v_msg not like '%2 records called "Dr. Alan Lee"%' then
      v_fail := v_fail || format('2 the ambiguous name was refused with the wrong sentence (%s): %s', v_state, v_msg);
    end if;
  end;

  -- 3. A name that matches nobody: refused by name.
  begin
    v_rec := custom.record_write(v_org, v_pat, jsonb_build_object(
      'name','Owen Price','referring_physician','Dr. Priya Raman','parent_id',v_home::text));
    v_fail := v_fail || '3 record_write wrote "Dr. Priya Raman" although no physician has that name'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state <> '23514' or v_msg not like '%no record called "Dr. Priya Raman"%' then
      v_fail := v_fail || format('3 the unknown name was refused with the wrong sentence (%s): %s', v_state, v_msg);
    end if;
  end;

  -- 4. A several-records column takes a list of names.
  begin
    v_rec := custom.record_write(v_org, v_pat, jsonb_build_object(
      'name','Ana Ruiz','care_team', jsonb_build_array('Dr. Samuel Okafor','DR. MARISOL GUTIERREZ'),'parent_id',v_home::text));
    v_doc := custom.read_record(v_org, v_rec);
    if v_doc -> 'care_team' is distinct from jsonb_build_array(v_oka::text, v_gut::text) then
      v_fail := v_fail || ('4 a list of names became ' || coalesce((v_doc -> 'care_team')::text,'null'));
    end if;
  exception when others then
    v_fail := v_fail || ('4 record_write refused a list of names that each name one physician: ' || sqlerrm);
  end;

  -- 5. The update door resolves a name the same way.
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('referring_physician','Dr. Samuel Okafor'));
    v_doc := custom.read_record(v_org, v_rec);
    if v_doc ->> 'referring_physician' is distinct from v_oka::text then
      v_fail := v_fail || ('5 record_update stored ' || coalesce(v_doc ->> 'referring_physician','null'));
    end if;
  exception when others then
    v_fail := v_fail || ('5 record_update refused a name that names exactly one physician: ' || sqlerrm);
  end;

  -- 6. The import doors (custom.io_import_rows -> custom.io_cell): case and spacing ignored, a
  --    several-records cell split, an ambiguous name refused by name for its row alone.
  begin
    v_ans := custom.io_import_begin(v_org, v_pat, 'csv', 'referrals.csv', '["Patient","Referring physician","Care team"]'::jsonb,
                                    md5(v_org::text), '{"on_duplicate":"skip","unmapped":"ignore"}'::jsonb);
    v_ans := custom.io_import_rows(v_org, (v_ans ->> 'import_id')::uuid, jsonb_build_array(
               jsonb_build_object('Patient','Liam Brooks','Referring physician','DR.  SAMUEL OKAFOR',
                                  'Care team','Dr. Samuel Okafor; dr. marisol gutierrez'),
               jsonb_build_object('Patient','Nora Patel','Referring physician','Dr. Alan Lee')),
             '{"Patient":"name","Referring physician":"referring_physician","Care team":"care_team"}'::jsonb);
    if (v_ans ->> 'rows_written')::int <> 1 or (v_ans ->> 'rows_refused')::int <> 1 then
      v_fail := v_fail || ('6a the import wrote ' || coalesce(v_ans ->> 'rows_written','?') || ' and refused '
                           || coalesce(v_ans ->> 'rows_refused','?') || ', not 1 and 1: ' || coalesce((v_ans -> 'outcomes')::text,'null'));
    end if;
    select o ->> 'record_id' into v_msg from jsonb_array_elements(v_ans -> 'outcomes') o where o ->> 'outcome' = 'landed';
    if v_msg is not null then
      v_doc := custom.read_record(v_org, v_msg::uuid);
      if v_doc ->> 'referring_physician' is distinct from v_oka::text
         or v_doc -> 'care_team' is distinct from jsonb_build_array(v_oka::text, v_gut::text) then
        v_fail := v_fail || ('6b the imported row holds ' || coalesce(v_doc ->> 'referring_physician','null') || ' / '
                             || coalesce((v_doc -> 'care_team')::text,'null'));
      end if;
    end if;
    select o ->> 'reason' into v_msg from jsonb_array_elements(v_ans -> 'outcomes') o where o ->> 'outcome' = 'refused';
    if coalesce(v_msg,'') not like '%2 records called "Dr. Alan Lee"%' then
      v_fail := v_fail || ('6c the ambiguous imported name was not refused by name: ' || coalesce(v_msg,'null'));
    end if;
  exception when others then
    v_fail := v_fail || ('6 the import doors failed: ' || sqlerrm);
  end;

  -- 7. The client door a screen asks before it writes.
  begin
    execute 'select custom.relation_names_match($1, $2, $3)' into v_ans
      using v_org, v_phys, array['Dr. Alan Lee','dr. samuel okafor','Dr. Priya Raman'];
    if jsonb_array_length(v_ans -> 'names' -> 0 -> 'matches') <> 2
       or jsonb_array_length(v_ans -> 'names' -> 1 -> 'matches') <> 1
       or v_ans -> 'names' -> 1 -> 'matches' -> 0 ->> 'id' is distinct from v_oka::text
       or jsonb_array_length(v_ans -> 'names' -> 2 -> 'matches') <> 0 then
      v_fail := v_fail || ('7 relation_names_match answered ' || v_ans::text);
    end if;
  exception when others then
    v_fail := v_fail || ('7 relation_names_match could not be asked: ' || sqlerrm);
  end;

  -- 8. A member who was shown none of the physicians matches nothing (no leak through the door).
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    execute 'select custom.relation_names_match($1, $2, $3)' into v_ans
      using v_org, v_phys, array['Dr. Samuel Okafor'];
    if jsonb_array_length(v_ans -> 'names' -> 0 -> 'matches') <> 0 then
      v_fail := v_fail || ('8 relation_names_match showed a member a physician she may not see: ' || v_ans::text);
    end if;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    -- Refused outright (she may not know the Table) is also no leak; a missing door is RED.
    if v_state = '42883' then
      v_fail := v_fail || ('8 relation_names_match does not exist: ' || sqlerrm);
    end if;
  end;

  if cardinality(v_fail) > 0 then
    raise exception E'RED — % relation-by-name check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — a relation is filled from a record''s name through the write doors, the import cell and the matching door; ambiguous and unknown names are refused by name; ids pass through; a member matches only what she may see.';
end
$t$;

rollback;
