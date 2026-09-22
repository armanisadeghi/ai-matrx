-- LANE DOOR-FIX — THE RED TWIN. The same four defects, asserted EXACTLY AS THEY WERE MEASURED
-- on the main database on 2026-09-19, before this lane's files landed:
--
--   RED 1 (T7)  custom.record_delete soft-deletes the record a person named and LEAVES the
--               records it contained live and orphaned.
--   RED 2 (T5)  custom.migrate_merge drops the loser's other value: the winner's document is
--               unchanged and carries no alternate, while values_taken still counts it.
--   RED 3 (T5)  after history.migration_undo the loser's id STILL resolves to the winner.
--   RED 4 (T12) changing a Field's behaviour leaves the values alone, and the next write to a
--               record holding one is refused naming a field it never touched.
--   RED 5 (B1)  custom.promote_field refuses for an organization whose store is ON, because it
--               reads custom/field_index_guard, which has no override anywhere.
--   RED 6       custom.field_declare refuses a column the table declared and never defined, so
--               a table's first column can never be given a type. (SEAT-SUITES, 2026-09-19)
--   RED 7       custom.read_record drops `_retired`, so the values the store kept WITH THEIR
--               REASON never reach the person. (SEAT-SUITES, 2026-09-19)
--   RED 8       custom.field_update accepts `promoted`/`unique` and changes nothing, so nobody
--               can ask for an indexed or a unique column through a door. (SEAT-SUITES)
--
-- 🚨 THE SEAT (SEAT-SUITES, 2026-09-19). This twin used to run as the role that OWNS
-- `custom.record`, and RED 6-8 are three defects that role could not see at all: it INSERTs
-- Field rows straight into the table, it reads the stored document rather than the door's, and
-- it patches a Field row with `custom.record_update`. So this file now builds its fixtures as
-- the owner, takes the seat `authenticated` in PART 0, and asserts every block through the door
-- a signed-in person reaches — which is the only place these eight defects were ever visible.
--
-- AGAINST THIS DATABASE IT IS RED, and each block says which fix made it red. Run it, see it
-- fail on RED 1, and you have the proof that the door delete now consults the rule; run each
-- inverse in migrations/inverse/doorfix_*_down.sql and the blocks come back green one by one,
-- which is the only way to know a green suite is measuring anything.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/doorfix_red.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'doorfix_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_inv     uuid;
  v_f_name  uuid;
  v_f_phone uuid;
  v_notes   uuid;
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
  v_boss    text := current_user;
  v_tbl2_red uuid;
  -- EVERY block is measured, not only the first: a red twin that stops at its first failure
  -- says nothing about the other four. They are collected and raised together at the end.
  v_reds    text[] := '{}';
begin
  -- WHO IS WRITING. platform.associations refuses an automated write that does not name the
  -- system doing it, and the store's soft delete reaches that table through
  -- platform._gc_entity_associations. This suite is a named system, and says so.
  perform set_config('app.actor_system', 'campaign-test/doorfix_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Dental Group — Lakeside Office', 'harbor-dental-lakeside-red-' || substr(v_org::text, 1, 8), 'HDL', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'doorfix_red');

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

  -- 🚨 DECLARED THROUGH THE DOOR (lane RED-SUITES-2, 2026-09-21), the same repair its green
  -- twin got and for the same reason: a hand-written Field document is not the shape
  -- `custom._field_document_for` produces, so RED 4's conversion rebuilt the column into a
  -- number and the validator refused the values the conversion had just written. And since
  -- LIMITS-FIX `custom.table_declare` materialises the columns a table's spec names, these
  -- INSERTs were adding a SECOND Field row claiming the same key.
  v_f_name  := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','pname','label','Name','plain','text','sort',10));
  v_f_phone := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','phone','label','Phone','plain','text','sort',20));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Every block below runs as a signed-in person.
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

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 1 (T7) — the door orphans what the record contained.
  -- Made red by: custom.record_delete asking custom.delete_rule and cascading through itself.
  -- ════════════════════════════════════════════════════════════════════════════
  v_parent := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Parent'));
  v_child  := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Child','parent_id',v_parent::text));
  perform custom.record_delete(v_org, v_parent);
  if not (custom.record_resolve(v_org, v_child) ->> 'live')::boolean then
    v_reds := array_append(v_reds, 'RED 1 did not go red: the door took the contained record with it, so the delete rule is being consulted');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 2 (T5) — the losing value disappears with no alternate.
  -- Made red by: the merge BUILDING the envelope instead of jsonb_set-ing into a path that
  -- may not exist, and reading the document back afterwards.
  -- ════════════════════════════════════════════════════════════════════════════
  v_a := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Chen','phone','111'));
  v_b := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Chen','phone','222'));
  v_res := custom.migrate_merge(v_org, v_a, v_b, 'red 2');
  v_doc := custom.read_record(v_org, v_a, true);
  if exists (select 1 from jsonb_array_elements(coalesce(v_doc -> '_alternates' -> 'phone','[]'::jsonb)) x
              where x -> 'value' = '"222"'::jsonb) then
    v_reds := array_append(v_reds, 'RED 2 did not go red: the winner carries the losing phone number as an alternate');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 3 (T5) — undo restores the record and leaves the id pointing at the survivor.
  -- Made red by: history.migration_undo honouring the inverse's `unalias`, and
  -- custom.resolve_id skipping a revoked alias.
  -- ════════════════════════════════════════════════════════════════════════════
  v_undo := custom.migrate_undo(v_org, (v_res ->> 'migration_id')::uuid);
  if (custom.record_resolve(v_org, v_b) ->> 'resolves_to')::uuid = v_b then
    v_reds := array_append(v_reds, 'RED 3 did not go red: after the undo the restored record''s own id resolves to itself');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 4 (T12) — the field changes behaviour and the record is bricked.
  -- Made red by: the trigger custom_record_field_type_converts_values.
  -- ════════════════════════════════════════════════════════════════════════════
  v_ann := custom.record_write(v_org, v_tbl, jsonb_build_object('pname','Ann','phone','abc'));
  perform custom.field_update(v_org, v_f_phone, jsonb_build_object('plain','number'));
  v_caught := null;
  begin
    perform custom.record_update(v_org, v_ann, jsonb_build_object('pname','Ann Lee'));
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    v_reds := array_append(v_reds, 'RED 4 did not go red: the record is still writable after the field changed what it holds, so the values were converted or retired');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 5 (B1) — promotion refuses although the organization's store is ON.
  -- Made red by: promote_field reading custom/system_enabled through custom.store_is_open.
  -- ════════════════════════════════════════════════════════════════════════════
  -- The organization's store is already ON (the fixtures switched it on: a signed-in person
  -- cannot write a single record into a store that is off, which is why this twin had to).
  perform custom.field_update(v_org, v_f_name, jsonb_build_object('promoted', true, 'unique', false));
  v_caught := null;
  -- `custom.promote_field` builds an INDEX and holds no client grant, so this ONE statement
  -- steps out of the seat and says so. It asserts nothing about what a person may do.
  perform set_config('role', v_boss, true);
  set local lock_timeout = '10s';
  begin
    perform custom.promote_field(v_org, v_tbl, v_f_name);
  exception when others then
    v_caught := sqlerrm;
  end;
  perform set_config('role', 'authenticated', true);
  if v_caught is null then
    v_reds := array_append(v_reds, 'RED 5 did not go red: a field was promoted for an organization whose store is on, so promotion follows the system switch');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 6 (SEAT-SUITES) — a column the table declared can never be defined.
  -- Made red by: custom.field_declare testing for a Field ROW instead of a name in the list.
  -- ════════════════════════════════════════════════════════════════════════════
  -- A brand-new table, declared through the door, whose one column name has no Field row —
  -- which is every table a person makes.
  v_tbl2_red := custom.table_declare(v_org, jsonb_build_object(
    'name','Recall Reminders','slug','recall_reminders','type','entity',
    'label_singular','Recall Reminder','label_plural','Recall Reminders','title_field','reminder_note','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','reminder_note')),
    'parent_id', v_home::text));
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_tbl2_red, jsonb_build_object('key','reminder_note','label','Reminder note','plain','text'));
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    v_reds := array_append(v_reds, 'RED 6 did not go red: the door defined a column the table had declared and never defined, so a new table''s first column is reachable');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 7 (SEAT-SUITES) — the read door drops what was retired.
  -- Made red by: custom.read_record carrying `_retired` the way it already carried `_alternates`.
  -- ════════════════════════════════════════════════════════════════════════════
  -- 🚨 THE FIXTURE MOVED TO A DOCUMENT TABLE (lane RED-SUITES-2, 2026-09-21), exactly as
  -- FIELD-TRUTH moved its green twin's. `nickname` used to be written onto a record of
  -- Patients, a table whose Field rows ARE its columns, and `custom._undeclared_key_guard`
  -- refuses that now — "Patient has no field called "nickname", so there is nowhere to keep
  -- that value" — which is the guard working. What RED 7 is about has not moved: a DOCUMENT
  -- table (`columns: free_form`) may carry a key no Field declares, and the read door must
  -- carry what a merge retired. Asked on such a table, as its green twin already does.
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
  v_res := custom.migrate_merge(v_org, v_a, v_b, 'red 7');
  v_doc := custom.read_record(v_org, v_a, true);
  if exists (select 1 from jsonb_array_elements(coalesce(v_doc -> '_retired','[]'::jsonb)) x
              where x ->> 'key' = 'nickname') then
    v_reds := array_append(v_reds, 'RED 7 did not go red: the read door shows the value the merge retired, with its reason');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- RED 8 (SEAT-SUITES) — the field door says yes to `unique` and changes nothing.
  -- Made red by: the two `p_patch ? 'promoted' / 'unique'` arms in custom.field_update.
  -- ════════════════════════════════════════════════════════════════════════════
  perform custom.field_update(v_org, v_f_name, jsonb_build_object('unique', true));
  if exists (select 1 from custom.applicable_fields(v_org, v_tbl, null) f
              where f.id = v_f_name and coalesce((f.data ->> 'unique')::boolean, false)) then
    v_reds := array_append(v_reds, 'RED 8 did not go red: the field door saved `unique`, so a person can ask for a unique column');
  end if;

  if array_length(v_reds, 1) > 0 then
    raise exception 'doorfix_red: % of 8 blocks are RED (the defect they assert is gone): %',
      array_length(v_reds, 1), array_to_string(v_reds, ' | ');
  end if;
  raise notice 'doorfix_red: every block asserted the defect and found it — NOTHING IS FIXED.';
end $t$;

rollback;
