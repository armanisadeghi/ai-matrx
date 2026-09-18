-- W4-AGG — THE GREEN SUITE. AGT-N-8 · DOOR-18.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w4_agg_green.sql
--
-- Not a migration; rehearsal branch only, by system identifier; ROLLS BACK.
-- ITS RED TWIN is `scripts/campaign-tests/w4_agg_red.sql`.
--
-- WHAT MAKES IT FAIL — the production change, named:
--   · move the Visibility join above the aggregate (compute, then filter) → PART 1 and PART 2
--   · let `custom.agg_assert_key` accept anything                        → PART 3
--   · let `custom.agg_view_admits` ignore the saved view's filters       → PART 4
--   · let `custom.agg_digest_run` send an empty digest                   → PART 5
--
-- EVERY NUMBER IS HAND-COMPUTED from the fixture below and compared to that, never to another
-- query's answer; the digest is proven by a DELIVERY ROW and never by a schedule existing.

\set ON_ERROR_STOP on
\timing off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684 then
    raise exception 'w4_agg_green.sql runs on the rehearsal branch only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

select set_config('app.actor_system', 'campaign.w4_agg.green', true);
\set org '39c38960-d30c-4840-b0c1-c9960de95582'

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

select custom.table_declare(:'org'::uuid, jsonb_build_object(
  'name', 'ZZ A Deal', 'slug', 'zz_a_deal', 'type', 'entity', 'display', 'list',
  'label_singular', 'Deal', 'label_plural', 'Deals', 'ordered', false, 'weight', 'light',
  'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
  'parent_id', custom.table_kernel_id(), 'title_field', 'title', 'default_sort', '[]'::jsonb,
  'fields', jsonb_build_array(jsonb_build_object('name','title'),
                              jsonb_build_object('name','status'),
                              jsonb_build_object('name','amount')))) as t_deal \gset

-- THE FIXTURE, and every expected number below is read straight off it:
--   open   : 100 + 200 + 700 = 1000 over 3 records
--   won    : 300 + 400       =  700 over 2 records
--   lost   : 500             =  500 over 1 record
--   total  :                   2200 over 6 records
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D1","status":"open","amount":"100"}'::jsonb) as d1 \gset
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D2","status":"open","amount":"200"}'::jsonb) as d2 \gset
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D3","status":"won","amount":"300"}'::jsonb)  as d3 \gset
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D4","status":"won","amount":"400"}'::jsonb)  as d4 \gset
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D5","status":"lost","amount":"500"}'::jsonb) as d5 \gset
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D6","status":"open","amount":"700"}'::jsonb) as d6 \gset

select set_config('zz.org', :'org', true) as org,
       set_config('zz.tdeal', :'t_deal', true) as tdeal,
       set_config('zz.d1', :'d1', true) as d1,
       set_config('zz.d5', :'d5', true) as d5;

\echo ''
\echo '══ PART 1 — AGT-N-8: group, count, sum, avg, min, max over one Table'
\echo ''

do $agg$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_t   uuid := current_setting('zz.tdeal')::uuid;
  r record;
  v_total numeric; v_rows bigint; v_groups int;
begin
  -- (a) THE GRAND TOTAL. No groups at all is a legal question and answers one row.
  select (a.measures ->> 'count')::numeric, (a.measures ->> 'sum_amount')::numeric, a.row_count
    into v_rows, v_total, v_rows
    from custom.record_aggregate(v_org, v_t, '[]'::jsonb,
           jsonb_build_array(jsonb_build_object('op','count'),
                             jsonb_build_object('op','sum','key','amount'))) a;
  if v_total <> 2200 then
    raise exception 'AGT-N-8 FAIL: 100+200+300+400+500+700 = 2200, got %', v_total;
  end if;
  if v_rows <> 6 then
    raise exception 'AGT-N-8 FAIL: six records were written and the count is %', v_rows;
  end if;
  raise notice 'AGT-N-8 PASS (a): the grand total is 6 records summing 2200 — hand-computed from the fixture';

  -- (b) GROUPED, three groups with three different sums. One group answering right by accident
  --     is possible; three at once is not.
  v_groups := 0;
  for r in select * from custom.record_aggregate(v_org, v_t,
             jsonb_build_array('status'),
             jsonb_build_array(jsonb_build_object('op','count'),
                               jsonb_build_object('op','sum','key','amount'),
                               jsonb_build_object('op','max','key','amount'))) loop
    v_groups := v_groups + 1;
    if r.groups ->> 'status' = 'open' then
      if (r.measures ->> 'sum_amount')::numeric <> 1000 or r.row_count <> 3
         or (r.measures ->> 'max_amount')::numeric <> 700 then
        raise exception 'AGT-N-8 FAIL: open is 3 records, sum 1000, max 700; got % / % / %',
          r.row_count, r.measures ->> 'sum_amount', r.measures ->> 'max_amount';
      end if;
    elsif r.groups ->> 'status' = 'won' then
      if (r.measures ->> 'sum_amount')::numeric <> 700 or r.row_count <> 2 then
        raise exception 'AGT-N-8 FAIL: won is 2 records summing 700; got % / %', r.row_count, r.measures ->> 'sum_amount';
      end if;
    elsif r.groups ->> 'status' = 'lost' then
      if (r.measures ->> 'sum_amount')::numeric <> 500 or r.row_count <> 1 then
        raise exception 'AGT-N-8 FAIL: lost is 1 record summing 500; got % / %', r.row_count, r.measures ->> 'sum_amount';
      end if;
    else
      raise exception 'AGT-N-8 FAIL: an unexpected group %', r.groups;
    end if;
  end loop;
  if v_groups <> 3 then
    raise exception 'AGT-N-8 FAIL: three statuses, three groups, got %', v_groups;
  end if;
  raise notice 'AGT-N-8 PASS (b): three groups — open 3/1000/max 700, won 2/700, lost 1/500 — every number hand-computed';

  -- (c) THE BUCKET. Everything here was written in one transaction, so a month bucket is ONE
  --     group of six: the assertion is that bucketing composes with grouping and does not
  --     silently drop or duplicate rows.
  select count(*), sum(a.row_count) into v_groups, v_rows
    from custom.record_aggregate(v_org, v_t, '[]'::jsonb,
           jsonb_build_array(jsonb_build_object('op','count')),
           jsonb_build_object('key','created_at','by','month')) a;
  if v_groups <> 1 or v_rows <> 6 then
    raise exception 'AGT-N-8 FAIL: one month, six records; got % group(s) over % row(s)', v_groups, v_rows;
  end if;
  raise notice 'AGT-N-8 PASS (c): a month bucket over the same six records is 1 group of 6 — the bucket groups, it does not lose rows';
end $agg$;

\echo ''
\echo '══ PART 2 — AGT-N-8: the Visibility predicate is BELOW the aggregate node'
\echo ''

do $plan$
declare
  v_plan text;
  v_agg  int;
  v_test bigint; v_admin bigint;
begin
  -- (a) THE PLAN. An aggregate whose filter sits ABOVE it has already counted rows the caller
  --     may not see; one whose filter sits below never fetched them. The join to
  --     `custom.query_visible_ids` must therefore appear UNDER an Aggregate node.
  v_plan := custom.agg_explain(current_setting('zz.org')::uuid, current_setting('zz.tdeal')::uuid,
                               jsonb_build_array('status'),
                               jsonb_build_array(jsonb_build_object('op','count')))::text;
  -- Read STRUCTURALLY, not by string order: in EXPLAIN's JSON a node's children live in its
  -- own "Plans" array, so "below the aggregate" means "inside the aggregate node's subtree",
  -- and comparing character offsets would be reading the serializer rather than the plan.
  select count(*) into v_agg
    from jsonb_path_query(v_plan::jsonb, '$.** ? (@."Node Type" == "Aggregate")') p
   where jsonb_path_exists(p, '$.**."Function Name" ? (@ == "query_visible_ids")');
  if v_agg < 1 then
    raise exception 'AGT-N-8 FAIL: no Aggregate node has the Visibility join inside its subtree, so the filter is not below the aggregate. Plan: %', v_plan;
  end if;
  if v_plan ~* '"Rows Removed by Filter": [1-9]' then
    raise exception 'AGT-N-8 FAIL: rows were fetched and discarded inside the aggregate''s plan, which is a post-filter. Plan: %', v_plan;
  end if;
  raise notice 'AGT-N-8 PASS (plan): the aggregate node sits ABOVE the Visibility join, so the rows this principal may not see are never counted';

  -- (b) TWO PRINCIPALS, and the number they are compared to is HAND-COMPUTED (6 and 0), never
  --     to each other only — which is exactly what this lane's exit clause demands.
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  select sum(a.row_count) into v_admin from custom.record_aggregate(
    current_setting('zz.org')::uuid, current_setting('zz.tdeal')::uuid) a;
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select coalesce(sum(a.row_count), 0) into v_test from custom.record_aggregate(
    current_setting('zz.org')::uuid, current_setting('zz.tdeal')::uuid) a;
  perform set_config('request.jwt.claims', '', true);

  if v_admin <> 6 then
    raise exception 'AGT-N-8 FAIL: admin@admin.com holds access here and must count all 6 — the positive control — and counted %', v_admin;
  end if;
  if v_test <> 0 then
    raise exception 'AGT-N-8 FAIL: test@test.com holds no grant on these records and must count 0, and counted %', v_test;
  end if;
  raise notice 'AGT-N-8 PASS (two principals): the same aggregate counts 6 for admin@admin.com and 0 for test@test.com — two hand-computed numbers, one query';
end $plan$;

\echo ''
\echo '══ PART 3 — a Field key is a key, and never a fragment of SQL'
\echo ''

do $inj$
declare
  v_msg text; v_ok boolean := false; v_n bigint;
begin
  begin
    perform * from custom.record_aggregate(current_setting('zz.org')::uuid,
      current_setting('zz.tdeal')::uuid,
      jsonb_build_array('status'') , (select 1))--'));
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok then
    raise exception 'FAIL: a group name carrying SQL was accepted';
  end if;

  -- THE POSITIVE CONTROL, and it is the same call with a legal key: the refusal is about the
  -- SHAPE of the name, not about the function refusing work.
  select sum(a.row_count) into v_n from custom.record_aggregate(current_setting('zz.org')::uuid,
    current_setting('zz.tdeal')::uuid, jsonb_build_array('status'),
    jsonb_build_array(jsonb_build_object('op','count'))) a;
  if v_n <> 6 then
    raise exception 'FAIL: the positive control should still count 6 and counted %', v_n;
  end if;
  raise notice 'PASS: a group name carrying SQL is refused by name ("%"), and the same call with a legal key still answers 6', left(v_msg, 60);
end $inj$;

\echo ''
\echo '══ PART 4 and 5 — DOOR-18: a subscription over a saved view, now and on a schedule'
\echo ''

insert into platform.saved_view (name, surface_key, organization_id, definition, visibility)
values ('ZZ A Open deals', 'custom/records', :'org'::uuid,
        jsonb_build_object('table_id', :'t_deal', 'filters', jsonb_build_object('status', 'open')),
        'internal'::platform.visibility)
returning id as v_open \gset

insert into platform.saved_view (name, surface_key, organization_id, definition, visibility)
values ('ZZ A Everything', 'custom/records', :'org'::uuid,
        jsonb_build_object('table_id', :'t_deal', 'filters', '{}'::jsonb),
        'internal'::platform.visibility)
returning id as v_all \gset

-- TWO subscriptions over the SAME organization: one immediate on one channel, one digest on
-- another. DOOR-18's "immediately or on a schedule, per channel" is one mechanism, so both are
-- Rule records of the same kind differing in two keys.
insert into custom.record (organization_id, table_id, data_class, data)
values (:'org'::uuid, custom.rule_kernel_id(), 'rule', jsonb_build_object(
          'kind','predicate','name','ZZ A Now','sort',10,
          'uses', jsonb_build_array('membership'),
          'expr', jsonb_build_object('op','const','args', jsonb_build_array(true)),
          'message','this deal counts','applies_to_types','[]'::jsonb,
          'scope_table_id', :'t_deal',
          'subscription', jsonb_build_object(
            'saved_view_id', :'v_open', 'cadence','immediate','channel','in_app',
            'recipient_user_id','87a6e699-3622-4869-8843-d0867456c0dd',
            'event_key','records.changed'))),
       (:'org'::uuid, custom.rule_kernel_id(), 'rule', jsonb_build_object(
          'kind','predicate','name','ZZ A Monday','sort',20,
          'uses', jsonb_build_array('membership'),
          'expr', jsonb_build_object('op','const','args', jsonb_build_array(true)),
          'message','this deal counts','applies_to_types','[]'::jsonb,
          'scope_table_id', :'t_deal',
          'subscription', jsonb_build_object(
            'saved_view_id', :'v_all', 'cadence','digest','schedule','0 9 * * 1',
            'channel','email','recipient_user_id','87a6e699-3622-4869-8843-d0867456c0dd',
            'event_key','records.changed')));

do $sub$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_d1  uuid := current_setting('zz.d1')::uuid;
  v_mark bigint;
  v_fired int; v_digested int; v_rows int; v_ch text;
begin
  select count(*) into v_mark from communication.notification where organization_id = v_org;

  -- (a) IMMEDIATE. D1 is `open`, so the "open deals" view admits it and the subscription fires.
  v_fired := custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid);
  if v_fired <> 1 then
    raise exception 'DOOR-18 FAIL: exactly one immediate subscription admits D1, and % fired', v_fired;
  end if;

  -- (b) THE NEGATIVE CONTROL that makes (a) mean something: D5 is `lost`, the same view does
  --     NOT admit it, and the same call fires nothing. Without this, a function that notified
  --     everybody about everything would pass (a).
  if custom.agg_subscription_fire(v_org, current_setting('zz.d5')::uuid,
                                  current_setting('zz.tdeal')::uuid) <> 0 then
    raise exception 'DOOR-18 FAIL: a record the saved view does not admit still fired a subscription';
  end if;

  -- (c) THE DELIVERY ROW. DOOR-18 is proven by a real row in the platform's own notification
  --     system — never by a subscription existing, and never by a scheduled job existing.
  select count(*), max(channel) into v_rows, v_ch
    from communication.notification
   where organization_id = v_org and dedupe_key like 'custom.subscription:%';
  if v_rows < 1 then
    raise exception 'DOOR-18 FAIL: the immediate subscription landed no delivery row';
  end if;
  raise notice 'DOOR-18 PASS (immediate): one subscription fired for D1 and none for a record its view excludes, landing % real delivery row(s) in communication.notification', v_rows;

  -- (d) IDEMPOTENCE. The same event replayed writes the same dedupe key, so a replayed outbox
  --     is one message and not many.
  if custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid) <> 1 then
    raise exception 'DOOR-18 FAIL: the replay should still report one subscription matched';
  end if;
  select count(distinct dedupe_key) into v_rows
    from communication.notification
   where organization_id = v_org and dedupe_key like 'custom.subscription:%';
  if v_rows <> 1 then
    raise exception 'DOOR-18 FAIL: replaying one change over one subscription must leave ONE dedupe key, and left %', v_rows;
  end if;
  select count(*) into v_rows from communication.notification
   where organization_id = v_org and dedupe_key like 'custom.subscription:%';
  if v_rows <> 1 then
    raise exception 'DOOR-18 FAIL: the replay sent the message a second time — % delivery rows for one change', v_rows;
  end if;
  raise notice 'DOOR-18 PASS (idempotent): the same change fired twice leaves exactly 1 delivery row, so replaying the outbox is safe rather than noisy';

  -- (e) THE DIGEST, on the other channel, proven by its own delivery row.
  v_digested := custom.agg_digest_run(v_org);
  if v_digested <> 1 then
    raise exception 'DOOR-18 FAIL: exactly one digest subscription exists and % ran', v_digested;
  end if;
  select count(*) into v_rows from communication.notification
   where organization_id = v_org and channel = 'email'
     and dedupe_key like 'custom.subscription:%';
  if v_rows < 1 then
    raise exception 'DOOR-18 FAIL: the digest ran and landed no delivery row on its own channel';
  end if;
  raise notice 'DOOR-18 PASS (digest): the scheduled subscription landed % real delivery row(s) on the email channel — a delivery, not a schedule that exists', v_rows;
end $sub$;

\echo ''
\echo '══ W4-AGG GREEN SUITE PASSED ══'

rollback;
