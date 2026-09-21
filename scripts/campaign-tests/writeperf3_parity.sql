-- WRITE-PERF-3 — THE SAME ANSWERS AND THE SAME REFUSALS, AND THE ONLY HONEST A/B ON A SHARED
-- DATABASE.
--
-- Everything this lane changed is a body that is supposed to answer exactly what it answered
-- before, faster. So both halves run inside ONE transaction, on ONE snapshot, minutes apart at
-- most, and the file rolls back:
--
--   1. Organization A: 2,000 records in FOUR statements of 500 through
--      `custom.record_write_many`, with this lane's bodies live. Timed. A canonical projection
--      of every record envelope, every history row, every outbox row and every relation edge.
--   2. Organization A again: 100 deliberately invalid records, each one refused TWICE — once
--      inside a batch through `custom.record_write_many` and once alone through
--      `custom.record_write` — and every refusal's SQLSTATE, MESSAGE, DETAIL and HINT kept.
--   3. Inside the SAME transaction, the REAL BYTES of all four of this lane's inverses execute:
--      the three door predicates go back to asking the ladder on every row, the five reads go
--      back to reading the Table on every row, and all three memos go away.
--   4. Organization B: the same 2,000 records, the same four statements of 500, the same door —
--      and the same 100 refusals, both ways. Timed.
--   5. Compare all of it. Roll back.
--
-- WHY B USES THE SAME DOOR AS A, unlike WRITE-PERF-2's parity file: there WAS a batched door
-- before this lane, so the comparison that proves something is the SAME door over the OLD
-- bodies against the SAME door over the NEW ones. Nothing else differs between the halves.
--
-- WHY THE TIMING LIVES HERE AND NOT IN A STANDALONE RUN. This database is shared with eight
-- other lanes landing migrations; the same 2,000-row write measured 23.76 ms/row at 22:5xZ and
-- the identical workload's helper self-times rose by 70% forty minutes later with nothing
-- changed underneath them. A number from one run at one time is not evidence. A and B here are
-- separated by seconds, on one connection, in one transaction.
--
-- THE USE CASE, AND IT IS NOT DECORATION (owner law, 2026-09-21: no fake test data). Every
-- record below is a REFRIGERATED SHIPMENT MANIFEST for a regional cold-chain haulier: a
-- Carriers table of ten hauliers, and a Shipments table whose columns are the six a dispatcher
-- actually keeps — the consignment reference, the declared value of the load, the delivery
-- window, where the load has got to, the coordinator who owns it, and which carrier is moving
-- it. The hundred refusals are the hundred mistakes a dispatcher really makes: a status nobody
-- put on the list, a delivery window typed as a sentence, a value typed with a currency word in
-- it, and a carrier or a coordinator id copied from a spreadsheet that is out of date.
--
-- Run: binlocal/p.sh -f scripts/campaign-tests/writeperf3_parity.sql
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = '10min';

create temp table wp3_shot (half text, kind text, ord int, payload text) on commit drop;
create temp table wp3_ms   (half text, what text, ms numeric) on commit drop;
grant all on wp3_shot, wp3_ms to authenticated;

create or replace function pg_temp.canon(p jsonb) returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(p::text,
             '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '<id>', 'g'),
           '[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?([+-][0-9]{2}(:?[0-9]{2})?|Z)?', '<t>', 'g');
$$;

-- THE HUNDRED MANIFEST LINES A DISPATCHER GETS WRONG. Five kinds, cycled, each carrying its own
-- consignment reference so no two refusals are the same sentence: a status nobody put on the
-- list, a delivery window typed as a sentence, a declared value with the currency written into
-- it, a carrier id copied from a stale spreadsheet, and a coordinator who has left.
create or replace function pg_temp.bad(p_i int) returns jsonb language sql immutable as $$
  select jsonb_build_object('reference', 'CC-2026-' || lpad((80000 + p_i)::text, 5, '0'))
    || case p_i % 5
    when 0 then jsonb_build_object('status',          (array['Held at dock','Refused at gate','Awaiting customs','Re-iced in yard','Driver swapped'])[1 + (p_i % 5)])
    when 1 then jsonb_build_object('delivery_window', (array['next Tuesday morning','end of week','after the holiday','ASAP','when the yard opens'])[1 + (p_i % 5)])
    when 2 then jsonb_build_object('declared_value',  'approx ' || (8 + p_i % 40) || 'k USD')
    when 3 then jsonb_build_object('carrier',         md5('retired-carrier-' || p_i)::uuid::text)
    else        jsonb_build_object('coordinator',     md5('left-the-company-' || p_i)::uuid::text)
  end;
$$;

-- ONE MANIFEST LINE, the way the dispatcher's sheet has it. Deterministic, so both halves of
-- this file write byte-identical documents.
create or replace function pg_temp.manifest(p_i int, p_coordinator uuid, p_carriers uuid[])
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'reference',       'CC-2026-' || lpad(p_i::text, 5, '0'),
    'declared_value',  round((1250 + (p_i * 137.55)::numeric % 48000)::numeric, 2),
    'delivery_window', to_char(timestamp '2026-01-05 06:00' + ((p_i % 300) || ' days')::interval
                               + ((p_i % 9) || ' hours')::interval, 'YYYY-MM-DD"T"HH24:MI'),
    'status',          (array['In transit','Delivered','Delayed'])[1 + (p_i % 3)],
    'coordinator',     case when p_i % 10 = 0 then p_coordinator::text else null end,
    'carrier',         case when p_i % 7 = 0 then null else p_carriers[1 + (p_i % 10)]::text end));
$$;

create or replace function pg_temp.run(p_half text) returns void
language plpgsql as $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org uuid; v_home uuid; v_tbl uuid; v_acct uuid; v_accts uuid[]; v_ids uuid[];
  i int; b int; v_docs jsonb[]; t0 timestamptz; t1 timestamptz;
  v_state text; v_msg text; v_det text; v_hint text; v_n int;
  v_boss text := current_user;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Cascade Cold Chain — WRITE-PERF-3 parity ' || p_half,
          'ccc-wp3-par-' || lower(p_half) || '-' || substr(md5(random()::text),1,8), 'CCC', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org),
         (v_org, c_dana,  'member','active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf3_parity', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: half % did not take the seat — current_user is %', p_half, current_user;
  end if;

  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','Dispatch desk'));
  v_acct := custom.table_declare(v_org, jsonb_build_object(
    'name','Carrier','slug','zz_wp3_carrier_' || lower(p_half) || substr(md5(random()::text),1,6),'type','entity',
    'label_singular','Carrier','label_plural','Carriers','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_acct, jsonb_build_object('label','Title','key','title','type','text'));
  -- The ten hauliers this operator books against.
  for i in 1..10 loop
    v_accts := v_accts || custom.record_write(v_org, v_acct, jsonb_build_object('title',
      (array['Cascade Freight Lines','Sonoran Cold Carriers','Great Lakes Reefer Co',
             'Pinebelt Haulage','Rio Grande Coldway','Puget Sound Chill Freight',
             'Ozark Temperature Logistics','Blue Ridge Cold Chain',
             'High Plains Refrigerated','Gulf Coast Perishables'])[i]));
  end loop;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Shipment','slug','zz_wp3_shipment_' || lower(p_half) || substr(md5(random()::text),1,6),'type','entity',
    'label_singular','Shipment','label_plural','Shipments','title_field','reference','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','reference')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Consignment reference','key','reference','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Declared value','key','declared_value','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Delivery window','key','delivery_window','type','datetime'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Status','key','status','type','select','options', jsonb_build_array('In transit','Delivered','Delayed')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Coordinator','key','coordinator','type','member'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Carrier','key','carrier','type','relation','relation_target', v_acct::text));

  -- ============ 1. TWO THOUSAND ROWS, FOUR STATEMENTS OF FIVE HUNDRED ============
  t0 := clock_timestamp();
  for b in 0..3 loop
    select array_agg(pg_temp.manifest(g.i, v_home, v_accts) order by g.i)
      into v_docs from generate_series(b * 500 + 1, b * 500 + 500) g(i);
    v_ids := v_ids || custom.record_write_many(v_org, v_tbl, v_docs);
  end loop;
  t1 := clock_timestamp();
  insert into wp3_ms values (p_half, '2000 rows, 4 statements of 500, custom.record_write_many',
                             round((extract(epoch from (t1-t0))*1000/2000)::numeric, 3));

  -- The same shape one row at a time, which is the door `custom.io_import_rows` uses today.
  t0 := clock_timestamp();
  for i in 2001..2200 loop
    perform custom.record_write(v_org, v_tbl, pg_temp.manifest(i, v_home, v_accts));
  end loop;
  t1 := clock_timestamp();
  insert into wp3_ms values (p_half, '200 rows, one custom.record_write per row',
                             round((extract(epoch from (t1-t0))*1000/200)::numeric, 3));

  -- ============ 2. THE PROJECTION — everything anybody can read ============
  insert into wp3_shot
  select p_half, 'envelope', i.ord, pg_temp.canon(custom.read_record(v_org, i.id, true))
    from unnest(v_ids) with ordinality i(id, ord);

  -- OUT OF THE SEAT FOR THE THREE CATALOGUE PROJECTIONS, AND SAYING SO (SEAT-RECIPE step 4).
  -- `history.row_versions`, `custom.io_outbox` and `platform.associations` are not client
  -- tables and no door hands back a whole version row, an outbox row or an edge; the ENVELOPE
  -- above — the thing a person actually reads — was taken through `custom.read_record` from
  -- the seat. No product clause is asserted while out.
  perform set_config('role', v_boss, true);

  -- THE HISTORY, in write order, with the field keys of the payload kept and the ids dropped.
  insert into wp3_shot (half, kind, ord, payload)
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

  -- THE OUTBOX, in write order. changed_field_ids is resolved to the FIELD KEYS it names.
  insert into wp3_shot (half, kind, ord, payload)
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

  insert into wp3_shot
  select p_half, 'edges', i.ord,
         pg_temp.canon(coalesce((select jsonb_agg(jsonb_build_object(
                          'role', a.role, 'position', a."position",
                          'field', (select f.data ->> 'key' from custom.record f
                                     where f.id = a.relation_field_id and f.organization_id = v_org))
                          order by a.role, a."position")
                       from platform.associations a
                      where a.source_id = i.id and a.source_type = 'record'
                        and a.deleted_at is null), '[]'::jsonb))
    from unnest(v_ids) with ordinality i(id, ord);

  perform set_config('role', 'authenticated', true);

  -- ============ 3. THE HUNDRED REFUSALS, BOTH WAYS ============
  for i in 1..100 loop
    -- (a) inside a batch of ten, nine of which are perfectly good
    begin
      select array_agg(case when g.j = 5 then pg_temp.bad(i)
                            else pg_temp.manifest(90000 + i * 10 + g.j, v_home, v_accts) end order by g.j)
        into v_docs from generate_series(1, 10) g(j);
      perform custom.record_write_many(v_org, v_tbl, v_docs);
      v_state := 'NOTHING WAS REFUSED'; v_msg := null; v_det := null; v_hint := null;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_det = pg_exception_detail, v_hint = pg_exception_hint;
    end;
    insert into wp3_shot values (p_half, 'refusal-batched', i,
      pg_temp.canon(jsonb_build_object('state', v_state, 'message', v_msg, 'detail', v_det, 'hint', v_hint)));

    -- (b) the same bad row alone, through the door the import path uses
    begin
      perform custom.record_write(v_org, v_tbl, pg_temp.bad(i));
      v_state := 'NOTHING WAS REFUSED'; v_msg := null; v_det := null; v_hint := null;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_det = pg_exception_detail, v_hint = pg_exception_hint;
    end;
    insert into wp3_shot values (p_half, 'refusal-solo', i,
      pg_temp.canon(jsonb_build_object('state', v_state, 'message', v_msg, 'detail', v_det, 'hint', v_hint)));
  end loop;

  select count(*) into v_n from wp3_shot where half = p_half and kind like 'refusal%'
     and payload like '%NOTHING WAS REFUSED%';
  if v_n > 0 then
    raise exception 'half %: % of the 200 deliberately invalid writes were NOT refused, so this file proves nothing about refusals', p_half, v_n;
  end if;
end;
$$;

select pg_temp.run('A');

-- ============ 4. THE REAL BYTES OF ALL FOUR INVERSES ============
\echo ''
\echo '=== executing the real bytes of all four inverses inside this transaction ==='
reset role;
\i migrations/inverse/writeperf3_a_small_answer_is_not_read_out_of_a_big_blob_down.sql
\i migrations/inverse/writeperf3_an_edge_arriving_forgets_nothing_down.sql
\i migrations/inverse/writeperf3_the_table_is_read_once_per_statement_down.sql
\i migrations/inverse/writeperf3_the_write_path_asks_the_ladder_once_down.sql

select pg_temp.run('B');

-- ============ 5. THE COMPARISON ============
\echo ''
do $t$
declare
  r record; v_bad int := 0; v_tot int := 0;
begin
  for r in
    select a.kind,
           count(*) as rows_compared,
           count(*) filter (where a.payload is distinct from b.payload) as disagreeing,
           md5(string_agg(a.payload, '|' order by a.ord)) as hash_a,
           md5(string_agg(b.payload, '|' order by b.ord)) as hash_b
      from wp3_shot a join wp3_shot b on b.half = 'B' and b.kind = a.kind and b.ord = a.ord
     where a.half = 'A'
     group by a.kind order by a.kind
  loop
    raise notice '% : % rows compared, % disagreeing, A %, B %',
      rpad(r.kind, 16), r.rows_compared, r.disagreeing, left(r.hash_a, 8), left(r.hash_b, 8);
    v_tot := v_tot + r.rows_compared;
    v_bad := v_bad + r.disagreeing;
  end loop;
  if v_bad > 0 then
    raise exception 'PARITY FAILED: % of % answers disagree', v_bad, v_tot;
  end if;
  raise notice 'PARITY: % ANSWERS, ALL IDENTICAL — envelope, history, outbox, edges and 400 refusals', v_tot;
end;
$t$;

\echo ''
select half, what, ms,
       round(100 * (1 - ms / max(ms) over (partition by what)), 1) as pct_faster_than_the_slower
  from wp3_ms order by what, half;

rollback;
