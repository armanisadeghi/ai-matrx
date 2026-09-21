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
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). This suite used to run as the role that OWNS
-- `custom.record`. In that seat `custom.assert_client_may_reach` returns on its first line,
-- EXECUTE grants are free, SECURITY INVOKER and SECURITY DEFINER are the same thing and
-- `custom.record` is directly readable — so every clause below proved something about the
-- store's internals and nothing about the product. It now builds its fixtures as the owner,
-- takes the seat `authenticated` in PART 0, asserts that it holds it, and runs EVERY clause
-- through the door a signed-in person reaches. The reads that used to go straight at
-- `custom.record` go through `custom.read_record` and `custom.record_resolve`; PART 5 asks
-- the same delete door as `test@test.com`, a member who was never shared anything.
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
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_notes   uuid;
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
  v_boss    text := current_user;   -- the connected role, for the two fixture steps no door covers
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'doorfix_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  -- WHO IS WRITING. platform.associations refuses an automated write that does not name the
  -- system doing it, and the store's soft delete reaches that table through
  -- platform._gc_entity_associations. This suite is a named system, and says so.
  perform set_config('app.actor_system', 'campaign-test/doorfix_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Dental Group — Lakeside Office', 'harbor-dental-lakeside-' || substr(v_org::text, 1, 8), 'HDL', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- And the store answers a person only where it is switched on. The superuser walked past
  -- this switch on its first line; `authenticated` does not.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'doorfix_green');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Patients', 'slug', 'patients', 'type', 'entity',
    'label_singular', 'Patient', 'label_plural', 'Patients', 'title_field', 'pname',
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
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  -- The arm that let this suite through for weeks, asked directly.
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

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — T7. THE DELETE DOOR, NOT THE VERB.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 1a. Containment cascades THROUGH THE DOOR, two levels deep.
  v_parent := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Parent'));
  v_child  := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Child','parent_id',v_parent::text));
  v_grand  := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Grandchild','parent_id',v_child::text));
  perform custom.record_delete(v_org, v_parent);
  -- Alive-or-dead is asked of `custom.record_resolve`, the door a person has. The table
  -- itself is not readable from this seat at all.
  if (custom.record_resolve(v_org, v_child) ->> 'live')::boolean
     or (custom.record_resolve(v_org, v_grand) ->> 'live')::boolean then
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
  -- THE DOOR, not the verb: `custom.migrate_undo` is what a person reaches;
  -- `history.migration_undo` is the internal function it calls and holds no client grant.
  v_undo := custom.migrate_undo(v_org, (v_res ->> 'migration_id')::uuid);
  if not (custom.record_resolve(v_org, v_parent) ->> 'live')::boolean
     or not (custom.record_resolve(v_org, v_child) ->> 'live')::boolean then
    raise exception '1c: undo restored % but left something it took still deleted', v_undo ->> 'record_id';
  end if;
  if coalesce((v_undo ->> 'also_restored')::integer, 0) < 1 then
    raise exception '1c: undo reported also_restored = %, and the delete took a record with it', v_undo ->> 'also_restored';
  end if;

  -- 1d. A Field a formula reads is REFUSED BY THE DOOR, and the refusal NAMES the formula.
  v_inv := custom.table_declare(v_org, jsonb_build_object(
    'name','Statements','slug','statements','type','entity',
    'label_singular','Statement','label_plural','Statements','title_field','amount_usd',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','amount_usd'),
                                jsonb_build_object('name','amount_with_tax')),
    'parent_id', v_home::text));
  -- THROUGH THE DOOR: a person adds a column with `custom.field_declare`. The old suite
  -- INSERTed the two Field rows straight into `custom.record`, which needs a table privilege
  -- no signed-in person holds — and which is how a formula's `depends_on` list could be
  -- hand-written into a document the door itself would never have produced.
  v_f_amt := custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','amount_usd','label','Amount USD','plain','number','sort',10,
    'config', '{"kind":"number"}'::jsonb));
  v_f_tax := custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','amount_with_tax','label','Amount with tax','parity_type','formula',
    'sort',20,'compute_on','write',
    'depends_on', jsonb_build_array(to_jsonb(v_f_amt::text)),
    'expr', jsonb_build_object('op','mul',
      'args', jsonb_build_array(jsonb_build_object('field', v_f_amt::text),
                                jsonb_build_object('const', 1.2)))));
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
  if (custom.record_resolve(v_org, v_f_tax) ->> 'live')::boolean then
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
  if v_caught not ilike '%Patients%' then
    raise exception '1f: the refusal does not name the tables living there: %', v_caught;
  end if;

  -- 1g. THE CONTROL: a Home whose Table cascades is not refused.
  -- A Home record has no client door of its own (a Home is made by the onboarding path, not
  -- by a person's browser), so this one fixture step steps out of the seat and says so. No
  -- clause is asserted while it is out.
  perform set_config('role', v_boss, true);
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home 2')) returning id into v_home2;
  perform set_config('role', 'authenticated', true);
  v_tbl2 := custom.table_declare(v_org, jsonb_build_object(
    'name','Chart Notes','slug','chart_notes','type','entity',
    'label_singular','Chart Note','label_plural','Chart Notes','title_field','pname','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','pname')),
    'parent_id', v_home2::text));
  perform custom.record_delete(v_org, v_home2);
  if (custom.record_resolve(v_org, v_home2) ->> 'live')::boolean then
    raise exception '1g: a Home whose Table cascades was refused, so the Home rule refuses everything';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — T5. A MERGE KEEPS THE LOSER'S VALUES AND UNDO PUTS THE ID BACK.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 2a. A DECLARED field's other value becomes a RANKED ALTERNATE WITH ITS SOURCE.
  v_a := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Chen','phone','111'));
  v_b := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Chen','phone','222'));
  v_res := custom.migrate_merge(v_org, v_a, v_b, 'green 2a');
  v_doc := custom.read_record(v_org, v_a, true);
  -- THE DOOR'S OWN SHAPE, which is what a person is shown: `custom.read_record` resolves the
  -- interned `_sources` pointer and hands back `_alternates -> <key>` as a ranked list, each
  -- entry naming the record the other value came from. The old suite read `custom.record.data`
  -- straight and asserted the STORED shape (`_values.phone.alternates`, `src`), which no
  -- screen ever sees and which needs a table privilege no person holds.
  if not exists (select 1 from jsonb_array_elements(coalesce(v_doc -> '_alternates' -> 'phone','[]'::jsonb)) x
                  where x -> 'value' = '"222"'::jsonb and (x ->> 'rank')::int = 1
                    and (x -> 'source' ->> 'id')::uuid = v_b) then
    raise exception '2a: the losing phone number is not a ranked alternate naming the record it came from. Document: %', v_doc;
  end if;
  if (custom.record_resolve(v_org, v_b) ->> 'resolves_to')::uuid <> v_a then
    raise exception '2a: the losing id does not resolve to the winner (REC-21)';
  end if;

  -- 2c. UNDO puts both records back AND stops the old id resolving to the winner.
  v_undo := custom.migrate_undo(v_org, (v_res ->> 'migration_id')::uuid);
  if not (custom.record_resolve(v_org, v_b) ->> 'live')::boolean then
    raise exception '2c: undo did not bring the merged-away record back';
  end if;
  if (custom.record_resolve(v_org, v_b) ->> 'resolves_to')::uuid <> v_b then
    raise exception '2c: after undo the old id still resolves to %, so anything linking to the restored record lands on the wrong one',
      custom.record_resolve(v_org, v_b) ->> 'resolves_to';
  end if;
  if coalesce((v_undo ->> 'ids_unaliased')::integer, 0) <> 1 then
    raise exception '2c: the undo reported ids_unaliased = %', v_undo ->> 'ids_unaliased';
  end if;

  -- 2b. A value on a key that is NOT a declared Field cannot carry an envelope (VAL-1), so it
  --     is kept in _retired with its reason rather than dropped in silence.
  --
  -- FIELD-TRUTH 2026-09-21: THE CLAUSE STANDS; ITS FIXTURE MOVED TO A TABLE WHERE THE SHAPE
  -- IS STILL REACHABLE. This used to put `nickname` on a record of Patients, a table whose
  -- Field rows ARE its columns — and `custom._undeclared_key_guard` refuses that now, which
  -- is the guard working: *"Patient has no field called "nickname", so there is nowhere to
  -- keep that value"*. A value nobody can see was the defect, not a feature to preserve.
  -- What VAL-1 is about has not moved an inch: a DOCUMENT table (`columns: free_form`) — a
  -- clinic's free-text intake notes, whose shape is the author's and not a column list —
  -- can still carry a key no Field declares, and a merge of two of them must keep the
  -- loser's value with its reason rather than drop it in silence. That is asked here.
  v_notes := custom.table_declare(v_org, jsonb_build_object(
    'name','Intake Notes','slug','intake_notes','type','entity',
    'label_singular','Intake Note','label_plural','Intake Notes','title_field','pname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'columns','free_form',
    'fields', jsonb_build_array(jsonb_build_object('name','pname')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_notes, jsonb_build_object('key','pname','label','Patient','type','text'));
  v_a := custom.record_write(v_org, v_notes, jsonb_build_object('pname','Chen'));
  v_b := custom.record_write(v_org, v_notes, jsonb_build_object('pname','Chen'));
  perform custom.record_update(v_org, v_a, jsonb_build_object('nickname','Chenny'));
  perform custom.record_update(v_org, v_b, jsonb_build_object('nickname','Chen-Chen'));
  v_res := custom.migrate_merge(v_org, v_a, v_b, 'green 2b');
  v_doc := custom.read_record(v_org, v_a, true);
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
  v_doc := custom.read_record(v_org, v_a, true) -> 'phone';
  if v_doc is distinct from '12'::jsonb then
    raise exception '3a: text -> number did not convert "12"; the value is now %', coalesce(v_doc::text,'absent');
  end if;

  -- 3b. And "abc" is RETIRED with a sentence naming the field and the value.
  v_doc := custom.read_record(v_org, v_ann, true);
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
  if (custom.read_record(v_org, v_ann, true) ->> 'pname') <> 'Ann Lee' then
    raise exception '3c: the rename did not land';
  end if;

  -- 3d. number -> text, and text -> date, both ways round, on real records.
  perform custom.record_update(v_org, v_f_phone, jsonb_build_object('type','text','config','{}'::jsonb));
  v_doc := custom.read_record(v_org, v_a, true) -> 'phone';
  if v_doc is distinct from '"12"'::jsonb then
    raise exception '3d: number -> text did not convert 12 back to "12"; it is now %', coalesce(v_doc::text,'absent');
  end if;
  perform custom.record_update(v_org, v_a, jsonb_build_object('phone','2026-03-01'));
  perform custom.record_update(v_org, v_f_phone,
    jsonb_build_object('type','range','config', jsonb_build_object('kind','date')));
  v_doc := custom.read_record(v_org, v_a, true) -> 'phone';
  if v_doc is distinct from '"2026-03-01"'::jsonb then
    raise exception '3d: text -> date did not keep the date; it is now %', coalesce(v_doc::text,'absent');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — B1. PROMOTING A FIELD FOLLOWS THE ORGANIZATION'S SYSTEM SWITCH.
  --
  -- SEAT-SUITES rewrote this part. It used to run with the organization's store switched OFF
  -- for everything above it, which only worked because the role that owns `custom.record`
  -- walks past `custom.assert_store_door` on its first line. A signed-in person cannot write
  -- one record into a store that is off, so the switch is ON above and this part turns it off
  -- and back on deliberately, through the switch screen's own door, and watches what a person
  -- is told each time.
  -- ════════════════════════════════════════════════════════════════════════════

  perform custom.field_update(v_org, v_f_phone, jsonb_build_object('promoted', true, 'unique', true));
  v_f_code := v_f_phone;

  -- 4a. THE SWITCH SCREEN'S OWN DOOR turns this organization's store off, from the seat.
  v_res := platform.unified_data_store_set(v_org, false, c_admin, 'doorfix_green 4a');
  if coalesce((v_res ->> 'switched_on')::boolean, true) is not false then
    raise exception '4a: the store switch door said it turned the store off and it reads on: %', v_res;
  end if;

  -- 4a. And with it off, the door a person reaches REFUSES, naming the switch — it does not
  --     half-work and it does not fail silently.
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_tbl, jsonb_build_object('pname','While off'));
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '4a: a record was written into an organization whose store is switched off';
  end if;
  if v_caught not ilike '%switched off%' then
    raise exception '4a: the refusal does not say the store is switched off: %', v_caught;
  end if;

  -- 4a. THE SECOND INPUT WITH A DIFFERENT EXPECTED ANSWER: the same call, the same person,
  --     the same table, with the switch back on — and it LANDS. A door that refused
  --     everything would pass the clause above and fail this one.
  v_res := platform.unified_data_store_set(v_org, true, c_admin, 'doorfix_green 4a control');
  if not coalesce((v_res ->> 'switched_on')::boolean, false) then
    raise exception '4a: the switch door said it turned the store on and it reads off: %', v_res;
  end if;
  if custom.record_write(v_org, v_tbl, jsonb_build_object('pname','While on')) is null then
    raise exception '4a: the same write was refused with the store switched on';
  end if;
  if not coalesce((platform.unified_data_store_state(v_org) ->> 'switched_on')::boolean, false) then
    raise exception '4a: the switch door says this organization is off and it was just switched on';
  end if;

  -- 4b. PROMOTION IS A SERVER LANE, NOT A BROWSER'S. `custom.promote_field` builds an INDEX,
  --     which is DDL; it holds no client grant and no `platform.client_callable_door` row of
  --     its own. So this clause steps OUT of the seat and says so, and asserts nothing about
  --     what a person may do. Anything below it that IS a person's question goes back in.
  perform set_config('role', v_boss, true);
  -- The index is built on sixteen LIVE hash partitions of `custom.record` and needs ACCESS
  -- EXCLUSIVE on each, so under traffic it dies on the two-second lock_timeout the runner sets.
  -- Nothing here is a race: the clause is about what promote_field builds, not how fast.
  set local lock_timeout = '60s';
  v_res := custom.promote_field(v_org, v_tbl, v_f_code);
  if coalesce((v_res ->> 'unique')::boolean, false) is not true then
    raise exception '4b: promote_field did not build a unique index: %', v_res;
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='custom' and c.relname = (v_res ->> 'index_name')) then
    raise exception '4b: promote_field named index % and it is not in the catalogue', v_res ->> 'index_name';
  end if;
  perform set_config('role', 'authenticated', true);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON.
  -- `test@test.com` is a member of this organization and was shared nothing. Every refusal
  -- above is a STORE RULE; this one is the ACCESS question, which the old seat could not ask
  -- at all: as the owner of `custom.record`, `custom.assert_client_may_reach` returned true on
  -- its first line for every organization on the database.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 5a. She cannot delete a record she was never given.
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_ann);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '5a: test@test.com deleted a record nobody shared with her';
  end if;

  -- 5b. Nor change the shape of a table she is not an admin of.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Sneaked in','plain','text'));
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '5b: test@test.com added a column to a table she is not an admin of';
  end if;

  -- 5c. THE CONTROL, so 5a and 5b are not a door that refuses her everything: the record she
  --     IS given, she reads.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_ann, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_ann, true) ->> 'pname') <> 'Ann Lee' then
    raise exception '5c: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice 'doorfix_green: ALL PARTS PASSED (T7 1a-1g, T5 2a-2c, T12 3a-3d, B1 4a-4b, access 5a-5c) — every clause from the seat `authenticated`, through the doors a signed-in person reaches.';
end $t$;

rollback;
