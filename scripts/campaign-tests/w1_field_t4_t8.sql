-- W1-FIELD — T4, T8, every field behaviour and modifier, every definition property, and the
-- validation trigger's four refusals, against the REHEARSAL BRANCH.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_field_t4_t8.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered
-- by no sweep, and its single transaction ends in ROLLBACK, so it leaves the branch exactly
-- as it found it. It is also the one place this lane's laws are EXECUTED rather than
-- asserted in prose.
--
-- WHAT MAKES IT FAIL. Every assertion is a POSITIVE query with a stated expected value, and
-- every refusal assertion compares the TRIGGER'S OWN MESSAGE — never the mere presence of an
-- error, which a typo would also produce. Every refusal is PAIRED with a positive control
-- that writes the same field successfully (rule 14), and every value assertion is made with
-- a SECOND input carrying a different expected value (rule 3), so `return expected` cannot
-- pass it. Its RED twin is `w1_field_red.sql`, which turns each guard off inside a
-- rolled-back transaction and proves the same writes then LAND.
--
-- THE IDENTITIES. It writes as the connected owner into ONE organization, the Matrx System
-- organization, with freshly generated ids, and rolls back. It signs nobody in and reads no
-- credential.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org      constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_mf_kern  constant uuid := '11111111-0000-4000-8000-000000000009';  -- kernel `Merge Field`
  v_src_tbl  constant uuid := '11111111-0001-4000-8000-000000000001';  -- Merge Field Source
  v_sem_tbl  constant uuid := '11111111-0001-4000-8000-000000000002';
  v_mod_tbl  constant uuid := '11111111-0001-4000-8000-000000000003';
  v_mf_decl  constant uuid := '11111111-0001-4000-8000-000000000009';  -- Merge Field Declaration
  v_o_record constant uuid := '11111111-0002-4000-8000-000000000002';  -- source `record`
  v_o_tool   constant uuid := '11111111-0002-4000-8000-000000000007';  -- source `tool`
  v_o_value  constant uuid := '11111111-0002-4000-8000-000000000011';  -- semantic `value`
  v_o_scoped constant uuid := '11111111-0002-4000-8000-000000000021';
  v_o_fmtd   constant uuid := '11111111-0002-4000-8000-000000000026';
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
  v_rect     uuid;
  v_kitchen  uuid;
  v_k1       uuid;
  v_mf1      uuid;
  v_mf2      uuid;
  v_party    uuid;
  v_txt      text;
  v_msg      text;
  v_n        integer;
  v_j        jsonb;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_field_t4_t8.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- Nothing in this file may create a Postgres relation. The whole ruling is that a Field is
  -- a ROW: if this count moves, the projection has quietly become a second relation and
  -- every other assertion here is beside the point.
  select count(*) into v_relcount_before from pg_class c
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'custom';

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. THE SEED IS REAL — DYN-1, FLD-5, and this lane's own production clause
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.record where data_class = 'kernel';
  if v_n <> 9 then raise exception 'DYN-1: the kernel holds % rows, and REC-27''s kernel is nine', v_n; end if;
  select data ->> 'name' into v_txt from custom.record where id = v_mf_kern and organization_id = v_org;
  if v_txt <> 'Merge Field' then raise exception 'DYN-1: the ninth kernel row is named "%"', v_txt; end if;

  -- The SECOND input: a different id must answer a DIFFERENT name, or the read above is
  -- answering from somewhere that is not the row.
  select data ->> 'name' into v_txt from custom.record
   where id = '11111111-0000-4000-8000-000000000002' and organization_id = v_org;
  if v_txt <> 'Field' then raise exception 'DYN-1 second input: the Field kernel row is named "%"', v_txt; end if;

  select count(*) into v_n from custom.field
   where name in ('Key','Label','Source','Semantic type','Modifiers','Override policy','Format')
     and entity_definition_id = v_mf_decl;
  if v_n <> 7 then raise exception 'FLD-13: custom.field returns % of this lane''s seven Fields', v_n; end if;
  select type into v_txt from custom.field where name = 'Source' and entity_definition_id = v_mf_decl;
  if v_txt <> 'list' then raise exception 'FLD-1: Source''s behaviour reads "%"', v_txt; end if;
  select type into v_txt from custom.field where name = 'Format' and entity_definition_id = v_mf_decl;
  if v_txt <> 'text' then raise exception 'FLD-1 second input: Format''s behaviour reads "%"', v_txt; end if;
  select multi into v_j from (select to_jsonb(multi) as multi from custom.field
                               where name = 'Modifiers' and entity_definition_id = v_mf_decl) s;
  if v_j <> 'true'::jsonb then raise exception 'FLD-2: Modifiers is not multi'; end if;

  -- FLD-5: a category is a Record of a Table with display: list and only a title field.
  select count(*) into v_n from custom."table" where id = v_src_tbl and display = 'list'
     and jsonb_array_length(fields) = 1 and title_field = 'name';
  if v_n <> 1 then raise exception 'FLD-5: the Merge Field Source table is not a display:list table with one title field'; end if;
  select count(*) into v_n from custom.field_options(v_org, '11111111-0003-4000-8000-000000000003');
  if v_n <> 8 then raise exception 'FLD-5 / DYN-2: Source offers % choices, and the source list is the closed eight', v_n; end if;
  select count(*) into v_n from custom.field_options(v_org, '11111111-0003-4000-8000-000000000004');
  if v_n <> 5 then raise exception 'FLD-5 second input: Semantic type offers % choices, and there are five', v_n; end if;
  raise notice 'A GREEN - the kernel is nine, this lane''s seven Fields read back off custom.field, and a category IS a display:list Table';

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. T4 — CATEGORY GROWS UP (FLD-5, FLD-6: no select-to-relation conversion)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Red is a record of Color, display: list, title field only. Two years and many records
  -- later, Color gains hex and shade Fields and becomes display: page. Every record still
  -- relates to the same Red. Nothing migrates.
  v_color := custom.table_declare(v_org, jsonb_build_object(
    'name','Color','slug','color','label_singular','Color','label_plural','Colors',
    'type','entity','display','list','ordered',true,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','manual','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),
    'title_field','name','parent_id', v_mf_kern::text));
  insert into custom.record (organization_id, table_id, data) values (v_org, v_color, '{"name":"Red"}')
    returning id into v_red;
  insert into custom.record (organization_id, table_id, data) values (v_org, v_color, '{"name":"Blue"}')
    returning id into v_blue;

  -- A Paint table whose `shade` field is a LIST over Color. FLD-6: it was a Table from the
  -- first write, so there is nothing to convert later.
  v_paint := custom.table_declare(v_org, jsonb_build_object(
    'name','Paint','slug','paint','label_singular','Paint','label_plural','Paints',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','shade')),
    'title_field','name','parent_id', v_mf_kern::text));
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'entity_definition_id', v_paint::text, 'key','shade','label','Shade','type','list',
    'multi', false, 'dated', false, 'rules','[]'::jsonb,
    'config', jsonb_build_object('options_table_id', v_color::text),
    'required', true, 'sort', 10, 'source','manual','source_config','{}'::jsonb,
    'sensitivity','internal','context_policy','include',
    'depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));

  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_paint, jsonb_build_object('name','Barn door', 'shade', v_red::text))
    returning id into v_p1;
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_paint, jsonb_build_object('name','Sky panel', 'shade', v_blue::text))
    returning id into v_p2;

  -- TWO YEARS LATER. Color gains hex and shade and becomes display: page.
  update custom.record
     set data = data
             || '{"display":"page"}'::jsonb
             || jsonb_build_object('fields', jsonb_build_array(
                  jsonb_build_object('name','name'),
                  jsonb_build_object('name','hex'),
                  jsonb_build_object('name','shade_of')))
   where organization_id = v_org and id = v_color;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'entity_definition_id', v_color::text, 'key','hex','label','Hex','type','text',
    'multi', false, 'dated', false,
    'rules', jsonb_build_array(jsonb_build_object('kind','pattern','value','^#[0-9a-f]{6}$')),
    'config','{}'::jsonb,'required', false,'sort',20,
    'source','manual','source_config','{}'::jsonb,
    'sensitivity','public','context_policy','include',
    'depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));
  update custom.record set data = data || '{"hex":"#ff0000"}'::jsonb
   where organization_id = v_org and id = v_red;

  -- NOTHING MIGRATED. Both Paints still point at the SAME Red and Blue, by id.
  select data ->> 'shade' into v_txt from custom.record where organization_id = v_org and id = v_p1;
  if v_txt <> v_red::text then raise exception 'T4: the barn door now points at % and Red is %', v_txt, v_red; end if;
  select data ->> 'shade' into v_txt from custom.record where organization_id = v_org and id = v_p2;
  if v_txt <> v_blue::text then raise exception 'T4 second input: the sky panel now points at %, and Blue is %', v_txt, v_blue; end if;
  select display into v_txt from custom."table" where id = v_color;
  if v_txt <> 'page' then raise exception 'T4: Color still shows as a %', v_txt; end if;
  select data ->> 'hex' into v_txt from custom.record where organization_id = v_org and id = v_red;
  if v_txt <> '#ff0000' then raise exception 'T4: Red''s new hex reads "%"', v_txt; end if;
  select count(*) into v_n from custom.record where organization_id = v_org and table_id = v_color and deleted_at is null;
  if v_n <> 2 then raise exception 'T4: Color holds % records after growing up', v_n; end if;
  raise notice 'T4 GREEN - Color grew two Fields and became a page, both Paints still point at the same Red and Blue by id, and nothing migrated';

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. T8 — THE TYPE FIELD (FLD-10, FLD-3, REC-51)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Shape is one Table with a type field. A Circle shows Radius; a Rectangle shows Width and
  -- Height; a Square rejects Width <> Height.
  v_shape := custom.table_declare(v_org, jsonb_build_object(
    'name','Shape','slug','shape','label_singular','Shape','label_plural','Shapes',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'type_field','kind',
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','kind'),
                                jsonb_build_object('name','radius'), jsonb_build_object('name','width'),
                                jsonb_build_object('name','height')),
    'title_field','name','parent_id', v_mf_kern::text));

  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_shape::text,'key','radius','label','Radius','type','range',
      'multi',false,'dated',false,'rules', jsonb_build_array(jsonb_build_object('kind','min','value',0)),
      'config', '{"kind":"number"}'::jsonb,'required',true,'sort',10,'unit','mm',
      'source','manual','source_config','{}'::jsonb,'sensitivity','internal','context_policy','include',
      'depends_on','[]'::jsonb,'applies_to_types', '["circle"]'::jsonb)),
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_shape::text,'key','width','label','Width','type','range',
      'multi',false,'dated',false,
      'rules', jsonb_build_array(jsonb_build_object('kind','min','value',0)),
      'config','{"kind":"number"}'::jsonb,'required',true,'sort',20,'unit','mm',
      'source','manual','source_config','{}'::jsonb,'sensitivity','internal','context_policy','include',
      'depends_on','[]'::jsonb,'applies_to_types', '["rectangle","square"]'::jsonb)),
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_shape::text,'key','height','label','Height','type','range',
      'multi',false,'dated',false,'rules','[]'::jsonb,
      'config','{"kind":"number"}'::jsonb,'required',true,'sort',30,'unit','mm',
      'source','manual','source_config','{}'::jsonb,'sensitivity','internal','context_policy','include',
      'depends_on','[]'::jsonb,'applies_to_types', '["rectangle","square"]'::jsonb));

  -- FLD-10: which Fields apply is a QUERY, not a convention.
  select count(*) into v_n from custom.applicable_fields(v_org, v_shape, 'circle');
  if v_n <> 1 then raise exception 'FLD-10: a circle has % applicable fields, and it shows Radius', v_n; end if;
  select count(*) into v_n from custom.applicable_fields(v_org, v_shape, 'rectangle');
  if v_n <> 2 then raise exception 'FLD-10 second input: a rectangle has % applicable fields, and it shows Width and Height', v_n; end if;

  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_shape, '{"name":"C1","kind":"circle","radius":12}') returning id into v_circle;

  -- A Circle WITHOUT its Radius is refused BY THE FIELD''S OWN NAME. The positive control is
  -- the write immediately above, which landed.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_shape, '{"name":"C2","kind":"circle"}');
    raise exception 'REC-51: a circle with no radius was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Radius is required' then raise exception 'REC-51 required: the refusal said "%"', v_msg; end if;
  end;

  -- A Circle whose Radius is words is refused BY NAME; the positive control wrote 12.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_shape, '{"name":"C3","kind":"circle","radius":"twelve"}');
    raise exception 'REC-51: a radius of "twelve" was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Radius takes a number, and it was given a string' then
      raise exception 'REC-51 type: the refusal said "%"', v_msg;
    end if;
  end;

  -- T8's SQUARE: Width <> Height is refused, and it is a RULE attached to Width (FLD-3),
  -- never a behaviour of its own. The positive control is a square that agrees.
  update custom.record
     set data = jsonb_set(data, '{rules}', jsonb_build_array(
                  jsonb_build_object('kind','min','value',0),
                  jsonb_build_object('kind','equals_field','value','height',
                                     'applies_to_types', jsonb_build_array('square'))))
   where organization_id = v_org and table_id = custom.field_kernel_id()
     and data ->> 'key' = 'width' and (data ->> 'entity_definition_id')::uuid = v_shape;
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_shape, '{"name":"S1","kind":"square","width":10,"height":10}');
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_shape, '{"name":"S2","kind":"square","width":10,"height":11}');
    raise exception 'T8: a square with unequal sides was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Width and height have to be the same' then
      raise exception 'T8 square: the refusal said "%"', v_msg;
    end if;
  end;

  -- CHANGE THE CIRCLE TO A RECTANGLE: same id, Radius hidden, its old Value kept with its
  -- reason, Width and Height now required.
  -- BOTH are now required, and each is proven on its own so neither assertion depends on the
  -- order the validator happens to walk the definitions in: supply height alone and Width is
  -- named; supply width alone and Height is named.
  begin
    update custom.record set data = data || '{"kind":"rectangle","height":9}'::jsonb
     where organization_id = v_org and id = v_circle;
    raise exception 'T8: a rectangle with no width was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Width is required' then raise exception 'T8 retype width: the refusal said "%"', v_msg; end if;
  end;
  begin
    update custom.record set data = data || '{"kind":"rectangle","width":4}'::jsonb
     where organization_id = v_org and id = v_circle;
    raise exception 'T8: a rectangle with no height was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Height is required' then raise exception 'T8 retype height: the refusal said "%"', v_msg; end if;
  end;
  update custom.record set data = data || '{"kind":"rectangle","width":4,"height":9}'::jsonb
   where organization_id = v_org and id = v_circle;

  select data into v_j from custom.record where organization_id = v_org and id = v_circle;
  if v_j ? 'radius' then raise exception 'T8: Radius is still on the record after the retype'; end if;
  if coalesce(v_j -> '_retired' -> 0 ->> 'value', '') <> '12' then
    raise exception 'T8: the old Radius was not kept - _retired holds %', v_j -> '_retired';
  end if;
  if (v_j -> '_retired' -> 0 ->> 'reason') not like '%Radius does not apply%' then
    raise exception 'T8: the retired Value carries no reason - %', v_j -> '_retired' -> 0;
  end if;
  if (v_j ->> 'width') <> '4' then raise exception 'T8: the rectangle''s width reads %', v_j ->> 'width'; end if;
  select count(*) into v_n from custom.applicable_fields(v_org, v_shape, v_j ->> 'kind')
   where (data ->> 'key') = 'radius';
  if v_n <> 0 then raise exception 'T8: Radius still applies to a rectangle'; end if;
  raise notice 'T8 GREEN - a circle shows Radius, a rectangle shows Width and Height, a square with unequal sides is refused by the Width field''s own attached Rule, and the retyped record kept its id with its old Radius held under _retired with the reason';

  -- ══════════════════════════════════════════════════════════════════════════
  -- D. EVERY BEHAVIOUR AND EVERY MODIFIER WRITES AND READS BACK (FLD-1, FLD-2)
  -- ══════════════════════════════════════════════════════════════════════════
  v_kitchen := custom.table_declare(v_org, jsonb_build_object(
    'name','Kitchen Sink','slug','kitchen_sink','label_singular','Row','label_plural','Rows',
    'type','entity','display','page','ordered',false,'weight','light','retention_days',365,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','note'),
                                jsonb_build_object('name','tags'), jsonb_build_object('name','score'),
                                jsonb_build_object('name','when'), jsonb_build_object('name','likes'),
                                jsonb_build_object('name','total')),
    'title_field','name','parent_id', v_mf_kern::text));

  insert into custom.record (organization_id, table_id, data_class, data) values
    -- text
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','note','label','Note','type','text',
      'multi',false,'dated',false,'rules','[]'::jsonb,'config','{"format":"plain"}'::jsonb,
      'required',false,'sort',10,'format','plain',
      'source','manual','source_config','{}'::jsonb,'sensitivity','confidential',
      'context_policy','exclude','review_interval_days',90,'depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb)),
    -- list + multi. Its options Table is Merge Field Source, which is still display: list -
    -- Color became a PAGE in T4 above, and FLD-5 refuses DECLARING a new list field over a
    -- page Table (proven in F below), which is exactly the law working.
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','tags','label','Tags','type','list',
      'multi',true,'dated',false,'rules','[]'::jsonb,
      'config', jsonb_build_object('options_table_id', v_src_tbl::text),
      'required',false,'sort',20,
      'source','manual','source_config','{}'::jsonb,'sensitivity','internal','context_policy','include',
      'depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb)),
    -- range with a unit
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','score','label','Score','type','range',
      'multi',false,'dated',false,
      'rules', jsonb_build_array(jsonb_build_object('kind','min','value',0), jsonb_build_object('kind','max','value',100)),
      'config','{"kind":"number"}'::jsonb,'required',false,'sort',30,'unit','points',
      'source','manual','source_config','{}'::jsonb,'sensitivity','internal','context_policy','include',
      'depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb)),
    -- range of kind date, with the `dated` modifier
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','when','label','When','type','range',
      'multi',false,'dated',true,'rules','[]'::jsonb,'config','{"kind":"date"}'::jsonb,
      'required',false,'sort',40,'format','YYYY-MM-DD',
      'source','synced','source_config','{"system":"calendar"}'::jsonb,
      'sensitivity','public','context_policy','summarize','depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb)),
    -- relation, bounded
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','likes','label','Likes','type','relation',
      'multi',true,'dated',false,'rules','[]'::jsonb,'config','{}'::jsonb,
      'required',false,'sort',50,
      'relation_target', v_paint::text,'relation_max',2,'on_target_delete','set_null','inverse_key','liked_by',
      'source','agent','source_config','{}'::jsonb,'sensitivity','internal','context_policy','on_request',
      'depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb)),
    -- formula
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','total','label','Total','type','formula',
      'multi',false,'dated',false,'rules','[]'::jsonb,
      'config', '{"expression":"score * 2"}'::jsonb,'required',false,'sort',60,
      'source','formula','source_config','{}'::jsonb,'compute_on','write','unit','points',
      'sensitivity','internal','context_policy','include',
      'depends_on', jsonb_build_array('score'),'applies_to_types','[]'::jsonb));

  -- All five behaviours, both modifiers, and the definition properties read back.
  -- FLD-1's closed set, asserted BY NAME rather than by a count, so a missing behaviour is
  -- named instead of arithmetic.
  select string_agg(distinct type, ',' order by type) into v_txt
    from custom.field where entity_definition_id = v_kitchen;
  if v_txt <> 'formula,list,range,relation,text' then
    raise exception 'FLD-1: the kitchen sink declares the behaviours "%"', v_txt;
  end if;
  select string_agg(distinct type, ',' order by type) into v_txt
    from custom.field where entity_definition_id = v_shape;
  if v_txt <> 'range' then raise exception 'FLD-1 second input: Shape declares "%"', v_txt; end if;
  select sensitivity || '/' || context_policy || '/' || coalesce(review_interval_days::text,'-') || '/' || coalesce(unit,'-')
    into v_txt from custom.field where entity_definition_id = v_kitchen and key = 'note';
  if v_txt <> 'confidential/exclude/90/-' then raise exception 'FLD-12 / FLD-N-1: Note reads "%"', v_txt; end if;
  select sensitivity || '/' || context_policy || '/' || coalesce(review_interval_days::text,'-') || '/' || coalesce(unit,'-')
    into v_txt from custom.field where entity_definition_id = v_kitchen and key = 'score';
  if v_txt <> 'internal/include/-/points' then raise exception 'FLD-12 second input: Score reads "%"', v_txt; end if;
  select source || '/' || coalesce(compute_on,'-') into v_txt from custom.field
   where entity_definition_id = v_kitchen and key = 'total';
  if v_txt <> 'formula/write' then raise exception 'FLD-7 / FLD-9: Total reads "%"', v_txt; end if;
  select source || '/' || coalesce(compute_on,'-') into v_txt from custom.field
   where entity_definition_id = v_kitchen and key = 'when';
  if v_txt <> 'synced/-' then raise exception 'FLD-7 second input: When reads "%"', v_txt; end if;
  select relation_target::text || '/' || relation_max::text || '/' || on_target_delete || '/' || inverse_key
    into v_txt from custom.field where entity_definition_id = v_kitchen and key = 'likes';
  if v_txt <> v_paint::text || '/2/set_null/liked_by' then raise exception 'FLD-13 relation: Likes reads "%"', v_txt; end if;
  select depends_on::text into v_txt from custom.field where entity_definition_id = v_kitchen and key = 'total';
  if v_txt <> '["score"]' then raise exception 'FLD-12 depends_on: Total reads "%"', v_txt; end if;

  -- And a real row of that table round-trips every one of them.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_kitchen, jsonb_build_object(
    'name','K1','note','hello','score', 42, 'when','2026-06-01',
    'tags', jsonb_build_array(v_o_record::text, v_o_tool::text),
    'likes', jsonb_build_array(v_p1::text)))
    returning id into v_k1;
  select data into v_j from custom.record where organization_id = v_org and id = v_k1;
  if (v_j ->> 'score') <> '42' then raise exception 'FLD-1 range: score read back as %', v_j ->> 'score'; end if;
  if jsonb_array_length(v_j -> 'tags') <> 2 then raise exception 'FLD-2 multi: tags read back as %', v_j -> 'tags'; end if;
  if (v_j ->> 'when') <> '2026-06-01' then raise exception 'FLD-2 dated: when read back as %', v_j ->> 'when'; end if;
  raise notice 'D GREEN - list, range, text, relation and formula all declared; multi and dated both declared and both round-tripped; sensitivity, context_policy, review_interval_days, depends_on, unit, format and every relation property read back';

  -- ══════════════════════════════════════════════════════════════════════════
  -- E. THE FOUR REFUSALS REC-51 NAMES, EACH WITH ITS POSITIVE CONTROL
  -- ══════════════════════════════════════════════════════════════════════════
  -- TYPE.  positive control: note = 'hello' landed above.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_kitchen, '{"name":"K2","note":7}');
    raise exception 'REC-51 type: a number was stored in a text field';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Note takes words, and it was given a number' then
      raise exception 'REC-51 type: the refusal said "%"', v_msg;
    end if;
  end;

  -- REQUIRED.  positive control: the Shape writes above, which all carried their required fields.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_paint, '{"name":"No shade"}');
    raise exception 'REC-51 required: a Paint with no Shade was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Shade is required' then raise exception 'REC-51 required: the refusal said "%"', v_msg; end if;
  end;

  -- OPTION MEMBERSHIP.  positive control: shade = Red landed.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_paint, jsonb_build_object('name','Impossible','shade', v_p1::text));
    raise exception 'REC-51 options: a Paint took a Paint as its Shade';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Shade was given a choice that is not one of its choices' then
      raise exception 'REC-51 options: the refusal said "%"', v_msg;
    end if;
  end;

  -- RELATION RULES.  positive control: likes = [p1] landed.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_kitchen, jsonb_build_object('name','K3','likes', jsonb_build_array(v_red::text)));
    raise exception 'REC-51 relation: a Likes pointed at a Color';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Likes points at something that is not there' then
      raise exception 'REC-51 relation: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_kitchen, jsonb_build_object('name','K4','likes',
            jsonb_build_array(v_p1::text, v_p2::text, v_p1::text)));
    raise exception 'REC-51 relation_max: a Likes pointed at three Paints';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Likes points at 3 things, and it can point at 2 at most' then
      raise exception 'REC-51 relation_max: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'E GREEN - type, required, option membership and both relation rules each refused by the field''s own name, each beside a positive control that wrote the same field successfully';

  -- ══════════════════════════════════════════════════════════════════════════
  -- F. THE DEFINITION GUARD — FLD-1, FLD-3, FLD-7, FLD-9, FLD-N-1, FLD-8
  -- ══════════════════════════════════════════════════════════════════════════
  -- Each refusal is paired with the SAME field written successfully, differing only in the
  -- one property under test.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','note','label','Note','type', jsonb_build_array('text','list'),
      'multi',false,'dated',false,'rules','[]'::jsonb,'config','{}'::jsonb,'required',false,'sort',1,
      'source','manual','source_config','{}'::jsonb,'sensitivity','internal','context_policy','include',
      'depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));
    raise exception 'FLD-1: a field with two behaviours was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the field Note has more than one behavior, and a field has exactly one' then
      raise exception 'FLD-1: the refusal said "%"', v_msg;
    end if;
  end;

  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','score','label','Score','type','range',
      'multi',false,'dated',false,'rules','[]'::jsonb,'config','{"kind":"number","min":0,"max":100}'::jsonb,
      'required',false,'sort',1,'source','manual','source_config','{}'::jsonb,
      'sensitivity','internal','context_policy','include','depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));
    raise exception 'FLD-3: a constraint was stored as a behaviour';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the field Score writes a constraint into its behavior, and a constraint is a Rule' then
      raise exception 'FLD-3: the refusal said "%"', v_msg;
    end if;
  end;

  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','note','label','Note','type','text',
      'multi',false,'dated',false,'rules','[]'::jsonb,'config','{}'::jsonb,'required',false,'sort',1,
      'source','typed_by_a_person','source_config','{}'::jsonb,
      'sensitivity','internal','context_policy','include','depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));
    raise exception 'FLD-7: a field with an invented source was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'the field Note says its values come from typed_by_a_person%' then
      raise exception 'FLD-7: the refusal said "%"', v_msg;
    end if;
  end;

  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','total','label','Total','type','formula',
      'multi',false,'dated',false,'rules','[]'::jsonb,'config','{}'::jsonb,'required',false,'sort',1,
      'source','formula','source_config','{}'::jsonb,
      'sensitivity','internal','context_policy','include','depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));
    raise exception 'FLD-9: a formula with no compute_on was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the formula Total has to say whether it works out its answer when somebody reads it or when somebody saves' then
      raise exception 'FLD-9: the refusal said "%"', v_msg;
    end if;
  end;

  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_kitchen::text,'key','score','label','Score','type','range',
      'multi',false,'dated',false,'rules','[]'::jsonb,'config','{"kind":"number"}'::jsonb,
      'required',false,'sort',1,'presentation','{"unit":"points","color":"blue"}'::jsonb,
      'source','manual','source_config','{}'::jsonb,
      'sensitivity','internal','context_policy','include','depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));
    raise exception 'FLD-N-1: a unit was stored in presentation';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'the field Score puts its unit or its format in presentation%' then
      raise exception 'FLD-N-1: the refusal said "%"', v_msg;
    end if;
  end;

  -- FLD-8: ONE definitions surface. A standard table's fields live in the SAME table, named
  -- by their registry token — and exactly one of the two identifiers is ever set.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'table_token','party','key','loyalty_tier','label','Loyalty tier','type','list',
    'multi',false,'dated',false,'rules','[]'::jsonb,
    'config', jsonb_build_object('options_table_id', v_src_tbl::text),
    'required',false,'sort',10,'source','manual','source_config','{}'::jsonb,
    'sensitivity','internal','context_policy','include','depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));
  select count(*) into v_n from custom.field where table_token = 'party' and entity_definition_id is null;
  if v_n <> 1 then raise exception 'FLD-8: % definitions on the standard table party', v_n; end if;
  select count(*) into v_n from custom.field where entity_definition_id = v_kitchen and table_token is null;
  if v_n <> 6 then raise exception 'FLD-8 second input: % definitions on the custom table', v_n; end if;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'table_token','party','entity_definition_id', v_kitchen::text,
      'key','both','label','Both','type','text',
      'multi',false,'dated',false,'rules','[]'::jsonb,'config','{}'::jsonb,'required',false,'sort',1,
      'source','manual','source_config','{}'::jsonb,
      'sensitivity','internal','context_policy','include','depends_on','[]'::jsonb,'applies_to_types','[]'::jsonb));
    raise exception 'FLD-8: a field belonging to two tables was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'the field Both has to say what it is a field OF%' then
      raise exception 'FLD-8: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'F GREEN - two behaviours, a constraint written as a behaviour, an invented source, a formula with no compute_on, a unit hidden in presentation and a field belonging to two tables are each refused by name, and the SAME field writes successfully when only that one property is corrected';

  -- ══════════════════════════════════════════════════════════════════════════
  -- G. DYN-2 — the three axes, and the definitions applied to a merge field
  -- ══════════════════════════════════════════════════════════════════════════
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_mf_kern, jsonb_build_object(
    'key','account.balance','label','Balance','source','record','semantic_type','value',
    'modifiers', jsonb_build_array('scoped','formatted'),'override_policy','shown_locked',
    'format','$#,##0.00'))
    returning id into v_mf1;
  insert into custom.record (organization_id, table_id, data)
  values (v_org, v_mf_kern, jsonb_build_object(
    'key','weather.now','label','Weather','source','tool','semantic_type','reference',
    'modifiers', jsonb_build_array('live'),'override_policy','server_fixed'))
    returning id into v_mf2;
  select source || '/' || semantic_type || '/' || modifiers::text || '/' || override_policy
    into v_txt from custom.merge_field where id = v_mf1;
  if v_txt <> 'record/value/["scoped", "formatted"]/shown_locked' then
    raise exception 'DYN-2: the balance merge field reads "%"', v_txt;
  end if;
  select source || '/' || semantic_type || '/' || modifiers::text || '/' || override_policy
    into v_txt from custom.merge_field where id = v_mf2;
  if v_txt <> 'tool/reference/["live"]/server_fixed' then
    raise exception 'DYN-2 second input: the weather merge field reads "%"', v_txt;
  end if;

  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_mf_kern, '{"key":"x","type":"overrideable_state_person_reference_variable","source":"state","semantic_type":"reference","modifiers":[]}');
    raise exception 'DYN-2: a fused type was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'x tries to be one kind of thing, and a merge field is three separate answers' then
      raise exception 'DYN-2 fused: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_mf_kern, '{"key":"y","source":["record","tool"],"semantic_type":"value","modifiers":[]}');
    raise exception 'DYN-2: two sources were stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'y names more than one source, and a merge field has exactly one' then
      raise exception 'DYN-2 two sources: the refusal said "%"', v_msg;
    end if;
  end;
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org, v_mf_kern, '{"key":"z","source":"record","semantic_type":"value","modifiers":["urgent"]}');
    raise exception 'DYN-2: an invented modifier was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'z behaves as urgent, and that is not one of the ways a merge field can behave' then
      raise exception 'DYN-2 modifier: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'G GREEN - two merge fields declared one source, one semantic type and their modifiers and read all three back; a fused type, a second source and an invented modifier are each refused separately, so a caller learns which axis it got wrong';

  -- ══════════════════════════════════════════════════════════════════════════
  -- H. REC-51's SECOND HALF — the custom_fields column of a standard table
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.custom_fields_tables() where token = 'party';
  if v_n <> 1 then raise exception 'REC-51: crm.party is not in the custom_fields set'; end if;

  -- THE OFF PROOF, and the branch's own limit stated rather than papered over: production
  -- holds 1,859 `crm.party` rows and the BRANCH holds ZERO — `W0-DATA`'s copy set does not
  -- include `crm.party` — so this proof writes its OWN disposable party, inside the same
  -- rolled-back transaction, and never reads a copied person. What it proves is the same
  -- thing: while the knob is OFF the validator is not reached, so a payload that violates
  -- the definition lands exactly as it did before this lane existed, on both an INSERT and
  -- an UPDATE of the guarded column.
  -- crm.party carries the platform's own provenance guard (`_stamp_actor_tier`), which
  -- refuses an automated write that names no system. That law is not this lane's and is not
  -- routed around: the write names itself.
  perform set_config('app.actor_system', 'W1-FIELD campaign test', true);
  insert into crm.party (party_kind, display_name, organization_id, custom_fields)
  values ('person', 'W1-FIELD disposable', v_org, '{"loyalty_tier":"not-an-option"}'::jsonb)
    returning id into v_party;
  select count(*) into v_n from crm.party
   where id = v_party and custom_fields ->> 'loyalty_tier' = 'not-an-option';
  if v_n <> 1 then raise exception 'REC-51 OFF: the INSERT did not land while the guard is off'; end if;
  update crm.party set custom_fields = '{"loyalty_tier":"still-not-an-option"}'::jsonb
   where id = v_party;
  select count(*) into v_n from crm.party
   where id = v_party and custom_fields ->> 'loyalty_tier' = 'still-not-an-option';
  if v_n <> 1 then raise exception 'REC-51 OFF: the UPDATE did not land while the guard is off'; end if;

  -- The validator itself, called directly, refuses that payload by the field's own name -
  -- so what the knob withholds is real, and the positive control is a valid option.
  perform custom.validate_custom_fields('party', v_org, jsonb_build_object('loyalty_tier', v_o_record::text));
  begin
    perform custom.validate_custom_fields('party', v_org, '{"loyalty_tier":"not-an-option"}'::jsonb);
    raise exception 'REC-51: the custom_fields validator accepted a non-option';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Loyalty tier was given a choice that is not one of its choices' then
      raise exception 'REC-51 custom_fields: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'H GREEN - crm.party is in the custom_fields set, the guard is OFF so its writes answer exactly as before, and the validator behind it refuses a non-option by the field''s own name with a valid option as its positive control';

  -- ══════════════════════════════════════════════════════════════════════════
  -- I. THE PROJECTION IS NOT A SECOND STORE
  -- ══════════════════════════════════════════════════════════════════════════
  -- A definition written THROUGH custom.field lands in custom.record and meets the SAME
  -- guard, which is what makes the view a surface rather than a second source of truth.
  begin
    insert into custom.field (organization_id, entity_definition_id, key, label, type, multi, dated,
                              rules, config, required, sort, source, source_config,
                              sensitivity, context_policy, depends_on, applies_to_types)
    values (v_org, v_kitchen, 'note2', 'Note two', 'text', false, false,
            '[]'::jsonb, '{}'::jsonb, false, 70, 'manual', '{}'::jsonb,
            'internal', 'include', '[]'::jsonb, '[]'::jsonb);
    raise exception 'FLD-8: a definition for a field the table never declared was stored through the view';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'the table does not declare a field called note2 - declare it there first' then
      raise exception 'the view write reached a different refusal: "%"', v_msg;
    end if;
  end;
  -- The positive control: the SAME write, through the SAME view, once the Table declares it.
  update custom.record
     set data = jsonb_set(data, '{fields}', (data -> 'fields') || jsonb_build_array(jsonb_build_object('name','note2')))
   where organization_id = v_org and id = v_kitchen;
  insert into custom.field (organization_id, entity_definition_id, key, label, type, multi, dated,
                            rules, config, required, sort, source, source_config,
                            sensitivity, context_policy, depends_on, applies_to_types)
  values (v_org, v_kitchen, 'note2', 'Note two', 'text', false, false,
          '[]'::jsonb, '{}'::jsonb, false, 70, 'manual', '{}'::jsonb,
          'internal', 'include', '[]'::jsonb, '[]'::jsonb);
  select count(*) into v_n from custom.record
   where organization_id = v_org and table_id = custom.field_kernel_id()
     and data ->> 'key' = 'note2' and deleted_at is null;
  if v_n <> 1 then raise exception 'FLD-8: the view write did not reach custom.record - % rows', v_n; end if;
  raise notice 'I GREEN - a write THROUGH custom.field reaches custom._field_shape_guard on custom.record and lands as ONE row in the store, so the projection is a surface and never a second store with its own rules';

  -- ══════════════════════════════════════════════════════════════════════════
  -- J. THE RULING, AS A COUNT
  -- ══════════════════════════════════════════════════════════════════════════
  -- A Field is a ROW. If this count moved, the projection has quietly become a second
  -- relation and every assertion above is beside the point.
  select count(*) into v_relcount_after from pg_class c
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'custom';
  if v_relcount_after <> v_relcount_before then
    raise exception 'THE RULING: schema custom held % relations before this suite and % after - a Field became a table',
                    v_relcount_before, v_relcount_after;
  end if;
  raise notice 'J GREEN - schema custom holds % relations, unchanged across the whole suite: every Table, Field and merge field above is a ROW', v_relcount_after;

  raise notice 'W1-FIELD SUITE GREEN';
end;
$t$;

rollback;
