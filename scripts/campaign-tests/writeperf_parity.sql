-- WRITE-PERF — THE SAME TWO HUNDRED ROWS, WRITTEN BY THE OLD BODIES AND BY THE NEW ONES,
-- LEAVE THE SAME HISTORY, THE SAME OUTBOX AND THE SAME ENVELOPE.
--
-- This is the one proof the lane's whole claim rests on. It is NOT a before/after taken an hour
-- apart on a database six other lanes are writing to: both halves run inside ONE transaction, on
-- ONE snapshot, and the file rolls back. MIRROR-PERF paid for that lesson and LADDER-PERF wrote
-- it down.
--
-- THE SHAPE.
--   1. Build organization A. Write 200 records through custom.record_write with the CURRENT
--      (this lane's) bodies. Capture a canonical projection of every history row, every outbox
--      row and every record envelope.
--   2. Inside the SAME transaction, execute the REAL BYTES of all five of this lane's inverses,
--      putting the store back to the bodies it had before the lane touched it.
--   3. Build organization B — same structure, same field types, same 200 rows — and write it
--      with those restored bodies. Capture the same projection.
--   4. Compare. Roll back.
--
-- WHAT "CANONICAL" MEANS, AND WHY IT IS NOT A CHEAT. The two halves write different records into
-- different organizations, so ids, timestamps and version rowids MUST differ; comparing them raw
-- would only prove that uuids are random. The projection therefore replaces every uuid with the
-- placeholder <id> and every timestamp with <t>, keeps the ORDER of the rows, and keeps
-- everything that carries meaning: the operation, the version number, the actor tier, every key
-- and every scalar value of the record's data, the outbox event key, and — this is the one that
-- would catch a real regression — the FIELD KEYS behind changed_field_ids, resolved through the
-- Field records rather than compared as ids.
--
-- Run: bin/p.sh -f scripts/campaign-tests/writeperf_parity.sql
\set ON_ERROR_STOP on
\timing on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'writeperf_parity.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = '10s';

create temp table wp_shot (half text, kind text, ord int, payload text) on commit drop;

create or replace function pg_temp.canon(p jsonb) returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(p::text,
             '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '<id>', 'g'),
           '[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?([+-][0-9]{2}(:?[0-9]{2})?|Z)?', '<t>', 'g');
$$;

create or replace function pg_temp.build(p_half text, p_slug text) returns void
language plpgsql as $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_boss  text := current_user;
  v_org uuid; v_home uuid; v_tbl uuid; v_acct uuid; v_accts uuid[]; v_ids uuid[];
  i int; v_id uuid;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Ironline Fitness Parity ' || p_half, p_slug, 'ZWP', c_admin) returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org),
         (v_org, c_dana,  'member','active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf_parity', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this half did not take the seat — current_user is %', current_user;
  end if;

  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','Parity Home'));
  v_acct := custom.table_declare(v_org, jsonb_build_object(
    'name','Membership Accounts','slug','membership_accounts_' || lower(p_half),'type','entity',
    'label_singular','Account','label_plural','Accounts','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_acct, jsonb_build_object('label','Title','key','title','type','text'));
  for i in 1..10 loop
    v_accts := v_accts || custom.record_write(v_org, v_acct, jsonb_build_object('title','Account ' || i));
  end loop;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Class Packages','slug','class_packages_' || lower(p_half),'type','entity',
    'label_singular','Package','label_plural','Packages','title_field','package','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','package')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Package','key','package','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Amount','key','amount','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Closes','key','closes','type','datetime'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Stage','key','stage','type','select','options', jsonb_build_array('Open','Won','Lost')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Owner','key','owner','type','member'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Account','key','account','type','relation','relation_target', v_acct::text));

  -- THE TWO HUNDRED ROWS. Identical in both halves, and deliberately exercising every arm the
  -- write path has: money, a date, a choice resolved from its word, a person, a relation, and a
  -- row that leaves the optional columns out entirely.
  for i in 1..200 loop
    v_id := custom.record_write(v_org, v_tbl, jsonb_strip_nulls(jsonb_build_object(
      'package',   'Package ' || i,
      'amount', round((i * 12.37 + 100)::numeric, 2),
      'closes', to_char(date '2026-01-01' + ((i % 360) || ' days')::interval, 'YYYY-MM-DD'),
      'stage',  (array['Open','Won','Lost'])[1 + (i % 3)],
      'owner',  case when i % 10 = 0 then v_home::text else null end,
      'account', case when i % 7 = 0 then null else v_accts[1 + (i % 10)]::text end)));
    v_ids := v_ids || v_id;
  end loop;

  perform set_config('role', v_boss, true);

  -- THE ENVELOPE, through the read door, in write order.
  insert into wp_shot (half, kind, ord, payload)
  select p_half, 'envelope', t.ord, pg_temp.canon(custom.read_record(v_org, t.id, false))
    from unnest(v_ids) with ordinality as t(id, ord);

  -- THE HISTORY, in write order, with the field keys of the payload kept and the ids dropped.
  insert into wp_shot (half, kind, ord, payload)
  select p_half, 'history', t.ord,
         coalesce((select string_agg(h.operation || '/' || h.version || '/' ||
                                     coalesce(h.actor_tier, '-') || '/' ||
                                     coalesce(h.operation_name, '-') || '/' ||
                                     pg_temp.canon(h.row_data -> 'data'), ';' order by h.version)
                     from history.row_versions h
                    where h.entity_type = 'custom.record'
                      and h.organization_id = v_org
                      and h.row_id = t.id), '(no history row)')
    from unnest(v_ids) with ordinality as t(id, ord);

  -- THE OUTBOX, in write order. changed_field_ids is resolved to the FIELD KEYS it names, so a
  -- regression that changed WHICH fields an event reports is caught and a different Field id is
  -- not mistaken for one.
  insert into wp_shot (half, kind, ord, payload)
  select p_half, 'outbox', t.ord,
         coalesce((select string_agg(o.event_key || '/' || o.operation || '/' ||
                                     coalesce((select string_agg(f.data ->> 'key', ',' order by f.data ->> 'key')
                                                 from jsonb_array_elements_text(o.changed_field_ids) fid
                                                 join custom.record f
                                                   on f.organization_id = v_org and f.id = fid::uuid), '-') || '/' ||
                                     pg_temp.canon(o.actor), ';' order by o.created_at, o.id)
                     from custom.io_outbox o
                    where o.organization_id = v_org and o.record_id = t.id), '(no outbox row)')
    from unnest(v_ids) with ordinality as t(id, ord);
end;
$$;

\echo '=== HALF A: the bodies this lane landed ==='
select pg_temp.build('A', 'ironline-fitness-parity-a-' || substr(md5(random()::text),1,8));

\echo '=== restoring the bodies the store had before this lane, from the real inverses ==='
\i migrations/inverse/writeperf_the_memo_reader_plans_once_too_down.sql
\i migrations/inverse/writeperf_the_same_question_is_asked_once_down.sql
\i migrations/inverse/writeperf_the_write_path_plans_once_down.sql
\i migrations/inverse/writeperf_the_export_door_keeps_the_page_contract_down.sql
\i migrations/inverse/writeperf_a_page_says_what_it_did_down.sql
\i migrations/inverse/writeperf_the_page_census_names_only_the_silent_down.sql

\echo '=== HALF B: the bodies the store had before ==='
select pg_temp.build('B', 'ironline-fitness-parity-b-' || substr(md5(random()::text),1,8));

\echo '=== PARITY ==='
select kind,
       count(*) as rows_compared,
       count(*) filter (where a.payload is distinct from b.payload) as disagreeing,
       md5(string_agg(a.payload, '|' order by a.ord)) as hash_after,
       md5(string_agg(b.payload, '|' order by b.ord)) as hash_before
  from wp_shot a join wp_shot b using (kind, ord)
 where a.half = 'A' and b.half = 'B'
 group by kind order by kind;

select case when (select count(*) from wp_shot a join wp_shot b using (kind, ord)
                   where a.half='A' and b.half='B' and a.payload is distinct from b.payload) = 0
              and (select count(*) from wp_shot where half='A') = 600
              and (select count(*) from wp_shot where half='B') = 600
            then 'PARITY: 600 ANSWERS, ALL IDENTICAL — history, outbox and envelope unchanged'
            else 'PARITY: A DISAGREEMENT' end as verdict;

select a.kind, a.ord, a.payload as after, b.payload as before
  from wp_shot a join wp_shot b using (kind, ord)
 where a.half='A' and b.half='B' and a.payload is distinct from b.payload
 limit 3;
rollback;
