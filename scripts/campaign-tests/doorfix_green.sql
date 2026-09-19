-- LANE DOOR-FIX — THE GREEN SUITE. T5, T7, T12 and B1, on the MAIN database, in one
-- transaction that ends in ROLLBACK. Everything it makes — one disposable organization, its
-- home, its tables, its fields, its records and one knob override — disappears with it.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/doorfix_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/doorfix_red.sql`, which asserts the four defects
-- exactly as they were measured on 2026-09-19 and is RED against this database.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED, one per part:
--   1 (T7)  take `custom.delete_rule` back out of `custom.record_delete`, or stop it
--           cascading through itself → 1a and 1b.
--   1 (T7)  drop the `also` arm of `history.migration_undo` → 1c.
--   2 (T5)  put `jsonb_set(v_data, '{_values,<key>}', …)` back in `custom.migrate_merge` → 2a.
--   2 (T5)  drop the `_retired` arm for an undeclared key → 2b.
--   2 (T5)  drop the `unalias` arm of `history.migration_undo`, or the `revoked_at` clause in
--           `custom.resolve_id` → 2c.
--   3 (T12) drop the trigger `custom_record_field_type_converts_values` → 3a, 3b, 3c, 3d.
--   4 (B1)  put `custom/field_index_guard` back into `custom.promote_field` → 4b.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, in every part, because a delete that
-- refuses everything and a merge that keeps nothing both pass a test that only checks one
-- side: 1a's cascade is paired with 1d's refusal and 1e's clean delete; 2a's alternate is
-- paired with 2b's retirement; 3a's conversion is paired with 3b's retirement; 4b's promotion
-- is paired with 4a's refusal while the store is off.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_inv     uuid;
  v_f_name  uuid;
  v_f_phone uuid;
  v_f_amt   uuid;
  v_f_tax   uuid;
  v_f_code  uuid;
  v_parent  uuid;
  v_child   uuid;
  v_grand   uuid;
  v_a       uuid;
  v_b       uuid;
  v_ann     uuid;
  v_res     jsonb;
  v_undo    jsonb;
  v_doc     jsonb;
  v_msg     text;
  v_caught  text;
  v_n       integer;
  v_home2   uuid;
  v_tbl2    uuid;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'doorfix_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  -- WHO IS WRITING. platform.associations refuses an automated write that does not name the
  -- system doing it, and the store's soft delete reaches that table through
  -- platform._gc_entity_associations. This suite is a named system, and says so.
  perform set_config('app.actor_system', 'campaign-test/doorfix_green', true);
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  insert into iam.organizations (id, name, slug, abbreviation)
  values (v_org, 'ZZ DOOR-FIX Green', 'zz-doorfix-green-' || substr(v_org::text, 1, 8), 'ZDG');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'ZZ Person', 'slug', 'zz_doorfix_person', 'type', 'entity',
    'label_singular', 'Person', 'label_plural', 'People', 'title_field', 'pname',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name', 'pname'),
                                jsonb_build_object('name', 'phone')),
    'parent_id', v_home::text));

  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','pname','label','Name','type','text','sort',10,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl))
    returning id into v_f_name;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','phone','label','Phone','type','text','sort',20,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_tbl))
    returning id into v_f_phone;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — T7. THE DELETE DOOR, NOT THE VERB.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 1a. Containment cascades THROUGH THE DOOR, two levels deep.
  v_parent := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Parent'));
  v_child  := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Child','parent_id',v_parent::text));
  v_grand  := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Grandchild','parent_id',v_child::text));
  perform custom.record_delete(v_org, v_parent);
  if exists (select 1 from custom.record r where r.organization_id=v_org and r.id in (v_child, v_grand) and r.deleted_at is null) then
    raise exception '1a: custom.record_delete left a contained record live — the door orphaned it, which is exactly T7''s first clause';
  end if;

  -- 1b. And the verb takes the same records, and records them in its inverse.
  v_parent := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Parent2'));
  v_child  := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Child2','parent_id',v_parent::text));
  v_res := custom.migrate_delete(v_org, v_parent, 'green 1b');
  if coalesce((v_res ->> 'cascaded')::integer, 0) < 1 then
    raise exception '1b: migrate_delete reported % cascaded and it took a contained record', v_res ->> 'cascaded';
  end if;

  -- 1c. UNDO puts the whole cascade back, not only the record a person named.
  v_undo := history.migration_undo(v_org, (v_res ->> 'migration_id')::uuid);
  if exists (select 1 from custom.record r where r.organization_id=v_org and r.id in (v_parent, v_child) and r.deleted_at is not null) then
    raise exception '1c: undo restored % but left something it took still deleted', v_undo ->> 'record_id';
  end if;
  if coalesce((v_undo ->> 'also_restored')::integer, 0) < 1 then
    raise exception '1c: undo reported also_restored = %, and the delete took a record with it', v_undo ->> 'also_restored';
  end if;

  -- 1d. A Field a formula reads is REFUSED BY THE DOOR, and the refusal NAMES the formula.
  v_inv := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Invoice','slug','zz_doorfix_invoice','type','entity',
    'label_singular','Invoice','label_plural','Invoices','title_field','amount_usd',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','amount_usd'),
                                jsonb_build_object('name','amount_with_tax')),
    'parent_id', v_home::text));
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','amount_usd','label','Amount USD','type','range','sort',10,'required',false,
      'multi',false,'dated',false,'source','manual','config','{"kind":"number"}'::jsonb,
      'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
      'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
      'entity_definition_id',v_inv))
    returning id into v_f_amt;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','amount_with_tax','label','Amount with tax','type','formula','sort',20,
      'required',false,'multi',false,'dated',false,'source','formula','compute_on','write',
      'config', jsonb_build_object('expr', jsonb_build_object('op','mul',
        'args', jsonb_build_array(jsonb_build_object('field', v_f_amt::text),
                                  jsonb_build_object('const', 1.2)))),
      'rules','[]'::jsonb,'depends_on','[]'::jsonb,'sensitivity','internal',
      'source_config','{}'::jsonb,'context_policy','include','applies_to_types','[]'::jsonb,
      'entity_definition_id',v_inv))
    returning id into v_f_tax;
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_f_amt);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '1d: the door deleted a Field a formula reads. T7''s fifth clause.';
  end if;
  if v_caught not ilike '%Amount with tax%' then
    raise exception '1d: the refusal does not name the formula: %', v_caught;
  end if;

  -- 1e. THE CONTROL: a Field nothing reads deletes cleanly through the same door.
  perform custom.record_delete(v_org, v_f_tax);
  if (select deleted_at from custom.record r where r.organization_id=v_org and r.id=v_f_tax) is null then
    raise exception '1e: a Field nothing reads was not deleted, so the rule refuses everything';
  end if;

  -- 1f. A HOME its Tables still live in is refused by the door, and named.
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_home);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '1f: the door deleted a Home that four tables live in. T7''s fourth clause.';
  end if;
  if v_caught not ilike '%ZZ Person%' then
    raise exception '1f: the refusal does not name the tables living there: %', v_caught;
  end if;

  -- 1g. THE CONTROL: a Home whose Table cascades is not refused.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home 2')) returning id into v_home2;
  v_tbl2 := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ Cascader','slug','zz_doorfix_cascader','type','entity',
    'label_singular','C','label_plural','Cs','title_field','pname','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','pname')),
    'parent_id', v_home2::text));
  perform custom.record_delete(v_org, v_home2);
  if (select deleted_at from custom.record r where r.organization_id=v_org and r.id=v_home2) is null then
    raise exception '1g: a Home whose Table cascades was refused, so the Home rule refuses everything';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — T5. A MERGE KEEPS THE LOSER'S VALUES AND UNDO PUTS THE ID BACK.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 2a. A DECLARED field's other value becomes a RANKED ALTERNATE WITH ITS SOURCE.
  v_a := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Chen','phone','111'));
  v_b := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Chen','phone','222'));
  v_res := custom.migrate_merge(v_org, v_a, v_b, 'green 2a');
  select r.data into v_doc from custom.record r where r.organization_id=v_org and r.id=v_a;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_doc -> '_values' -> 'phone' -> 'alternates','[]'::jsonb)) x
                  where x -> 'value' = '"222"'::jsonb and (x ->> 'rank')::int = 1 and x ? 'src') then
    raise exception '2a: the losing phone number is not a ranked alternate with a source. Document: %', v_doc;
  end if;
  if v_doc -> '_sources' is null then
    raise exception '2a: the alternate points at a source pointer and no _sources block was interned. Document: %', v_doc;
  end if;
  if custom.resolve_id(v_org, v_b) <> v_a then
    raise exception '2a: the losing id does not resolve to the winner (REC-21)';
  end if;

  -- 2c. UNDO puts both records back AND stops the old id resolving to the winner.
  v_undo := history.migration_undo(v_org, (v_res ->> 'migration_id')::uuid);
  if (select deleted_at from custom.record r where r.organization_id=v_org and r.id=v_b) is not null then
    raise exception '2c: undo did not bring the merged-away record back';
  end if;
  if custom.resolve_id(v_org, v_b) <> v_b then
    raise exception '2c: after undo the old id still resolves to %, so anything linking to the restored record lands on the wrong one',
      custom.resolve_id(v_org, v_b);
  end if;
  if coalesce((v_undo ->> 'ids_unaliased')::integer, 0) <> 1 then
    raise exception '2c: the undo reported ids_unaliased = %', v_undo ->> 'ids_unaliased';
  end if;

  -- 2b. A value on a key that is NOT a declared Field cannot carry an envelope (VAL-1), so it
  --     is kept in _retired with its reason rather than dropped in silence.
  perform custom.record_update(v_org, v_a, jsonb_build_object('nickname','Chenny'));
  perform custom.record_update(v_org, v_b, jsonb_build_object('nickname','Chen-Chen'));
  v_res := custom.migrate_merge(v_org, v_a, v_b, 'green 2b');
  select r.data into v_doc from custom.record r where r.organization_id=v_org and r.id=v_a;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_doc -> '_retired','[]'::jsonb)) x
                  where x ->> 'key' = 'nickname' and x -> 'value' = '"Chen-Chen"'::jsonb
                    and x ->> 'reason' ilike '%not a declared field%') then
    raise exception '2b: the undeclared key''s other value was not kept with its reason. Document: %', v_doc;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — T12. A FIELD CHANGING WHAT IT HOLDS CONVERTS, OR RETIRES SAYING WHY.
  -- ════════════════════════════════════════════════════════════════════════════

  v_ann := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Ann','phone','abc'));
  v_a   := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Bo','phone','12'));

  -- 3a. text -> number: "12" CONVERTS to the number 12.
  perform custom.record_update(v_org, v_f_phone,
    jsonb_build_object('type','range','config', jsonb_build_object('kind','number')));
  select r.data -> 'phone' into v_doc from custom.record r where r.organization_id=v_org and r.id=v_a;
  if v_doc is distinct from '12'::jsonb then
    raise exception '3a: text -> number did not convert "12"; the value is now %', coalesce(v_doc::text,'absent');
  end if;

  -- 3b. And "abc" is RETIRED with a sentence naming the field and the value.
  select r.data into v_doc from custom.record r where r.organization_id=v_org and r.id=v_ann;
  if v_doc ? 'phone' then
    raise exception '3b: "abc" is still sitting in the document after the field became a number';
  end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_doc -> '_retired','[]'::jsonb)) x
                  where x ->> 'key' = 'phone' and x -> 'value' = '"abc"'::jsonb
                    and x ->> 'reason' ilike '%Phone now holds numbers%') then
    raise exception '3b: "abc" was not kept with its reason. Document: %', v_doc;
  end if;

  -- 3c. AND THE RECORD IS WRITABLE AGAIN — the whole point of T12. A rename of a field the
  --     write never touched used to be refused, naming Phone.
  perform custom.record_update(v_org, v_ann, jsonb_build_object('pname','Ann Lee'));
  if (select r.data ->> 'pname' from custom.record r where r.organization_id=v_org and r.id=v_ann) <> 'Ann Lee' then
    raise exception '3c: the rename did not land';
  end if;

  -- 3d. number -> text, and text -> date, both ways round, on real records.
  perform custom.record_update(v_org, v_f_phone, jsonb_build_object('type','text','config','{}'::jsonb));
  select r.data -> 'phone' into v_doc from custom.record r where r.organization_id=v_org and r.id=v_a;
  if v_doc is distinct from '"12"'::jsonb then
    raise exception '3d: number -> text did not convert 12 back to "12"; it is now %', coalesce(v_doc::text,'absent');
  end if;
  perform custom.record_update(v_org, v_a, jsonb_build_object('phone','2026-03-01'));
  perform custom.record_update(v_org, v_f_phone,
    jsonb_build_object('type','range','config', jsonb_build_object('kind','date')));
  select r.data -> 'phone' into v_doc from custom.record r where r.organization_id=v_org and r.id=v_a;
  if v_doc is distinct from '"2026-03-01"'::jsonb then
    raise exception '3d: text -> date did not keep the date; it is now %', coalesce(v_doc::text,'absent');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — B1. PROMOTING A FIELD FOLLOWS THE ORGANIZATION'S SYSTEM SWITCH.
  -- ════════════════════════════════════════════════════════════════════════════

  -- The field to promote is one this Table already declares: a promoted Field is indexed by
  -- the path its own storage uses, and a key the Table never declared has no storage at all.
  perform custom.record_update(v_org, v_f_phone,
    jsonb_build_object('promoted', true, 'unique', true));
  v_f_code := v_f_phone;

  -- 4a. THE CONTROL: with this organization's store OFF, promotion is refused, and the refusal
  --     names the switch that governs it.
  v_caught := null;
  begin
    perform custom.promote_field(v_org, v_tbl, v_f_code);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '4a: a field was promoted for an organization whose store is switched off';
  end if;

  -- 4b. With the store ON for this organization — the one switch, written the way the switch
  --     screen writes it — promotion goes through and builds the unique index.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'doorfix_green');
  v_res := custom.promote_field(v_org, v_tbl, v_f_code);
  if coalesce((v_res ->> 'unique')::boolean, false) is not true then
    raise exception '4b: promote_field did not build a unique index: %', v_res;
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='custom' and c.relname = (v_res ->> 'index_name')) then
    raise exception '4b: promote_field named index % and it is not in the catalogue', v_res ->> 'index_name';
  end if;

  -- 4c. THE SWITCH SCREEN'S OWN DOOR reads and writes that same switch.
  if not coalesce((platform.unified_data_store_state(v_org) ->> 'switched_on')::boolean, false) then
    raise exception '4c: the store switch door says this organization is off and its knob resolves true';
  end if;
  v_res := platform.unified_data_store_set(v_org, false, '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, 'doorfix_green');
  if coalesce((v_res ->> 'switched_on')::boolean, true) is not false then
    raise exception '4c: the store switch door said it turned the store off and it reads on: %', v_res;
  end if;

  raise notice 'doorfix_green: ALL PARTS PASSED (T7 1a-1g, T5 2a-2c, T12 3a-3d, B1 4a-4c).';
end $t$;

rollback;
