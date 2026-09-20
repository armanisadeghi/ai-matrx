-- STORE-T — THE GREEN SUITE. The seven clauses the sixth independent pass failed, each run
-- THROUGH THE DOOR A SIGNED-IN PERSON REACHES, FROM THE SEAT A SIGNED-IN PERSON HAS.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/storet_green.sql
--
-- 🚨 WHY PART 0 IS THE MOST IMPORTANT PART OF THIS FILE.
-- Every campaign suite written before this one sets `request.jwt.claims` and NEVER sets `role`,
-- so it runs as the superuser that owns `custom.record`. In that seat
-- `custom.assert_client_may_reach` returns on its FIRST branch — `pg_has_role(...)` — grants
-- are free, RLS is off, SECURITY INVOKER and SECURITY DEFINER are the same thing and
-- `custom.record` is directly readable. A suite in that seat proved nothing about any of the
-- seven clauses below: four of them were `permission denied` from a real seat while their
-- lane's suite was green. So this file TAKES THE SEAT in PART 0, asserts that it holds it, and
-- never gives it back. Every `custom.*` call after PART 0 goes through the grant, the door row
-- and the ladder exactly as a browser's does.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, is discovered by no sweep, and its
-- single transaction ends in ROLLBACK, so it leaves the database exactly as it found it.
--
-- ITS RED TWIN is `storet_red.sql`, which puts the old bodies back inside a rolled-back
-- transaction and proves every block below flips.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '600s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_shared  uuid := gen_random_uuid();    -- member_default_visibility = shared_only
  v_open    uuid := gen_random_uuid();    -- the shipped setting
  v_h1 uuid; v_h2 uuid;
  v_proj_t uuid; v_note_t uuid; v_proj uuid; v_note uuid;
  v_wid_t uuid; v_f_code uuid; v_a uuid; v_b uuid;
  v_sh_t uuid; v_f_kind uuid; v_f_rad uuid; v_f_w uuid; v_s1 uuid;
  v_per_t uuid; v_f_own uuid; v_person uuid; v_asset uuid;
  v_f_calc uuid;
  v_co_t uuid; v_ca uuid; v_cb uuid;
  v_doc jsonb; v_res jsonb; v_n integer; v_txt text; v_caught text;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'storet_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign-test/storet_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── THE TWO THROWAWAY ORGANIZATIONS ────────────────────────────────────────────────────
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_shared, 'ZZ STORE-T Green shared', 'zz-storet-g-s-'||substr(v_shared::text,1,8), 'ZTS', c_admin),
    (v_open,   'ZZ STORE-T Green open',   'zz-storet-g-o-'||substr(v_open::text,1,8),   'ZTO', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_shared,'organization',v_shared,c_admin,'owner','active'),
    (v_shared,'organization',v_shared,c_dana,'member','active'),
    (v_open,'organization',v_open,c_admin,'owner','active'),
    (v_open,'organization',v_open,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_shared,v_shared,'true'::jsonb,'campaign-test/storet_green'),
    ('custom','member_default_visibility','organization',v_shared,v_shared,'"shared_only"'::jsonb,
     'campaign-test/storet_green: the stricter of the two privacy settings — the one T2 needs'),
    ('custom','system_enabled','organization',v_open,v_open,'true'::jsonb,'campaign-test/storet_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_shared, null, jsonb_build_object('name','ZZ HQ')) returning id into v_h1;
  insert into custom.record (organization_id, table_id, data)
  values (v_open, null, jsonb_build_object('name','ZZ HQ')) returning id into v_h2;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);

  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  -- THE ARM THAT LETS EVERY OTHER CAMPAIGN SUITE THROUGH, asked directly. `custom.caller_role()`
  -- itself is not callable from a client seat (which is the point), so the test is the catalogue
  -- question `custom.assert_client_may_reach` asks: is this role a member of the one that owns
  -- `custom.record`? For the store's own lanes it is TRUE and every wall opens on the first line.
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
  -- PART 1 — T2. A NOTE SHARED THROUGH ONE OF ITS CARRIERS, UNDER `shared_only`.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_proj_t := custom.table_declare(v_shared, jsonb_build_object(
    'name','ZZ Project','slug','zz_storet_project','type','entity','label_singular','Project',
    'label_plural','Projects','title_field','pname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname')),'parent_id',v_h1::text));
  v_note_t := custom.table_declare(v_shared, jsonb_build_object(
    'name','ZZ Note','slug','zz_storet_note','type','entity','label_singular','Note',
    'label_plural','Notes','title_field','body','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','body')),'parent_id',v_h1::text));
  -- A real Field row, because a name in the table's own `fields` list is not one and
  -- custom.applicable_fields answers with Field ROWS.
  perform custom.field_declare(v_shared, v_note_t, jsonb_build_object('label','Detail','plain','text'));
  v_proj := custom.record_write(v_shared, v_proj_t, jsonb_build_object('pname','Project A','parent_id',v_h1::text));
  v_note := custom.record_write(v_shared, v_note_t, jsonb_build_object('body','the note','parent_id',v_h1::text));
  perform custom.relation_carry(v_shared, v_proj, v_note);
  perform custom.share_grant(v_shared, v_proj, 'user', c_dana, 'viewer'::public.permission_level);

  perform set_config('request.jwt.claims', c_dana_j, true);
  -- 1a. She reads the note itself.
  v_doc := custom.read_record(v_shared, v_note, true);
  if coalesce(v_doc ->> 'body', '') <> 'the note' then
    raise exception '1a: the note is shared with her through Project A and the read door answers %', coalesce(v_doc::text,'nothing');
  end if;
  -- 1b. And the SHAPE of its table, which is what every screen asks for first.
  select count(*) into v_n from custom.applicable_fields(v_shared, v_note_t, null);
  if v_n = 0 then
    raise exception '1b: she can read the note and custom.applicable_fields shows her no columns for it';
  end if;
  -- 1c. And the list door shows her the note and NOTHING ELSE.
  select count(*) into v_n from custom.read_records(v_shared, v_note_t, true, 50, 0);
  if v_n <> 1 then
    raise exception '1c: the list door answers % row(s) where exactly the one shared note is right', v_n;
  end if;
  -- 1d. T10 IS UNTOUCHED: a table she holds nothing in stays secret.
  begin
    perform count(*) from custom.applicable_fields(v_shared, v_proj_t, null);
    -- Project A itself IS shared with her, so its table is legitimately known. Make a table
    -- she holds nothing in at all and ask about that one instead.
    perform set_config('request.jwt.claims', c_admin_j, true);
    v_sh_t := custom.table_declare(v_shared, jsonb_build_object(
      'name','ZZ Secret','slug','zz_storet_secret','type','entity','label_singular','Secret',
      'label_plural','Secrets','title_field','sname','display','page','weight','light','ordered',false,
      'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
      'fields', jsonb_build_array(jsonb_build_object('name','sname')),'parent_id',v_h1::text));
    perform custom.record_write(v_shared, v_sh_t, jsonb_build_object('sname','not hers','parent_id',v_h1::text));
    perform set_config('request.jwt.claims', c_dana_j, true);
    perform count(*) from custom.applicable_fields(v_shared, v_sh_t, null);
    raise exception '1d: a table she holds nothing in described itself to her — T10 is broken';
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%do not have access to this table%' then
      raise exception '1d: refused, but not in T10''s words: %', v_caught;
    end if;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'PART 1 PASSED (T2) — shared through a carrier under shared_only she reads the note, its columns and exactly one row; a table she holds nothing in is still secret.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE SEVEN DOORS THE SIXTH PASS COULD NOT CALL AT ALL.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_wid_t := custom.table_declare(v_open, jsonb_build_object(
    'name','ZZ Widget','slug','zz_storet_widget','type','entity','label_singular','Widget',
    'label_plural','Widgets','title_field','wname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','wname')),'parent_id',v_h2::text));
  v_f_code := custom.field_declare(v_open, v_wid_t, jsonb_build_object('label','Code','plain','text'));
  v_a := custom.record_write(v_open, v_wid_t, jsonb_build_object('wname','A','code','abc','parent_id',v_h2::text));
  v_b := custom.record_write(v_open, v_wid_t, jsonb_build_object('wname','B','code','12','parent_id',v_h2::text));

  if custom.my_level(v_open, v_a, 'record') is null then
    raise exception '2: custom.my_level answers nothing about a record this caller just wrote';
  end if;
  perform count(*) from custom.field_dependants(v_open, v_f_code);
  perform count(*) from custom.parity_field_types();
  perform custom.table_type_field(v_open, v_wid_t);
  perform count(*) from custom.value_read(v_open, v_a, 'code');
  perform count(*) from custom.record_as_of(v_open, v_a, now());
  v_res := custom.delete_preview(v_open, v_a);
  if coalesce((v_res ->> 'carried_out')::boolean, true) then
    raise exception '2: custom.delete_preview says it carried the delete out';
  end if;
  if (select count(*) from custom.read_records(v_open, v_wid_t, true, 50, 0)) <> 2 then
    raise exception '2: the preview changed something — the table no longer holds its two records';
  end if;
  raise notice 'PART 2 PASSED — all seven doors answer from a signed-in seat, and the delete preview changed nothing.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — T12. A COLUMN THAT CHANGES WHAT IT HOLDS CONVERTS, OR RETIRES SAYING WHY.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.field_update(v_open, v_f_code, jsonb_build_object('plain','number'));

  v_doc := custom.read_record(v_open, v_b, true);
  if (v_doc -> 'code') is distinct from '12'::jsonb then
    raise exception '3a: "12" did not convert to the number 12 — it is now %', coalesce((v_doc -> 'code')::text,'absent');
  end if;
  v_doc := custom.read_record(v_open, v_a, true);
  if v_doc ? 'code' then
    raise exception '3b: "abc" is still sitting in the document after the column became a number';
  end if;
  -- `_retired` is the store's own keeping-place and the read door does not show it, so the
  -- whole stored row is read the way a person would: through custom.record_as_of.
  select coalesce(s.state -> 'data', s.state) into v_doc
    from custom.record_as_of(v_open, v_a, now()) s limit 1;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_doc -> '_retired','[]'::jsonb)) x
                  where x ->> 'key' = 'code' and x -> 'value' = '"abc"'::jsonb
                    and coalesce(x ->> 'reason','') ilike '%Code now holds numbers%') then
    raise exception '3b: "abc" was not kept with its reason. The record reads %', v_doc::text;
  end if;
  -- 3c. AND IT IS IN HISTORY, with a sentence — the half the sixth pass found missing.
  select count(*) into v_n from custom.migrations(v_open, v_f_code, 50) m
   where m.verb = 'retype' and m.target_kind = 'field'
     and coalesce(m.note,'') ilike '%converted%';
  if v_n = 0 then
    raise exception '3c: the column changed what it holds and the History door shows no reason for it';
  end if;
  -- 3d. And the record is writable again.
  perform custom.record_update(v_open, v_a, jsonb_build_object('wname','A renamed'), null);
  raise notice 'PART 3 PASSED (T12) — through custom.field_update: "12" converted, "abc" kept with its reason, one history row, the record writable.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — T8. A CHOICE IS GIVEN BY ITS WORD, AND THE COLUMNS THAT APPLY ARE OFFERED.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_sh_t := custom.table_declare(v_open, jsonb_build_object(
    'name','ZZ Shape','slug','zz_storet_shape','type','entity','label_singular','Shape',
    'label_plural','Shapes','title_field','shname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','shname')),'parent_id',v_h2::text,
    'type_field','kind'));
  v_f_kind := custom.field_declare(v_open, v_sh_t, jsonb_build_object(
    'label','Kind','parity_type','select','options', jsonb_build_array('Circle','Rectangle','Square')));
  v_f_rad := custom.field_declare(v_open, v_sh_t, jsonb_build_object(
    'label','Radius','plain','number','applies_to_types', jsonb_build_array('Circle')));
  v_f_w := custom.field_declare(v_open, v_sh_t, jsonb_build_object(
    'label','Width','plain','number','applies_to_types', jsonb_build_array('Rectangle','Square')));

  -- 4a. THE WORD, not the id — AND THE WORD IS WHAT COMES BACK.
  -- UPDATED 2026-09-20 by lane CHOICE-VALUE. This clause used to assert that the read door
  -- answers a UUID, because that was the contract when STORE-T wrote it: a person could type
  -- "Circle" and the store turned it into the option record's id. The seventh independent pass
  -- then failed T8 on exactly that — "the record stores the word the person typed as an
  -- internal id" — so the stored form is now the option's own stable key and every door
  -- resolves it to the label. The old assertion is now the RED one and lives in
  -- `choiceval_red.sql` RED 1.
  v_s1 := custom.record_write(v_open, v_sh_t, jsonb_build_object('shname','S1','kind','Circle','parent_id',v_h2::text));
  v_doc := custom.read_record(v_open, v_s1, true);
  if (v_doc ->> 'kind') ~* '^[0-9a-f]{8}-' then
    raise exception '4a: the read door answers %, and a person reads a word', v_doc ->> 'kind';
  end if;
  if (v_doc ->> 'kind') is distinct from 'Circle' then
    raise exception '4a: the choice reads back as %, and the person picked Circle', coalesce(v_doc ->> 'kind','nothing');
  end if;
  -- 4b. A word that is not a choice is refused WITH THE CHOICES.
  begin
    perform custom.record_write(v_open, v_sh_t, jsonb_build_object('shname','S2','kind','Trapezoid','parent_id',v_h2::text));
    raise exception '4b: "Trapezoid" was accepted as a choice of Kind';
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%does not have a choice called "Trapezoid"%' then
      raise exception '4b: refused, but not by name: %', v_caught;
    end if;
  end;
  -- 4c. The applicability half, which was already right and stays right.
  select count(*) into v_n from custom.applicable_fields(v_open, v_sh_t, 'Circle') f
   where f.data ->> 'key' = 'radius';
  if v_n <> 1 then
    raise exception '4c: asked for a Circle the table did not offer Radius';
  end if;
  select count(*) into v_n from custom.applicable_fields(v_open, v_sh_t, 'Circle') f
   where f.data ->> 'key' = 'width';
  if v_n <> 0 then
    raise exception '4c: asked for a Circle the table offered Width';
  end if;
  -- 4d. And the table says which column decides the kind, from a seat.
  if custom.table_type_field(v_open, v_sh_t) is distinct from 'kind' then
    raise exception '4d: custom.table_type_field answers % for a table whose type field is kind',
      coalesce(custom.table_type_field(v_open, v_sh_t), 'nothing');
  end if;
  raise notice 'PART 4 PASSED (T8) — "Circle" is written as a word and read back as a word; "Trapezoid" is refused naming the three choices; a Circle offers Radius and not Width.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 5 — T9. A RECORD IS RETYPED TO ANOTHER TABLE, FROM A SEAT.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_res := custom.migrate_retype(v_open, v_s1, 'zz_storet_widget', 'campaign-test/storet_green');
  if coalesce(v_res ->> 'kept_the_id', '') <> 'true' then
    raise exception '5: custom.migrate_retype did not keep the id: %', v_res::text;
  end if;
  if (v_res ->> 'to_table')::uuid <> v_wid_t then
    raise exception '5: the record did not move to the table it was asked for: %', v_res::text;
  end if;
  if (v_res -> 'misfits') = '{}'::jsonb then
    raise exception '5: a Shape became a Widget and nothing was recorded as not fitting';
  end if;
  select count(*) into v_n from custom.migrations(v_open, v_s1, 50) m
   where m.verb = 'retype' and m.target_kind = 'record';
  if v_n = 0 then
    raise exception '5: the retype left nothing a person can read in History';
  end if;
  raise notice 'PART 5 PASSED (T9) — custom.migrate_retype runs from a signed-in seat, keeps the id, and puts what did not fit in History.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 6 — T7. RESTRICT REFUSES BY NAME, AND A FORMULA'S FIELD CANNOT BE DELETED UNDER IT.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_per_t := custom.table_declare(v_open, jsonb_build_object(
    'name','ZZ Asset','slug','zz_storet_asset','type','entity','label_singular','Asset',
    'label_plural','Assets','title_field','aname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','aname')),'parent_id',v_h2::text));
  -- A relation column that says what happens when the thing it points at is deleted. The door
  -- used to throw this word away and write `set_null` whatever the caller asked for.
  v_f_own := custom.field_declare(v_open, v_per_t, jsonb_build_object(
    'label','Owner','parity_type','member','on_target_delete','restrict'));
  if (select f.data ->> 'on_target_delete' from custom.applicable_fields(v_open, v_per_t, null) f
       where f.data ->> 'key' = 'owner') <> 'restrict' then
    raise exception '6a: the declaring door threw the caller''s on_target_delete away';
  end if;
  v_person := custom.record_write(v_open, custom.person_kernel_id(), jsonb_build_object('title','ZZ Owner'));
  v_asset  := custom.record_write(v_open, v_per_t, jsonb_build_object('aname','Press','owner',v_person::text,'parent_id',v_h2::text));
  -- 6b. THE PREVIEW SAYS IT WOULD BE REFUSED, before anybody presses anything.
  v_res := custom.delete_preview(v_open, v_person);
  if not coalesce((v_res ->> 'would_be_refused')::boolean, false) then
    raise exception '6b: deleting a record an Asset points at under `restrict` previews as allowed: %', v_res::text;
  end if;
  -- 6c. AND THE DELETE ITSELF IS REFUSED.
  begin
    perform custom.record_delete(v_open, v_person);
    raise exception '6c: deleting the owner an Asset points at under `restrict` was accepted';
  exception when foreign_key_violation then null;
  end;
  -- 6d. A FORMULA'S DEPENDENCY IS KEPT, so REC-18 can fire for a column a person made.
  v_f_w := custom.field_declare(v_open, v_per_t, jsonb_build_object('label','Serial','plain','text'));
  v_f_calc := custom.field_declare(v_open, v_per_t, jsonb_build_object(
    'label','Shouty','parity_type','formula','depends_on', jsonb_build_array('serial'),
    'expr', jsonb_build_object('node','field','field','serial')));
  select count(*) into v_n from custom.field_dependants(v_open, v_f_w) d
   where d.dependant_id = v_f_calc;
  if v_n = 0 then
    raise exception '6d: a formula was declared saying it depends on Serial, and nothing depends on Serial';
  end if;
  -- 6e. AND THE DELETE OF THAT COLUMN IS REFUSED, NAMING THE FORMULA (REC-18 / T7).
  begin
    perform custom.record_delete(v_open, v_f_w);
    raise exception '6e: the column a formula reads was deleted without a word';
  exception when foreign_key_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%Shouty%' then
      raise exception '6e: refused, but it did not name the formula: %', v_caught;
    end if;
  end;
  raise notice 'PART 6 PASSED (T7) — `restrict` is declarable from a seat, previews as a refusal and refuses; a client-made formula''s dependency is kept, named, and refuses the delete of the column it reads.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 7 — T11. THE WALK FOLLOWS A CARRYING LINK: A ONCE AND B ONCE.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_co_t := custom.table_declare(v_open, jsonb_build_object(
    'name','ZZ Company','slug','zz_storet_company','type','entity','label_singular','Company',
    'label_plural','Companies','title_field','cname','display','page','weight','light','ordered',false,
    'row_order','sorted','default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','cname')),'parent_id',v_h2::text));
  v_ca := custom.record_write(v_open, v_co_t, jsonb_build_object('cname','Company A','parent_id',v_h2::text));
  v_cb := custom.record_write(v_open, v_co_t, jsonb_build_object('cname','Company B','parent_id',v_h2::text));
  perform custom.relation_carry(v_open, v_ca, v_cb);
  perform custom.relation_carry(v_open, v_cb, v_ca);

  select count(*) into v_n from custom.query_rollup(v_open, array[v_ca], null, null, 33, 'viewer') q
   where q.record_id in (v_ca, v_cb);
  if v_n <> 2 then
    raise exception '7a: rolling up from Company A reaches % of the two companies — the walk stops at the root', v_n;
  end if;
  -- 7b. ONCE EACH. A loop that double-counted would answer more than two rows in total.
  select count(*) into v_n from custom.query_rollup(v_open, array[v_ca], null, null, 33, 'viewer');
  if v_n <> 2 then
    raise exception '7b: the loop was walked more than once — % row(s) for two companies', v_n;
  end if;
  -- 7c. And it terminates: the same answer with a deep cap.
  select count(*) into v_n from custom.query_rollup(v_open, array[v_ca], null, null, 64, 'viewer');
  if v_n <> 2 then
    raise exception '7c: at the deepest cap the loop answers % row(s)', v_n;
  end if;
  raise notice 'PART 7 PASSED (T11) — A partners B and B partners A; the rollup from A returns A once and B once, and terminates at every cap.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 8 — B1. A COLUMN CAN BE MARKED UNIQUE, AND A DUPLICATE IS REFUSED BY NAME.
  -- (The two-session half — the loser BLOCKS until the winner commits — is
  --  scripts/campaign-tests/storet_b1_concurrency.sh, because one session cannot block itself.)
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.field_update(v_open, v_f_code, jsonb_build_object(
    'rules', jsonb_build_array(jsonb_build_object('kind','unique'))));
  if not exists (select 1 from jsonb_array_elements(
                   (select f.data -> 'rules' from custom.applicable_fields(v_open, v_wid_t, null) f
                     where f.id = v_f_code)) x where x ->> 'kind' = 'unique') then
    raise exception '8a: the unique rule was not saved on the column';
  end if;
  perform custom.record_write(v_open, v_wid_t, jsonb_build_object('wname','C','code',77,'parent_id',v_h2::text));
  begin
    perform custom.record_write(v_open, v_wid_t, jsonb_build_object('wname','D','code',77,'parent_id',v_h2::text));
    raise exception '8b: two records were written with the same value in a unique column';
  exception when unique_violation then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%already has Code%' then
      raise exception '8b: refused, but not by the column''s name: %', v_caught;
    end if;
  end;
  -- `p_by_id => false` so the document comes back keyed by the column's own key, which is what
  -- a person reads. (With `true` the read door keys it by the Field's id.)
  select count(*) into v_n from custom.read_records(v_open, v_wid_t, false, 200, 0) r
   where (r.document ->> 'code') = '77';
  if v_n <> 1 then
    raise exception '8c: % row(s) hold the duplicated value — no second row may exist.', v_n;
  end if;
  raise notice 'PART 8 PASSED (B1) — the column takes a unique rule, the second write is refused naming the column, and only one row holds the value.';

  raise notice 'ALL PARTS PASSED (T2, the seven doors, T12, T8, T9, T7, T11, B1) — every one of them from the seat `authenticated`, through the doors a signed-in person reaches.';
end
$t$;

rollback;
