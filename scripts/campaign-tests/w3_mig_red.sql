-- W3-MIG — THE RED TWIN of `scripts/campaign-tests/w3_mig_c18.sql`.
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. This file turns THIS
-- LANE'S enforcement points off, one at a time, inside ONE transaction that ROLLS BACK, and
-- asserts that each thing C-18 relies on DISAPPEARS — and, where the failure is silent rather
-- than loud, that THE WRONG THING IS ACTUALLY DONE TO A PERSON'S DATA.
--
-- 🚨 RE-POINTED AND SEATED (lane ORG-DELETE, 2026-09-19), to agree with its green twin.
--
--   1. IT RUNS ON THE MAIN DATABASE, on a disposable organization of its own, exactly like
--      `w3_mig_c18.sql`. It used to refuse to run anywhere but the rehearsal branch, where the
--      store it measured was not the store anybody uses.
--
--   2. EVERY OBSERVATION IS MADE FROM THE SEAT `authenticated`, THROUGH THE DOORS A SIGNED-IN
--      PERSON REACHES. "The guard is gone" is a fact about a function body; "a person's record
--      was destroyed / deleted / left orphaned / answered with a dead id" is the defect. So
--      every arm below asks `custom.migrate_delete`, `custom.migrate_purge`,
--      `custom.migrate_rename`, `custom.field_dependants`, `custom.record_resolve`,
--      `custom.record_restore`, `custom.read_record`, `custom.read_records` and
--      `custom.migrations` — never `custom.record`, `custom.resolve_id` or
--      `history.migration_log`, which no person may reach.
--
--   3. THE FIXTURE IS BUILT THROUGH THE DOORS. The Field rows the old file INSERTed straight
--      into `custom.record` — including the formula that reads `amount_usd` by id — are
--      `custom.field_declare` calls, so the dependency RED 1 takes away is one a signed-in
--      person could really have created.
--
--   4. RED 6 IS SPLIT AND RE-AIMED, because the store has a SECOND wall the branch file walked
--      straight past. `custom._store_door` refuses a hard DELETE of any row still inside its
--      Table's retention, whoever asks. So taking the cutoff out of `custom.migrate_purge` does
--      not destroy a fresh record — it makes the person meet a 42501 from the store's last wall
--      instead of the quiet "nothing to purge" the door gives them. That is asserted as what it
--      is. The half that DOES destroy data is the alias check: a merged-away loser past
--      retention is hard-deleted although its id is supposed to answer forever, and that is
--      asserted by the only means a person has — the row can no longer be restored.
--
-- WHAT IS DONE OUT OF THE SEAT, AND WHY. A weakening is DDL, and no signed-in person may do
-- DDL; that is the point of a seat. Every weakening and every restore steps out with
-- `perform set_config('role', v_boss, true)`, does the one operator statement, and steps back.
-- NO CLAUSE IS ASSERTED WHILE OUT. The same rule covers the Home record and the back-dating of
-- `deleted_at`, which nothing lets a person do.
--
-- EVERY ARM PUTS BACK WHAT IT TOOK, by re-executing the definition it captured with
-- `pg_get_functiondef`. The transaction rolls back anyway; the restore is so that arm N+1
-- measures the store as it is rather than as arm N left it — and so that a weakened
-- SECURITY DEFINER door does not sit under the next arm's own client call.
--
--   RED 1 — REC-18, and it is the verifier's own case. `custom.field_dependants` loses its
--           by-id arm, and the door a person's "delete this field" screen asks stops naming
--           `Amount with tax` although its formula reads `amount_usd` by id.
--   RED 2 — REC-18's second arm. The by-key arm goes too, and `custom.migrate_delete` then
--           DELETES `amount_usd` for the person although two formulas read it.
--   RED 3 — REC-13. `custom.tables_at_home` stops answering, so `custom.migrate_delete` takes
--           Project Y out from under the Table that lives there.
--   RED 4 — REC-12. The containment cascade goes, and deleting Widget leaves its serial number
--           alive with a parent the person can no longer open — the silent half, counted.
--   RED 5 — REC-21. `custom.resolve_id` stops following the alias, so `custom.record_resolve`
--           hands the person back the dead id and says it did NOT redirect them.
--   RED 6 — REC-23 / REC-21. `custom.migrate_purge` loses its retention cutoff and its alias
--           check: a fresh delete now ends in a 42501 from the store's last wall instead of a
--           quiet no-op, and a merged-away loser past retention is destroyed for good.
--   RED 7 — HIS-8 / REC-20. A verb writes before it logs: `custom.migrate_rename` renames
--           first and records nothing, so the person sees the new name and `custom.migrations`
--           has no entry to undo.
--
-- IT IS NOT A MIGRATION: outside `migrations/`, no sweep can see it, and it ROLLS BACK.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w3_mig_red.sql

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';

do $r$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_inv     uuid;
  v_widget  uuid;
  v_purge1  uuid;
  v_purge2  uuid;
  v_f_amt   uuid;
  v_homerec uuid;
  v_tbl_at_home uuid;
  v_w1      uuid;
  v_s1      uuid;
  v_a       uuid;
  v_b       uuid;
  v_rec     uuid;
  v_res     jsonb;
  v_txt     text;
  v_msg     text;
  v_def     text;
  v_n       integer;
  v_boss    text := current_user;   -- the connected role, for the operator statements
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'w3_mig_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  perform set_config('app.actor_system', 'campaign-test/w3_mig_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Fairhaven Steelworks — Paint Shop', 'fairhaven-steelworks-paint-' || substr(v_org::text, 1, 8), 'FHS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w3_mig_red');

  -- A Home record has no client door of its own.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Every observation below this line is a person's.
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
  -- THE FIXTURE — every Table and every column through the doors.
  -- ══════════════════════════════════════════════════════════════════════════
  v_inv := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG RED Invoice', 'slug', 'w3_mig_red_invoice', 'type', 'entity',
    'label_singular', 'Invoice', 'label_plural', 'Invoices', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'),
                                jsonb_build_object('name','amount_usd'),
                                jsonb_build_object('name','amount_with_tax'),
                                jsonb_build_object('name','amount_rounded')),
    'parent_id', v_home::text));

  v_widget := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG RED Widget', 'slug', 'w3_mig_red_widget', 'type', 'entity',
    'label_singular', 'Widget', 'label_plural', 'Widgets', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name')),
    'parent_id', v_home::text));

  perform custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));
  v_f_amt := custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','amount_usd','label','Amount USD','type','number','sort',20,
    'config', '{"kind":"number"}'::jsonb));
  perform custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','amount_with_tax','label','Amount with tax','type','formula','sort',30,
    'compute_on','write',
    'expr', jsonb_build_object('op','mul',
              'args', jsonb_build_array(jsonb_build_object('field', v_f_amt::text),
                                        jsonb_build_object('const', 1.2)))));
  perform custom.field_declare(v_org, v_inv, jsonb_build_object(
    'key','amount_rounded','label','Amount rounded','type','formula','sort',40,
    'compute_on','write',
    'config', '{"expression":"round(amount_usd)"}'::jsonb,
    'expr', jsonb_build_object('op','round',
              'args', jsonb_build_array(jsonb_build_object('field', v_f_amt::text))),
    'depends_on', jsonb_build_array('amount_usd')));
  perform custom.field_declare(v_org, v_widget, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));

  -- GREEN FIRST, from the seat, so a red that was already red cannot be mistaken for a guard
  -- working.
  select count(*) into v_n from custom.field_dependants(v_org, v_f_amt);
  if v_n < 2 then
    raise exception 'RED 1/2 precondition: the door found % dependants of amount_usd before anything was weakened', v_n;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 1 and RED 2 — REC-18. The two arms, taken away one at a time.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom.field_dependants(uuid,uuid)'::regprocedure) into v_def;
  create or replace function custom.field_dependants(p_organization_id uuid, p_field_id uuid)
  returns table(kind text, dependant_id uuid, label text, how text)
  language plpgsql stable security definer set search_path to 'pg_catalog' as $red$
  declare v_key text; v_table uuid;
  begin
    select f.data ->> 'key', nullif(f.data ->> 'entity_definition_id','')::uuid
      into v_key, v_table from custom.record f
     where f.organization_id = p_organization_id and f.id = p_field_id and f.data_class = 'field';
    if v_key is null then return; end if;
    -- THE WEAKENING: only the by-key arm survives.
    return query
    select 'field', r.id,
           coalesce(nullif(r.data ->> 'label',''), r.data ->> 'key', r.id::text),
           'reads it by name in depends_on'
      from custom.record r
     where r.organization_id = p_organization_id and r.deleted_at is null
       and r.data_class = 'field' and r.id <> p_field_id
       and nullif(r.data ->> 'entity_definition_id','')::uuid is not distinct from v_table
       and exists (select 1 from jsonb_array_elements_text(coalesce(r.data -> 'depends_on','[]'::jsonb)) d
                    where d = v_key);
  end;
  $red$;
  perform set_config('role', 'authenticated', true);

  select string_agg(d.label, ', ') into v_txt from custom.field_dependants(v_org, v_f_amt) d;
  if v_txt ~ 'Amount with tax' then
    raise exception 'RED 1 did not go red: the by-id dependant is still found';
  end if;
  raise notice 'RED 1 — field_dependants loses its by-id arm: the door a person''s delete screen asks now says amount_usd is used only by "%". "Amount with tax", which reads it BY ID in config.expr, has vanished — the verifier''s exact measurement, on demand.', v_txt;

  perform set_config('role', v_boss, true);
  create or replace function custom.field_dependants(p_organization_id uuid, p_field_id uuid)
  returns table(kind text, dependant_id uuid, label text, how text)
  language plpgsql stable security definer set search_path to 'pg_catalog' as $red$
  begin
    return;            -- THE WEAKENING: nothing depends on anything.
  end;
  $red$;
  perform set_config('role', 'authenticated', true);

  -- And now the delete LANDS FOR THE PERSON, which is the whole point.
  v_res := custom.migrate_delete(v_org, v_f_amt);
  if (custom.record_resolve(v_org, v_f_amt) ->> 'live')::boolean then
    raise exception 'RED 2 did not go red: amount_usd was still refused';
  end if;
  raise notice 'RED 2 — both arms gone: a person DELETED amount_usd on migration %, although two formulas read it. T7''s refusal, and this lane''s required exit input, disappear together.',
               v_res ->> 'migration_id';
  perform custom.record_restore(v_org, v_f_amt);

  perform set_config('role', v_boss, true);
  execute v_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 3 — REC-13. The Home stops being asked.
  -- ══════════════════════════════════════════════════════════════════════════
  v_homerec := custom.record_write(v_org, v_widget, jsonb_build_object('client_name', 'Project Y'));
  v_tbl_at_home := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG RED Incident', 'slug', 'w3_mig_red_incident', 'type', 'entity',
    'label_singular', 'Incident', 'label_plural', 'Incidents', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl_at_home, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));
  perform custom.home_add(v_org, v_tbl_at_home, v_homerec);

  -- GREEN FIRST: with the reader working, the person is refused and told which Table.
  begin
    perform custom.migrate_delete(v_org, v_homerec);
    raise exception 'RED 3 precondition: Project Y was already deletable with a Table living there';
  exception when foreign_key_violation then null;
  end;

  -- The refusal lives in custom.migrate_delete's Home block, which asks
  -- custom.tables_at_home. Making that reader answer "nothing lives here" is the weakening.
  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom.tables_at_home(uuid,uuid[])'::regprocedure) into v_def;
  create or replace function custom.tables_at_home(p_organization_id uuid, p_home_ids uuid[])
  returns table(table_id uuid, home_record_id uuid, kind text)
  language sql stable security definer set search_path to 'pg_catalog' as $red$
    select null::uuid, null::uuid, null::text where false;
  $red$;
  perform set_config('role', 'authenticated', true);

  perform custom.migrate_delete(v_org, v_homerec);
  if (custom.record_resolve(v_org, v_homerec) ->> 'live')::boolean then
    raise exception 'RED 3 did not go red: Project Y was still refused';
  end if;
  if not (custom.record_resolve(v_org, v_tbl_at_home) ->> 'live')::boolean then
    raise exception 'RED 3: the Incident table went with the Home, so nothing was left behind';
  end if;
  raise notice 'RED 3 — the Home link gone: a person deleted Project Y and the Incident table that declares it home is STILL LIVE, pointing at a Home that is in the trash. REC-13''s default refusal, with the table named, disappears.';

  perform set_config('role', v_boss, true);
  execute v_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 4 — REC-12. The containment cascade, and the orphans it leaves.
  -- ══════════════════════════════════════════════════════════════════════════
  v_w1 := custom.record_write(v_org, v_widget, jsonb_build_object('client_name', 'Widget'));
  v_s1 := custom.record_write(v_org, v_widget,
            jsonb_build_object('client_name', 'SN-0001', 'parent_id', v_w1::text));

  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom.containment_edges(uuid)'::regprocedure) into v_def;
  create or replace function custom.containment_edges(p_organization_id uuid)
  returns table(parent_id uuid, child_id uuid, via text)
  language sql stable set search_path to '' as $red$
    select null::uuid, null::uuid, null::text where false;   -- nothing contains anything
  $red$;
  perform set_config('role', 'authenticated', true);

  v_res := custom.migrate_delete(v_org, v_w1);
  if coalesce((v_res ->> 'cascaded')::integer, 0) <> 0 then
    raise exception 'RED 4 did not go red: % records still cascaded', v_res ->> 'cascaded';
  end if;
  if not (custom.record_resolve(v_org, v_s1) ->> 'live')::boolean then
    raise exception 'RED 4 did not go red: the serial number went anyway';
  end if;
  -- AND THE PERSON IS LOOKING AT IT. The orphan is still in the table's rows, pointing at a
  -- parent that is in the trash.
  if not exists (select 1 from custom.read_records(v_org, v_widget, true, 200, 0) r
                  where r.id = v_s1 and nullif(r.document ->> 'parent_id','')::uuid = v_w1) then
    raise exception 'RED 4: the serial number is not in the person''s list of rows, so the orphan is not visible at all';
  end if;
  raise notice 'RED 4 — the containment cascade gone: Widget was deleted and its serial number is STILL LIVE in the person''s own row list, with a parent_id pointing at a record in the trash. Nothing raised; T7''s 500 contained records would simply be left behind.';

  perform set_config('role', v_boss, true);
  execute v_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 5 — REC-21. A dead id, answering confidently.
  -- ══════════════════════════════════════════════════════════════════════════
  v_a := custom.record_write(v_org, v_widget, jsonb_build_object('client_name', 'Winner'));
  v_b := custom.record_write(v_org, v_widget, jsonb_build_object('client_name', 'Loser'));
  perform custom.migrate_merge(v_org, v_a, v_b, 'RED 5: two into one');
  if (custom.record_resolve(v_org, v_b) ->> 'resolves_to')::uuid <> v_a then
    raise exception 'RED 5 precondition: the alias did not resolve before it was weakened';
  end if;

  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom.resolve_id(uuid,uuid)'::regprocedure) into v_def;
  create or replace function custom.resolve_id(p_organization_id uuid, p_id uuid)
  returns uuid language sql stable set search_path to 'pg_catalog' as $red$
    select p_id;          -- THE WEAKENING: every id resolves to itself
  $red$;
  perform set_config('role', 'authenticated', true);

  v_res := custom.record_resolve(v_org, v_b);
  if (v_res ->> 'resolves_to')::uuid <> v_b then
    raise exception 'RED 5 did not go red';
  end if;
  if (v_res ->> 'redirected')::boolean then
    raise exception 'RED 5 partial: the id resolved to itself and the door still said it redirected';
  end if;
  raise notice 'RED 5 — resolve_id stops following the alias: custom.record_resolve hands the person back the merged-away id % as its own record, says "%" and says it did NOT redirect them. REC-21''s "forever" becomes a confident answer to a dead link.',
               v_b, v_res ->> 'says';

  perform set_config('role', v_boss, true);
  execute v_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 6 — REC-23 and REC-21. Retention ignored, and the alias check with it.
  -- ══════════════════════════════════════════════════════════════════════════
  -- Two Tables of its own, because with the cutoff gone the weakened purge sweeps EVERY
  -- deleted row of the table it is given, and the arms below need to be told apart.
  v_purge1 := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG RED Fresh', 'slug', 'w3_mig_red_fresh', 'type', 'entity',
    'label_singular', 'Fresh', 'label_plural', 'Freshes', 'title_field', 'client_name',
    'display', 'list', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_purge1, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));
  v_purge2 := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-MIG RED Aged', 'slug', 'w3_mig_red_aged', 'type', 'entity',
    'label_singular', 'Aged', 'label_plural', 'Ageds', 'title_field', 'client_name',
    'display', 'list', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_purge2, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));

  v_rec := custom.record_write(v_org, v_purge1, jsonb_build_object('client_name', 'Purge me'));
  perform custom.migrate_delete(v_org, v_rec);
  -- GREEN FIRST: the purge inside retention is a quiet no-op and the record stays reversible.
  v_res := custom.migrate_purge(v_org, v_purge1, false);
  if coalesce((v_res ->> 'rows_purged')::bigint, 0) <> 0 then
    raise exception 'RED 6 precondition: the purge destroyed a record deleted moments ago before anything was weakened';
  end if;

  v_a := custom.record_write(v_org, v_purge2, jsonb_build_object('client_name', 'Aged winner'));
  v_b := custom.record_write(v_org, v_purge2, jsonb_build_object('client_name', 'Aged loser'));
  perform custom.migrate_merge(v_org, v_a, v_b, 'RED 6: the loser whose id must answer forever');
  -- Nothing lets a person say a record was deleted 400 days ago; one operator statement, out
  -- of the seat, asserting nothing.
  perform set_config('role', v_boss, true);
  update custom.record set deleted_at = now() - interval '400 days'
   where organization_id = v_org and id = v_b;
  perform set_config('role', 'authenticated', true);
  -- GREEN FIRST for the second half: with the alias check in place the aged loser survives.
  v_res := custom.migrate_purge(v_org, v_purge2, false);
  if coalesce((v_res ->> 'rows_purged')::bigint, 0) <> 0 then
    raise exception 'RED 6 precondition: the merge loser was purged before the alias check was weakened';
  end if;

  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom.migrate_purge(uuid,uuid,boolean)'::regprocedure) into v_def;
  create or replace function custom.migrate_purge(p_organization_id uuid, p_table_id uuid default null,
                                                  p_dry_run boolean default true)
  returns jsonb language plpgsql security definer set search_path to 'pg_catalog' as $red$
  declare v_count bigint := 0;
  begin
    perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_purge');
    perform custom.assert_store_door(p_organization_id, 'custom.migrate_purge');
    -- THE WEAKENING: no cutoff, and no alias check either.
    with gone as (
      delete from custom.record c
       where not p_dry_run and c.organization_id = p_organization_id
         and c.deleted_at is not null
         and (p_table_id is null or c.table_id = p_table_id)
      returning 1)
    select count(*) from gone into v_count;
    return jsonb_build_object('function','custom.migrate_purge','rows_purged',v_count);
  end;
  $red$;
  perform set_config('role', 'authenticated', true);

  -- (a) THE RETENTION WINDOW. The store has a second wall — `custom._store_door` refuses a
  --     hard DELETE of any row still inside its Table's retention, whoever asks — so what the
  --     weakening takes away is not the row, it is the door's own manners: a person who asked
  --     for a purge and had nothing to purge used to be told "0 rows", and is now handed a
  --     42501 out of the store's last wall. The record is still there, which is the wall
  --     working and the door not.
  v_msg := null;
  begin
    perform custom.migrate_purge(v_org, v_purge1, false);
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then
    raise exception 'RED 6 (a): the purge with no cutoff destroyed a record deleted moments ago, so custom._store_door is not reading retention either';
  end if;
  if v_msg !~* 'not deleted for good' then
    raise exception 'RED 6 (a): the refusal came from somewhere else — "%"', v_msg;
  end if;
  perform custom.record_restore(v_org, v_rec);
  if not (custom.record_resolve(v_org, v_rec) ->> 'live')::boolean then
    raise exception 'RED 6 (a): the record inside retention did not survive after all';
  end if;

  -- (b) THE ALIAS CHECK, and this half DOES destroy data. A merged-away loser past its Table's
  --     retention is hard-deleted although its id is meant to answer forever — and the only
  --     way a person can tell a destroyed row from a deleted one is that it can no longer be
  --     brought back.
  v_res := custom.migrate_purge(v_org, v_purge2, false);
  if coalesce((v_res ->> 'rows_purged')::bigint, 0) < 1 then
    raise exception 'RED 6 (b) did not go red: the merge loser survived a purge with no alias check';
  end if;
  v_msg := null;
  begin
    perform custom.record_restore(v_org, v_b);
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then
    raise exception 'RED 6 (b): the merge loser was reported purged and can still be restored';
  end if;
  raise notice 'RED 6 — purge ignores retention and the alias check: a person purging inside retention now meets "%" from the store''s last wall instead of a quiet 0, and the merge loser whose id is supposed to resolve forever was DESTROYED (% row(s)) and can no longer be restored ("%"). REC-23''s window and REC-21''s "forever" go in one statement.',
               'Records are not deleted for good here', v_res ->> 'rows_purged', v_msg;

  perform set_config('role', v_boss, true);
  execute v_def;
  perform set_config('role', 'authenticated', true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- RED 7 — HIS-8 / REC-20. A verb that writes before it logs.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec := custom.record_write(v_org, v_widget, jsonb_build_object('client_name', 'Name me'));
  -- GREEN FIRST: the real verb logs, and the person can find it.
  v_res := custom.migrate_rename(v_org, v_rec, 'Renamed properly');
  if not exists (select 1 from custom.migrations(v_org, v_rec, 100) m
                  where m.id = (v_res ->> 'migration_id')::uuid and m.verb = 'rename') then
    raise exception 'RED 7 precondition: the real rename is not on the log a person reads';
  end if;
  perform custom.migrate_undo(v_org, (v_res ->> 'migration_id')::uuid);

  perform set_config('role', v_boss, true);
  select pg_get_functiondef('custom.migrate_rename(uuid,uuid,text,text)'::regprocedure) into v_def;
  create or replace function custom.migrate_rename(p_organization_id uuid, p_id uuid, p_to text,
                                                   p_note text default null)
  returns jsonb language plpgsql security definer set search_path to 'pg_catalog' as $red$
  begin
    perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_rename');
    perform custom.assert_store_door(p_organization_id, 'custom.migrate_rename');
    -- THE WEAKENING: the write happens and nothing is recorded. The old name is gone and
    -- there is no inverse anywhere to put it back with.
    perform custom.record_update(p_organization_id, p_id, jsonb_build_object('client_name', p_to));
    return jsonb_build_object('verb','rename','record_id',p_id,'now',p_to);
  end;
  $red$;
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n from custom.migrations(v_org, v_rec, 100) m where m.verb = 'rename';
  perform custom.migrate_rename(v_org, v_rec, 'Renamed with no way back');
  select count(*) - v_n into v_n from custom.migrations(v_org, v_rec, 100) m where m.verb = 'rename';
  if v_n <> 0 then
    raise exception 'RED 7 did not go red: % rename(s) were still logged', v_n;
  end if;
  v_txt := custom.read_record(v_org, v_rec, true) ->> 'client_name';
  if v_txt <> 'Renamed with no way back' then
    raise exception 'RED 7: the weakened rename did not even write — the record reads "%"', coalesce(v_txt, 'nothing');
  end if;
  raise notice 'RED 7 — a verb writes before it logs: the person''s record now reads "%" and custom.migrations gained NOTHING, so there is no entry to undo and no inverse anywhere. REC-20''s "logged and reversible" is gone and the only sign is a log that does not mention it.', v_txt;

  perform set_config('role', v_boss, true);
  execute v_def;
  perform set_config('role', 'authenticated', true);

  raise notice '════ W3-MIG RED — seven arms, seven things C-18 relies on gone, every one of them observed from the seat `authenticated` through the doors a signed-in person reaches. Rolling back; nothing here survives this transaction. ════';
end;
$r$;

rollback;
