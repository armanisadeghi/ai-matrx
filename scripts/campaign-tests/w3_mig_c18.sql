-- W3-MIG — CHECK C-18, plus T5, T7, T9 and T12.
-- REC-12 · REC-13 · REC-18 · REC-20 · REC-21 · REC-22 · REC-23 · REC-24 · REC-N-18 · FLD-4.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w3_mig_c18.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it ROLLS
-- BACK. Everything it makes — one disposable organization, its home, its tables, its fields,
-- its records and one knob override — disappears with it.
--
-- ITS RED TWIN is `scripts/campaign-tests/w3_mig_red.sql`.
--
-- 🚨 RE-POINTED AND SEATED (lane ORG-DELETE, 2026-09-19).
--
--   1. IT RUNS ON THE MAIN DATABASE, on a disposable organization of its own. It used to
--      refuse to run anywhere but the rehearsal branch — a copy carrying 226 functions in
--      schema `custom` against main's 332, granting `authenticated` 29 of them against main's
--      103, and carrying no `custom.field_declare` at all. The store it measured was not the
--      store anybody uses. The owner's 2026-09-18 ruling is that there is no production and
--      everything is the main database.
--
--   2. EVERY ASSERTED CLAUSE RUNS AS `authenticated`, THROUGH THE DOORS A SIGNED-IN PERSON
--      REACHES. It used to run every clause as the connected owner of `custom.record`, where
--      `custom.assert_client_may_reach` returns on its first line, EXECUTE grants are free,
--      SECURITY INVOKER and SECURITY DEFINER are the same thing, and `custom.record`,
--      `history.migration_log` and `custom.resolve_id` are all directly readable. In that seat
--      the whole subject of this check — "what may a PERSON migrate, and what are they told
--      when they may not" — was never asked. Every read of `custom.record` is now
--      `custom.read_record` / `custom.read_records`; every `custom.resolve_id` is
--      `custom.record_resolve ->> 'resolves_to'`; every `r.deleted_at is null` is
--      `custom.record_resolve ->> 'live'`; every `history.migration_undo` is
--      `custom.migrate_undo`; every read of `history.migration_log` is `custom.migrations`;
--      every Field row INSERT is `custom.field_declare`; and a field's type is read from
--      `custom.applicable_fields`.
--
--   3. THE FIELDS ARE DECLARED THROUGH THE DOOR, which is what makes PART 2 a real check at
--      all. The old file INSERTed its Field rows straight into `custom.record` — a table
--      privilege no person holds — including the formula whose `config.expr` names
--      `amount_usd` by id and the formula whose `depends_on` names it by key. Both are now
--      `custom.field_declare` calls, so the dependency REC-18 refuses a delete over is one a
--      signed-in person could actually have created.
--
-- WHAT STAYS OUT OF THE SEAT, AND WHY. Each step out is one statement, says so, and asserts
-- no product clause while out:
--   · the Home record — a Home is made by the onboarding path, not by a person's browser.
--   · PART 8's inverse census. `custom.migrations` carries id, verb, target, note, applied_at,
--     applied_by and undone_at, and NOT the inverse: the inverse is the store's own
--     bookkeeping, not something a person reads. The census that every logged Migration
--     carries one is therefore a fact about the store, like C-17's data_class census, and is
--     taken out of the seat. What a PERSON can do with an inverse is asserted in the seat, by
--     executing undos and reading the restored rows back (PARTS 5, 7 and 8).
--   · PART 9's back-dating of `deleted_at`. Nothing lets a person say a record was deleted 400
--     days ago, and that is correct; the purge it makes reachable is asked from the seat.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3):
--   · drop the by-id arm of `custom.field_dependants`   → PART 2 (a), the verifier's case
--   · drop the by-key arm                               → PART 2 (a)'s second dependant
--   · take the Home check out of `custom.migrate_delete` → PART 3
--   · stop passing the containment children to the one delete verb → PART 4
--   · have `custom.migrate_merge` write the alias AFTER the delete → PART 5 (a)
--   · have `custom.migrate_split` create two new ids    → PART 6
--   · have `custom.migrate_retype` write a new row      → PART 7's "kept the id"
--   · let `custom.migrate_purge` ignore retention        → PART 9
--   · let any verb write before `history.migration_record` → every undo in PARTS 5-8
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE: every refusal below is paired with the same
-- act succeeding (a Field nothing reads; a Home whose Table cascades; a purge past retention
-- beside one inside it), and every undo is EXECUTED and the restored rows READ BACK THROUGH
-- THE READ DOOR.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_inv     uuid;
  v_person  uuid;
  v_widget  uuid;
  v_f_amt   uuid;
  v_f_tax   uuid;
  v_f_key   uuid;
  v_f_lonely uuid;
  v_f_phone uuid;
  v_homerec uuid;
  v_tbl_at_home uuid;
  v_w1      uuid;
  v_serial  uuid;
  v_serial2 uuid;
  v_chen1   uuid;
  v_chen2   uuid;
  v_p1      uuid;
  v_p2      uuid;
  v_rec     uuid;
  v_new     uuid;
  v_res     jsonb;
  v_log     uuid;
  v_msg     text;
  v_txt     text;
  v_n       integer;
  v_tid     uuid;
  v_verbs   text;
  v_boss    text := current_user;   -- the connected role, for the steps no client door covers
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'w3_mig_c18.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  -- WHO IS WRITING. `platform.associations` refuses an automated write that does not name the
  -- system doing it, and the store reaches that table on every containment write.
  perform set_config('app.actor_system', 'campaign-test/w3_mig_c18', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Fairhaven Steelworks — Fabrication Shop', 'fairhaven-steelworks-fab-' || substr(v_org::text, 1, 8), 'FHS', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- And the store answers a person only where it is switched on.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w3_mig_c18');

  -- A Home record has no client door of its own; it is built as the connected role, before
  -- the seat is taken.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

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
  begin
    perform 1 from history.migration_log limit 1;
    raise exception '0: this seat can read history.migration_log directly, and a person reads the Migration log through custom.migrations';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and neither custom.record nor history.migration_log is readable from it.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 1 — ALL TEN VERBS EXIST, by name. A census, not a promise.
  -- ══════════════════════════════════════════════════════════════════════════
  -- The catalogue IS readable from the seat, so this stays in it — and it now asks a second
  -- question the old file could not: that a signed-in person may actually CALL all ten. A verb
  -- that exists and holds no client grant is a verb no person has (the T9 class).
  select string_agg(p.proname, ',' order by p.proname) into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname like 'migrate\_%'
     and p.proname <> 'migrate_undo';
  if v_txt is distinct from 'migrate_delete,migrate_demote,migrate_extract_parent,migrate_merge,migrate_promote,migrate_purge,migrate_rename,migrate_reparent,migrate_retype,migrate_split' then
    raise exception 'C-18 (1): the Migration verbs on this database are "%", and there are ten', coalesce(v_txt, 'none');
  end if;
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname like 'migrate\_%' and p.proname <> 'migrate_undo'
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_n <> 0 then
    raise exception 'C-18 (1): % of the ten Migration verbs cannot be called by a signed-in person at all', v_n;
  end if;
  raise notice 'PART 1 — REC-20: ten verbs, by name, and every one of them callable from the seat: %', v_txt;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE — three Tables and their columns, every one through the door.
  -- ══════════════════════════════════════════════════════════════════════════
  v_inv := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG Invoice', 'slug', 'w3_mig_invoice', 'type', 'entity',
    'label_singular', 'Invoice', 'label_plural', 'Invoices', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'),
                                jsonb_build_object('name','amount_usd'),
                                jsonb_build_object('name','amount_with_tax'),
                                jsonb_build_object('name','amount_rounded'),
                                jsonb_build_object('name','memo')),
    'parent_id', v_home::text));

  v_person := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG Person', 'slug', 'w3_mig_person', 'type', 'entity',
    'label_singular', 'Person', 'label_plural', 'People', 'title_field', 'person_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','person_name'),
                                jsonb_build_object('name','phone')),
    'parent_id', v_home::text));

  v_widget := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG Widget', 'slug', 'w3_mig_widget', 'type', 'entity',
    'label_singular', 'Widget', 'label_plural', 'Widgets', 'title_field', 'person_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','person_name')),
    'parent_id', v_home::text));

  perform custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));

  v_f_amt := custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','amount_usd','label','Amount USD','type','number','sort',20,
    'config', '{"kind":"number"}'::jsonb));

  -- THE VERIFIER'S EXACT CASE, and it is now a field a PERSON could have made: a formula whose
  -- `config.expr` reads amount_usd BY ID.
  v_f_tax := custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','amount_with_tax','label','Amount with tax','type','formula','sort',30,
    'compute_on','write',
    'expr', jsonb_build_object('op','mul',
              'args', jsonb_build_array(jsonb_build_object('field', v_f_amt::text),
                                        jsonb_build_object('const', 1.2)))));

  -- THE SECOND WAY a dependency is written here: by KEY, in depends_on.
  v_f_key := custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','amount_rounded','label','Amount rounded','type','formula','sort',40,
    'compute_on','write',
    'config', '{"expression":"round(amount_usd)"}'::jsonb,
    'expr', jsonb_build_object('op','round',
              'args', jsonb_build_array(jsonb_build_object('field', v_f_amt::text))),
    'depends_on', jsonb_build_array('amount_usd')));

  -- The CONTROL: a Field nothing reads.
  v_f_lonely := custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','memo','label','Memo','plain','text','sort',50));

  perform custom.field_declare(v_org, v_person, jsonb_build_object(
    'key','person_name','label','Name','plain','text','sort',10));
  v_f_phone := custom.field_declare(v_org, v_person, jsonb_build_object(
    'key','phone','label','Phone','plain','text','sort',20));
  perform custom.field_declare(v_org, v_widget, jsonb_build_object(
    'key','person_name','label','Name','plain','text','sort',10));

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 2 — REC-18 / T7. THE REQUIRED INPUT OF THIS LANE'S EXIT.
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.field_dependants(v_org, v_f_amt);
  if v_n < 2 then
    raise exception 'C-18 (2a): amount_usd is read by a formula by id AND by another by name, and field_dependants found % of them', v_n;
  end if;

  begin
    perform custom.migrate_delete(v_org, v_f_amt);
    raise exception 'C-18 (2a) — THE VERIFIER''S CASE IS STILL OPEN: amount_usd deleted although amount_with_tax reads it';
  exception when foreign_key_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'Amount with tax' then
      raise exception 'C-18 (2a): the refusal did not name the formula that reads it by id — "%"', v_msg;
    end if;
    if v_msg !~ 'Amount rounded' then
      raise exception 'C-18 (2a): the refusal named the by-id dependant and not the by-name one — "%"', v_msg;
    end if;
  end;

  -- (b) THE CONTROL. A Field nothing reads deletes cleanly, through the same verb, and the
  --     READ DOOR says so — `custom.record_resolve` is where a person asks whether an id is
  --     still live, because they may not read `deleted_at` off the row.
  v_res := custom.migrate_delete(v_org, v_f_lonely);
  if (custom.record_resolve(v_org, v_f_lonely) ->> 'live')::boolean then
    raise exception 'C-18 (2b): the control field was not deleted';
  end if;
  raise notice 'PART 2 — REC-18 / T7: amount_usd refused, naming BOTH "Amount with tax" (by id) and "Amount rounded" (by name); a field nothing reads deleted cleanly on migration %.',
               v_res ->> 'migration_id';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 3 — REC-13. Deleting a Home is refused BY DEFAULT, naming the Tables.
  -- ══════════════════════════════════════════════════════════════════════════
  v_homerec := custom.record_write(v_org, v_widget, jsonb_build_object('person_name', 'Project Y'));
  v_tbl_at_home := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG Incident', 'slug', 'w3_mig_incident', 'type', 'entity',
    'label_singular', 'Incident', 'label_plural', 'Incidents', 'title_field', 'person_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','person_name')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl_at_home, jsonb_build_object(
    'key','person_name','label','Name','plain','text','sort',10));
  perform custom.home_add(v_org, v_tbl_at_home, v_homerec);

  begin
    perform custom.migrate_delete(v_org, v_homerec);
    raise exception 'C-18 (3): Project Y was deleted although Incident lives there';
  exception when foreign_key_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'Incident' then
      raise exception 'C-18 (3): the refusal did not name the table that lives there — "%"', v_msg;
    end if;
  end;

  -- THE CONTROL: the same Home, the same verb, once the Table says cascade.
  perform custom.record_update(v_org, v_tbl_at_home, jsonb_build_object('on_delete', 'cascade'));
  v_res := custom.migrate_delete(v_org, v_homerec);
  if (custom.record_resolve(v_org, v_homerec) ->> 'live')::boolean then
    raise exception 'C-18 (3) control: the Home was still not deleted after its Table said cascade';
  end if;
  raise notice 'PART 3 — REC-13 / T7: deleting a Home is refused by DEFAULT naming "W3-MIG Incident"; the same delete goes through once that table declares cascade.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 4 — REC-12 / T7. Containment cascades through the ONE delete verb.
  -- ══════════════════════════════════════════════════════════════════════════
  v_w1 := custom.record_write(v_org, v_widget, jsonb_build_object('person_name', 'Widget'));
  v_serial := custom.record_write(v_org, v_widget,
                jsonb_build_object('person_name', 'SN-0001', 'parent_id', v_w1::text));
  v_serial2 := custom.record_write(v_org, v_widget,
                jsonb_build_object('person_name', 'SN-0002', 'parent_id', v_w1::text));

  v_res := custom.migrate_delete(v_org, v_w1);
  if coalesce((v_res ->> 'cascaded')::integer, 0) < 2 then
    raise exception 'C-18 (4): deleting Widget took % of its contained records', v_res ->> 'cascaded';
  end if;
  v_n := 0;
  if not (custom.record_resolve(v_org, v_w1)     ->> 'live')::boolean then v_n := v_n + 1; end if;
  if not (custom.record_resolve(v_org, v_serial) ->> 'live')::boolean then v_n := v_n + 1; end if;
  if not (custom.record_resolve(v_org, v_serial2)->> 'live')::boolean then v_n := v_n + 1; end if;
  if v_n <> 3 then
    raise exception 'C-18 (4): % of the three rows are deleted', v_n;
  end if;
  raise notice 'PART 4 — REC-12 / T7: deleting Widget took its % contained records with it, every one through custom.record_delete, and all three read back as not live on custom.record_resolve. Migration %.',
               v_res ->> 'cascaded', v_res ->> 'migration_id';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 5 — T5 / REC-21. Two Chens, a parent extracted from each, then merged.
  -- ══════════════════════════════════════════════════════════════════════════
  v_chen1 := custom.record_write(v_org, v_person,
               jsonb_build_object('person_name', 'Chen', 'phone', '555-0001'));
  v_chen2 := custom.record_write(v_org, v_person,
               jsonb_build_object('person_name', 'Chen', 'phone', '555-0002'));

  v_res := custom.migrate_extract_parent(v_org, v_chen1, v_person, array['person_name','phone']);
  v_p1 := (v_res ->> 'parent')::uuid;
  v_res := custom.migrate_extract_parent(v_org, v_chen2, v_person, array['person_name','phone']);
  v_p2 := (v_res ->> 'parent')::uuid;
  if v_p1 is null or v_p2 is null or v_p1 = v_p2 then
    raise exception 'T5: extracting a parent from each Chen produced % and %', v_p1, v_p2;
  end if;

  v_res := custom.migrate_merge(v_org, v_p1, v_p2, 'the two Chens are one person');
  v_log := (v_res ->> 'migration_id')::uuid;

  -- (a) THE LOSING ID RESOLVES TO THE WINNER, FOREVER — asked through `custom.record_resolve`,
  --     which is the person's version of `custom.resolve_id` (that one holds no client grant).
  --     The door also SAYS it redirected, which is the half a person reads on the screen.
  if (custom.record_resolve(v_org, v_p2) ->> 'resolves_to')::uuid <> v_p1 then
    raise exception 'REC-21 (a): the losing id resolves to %, and the winner is %',
                    custom.record_resolve(v_org, v_p2) ->> 'resolves_to', v_p1;
  end if;
  if not (custom.record_resolve(v_org, v_p2) ->> 'redirected')::boolean then
    raise exception 'REC-21 (a): the door resolved the losing id and did not tell the person it had redirected them';
  end if;
  -- An id that was never merged resolves to itself, so every caller may ask.
  if (custom.record_resolve(v_org, v_chen1) ->> 'resolves_to')::uuid <> v_chen1 then
    raise exception 'REC-21 (a) second input: an id that was never aliased did not resolve to itself';
  end if;

  -- (b) BOTH NOTE SETS ARE REACHABLE through the surviving Person — counted off the read door's
  --     own answer for the table, not off custom.record.
  select count(*) into v_n from custom.read_records(v_org, v_person, true, 200, 0) r
   where nullif(r.document ->> 'parent_id', '')::uuid = v_p1;
  if v_n < 2 then
    raise exception 'T5 (b): % of the two Chens hang off the surviving Person', v_n;
  end if;

  -- (c) THE TWO PHONE NUMBERS ARE ALTERNATES, AND THE DOOR SAYS WHERE THE SECOND CAME FROM.
  --     The stored shape interns the source — the alternate holds a pointer and `_sources`
  --     holds the description — but a person never sees that: `custom.read_record` resolves it
  --     and hands back `_alternates` as `{value, rank, source:{id, kind}}`. The door's answer
  --     IS the product truth, so that is what this asserts.
  v_res := custom.read_record(v_org, v_p1, true);
  if jsonb_array_length(coalesce(v_res -> '_alternates' -> 'phone', '[]'::jsonb)) < 1 then
    raise exception 'T5 (c): the losing Person''s phone number is not an alternate on the winner — the read door answered %',
                    coalesce((v_res -> '_alternates')::text, 'no _alternates at all');
  end if;
  v_txt := v_res -> '_alternates' -> 'phone' -> 0 -> 'source' ->> 'id';
  if v_txt is distinct from v_p2::text then
    raise exception 'T5 (c): the alternate does not say where it came from — "%"', coalesce(v_txt, 'nothing');
  end if;

  -- (d) UNDO RESTORES BOTH PERSONS AND BOTH IDS. It is EXECUTED, through the person's own undo
  --     door, and read back through the read door.
  perform custom.migrate_undo(v_org, v_log);
  if not (custom.record_resolve(v_org, v_p2) ->> 'live')::boolean then
    raise exception 'T5 (d): undoing the merge did not bring the losing Person back';
  end if;
  raise notice 'PART 5 — T5 / REC-21: two Chens, a Person extracted from each, merged; the losing id resolves to the winner and the door says it redirected, the second phone number comes back off custom.read_record as an alternate carrying its source, and custom.migrate_undo brought both Persons and both ids back.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 6 — REC-22. On split, ONE SIDE KEEPS THE ID.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_person,
             jsonb_build_object('person_name', 'Split me', 'phone', '555-9999'));
  v_res := custom.migrate_split(v_org, v_rec, array['phone']);
  v_new := (v_res ->> 'new_record')::uuid;

  if (v_res ->> 'kept_the_id')::uuid <> v_rec then
    raise exception 'REC-22: the id that was kept is %, and it should be %', v_res ->> 'kept_the_id', v_rec;
  end if;
  if (custom.record_resolve(v_org, v_rec) ->> 'resolves_to')::uuid <> v_rec then
    raise exception 'REC-22: the old id now resolves to %, and it should still be itself',
                    custom.record_resolve(v_org, v_rec) ->> 'resolves_to';
  end if;
  v_txt := custom.read_record(v_org, v_rec, true) ->> 'phone';
  if v_txt is not null then
    raise exception 'REC-22: the moved key is still on the keeper — "%"', v_txt;
  end if;
  v_txt := custom.read_record(v_org, v_new, true) ->> 'phone';
  if v_txt <> '555-9999' then
    raise exception 'REC-22: the split-off side did not get the moved value — "%"', coalesce(v_txt, 'nothing');
  end if;
  raise notice 'PART 6 — REC-22: split kept the id % and moved phone to the new record %; the old id still resolves to itself, and both sides read back through custom.read_record.', v_rec, v_new;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 7 — T9 / REC-N-18 and T12 / FLD-4. Retype, both arms.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_person,
             jsonb_build_object('person_name', 'Retype me', 'phone', '555-1234'));
  -- No note is passed: the verb's OWN sentence is what a person reads on the log, and that is
  -- what has to carry the reason. A caller's note would mask it.
  v_res := custom.migrate_retype(v_org, v_rec, 'w3_mig_widget');
  v_log := (v_res ->> 'migration_id')::uuid;

  -- THE ID DOES NOT CHANGE, which is the whole verb.
  if (v_res ->> 'record_id')::uuid <> v_rec then
    raise exception 'REC-N-18: retype returned a different id';
  end if;
  -- And the record is now ON the target table, read the way a person reads it: it appears in
  -- the target table's rows and no longer in the one it left.
  if not exists (select 1 from custom.read_records(v_org, v_widget, true, 200, 0) r where r.id = v_rec) then
    raise exception 'REC-N-18: the record is not among the target table''s rows after the retype';
  end if;
  if exists (select 1 from custom.read_records(v_org, v_person, true, 200, 0) r where r.id = v_rec) then
    raise exception 'REC-N-18: the record is still among the rows of the table it was retyped away from';
  end if;
  -- The Value the target Table accepts STAYED.
  v_txt := custom.read_record(v_org, v_rec, true) ->> 'person_name';
  if v_txt <> 'Retype me' then
    raise exception 'REC-N-18: the value the target table accepts did not survive — "%"', coalesce(v_txt, 'nothing');
  end if;
  -- The MISFIT went to History WITH THE REASON, and was neither coerced nor deleted.
  if not (v_res -> 'misfits' ? 'phone') then
    raise exception 'REC-N-18: phone is not a misfit of the target table — %', v_res ->> 'misfits';
  end if;
  select m.note into v_txt from custom.migrations(v_org, v_rec) m where m.id = v_log;
  if v_txt !~* 'did not fit' then
    raise exception 'REC-N-18: the Migration log a person reads does not carry the reason — "%"', coalesce(v_txt, 'nothing');
  end if;
  -- AND THE MISFIT IS NOT LOST — proven the only way a person can prove it, by undoing the
  -- Migration and reading the value back. The old file read `history.migration_log.inverse`
  -- directly; no person may do that, and "the inverse holds it" is only worth anything if the
  -- undo actually puts it back.
  perform custom.migrate_undo(v_org, v_log);
  v_txt := custom.read_record(v_org, v_rec, true) ->> 'phone';
  if v_txt <> '555-1234' then
    raise exception 'REC-N-18: undoing the retype did not bring the misfit value back — "%"', coalesce(v_txt, 'nothing');
  end if;
  -- …and the record is on its original table again, so the undo is a real reversal.
  if not exists (select 1 from custom.read_records(v_org, v_person, true, 200, 0) r where r.id = v_rec) then
    raise exception 'REC-N-18: the undo restored the value and left the record on the wrong table';
  end if;
  -- Put it back where the rest of this part expects it.
  v_res := custom.migrate_retype(v_org, v_rec, 'w3_mig_widget');

  -- T12 / FLD-4: a Field's behaviour changes and NOTHING is coerced or deleted. The field's
  -- type is read from `custom.applicable_fields`, which is how a person's screen asks what the
  -- columns of a table are.
  perform custom.migrate_retype(v_org, v_f_phone, 'range');
  select f.data ->> 'type' into v_txt
    from custom.applicable_fields(v_org, v_person, null) f where f.id = v_f_phone;
  if v_txt <> 'range' then
    raise exception 'FLD-4: the field still behaves as "%"', coalesce(v_txt, 'nothing');
  end if;
  v_txt := custom.read_record(v_org, v_chen1, true) ->> 'phone';
  if v_txt <> '555-0001' then
    raise exception 'FLD-4 / T12: the text value on a record was changed by the behaviour change — "%"', coalesce(v_txt, 'nothing');
  end if;
  -- T12's OTHER half, and it is the store working rather than a problem: a NEW write to a
  -- record whose phone is now a range is validated against the range and refused. The value
  -- already there is untouched (asserted above); what changes is what may be written next.
  -- The field goes back to text so the later parts exercise the verbs and not this refusal.
  begin
    perform custom.record_update(v_org, v_chen1, jsonb_build_object('phone', '555-0009'));
    raise exception 'FLD-4: a string was accepted into a field that now behaves as a range';
  exception when check_violation then null;
  end;
  perform custom.migrate_retype(v_org, v_f_phone, 'text');

  raise notice 'PART 7 — T9 / REC-N-18: a record retyped keeps its id %, moves onto the target table''s rows, keeps what fits, carries the reason on the log a person reads, and its misfit phone comes BACK when the Migration is undone. T12 / FLD-4: a field became a range and "555-0001" is still exactly where it was.', v_rec;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 8 — REC-20 / REC-24. Every verb logged, reversible, and atomic.
  -- ══════════════════════════════════════════════════════════════════════════
  -- (a) THE VERBS A PERSON CAN SEE ON THEIR OWN LOG, through `custom.migrations`.
  select string_agg(distinct m.verb, ',' order by m.verb) into v_verbs
    from custom.migrations(v_org, null, 500) m;
  if v_verbs !~ 'delete' or v_verbs !~ 'merge' or v_verbs !~ 'retype'
     or v_verbs !~ 'split' or v_verbs !~ 'extract_parent' then
    raise exception 'REC-20: the verbs on the log a person reads are "%"', v_verbs;
  end if;

  -- (b) AND EVERY ONE OF THEM CARRIES AN INVERSE. `custom.migrations` hands a person id, verb,
  --     target, note, when, who and whether it has been undone — and NOT the inverse, because
  --     the inverse is the store's own bookkeeping rather than something a person reads. So
  --     this census steps OUT of the seat, says so, and asserts nothing about what a person may
  --     do; what a PERSON can do with an inverse is asserted in the seat, by executing undos
  --     and reading the restored rows back (PARTS 5, 7 and below).
  perform set_config('role', v_boss, true);
  select count(*) into v_n from history.migration_log m
   where m.organization_id = v_org and (m.inverse is null or m.inverse = '{}'::jsonb);
  perform set_config('role', 'authenticated', true);
  if v_n <> 0 then
    raise exception 'REC-20: % logged Migrations carry no inverse', v_n;
  end if;

  -- (c) REC-24: the reparent and the containment a Visibility answer reads are ONE commit.
  --     Read it immediately after the verb returns — inside the same transaction, which is the
  --     only place an out-of-band window could be observed at all — and read it the way a
  --     person does: the child now hangs off the new parent in the read door's own answer.
  v_res := custom.migrate_reparent(v_org, v_chen1, v_p1);
  if not exists (select 1 from custom.read_records(v_org, v_person, true, 200, 0) r
                  where r.id = v_chen1 and nullif(r.document ->> 'parent_id','')::uuid = v_p1) then
    raise exception 'REC-24: the containment is not there in the same commit as the reparent';
  end if;
  perform custom.migrate_undo(v_org, (v_res ->> 'migration_id')::uuid);

  -- (d) A rename, undone, and READ BACK.
  v_res := custom.migrate_rename(v_org, v_p1, 'Chen, merged');
  v_txt := custom.read_record(v_org, v_p1, true) ->> 'person_name';
  if v_txt <> 'Chen, merged' then
    raise exception 'REC-20: the rename did not land — "%"', coalesce(v_txt, 'nothing');
  end if;
  perform custom.migrate_undo(v_org, (v_res ->> 'migration_id')::uuid);
  v_txt := custom.read_record(v_org, v_p1, true) ->> 'person_name';
  if v_txt = 'Chen, merged' then
    raise exception 'REC-20: undoing the rename left it renamed';
  end if;
  -- And the log SAYS it was undone, which is the difference between a log and a rewrite.
  if not exists (select 1 from custom.migrations(v_org, v_p1, 500) m
                  where m.verb = 'rename' and m.undone_at is not null) then
    raise exception 'REC-20: the undone rename is not marked undone on the log a person reads';
  end if;

  -- (e) promote / demote, the two verbs that move a Table's storage. `custom.table_storage`
  --     holds no client grant; the Table is a record, so a person reads its storage off the
  --     read door like any other value.
  perform custom.migrate_promote(v_org, v_person);
  if coalesce(nullif(custom.read_record(v_org, v_person, true) ->> 'storage', ''), 'light') <> 'heavy' then
    raise exception 'REC-20: promote left the table on "%"',
                    coalesce(custom.read_record(v_org, v_person, true) ->> 'storage', 'nothing');
  end if;
  perform custom.migrate_demote(v_org, v_person);
  if coalesce(nullif(custom.read_record(v_org, v_person, true) ->> 'storage', ''), 'light') <> 'light' then
    raise exception 'REC-20: demote left the table on "%"',
                    coalesce(custom.read_record(v_org, v_person, true) ->> 'storage', 'nothing');
  end if;
  raise notice 'PART 8 — REC-20 / REC-24: the verbs "%" are on the log a person reads, every logged Migration carries an inverse (0 without), the reparent''s containment is in the read door''s answer in the same commit, an undone rename reads back as "%" and is marked undone, and promote/demote moved the table both ways.',
               v_verbs, custom.read_record(v_org, v_p1, true) ->> 'person_name';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 9 — REC-23. Soft within retention; the purge only after it.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_widget, jsonb_build_object('person_name', 'Purge me'));
  perform custom.migrate_delete(v_org, v_rec);

  -- (a) Inside retention: still here, still reversible. The purge takes nothing, and the
  --     REVERSIBILITY is the clause — `custom.record_restore` is the door a person undoes a
  --     delete with, and it works.
  v_res := custom.migrate_purge(v_org, v_widget, false);
  perform custom.record_restore(v_org, v_rec);
  if not (custom.record_resolve(v_org, v_rec) ->> 'live')::boolean then
    raise exception 'REC-23: the delete was not reversible inside retention';
  end if;

  -- (b) SECOND INPUT: past retention, the same call destroys it — and the proof a PERSON can
  --     make is that the reversibility (a) just demonstrated is GONE. A purged id and a
  --     soft-deleted id both read back as "not live" on `custom.record_resolve`; only
  --     `custom.record_restore` tells them apart, because a row that is no longer there cannot
  --     be brought back. Nothing lets a person say a record was deleted 400 days ago, and that
  --     is correct — so the back-dating is one operator statement, out of the seat, asserting
  --     nothing. Both the purge and the attempted restore are asked from the seat.
  perform custom.migrate_delete(v_org, v_rec);
  perform set_config('role', v_boss, true);
  update custom.record set deleted_at = now() - interval '400 days'
   where organization_id = v_org and id = v_rec;
  perform set_config('role', 'authenticated', true);

  v_res := custom.migrate_purge(v_org, v_widget, false);
  if coalesce((v_res ->> 'rows_purged')::bigint, 0) < 1 then
    raise exception 'REC-23: a record deleted 400 days ago survived the purge — %', v_res::text;
  end if;
  v_msg := null;
  begin
    perform custom.record_restore(v_org, v_rec);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'REC-23: a record destroyed by the purge was still restored, so the purge did not destroy it';
  end if;

  -- (c) AND THE ONE THING A PURGE NEVER TAKES: an id that still resolves to a record. This
  --     needs a merge that is STILL IN FORCE — PART 5's was undone, so its alias is gone and
  --     asking about it would prove nothing. Two fresh Widgets are merged here, the loser is
  --     back-dated past retention, and the purge is asked for the whole table.
  v_w1 := custom.record_write(v_org, v_widget, jsonb_build_object('person_name', 'Forever winner'));
  v_serial := custom.record_write(v_org, v_widget, jsonb_build_object('person_name', 'Forever loser'));
  perform custom.migrate_merge(v_org, v_w1, v_serial, 'REC-21: the losing id answers forever');
  perform set_config('role', v_boss, true);
  update custom.record set deleted_at = now() - interval '400 days'
   where organization_id = v_org and id = v_serial;
  perform set_config('role', 'authenticated', true);
  perform custom.migrate_purge(v_org, v_widget, false);
  if (custom.record_resolve(v_org, v_serial) ->> 'resolves_to')::uuid <> v_w1 then
    raise exception 'REC-21 / REC-23: after the purge the merged-away id resolves to %, and the winner is %',
                    custom.record_resolve(v_org, v_serial) ->> 'resolves_to', v_w1;
  end if;
  -- …and the row itself is still there, which is what "never purged" means: it can still be
  -- brought back, four hundred days past a retention of three hundred and sixty-five.
  perform custom.record_restore(v_org, v_serial);
  if not (custom.record_resolve(v_org, v_serial) ->> 'live')::boolean then
    raise exception 'REC-21 / REC-23: the merge loser was purged, so its id stopped resolving forever';
  end if;
  raise notice 'PART 9 — REC-23: a delete inside retention survived the purge and was restored; the same record past retention was destroyed (% row(s)) and can no longer be restored at all; and a merge loser four hundred days past a three-hundred-and-sixty-five-day retention was NOT purged and still answers with its winner, so REC-21''s "forever" outlives retention.',
               v_res ->> 'rows_purged';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 10 — AND NONE OF IT IS A PLAIN MEMBER'S TO DO.
  -- ══════════════════════════════════════════════════════════════════════════
  -- Every verb above was run by the organization's owner. `test@test.com` is a plain member who
  -- was shared nothing, so a structural change is refused her — paired with ONE thing she CAN
  -- do, so the clause is not satisfied by a door that refuses her everything.
  perform custom.share_grant(v_org, v_chen1, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_msg := null;
  begin
    perform custom.migrate_rename(v_org, v_chen1, 'Renamed by a viewer');
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'C-18 (10): a plain member holding a record at VIEWER renamed it';
  end if;
  v_msg := null;
  begin
    perform custom.migrate_delete(v_org, v_chen2);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'C-18 (10): a plain member deleted a record that was never shared with her';
  end if;
  -- THE CONTROL: the record she WAS shared reads back for her.
  if (custom.read_record(v_org, v_chen1, true) ->> 'person_name') is null then
    raise exception 'C-18 (10) control: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'PART 10 — a plain member is refused a rename of a record she holds at viewer and a delete of one she does not hold at all, and still reads the record she was shared.';

  raise notice '════ C-18 GREEN — ten verbs, REC-12, REC-13, REC-18, REC-20…REC-24, REC-N-18, FLD-4, and T5, T7, T9 and T12, on the MAIN database, every asserted product clause from the seat `authenticated`. Rolling back. ════';
end;
$t$;

rollback;
