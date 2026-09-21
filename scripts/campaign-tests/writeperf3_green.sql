-- WRITE-PERF-3 — THE GREEN SUITE. Seated as `authenticated`, through the doors a person reaches.
--
-- What it asserts, in the order it asserts it:
--   0  the seat is real
--   1  the memo-invalidation census is empty, and the two exemptions are declared with reasons
--   2  all fourteen declared tables carry the clear triggers, and `platform.associations` UPDATE
--      is the PRECISE one rather than the blunt one
--   3  the memo amortises across single-row writes — every key survives, INCLUDING `tf:`, which
--      is the one this lane found was never being written at all
--   4  five hundred records in ONE statement, ids in input order, all readable
--   5  a batch refuses a bad row with EXACTLY the sentence the same row gets on its own
--   6  an edge ARRIVING forgets nothing; an edge being TAKEN AWAY empties the memo
--   7  a FIELD arriving empties the memo; a plain record arriving does not
--   8  a NO is never remembered: a refusal repeats, word for word, in the same transaction
--   9  `test@test.com` is refused the batched door on a Table she has no rung on, and reads her
--      own organization's page contract
--  10  the write-path replanner census is still 0
--
-- THE USE CASE (owner law, 2026-09-21: no fake test data). The fixture is a regional cold-chain
-- haulier's dispatch desk: ten Carriers, and Shipments with the six columns a dispatcher keeps —
-- consignment reference, declared value, delivery window, status, coordinator and carrier. The
-- refusal clause uses the mistake that actually arrives: a status nobody put on the list.
--
-- Run: binlocal/p.sh -f scripts/campaign-tests/writeperf3_green.sql
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local lock_timeout = '10min';

do $t$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j text; c_dana_j text;
  v_boss text := current_user;
  v_org uuid; v_home uuid; v_tbl uuid; v_acct uuid; v_accts uuid[]; v_ids uuid[];
  i int; n int; v_docs jsonb[]; v_keys text[]; v_keys2 text[];
  v_state text; v_msg text; v_hint text; v_msg2 text; v_hint2 text; v_state2 text;
  v_b text; v_s text; v_edge uuid;
begin
  c_admin_j := jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text;
  c_dana_j  := jsonb_build_object('sub', c_dana,  'role', 'authenticated')::text;

  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Cascade Cold Chain — WRITE-PERF-3 green', 'ccc-wp3-green-' || substr(md5(random()::text),1,8), 'CCC', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org),
         (v_org, c_dana,  'member','active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf3_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ===== 0. TAKE THE SEAT AND PROVE IT =====
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
  raise notice '0  the seat is authenticated and cannot read custom.record directly';

  -- ===== 1. THE CENSUS =====
  select count(*) into n from platform.memo_reach_unguarded();
  if n <> 0 then
    raise exception '1: % of the declared tables have no statement trigger emptying the memo', n;
  end if;
  select count(*) into n from platform.memo_reach_exempt();
  if n <> 2 then
    raise exception '1: the exemption list names % events, expected exactly 2', n;
  end if;
  if exists (select 1 from platform.memo_reach_exempt() x where coalesce(btrim(x.why), '') = '') then
    raise exception '1: an exemption carries no reason, which is a hole wearing a census';
  end if;
  raise notice '1  memo_reach_unguarded() is empty and both exemptions carry their reason';

  -- ===== 2. THE TRIGGERS ON ALL FOURTEEN =====
  perform set_config('role', v_boss, true);   -- the catalogue is not behind a client door
  select count(*) into n
    from unnest(platform.memo_reach_tables()) r
    join pg_trigger t on t.tgrelid = r::regclass and not t.tgisinternal
    join pg_proc p on p.oid = t.tgfoid
   where p.proname in ('memo_clear_stmt','memo_clear_on_structure','memo_clear_on_reach_loss')
     and t.tgtype & 1 = 0;
  if n < 40 then
    raise exception '2: only % memo-clearing statement triggers across the fourteen tables', n;
  end if;
  if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'platform.associations'::regclass
                    and p.proname = 'memo_clear_on_reach_loss' and t.tgtype & 16 = 16) then
    raise exception '2: platform.associations UPDATE is not on the precise trigger';
  end if;
  -- INSERT and UPDATE only. The DELETE trigger on `platform.associations` is DELIBERATELY still
  -- the blunt one — an edge being deleted always takes reach away — and
  -- writeperf3_an_edge_arriving_forgets_nothing.sql left it alone on purpose.
  if exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
              where t.tgrelid = 'platform.associations'::regclass
                and p.proname = 'memo_clear_stmt'
                and (t.tgtype & 4 = 4 or t.tgtype & 16 = 16)) then
    raise exception '2: a blunt memo trigger is back on platform.associations INSERT or UPDATE, which is the 18%% regression this lane closed';
  end if;
  if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                  where t.tgrelid = 'platform.associations'::regclass
                    and p.proname = 'memo_clear_stmt' and t.tgtype & 8 = 8) then
    raise exception '2: platform.associations DELETE has lost its memo-clearing trigger';
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice '2  % statement triggers across the fourteen tables, and associations UPDATE is the precise one', n;

  -- the fixture the rest of the suite writes into
  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','Dispatch desk'));
  v_acct := custom.table_declare(v_org, jsonb_build_object(
    'name','Carrier','slug','zz_wp3g_carrier_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Carrier','label_plural','Carriers','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_acct, jsonb_build_object('label','Title','key','title','type','text'));
  for i in 1..10 loop
    v_accts := v_accts || custom.record_write(v_org, v_acct, jsonb_build_object('title',
      (array['Cascade Freight Lines','Sonoran Cold Carriers','Great Lakes Reefer Co',
             'Pinebelt Haulage','Rio Grande Coldway','Puget Sound Chill Freight',
             'Ozark Temperature Logistics','Blue Ridge Cold Chain',
             'High Plains Refrigerated','Gulf Coast Perishables'])[i]));
  end loop;
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Shipment','slug','zz_wp3g_shipment_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Shipment','label_plural','Shipments','title_field','reference','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','reference')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Consignment reference','key','reference','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Declared value','key','declared_value','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Status','key','status','type','select','options', jsonb_build_array('In transit','Delivered','Delayed')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Carrier','key','carrier','type','relation','relation_target', v_acct::text));

  -- ===== 3. THE MEMO AMORTISES, AND `tf:` IS IN IT =====
  for i in 1..5 loop
    perform custom.record_write(v_org, v_tbl, jsonb_build_object(
      'reference', 'CC-2026-' || lpad((700 + i)::text, 5, '0'), 'declared_value', 4250,
      'status', 'In transit', 'carrier', v_accts[1 + (i % 10)]::text));
  end loop;
  v_b := coalesce(nullif(current_setting('mx_memo.b', true), ''), '{}');
  v_s := coalesce(nullif(current_setting('mx_memo.s', true), ''), '{}');
  select array_agg(k order by k) into v_keys  from jsonb_object_keys((v_b::jsonb) -> 'e') k;
  select array_agg(k order by k) into v_keys2 from jsonb_object_keys((v_s::jsonb) -> 'e') k;
  if v_keys is null or not exists (select 1 from unnest(v_keys) k where k like 'af:%') then
    raise exception '3: after five single-row writes the bulky memo holds no af: key — it is not amortising at all (%)', v_keys;
  end if;
  if v_keys2 is null or not exists (select 1 from unnest(v_keys2) k where k like 'tf:%') then
    raise exception '3: after five single-row writes the small memo holds no tf: key — custom.table_type_field is memoising nothing, which is the defect writeperf3_a_small_answer_is_not_read_out_of_a_big_blob.sql closed (%)', v_keys2;
  end if;
  if not exists (select 1 from unnest(v_keys2) k where k like 'tr:%')
     or not exists (select 1 from unnest(v_keys2) k where k like 'rd:%') then
    raise exception '3: the small memo is missing a tr: or an rd: key (%)', v_keys2;
  end if;
  raise notice '3  the memo survives five single-row writes: % bulky key(s), % small key(s), tf: among them',
    array_length(v_keys, 1), array_length(v_keys2, 1);

  -- ===== 4. FIVE HUNDRED IN ONE STATEMENT =====
  select array_agg(jsonb_build_object(
           'reference',      'CC-2026-' || lpad(g.i::text, 5, '0'),
           'declared_value', round((1250 + (g.i * 137.55)::numeric % 48000)::numeric, 2),
           'status',         (array['In transit','Delivered','Delayed'])[1 + (g.i % 3)],
           'carrier',        v_accts[1 + (g.i % 10)]::text) order by g.i)
    into v_docs from generate_series(1, 500) g(i);
  v_ids := custom.record_write_many(v_org, v_tbl, v_docs);
  if coalesce(array_length(v_ids, 1), 0) <> 500 then
    raise exception '4: the batched door handed back % ids for 500 records', coalesce(array_length(v_ids,1),0);
  end if;
  for i in 1..500 loop
    if (custom.read_record(v_org, v_ids[i], true) -> 'data' ->> 'reference') <> 'CC-2026-' || lpad(i::text, 5, '0') then
      raise exception '4: id % is not the record that was handed in at that position', i;
    end if;
  end loop;
  raise notice '4  500 records in ONE statement, 500 ids in input order, every one readable';

  -- ===== 5. THE BATCH REFUSES WHAT THE SINGLE ROW REFUSES, WORD FOR WORD =====
  begin
    perform custom.record_write_many(v_org, v_tbl, array[
      jsonb_build_object('reference','CC-2026-90001'),
      jsonb_build_object('reference','CC-2026-90002', 'status', 'Held at dock'),
      jsonb_build_object('reference','CC-2026-90003')]);
    raise exception '5: a batch carrying an invented choice was not refused';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  end;
  begin
    perform custom.record_write(v_org, v_tbl, jsonb_build_object('reference','CC-2026-90002', 'status', 'Held at dock'));
    raise exception '5: the same record alone was not refused';
  exception when others then
    get stacked diagnostics v_state2 = returned_sqlstate, v_msg2 = message_text, v_hint2 = pg_exception_hint;
  end;
  if (v_state, v_msg, v_hint) is distinct from (v_state2, v_msg2, v_hint2) then
    raise exception '5: the batch refused with "% / %" and the single row with "% / %"', v_state, v_msg, v_state2, v_msg2;
  end if;
  select count(*) into n from custom.read_records(v_org, v_tbl, true, 1000, 0) r
   where r.document -> 'data' ->> 'reference' in ('CC-2026-90001','CC-2026-90003');
  if n <> 0 then
    raise exception '5: % of the good rows in the refused batch landed anyway', n;
  end if;
  raise notice '5  the batch and the single row refuse identically ("%") and none of the batch landed', left(v_msg, 60);

  -- ===== 6. AN EDGE ARRIVING FORGETS NOTHING; AN EDGE TAKEN AWAY EMPTIES THE MEMO =====
  perform custom.record_write(v_org, v_tbl, jsonb_build_object(
    'reference','CC-2026-90010', 'carrier', v_accts[3]::text));
  if coalesce(nullif(current_setting('mx_memo.b', true), ''), '{}') = '{}' then
    raise exception '6: writing a record WITH a relation emptied the bulky memo — an edge arriving must forget nothing';
  end if;
  perform set_config('role', v_boss, true);   -- taking an edge away is not a client door
  select a.id into v_edge from platform.associations a
   where a.organization_id = v_org and a.source_type = 'record' and a.deleted_at is null limit 1;
  update platform.associations set deleted_at = now() where id = v_edge;
  if coalesce(nullif(current_setting('mx_memo.b', true), ''), '{}') <> '{}' then
    raise exception '6: taking an edge away did NOT empty the memo, so a yes could outlive the grant behind it';
  end if;
  update platform.associations set deleted_at = null where id = v_edge;
  perform set_config('role', 'authenticated', true);
  raise notice '6  an edge arriving forgets nothing; an edge taken away empties the memo';

  -- ===== 7. A FIELD ARRIVING EMPTIES THE MEMO; A RECORD ARRIVING DOES NOT =====
  perform custom.record_write(v_org, v_tbl, jsonb_build_object('reference','CC-2026-90020', 'declared_value', 1800));
  if coalesce(nullif(current_setting('mx_memo.s', true), ''), '{}') = '{}' then
    raise exception '7: the small memo is empty before the structure test, so the test would prove nothing';
  end if;
  perform custom.record_write(v_org, v_tbl, jsonb_build_object('reference','CC-2026-90021', 'declared_value', 2400));
  if coalesce(nullif(current_setting('mx_memo.s', true), ''), '{}') = '{}' then
    raise exception '7: a plain record arriving emptied the memo, which is the whole cost this lane removed';
  end if;
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Dock note','key','dock_note','type','text'));
  if coalesce(nullif(current_setting('mx_memo.s', true), ''), '{}') <> '{}' then
    raise exception '7: a FIELD arriving did NOT empty the memo, so the next row would be told the old shape';
  end if;
  perform custom.record_write(v_org, v_tbl, jsonb_build_object('reference','CC-2026-90022', 'dock_note','Tail-lift booked'));
  -- TWO STATEMENTS ON PURPOSE. `custom.read_record` is STABLE, so folded into the same
  -- expression as the write it would read the snapshot taken before that write and answer
  -- "there is no record …" — which is what the first draft of this clause did.
  v_ids := custom.record_write_many(v_org, v_tbl,
             array[jsonb_build_object('reference','CC-2026-90023', 'dock_note','Reefer pre-cooled to -18C')]);
  if (custom.read_record(v_org, v_ids[1], true) -> 'data' ->> 'dock_note') <> 'Reefer pre-cooled to -18C' then
    raise exception '7: the column declared mid-transaction is not readable through the door';
  end if;
  raise notice '7  a record arriving keeps the memo, a Field arriving empties it, and the new column is written at once';

  -- ===== 8. A NO IS NEVER REMEMBERED =====
  begin
    perform custom.record_write_many(gen_random_uuid(), v_tbl, array[jsonb_build_object('reference','CC-2026-90030')]);
    raise exception '8: the batched door accepted an organization this seat is not in';
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  begin
    perform custom.record_write_many(gen_random_uuid(), v_tbl, array[jsonb_build_object('reference','CC-2026-90030')]);
    raise exception '8: the SECOND attempt at a foreign organization was accepted, so a refusal was remembered as a yes';
  exception when others then
    get stacked diagnostics v_msg2 = message_text;
  end;
  if v_msg is distinct from v_msg2 then
    raise exception '8: the same refusal said "%" then "%"', v_msg, v_msg2;
  end if;
  raise notice '8  a refusal repeats word for word inside the same transaction';

  -- ===== 9. test@test.com =====
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform custom.record_write_many(v_org, v_tbl, array[jsonb_build_object('reference','CC-2026-90040')]);
    raise exception '9: test@test.com wrote a batch into a Table she has no rung on';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state = 'P0001' and v_msg like '9:%' then raise; end if;
  end;
  if (custom.page_contract(v_org) ->> 'ceiling')::int is null then
    raise exception '9: test@test.com cannot read her own organization''s page contract';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice '9  test@test.com is refused the batched door ("%") and still reads her page contract', left(v_msg, 55);

  -- ===== 10. THE REPLANNER CENSUS =====
  perform set_config('role', v_boss, true);
  select count(*) into n from custom.ladder_replanners();
  if n <> 0 then
    raise exception '10: % write-path helpers are non-inlinable SQL again', n;
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice '10 the write-path replanner census is 0';

  raise notice 'ALL PARTS PASSED';
end;
$t$;
rollback;
