-- LANE STORE-VERSION-NOOP (defect 2) — AN HOURLY SUMMARY HOLDS TO THE HOUR. GREEN, AT A FIXED CLOCK.
--
-- THE USE CASE. Cascade Backflow Testing's office manager (admin@admin.com) watches the
-- "Failed this season" view of Backflow Test Readings with an HOURLY in-app summary: every hour
-- on the hour, the assemblies that failed since the last summary, so a re-test crew can be sent
-- the same day. Most hours nothing fails, and an empty summary is (rightly) never sent.
--
-- WHAT WAS WRONG (production, 2026-09-23 03:03Z: Rincon's hourly rule "due" at 2026-09-22
-- 17:00Z while the cron succeeded every 5 minutes). The runner worked out the next slot from the
-- last summary it SENT (`custom.agg_last_digest_at` reads communication.notification). A quiet
-- hour sends nothing, so after one quiet hour the due time stopped moving: it stayed in the past,
-- the runner re-checked on every 5-minute tick, and the next failure was sent within 5 minutes of
-- happening instead of on the hour. The screen's "next summary" was in the past too. The ruling:
-- the runner tracks the last slot it CHECKED, separately from the last summary it SENT.
--
-- WHAT IT PROVES (the notifier's runner is server-only by design, so those calls step out to the
-- connected role and say so; the subscription and the readings are made from the seat):
--   1  REAL CLOCK, the API that exists before and after the fix: after the last summary was sent
--      three hours ago and the runner then checks an hour with nothing in it, the person's own
--      door (`custom.subscriptions`) says the next summary is at the top of the NEXT hour — not
--      in the past. (Before the fix: 3 hours ago + 1 hour, i.e. two hours in the past. RED.)
--   2  FIXED CLOCK H+0:01 — a quiet slot is checked: nothing sent, the checked slot moves to it
--   3  FIXED CLOCK H+0:30 — a reading failed at H+0:20; the runner does NOT send mid-hour
--   4  FIXED CLOCK H+1:01 — the top of the next hour: exactly one summary, naming the assembly
--   5  the next summary is H+2:00; a quiet H+2:01 check keeps the schedule on the hour (H+3:00)
-- `custom.agg_digest_tick_at(now, organization)` is the tick with its clock handed in; the cron's
-- `custom.agg_digest_tick()` calls it with now(). Ends in ROLLBACK.

\set ON_ERROR_STOP on
\set suite 'storeversionnoop_digest_green.sql'
\set requires 'grant:authenticated:custom.subscription_declare|grant:authenticated:custom.subscriptions|grant:authenticated:custom.view_declare|function:custom.agg_digest_run'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss  text := current_user;
  v_org   uuid := gen_random_uuid();
  v_home  uuid; v_tbl uuid; v_view uuid; v_rule uuid; v_r1 uuid; v_r2 uuid;
  v_t     timestamptz := now();                               -- the transaction's one instant
  v_h     timestamptz := date_trunc('hour', now()) + interval '2 hours';
  v_next  timestamptz; v_slot timestamptz; v_i int; v_n int; v_body text;
begin
  perform set_config('app.actor_system', 'campaign-test/storeversionnoop_digest_green', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Cascade Backflow Testing', 'cascade-backflow-testing-'||substr(v_org::text,1,8), 'CBT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/storeversionnoop_digest_green');

  -- ── the seat: the office manager builds the table, the view and the hourly summary ──────
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Cascade Backflow Testing', '_actor', 'user'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Backflow Test Readings','slug','backflow_test_readings','type','entity','display','list',
    'ordered',false,'weight','light','retention_days',2555,'row_order','sorted',
    'default_sort', jsonb_build_array(jsonb_build_object('field','assembly','direction','asc')),
    'agent_writable',true,'label_singular','Backflow Test Reading','label_plural','Backflow Test Readings',
    'title_field','assembly','parent_id',v_home,
    'fields', jsonb_build_array(jsonb_build_object('name','assembly'), jsonb_build_object('name','result'))));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Assembly','key','assembly','type','text','required',true));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Result','key','result','type','text'));
  v_view := custom.view_declare(v_org, v_tbl, jsonb_build_object(
    'name','Failed this season','filters', jsonb_build_object('result','fail')));
  v_rule := custom.subscription_declare(v_org, v_tbl, jsonb_build_object(
    'name','Failed tests, hourly','saved_view_id', v_view,'cadence','hourly','channel','in_app'));
  v_r1 := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'assembly','RP assembly SN 4471-A, 1422 Alder Ct','result','fail','_actor','user'));

  -- ══ 1 — REAL CLOCK. Stepping out: the runner is server-only. ══════════════════════════════
  perform set_config('role', v_boss, true);
  v_i := custom.agg_digest_run(v_org, v_rule, null);
  if v_i <> 1 then
    raise exception '1a: the first hourly summary sent % messages, not 1', v_i;
  end if;
  -- Put that summary three hours back, and the reading's change with it, so the hour the runner
  -- checks next is genuinely empty. (Inside one transaction now() never moves; the facts do.)
  update communication.notification n
     set payload = jsonb_set(n.payload, '{window_end}', to_jsonb(v_t - interval '3 hours'))
   where n.organization_id = v_org and n.payload ->> 'rule_id' = v_rule::text;
  update custom.io_outbox o set created_at = v_t - interval '3 hours 10 minutes'
   where o.organization_id = v_org;
  v_i := custom.agg_digest_run(v_org, v_rule, null);
  if v_i <> 0 then
    raise exception '1b: a summary of an hour with nothing in it was sent (% messages)', v_i;
  end if;
  perform set_config('role', 'authenticated', true);
  select s.next_digest_at into v_next from custom.subscriptions(v_org, v_tbl) s where s.rule_id = v_rule;
  if v_next is distinct from date_trunc('hour', v_t) + interval '1 hour' then
    raise exception '1: after the runner checked a quiet hour the next summary reads % — it must be % (the top of the next hour). The runner is scheduling from the last summary SENT (% ago), so it re-checks every tick and sends off the hour',
      v_next, date_trunc('hour', v_t) + interval '1 hour', interval '3 hours';
  end if;
  raise notice '1 PASSED — after a quiet hour was checked, the next summary is % (the next hour, not the past)', v_next;

  -- ══ 2 — FIXED CLOCK H+0:01, a quiet slot ══════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  v_i := custom.agg_digest_tick_at(v_h + interval '1 minute', v_org);
  v_slot := custom.agg_digest_judged_at(v_org, v_rule);
  if v_i <> 0 or v_slot is distinct from v_h + interval '1 minute' then
    raise exception '2: the quiet check at % sent % and left the checked slot at %', v_h + interval '1 minute', v_i, v_slot;
  end if;
  raise notice '2 PASSED — the quiet slot at % was checked and nothing was sent', v_slot;

  -- ══ 3 — FIXED CLOCK H+0:30, a failure at H+0:20 waits for the hour ═══════════════════════
  perform set_config('role', 'authenticated', true);
  v_r2 := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'assembly','DC assembly SN 2210-C, 88 Birch Ln','result','fail','_actor','user'));
  perform set_config('role', v_boss, true);
  update custom.io_outbox o set created_at = v_h + interval '20 minutes'
   where o.organization_id = v_org and o.record_id = v_r2;
  v_i := custom.agg_digest_tick_at(v_h + interval '30 minutes', v_org);
  if v_i <> 0 then
    raise exception '3: the hourly summary was sent mid-hour at % (% messages)', v_h + interval '30 minutes', v_i;
  end if;
  if custom.agg_digest_judged_at(v_org, v_rule) is distinct from v_h + interval '1 minute' then
    raise exception '3: a tick that was not due moved the checked slot to %', custom.agg_digest_judged_at(v_org, v_rule);
  end if;
  raise notice '3 PASSED — at H+0:30 the failure from H+0:20 waits for the hour';

  -- ══ 4 — FIXED CLOCK H+1:01, the top of the next hour ═════════════════════════════════════
  v_i := custom.agg_digest_tick_at(v_h + interval '1 hour 1 minute', v_org);
  if v_i <> 1 then
    raise exception '4: at the top of the hour % summaries were sent, not 1', v_i;
  end if;
  select count(*), max(n.body) into v_n, v_body from communication.notification n
   where n.organization_id = v_org and n.payload ->> 'rule_id' = v_rule::text
     and (n.payload ->> 'window_end')::timestamptz = v_h + interval '1 hour 1 minute';
  if v_n <> 1 or v_body not like '%DC assembly SN 2210-C%' then
    raise exception '4: the H+1:01 summary is % row(s) reading "%"', v_n, v_body;
  end if;
  raise notice '4 PASSED — one summary at H+1:01: %', v_body;

  -- ══ 5 — the schedule holds to the hour ═══════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  select s.next_digest_at into v_next from custom.subscriptions(v_org, v_tbl) s where s.rule_id = v_rule;
  if v_next is distinct from v_h + interval '2 hours' then
    raise exception '5a: after the H+1:01 summary the next one reads %, not %', v_next, v_h + interval '2 hours';
  end if;
  perform set_config('role', v_boss, true);
  v_i := custom.agg_digest_tick_at(v_h + interval '2 hours 1 minute', v_org);
  perform set_config('role', 'authenticated', true);
  select s.next_digest_at into v_next from custom.subscriptions(v_org, v_tbl) s where s.rule_id = v_rule;
  if v_i <> 0 or v_next is distinct from v_h + interval '3 hours' then
    raise exception '5b: a quiet H+2:01 check sent % and the next summary reads %, not %', v_i, v_next, v_h + interval '3 hours';
  end if;
  raise notice '5 PASSED — next summary H+2:00, and after a quiet H+2:01 check, H+3:00';
  raise notice 'storeversionnoop_digest_green: ALL 5 CLAUSES PASSED';
end $suite$;

rollback;
