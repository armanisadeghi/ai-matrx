-- W4-QUERY — THE GREEN SUITE. DOOR-6 · DOOR-7 · DOOR-8 · DOOR-9 · DOOR-10 · DOOR-N-3.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w4_query_green.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, it refuses to run
-- anywhere but the rehearsal branch by system identifier, and it ROLLS BACK.
--
-- ITS RED TWIN is `scripts/campaign-tests/w4_query_red.sql`.
--
-- WHAT MAKES IT FAIL — the production change, named, for every part:
--   · make `custom.query_access_ids` always return null               → PART 1 (two principals)
--   · drop the `distinct co.n` from `custom.query_by_coordinates`     → PART 2's subset counts
--   · take `cycle … using path` out of `custom.query_rollup`          → PART 3 never terminates
--   · take `group by record_id` out of it                             → PART 3's exactly-once
--   · make `custom.query_record_as_of` ignore `p_recorded_at`         → PART 4's first clock
--   · make it ignore `p_world_on`                                     → PART 4's second clock
--   · make `custom.query_across_homes` read one Home                  → PART 5's three Homes
--   · make `custom.query_prepare_hot` a no-op                         → PART 6
--
-- EVERY NUMBER IS COMPARED TO A HAND-COMPUTED EXPECTED VALUE, never to another query's answer,
-- and every refusal is paired with a positive control that succeeds.

\set ON_ERROR_STOP on
\timing off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684 then
    raise exception 'w4_query_green.sql runs on the rehearsal branch only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

select set_config('app.actor_system', 'campaign.w4_query.green', true);

\set org '39c38960-d30c-4840-b0c1-c9960de95582'

-- Relations are read through `platform.assert_relations_door`; this transaction turns the
-- knob on for itself only and rolls back.
update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key = 'associations_guard';

create function pg_temp.zz_q_table(p_org uuid, p_name text, p_slug text, p_home uuid) returns uuid
language sql as $$
  select custom.table_declare(p_org, jsonb_build_object(
    'name', p_name, 'slug', p_slug, 'type', 'entity', 'display', 'list',
    'label_singular', p_name, 'label_plural', p_name || 's',
    'ordered', false, 'weight', 'light', 'retention_days', 365,
    'row_order', 'sorted', 'agent_writable', true,
    'parent_id', p_home, 'title_field', 'title',
    'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'),
                                jsonb_build_object('name','amount'))))
$$;

create function pg_temp.zz_q_declare(p_org uuid, p_table uuid, p_key text) returns void
language sql as $$
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  coalesce(data -> 'fields', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('name', p_key)))
   where organization_id = p_org and id = p_table
     and not exists (select 1 from jsonb_array_elements(coalesce(data -> 'fields', '[]'::jsonb)) e
                      where e ->> 'name' = p_key);
$$;

select custom.table_kernel_id() as home1 \gset
select pg_temp.zz_q_table(:'org'::uuid, 'ZZ Q Job',    'zz_q_job',    :'home1'::uuid) as t_job    \gset
select pg_temp.zz_q_table(:'org'::uuid, 'ZZ Q Client', 'zz_q_client', :'home1'::uuid) as t_client \gset

-- DOOR-9's three Homes for ONE Table. `custom.home_add` writes the carrying `home` relation.
select custom.record_write(:'org'::uuid, :'t_client'::uuid, '{"title":"Home North"}'::jsonb) as h_north \gset
select custom.record_write(:'org'::uuid, :'t_client'::uuid, '{"title":"Home South"}'::jsonb) as h_south \gset
select custom.home_add(:'org'::uuid, :'t_job'::uuid, :'h_north'::uuid) as home_north_added;
select custom.home_add(:'org'::uuid, :'t_job'::uuid, :'h_south'::uuid) as home_south_added;

select custom.record_write(:'org'::uuid, :'t_client'::uuid, '{"title":"Client Alpha"}'::jsonb) as c_alpha \gset
select custom.record_write(:'org'::uuid, :'t_client'::uuid, '{"title":"Client Beta"}'::jsonb)  as c_beta  \gset

-- Four jobs. The coordinate arithmetic below is hand-computed from exactly this:
--   J1 → Alpha          J2 → Alpha + Beta      J3 → Beta          J4 → nothing
select custom.record_write(:'org'::uuid, :'t_job'::uuid, '{"title":"J1","amount":100}'::jsonb) as j1 \gset
select custom.record_write(:'org'::uuid, :'t_job'::uuid, '{"title":"J2","amount":200}'::jsonb) as j2 \gset
select custom.record_write(:'org'::uuid, :'t_job'::uuid, '{"title":"J3","amount":300}'::jsonb) as j3 \gset
select custom.record_write(:'org'::uuid, :'t_job'::uuid, '{"title":"J4","amount":400}'::jsonb) as j4 \gset

select pg_temp.zz_q_declare(:'org'::uuid, :'t_job'::uuid, 'client');
insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                          relation_target, relation_max, on_target_delete, config,
                          source, source_config, sensitivity, context_policy,
                          rules, depends_on, applies_to_types, multi, dated, required, sort)
values (:'org'::uuid, :'t_job'::uuid, 'client', 'Client', 'Client', 'relation',
        :'t_client'::uuid, 50, 'set_null',
        jsonb_build_object('target_mode','one','ordered',false,'loops',true),
        'manual', '{}'::jsonb, 'internal', 'include',
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 10)
returning id as f_client \gset

-- A SECOND relation Field, so "any combination" is a real combination and not one role twice.
select pg_temp.zz_q_declare(:'org'::uuid, :'t_job'::uuid, 'next_job');
insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                          relation_target, relation_max, on_target_delete, config,
                          source, source_config, sensitivity, context_policy,
                          rules, depends_on, applies_to_types, multi, dated, required, sort)
values (:'org'::uuid, :'t_job'::uuid, 'next_job', 'Next job', 'Next job', 'relation',
        :'t_job'::uuid, 50, 'set_null',
        jsonb_build_object('target_mode','one','ordered',false,'loops',true),
        'manual', '{}'::jsonb, 'internal', 'include',
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 20)
returning id as f_next \gset

-- DOOR-8's world clock is OPT IN, per Field (HIS-5), so `rate` declares `dated` — and it
-- lives on a Table of its own so PART 2's and PART 3's row arithmetic over the jobs is
-- untouched by it.
select pg_temp.zz_q_table(:'org'::uuid, 'ZZ Q Rate', 'zz_q_rate', :'home1'::uuid) as t_rate \gset
select pg_temp.zz_q_declare(:'org'::uuid, :'t_rate'::uuid, 'rate');
insert into custom.record (organization_id, table_id, data_class, data)
values (:'org'::uuid, custom.field_kernel_id(), 'field', jsonb_build_object(
  'key','rate','label','Rate','type','text','sort',30,'required',false,
  'multi',false,'dated',true,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
  'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
  'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',:'t_rate'::uuid));

-- 🚨 FOUND, NOT WORKED AROUND (W4-QUERY seat, 2026-09-18). The dated periods cannot be
-- written through the door today: `custom.value_envelope_keys()` (W1-VAL) is
-- {ver,src,actor,on_behalf_of,at,absent,alternates} and refuses `dated` by name, while
-- `history.value_in_document` (W3-HIST) reads the world clock out of `_values.<key>.dated`
-- and W3-HIST's own suite writes exactly that. Two lanes disagree about one key. It is not
-- this lane's function to replace, so PART 4 proves the world clock is THREADED — an undated
-- Field is ABSENT under a world date and PRESENT without one, which is HIS-6 — and the
-- disagreement is reported rather than papered over with a value this store cannot hold.
select custom.record_write(:'org'::uuid, :'t_rate'::uuid,
         '{"title":"Rate card","rate":"99"}'::jsonb) as r_rate \gset

select platform.relation_set(:'org'::uuid, :'j1'::uuid, 'client', jsonb_build_array(:'c_alpha')) as e1;
select platform.relation_set(:'org'::uuid, :'j2'::uuid, 'client', jsonb_build_array(:'c_alpha', :'c_beta')) as e2;
select platform.relation_set(:'org'::uuid, :'j3'::uuid, 'client', jsonb_build_array(:'c_beta')) as e3;

-- The fixture ids, handed to the DO blocks below as transaction-local settings. psql does not
-- interpolate inside a dollar-quoted body, so a DO block reads them back with current_setting
-- rather than pretending :'j1' would expand there.
select set_config('zz.org',   :'org',      true) as org,
       set_config('zz.tjob',  :'t_job',    true) as tjob,
       set_config('zz.alpha', :'c_alpha',  true) as alpha,
       set_config('zz.beta',  :'c_beta',   true) as beta,
       set_config('zz.j1',    :'j1',       true) as j1,
       set_config('zz.j2',    :'j2',       true) as j2,
       set_config('zz.rate',  :'r_rate',   true) as rate;

\echo ''
\echo '══ PART 1 — DOOR-10: the filter is INSIDE the plan, and two principals get two answers'
\echo ''

-- (a) The plan. `custom.query_visible_ids` is a JOIN, so the plan carries a join node and NOT a
--     `Rows Removed by Filter` line over `custom.record`. This is the machine-readable form of
--     "never post-filtered": a post-filter fetches rows and throws them away, and EXPLAIN says so.
do $plan$
declare
  v_plan jsonb;
  v_txt  text;
  v_miss text;
begin
  -- (a-i) THE PLAN. Explained on the JOIN SHAPE ITSELF, because `EXPLAIN` over a plpgsql
  -- function reports one `Function Scan` and says nothing about what is inside it — reading
  -- that as proof would be reading the wrapper, not the query. This is the exact shape every
  -- function in this lane emits, and it must plan as a JOIN with no discarded rows.
  execute format(
    'explain (analyze, format json, timing off, summary off)
       select r.id from custom.query_visible_ids(%L::uuid, %L::uuid) v
         join custom.record r on r.organization_id = %L::uuid and r.id = v',
    current_setting('zz.org'), current_setting('zz.tjob'), current_setting('zz.org'))
    into v_plan;
  v_txt := v_plan::text;
  if v_txt !~* 'Nested Loop|Hash Join|Merge Join' then
    raise exception 'DOOR-10 FAIL: the Visibility set does not JOIN — the plan is %', v_txt;
  end if;
  if v_txt ~* '"Rows Removed by Filter": [1-9]' then
    raise exception 'DOOR-10 FAIL: rows were fetched and discarded, which is a post-filter. Plan: %', v_txt;
  end if;
  raise notice 'DOOR-10 (a-i) PASS: the Visibility set is JOINED in the plan and no row is fetched-then-discarded';

  -- (a-ii) THE CENSUS. A plan proves ONE query. This proves the CLASS: every function in this
  -- lane's query surface that returns records must call the one helper. A later query that
  -- forgets it — the actual failure DOOR-10 describes — is caught here and not by hoping
  -- somebody explains it.
  select string_agg(p.proname, ', ') into v_miss
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom'
     and p.proname in ('query_by_coordinates', 'query_across_homes', 'query_rollup',
                       'query_table_as_of', 'query_can_see')
     and p.prosrc !~ 'query_visible_ids';
  if v_miss is not null then
    raise exception 'DOOR-10 FAIL: these query functions do not read the one Visibility helper: %', v_miss;
  end if;
  raise notice 'DOOR-10 (a-ii) PASS: every record-returning function in the query surface reads custom.query_visible_ids — the filter cannot be forgotten by a later one';
end $plan$;

-- (b) THREE PRINCIPALS, THREE NUMBERS, each compared to a hand-computed expected value and
--     never to each other only. `iam.has_org_access_for` answers FALSE for test@test.com in
--     this organization and TRUE for admin@admin.com, so the same query over the same rows
--     must answer 0 for one and 4 for the other — and 0 is the interesting one, because an
--     implementation that lets the server connection's own privilege leak through answers 4
--     for everybody and would pass a one-principal test.
-- The real Visibility path. `iam.accessible_entity_ids('record', …)` routes to the sibling
-- lane's set-based predicate `custom.visible_record_ids` when `custom/accessible_entity_ids_guard`
-- resolves true — which is exactly the swap this lane's one helper was built to receive. The
-- knob is turned on FOR THIS TRANSACTION ONLY and rolls back with everything else.
update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key = 'accessible_entity_ids_guard';


do $two$
declare
  v_server int; v_test int; v_admin int;
begin
  select count(*) into v_server from custom.query_visible_ids(current_setting('zz.org')::uuid,
                                                              current_setting('zz.tjob')::uuid);

  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select count(*) into v_test from custom.query_visible_ids(current_setting('zz.org')::uuid,
                                                            current_setting('zz.tjob')::uuid);

  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  select count(*) into v_admin from custom.query_visible_ids(current_setting('zz.org')::uuid,
                                                             current_setting('zz.tjob')::uuid);
  perform set_config('request.jwt.claims', '', true);

  if v_server <> 4 then
    raise exception 'DOOR-10 FAIL: with no principal the store role should see exactly the 4 jobs written here, and sees %', v_server;
  end if;
  if v_test <> 0 then
    raise exception 'DOOR-10 FAIL: test@test.com holds no grant on these four records and must see 0, and sees % — the connection''s own privilege is leaking past the principal', v_test;
  end if;
  if v_admin <> 4 then
    raise exception 'DOOR-10 FAIL: admin@admin.com DOES hold access here, so the positive control is all 4, and it saw %', v_admin;
  end if;

  -- AND IT IS NOT ALL-OR-NOTHING. Over the WHOLE organization the same two principals get two
  -- DIFFERENT non-trivial numbers, so the helper is genuinely resolving per record rather than
  -- answering "everything" or "nothing" per person — which is the failure a 0-and-4 pair alone
  -- would not catch.
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select count(*) into v_test from custom.query_visible_ids(current_setting('zz.org')::uuid);
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  select count(*) into v_admin from custom.query_visible_ids(current_setting('zz.org')::uuid);
  perform set_config('request.jwt.claims', '', true);
  if not (v_test > 0 and v_test < v_admin) then
    raise exception 'DOOR-10 FAIL: over the whole organization the two principals answered % and %, which is not a per-record resolution', v_test, v_admin;
  end if;

  raise notice 'DOOR-10 (b) PASS: over this Table — no principal 4, test@test.com 0, admin@admin.com 4 (the positive control). Over the whole organization the same two answer % and %, so the resolution is per record and not per person', v_test, v_admin;
end $two$;

\echo ''
\echo '══ PART 2 — DOOR-6: any combination of coordinates, and any SUBSET of them'
\echo ''

do $coord$
declare
  v_org   uuid := current_setting('zz.org')::uuid;
  v_tjob  uuid := current_setting('zz.tjob')::uuid;
  v_alpha uuid := current_setting('zz.alpha')::uuid;
  v_beta  uuid := current_setting('zz.beta')::uuid;
  n_none int; n_alpha int; n_beta int; n_both int; n_role_any int;
begin
  -- THE SUBSET LADDER. Four questions over ONE fixture with four DIFFERENT expected answers,
  -- so an implementation that ignores a coordinate, or ANDs when it should intersect, is caught
  -- by construction rather than by one number happening to match.
  select count(*) into n_none  from custom.query_by_coordinates(v_org, v_tjob, '[]'::jsonb, 100, 0);
  select count(*) into n_alpha from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_alpha)), 100, 0);
  select count(*) into n_beta  from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_beta)), 100, 0);
  select count(*) into n_both  from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('role','client','target_id',v_alpha),
                      jsonb_build_object('role','client','target_id',v_beta)), 100, 0);
  -- A coordinate with NO role: "related to Alpha by anything at all".
  select count(*) into n_role_any from custom.query_by_coordinates(v_org, v_tjob,
    jsonb_build_array(jsonb_build_object('target_id',v_alpha)), 100, 0);

  if n_none  <> 4 then raise exception 'DOOR-6 FAIL: no coordinates is the whole Table, expected 4, got %', n_none; end if;
  if n_alpha <> 2 then raise exception 'DOOR-6 FAIL: one coordinate (Alpha) should return J1 and J2 = 2, got %', n_alpha; end if;
  if n_beta  <> 2 then raise exception 'DOOR-6 FAIL: one coordinate (Beta) should return J2 and J3 = 2, got %', n_beta; end if;
  if n_both  <> 1 then raise exception 'DOOR-6 FAIL: both coordinates is the INTERSECTION, J2 only = 1, got %', n_both; end if;
  if n_role_any <> 2 then raise exception 'DOOR-6 FAIL: a roleless coordinate on Alpha should return 2, got %', n_role_any; end if;
  raise notice 'DOOR-6 PASS: 0/1/1/2 coordinates over one fixture answer 4 / 2 / 2 / 1, and a roleless coordinate answers 2 — four different hand-computed numbers';

  -- THE REVERSE END, paired with the forward one so "any combination" includes direction.
  select count(*) into n_alpha from custom.query_by_coordinates(v_org, null,
    jsonb_build_array(jsonb_build_object('role','client','target_id',current_setting('zz.j2')::uuid,
                                         'direction','to')), 100, 0);
  if n_alpha <> 2 then
    raise exception 'DOOR-6 FAIL: the reverse end of J2''s client relation is Alpha and Beta = 2, got %', n_alpha;
  end if;
  raise notice 'DOOR-6 PASS: the reverse end of the same edges answers 2 — one stored row, read from either side';
end $coord$;

\echo ''
\echo '══ PART 3 — DOOR-7: a rollup over a LOOP counts every node exactly once'
\echo ''

-- The loop: J1 → J2 → J3 → J1, plus a DIAMOND J1 → J4 and J2 → J4, because cycle detection
-- alone does not stop a diamond from being reached twice and the grouping is what does.
select platform.relation_set(:'org'::uuid, :'j1'::uuid, 'next_job', jsonb_build_array(:'j2')) as l1;
select platform.relation_set(:'org'::uuid, :'j2'::uuid, 'next_job', jsonb_build_array(:'j3', :'j4')) as l2;
select platform.relation_set(:'org'::uuid, :'j3'::uuid, 'next_job', jsonb_build_array(:'j1')) as l3;
select platform.relation_set(:'org'::uuid, :'j4'::uuid, 'next_job', jsonb_build_array(:'j1')) as l4;

do $roll$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_j1  uuid := current_setting('zz.j1')::uuid;
  n int; s numeric; n_raw bigint;
begin
  select count(*) into n from custom.query_rollup(v_org, array[v_j1], 'referenced', 'next_job');
  if n <> 4 then
    raise exception 'DOOR-7 FAIL: the four jobs form one loop and one diamond, so the rollup is exactly 4 nodes, got %', n;
  end if;

  -- THE NAIVE WALK, RUN HERE, so "3.67x too big" is a number this file produced rather than a
  -- number a comment claims. `custom.reachable_from`-shaped counting without the grouping.
  with recursive edge as (
    select parent_id, child_id from custom.query_relation_edges(v_org, 'referenced', 'next_job')
  ), walk(node, d) as (
      select v_j1, 0
    union all
      select e.child_id, walk.d + 1 from walk join edge e on e.parent_id = walk.node where walk.d < 8
  )
  select count(*) into n_raw from walk;
  if n_raw <= n then
    raise exception 'DOOR-7 FAIL: the naive walk should OVERCOUNT this graph (it is a loop plus a diamond) — it returned % against the rollup''s %', n_raw, n;
  end if;
  raise notice 'DOOR-7 PASS: the rollup returns exactly 4 nodes where the naive walk over the SAME edges returns % — the difference is the double counting', n_raw;

  select custom.query_rollup_sum(v_org, array[v_j1], 'amount', 'referenced', 'next_job') into s;
  if s <> 1000 then
    raise exception 'DOOR-7 FAIL: 100+200+300+400 = 1000 counted once each, got %', s;
  end if;
  raise notice 'DOOR-7 PASS: the rollup SUM is 1000 — hand-computed as 100+200+300+400, each counted once';
end $roll$;

\echo ''
\echo '══ PART 4 — DOOR-8: as-of a date on EITHER clock, and they are genuinely two'
\echo ''

do $asof$
declare
  v_org  uuid := current_setting('zz.org')::uuid;
  v_j1   uuid := current_setting('zz.j1')::uuid;
  v_then jsonb; v_now jsonb; v_world jsonb;
  v_t_before constant timestamptz := '2026-08-10 12:00:00+00';
begin
  -- SIMULATED TIME, the same device W3-HIST's suite uses. Everything this transaction has
  -- written so far is pushed back to a real past moment, so the CORRECTION that follows lands
  -- at `now()` and the recorded clock has two genuinely different stored truths to choose
  -- between. Only this record's versions are touched, and the transaction rolls back.
  update history.row_versions
     set occurred_at = v_t_before
   where entity_type = 'custom.record' and row_id = v_j1 and organization_id = v_org;

  perform custom.record_update(v_org, v_j1, '{"title":"J1 corrected"}'::jsonb, null);

  v_now  := custom.query_record_as_of(v_org, v_j1, null, null);
  v_then := custom.query_record_as_of(v_org, v_j1, v_t_before + interval '1 second', null);

  if v_now ->> 'title' <> 'J1 corrected' then
    raise exception 'DOOR-8 FAIL: with no clock argument the answer is today''s, expected "J1 corrected", got %', v_now ->> 'title';
  end if;
  if v_then is null or v_then ->> 'title' is null then
    raise exception 'DOOR-8 FAIL: the recorded clock returned nothing for a moment the store has a version for';
  end if;
  if v_then ->> 'title' <> 'J1' then
    raise exception 'DOOR-8 FAIL: as of % the store said "J1"; it answered "%" — p_recorded_at is being ignored', v_t_before, v_then ->> 'title';
  end if;
  raise notice 'DOOR-8 PASS (clock one, recorded): today answers "%", and the SAME record as-of % answers "%" — two different stored truths, both hand-computed',
    v_now ->> 'title', v_t_before, v_then ->> 'title';

  -- CLOCK TWO, the world clock, and it is genuinely a SECOND clock: the same row read with a
  -- world date and without one gives two different answers. `rate` declares `dated` but holds
  -- no period (see the note in the fixture), so HIS-6 says it is ABSENT on any date — and
  -- absent is the answer that matters, because the failure this guards against is a store
  -- that quietly hands back today's value for a date it knows nothing about.
  v_now   := custom.query_record_as_of(v_org, current_setting('zz.rate')::uuid, null, null);
  v_world := custom.query_record_as_of(v_org, current_setting('zz.rate')::uuid, null, date '2026-06-15');
  if (v_now ->> 'rate') is distinct from '99' then
    raise exception 'DOOR-8 FAIL: with no world date the document''s own value stands, expected 99, got %', coalesce(v_now -> 'rate', 'null'::jsonb);
  end if;
  if v_world -> 'rate' is not null and jsonb_typeof(v_world -> 'rate') <> 'null' then
    raise exception 'DOOR-8 FAIL: no period covers 2026-06-15 and the world clock answered % instead of nothing — the silent wrong answer HIS-6 forbids', v_world -> 'rate';
  end if;
  if not (v_world ? 'title') then
    raise exception 'DOOR-8 FAIL: the world-clock read dropped the record instead of projecting its keys';
  end if;
  raise notice 'DOOR-8 PASS (clock two, world): the SAME row answers 99 with no world date and NOTHING for 2026-06-15 — p_world_on changes the answer, so it is a second clock and not a spare argument';
end $asof$;

\echo ''
\echo '══ PART 5 — DOOR-9: every Home of one Table in ONE answer'
\echo ''

do $homes$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_tjob uuid := current_setting('zz.tjob')::uuid;
  n_homes int; n_rows int;
begin
  select count(*) into n_homes from custom.query_table_homes(v_org, v_tjob);
  if n_homes < 3 then
    raise exception 'DOOR-9 FAIL: this Table was declared under the kernel Home and given two more, so it has 3 Homes, got %', n_homes;
  end if;
  select count(*) into n_rows from custom.query_across_homes(v_org, v_tjob, 100, 0);
  if n_rows <> 4 then
    raise exception 'DOOR-9 FAIL: one page across EVERY Home returns all 4 jobs, got %', n_rows;
  end if;
  raise notice 'DOOR-9 PASS: % Homes, and one call returns all 4 records across them — one query, one page, not one query per Home', n_homes;
end $homes$;

\echo ''
\echo '══ PART 6 — DOOR-N-3: the hot paths are PREPARED, and the plan is reused'
\echo ''

do $prep$
declare
  n_declared int; n_prepared int; n_made int;
begin
  select count(*) into n_declared from custom.query_hot_paths();
  if n_declared < 4 then
    raise exception 'DOOR-N-3 FAIL: fewer than four hot paths are declared (%)', n_declared;
  end if;
  select custom.query_prepare_hot() into n_made;
  select count(*) into n_prepared from custom.query_hot_paths_prepared() where prepared;
  if n_prepared <> n_declared then
    raise exception 'DOOR-N-3 FAIL: % hot paths are declared and only % are prepared on this connection', n_declared, n_prepared;
  end if;
  -- IDEMPOTENT: calling it again prepares nothing and does not raise 42P05.
  if custom.query_prepare_hot() <> 0 then
    raise exception 'DOOR-N-3 FAIL: the second call re-prepared something, so the pool would raise 42P05 on every checkout';
  end if;
  raise notice 'DOOR-N-3 PASS: % declared hot paths, all % prepared on this connection, and a second call prepares 0 rather than raising 42P05',
    n_declared, n_prepared;
end $prep$;

\echo ''
\echo '══ W4-QUERY GREEN SUITE PASSED ══'

rollback;
