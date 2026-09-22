-- LANE STORE-TAILS-2 — THE RED TWIN of scripts/campaign-tests/storetails2_green.sql.
--
-- It runs the REAL BYTES of this lane's two inverses inside one transaction that ends in
-- ROLLBACK, and then asserts the defects exactly as VERIFIER-11 measured them and as the
-- owner's law of 2026-09-20 forbids. Every clause here PASSES only while the lane is reversed;
-- with the lane applied, every clause FAILS. That is the point: a guard nobody has seen fail
-- is not a guard.
--
--   RED 1  a worked-out column that joins a text column and a choice prints the OPTION KEY —
--          `SR-4181crown_reduction` — which is what Greenline's route sheet actually read.
--   RED 2  `"separator"` on a concat node is ignored, so there is no way to ask for one.
--   RED 3  `custom.migrate_purge(organization, table, false)` DESTROYS records, from a screen,
--          in one unchunked statement — no reason asked, no window but the table's own.
--   RED 4  there is no compliance door at all: `custom.migrate_purge_hard` does not exist.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storetails2_red.sql
--
-- THE USE CASE is the green suite's, unchanged: Sierra Ridge Tree Care, a four-person arborist
-- crew in the Ojai valley, printing a work-order label onto the daily route sheet.

\set ON_ERROR_STOP on
\timing off

\set suite 'storetails2_red.sql'
\set requires 'exec:custom.record_write|function:custom.rule_eval'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- ── THE LANE, REVERSED. The real inverse files, not a paraphrase of them.
\i migrations/inverse/storetails2_a_joined_column_prints_the_words_a_person_reads_down.sql
\i migrations/inverse/storetails2_the_purge_archives_first_and_the_hard_delete_is_a_compliance_door_down.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss    constant text := current_user;

  v_org     uuid := gen_random_uuid();
  v_name    text;
  v_home    uuid;
  v_orders  uuid;
  v_f_num   uuid;
  v_f_svc   uuid;
  v_f_label uuid;
  v_o1      uuid;
  v_k_crown text;
  v_label   text;
  v_words   text;
  v_res     jsonb;
  v_n       bigint;
begin
  perform set_config('app.actor_system', 'campaign-test/storetails2_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- RED 4 — asked first, because it is about what is NOT there.
  if exists (select 1 from pg_proc p
              where p.proname = 'migrate_purge_hard' and p.pronamespace = 'custom'::regnamespace) then
    raise exception 'RED 4 did not go red: custom.migrate_purge_hard still exists after the inverse';
  end if;
  raise notice 'RED 4 — there is no compliance door: the hard delete is whatever an ordinary screen can reach. RED as expected.';

  v_name := 'Sierra Ridge Tree Care — Ojai Yard ' || substr(v_org::text, 1, 8);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, v_name, 'sierra-ridge-red-' || substr(v_org::text, 1, 8), 'SRT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'storetails2_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this suite did not take the seat — current_user is %', current_user;
  end if;

  v_orders := custom.table_declare(v_org, jsonb_build_object(
    'name','Work Orders','slug','work_orders','type','entity',
    'label_singular','Work Order','label_plural','Work Orders','title_field','order_number','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',30,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','order_number')),
    'parent_id', v_home::text));
  v_f_num := custom.field_declare(v_org, v_orders, jsonb_build_object(
    'key','order_number','label','Work order number','plain','text','sort',10));
  v_f_svc := custom.field_declare(v_org, v_orders, jsonb_build_object(
    'label','Service','parity_type','select','sort',20,
    'options', jsonb_build_array('Crown reduction','Deadwood removal','Stump grinding','Storm cleanup')));
  select o.metadata ->> 'option_key' into v_k_crown
    from custom.field_options(v_org, v_f_svc) o where o.data ->> 'title' = 'Crown reduction';

  v_f_label := custom.field_declare(v_org, v_orders, jsonb_build_object(
    'key','work_order_label','label','Work order label','parity_type','formula','sort',40,
    'compute_on','write',
    'depends_on', jsonb_build_array(to_jsonb(v_f_num::text), to_jsonb(v_f_svc::text)),
    'expr', jsonb_build_object('op','concat','separator',' — ',
      'args', jsonb_build_array(jsonb_build_object('field', v_f_num::text),
                                jsonb_build_object('field', v_f_svc::text)))));

  v_o1 := custom.record_write(v_org, v_orders, jsonb_build_object(
            'order_number','SR-4181', 'service', v_k_crown));

  -- ── RED 1 and RED 2 — the label on the route sheet, from the seat, as a screen reads it.
  select x.document ->> 'work_order_label' into v_label
    from custom.read_records(v_org, v_orders, false, 50, 0) x
   where x.id = v_o1;
  if v_label is distinct from ('SR-4181' || v_k_crown) then
    raise exception 'RED 1 did not go red: the label reads "%", not the machine''s word "SR-4181%"', v_label, v_k_crown;
  end if;
  raise notice 'RED 1 — the route sheet reads "%" — the option KEY, beside a cell reading "Crown reduction". RED as expected.', v_label;
  raise notice 'RED 2 — and the separator the formula asked for is nowhere in it. RED as expected.';

  -- ── RED 3 — an ordinary screen destroys records.
  perform custom.record_delete(v_org, v_o1);
  execute format('set local role %I', v_boss);
  update custom.record r set deleted_at = now() - interval '400 days'
   where r.organization_id = v_org and r.id = v_o1;
  perform set_config('role', 'authenticated', true);

  v_res := custom.migrate_purge(v_org, v_orders, false);
  if coalesce((v_res ->> 'rows_purged')::bigint, 0) = 0 then
    raise exception 'RED 3 did not go red: the purge verb destroyed nothing — %', v_res;
  end if;
  execute format('set local role %I', v_boss);
  select count(*) into v_n from custom.record r where r.organization_id = v_org and r.id = v_o1;
  if v_n <> 0 then
    raise exception 'RED 3 did not go red: the record is still there after the purge said it destroyed it';
  end if;
  raise notice 'RED 3 — a signed-in seat asked an ordinary door and % record(s) are gone for good, with no reason asked and nothing written down. RED as expected.', v_res ->> 'rows_purged';

  raise notice 'ALL RED CLAUSES RED — storetails2_red.sql';
  raise exception 'ROLLBACK: the red twin behaved as the defect and this transaction is deliberately thrown away';
exception when others then
  if sqlerrm !~ '^ROLLBACK:' then raise; end if;
  raise notice '%', sqlerrm;
end
$t$;

rollback;
