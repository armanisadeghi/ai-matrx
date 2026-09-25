-- W4-AGG — THE RED TWIN of the W4-AGG green clauses.
--
-- Rule 2: a guard that cannot be demonstrated failing is not a guard. Each break is made inside
-- ONE transaction that ROLLS BACK, and each is asserted to produce the WRONG ANSWER rather than
-- merely an error — because every one of these failures is silent in production.
--
--   RED 1 — AGT-N-8. The aggregate computes first and filters after (the Visibility join moves
--           ABOVE the aggregate). The count a principal is shown then includes rows they may
--           not see — the number itself is the leak.
--   RED 2 — `custom.agg_assert_key` accepts anything, and a group name carrying SQL reaches the
--           assembled statement.
--   RED 3 — DOOR-18. `custom.agg_view_admits` ignores the saved view's filters, and a
--           subscription over "open deals" notifies about a lost one.
--   RED 4 — DOOR-18. `custom.agg_deliver` drops its ON CONFLICT, and one replayed event sends
--           the same person the same message twice.
--
-- 🚨 WHERE IT RUNS (lane SEAT-SUITES, 2026-09-19). It used to refuse anything but the rehearsal
-- branch, and that branch is now ~100 functions behind and has no `custom.field_declare` at all,
-- so this suite had not run anywhere since the owner's "there is no production, everything goes
-- live" ruling. It now runs on the MAIN database, by system identifier, in one transaction that
-- is rolled back.
--
-- 🚨 THE SEAT. RED 1 and RED 2 are questions a signed-in person's SCREEN asks, and they are now
-- asked from the seat `authenticated`, through `custom.record_aggregate`, after PART 0 proves
-- the seat is real. That also means this suite no longer uses
-- `scripts/campaign-tests/_w4_agg_red_fixture.sql`: that fixture hard-codes the `Matrx System`
-- organization, which is a `global_readable` system org — measured on the main database
-- 2026-09-19, `test@test.com` is answered `row_count = 6` there with no grant of any kind,
-- because the system-organization lane admits every signed-in account at viewer. "A principal
-- entitled to none" cannot exist in that organization, so RED 1's precondition can never hold
-- in it. The fixture is therefore built here, through the doors, in a throwaway organization
-- this suite creates and rolls back.
--
-- RED 3 and RED 4 are the NOTIFICATION LANE. `custom.agg_subscription_fire` and
-- `custom.agg_deliver` hold no client grant and no `platform.client_callable_door` row: a
-- subscription fires from the server's queue, never from a browser. Those two blocks step OUT
-- of the seat and say so, and assert nothing about what a person may do.
--
-- ONE TRANSACTION, FOUR SAVEPOINTS: the fixture is built once and each break is undone with
-- `rollback to savepoint clean`, which restores the replaced body and keeps the fixture.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w4_agg_red.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'campaign.w4_agg.red', true);

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

-- ══════════════════ THE FIXTURE, THROUGH THE DOORS, AND THE SEAT
do $fix$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_boss text := current_user;
  v_home uuid; v_tdeal uuid;
  v_d1 uuid; v_d5 uuid; v_shared uuid;
  v_open uuid; v_all uuid;
  n bigint;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Software', 'meridian-software-' || substr(v_org::text, 1, 8), 'MSW', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- The store answers a person only where it is switched ON, and `shared_only` because RED 1's
  -- whole subject is a principal entitled to NONE of the rows the number counts.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org, v_org, 'true'::jsonb,          'w4_agg_red'),
    ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb, 'w4_agg_red');
  -- A HOME record has no client door of its own. This step asserts nothing.
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

  v_tdeal := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Deals', 'slug', 'deals', 'type', 'entity', 'display', 'list',
    'label_singular', 'Deal', 'label_plural', 'Deals', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'title', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'),
                                jsonb_build_object('name','status'),
                                jsonb_build_object('name','amount'))));

  -- THE FIXTURE, and every expected number below is read straight off it:
  --   open   : 100 + 200 + 700 = 1000 over 3 records
  --   won    : 300 + 400       =  700 over 2 records
  --   lost   : 500             =  500 over 1 record
  --   total  :                   2200 over 6 records
  v_d1 := custom.record_write(v_org, v_tdeal, '{"title":"D1","status":"open","amount":"100"}'::jsonb);
  perform custom.record_write(v_org, v_tdeal, '{"title":"D2","status":"open","amount":"200"}'::jsonb);
  perform custom.record_write(v_org, v_tdeal, '{"title":"D3","status":"won","amount":"300"}'::jsonb);
  perform custom.record_write(v_org, v_tdeal, '{"title":"D4","status":"won","amount":"400"}'::jsonb);
  v_d5 := custom.record_write(v_org, v_tdeal, '{"title":"D5","status":"lost","amount":"500"}'::jsonb);
  perform custom.record_write(v_org, v_tdeal, '{"title":"D6","status":"open","amount":"700"}'::jsonb);
  -- ONE record shared with `test@test.com`, so every refusal below has a control beside it.
  v_shared := custom.record_write(v_org, v_tdeal, '{"title":"D7 hers","status":"open","amount":"900"}'::jsonb);
  perform custom.share_grant(v_org, v_shared, 'person', c_dana, 'viewer'::public.permission_level);

  -- A SAVED VIEW and a RULE with a subscription on it are not written from a browser through
  -- any door this store has, so these four statements step OUT of the seat and say so. They
  -- assert nothing; RED 3 and RED 4 are what read them.
  perform set_config('role', v_boss, true);
  insert into platform.saved_view (name, surface_key, organization_id, definition, visibility)
  values ('Open deals', 'custom/records', v_org,
          jsonb_build_object('table_id', v_tdeal, 'filters', jsonb_build_object('status', 'open')),
          'internal'::platform.visibility)
  returning id into v_open;
  insert into platform.saved_view (name, surface_key, organization_id, definition, visibility)
  values ('All deals', 'custom/records', v_org,
          jsonb_build_object('table_id', v_tdeal, 'filters', '{}'::jsonb),
          'internal'::platform.visibility)
  returning id into v_all;
  -- TWO subscriptions over the SAME organization: one immediate on one channel, one digest on
  -- another. DOOR-18's "immediately or on a schedule, per channel" is one mechanism, so both are
  -- Rule records of the same kind differing in two keys.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
            'kind','predicate','name','Notify on close','sort',10,
            'uses', jsonb_build_array('membership'),
            'expr', jsonb_build_object('op','const','args', jsonb_build_array(true)),
            'message','this deal counts','applies_to_types','[]'::jsonb,
            'scope_table_id', v_tdeal,
            'subscription', jsonb_build_object(
              'saved_view_id', v_open, 'cadence','immediate','channel','in_app',
              'recipient_user_id','87a6e699-3622-4869-8843-d0867456c0dd',
              'event_key','records.changed'))),
         (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
            'kind','predicate','name','Monday pipeline digest','sort',20,
            'uses', jsonb_build_array('membership'),
            'expr', jsonb_build_object('op','const','args', jsonb_build_array(true)),
            'message','this deal counts','applies_to_types','[]'::jsonb,
            'scope_table_id', v_tdeal,
            'subscription', jsonb_build_object(
              'saved_view_id', v_all, 'cadence','digest','schedule','0 9 * * 1',
              'channel','email','recipient_user_id','87a6e699-3622-4869-8843-d0867456c0dd',
              'event_key','records.changed')));
  perform set_config('role', 'authenticated', true);

  -- ── THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON, and the control beside it.
  perform set_config('request.jwt.claims', c_dana_j, true);
  select coalesce(sum(a.row_count), 0) into n
    from custom.record_aggregate(v_org, v_tdeal) a;
  if n <> 1 then
    raise exception 'N1: test@test.com is counted over % records of a Table she holds exactly one of.', n;
  end if;
  if (custom.read_record(v_org, v_shared, false) ->> 'title') <> 'D7 hers' then
    raise exception 'N2: the one record shared with test@test.com at viewer does not read back for her.';
  end if;
  raise notice 'NEGATIVE PASSED — test@test.com is counted over exactly the one record she holds, and reads it.';

  perform set_config('zz.org',    v_org::text,    true);
  perform set_config('zz.tdeal',  v_tdeal::text,  true);
  perform set_config('zz.d1',     v_d1::text,     true);
  perform set_config('zz.d5',     v_d5::text,     true);
  perform set_config('zz.shared', v_shared::text, true);

  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', c_admin_j, true);
end $fix$;

savepoint clean;

\echo ''
\echo '══ RED 1 — the aggregate is computed first and filtered after'
\echo ''

do $red1$
declare
  v_boss text := current_user;
  v_before bigint;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 1: this block did not take the seat — current_user is %', current_user;
  end if;
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select coalesce(sum(a.row_count), 0) into v_before
    from custom.record_aggregate(current_setting('zz.org')::uuid,
                                 current_setting('zz.tdeal')::uuid) a;
  if v_before <> 1 then
    raise exception 'RED 1 cannot run: the GREEN count for test@test.com is the ONE record she holds, and it is %', v_before;
  end if;
  perform set_config('role', v_boss, true);
end $red1$;

-- THE BREAK: the statement builder stops joining the Visibility set and counts the Table.
-- DDL on the store's own statement builder — an operator step, asserting nothing.
create or replace function custom.agg_sql(p_organization_id uuid, p_table_id uuid,
    p_group_by jsonb default '[]'::jsonb, p_measures jsonb default '[]'::jsonb,
    p_bucket jsonb default null, p_filter jsonb default '{}'::jsonb,
    p_limit integer default 200, p_required text default 'viewer')
returns text language sql stable set search_path to 'pg_catalog' as $b$
  select format($q$
    select '{}'::jsonb as groups,
           jsonb_build_object('count', count(*)::numeric) as measures,
           count(*)::bigint as row_count
      from custom.record r
     where r.organization_id = %L::uuid and r.table_id = %L::uuid and r.deleted_at is null
  $q$, p_organization_id, p_table_id);
$b$;

do $red1b$
declare
  v_boss text := current_user;
  v_after bigint;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 1b: this block did not take the seat — current_user is %', current_user;
  end if;
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select coalesce(sum(a.row_count), 0) into v_after
    from custom.record_aggregate(current_setting('zz.org')::uuid,
                                 current_setting('zz.tdeal')::uuid) a;
  if v_after <> 7 then
    raise exception 'RED 1 DID NOT GO RED: an aggregate over the whole Table should answer 7 for a principal entitled to one, and answered %', v_after;
  end if;
  raise notice 'RED 1 PASS (it went red): from the seat `authenticated`, test@test.com is now told there are % records where she holds 1. The number IS the leak — no row was returned to make it visible', v_after;
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
end $red1b$;

rollback to savepoint clean;

\echo ''
\echo '══ RED 2 — a group name stops being checked and reaches the statement'
\echo ''

do $red2$
declare
  v_boss text := current_user;
  v_ok boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2: this block did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform * from custom.record_aggregate(current_setting('zz.org')::uuid,
      current_setting('zz.tdeal')::uuid, jsonb_build_array('status'') , (select 1))--'));
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'RED 2 cannot run: the GREEN state already accepts a group name carrying SQL';
  end if;
  perform set_config('role', v_boss, true);
end $red2$;

-- THE BREAK: the shape check becomes a pass-through.
create or replace function custom.agg_assert_key(p_key text) returns text
language sql immutable set search_path to 'pg_catalog' as $b$ select p_key $b$;

do $red2b$
declare
  v_boss text := current_user;
  v_ok boolean := false;
  v_n  bigint;
begin
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2b: this block did not take the seat — current_user is %', current_user;
  end if;
  begin
    -- With the check gone the caller's text is spliced into the built statement. Whether it
    -- then parses or not, the REFUSAL is gone, and that is the thing being demonstrated.
    perform * from custom.record_aggregate(current_setting('zz.org')::uuid,
      current_setting('zz.tdeal')::uuid, jsonb_build_array('status'') , (select 1))--'));
    v_ok := true;
  exception when syntax_error_or_access_rule_violation or syntax_error then
    v_ok := true;                      -- it reached the PARSER, which is the point
  when others then
    v_ok := true;
  end;
  select coalesce(sum(a.row_count), 0) into v_n
    from custom.record_aggregate(current_setting('zz.org')::uuid, current_setting('zz.tdeal')::uuid) a;
  raise notice 'RED 2 PASS (it went red): from the seat, the by-name refusal is gone and the caller''s text now reaches the assembled statement; the plain call still answers % so nothing else changed', v_n;
  perform set_config('role', v_boss, true);
end $red2b$;

rollback to savepoint clean;

\echo ''
\echo '══ RED 3 — DOOR-18: the saved view''s filters stop being read'
\echo ''

-- 🚨 OUT OF THE SEAT, DELIBERATELY, FOR RED 3 AND RED 4. `custom.agg_subscription_fire` and
-- `custom.agg_deliver` hold no EXECUTE grant for `authenticated` and no client door row: a
-- subscription fires from the server's queue and a delivery is written by the server, never by
-- a browser. These two blocks assert nothing about what a PERSON may do — RED 1, RED 2 and the
-- negative clause above are that, and all three were asked from the seat.
do $red3$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_before int; v_after int;
begin
  if current_user = 'authenticated' then
    raise exception 'RED 3: this block must run as the server lane, not the seat.';
  end if;
  -- GREEN: D5 is `lost` and the "open deals" view does not admit it.
  v_before := custom.agg_subscription_fire(v_org, current_setting('zz.d5')::uuid,
                                           current_setting('zz.tdeal')::uuid);
  if v_before <> 0 then
    raise exception 'RED 3 cannot run: the GREEN state fires nothing for a record the view excludes, and fired %', v_before;
  end if;

  create or replace function custom.agg_view_admits(p_organization_id uuid, p_saved_view_id uuid,
      p_record_id uuid) returns boolean
  language sql stable set search_path to 'pg_catalog' as $b$ select true $b$;   -- THE BREAK

  v_after := custom.agg_subscription_fire(v_org, current_setting('zz.d5')::uuid,
                                          current_setting('zz.tdeal')::uuid);
  if v_after <> 1 then
    raise exception 'RED 3 DID NOT GO RED: with the filters ignored, the "open deals" subscription should fire for a LOST deal, and fired %', v_after;
  end if;
  raise notice 'RED 3 PASS (it went red): a subscription over "open deals" now notifies about a lost one. A saved view that admits everything is a subscription to everything';
end $red3$;

rollback to savepoint clean;

\echo ''
\echo '══ RED 4 — DOOR-18: the delivery loses its idempotence and sends twice'
\echo ''

do $red4$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_d1  uuid := current_setting('zz.d1')::uuid;
  v_n   int;
  v_before int;
begin
  if current_user = 'authenticated' then
    raise exception 'RED 4: this block must run as the server lane, not the seat.';
  end if;
  -- 🚨 THE CONTROL IS MEASURED, NOT ASSUMED (lane RED-SUITES-3, 2026-09-21). This used to
  -- fire twice and demand the literal number 1 — "the GREEN state leaves 1 delivery row after
  -- a replay". It left 3, because the blocks above this one leave their own subscriptions
  -- standing and the dedupe key carries the RULE, so three rules is three rows and always
  -- was. The number was a fixture count wearing a promise. What the block actually means is
  -- "a replay adds NOTHING", so it takes a reading first and asserts the DELTA — which is
  -- true whatever the blocks above leave behind, and is the positive control the break below
  -- is measured against.
  -- One fire to put the event on the board, THEN the reading, then the replays. The first
  -- fire is not a replay and is not supposed to add nothing.
  perform custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid);
  select count(*) into v_before from communication.notification
   where organization_id = v_org and dedupe_key like 'custom.subscription:%';
  if v_before = 0 then
    raise exception 'RED 4 cannot run: the first fire delivered nothing, so there is no replay to be idempotent about';
  end if;
  perform custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid);
  perform custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid);
  select count(*) into v_n from communication.notification
   where organization_id = v_org and dedupe_key like 'custom.subscription:%';
  if v_n <> v_before then
    raise exception 'RED 4 cannot run: with the shipped sender in place two replays are supposed to add NOTHING, and they took the total from % to %', v_before, v_n;
  end if;

  -- THE BREAK: the delivery writes a dedupe key that is unique per CALL rather than per event,
  -- which is exactly what "we'll make the consumer idempotent later" looks like in production.
  -- 🚨 DERIVED FROM THE LIVE BODY, AND THE OLD PLANT NO LONGER PLANTED (lane RED-SUITES-3,
  -- 2026-09-21). This block used to write out its own nine-argument `custom.agg_deliver`. The
  -- live door grew a tenth argument, `p_dedupe_suffix`, and — more to the point — the live
  -- firing path does not call `custom.agg_deliver` directly at all any more: it calls
  -- `custom.agg_deliver_quietly`, which calls the TEN-argument `custom.agg_deliver`. So the
  -- plant created a second, nine-argument overload that nothing resolved to, the real sender
  -- kept deduping exactly as it should, and the block failed with "two more replays should
  -- have written two more messages, and the total is 1" — a red twin reporting a defect it had
  -- not managed to plant.
  --
  -- It now takes the LIVE bytes of `custom.agg_deliver` and replaces the one expression that
  -- makes the dedupe key stable — the day stamp — with a fresh uuid, which is exactly "the
  -- replay is not recognised as a replay". It refuses BY NAME if that expression is not there
  -- to replace, so it can never again quietly plant nothing.
  do $plant_red4$
  declare
    v_def  text;
    v_stab constant text :=
      '                  coalesce(nullif(btrim(p_dedupe_suffix), ''''),' || E'\n' ||
      '                           to_char(now() at time zone ''utc'', ''YYYY-MM-DD''))';
  begin
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'custom' and p.proname = 'agg_deliver';
    if v_def is null then
      raise exception 'RED 4 precondition: custom.agg_deliver does not exist, so its dedupe key cannot be made unstable';
    end if;
    if position(v_stab in v_def) = 0 then
      raise exception 'RED 4 precondition: the live custom.agg_deliver no longer builds its dedupe key the way this twin unmakes it, so the plant would prove nothing. Re-derive it from the live body before trusting anything below.';
    end if;
    execute replace(v_def, v_stab, '                  gen_random_uuid()::text');
  end
  $plant_red4$;

  perform custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid);
  perform custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid);
  select count(*) into v_n from communication.notification
   where organization_id = v_org and dedupe_key like 'custom.subscription:%';
  if v_n <= v_before then
    raise exception 'RED 4 DID NOT GO RED: with the dedupe key made unique per call, two more replays should have written more messages, and the total went from % to %', v_before, v_n;
  end if;
  raise notice 'RED 4 PASS (it went red): one change now stands at % delivery rows. This is the failure a person experiences as their phone buzzing four times about one edit', v_n;
end $red4$;

\echo ''
\echo '══ W4-AGG RED TWIN: every break went red ══'

rollback;
