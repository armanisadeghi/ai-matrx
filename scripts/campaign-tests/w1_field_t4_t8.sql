-- W1-FIELD — T4, T8, every field behaviour and modifier, every definition property, and the
-- validation trigger's refusals, ON THE MAIN DATABASE, FROM THE SEAT A SIGNED-IN PERSON SITS IN.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_field_t4_t8.sql
--
-- 🚨 RE-POINTED (lane SEAT-SUITES, 2026-09-19). This suite used to refuse to run anywhere but
-- the rehearsal branch. That branch holds 226 functions in schema `custom` against main's 332
-- and grants `authenticated` 29 of them against main's 103 — it does not even carry
-- `custom.field_declare`, which is the door this whole file is about. The owner's 2026-09-18
-- ruling is that there is no production: everything is the main database.
--
-- 🚨 THE SEAT. It also used to INSERT its Field rows straight into `custom.record` as the role
-- that OWNS that table. In that seat `custom.assert_client_may_reach` returns on its first
-- line, EXECUTE grants are free, SECURITY INVOKER and SECURITY DEFINER are the same thing and
-- `custom.record` is directly readable — so it proved things about the store's internals and
-- nothing about the product, and it wrote Field documents NO DOOR WOULD EVER HAVE PRODUCED.
-- It now takes the seat `authenticated` in PART 0, proves it holds it, and every Table, every
-- Field, every record and every refusal goes through the door a signed-in person reaches:
--
--   insert into custom.record (… 'field' …)  → custom.field_declare
--   insert into custom.record (… a record …) → custom.record_write
--   update custom.record (a record)          → custom.record_update
--   update custom.record (a Field)           → custom.field_update
--   select … from custom.field / "table"     → custom.applicable_fields / custom.read_record
--   custom.field_options, custom.read_records, custom.table_type_field — as they stand
--
-- THREE THINGS NO CLIENT DOOR COVERS step OUT of the seat, SAY SO, and assert no product
-- clause while out: a Table's own `display` changing (§B), the standard-table half of REC-51
-- on `crm.party` (§H), and the relation count of schema `custom` (§J).
--
-- WHAT MAKES IT FAIL. Every assertion is a POSITIVE query with a stated expected value, and
-- every refusal assertion compares the DOOR'S OR THE TRIGGER'S OWN MESSAGE — never the mere
-- presence of an error, which a typo would also produce. Every refusal is PAIRED with a
-- positive control that writes the same field successfully (rule 14), and every value
-- assertion is made with a SECOND input carrying a different expected value (rule 3), so
-- `return expected` cannot pass it. Its RED twin is `w1_field_red.sql`.
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered
-- by no sweep, and its single transaction ends in ROLLBACK.
--
-- THE IDENTITIES: `admin@admin.com` and `test@test.com`, nobody else, no credential read.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  c_admin    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana     constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j  constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j   constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org      constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_mf_kern  constant uuid := '11111111-0000-4000-8000-000000000009';  -- kernel `Merge Field`
  v_fld_kern constant uuid := '11111111-0000-4000-8000-000000000002';  -- kernel `Field`
  v_src_tbl  constant uuid := '11111111-0001-4000-8000-000000000001';  -- Merge Field Source
  v_mf_decl  constant uuid := '11111111-0001-4000-8000-000000000009';  -- Merge Field Declaration
  v_f_source constant uuid := '11111111-0003-4000-8000-000000000003';  -- the `Source` Field
  v_f_seman  constant uuid := '11111111-0003-4000-8000-000000000004';  -- the `Semantic type` Field
  v_o_record constant uuid := '11111111-0002-4000-8000-000000000002';  -- source `record`
  v_o_tool   constant uuid := '11111111-0002-4000-8000-000000000007';  -- source `tool`
  v_relcount_before integer;
  v_relcount_after  integer;
  v_color    uuid;
  v_red      uuid;
  v_blue     uuid;
  v_paint    uuid;
  v_p1       uuid;
  v_p2       uuid;
  v_shape    uuid;
  v_circle   uuid;
  v_kitchen  uuid;
  v_k1       uuid;
  v_f_width  uuid;
  v_f_note   uuid;
  v_f_score  uuid;
  v_id       uuid;
  v_mf1      uuid;
  v_mf2      uuid;
  v_party    uuid;
  v_txt      text;
  v_msg      text;
  v_seen     text;
  v_n        integer;
  v_j        jsonb;
  v_boss     text := current_user;   -- the connected role, for the three steps no door covers
begin
  if (pg_control_system()).system_identifier <> 7642734024280108049 then
    raise exception 'w1_field_t4_t8.sql runs on the MAIN database only, and this is %',
                    (pg_control_system()).system_identifier;
  end if;

  -- Schema `custom` is LIVE and other campaign suites are writing it right now, so this
  -- suite WAITS for a row rather than dying on the five-second lock_timeout the connection
  -- carries. Nothing below is a race: every clause is about what a door answers.
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '240s', true);

  -- Nothing in this file may create a Postgres relation. The whole ruling is that a Field is
  -- a ROW: if this count moves, the projection has quietly become a second relation and
  -- every other assertion here is beside the point. The catalogue has no client door, so it
  -- is read as the connected role, before the seat is taken.
  select count(*) into v_relcount_before from pg_class c
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'custom';

  -- ════════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE, as the connected role. A seat is a PERSON, and a person reaches an
  -- organization only through a membership; the store answers a person only where its own
  -- switch is on. Both are made here and both disappear with the ROLLBACK.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('app.actor_system', 'campaign-test/w1_field_t4_t8', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_t4_t8');

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

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. THE SEED IS REAL — DYN-1, FLD-5, and this lane's own production clause
  -- ══════════════════════════════════════════════════════════════════════════
  -- REC-27's kernel is nine, asserted BY NAME through the read door rather than by a count,
  -- so a missing kernel row is named instead of arithmetic.
  v_txt := (custom.read_record(v_org, v_mf_kern, true) ->> 'name');
  if v_txt <> 'Merge Field' then raise exception 'DYN-1: the ninth kernel row is named "%"', v_txt; end if;
  -- THE SECOND INPUT: a different id must answer a DIFFERENT name.
  v_txt := (custom.read_record(v_org, v_fld_kern, true) ->> 'name');
  if v_txt <> 'Field' then raise exception 'DYN-1 second input: the Field kernel row is named "%"', v_txt; end if;

  -- FLD-13: this lane's seven Fields read back off the ONE definitions door a person has.
  select count(*) into v_n from custom.applicable_fields(v_org, v_mf_decl, null) a
   where a.data ->> 'label' in ('Key','Label','Source','Semantic type','Modifiers','Override policy','Format');
  if v_n <> 7 then raise exception 'FLD-13: custom.applicable_fields returns % of this lane''s seven Fields', v_n; end if;
  select a.data ->> 'type' into v_txt from custom.applicable_fields(v_org, v_mf_decl, null) a
   where a.data ->> 'label' = 'Source';
  if v_txt <> 'list' then raise exception 'FLD-1: Source''s behaviour reads "%"', v_txt; end if;
  select a.data ->> 'type' into v_txt from custom.applicable_fields(v_org, v_mf_decl, null) a
   where a.data ->> 'label' = 'Format';
  if v_txt <> 'text' then raise exception 'FLD-1 second input: Format''s behaviour reads "%"', v_txt; end if;
  if not exists (select 1 from custom.applicable_fields(v_org, v_mf_decl, null) a
                  where a.data ->> 'label' = 'Modifiers' and (a.data ->> 'multi')::boolean) then
    raise exception 'FLD-2: Modifiers is not multi';
  end if;

  -- FLD-5: a category is a Record of a Table with display: list and only a title field.
  v_j := custom.read_record(v_org, v_src_tbl, true);
  if (v_j ->> 'display') <> 'list' or jsonb_array_length(v_j -> 'fields') <> 1
     or (v_j ->> 'title_field') <> 'name' then
    raise exception 'FLD-5: the Merge Field Source table is not a display:list table with one title field: %', v_j;
  end if;
  select count(*) into v_n from custom.field_options(v_org, v_f_source);
  if v_n <> 8 then raise exception 'FLD-5 / DYN-2: Source offers % choices, and the source list is the closed eight', v_n; end if;
  select count(*) into v_n from custom.field_options(v_org, v_f_seman);
  if v_n <> 5 then raise exception 'FLD-5 second input: Semantic type offers % choices, and there are five', v_n; end if;
  raise notice 'A GREEN — the kernel rows answer by name, this lane''s seven Fields read back off custom.applicable_fields, and a category IS a display:list Table';

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. T4 — CATEGORY GROWS UP (FLD-5, FLD-6: no select-to-relation conversion)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Red is a record of Color, display: list, title field only. Two years and many records
  -- later, Color gains hex and shade_of Fields and becomes display: page. Every record still
  -- relates to the same Red. Nothing migrates.
  v_color := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Color','slug','zz_w1f_color','label_singular','Color','label_plural','Colors',
    'type','entity','display','list','ordered',true,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','manual','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),
    'title_field','name','parent_id', v_mf_kern::text));
  v_red  := custom.record_write(v_org, v_color, '{"name":"Red"}'::jsonb);
  v_blue := custom.record_write(v_org, v_color, '{"name":"Blue"}'::jsonb);

  -- A Paint table whose `shade` field is a LIST over Color. FLD-6: it was a Table from the
  -- first write, so there is nothing to convert later.
  v_paint := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Paint','slug','zz_w1f_paint','label_singular','Paint','label_plural','Paints',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','shade')),
    'title_field','name','parent_id', v_mf_kern::text));
  perform custom.field_declare(v_org, v_paint, jsonb_build_object(
    'key','shade','label','Shade','parity_type','select','options_table_id', v_color::text,
    'required', true, 'sort', 10));

  v_p1 := custom.record_write(v_org, v_paint, jsonb_build_object('name','Barn door','shade', v_red::text));
  v_p2 := custom.record_write(v_org, v_paint, jsonb_build_object('name','Sky panel','shade', v_blue::text));

  -- TWO YEARS LATER. Color gains hex and becomes display: page.
  perform custom.field_declare(v_org, v_color, jsonb_build_object(
    'key','hex','label','Hex','plain','text','sort',20,'sensitivity','public',
    'rules', jsonb_build_array(jsonb_build_object('kind','pattern','value','^#[0-9a-f]{6}$'))));
  -- A TABLE'S OWN `display` HAS NO CLIENT DOOR — the 103 functions a person may execute hold
  -- `custom.table_declare` and `custom.promote_table`, and neither changes how an existing
  -- Table is SHOWN. This one step goes out of the seat and says so, and asserts nothing about
  -- what a person may do while it is out.
  perform set_config('role', v_boss, true);
  update custom.record set data = data || '{"display":"page"}'::jsonb
   where organization_id = v_org and id = v_color;
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_red, '{"hex":"#ff0000"}'::jsonb);

  -- NOTHING MIGRATED. Both Paints still point at the SAME Red and Blue, by id.
  v_txt := (custom.read_record(v_org, v_p1, true) ->> 'shade');
  if v_txt <> v_red::text then raise exception 'T4: the barn door now points at % and Red is %', v_txt, v_red; end if;
  v_txt := (custom.read_record(v_org, v_p2, true) ->> 'shade');
  if v_txt <> v_blue::text then raise exception 'T4 second input: the sky panel now points at %, and Blue is %', v_txt, v_blue; end if;
  v_txt := (custom.read_record(v_org, v_color, true) ->> 'display');
  if v_txt <> 'page' then raise exception 'T4: Color still shows as a %', v_txt; end if;
  v_txt := (custom.read_record(v_org, v_red, true) ->> 'hex');
  if v_txt <> '#ff0000' then raise exception 'T4: Red''s new hex reads "%"', v_txt; end if;
  select count(*) into v_n from custom.read_records(v_org, v_color, true, 200, 0);
  if v_n <> 2 then raise exception 'T4: Color holds % records after growing up', v_n; end if;
  raise notice 'T4 GREEN — Color grew a Field and became a page, both Paints still point at the same Red and Blue by id, and nothing migrated';

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. T8 — THE TYPE FIELD (FLD-10, FLD-3, REC-51)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Shape is one Table with a type field. A Circle shows Radius; a Rectangle shows Width and
  -- Height; a Square rejects Width <> Height.
  v_shape := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Shape','slug','zz_w1f_shape','label_singular','Shape','label_plural','Shapes',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'type_field','kind',
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','kind')),
    'title_field','name','parent_id', v_mf_kern::text));
  if custom.table_type_field(v_org, v_shape) <> 'kind' then
    raise exception 'FLD-10: the Shape table does not report its type field';
  end if;

  perform custom.field_declare(v_org, v_shape, jsonb_build_object(
    'key','radius','label','Radius','plain','number','unit','mm','required',true,'sort',10,
    'rules', jsonb_build_array(jsonb_build_object('kind','min','value',0)),
    'applies_to_types', '["circle"]'::jsonb));
  v_f_width := custom.field_declare(v_org, v_shape, jsonb_build_object(
    'key','width','label','Width','plain','number','unit','mm','required',true,'sort',20,
    'rules', jsonb_build_array(jsonb_build_object('kind','min','value',0)),
    'applies_to_types', '["rectangle","square"]'::jsonb));
  perform custom.field_declare(v_org, v_shape, jsonb_build_object(
    'key','height','label','Height','plain','number','unit','mm','required',true,'sort',30,
    'applies_to_types', '["rectangle","square"]'::jsonb));

  -- FLD-10: which Fields apply is a QUERY, not a convention.
  select count(*) into v_n from custom.applicable_fields(v_org, v_shape, 'circle');
  if v_n <> 1 then raise exception 'FLD-10: a circle has % applicable fields, and it shows Radius', v_n; end if;
  select count(*) into v_n from custom.applicable_fields(v_org, v_shape, 'rectangle');
  if v_n <> 2 then raise exception 'FLD-10 second input: a rectangle has % applicable fields, and it shows Width and Height', v_n; end if;

  v_circle := custom.record_write(v_org, v_shape, '{"name":"C1","kind":"circle","radius":12}'::jsonb);

  -- A Circle WITHOUT its Radius is refused BY THE FIELD'S OWN NAME. The positive control is
  -- the write immediately above, which landed.
  begin
    perform custom.record_write(v_org, v_shape, '{"name":"C2","kind":"circle"}'::jsonb);
    raise exception 'REC-51: a circle with no radius was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Radius is required' then raise exception 'REC-51 required: the refusal said "%"', v_msg; end if;
  end;

  -- A Circle whose Radius is words is refused BY NAME; the positive control wrote 12.
  begin
    perform custom.record_write(v_org, v_shape, '{"name":"C3","kind":"circle","radius":"twelve"}'::jsonb);
    raise exception 'REC-51: a radius of "twelve" was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Radius takes a number, and it was given a string' then
      raise exception 'REC-51 type: the refusal said "%"', v_msg;
    end if;
  end;

  -- T8's SQUARE: Width <> Height is refused, and it is a RULE attached to Width (FLD-3),
  -- never a behaviour of its own. Attached THROUGH THE DOOR a person edits a column with.
  perform custom.field_update(v_org, v_f_width, jsonb_build_object('rules', jsonb_build_array(
    jsonb_build_object('kind','min','value',0),
    jsonb_build_object('kind','equals_field','value','height',
                       'applies_to_types', jsonb_build_array('square')))));
  perform custom.record_write(v_org, v_shape, '{"name":"S1","kind":"square","width":10,"height":10}'::jsonb);
  begin
    perform custom.record_write(v_org, v_shape, '{"name":"S2","kind":"square","width":10,"height":11}'::jsonb);
    raise exception 'T8: a square with unequal sides was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Width and height have to be the same' then
      raise exception 'T8 square: the refusal said "%"', v_msg;
    end if;
  end;

  -- CHANGE THE CIRCLE TO A RECTANGLE: same id, Radius hidden, its old Value kept with its
  -- reason, Width and Height now required. BOTH are proven on their own so neither assertion
  -- depends on the order the validator happens to walk the definitions in.
  begin
    perform custom.record_update(v_org, v_circle, '{"kind":"rectangle","height":9}'::jsonb);
    raise exception 'T8: a rectangle with no width was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Width is required' then raise exception 'T8 retype width: the refusal said "%"', v_msg; end if;
  end;
  begin
    perform custom.record_update(v_org, v_circle, '{"kind":"rectangle","width":4}'::jsonb);
    raise exception 'T8: a rectangle with no height was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Height is required' then raise exception 'T8 retype height: the refusal said "%"', v_msg; end if;
  end;
  perform custom.record_update(v_org, v_circle, '{"kind":"rectangle","width":4,"height":9}'::jsonb);

  -- THE DOOR'S OWN ANSWER, which is what a person is shown.
  v_j := custom.read_record(v_org, v_circle, true);
  if v_j ? 'radius' then raise exception 'T8: Radius is still on the record after the retype'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_j -> '_retired','[]'::jsonb)) x
                  where x ->> 'key' = 'radius' and (x ->> 'value') = '12'
                    and x ->> 'reason' ilike '%Radius does not apply%') then
    raise exception 'T8: the old Radius was not kept with its reason — _retired holds %', v_j -> '_retired';
  end if;
  if (v_j ->> 'width') <> '4' then raise exception 'T8: the rectangle''s width reads %', v_j ->> 'width'; end if;
  select count(*) into v_n from custom.applicable_fields(v_org, v_shape, v_j ->> 'kind') a
   where (a.data ->> 'key') = 'radius';
  if v_n <> 0 then raise exception 'T8: Radius still applies to a rectangle'; end if;
  raise notice 'T8 GREEN — a circle shows Radius, a rectangle shows Width and Height, a square with unequal sides is refused by the Width field''s own attached Rule, and the retyped record kept its id with its old Radius held under _retired with the reason';

  -- ══════════════════════════════════════════════════════════════════════════
  -- D. EVERY BEHAVIOUR AND EVERY MODIFIER WRITES AND READS BACK (FLD-1, FLD-2)
  -- ══════════════════════════════════════════════════════════════════════════
  v_kitchen := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Kitchen Sink','slug','zz_w1f_kitchen','label_singular','Row','label_plural','Rows',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),
    'title_field','name','parent_id', v_mf_kern::text));

  -- text, with the definition properties FLD-12 and FLD-N-1 name
  v_f_note := custom.field_declare(v_org, v_kitchen, jsonb_build_object(
    'key','note','label','Note','plain','text','sort',10,
    'sensitivity','confidential','context_policy','exclude','review_interval_days',90));
  -- list + multi, over a Table that is still display: list (Color became a PAGE in T4 above)
  perform custom.field_declare(v_org, v_kitchen, jsonb_build_object(
    'key','tags','label','Tags','parity_type','multi_select','options_table_id', v_src_tbl::text,
    'sort',20));
  -- range with a unit
  v_f_score := custom.field_declare(v_org, v_kitchen, jsonb_build_object(
    'key','score','label','Score','plain','number','unit','points','sort',30,
    'rules', jsonb_build_array(jsonb_build_object('kind','min','value',0),
                               jsonb_build_object('kind','max','value',100))));
  -- range of kind date, with the `dated` modifier
  perform custom.field_declare(v_org, v_kitchen, jsonb_build_object(
    'key','when','label','When','parity_type','datetime','kind','date','dated',true,'sort',40,
    'source','synced','source_config','{"system":"calendar"}'::jsonb,
    'sensitivity','public','context_policy','summarize'));
  -- relation, bounded, AT ANOTHER OF THIS ORGANIZATION'S OWN TABLES. Until SEAT-SUITES landed
  -- `migrations/campaign/seat_a_column_can_point_at_your_own_table.sql` this was the one
  -- ordinary column no door could make at all.
  perform custom.field_declare(v_org, v_kitchen, jsonb_build_object(
    'key','likes','label','Likes','type','relation','relation_target', v_paint::text,
    'multi',true,'relation_max',2,'on_target_delete','set_null','inverse_key','liked_by',
    'sort',50,'source','agent','context_policy','on_request'));
  -- formula, stamped at write time, with its own dependency list
  perform custom.field_declare(v_org, v_kitchen, jsonb_build_object(
    'key','total','label','Total','parity_type','formula','compute_on','write','sort',60,
    'depends_on', jsonb_build_array(v_f_score::text),
    'expr', jsonb_build_object('op','mul', 'args', jsonb_build_array(
              jsonb_build_object('field', v_f_score::text), jsonb_build_object('const', 2)))));

  -- All five behaviours, both modifiers, and the definition properties read back — through
  -- the ONE definitions door, asserted BY NAME rather than by a count.
  select string_agg(distinct a.data ->> 'type', ',' order by a.data ->> 'type') into v_txt
    from custom.applicable_fields(v_org, v_kitchen, null) a;
  if v_txt <> 'formula,list,range,relation,text' then
    raise exception 'FLD-1: the kitchen sink declares the behaviours "%"', v_txt;
  end if;
  select string_agg(distinct a.data ->> 'type', ',' order by a.data ->> 'type') into v_txt
    from custom.applicable_fields(v_org, v_shape, null) a;
  if v_txt <> 'range' then raise exception 'FLD-1 second input: Shape declares "%"', v_txt; end if;

  select (a.data ->> 'sensitivity') || '/' || (a.data ->> 'context_policy') || '/'
         || coalesce(a.data ->> 'review_interval_days','-') || '/' || coalesce(a.data ->> 'unit','-')
    into v_txt from custom.applicable_fields(v_org, v_kitchen, null) a where a.data ->> 'key' = 'note';
  if v_txt <> 'confidential/exclude/90/-' then raise exception 'FLD-12 / FLD-N-1: Note reads "%"', v_txt; end if;
  select (a.data ->> 'sensitivity') || '/' || (a.data ->> 'context_policy') || '/'
         || coalesce(a.data ->> 'review_interval_days','-') || '/' || coalesce(a.data ->> 'unit','-')
    into v_txt from custom.applicable_fields(v_org, v_kitchen, null) a where a.data ->> 'key' = 'score';
  if v_txt <> 'internal/include/-/points' then raise exception 'FLD-12 second input: Score reads "%"', v_txt; end if;
  select (a.data ->> 'source') || '/' || coalesce(a.data ->> 'compute_on','-') into v_txt
    from custom.applicable_fields(v_org, v_kitchen, null) a where a.data ->> 'key' = 'total';
  if v_txt <> 'formula/write' then raise exception 'FLD-7 / FLD-9: Total reads "%"', v_txt; end if;
  select (a.data ->> 'source') || '/' || coalesce(a.data ->> 'compute_on','-') into v_txt
    from custom.applicable_fields(v_org, v_kitchen, null) a where a.data ->> 'key' = 'when';
  if v_txt <> 'synced/-' then raise exception 'FLD-7 second input: When reads "%"', v_txt; end if;
  select (a.data ->> 'relation_target') || '/' || (a.data ->> 'relation_max') || '/'
         || (a.data ->> 'on_target_delete') || '/' || (a.data ->> 'inverse_key')
    into v_txt from custom.applicable_fields(v_org, v_kitchen, null) a where a.data ->> 'key' = 'likes';
  if v_txt <> v_paint::text || '/2/set_null/liked_by' then raise exception 'FLD-13 relation: Likes reads "%"', v_txt; end if;
  select a.data -> 'depends_on' ->> 0 into v_txt from custom.applicable_fields(v_org, v_kitchen, null) a
   where a.data ->> 'key' = 'total';
  if v_txt is distinct from v_f_score::text then
    raise exception 'FLD-12 depends_on: Total depends on "%" and Score is %', v_txt, v_f_score;
  end if;
  if not exists (select 1 from custom.applicable_fields(v_org, v_kitchen, null) a
                  where a.data ->> 'key' = 'tags' and (a.data ->> 'multi')::boolean) then
    raise exception 'FLD-2 multi: Tags is not multi';
  end if;
  if not exists (select 1 from custom.applicable_fields(v_org, v_kitchen, null) a
                  where a.data ->> 'key' = 'when' and (a.data ->> 'dated')::boolean) then
    raise exception 'FLD-2 dated: When is not dated';
  end if;

  -- And a real row of that table round-trips every one of them, through the write door.
  v_k1 := custom.record_write(v_org, v_kitchen, jsonb_build_object(
    'name','K1','note','hello','score', 42, 'when','2026-06-01',
    'tags', jsonb_build_array(v_o_record::text, v_o_tool::text),
    'likes', jsonb_build_array(v_p1::text)));
  v_j := custom.read_record(v_org, v_k1, true);
  if (v_j ->> 'score') <> '42' then raise exception 'FLD-1 range: score read back as %', v_j ->> 'score'; end if;
  if jsonb_array_length(v_j -> 'tags') <> 2 then raise exception 'FLD-2 multi: tags read back as %', v_j -> 'tags'; end if;
  if (v_j ->> 'when') <> '2026-06-01' then raise exception 'FLD-2 dated: when read back as %', v_j ->> 'when'; end if;
  if (v_j ->> 'total') <> '84' then raise exception 'FLD-9: the write-time formula read back as %, and 42 * 2 is 84', v_j ->> 'total'; end if;
  raise notice 'D GREEN — list, range, text, relation and formula all declared through custom.field_declare; multi and dated both declared and both round-tripped; sensitivity, context_policy, review_interval_days, depends_on, unit and every relation property read back';

  -- ══════════════════════════════════════════════════════════════════════════
  -- E. THE REFUSALS REC-51 NAMES, EACH WITH ITS POSITIVE CONTROL
  -- ══════════════════════════════════════════════════════════════════════════
  -- TYPE.  positive control: note = 'hello' landed above.
  begin
    perform custom.record_write(v_org, v_kitchen, '{"name":"K2","note":7}'::jsonb);
    raise exception 'REC-51 type: a number was stored in a text field';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Note takes words, and it was given a number' then
      raise exception 'REC-51 type: the refusal said "%"', v_msg;
    end if;
  end;

  -- REQUIRED.  positive control: both Paints above carried their Shade.
  begin
    perform custom.record_write(v_org, v_paint, '{"name":"No shade"}'::jsonb);
    raise exception 'REC-51 required: a Paint with no Shade was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Shade is required' then raise exception 'REC-51 required: the refusal said "%"', v_msg; end if;
  end;

  -- OPTION MEMBERSHIP.  positive control: shade = Red landed.
  begin
    perform custom.record_write(v_org, v_paint, jsonb_build_object('name','Impossible','shade', v_p1::text));
    raise exception 'REC-51 options: a Paint took a Paint as its Shade';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Shade was given a choice that is not one of its choices' then
      raise exception 'REC-51 options: the refusal said "%"', v_msg;
    end if;
  end;

  -- RELATION RULES.  positive control: likes = [p1] landed.
  begin
    perform custom.record_write(v_org, v_kitchen, jsonb_build_object('name','K3','likes', jsonb_build_array(v_red::text)));
    raise exception 'REC-51 relation: a Likes pointed at a Color';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Likes points at something that is not there' then
      raise exception 'REC-51 relation: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, v_kitchen, jsonb_build_object('name','K4','likes',
            jsonb_build_array(v_p1::text, v_p2::text, v_p1::text)));
    raise exception 'REC-51 relation_max: a Likes pointed at three Paints';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'Likes points at 3 things%' then
      raise exception 'REC-51 relation_max: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'E GREEN — type, required, option membership and both relation rules each refused by the field''s own name through custom.record_write, each beside a positive control that wrote the same field successfully';

  -- ══════════════════════════════════════════════════════════════════════════
  -- F. THE DEFINITION GUARD, THROUGH THE ONE DOOR A PERSON ADDS A COLUMN WITH
  --    FLD-1, FLD-3, FLD-7, FLD-9, FLD-N-1, FLD-8
  -- ══════════════════════════════════════════════════════════════════════════
  -- Each bad definition is either REFUSED BY NAME or CANNOT BE EXPRESSED, and each is paired
  -- with the SAME field written successfully, differing only in the one property under test.
  -- Which of the two it is IS the finding: the door stops some of these before the guard ever
  -- sees them, and the RED twin says which is which by taking the guard away.

  -- FLD-1: two behaviours. The door refuses the word itself and NAMES THE LIST.
  v_seen := null;
  begin
    perform custom.field_declare(v_org, v_kitchen, '{"key":"note2","label":"Note two","type":["text","list"]}'::jsonb);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null or position('There is no kind of column called' in v_seen) = 0 then
    raise exception 'FLD-1: a field with two behaviours was not refused — %', coalesce(v_seen,'it landed');
  end if;
  -- the positive control: the SAME field with ONE behaviour lands.
  v_id := custom.field_declare(v_org, v_kitchen, '{"key":"note2","label":"Note two","type":"text"}'::jsonb);
  if v_id is null then raise exception 'FLD-1 control: the one-behaviour field was refused'; end if;

  -- FLD-3: a constraint smuggled into the behaviour. The GUARD refuses it, by the field's name.
  begin
    perform custom.field_declare(v_org, v_kitchen, jsonb_build_object(
      'key','score2','label','Score two','plain','number',
      'config','{"kind":"number","min":0,"max":100}'::jsonb));
    raise exception 'FLD-3: a constraint was stored as a behaviour';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the field Score two writes a constraint into its behavior, and a constraint is a Rule' then
      raise exception 'FLD-3: the refusal said "%"', v_msg;
    end if;
  end;
  -- the positive control: the SAME field with the constraint written as a Rule lands.
  v_id := custom.field_declare(v_org, v_kitchen, jsonb_build_object(
    'key','score2','label','Score two','plain','number',
    'rules', jsonb_build_array(jsonb_build_object('kind','min','value',0),
                               jsonb_build_object('kind','max','value',100))));
  if v_id is null then raise exception 'FLD-3 control: the same field with a Rule was refused'; end if;

  -- FLD-7: an invented source. The GUARD refuses it, by name, and lists the four.
  begin
    perform custom.field_declare(v_org, v_kitchen, jsonb_build_object(
      'key','note3','label','Note three','plain','text','source','typed_by_a_person'));
    raise exception 'FLD-7: a field with an invented source was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'the field Note three says its values come from typed_by_a_person%' then
      raise exception 'FLD-7: the refusal said "%"', v_msg;
    end if;
  end;
  v_id := custom.field_declare(v_org, v_kitchen, jsonb_build_object(
    'key','note3','label','Note three','plain','text','source','manual'));
  if v_id is null then raise exception 'FLD-7 control: the same field with a real source was refused'; end if;

  -- FLD-9: a formula that does not say WHEN it works out its answer. It cannot be expressed:
  -- the door answers the question for the caller rather than storing a formula nobody can
  -- evaluate, and a formula that DOES say `write` still gets `write`.
  v_id := custom.field_declare(v_org, v_kitchen, jsonb_build_object(
    'key','total2','label','Total two','parity_type','formula',
    'expr', jsonb_build_object('op','mul','args', jsonb_build_array(
              jsonb_build_object('field', v_f_score::text), jsonb_build_object('const', 3)))));
  v_j := custom.read_record(v_org, v_id, true);
  if (v_j ->> 'compute_on') <> 'read' then
    raise exception 'FLD-9: a formula that named no occasion landed as "%"', v_j ->> 'compute_on';
  end if;
  select a.data ->> 'compute_on' into v_txt from custom.applicable_fields(v_org, v_kitchen, null) a
   where a.data ->> 'key' = 'total';
  if v_txt <> 'write' then raise exception 'FLD-9 second input: a formula that asked for write reads "%"', v_txt; end if;

  -- FLD-N-1: a unit hidden in `presentation`. It cannot be expressed either — the door writes
  -- no `presentation` key at all, and the unit goes where FLD-N-1 says it goes: on the Field.
  v_id := custom.field_declare(v_org, v_kitchen, jsonb_build_object(
    'key','score3','label','Score three','plain','number','unit','points',
    'presentation','{"unit":"points","color":"blue"}'::jsonb));
  v_j := custom.read_record(v_org, v_id, true);
  if v_j ? 'presentation' then raise exception 'FLD-N-1: the door wrote a presentation block: %', v_j; end if;
  if (v_j ->> 'unit') <> 'points' then raise exception 'FLD-N-1: the unit did not reach the Field: %', v_j; end if;

  -- FLD-8: ONE definitions surface, and exactly one of the two identifiers is ever set. A
  -- person's door takes the TABLE as its second argument, so a field belonging to two tables
  -- is not a refusal — it is unsayable.
  select count(*) into v_n from custom.applicable_fields(v_org, v_kitchen, null) a
   where a.data ? 'table_token';
  if v_n <> 0 then raise exception 'FLD-8: % fields of a custom table also name a registry token', v_n; end if;
  select count(*) into v_n from custom.applicable_fields(v_org, v_kitchen, null) a
   where (a.data ->> 'entity_definition_id')::uuid <> v_kitchen;
  if v_n <> 0 then raise exception 'FLD-8 second input: % fields of the kitchen sink belong to another table', v_n; end if;
  raise notice 'F GREEN — two behaviours, a constraint written as a behaviour and an invented source are each refused by name with the corrected field landing beside them; a formula with no occasion, a unit hidden in presentation and a field belonging to two tables cannot be expressed through the door at all';

  -- ══════════════════════════════════════════════════════════════════════════
  -- G. DYN-2 — the three axes, and the definitions applied to a merge field
  -- ══════════════════════════════════════════════════════════════════════════
  v_mf1 := custom.record_write(v_org, v_mf_kern, jsonb_build_object(
    'key','zz.account.balance','label','Balance','source','record','semantic_type','value',
    'modifiers', jsonb_build_array('scoped','formatted'),'override_policy','shown_locked',
    'format','$#,##0.00'));
  v_mf2 := custom.record_write(v_org, v_mf_kern, jsonb_build_object(
    'key','zz.weather.now','label','Weather','source','tool','semantic_type','reference',
    'modifiers', jsonb_build_array('live'),'override_policy','server_fixed'));
  v_j := custom.read_record(v_org, v_mf1, true);
  v_txt := (v_j ->> 'source') || '/' || (v_j ->> 'semantic_type') || '/' || (v_j ->> 'modifiers') || '/' || (v_j ->> 'override_policy');
  if v_txt <> 'record/value/["scoped", "formatted"]/shown_locked' then
    raise exception 'DYN-2: the balance merge field reads "%"', v_txt;
  end if;
  v_j := custom.read_record(v_org, v_mf2, true);
  v_txt := (v_j ->> 'source') || '/' || (v_j ->> 'semantic_type') || '/' || (v_j ->> 'modifiers') || '/' || (v_j ->> 'override_policy');
  if v_txt <> 'tool/reference/["live"]/server_fixed' then
    raise exception 'DYN-2 second input: the weather merge field reads "%"', v_txt;
  end if;

  begin
    perform custom.record_write(v_org, v_mf_kern,
      '{"key":"zzx","type":"overrideable_state_person_reference_variable","source":"state","semantic_type":"reference","modifiers":[]}'::jsonb);
    raise exception 'DYN-2: a fused type was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'zzx tries to be one kind of thing, and a merge field is three separate answers' then
      raise exception 'DYN-2 fused: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, v_mf_kern,
      '{"key":"zzy","source":["record","tool"],"semantic_type":"value","modifiers":[]}'::jsonb);
    raise exception 'DYN-2: two sources were stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'zzy names more than one source, and a merge field has exactly one' then
      raise exception 'DYN-2 two sources: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    perform custom.record_write(v_org, v_mf_kern,
      '{"key":"zzz","source":"record","semantic_type":"value","modifiers":["urgent"]}'::jsonb);
    raise exception 'DYN-2: an invented modifier was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'zzz behaves as urgent, and that is not one of the ways a merge field can behave' then
      raise exception 'DYN-2 modifier: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'G GREEN — two merge fields declared one source, one semantic type and their modifiers through custom.record_write and read all three back through custom.read_record; a fused type, a second source and an invented modifier are each refused separately, so a caller learns which axis it got wrong';

  -- ══════════════════════════════════════════════════════════════════════════
  -- H. REC-51's SECOND HALF — the custom_fields column of a STANDARD table
  -- ══════════════════════════════════════════════════════════════════════════
  -- OUT OF THE SEAT, AND IT SAYS SO. `crm.party` is not schema `custom`, a Field OF a
  -- standard table is named by a registry token rather than by a Table id so
  -- `custom.field_declare` cannot make one (it takes the Table as its second argument, §F
  -- above), and `custom.validate_custom_fields` and `custom.custom_fields_tables` hold no
  -- client grant. So this half is asserted as the operator it is, and NO clause here is a
  -- statement about what a signed-in person may do.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.custom_fields_tables() where token = 'party';
  if v_n <> 1 then raise exception 'REC-51: crm.party is not in the custom_fields set'; end if;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'table_token','party','key','zz_loyalty_tier','label','ZZ Loyalty tier','type','list',
    'multi',false,'dated',false,'rules','[]'::jsonb,
    'config', jsonb_build_object('options_table_id', v_src_tbl::text),
    'required',false,'sort',10,'source','manual','source_config','{}'::jsonb,
    'sensitivity','internal','context_policy','include','depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));
  -- THE SWITCH IS THE SWITCH. `custom._entity_custom_fields_guard` used to read
  -- `custom/entity_custom_fields_guard`, which was false platform-wide with no rung that
  -- could turn it on, so a `custom_fields` document on a standard Entity table was never
  -- validated for anybody. As of B1's move (2026-09-19) it follows THE ORGANIZATION'S OWN
  -- STORE SWITCH, which this suite turned on in its fixture — so the proof is now the real
  -- one: with the store ON the definition is enforced, with it OFF the write answers byte
  -- for byte as it did before this lane existed, and each half is asserted against the other.
  --
  -- ON: the payload that violates the definition is REFUSED BY THE FIELD'S OWN NAME, on the
  -- INSERT and on the UPDATE, and a VALID option lands beside it (rule 14).
  begin
    insert into crm.party (party_kind, display_name, organization_id, custom_fields)
    values ('person', 'ZZ W1-FIELD refused', v_org, '{"zz_loyalty_tier":"not-an-option"}'::jsonb);
    raise exception 'REC-51 ON: an invalid custom_fields payload was stored with the store switched on';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'ZZ Loyalty tier was given a choice that is not one of its choices' then
      raise exception 'REC-51 ON insert: the refusal said "%"', v_msg;
    end if;
  end;
  insert into crm.party (party_kind, display_name, organization_id, custom_fields)
  values ('person', 'ZZ W1-FIELD disposable', v_org, jsonb_build_object('zz_loyalty_tier', v_o_record::text))
    returning id into v_party;
  select count(*) into v_n from crm.party
   where id = v_party and custom_fields ->> 'zz_loyalty_tier' = v_o_record::text;
  if v_n <> 1 then raise exception 'REC-51 ON: a VALID option was refused'; end if;
  begin
    update crm.party set custom_fields = '{"zz_loyalty_tier":"still-not-an-option"}'::jsonb where id = v_party;
    raise exception 'REC-51 ON: an invalid custom_fields payload was stored by an UPDATE';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'ZZ Loyalty tier was given a choice that is not one of its choices' then
      raise exception 'REC-51 ON update: the refusal said "%"', v_msg;
    end if;
  end;

  -- OFF: the SAME write, the same organization, the same payload — and it LANDS, because the
  -- switch is a real withholding rather than an absent mechanism.
  perform set_config('role', 'authenticated', true);
  v_j := platform.unified_data_store_set(v_org, false, c_admin, 'w1_field_t4_t8 H off');
  if coalesce((v_j ->> 'switched_on')::boolean, true) is not false then
    raise exception 'H: the store switch door said it turned the store off and it reads on: %', v_j;
  end if;
  perform set_config('role', v_boss, true);
  insert into crm.party (party_kind, display_name, organization_id, custom_fields)
  values ('person', 'ZZ W1-FIELD off', v_org, '{"zz_loyalty_tier":"not-an-option"}'::jsonb)
    returning id into v_party;
  select count(*) into v_n from crm.party
   where id = v_party and custom_fields ->> 'zz_loyalty_tier' = 'not-an-option';
  if v_n <> 1 then raise exception 'REC-51 OFF: the write did not land while the store is off'; end if;
  perform set_config('role', 'authenticated', true);
  v_j := platform.unified_data_store_set(v_org, true, c_admin, 'w1_field_t4_t8 H on again');
  if not coalesce((v_j ->> 'switched_on')::boolean, false) then
    raise exception 'H: the store switch door said it turned the store on and it reads off: %', v_j;
  end if;
  perform set_config('role', v_boss, true);

  -- and the validator itself, called directly, refuses that payload by the field's own name,
  -- with a valid option as its positive control.
  perform custom.validate_custom_fields('party', v_org, jsonb_build_object('zz_loyalty_tier', v_o_record::text));
  begin
    perform custom.validate_custom_fields('party', v_org, '{"zz_loyalty_tier":"not-an-option"}'::jsonb);
    raise exception 'REC-51: the custom_fields validator accepted a non-option';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'ZZ Loyalty tier was given a choice that is not one of its choices' then
      raise exception 'REC-51 custom_fields: the refusal said "%"', v_msg;
    end if;
  end;
  perform set_config('role', 'authenticated', true);
  raise notice 'H GREEN (operator, out of the seat) — crm.party is in the custom_fields set; with this organization''s store switched ON an invalid custom_fields payload is refused by the field''s own name on both the insert and the update and a valid option lands, and with the store switched OFF through its own door the same payload lands again';

  -- ══════════════════════════════════════════════════════════════════════════
  -- I. THE PROJECTION IS NOT A SECOND STORE — AND A PERSON CANNOT REACH IT AT ALL
  -- ══════════════════════════════════════════════════════════════════════════
  -- The old suite wrote a Field THROUGH the view `custom.field` and proved the write met the
  -- same guard. From the seat that question cannot even be asked: the view carries no grant,
  -- so there is no second way in for a person, which is a STRONGER answer than "the second
  -- way in is guarded".
  begin
    perform 1 from custom.field limit 1;
    raise exception 'I: the projection custom.field is readable from a client seat, so it IS a second surface';
  exception when insufficient_privilege then null;
  end;
  -- And the ONE way in that a person does have refuses a field for a name the table never
  -- declared and cannot: `custom.field_declare` writes the name into the Table itself, so
  -- the Table and its definitions can never disagree. The SAME key twice is refused by name.
  begin
    perform custom.field_declare(v_org, v_kitchen, jsonb_build_object('key','note','label','Note again','plain','text'));
    raise exception 'I: the same key was declared twice on one table';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'This table already has a field called%' then
      raise exception 'I: the duplicate key reached a different refusal: "%"', v_msg;
    end if;
  end;
  -- the positive control: a name it does NOT have lands, and the Table now declares it.
  perform custom.field_declare(v_org, v_kitchen, jsonb_build_object('key','note4','label','Note four','plain','text'));
  if not exists (select 1 from jsonb_array_elements(custom.read_record(v_org, v_kitchen, true) -> 'fields') f
                  where f ->> 'name' = 'note4') then
    raise exception 'I: the field landed and the Table does not declare it, so the two disagree';
  end if;
  raise notice 'I GREEN — the projection custom.field is unreachable from a client seat, and the one door a person has keeps the Table and its definitions in step: a duplicate key is refused by name and a new one is written into both';

  -- ══════════════════════════════════════════════════════════════════════════
  -- J. THE RULING, AS A COUNT (operator, out of the seat: no door reads pg_class)
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select count(*) into v_relcount_after from pg_class c
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'custom';
  if v_relcount_after <> v_relcount_before then
    raise exception 'THE RULING: schema custom held % relations before this suite and % after — a Field became a table',
                    v_relcount_before, v_relcount_after;
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'J GREEN — schema custom holds % relations, unchanged across the whole suite: every Table, Field and merge field above is a ROW', v_relcount_after;

  -- ══════════════════════════════════════════════════════════════════════════
  -- K. THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON
  -- `test@test.com` is a member of this organization and was shared nothing. Every refusal
  -- above is a STORE RULE; this one is the ACCESS question, which the old seat could not ask
  -- at all: as the owner of `custom.record`, `custom.assert_client_may_reach` returned true
  -- on its first line for every organization on the database.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- K1. She cannot add a column to a table she is not an admin of.
  v_seen := null;
  begin
    perform custom.field_declare(v_org, v_kitchen, '{"label":"Sneaked in","plain":"text"}'::jsonb);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null then
    raise exception 'K FAILED: test@test.com added a column to a table she is not an admin of';
  end if;

  -- K2. Nor change one that is already there.
  v_seen := null;
  begin
    perform custom.field_update(v_org, v_f_note, '{"label":"Renamed by Dana"}'::jsonb);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null then
    raise exception 'K FAILED: test@test.com renamed a column of a table she is not an admin of';
  end if;

  -- K3. Nor delete a record nobody gave her. (She can READ it: every record of this
  --     organization hangs off its Home, and a member of the organization reaches the Home —
  --     which is why K4's control is about the read answering CORRECTLY rather than about
  --     the read being possible at all. Deleting is a different right and she does not hold it.)
  v_seen := null;
  begin
    perform custom.record_delete(v_org, v_k1);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null then
    raise exception 'K FAILED: test@test.com deleted a record nobody shared with her';
  end if;

  -- K4. THE CONTROL, so K1–K3 are not a door that refuses her everything: the record she IS
  --     given, she reads, with the value that was written into it.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_k1, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_k1, true) ->> 'note') <> 'hello' then
    raise exception 'K FAILED: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'K GREEN — a member who was shared nothing is refused the new column, the rename and the delete, and the record shared with her at viewer reads back with the value that was written into it';

  raise notice 'W1-FIELD SUITE GREEN — every clause from the seat `authenticated` on the MAIN database, through the doors a signed-in person reaches';
end;
$t$;

rollback;
