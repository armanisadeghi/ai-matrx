-- W4-AGG — THE GREEN SUITE. AGT-N-8 · DOOR-18, on the MAIN database, in one transaction that
-- ends in ROLLBACK. Everything it makes — one disposable organization, its home, its table,
-- its records, two saved views, two subscription Rules and one knob override — disappears
-- with it.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w4_agg_green.sql
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). This suite used to target the
-- rehearsal branch — a copy that carries 226 functions in schema `custom` against main's 332
-- and grants `authenticated` 29 of them against main's 103, so the store it was measuring was
-- not the store anybody uses. The owner's 2026-09-18 ruling is that there is no production and
-- everything is the main database, so it now runs there, against the real doors.
--
-- And it used to run every clause as the role that OWNS `custom.record`. In that seat
-- `custom.assert_client_may_reach` returns on its first line, EXECUTE grants are free,
-- SECURITY INVOKER and SECURITY DEFINER are the same thing and `custom.record` is directly
-- readable — so an aggregate's "visibility is below the aggregate node" clause proved nothing
-- at all, because the seat saw everything either way. It now builds its fixtures as the
-- connected role, takes the seat `authenticated` in PART 0, asserts that it holds it, and runs
-- every asserted clause through the door a signed-in person reaches: `custom.record_aggregate`
-- and `custom.agg_explain`. PART 2 and PART 6 ask them as `test@test.com`, a real second
-- person: a member of the organization who reaches these records at `viewer` through the
-- organization lane and at `editor` only where one was actually shared with her.
--
-- WHAT MAKES IT FAIL — the production change, named:
--   · move the Visibility predicate above the aggregate (compute, then filter) → PART 1, PART 2
--   · let `custom.agg_assert_key` accept anything                        → PART 3
--   · let `custom.agg_view_admits` ignore the saved view's filters       → PART 4
--   · let `custom.agg_digest_run` send an empty digest                   → PART 5
--
-- EVERY NUMBER IS HAND-COMPUTED from the fixture below and compared to that, never to another
-- query's answer; the digest is proven by a DELIVERY ROW and never by a schedule existing.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w4_agg_green.sql'
\set requires 'exec:custom.table_declare'
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
  v_t       uuid;
  v_d1      uuid;
  v_d5      uuid;
  v_open    uuid;
  v_all     uuid;
  v_plan    text;
  v_msg     text;
  v_agg     int;
  v_groups  int;
  v_rows    bigint;
  v_total   numeric;
  v_n       bigint;
  v_admin   bigint;
  v_test    bigint;
  v_fired   int;
  v_digested int;
  v_ok      boolean := false;
  r         record;
  v_boss    text := current_user;   -- the connected role, for the steps no client door covers
begin
  -- WHO IS WRITING. platform.associations refuses an automated write that does not name the
  -- system doing it, and the store reaches that table on every containment write.
  perform set_config('app.actor_system', 'campaign-test/w4_agg_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Software', 'meridian-software-' || substr(v_org::text, 1, 8), 'MSW', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- And the store answers a person only where it is switched on. The owner of `custom.record`
  -- walked past this switch on its first line; `authenticated` does not.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w4_agg_green');

  -- A Home record has no client door of its own (a Home is made by the onboarding path, not by
  -- a person's browser), so it is built here, as the connected role, before the seat is taken.
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
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- THE TABLE AND ITS COLUMNS, declared through the doors a person reaches.
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Deals', 'slug', 'deals', 'type', 'entity', 'display', 'list',
    'label_singular', 'Deal', 'label_plural', 'Deals', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'title', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'),
                                jsonb_build_object('name','status'),
                                jsonb_build_object('name','amount'))));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','status','label','Status','plain','text','sort',20));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','amount','label','Amount','plain','text','sort',30));

  -- THE FIXTURE, and every expected number below is read straight off it:
  --   open   : 100 + 200 + 700 = 1000 over 3 records
  --   won    : 300 + 400       =  700 over 2 records
  --   lost   : 500             =  500 over 1 record
  --   total  :                   2200 over 6 records
  v_d1 := custom.record_write(v_org, v_t, '{"title":"D1","status":"open","amount":"100"}'::jsonb);
  perform custom.record_write(v_org, v_t, '{"title":"D2","status":"open","amount":"200"}'::jsonb);
  perform custom.record_write(v_org, v_t, '{"title":"D3","status":"won","amount":"300"}'::jsonb);
  perform custom.record_write(v_org, v_t, '{"title":"D4","status":"won","amount":"400"}'::jsonb);
  v_d5 := custom.record_write(v_org, v_t, '{"title":"D5","status":"lost","amount":"500"}'::jsonb);
  perform custom.record_write(v_org, v_t, '{"title":"D6","status":"open","amount":"700"}'::jsonb);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — AGT-N-8: group, count, sum, avg, min, max over one Table, through the door.
  -- ════════════════════════════════════════════════════════════════════════════

  -- (a) THE GRAND TOTAL. No groups at all is a legal question and answers one row.
  select (a.measures ->> 'sum_amount')::numeric, a.row_count
    into v_total, v_rows
    from custom.record_aggregate(v_org, v_t, '[]'::jsonb,
           jsonb_build_array(jsonb_build_object('op','count'),
                             jsonb_build_object('op','sum','key','amount'))) a;
  if v_total <> 2200 then
    raise exception 'AGT-N-8 FAIL: 100+200+300+400+500+700 = 2200, got %', v_total;
  end if;
  if v_rows <> 6 then
    raise exception 'AGT-N-8 FAIL: six records were written and the count is %', v_rows;
  end if;
  raise notice 'AGT-N-8 PASS (a): the grand total is 6 records summing 2200 — hand-computed from the fixture, asked from the seat';

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

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — AGT-N-8: the Visibility predicate is BELOW the aggregate node.
  -- ════════════════════════════════════════════════════════════════════════════

  -- (a) THE PLAN, read through `custom.agg_explain`, which is the door a person tuning a slow
  --     dashboard reaches. An aggregate whose filter sits ABOVE it has already counted rows
  --     the caller may not see; one whose filter sits below never fetched them.
  --
  --     🚨 RE-MEASURED ON MAIN (SEAT-SUITES, 2026-09-19). The clause here used to look for a
  --     `Function Scan` on `custom.query_visible_ids` inside the Aggregate's subtree. Main's
  --     `custom.agg_sql` no longer joins a list of ids back: READ-PERF replaced it with
  --     `custom.visible_predicate_sql`, which writes the ladder's answer as a PREDICATE in the
  --     same statement's WHERE so the planner can prune the partition and drive the index. The
  --     product truth is unchanged and is what is asserted — the restriction is applied BELOW
  --     the aggregate node and the rows this person may not see are never counted — but it is
  --     now asked of the predicate rather than of a join that is gone.
  --
  --     And it is asked AS THE RESTRICTED PERSON, AT A LEVEL SHE DOES NOT HOLD EVERYWHERE. For
  --     `admin@admin.com`, who reaches the whole organization, `visible_predicate_sql` collapses
  --     to the constant `true`, so an aggregate explained for HER would satisfy any clause at
  --     all. `test@test.com` is a member, so at `viewer` the organization lane reaches her to
  --     every one of these six records — that is the product working, not a hole. At `editor`
  --     it reaches her to NONE of them, and the ONE record shared with her at `editor` is then
  --     the only row in the store she may aggregate. That is the seat this plan is read from.
  perform custom.share_grant(v_org, v_d1, 'user', c_dana, 'editor'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_plan := custom.agg_explain(v_org, v_t, jsonb_build_array('status'),
                               jsonb_build_array(jsonb_build_object('op','count')),
                               null, '{}'::jsonb, 'editor')::text;
  perform set_config('request.jwt.claims', c_admin_j, true);
  -- Read STRUCTURALLY, not by string order: in EXPLAIN's JSON a node's children live in its
  -- own "Plans" array, so "below the aggregate" means "inside the aggregate node's subtree",
  -- and comparing character offsets would be reading the serializer rather than the plan.
  select count(*) into v_agg
    from jsonb_path_query(v_plan::jsonb, '$.** ? (@."Node Type" == "Aggregate")') p
   where jsonb_path_exists(p, ('$.**."Filter" ? (@ like_regex "' || c_dana::text || '")')::jsonpath)
      or jsonb_path_exists(p, ('$.**."Index Cond" ? (@ like_regex "' || c_dana::text || '")')::jsonpath);
  if v_agg < 1 then
    raise exception 'AGT-N-8 FAIL: no Aggregate node carries this person''s Visibility restriction inside its subtree, so the filter is not below the aggregate. Plan: %', v_plan;
  end if;
  -- AND NOTHING ABOVE IT DISCARDS A ROW. A post-filter is a node that fetched rows and threw
  -- them away AFTER the aggregate had already counted them; the ancestors of the Aggregate
  -- node are exactly those nodes, and none of them may have removed anything.
  if exists (select 1
               from jsonb_path_query(v_plan::jsonb,
                      '$.** ? (exists (@.**."Node Type" ? (@ == "Aggregate")))') anc
              where coalesce((anc ->> 'Rows Removed by Filter')::bigint, 0) > 0) then
    raise exception 'AGT-N-8 FAIL: a node ABOVE the aggregate fetched rows and discarded them, which is a post-filter. Plan: %', v_plan;
  end if;
  -- AND THE NUMBER THE AGGREGATE ITSELF PRODUCED IS HAND-COMPUTED: one record is shared with
  -- her at editor, it is `open`, so the aggregate emits exactly ONE group. A plan that carried
  -- the predicate in the right place but counted the wrong rows would still fail here.
  select max(coalesce((p ->> 'Actual Rows')::bigint, -1)) into v_n
    from jsonb_path_query(v_plan::jsonb, '$.** ? (@."Node Type" == "Aggregate")') p;
  if v_n <> 1 then
    raise exception 'AGT-N-8 FAIL: at `editor` test@test.com reaches one `open` record here, so the aggregate node emits 1 group and it emitted %. Plan: %', v_n, v_plan;
  end if;
  raise notice 'AGT-N-8 PASS (plan): the Visibility restriction sits INSIDE the aggregate node''s subtree, nothing above the aggregate discards a row, and the aggregate emits the 1 group this person may reach at editor';

  -- (b) TWO PRINCIPALS, FOUR HAND-COMPUTED NUMBERS, still seated, never compared only to each
  --     other. `test@test.com` is a member of this organization, so at `viewer` the
  --     organization lane reaches her to all six — asserted here, because a door that refused
  --     her everything would satisfy the `editor` clauses below exactly as a correct one does.
  --     At `editor` she reaches exactly the ONE record shared with her at that level, and its
  --     amount says WHICH one: a door that answered "one row" for everybody would pass the
  --     count and fail the sum.
  select sum(a.row_count) into v_admin from custom.record_aggregate(v_org, v_t) a;
  if v_admin <> 6 then
    raise exception 'AGT-N-8 FAIL: admin@admin.com holds access here and must count all 6 — the positive control — and counted %', v_admin;
  end if;

  perform set_config('request.jwt.claims', c_dana_j, true);
  select coalesce(sum(a.row_count), 0) into v_test from custom.record_aggregate(v_org, v_t) a;
  if v_test <> 6 then
    raise exception 'AGT-N-8 FAIL: test@test.com is a member of this organization, so at viewer the organization lane reaches her to all 6, and she counted %', v_test;
  end if;
  select coalesce(sum(a.row_count), 0) into v_test
    from custom.record_aggregate(v_org, v_t, '[]'::jsonb, '[]'::jsonb, null, '{}'::jsonb, 200, 'editor') a;
  if v_test <> 1 then
    raise exception 'AGT-N-8 FAIL: exactly one of these six records was shared with test@test.com at editor and her editor aggregate counts %', v_test;
  end if;
  select (a.measures ->> 'sum_amount')::numeric into v_total
    from custom.record_aggregate(v_org, v_t, '[]'::jsonb,
           jsonb_build_array(jsonb_build_object('op','sum','key','amount')),
           null, '{}'::jsonb, 200, 'editor') a;
  if v_total <> 100 then
    raise exception 'AGT-N-8 FAIL: the one record shared with test@test.com at editor holds 100 and her total reads % — the aggregate is summing rows she may not change', coalesce(v_total::text, 'nothing');
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'AGT-N-8 PASS (two principals): the same aggregate counts 6 summing 2200 for admin@admin.com, 6 for test@test.com at viewer (the organization lane) and 1 summing 100 for her at editor — four hand-computed numbers, one query, every one from the client seat';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — a Field key is a key, and never a fragment of SQL.
  -- ════════════════════════════════════════════════════════════════════════════
  begin
    perform * from custom.record_aggregate(v_org, v_t,
      jsonb_build_array('status'') , (select 1))--'));
  exception when others then
    v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok then
    raise exception 'FAIL: a group name carrying SQL was accepted';
  end if;

  -- THE POSITIVE CONTROL, and it is the same call with a legal key: the refusal is about the
  -- SHAPE of the name, not about the function refusing work.
  select sum(a.row_count) into v_n from custom.record_aggregate(v_org, v_t,
    jsonb_build_array('status'), jsonb_build_array(jsonb_build_object('op','count'))) a;
  if v_n <> 6 then
    raise exception 'FAIL: the positive control should still count 6 and counted %', v_n;
  end if;
  raise notice 'PASS: a group name carrying SQL is refused by name ("%"), and the same call with a legal key still answers 6', left(v_msg, 60);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 and 5 — DOOR-18: a subscription over a saved view, now and on a schedule.
  --
  -- THIS WHOLE PART IS A SERVER LANE and steps OUT of the seat and says so.
  -- `custom.agg_subscription_fire` and `custom.agg_digest_run` hold NO client grant and no
  -- `platform.client_callable_door` row: a subscription fires from the write path and the
  -- digest from the scheduler, both on the server, and a browser that could fire either would
  -- be sending somebody else's notifications. `platform.saved_view` and the Rule rows that
  -- carry the subscriptions have no person's door either. No clause below asserts anything
  -- about what a person MAY do; every access clause of this suite is in PART 2 and PART 6.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);

  insert into platform.saved_view (name, surface_key, organization_id, definition, visibility)
  values ('Open deals', 'custom/records', v_org,
          jsonb_build_object('table_id', v_t::text, 'filters', jsonb_build_object('status', 'open')),
          'internal'::platform.visibility)
  returning id into v_open;

  insert into platform.saved_view (name, surface_key, organization_id, definition, visibility)
  values ('All deals', 'custom/records', v_org,
          jsonb_build_object('table_id', v_t::text, 'filters', '{}'::jsonb),
          'internal'::platform.visibility)
  returning id into v_all;

  -- TWO subscriptions over the SAME organization: one immediate on one channel, one digest on
  -- another. DOOR-18's "immediately or on a schedule, per channel" is one mechanism, so both
  -- are Rule records of the same kind differing in two keys.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
            'kind','predicate','name','Notify on close','sort',10,
            'uses', jsonb_build_array('membership'),
            'expr', jsonb_build_object('op','const','args', jsonb_build_array(true)),
            'message','this deal counts','applies_to_types','[]'::jsonb,
            'scope_table_id', v_t::text,
            'subscription', jsonb_build_object(
              'saved_view_id', v_open::text, 'cadence','immediate','channel','in_app',
              'recipient_user_id', c_admin::text,
              'event_key','records.changed'))),
         (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
            'kind','predicate','name','Monday pipeline digest','sort',20,
            'uses', jsonb_build_array('membership'),
            'expr', jsonb_build_object('op','const','args', jsonb_build_array(true)),
            'message','this deal counts','applies_to_types','[]'::jsonb,
            'scope_table_id', v_t::text,
            'subscription', jsonb_build_object(
              'saved_view_id', v_all::text, 'cadence','digest','schedule','0 9 * * 1',
              'channel','email','recipient_user_id', c_admin::text,
              'event_key','records.changed')));

  -- (a) IMMEDIATE. D1 is `open`, so the "open deals" view admits it and the subscription fires.
  v_fired := custom.agg_subscription_fire(v_org, v_d1, v_t);
  if v_fired <> 1 then
    raise exception 'DOOR-18 FAIL: exactly one immediate subscription admits D1, and % fired', v_fired;
  end if;

  -- (b) THE NEGATIVE CONTROL that makes (a) mean something: D5 is `lost`, the same view does
  --     NOT admit it, and the same call fires nothing. Without this, a function that notified
  --     everybody about everything would pass (a).
  if custom.agg_subscription_fire(v_org, v_d5, v_t) <> 0 then
    raise exception 'DOOR-18 FAIL: a record the saved view does not admit still fired a subscription';
  end if;

  -- (c) THE DELIVERY ROW. DOOR-18 is proven by a real row in the platform's own notification
  --     system — never by a subscription existing, and never by a scheduled job existing.
  select count(*) into v_rows
    from communication.notification
   where organization_id = v_org and dedupe_key like 'custom.subscription:%';
  if v_rows < 1 then
    raise exception 'DOOR-18 FAIL: the immediate subscription landed no delivery row';
  end if;
  raise notice 'DOOR-18 PASS (immediate): one subscription fired for D1 and none for a record its view excludes, landing % real delivery row(s) in communication.notification', v_rows;

  -- (d) IDEMPOTENCE. The same event replayed writes the same dedupe key, so a replayed outbox
  --     is one message and not many.
  if custom.agg_subscription_fire(v_org, v_d1, v_t) <> 1 then
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

  -- BACK IN THE SEAT for the clauses that are a person's question.
  perform set_config('role', 'authenticated', true);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — THE NEGATIVE CLAUSES, AS A REAL SECOND PERSON.
  -- PART 2 (b) proves the aggregate counts exactly what `test@test.com` may reach at each
  -- level. This part proves the other side of the same seat: the ONE record she was given is
  -- hers and the five she was not given are not. Both were unaskable from the old seat — as
  -- the owner of `custom.record`, `custom.assert_client_may_reach` returned true on its first
  -- line for every organization on the database.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 6a. A record nobody shared with her is not HERS TO CHANGE. She is a member, so the
  --     organization lane lets her read it — and the level ladder is what stops there.
  v_msg := null;
  begin
    perform custom.record_delete(v_org, v_d5);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'AGT-N-8 FAIL: test@test.com deleted a record nobody shared with her';
  end if;

  -- 6b. Nor can she change the shape of a table she is not an admin of.
  v_msg := null;
  begin
    perform custom.field_declare(v_org, v_t, jsonb_build_object('key','sneaked','label','Sneaked in','plain','text'));
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'AGT-N-8 FAIL: test@test.com added a column to a table she is not an admin of';
  end if;

  -- 6c. THE CONTROL, so 6a and 6b are not a door that refuses her everything: the record she
  --     IS given, she reads, and the ladder answers editor on it and below editor on the one
  --     she was not given.
  if (custom.read_record(v_org, v_d1, true) ->> 'title') <> 'D1' then
    raise exception 'AGT-N-8 FAIL: the record shared with test@test.com at editor does not read back for her';
  end if;
  if custom.my_level(v_org, v_d1) < 'editor'::public.permission_level then
    raise exception 'AGT-N-8 FAIL: D1 was shared with test@test.com at editor and her level on it reads %', custom.my_level(v_org, v_d1);
  end if;
  if custom.my_level(v_org, v_d5) >= 'editor'::public.permission_level then
    raise exception 'AGT-N-8 FAIL: nothing was shared with test@test.com on D5 and her level on it reads % — the ladder is not resolving per record', custom.my_level(v_org, v_d5);
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'AGT-N-8 PASS (the second person): test@test.com cannot delete a record she was not given and cannot add a column; the one record she WAS given reads back and answers editor, while the one she was not answers below it — so PART 2''s numbers are the ladder resolving per record, not a door that refuses her everything.';

  raise notice '════ W4-AGG GREEN SUITE PASSED — AGT-N-8 1a-1c, 2a-2b, 3, DOOR-18 4a-5e, control 6 — every asserted product clause from the seat `authenticated`, through custom.record_aggregate and custom.agg_explain. ════';
end $t$;

rollback;
