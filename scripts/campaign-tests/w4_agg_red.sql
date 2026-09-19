-- W4-AGG — THE RED TWIN of `scripts/campaign-tests/w4_agg_green.sql`.
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
-- Rehearsal branch only, by system identifier. Not a migration.

\set ON_ERROR_STOP on
\timing off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684 then
    raise exception 'w4_agg_red.sql runs on the rehearsal branch only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;
select set_config('app.actor_system', 'campaign.w4_agg.red', true);
\i scripts/campaign-tests/_w4_agg_red_fixture.sql

\echo ''
\echo '══ RED 1 — the aggregate is computed first and filtered after'
\echo ''

do $red1$
declare
  v_before bigint; v_after bigint;
begin
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select coalesce(sum(a.row_count), 0) into v_before
    from custom.record_aggregate(current_setting('zz.org')::uuid,
                                 current_setting('zz.tdeal')::uuid) a;
  if v_before <> 0 then
    raise exception 'RED 1 cannot run: the GREEN count for test@test.com is 0, and it is %', v_before;
  end if;

  -- THE BREAK: the statement builder stops joining the Visibility set and counts the Table.
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

  select coalesce(sum(a.row_count), 0) into v_after
    from custom.record_aggregate(current_setting('zz.org')::uuid,
                                 current_setting('zz.tdeal')::uuid) a;
  perform set_config('request.jwt.claims', '', true);

  if v_after <> 6 then
    raise exception 'RED 1 DID NOT GO RED: an aggregate over the whole Table should answer 6 for a principal entitled to none, and answered %', v_after;
  end if;
  raise notice 'RED 1 PASS (it went red): test@test.com is now told there are % records where they may see 0. The number IS the leak — no row was returned to make it visible', v_after;
end $red1$;

rollback;
begin;
select set_config('app.actor_system', 'campaign.w4_agg.red', true);
\i scripts/campaign-tests/_w4_agg_red_fixture.sql

\echo ''
\echo '══ RED 2 — a group name stops being checked and reaches the statement'
\echo ''

do $red2$
declare
  v_ok boolean := false;
  v_n  bigint;
begin
  begin
    perform * from custom.record_aggregate(current_setting('zz.org')::uuid,
      current_setting('zz.tdeal')::uuid, jsonb_build_array('status'') , (select 1))--'));
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'RED 2 cannot run: the GREEN state already accepts a group name carrying SQL';
  end if;

  -- THE BREAK: the shape check becomes a pass-through.
  create or replace function custom.agg_assert_key(p_key text) returns text
  language sql immutable set search_path to 'pg_catalog' as $b$ select p_key $b$;

  v_ok := false;
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
  raise notice 'RED 2 PASS (it went red): the by-name refusal is gone and the caller''s text now reaches the assembled statement; the plain call still answers % so nothing else changed', v_n;
end $red2$;

rollback;
begin;
select set_config('app.actor_system', 'campaign.w4_agg.red', true);
\i scripts/campaign-tests/_w4_agg_red_fixture.sql

\echo ''
\echo '══ RED 3 — DOOR-18: the saved view''s filters stop being read'
\echo ''

do $red3$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_before int; v_after int;
begin
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

rollback;
begin;
select set_config('app.actor_system', 'campaign.w4_agg.red', true);
\i scripts/campaign-tests/_w4_agg_red_fixture.sql

\echo ''
\echo '══ RED 4 — DOOR-18: the delivery loses its idempotence and sends twice'
\echo ''

do $red4$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_d1  uuid := current_setting('zz.d1')::uuid;
  v_n   int;
begin
  perform custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid);
  perform custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid);
  select count(*) into v_n from communication.notification
   where organization_id = v_org and dedupe_key like 'custom.subscription:%';
  if v_n <> 1 then
    raise exception 'RED 4 cannot run: the GREEN state leaves 1 delivery row after a replay, and left %', v_n;
  end if;

  -- THE BREAK: the delivery writes a dedupe key that is unique per CALL rather than per event,
  -- which is exactly what "we'll make the consumer idempotent later" looks like in production.
  create or replace function custom.agg_deliver(p_organization_id uuid, p_rule_id uuid,
      p_record_id uuid, p_channel text, p_recipient_user_id uuid, p_event_key text,
      p_subject text, p_body text, p_payload jsonb default '{}'::jsonb)
  returns uuid language plpgsql set search_path to 'pg_catalog' as $b$
  declare v_id uuid;
  begin
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind, dedupe_key,
       subject, body, payload, target_kind, target_id, visibility)
    values (p_organization_id, p_event_key, p_channel, p_recipient_user_id, 'user',
            format('custom.subscription:%s:%s:%s', p_rule_id, p_record_id, gen_random_uuid()),
            p_subject, p_body, coalesce(p_payload, '{}'::jsonb), 'custom.record', p_record_id,
            'personal'::platform.visibility)
    returning id into v_id;
    return v_id;
  end $b$;

  perform custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid);
  perform custom.agg_subscription_fire(v_org, v_d1, current_setting('zz.tdeal')::uuid);
  select count(*) into v_n from communication.notification
   where organization_id = v_org and dedupe_key like 'custom.subscription:%';
  if v_n < 3 then
    raise exception 'RED 4 DID NOT GO RED: two more replays should have written two more messages, and the total is %', v_n;
  end if;
  raise notice 'RED 4 PASS (it went red): one change now stands at % delivery rows. This is the failure a person experiences as their phone buzzing four times about one edit', v_n;
end $red4$;

\echo ''
\echo '══ W4-AGG RED TWIN: every break went red ══'

rollback;
