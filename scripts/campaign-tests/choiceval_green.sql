-- CHOICE-VALUE — THE GREEN SUITE. What a choice value IS, and what every door says about it,
-- run THROUGH THE DOORS A SIGNED-IN PERSON REACHES, FROM THE SEAT A SIGNED-IN PERSON HAS.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/choiceval_green.sql
--
-- PART 0 takes the seat and proves it holds it (SEAT-SUITES). Every `custom.*` call after PART 0
-- goes through the grant, the door row and the one ladder exactly as a browser's does.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, is discovered by no sweep, and its
-- single transaction ends in ROLLBACK, so it leaves the database exactly as it found it.
--
-- ITS RED TWIN is `choiceval_red.sql`, which executes the REAL BYTES of this lane's inverses
-- inside a rolled-back transaction and proves every block below flips.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_sh_t    uuid; v_f_kind uuid; v_f_rad uuid; v_f_w uuid; v_f_h uuid; v_f_tags uuid;
  v_opts    uuid;
  v_s1      uuid; v_s2 uuid;
  v_doc     jsonb; v_res jsonb; v_map jsonb; v_exp jsonb;
  v_n       integer; v_caught text; v_txt text; v_grp jsonb;
  v_circle  uuid;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'choiceval_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign-test/choiceval_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── THE THROWAWAY ORGANIZATION ─────────────────────────────────────────────────────────
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'ZZ CHOICE-VALUE Green', 'zz-cv-g-'||substr(v_org::text,1,8), 'ZCV', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
  values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/choiceval_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','ZZ HQ')) returning id into v_home;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
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
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE TABLE, THE CHOICE COLUMN AND THE COLUMNS A KIND SELECTS. (T8's shape.)
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_sh_t := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Shape','slug','zz_cv_shape','type','entity','label_singular','Shape',
    'label_plural','Shapes','title_field','shname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','shname')),'parent_id',v_home::text,
    'type_field','kind'));
  v_f_kind := custom.field_declare(v_org, v_sh_t, jsonb_build_object(
    'label','Kind','parity_type','select','options', jsonb_build_array('Circle','Rectangle','Square')));
  v_f_rad := custom.field_declare(v_org, v_sh_t, jsonb_build_object(
    'label','Radius','plain','number','applies_to_types', jsonb_build_array('Circle')));
  v_f_w := custom.field_declare(v_org, v_sh_t, jsonb_build_object(
    'label','Width','plain','number','applies_to_types', jsonb_build_array('Rectangle','Square')));
  v_f_h := custom.field_declare(v_org, v_sh_t, jsonb_build_object(
    'label','Height','plain','number','applies_to_types', jsonb_build_array('Rectangle','Square')));
  v_f_tags := custom.field_declare(v_org, v_sh_t, jsonb_build_object(
    'label','Tags','parity_type','multi_select','options', jsonb_build_array('Red','Blue','Green')));

  -- Every option was born with a key, through the door a person reaches.
  select count(*) into v_n from custom.field_options(v_org, v_f_kind) o
   where coalesce(o.metadata ->> 'option_key','') = '';
  if v_n <> 0 then
    raise exception '1a: % of Kind''s options have no stable key', v_n;
  end if;
  select o.metadata ->> 'option_key' into v_txt from custom.field_options(v_org, v_f_kind) o
   where o.data ->> 'title' = 'Circle';
  if v_txt is distinct from 'circle' then
    raise exception '1a: "Circle" got the key % instead of circle', coalesce(v_txt,'nothing');
  end if;
  select o.id into v_circle from custom.field_options(v_org, v_f_kind) o where o.data ->> 'title' = 'Circle';
  raise notice 'PART 1 PASSED — a choice list is born with a stable key on every option ("Circle" -> circle).';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — WHAT IS STORED IS THE WORD'S KEY, NOT A UUID. Three ways in, one thing stored.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 2a. The LABEL, which is what a person types and what an agent writes.
  v_s1 := custom.record_write(v_org, v_sh_t, jsonb_build_object(
    'shname','S1','kind','Circle','radius',5,'tags', jsonb_build_array('Red','Blue'),
    'parent_id', v_home::text));
  -- 2b. The KEY, straight in.
  v_s2 := custom.record_write(v_org, v_sh_t, jsonb_build_object(
    'shname','S2','kind','rectangle','width',3,'height',4,'parent_id', v_home::text));
  -- 2c. The option record's ID, which nothing is required to know but nothing breaks on.
  perform custom.record_update(v_org, v_s1, jsonb_build_object('kind', v_circle::text));
  -- 2d. A word that names no choice is refused WITH THE CHOICES, in the words a person reads.
  begin
    perform custom.record_write(v_org, v_sh_t, jsonb_build_object('shname','S3','kind','Trapezoid','parent_id',v_home::text));
    raise exception '2d: "Trapezoid" was accepted as a choice of Kind';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%does not have a choice called "Trapezoid"%' then
      raise exception '2d: refused, but not by name: %', v_caught;
    end if;
  end;
  raise notice 'PART 2 PASSED — a choice arrives as a label, as a key or as an option id; "Trapezoid" is refused naming the three choices.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE STORED FORM, SEEN FROM OUTSIDE. Stepping out for ONE read of the raw row,
  -- because no client door shows a caller the bytes on disk — and asserting NOTHING else while
  -- out (SEAT-SUITES rule 4).
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select r.data into v_doc from custom.record r where r.organization_id = v_org and r.id = v_s1;
  perform set_config('role', 'authenticated', true);

  if (v_doc ->> 'kind') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    raise exception '3a: the stored choice is still an option record''s id: %', v_doc ->> 'kind';
  end if;
  if (v_doc ->> 'kind') is distinct from 'circle' then
    raise exception '3a: the stored choice is %, and the option''s key is circle', coalesce(v_doc ->> 'kind','nothing');
  end if;
  if (v_doc -> 'tags') is distinct from jsonb_build_array('red','blue') then
    raise exception '3b: the stored multi-choice is %, and the keys are ["red","blue"]', v_doc -> 'tags';
  end if;
  raise notice 'PART 3 PASSED — the row holds `circle` and ["red","blue"]: the option''s own words, and not one uuid.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — THE READ DOORS SAY THE WORD, AND NAME THE KEY BESIDE IT.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_doc := custom.read_record(v_org, v_s1, true);
  if (v_doc ->> 'kind') is distinct from 'Circle' then
    raise exception '4a: custom.read_record answers kind = % where a person would read Circle', coalesce(v_doc ->> 'kind','nothing');
  end if;
  if (v_doc -> '_choices' -> 'kind' ->> 'key') is distinct from 'circle' then
    raise exception '4a: the read door did not name the key behind the label: %', v_doc -> '_choices';
  end if;
  if (v_doc -> 'tags') is distinct from jsonb_build_array('Red','Blue') then
    raise exception '4b: the multi-choice read back as % and a person would read ["Red","Blue"]', v_doc -> 'tags';
  end if;
  -- 4c. The page door, in BOTH document shapes it serves. `custom.mask_document` re-keys the
  -- whole document by field id when the caller asks for it, and every list surface in the
  -- product asks for it — so the shape a person actually reads is the second one.
  select count(*) into v_n from custom.read_records(v_org, v_sh_t, false, 50, 0) rr
   where rr.document ->> 'kind' in ('Circle','Rectangle');
  if v_n <> 2 then
    raise exception '4c: the page door labelled % of the 2 rows by name', v_n;
  end if;
  select count(*) into v_n from custom.read_records(v_org, v_sh_t, true, 50, 0) rr
   where rr.document ->> (v_f_kind::text) in ('Circle','Rectangle');
  if v_n <> 2 then
    raise exception '4c: asked BY FIELD ID — the shape every list surface uses — the page door labelled % of the 2 rows', v_n;
  end if;
  select count(*) into v_n from custom.read_records(v_org, v_sh_t, true, 50, 0) rr
   where rr.document -> '_choices' -> (v_f_kind::text) ->> 'key' in ('circle','rectangle');
  if v_n <> 2 then
    raise exception '4c: the by-id page did not name the key behind the label on % of the 2 rows', 2 - v_n;
  end if;
  select count(*) into v_n from custom.query_across_homes(v_org, v_sh_t, 50, 0) q
   where q.data ->> 'kind' in ('Circle','Rectangle');
  if v_n <> 2 then
    raise exception '4d: custom.query_across_homes labelled % of the 2 rows', v_n;
  end if;
  select v.value #>> '{}' into v_txt from custom.value_read(v_org, v_s1, 'kind') v;
  if v_txt is distinct from 'Circle' then
    raise exception '4e: custom.value_read answers % for one value''s envelope', coalesce(v_txt,'nothing');
  end if;
  raise notice 'PART 4 PASSED — read_record, read_records, query_across_homes and value_read all say "Circle", and _choices names `circle` behind it.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 5 — T8's OWN CLAUSE: WHICH COLUMNS DOES *THIS RECORD* HAVE.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- The stored value is `circle`; whoever declared Radius wrote "Circle". Both name the same
  -- choice, and the seventh independent pass failed exactly here.
  select count(*) into v_n
    from custom.applicable_fields(v_org, v_sh_t, (custom.read_record(v_org, v_s1, true) -> '_choices' -> 'kind' ->> 'key')) f
   where f.data ->> 'key' = 'radius';
  if v_n <> 1 then
    raise exception '5a: asked what columns THIS Circle has, the table did not offer Radius';
  end if;
  select count(*) into v_n
    from custom.applicable_fields(v_org, v_sh_t, (custom.read_record(v_org, v_s1, true) -> '_choices' -> 'kind' ->> 'key')) f
   where f.data ->> 'key' = 'width';
  if v_n <> 0 then
    raise exception '5a: asked what columns THIS Circle has, the table offered Width';
  end if;
  -- And the label still answers, so nothing that worked before stopped working.
  select count(*) into v_n from custom.applicable_fields(v_org, v_sh_t, 'Circle') f where f.data ->> 'key' = 'radius';
  if v_n <> 1 then
    raise exception '5b: asked with the word "Circle" the table did not offer Radius';
  end if;
  -- 5c. The Square rule: Width must equal Height, and the rule was declared against the WORD.
  perform custom.field_update(v_org, v_f_w, jsonb_build_object('rules', jsonb_build_array(
    jsonb_build_object('kind','equals_field','value','height','applies_to_types', jsonb_build_array('Square')))));
  begin
    perform custom.record_write(v_org, v_sh_t, jsonb_build_object(
      'shname','SQ','kind','Square','width',3,'height',4,'parent_id',v_home::text));
    raise exception '5c: a Square with Width 3 and Height 4 was accepted';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%have to be the same%' then
      raise exception '5c: refused, but not by the Square rule: %', v_caught;
    end if;
  end;
  perform custom.record_write(v_org, v_sh_t, jsonb_build_object(
    'shname','SQ','kind','Square','width',3,'height',3,'parent_id',v_home::text));
  raise notice 'PART 5 PASSED (T8) — this Circle offers Radius and not Width; the Square rule, declared against the word, fires on the stored key.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 6 — RENAMING AN OPTION REWRITES NO ROW.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.record_update(v_org, v_circle, jsonb_build_object('title','Round'));
  perform set_config('role', v_boss, true);
  select r.data into v_doc from custom.record r where r.organization_id = v_org and r.id = v_s1;
  perform set_config('role', 'authenticated', true);
  if (v_doc ->> 'kind') is distinct from 'circle' then
    raise exception '6a: renaming the option rewrote the row: it now holds %', v_doc ->> 'kind';
  end if;
  v_doc := custom.read_record(v_org, v_s1, true);
  if (v_doc ->> 'kind') is distinct from 'Round' then
    raise exception '6b: after the rename the record reads % instead of Round', coalesce(v_doc ->> 'kind','nothing');
  end if;
  perform custom.record_update(v_org, v_circle, jsonb_build_object('title','Circle'));
  raise notice 'PART 6 PASSED — "Circle" became "Round": no row was rewritten and every reader says the new word.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 7 — RETIRING AN OPTION DOES NOT MAKE A VALUE VANISH.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.record_delete(v_org, v_circle);
  v_doc := custom.read_record(v_org, v_s1, true);
  if (v_doc ->> 'kind') is distinct from 'Circle' then
    raise exception '7a: after the choice was retired the value reads % instead of its label', coalesce(v_doc ->> 'kind','nothing');
  end if;
  if coalesce((v_doc -> '_choices' -> 'kind' ->> 'retired')::boolean, false) is not true then
    raise exception '7a: the retired choice does not say it was retired: %', v_doc -> '_choices';
  end if;
  if coalesce(v_doc -> '_choices' -> 'kind' ->> 'reason','') not like '%retired%' then
    raise exception '7a: the retired choice carries no reason: %', v_doc -> '_choices';
  end if;
  -- 7b. And it cannot be picked ANEW, by name.
  begin
    perform custom.record_write(v_org, v_sh_t, jsonb_build_object('shname','S4','kind','Circle','parent_id',v_home::text));
    raise exception '7b: a retired choice was picked for a new record';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%no longer one of the choices%' then
      raise exception '7b: refused, but not because it was retired: %', v_caught;
    end if;
  end;
  -- 7c. The record that already holds it stays editable — a different column saves fine.
  perform custom.record_update(v_org, v_s1, jsonb_build_object('radius', 9));
  raise notice 'PART 7 PASSED — a retired choice reads as its label WITH the reason, cannot be picked anew, and does not lock the record that holds it.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 8 — THE GROUP-BY, THE FILTER AND THE EXPORT.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  select r.groups into v_grp from custom.record_aggregate(
    v_org, v_sh_t, jsonb_build_array('kind'), '[]'::jsonb, null, '{}'::jsonb, 50, 'viewer') r
   where r.groups ->> 'kind' = 'Rectangle';
  if v_grp is null then
    raise exception '8a: the group-by did not name a group "Rectangle"; it answered %',
      (select coalesce(string_agg(x.groups ->> 'kind', ', '), 'nothing')
         from custom.record_aggregate(v_org, v_sh_t, jsonb_build_array('kind'), '[]'::jsonb, null, '{}'::jsonb, 50, 'viewer') x);
  end if;
  -- 8b. A filter by the LABEL finds it.
  select r.row_count into v_n from custom.record_aggregate(
    v_org, v_sh_t, '[]'::jsonb, '[]'::jsonb, null, jsonb_build_object('kind','Rectangle'), 50, 'viewer') r;
  if coalesce(v_n, 0) <> 1 then
    raise exception '8b: filtering by the word "Rectangle" found % rows', coalesce(v_n, 0);
  end if;
  -- 8c. And by the KEY.
  select r.row_count into v_n from custom.record_aggregate(
    v_org, v_sh_t, '[]'::jsonb, '[]'::jsonb, null, jsonb_build_object('kind','rectangle'), 50, 'viewer') r;
  if coalesce(v_n, 0) <> 1 then
    raise exception '8c: filtering by the key "rectangle" found % rows', coalesce(v_n, 0);
  end if;
  -- 8d. The export carries the label, and the vocabulary beside it.
  v_exp := custom.io_export(v_org, v_sh_t, null, 100, 'viewer');
  if not exists (select 1 from jsonb_array_elements(v_exp -> 'rows') x where x ->> 'kind' = 'Rectangle') then
    raise exception '8d: the export carries no row whose Kind reads "Rectangle": %',
      (select coalesce(string_agg(x ->> 'kind', ', '), 'nothing') from jsonb_array_elements(v_exp -> 'rows') x);
  end if;
  if (v_exp -> 'choices' -> 'kind' -> 'options' -> 'rectangle' ->> 'label') is distinct from 'Rectangle' then
    raise exception '8e: the export does not carry the key behind the label: %', v_exp -> 'choices';
  end if;
  raise notice 'PART 8 PASSED — the group is called "Rectangle", the filter takes the word OR the key, and the export carries the label with the vocabulary beside it.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 9 — THE CONVERSION VERB, FROM THE SEAT, AND ITS CENSUS.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_res := custom.migrate_choice_keys(v_org, v_sh_t, false);
  if (v_res ->> 'converted')::int <> 0 then
    raise exception '9a: a table written entirely through the new doors still had % values to convert', v_res ->> 'converted';
  end if;
  if (v_res -> 'after' ->> 'stored_id')::int <> 0 or (v_res -> 'after' ->> 'unresolved')::int <> 0 then
    raise exception '9a: the census after the conversion is %', v_res -> 'after';
  end if;
  if (v_res -> 'after' ->> 'stored_key')::int < 4 then
    raise exception '9b: the census counted only % cells holding a key', v_res -> 'after' ->> 'stored_key';
  end if;
  v_txt := v_res -> 'after' ->> 'stored_key';

  -- 9c. AND THE CENSUS ANSWERS THE OPERATOR TOO. A count that reads zero because the caller has
  -- no session is a lie, not a safe default — the first cut of this census had exactly that bug.
  -- Stepping out for one read and asserting nothing else while out.
  perform set_config('role', v_boss, true);
  v_res := custom.choice_census(v_org, v_sh_t);
  perform set_config('role', 'authenticated', true);
  if (v_res ->> 'cells')::int < 4 then
    raise exception '9c: asked by a caller with no session the census counts % cell(s)', v_res ->> 'cells';
  end if;
  raise notice 'PART 9 PASSED — the conversion verb runs from a seat, converts nothing on a table already written this way, its census reads % key(s), 0 id(s), 0 unresolved, and it counts % from an operator''s seat too.',
    v_txt, v_res ->> 'cells';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 10 — THE TWO DOORS, FROM THE OTHER SEAT. test@test.com is a member who was shared
  -- nothing, paired with the ONE thing she CAN do so the clause is not satisfied by a door
  -- that refuses her everything.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.share_grant(v_org, v_s2, 'person', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 10a. THE CONTROL: at viewer she reads it, and reads the WORD.
  v_doc := custom.read_record(v_org, v_s2, true);
  if (v_doc ->> 'kind') is distinct from 'Rectangle' then
    raise exception '10a: the colleague reads kind = % where a person would read Rectangle', coalesce(v_doc ->> 'kind','nothing');
  end if;
  -- 10b. A viewer may not ASK for a change, and is told the true thing.
  begin
    perform custom.work_approval_request(v_org, v_s2,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('width', 9)),
      'campaign-test/choiceval_green');
    raise exception '10b: a viewer filed a change request against a record she may only read';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%asking for a change to it is for the people who work on it%' then
      raise exception '10b: refused, but not by the rung: %', v_caught;
    end if;
  end;
  -- 10c. At COMMENTER she may ask, and the request lands with somebody who can answer it.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_s2, 'person', c_dana, 'commenter'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_res := custom.work_approval_request(v_org, v_s2,
    jsonb_build_object('kind','record_patch','patch', jsonb_build_object('width', 9)),
    'campaign-test/choiceval_green');
  if (v_res ->> 'state') <> 'pending' or (v_res ->> 'approval_id') is null then
    raise exception '10c: a commenter''s request did not file: %', v_res;
  end if;
  if jsonb_array_length(v_res -> 'approvers') = 0 then
    raise exception '10c: a request nobody could answer was filed anyway: %', v_res;
  end if;
  raise notice 'PART 10 PASSED — a viewer reads the word and is told why she cannot ask for a change; a commenter asks and the request lands with somebody who can answer it.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 11 — THE SECOND DOOR: MUTING IS STILL THE RECIPIENT'S, AND NOW ASKS THE SWITCH.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  select count(*) into v_n
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname = 'subscription_mute'
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~* '(custom\.assert_store_door|custom\.store_is_open)';
  if v_n <> 1 then
    raise exception '11a: custom.subscription_mute writes a record and never asks whether the store is open';
  end if;
  select count(*) into v_n
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname = 'work_approval_request'
     and pg_get_functiondef(p.oid) ~* '(assert_client_may_reach|has_visibility)';
  if v_n <> 1 then
    raise exception '11b: custom.work_approval_request still decides outside the one ladder';
  end if;
  raise notice 'PART 11 PASSED — both doors now name their wall and their switch in their own bodies.';

  raise notice 'ALL PARTS PASSED (0 seat, 1 keys, 2 three ways in, 3 the stored word, 4 every read door, 5 T8, 6 rename, 7 retire, 8 group/filter/export, 9 the conversion, 10 the two seats, 11 the two doors) — every one of them from the seat `authenticated`, through the doors a signed-in person reaches.';
end
$t$;

rollback;
