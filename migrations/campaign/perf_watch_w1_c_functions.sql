-- chair-step: the REVOKEs withdraw EXECUTE from public/anon/authenticated on the functions this same file creates (server-only write path, declared in platform.client_callable_door); nothing that existed before is narrowed. Emits no policy.
--
-- perf_watch_w1_c_functions.sql
--
-- PERFORMANCE WATCH, WAVE 1 — THE RULE, THE WRITE PATH, THE DOOR PROBE, THE ALERTS.
-- Design: common-docs/systems/architecture/observability/performance-watch/PLAN.md §1, §2 (door
-- probe), §4 (regression rule), §5 (alerting), Knobs. Storage from perf_watch_w1_a / _b.
--
--   ops.perf_judge_rule(history, watch, knobs, now)   the PURE rule (§4): no table read, so it is
--                                                      tested on synthetic histories
--   ops.perf_judge(check_id)                          the rule over the watch's own stored history
--   ops.perf_watch_declare(...)                        idempotent upsert by slug (§1)
--   ops.perf_record_sample(check_id, source, stats)    insert → judge → transition → alert/resolve
--   ops.perf_alert(items)                              one system_error + one bell per platform
--                                                      admin; grouped when ≥ perf.group_alert_min
--   ops.perf_probe_run()                               the door probe (§2), run by pg_cron
--   ops.perf_sample_retention()                        soft-deletes samples past the knob
--
-- WHY ops.perf_probe_run IS NOT SECURITY DEFINER: Postgres refuses `SET ROLE` inside a security-
-- definer function, and the probe's whole point is to call each door as the probe seat (JWT claims
-- + role `authenticated`, the same RLS and code PostgREST runs). It runs as the pg_cron job owner
-- (postgres), refuses any other caller, and EXECUTE is revoked from every client role.
--
-- EVERY PROBE CALL IS ROLLED BACK: each timed call runs in a BEGIN…EXCEPTION block that always
-- raises SQLSTATE PWRB1 after timing, so the subtransaction aborts — no row, no realtime event,
-- no audit, no notification survives, and the role / claims set inside it revert with it. A door's
-- own error is caught separately and counted in `errors`.
-- Inverse: migrations/inverse/perf_watch_w1_c_functions_down.sql.

-- ── Knobs (feature `perf`, wave-1 set) ─────────────────────────────────────────────────────────
insert into platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value,
                                   label, description, set_by, basis, review_due, overridable_by)
values
  ('perf', 'enabled', to_jsonb(true), to_jsonb(true), 'boolean', null, null, null,
   'Performance watch on',
   'When off, the door probe does nothing and no performance alert is raised.',
   'agent', 'performance-watch PLAN Knobs: the whole watch has one off switch.', date '2027-01-08', '{}'),
  ('perf', 'probe_cadence_minutes', to_jsonb(15), to_jsonb(15), 'integer', 'minutes', 5, 1440,
   'Door probe cadence',
   'How often the door probe runs. A watch is probed when its own cadence has passed.',
   'agent', 'PLAN §2: 15 minutes gives 96 samples a day — enough for a 7-day baseline, cheap enough to be invisible.', date '2027-01-08', '{}'),
  ('perf', 'probe_calls', to_jsonb(10), to_jsonb(10), 'integer', 'calls', 3, 100,
   'Timed calls per door',
   'After one warm-up, the probe times this many calls of each door and keeps p50, p95, max and mean.',
   'agent', 'PLAN §2: 10 calls make a stable p95 of a warm door at about one second of database time per door.', date '2027-01-08', '{}'),
  ('perf', 'probe_run_timeout_seconds', to_jsonb(90), to_jsonb(90), 'integer', 'seconds', 15, 600,
   'Probe run wall cap',
   'A probe run stops starting new doors this close to its statement timeout; skipped doors say so.',
   'agent', 'PLAN §2: the job runs under statement_timeout 90 s; the wall cap leaves 15 s for the last door and the alerts.', date '2027-01-08', '{}'),
  ('perf', 'probe_max_active_share', to_jsonb(0.6), to_jsonb(0.6), 'number', 'share', 0.05, 1,
   'Skip probe when busy',
   'The probe skips its whole run when active connections exceed this share of max_connections.',
   'agent', 'PLAN §2: a probe must never add load to a database already under pressure.', date '2027-01-08', '{}'),
  ('perf', 'eval_window', to_jsonb(3), to_jsonb(3), 'integer', 'samples', 1, 20,
   'Samples judged together',
   'A watch is judged on the median of its last this-many samples, so one slow sample never alerts.',
   'agent', 'PLAN §4: median of 3 absorbs one GC pause or lock wait.', date '2027-01-08', '{}'),
  ('perf', 'baseline_min_samples', to_jsonb(12), to_jsonb(12), 'integer', 'samples', 3, 1000,
   'Samples before a baseline',
   'A watch stays learning until this many healthy samples exist; the regression line needs them.',
   'agent', 'PLAN §4: 12 samples = 3 hours of the 15-minute probe.', date '2027-01-08', '{}'),
  ('perf', 'baseline_days', to_jsonb(7), to_jsonb(7), 'integer', 'days', 1, 90,
   'Baseline window',
   'The baseline is the median of the healthy samples of this many days, frozen while the watch is not ok.',
   'agent', 'PLAN §4: one week covers every weekday pattern.', date '2027-01-08', '{}'),
  ('perf', 'regression_pct', to_jsonb(50), to_jsonb(50), 'number', 'percent', 5, 1000,
   'Regression: percent over baseline',
   'A watch has regressed when its judged value is this much over its baseline (and over the other two lines).',
   'agent', 'PLAN §4: 50% is a change a person feels; less is noise on warm probes.', date '2027-01-08', '{}'),
  ('perf', 'regression_min_ms', to_jsonb(50), to_jsonb(50), 'number', 'ms', 0, 100000,
   'Regression: minimum milliseconds',
   'A regression must also be at least this many milliseconds over the baseline, so a 4 ms door going to 8 ms never alerts.',
   'agent', 'PLAN §4: under 50 ms nobody notices.', date '2027-01-08', '{}'),
  ('perf', 'regression_mad_k', to_jsonb(4), to_jsonb(4), 'number', 'MADs', 0, 100,
   'Regression: spread multiplier',
   'A regression must also exceed the baseline by this many median absolute deviations, so a naturally jumpy door is judged on its own spread.',
   'agent', 'PLAN §4: 4 MAD is the robust equivalent of about 2.7 standard deviations.', date '2027-01-08', '{}'),
  ('perf', 'alert_cooldown_minutes', to_jsonb(60), to_jsonb(60), 'integer', 'minutes', 0, 10080,
   'Alert cooldown after recovery',
   'After a watch recovers, a new alert for it waits this long, so a flapping door alerts once.',
   'agent', 'PLAN §4 flap guard.', date '2027-01-08', '{}'),
  ('perf', 'group_alert_min', to_jsonb(3), to_jsonb(3), 'integer', 'watches', 2, 1000,
   'Group alerts from',
   'When this many watches turn bad in one collector run, one grouped alert lists them all instead of one each.',
   'agent', 'PLAN §5: three doors slowing together is the database, not three bugs.', date '2027-01-08', '{}'),
  ('perf', 'sample_retention_days', to_jsonb(180), to_jsonb(180), 'integer', 'days', 7, 3650,
   'Sample history kept',
   'Samples older than this are moved to the trash by a daily job.',
   'agent', 'PLAN §3: six months answers "since which release" for any slowdown.', date '2027-01-08', '{}')
on conflict (feature, key) do nothing;

-- ── The alert event (in-app bell to platform admins) ──────────────────────────────────────────
insert into communication.notification_event_type (event_key, label, description, default_channels, config,
                                                   enabled, organization_id)
select 'platform.perf.watch_alert', 'A performance watch turned bad',
       'A watched database door, statement or job went over its budget, regressed against its baseline, started failing, or its probe broke.',
       '{"in_app": true}'::jsonb,
       jsonb_build_object(
         'bucket', 'direct', 'mandatory', false, 'alert_tier', 'actionable', 'digestible', false,
         'pair_dm_with_email', false, 'sms_locked', true, 'routing_mode', 'declared_audience',
         'declared_by', 'PERF-WATCH wave 1 (performance-watch PLAN §5)', 'target_kind', null,
         'deep_link_template', '/administration/reporting/performance', 'sensitivity_ceiling', 'internal',
         'templates', jsonb_build_object(
           'in_app', jsonb_build_object('subject', '{{notice.subject}}', 'body', '{{notice.line}}'),
           'dm', jsonb_build_object('body', '{{notice.line}}'))),
       true, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
 where not exists (select 1 from communication.notification_event_type where event_key = 'platform.perf.watch_alert');

-- ── The pure rule (PLAN §4) ────────────────────────────────────────────────────────────────────
-- p_history: samples of the watch's OWN source, newest first:
--   [{measured_at, n, errors, p50_ms, p95_ms, mean_ms, p75_ms, max_ms, state_after}, ...]
--   history[0] is the sample just recorded (its state_after is ignored).
-- p_watch: {budget_ms, budget_stat, state, baseline_pinned, baseline_ms, last_recovery_at}
-- p_knobs: {eval_window, baseline_min_samples, baseline_days, regression_pct, regression_min_ms,
--           regression_mad_k, alert_cooldown_minutes} — any missing key takes the PLAN default.
create or replace function ops.perf_judge_rule(p_history jsonb, p_watch jsonb, p_knobs jsonb, p_now timestamptz)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_hist jsonb := coalesce(p_history, '[]'::jsonb);
  v_stat text := coalesce(nullif(p_watch->>'budget_stat', ''), 'p95');
  v_key text;
  v_budget numeric := nullif(p_watch->>'budget_ms', '')::numeric;
  v_prior text := nullif(p_watch->>'state', '');
  v_pinned boolean := coalesce((p_watch->>'baseline_pinned')::boolean, false);
  v_window int := coalesce((p_knobs->>'eval_window')::int, 3);
  v_min_n int := coalesce((p_knobs->>'baseline_min_samples')::int, 12);
  v_days numeric := coalesce((p_knobs->>'baseline_days')::numeric, 7);
  v_pct numeric := coalesce((p_knobs->>'regression_pct')::numeric, 50);
  v_min_ms numeric := coalesce((p_knobs->>'regression_min_ms')::numeric, 50);
  v_k numeric := coalesce((p_knobs->>'regression_mad_k')::numeric, 4);
  v_cool numeric := coalesce((p_knobs->>'alert_cooldown_minutes')::numeric, 60);
  v_last_recovery timestamptz := nullif(p_watch->>'last_recovery_at', '')::timestamptz;
  v_latest jsonb := v_hist->0;
  v_judged numeric;
  v_baseline numeric;
  v_base_n int;
  v_mad numeric := 0;
  v_line numeric;
  v_state text;
  v_reason text;
  v_bad constant text[] := array['over_budget', 'regressed', 'erroring', 'stale', 'probe_broken'];
  v_alert boolean := false;
  v_suppressed text;
begin
  v_key := v_stat || '_ms';
  if v_latest is null then
    return jsonb_build_object('state', coalesce(v_prior, 'learning'), 'reason', 'no sample to judge',
                              'transition', false, 'alert', false, 'prior_state', v_prior);
  end if;

  -- erroring: every call of the newest sample failed (or nothing was measured).
  if coalesce((v_latest->>'n')::int, 0) = 0
     or coalesce((v_latest->>'errors')::int, 0) >= coalesce((v_latest->>'n')::int, 0) then
    v_state := 'erroring';
    v_reason := format('all %s calls of the newest sample failed', coalesce(v_latest->>'n', '0'));
  else
    -- judged value: median of the bound stat over the newest eval_window samples that measured it
    select percentile_cont(0.5) within group (order by (h.s->>v_key)::numeric)
      into v_judged
      from jsonb_array_elements(v_hist) with ordinality h(s, i)
     where h.i <= v_window and nullif(h.s->>v_key, '') is not null
       and coalesce((h.s->>'errors')::int, 0) < coalesce((h.s->>'n')::int, 0);

    -- baseline: pinned by a person, else the median of the older healthy samples within the
    -- window of days. Healthy = judged ok (or learning) at the time — so samples taken while
    -- the watch was bad never enter it: the baseline is FROZEN during a regression.
    with base as (
      select (h.s->>v_key)::numeric v
        from jsonb_array_elements(v_hist) with ordinality h(s, i)
       where h.i > v_window
         and h.s->>'state_after' in ('ok', 'learning')
         and nullif(h.s->>v_key, '') is not null
         and (nullif(h.s->>'measured_at', '') is null
              or (h.s->>'measured_at')::timestamptz >= p_now - make_interval(secs => v_days * 86400))
    )
    select count(*), percentile_cont(0.5) within group (order by v) into v_base_n, v_baseline from base;
    if v_base_n > 0 then
      select percentile_cont(0.5) within group (order by abs(x.v - v_baseline)) into v_mad
        from (select (h.s->>v_key)::numeric v
                from jsonb_array_elements(v_hist) with ordinality h(s, i)
               where h.i > v_window and h.s->>'state_after' in ('ok', 'learning')
                 and nullif(h.s->>v_key, '') is not null
                 and (nullif(h.s->>'measured_at', '') is null
                      or (h.s->>'measured_at')::timestamptz >= p_now - make_interval(secs => v_days * 86400))) x;
    end if;
    if v_pinned and nullif(p_watch->>'baseline_ms', '') is not null then
      v_baseline := (p_watch->>'baseline_ms')::numeric;
    end if;

    if v_judged is null then
      v_state := 'erroring';
      v_reason := format('no %s measured in the last %s samples', v_stat, v_window);
    elsif v_budget is not null and v_judged > v_budget then
      v_state := 'over_budget';
      v_reason := format('%s %s ms (median of last %s) is over the %s ms budget', v_stat, round(v_judged, 1), v_window, v_budget);
    elsif not (v_pinned and v_baseline is not null) and v_base_n < v_min_n then
      v_state := 'learning';
      v_reason := format('learning: %s of %s healthy samples for a baseline', v_base_n, v_min_n);
    else
      v_line := v_baseline + greatest(v_baseline * v_pct / 100, v_min_ms, v_k * coalesce(v_mad, 0));
      if v_judged > v_line then
        v_state := 'regressed';
        v_reason := format('%s %s ms is over the regression line %s ms (baseline %s ms)', v_stat, round(v_judged, 1), round(v_line, 1), round(v_baseline, 1));
      else
        v_state := 'ok';
        v_reason := case when v_prior = any (v_bad)
                         then format('recovered: %s %s ms is within budget and baseline', v_stat, round(v_judged, 1))
                         else format('%s %s ms', v_stat, round(v_judged, 1)) end;
      end if;
    end if;
  end if;

  -- Alert only on a transition INTO a bad state from a good one, never inside the cooldown that
  -- follows a recovery (flap guard).
  if v_state = any (v_bad) and not (coalesce(v_prior, 'learning') = any (v_bad)) then
    if v_last_recovery is not null and v_last_recovery > p_now - make_interval(secs => v_cool * 60) then
      v_suppressed := format('cooldown: recovered %s, alerts wait %s minutes', v_last_recovery, v_cool);
    else
      v_alert := true;
    end if;
  end if;

  return jsonb_build_object(
    'state', v_state, 'reason', v_reason, 'prior_state', v_prior,
    'transition', v_state is distinct from v_prior,
    'recovered', (v_prior = any (v_bad)) and not (v_state = any (v_bad)),
    'alert', v_alert, 'alert_suppressed', v_suppressed,
    'judged_ms', round(v_judged, 3), 'baseline_ms', round(v_baseline, 3), 'baseline_n', coalesce(v_base_n, 0),
    'mad_ms', round(v_mad, 3), 'stat', v_stat, 'budget_ms', v_budget);
end;
$function$;

-- The knobs the rule reads, resolved once (platform scope).
create or replace function ops.perf_knobs()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select jsonb_object_agg(k.key, platform.knob_resolve('perf', k.key, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, null, null) #> '{}')
    from platform.feature_knob k
   where k.feature = 'perf';
$function$;

-- The rule over a watch's own stored history (its own collector's source only).
create or replace function ops.perf_judge(p_check_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  c ops.proof_check%rowtype;
  v_knobs jsonb := ops.perf_knobs();
  v_source text;
  v_hist jsonb;
begin
  select * into c from ops.proof_check where id = p_check_id and kind = 'perf';
  if not found then
    raise exception 'perf_judge: % is not a perf watch', p_check_id using errcode = 'P0002';
  end if;
  v_source := case c.perf_kind when 'door' then 'probe' when 'statement' then 'statement'
                               when 'job' then 'job' when 'vital' then 'vital' else 'probe' end;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.measured_at desc, s.id), '[]'::jsonb) into v_hist
    from (select id, measured_at, n, errors, p50_ms, p95_ms, mean_ms, max_ms, null::numeric p75_ms, state_after
            from ops.perf_sample
           where check_id = p_check_id and source = v_source and deleted_at is null
             and measured_at >= now() - make_interval(days => coalesce((v_knobs->>'baseline_days')::int, 7) + 1)
           order by measured_at desc
           limit 2000) s;
  return ops.perf_judge_rule(
    v_hist,
    jsonb_build_object('budget_ms', c.budget_ms, 'budget_stat', c.budget_stat, 'state', c.perf_state,
                       'baseline_pinned', c.perf_baseline_pinned, 'baseline_ms', c.perf_baseline_ms,
                       'last_recovery_at', c.metadata->>'perf_last_recovery_at'),
    v_knobs, now());
end;
$function$;

-- ── Declare (PLAN §1) ──────────────────────────────────────────────────────────────────────────
-- Idempotent by slug. Code owns the subject, label, cadence and owner; a budget a person changed
-- after the last declare (budget_ms <> metadata.perf_declared_budget_ms) is never overwritten.
-- A paused watch (is_active false) stays paused.
create or replace function ops.perf_watch_declare(
  p_slug text, p_perf_kind text, p_label text, p_subject jsonb, p_budget_ms numeric,
  p_budget_stat text, p_cadence_seconds integer, p_owner text, p_source_feature text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c ops.proof_check%rowtype;
  v_person_budget boolean;
begin
  if coalesce(btrim(p_slug), '') = '' or coalesce(btrim(p_label), '') = '' then
    raise exception 'perf_watch_declare: a watch needs a slug and a label' using errcode = '22023';
  end if;
  if p_perf_kind is null or p_perf_kind not in ('door', 'statement', 'job', 'vital', 'page') then
    raise exception 'perf_watch_declare: perf_kind % is not door|statement|job|vital|page', p_perf_kind using errcode = '22023';
  end if;
  if jsonb_typeof(p_subject) is distinct from 'object' then
    raise exception 'perf_watch_declare: the subject must say how the watch is measured (a json object)' using errcode = '22023';
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  select * into c from ops.proof_check where slug = p_slug for update;
  if not found then
    insert into ops.proof_check (
      slug, label, description, surface, source_app, source_feature, live_every_seconds, max_cost_usd,
      is_active, organization_id, created_by, kind, perf_kind, perf_subject, budget_ms, budget_stat,
      owner, perf_state, perf_state_since, metadata)
    values (
      p_slug, p_label, p_label, 'perf_watch', 'database', coalesce(nullif(p_source_feature, ''), 'perf'),
      coalesce(p_cadence_seconds, 900), 0, true, v_sys, v_actor, 'perf', p_perf_kind, p_subject,
      p_budget_ms, coalesce(p_budget_stat, 'p95'), p_owner, 'learning', now(),
      jsonb_build_object('perf_declared_budget_ms', p_budget_ms))
    returning * into c;
    return c.id;
  end if;
  if c.kind <> 'perf' then
    raise exception 'perf_watch_declare: slug % belongs to a % check', p_slug, c.kind using errcode = '23505';
  end if;
  v_person_budget := c.budget_ms is distinct from nullif(c.metadata->>'perf_declared_budget_ms', '')::numeric;
  update ops.proof_check
     set label = p_label, description = p_label, perf_kind = p_perf_kind, perf_subject = p_subject,
         budget_stat = coalesce(p_budget_stat, budget_stat),
         live_every_seconds = coalesce(p_cadence_seconds, live_every_seconds),
         owner = coalesce(p_owner, owner),
         source_feature = coalesce(nullif(p_source_feature, ''), source_feature),
         budget_ms = case when v_person_budget then budget_ms else p_budget_ms end,
         metadata = metadata || case when v_person_budget
                                     then jsonb_build_object('perf_budget_set_by_person', true, 'perf_code_budget_ms', p_budget_ms)
                                     else jsonb_build_object('perf_declared_budget_ms', p_budget_ms) end,
         deleted_at = null
   where id = c.id;
  return c.id;
end;
$function$;

-- ── Alerts (PLAN §5) ───────────────────────────────────────────────────────────────────────────
-- p_items: [{check_id, slug, label, state, prior_state, judged_ms, budget_ms, stat, baseline_ms,
--            owner, reason}]. One item → one system_error + one bell per platform admin. At least
-- perf.group_alert_min items (and ≥ 2) → ONE grouped row + one bell per admin listing them all.
create or replace function ops.perf_alert(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_n int := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  v_group_min int := greatest(2, coalesce((platform.knob_resolve('perf', 'group_alert_min', v_sys, null, null) #>> '{}')::int, 3));
  it jsonb;
  v_err uuid;
  v_errors jsonb := '[]'::jsonb;
  v_notified int := 0;
  v_admin uuid;
  v_subject text;
  v_line text;
  v_dedupe text;
  v_link text;
  v_ids jsonb;
begin
  if v_n = 0 then
    return jsonb_build_object('alerted', 0);
  end if;
  if v_n >= v_group_min then
    select jsonb_agg(i->'check_id'), string_agg(format('%s (%s)', i->>'label', i->>'state'), ', ')
      into v_ids, v_line from jsonb_array_elements(v_items) i;
    v_subject := format('%s performance watches turned bad at once', v_n);
    v_line := format('%s turned bad in one probe run — database slow? %s', v_n, v_line);
    v_dedupe := 'perf_watch:group:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS');
    v_link := '/administration/reporting/performance';
    v_err := ops.record_system_error(jsonb_build_object(
      'kind', 'perf_watch_alert', 'error_type', 'perf_watch:group', 'route', 'ops.perf_alert',
      'source_app', 'database', 'source_feature', 'perf',
      'error_text', 'Several performance watches turned bad in one probe run (database slow?).',
      'created_by', v_actor,
      'context', jsonb_build_object('signature', 'perf_watch:group', 'check_ids', v_ids, 'items', v_items, 'line', v_line)));
    v_errors := v_errors || to_jsonb(v_err);
    for v_admin in select a.user_id from admin.admins a join auth.users u on u.id = a.user_id order by a.user_id loop
      perform communication.notify_from_sql(v_sys, 'platform.perf.watch_alert', v_admin, null, null,
        jsonb_build_object('notice', jsonb_build_object('subject', v_subject, 'line', v_line), 'items', v_items),
        v_link, null, null, v_dedupe || ':' || v_admin, '{}'::jsonb);  -- the key is unique across recipients
      v_notified := v_notified + 1;
    end loop;
  else
    for it in select * from jsonb_array_elements(v_items) loop
      v_subject := format('%s is %s', it->>'label', replace(it->>'state', '_', ' '));
      v_line := format('%s: %s %s ms vs budget %s ms (owner %s). %s', it->>'label', it->>'stat',
                       coalesce(it->>'judged_ms', '—'), coalesce(it->>'budget_ms', '—'),
                       coalesce(it->>'owner', 'nobody'), it->>'reason');
      v_dedupe := format('perf_watch:%s:%s:%s', it->>'slug', it->>'state', to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'));
      v_link := '/administration/reporting/performance?watch=' || (it->>'check_id');
      v_err := ops.record_system_error(jsonb_build_object(
        'kind', 'perf_watch_alert', 'error_type', format('perf_watch:%s:%s', it->>'slug', it->>'state'),
        'route', 'ops.perf_record_sample', 'source_app', 'database', 'source_feature', 'perf',
        'error_text', format('Performance watch %s is %s.', it->>'slug', it->>'state'),
        'created_by', v_actor,
        'context', jsonb_build_object('signature', format('perf_watch:%s:%s', it->>'slug', it->>'state'),
                                      'check_ids', jsonb_build_array(it->'check_id'), 'item', it, 'line', v_line)));
      v_errors := v_errors || to_jsonb(v_err);
      for v_admin in select a.user_id from admin.admins a join auth.users u on u.id = a.user_id order by a.user_id loop
        perform communication.notify_from_sql(v_sys, 'platform.perf.watch_alert', v_admin, null, null,
          jsonb_build_object('notice', jsonb_build_object('subject', v_subject, 'line', v_line), 'item', it),
          v_link, null, null, v_dedupe || ':' || v_admin, '{}'::jsonb);  -- the key is unique across recipients
        v_notified := v_notified + 1;
      end loop;
    end loop;
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  update ops.proof_check set perf_last_alert_at = now()
   where id in (select (i->>'check_id')::uuid from jsonb_array_elements(v_items) i);
  return jsonb_build_object('alerted', v_n, 'grouped', v_n >= v_group_min, 'system_errors', v_errors, 'notifications', v_notified);
end;
$function$;

-- ── Record a sample (insert → judge → transition → alert / resolve) ───────────────────────────
-- p_stats: {n, p50_ms, p95_ms, max_ms, mean_ms, calls, errors, bytes, release_sha, note, measured_at}
-- p_defer_alert: the probe collects every alert of its run and sends them together (grouping).
create or replace function ops.perf_record_sample(
  p_check_id uuid, p_source text, p_stats jsonb, p_defer_alert boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c ops.proof_check%rowtype;
  v_s jsonb := coalesce(p_stats, '{}'::jsonb);
  v_own text;
  v_id uuid;
  v_at timestamptz;
  j jsonb;
  v_item jsonb;
  v_alert jsonb;
  v_resolved int := 0;
  v_bad constant text[] := array['over_budget', 'regressed', 'erroring', 'stale', 'probe_broken'];
begin
  if p_source is null or p_source not in ('probe', 'statement', 'job', 'vital', 'cli') then
    raise exception 'perf_record_sample: source % is not probe|statement|job|vital|cli', p_source using errcode = '22023';
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  select * into c from ops.proof_check where id = p_check_id and kind = 'perf' for update;
  if not found then
    raise exception 'perf_record_sample: % is not a perf watch', p_check_id using errcode = 'P0002';
  end if;
  v_own := case c.perf_kind when 'door' then 'probe' when 'statement' then 'statement'
                            when 'job' then 'job' when 'vital' then 'vital' else 'probe' end;
  insert into ops.perf_sample (check_id, measured_at, source, n, p50_ms, p95_ms, max_ms, mean_ms, calls, errors,
                               bytes, release_sha, note, organization_id, created_by)
  values (c.id, coalesce((v_s->>'measured_at')::timestamptz, now()), p_source,
          coalesce((v_s->>'n')::int, 0), (v_s->>'p50_ms')::numeric, (v_s->>'p95_ms')::numeric,
          (v_s->>'max_ms')::numeric, (v_s->>'mean_ms')::numeric, (v_s->>'calls')::bigint,
          coalesce((v_s->>'errors')::int, 0), (v_s->>'bytes')::bigint, v_s->>'release_sha',
          left(v_s->>'note', 1000), v_sys, v_actor)
  returning id, measured_at into v_id, v_at;

  -- Other sources are shown, never judged (a CLI number never moves a probe baseline).
  if p_source <> v_own or not c.is_active then
    update ops.perf_sample set state_after = c.perf_state where id = v_id;
    return jsonb_build_object('sample_id', v_id, 'judged', false, 'state', c.perf_state);
  end if;

  j := ops.perf_judge(c.id);
  update ops.perf_sample
     set state_after = j->>'state',
         note = concat_ws(' · ', nullif(note, ''), j->>'reason')
   where id = v_id;
  update ops.proof_check
     set perf_state = j->>'state',
         perf_state_since = case when (j->>'transition')::boolean then now() else perf_state_since end,
         perf_baseline_ms = case when perf_baseline_pinned then perf_baseline_ms
                                 else coalesce((j->>'baseline_ms')::numeric, perf_baseline_ms) end,
         last_run_at = v_at,
         last_verdict = case when j->>'state' = any (v_bad) then 'fail' else 'pass' end,
         metadata = metadata
                    || case when (j->>'recovered')::boolean then jsonb_build_object('perf_last_recovery_at', now()) else '{}'::jsonb end
                    || jsonb_build_object('perf_last_reason', j->>'reason')
   where id = c.id;

  -- Recovery resolves this watch's open alert rows (and a grouped row once none of its watches is bad).
  if (j->>'recovered')::boolean then
    update ops.system_error
       set resolved_at = now(), resolution_note = 'perf watch recovered: ' || (j->>'reason')
     where kind = 'perf_watch_alert' and resolved_at is null
       and error_type like 'perf_watch:' || c.slug || ':%';
    get diagnostics v_resolved = row_count;
    update ops.system_error e
       set resolved_at = now(), resolution_note = 'every watch in this group recovered'
     where e.kind = 'perf_watch_alert' and e.resolved_at is null and e.error_type = 'perf_watch:group'
       and e.context->'check_ids' @> jsonb_build_array(c.id)
       and not exists (select 1 from ops.proof_check w
                        where w.id::text in (select jsonb_array_elements_text(e.context->'check_ids'))
                          and w.perf_state = any (v_bad));
  end if;

  if (j->>'alert')::boolean then
    v_item := jsonb_build_object('check_id', c.id, 'slug', c.slug, 'label', c.label, 'state', j->>'state',
                                 'prior_state', j->>'prior_state', 'judged_ms', j->'judged_ms',
                                 'budget_ms', c.budget_ms, 'stat', j->>'stat', 'baseline_ms', j->'baseline_ms',
                                 'owner', c.owner, 'reason', j->>'reason');
    if not p_defer_alert then
      v_alert := ops.perf_alert(jsonb_build_array(v_item));
    end if;
  end if;
  return jsonb_build_object('sample_id', v_id, 'judged', true, 'state', j->>'state', 'prior_state', j->>'prior_state',
                            'transition', (j->>'transition')::boolean, 'reason', j->>'reason',
                            'alert_item', v_item, 'alert', v_alert, 'resolved_errors', v_resolved,
                            'alert_suppressed', j->>'alert_suppressed');
end;
$function$;

-- The SQL that calls one door with its pinned arguments ($1 = the args object). Named notation,
-- each argument cast to the door's own declared type. The result is measured by size, which also
-- forces the whole result to be built (as PostgREST would serialise it).
create or replace function ops.perf_door_sql(p_subject jsonb)
returns text
language plpgsql
stable
set search_path = pg_catalog
as $function$
declare
  v_fn regprocedure;
  v_names text[];
  v_types oid[];
  v_args jsonb := coalesce(p_subject->'args', '{}'::jsonb);
  k text;
  v_pos int;
  v_type text;
  v_parts text[] := '{}';
begin
  v_fn := to_regprocedure(format('%I.%I(%s)', p_subject->>'schema', p_subject->>'function', coalesce(p_subject->>'argtypes', '')));
  if v_fn is null then
    return null;
  end if;
  -- 1-based on both sides (an oidvector cast to oid[] keeps its 0 lower bound).
  select p.proargnames,
         (select array_agg(t order by o) from unnest(p.proargtypes) with ordinality u(t, o))
    into v_names, v_types from pg_proc p where p.oid = v_fn;
  for k in select jsonb_object_keys(v_args) loop
    v_pos := array_position(v_names, k);
    if v_pos is null then
      raise exception 'perf_door_sql: % has no argument %', v_fn, k using errcode = '42883';
    end if;
    v_type := format_type(v_types[v_pos], null);
    v_parts := v_parts || case
      when v_type = 'jsonb' then format('%I => nullif($1->%L, ''null''::jsonb)', k, k)
      when v_type = 'json' then format('%I => nullif($1->%L, ''null''::jsonb)::json', k, k)
      when v_type like '%[]' then format('%I => (case when jsonb_typeof($1->%L) = ''array'' then array(select jsonb_array_elements_text($1->%L)) end)::%s', k, k, k, v_type)
      else format('%I => ($1->>%L)::%s', k, k, v_type) end;
  end loop;
  return format('select coalesce(sum(pg_column_size(t.*)), 0)::bigint from %I.%I(%s) t',
                p_subject->>'schema', p_subject->>'function', array_to_string(v_parts, ', '));
end;
$function$;

-- ── The door probe (PLAN §2) ───────────────────────────────────────────────────────────────────
create or replace function ops.perf_probe_run(p_only_check uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_knobs jsonb;
  v_me text := current_user;
  v_calls int;
  v_wall int;
  v_share numeric;
  v_active int;
  v_max int := current_setting('max_connections')::int;
  v_seat uuid;
  v_claims text;
  v_deadline timestamptz;
  w record;
  v_sql text;
  v_args jsonb;
  i int;
  v_t0 timestamptz;
  v_ms numeric;
  v_bytes bigint;
  v_times numeric[];
  v_errs int;
  v_first_err text;
  v_warm_err text;
  v_warm_state text;
  v_rec jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_done jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_alert_out jsonb;
  v_note text;
begin
  -- Run as the job owner only: the probe switches role per call and must switch back to it.
  if v_me <> 'postgres' then
    raise exception 'perf_probe_run runs as postgres (the pg_cron job owner), not %', v_me using errcode = '42501';
  end if;
  v_knobs := ops.perf_knobs();
  if not coalesce((v_knobs->>'enabled')::boolean, true) then
    return jsonb_build_object('skipped', 'perf.enabled is off');
  end if;
  v_calls := coalesce((v_knobs->>'probe_calls')::int, 10);
  v_wall := coalesce((v_knobs->>'probe_run_timeout_seconds')::int, 90) - 15;
  v_share := coalesce((v_knobs->>'probe_max_active_share')::numeric, 0.6);
  v_deadline := clock_timestamp() + make_interval(secs => greatest(v_wall, 5));
  perform set_config('lock_timeout', '1s', true);
  perform set_config('app.user_id', v_actor::text, true);

  -- Pre-flight: never add load to a database already under pressure.
  select count(*) into v_active from pg_stat_activity where state = 'active' and backend_type = 'client backend';
  if v_active > v_share * v_max then
    v_note := format('skipped: DB under pressure (%s active of %s max_connections)', v_active, v_max);
    update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_probe_note', v_note, 'perf_last_probe_at', now())
     where kind = 'perf' and perf_kind = 'door' and is_active and deleted_at is null;
    return jsonb_build_object('skipped', v_note);
  end if;

  -- The probe seat.
  select u.id into v_seat from auth.users u where u.email = 'admin@admin.com' and u.deleted_at is null;
  if v_seat is null then
    v_note := 'probe_broken: the probe seat admin@admin.com does not exist';
    for w in select p.id from ops.proof_check p
              where p.kind = 'perf' and p.perf_kind = 'door' and p.is_active and p.deleted_at is null
                and p.perf_state is distinct from 'probe_broken' loop
      update ops.proof_check set perf_state = 'probe_broken', perf_state_since = now(),
             metadata = metadata || jsonb_build_object('perf_last_reason', v_note) where id = w.id;
    end loop;
    if not exists (select 1 from ops.system_error where kind = 'perf_watch_alert' and error_type = 'perf_watch:collector:probe:probe_broken' and resolved_at is null) then
      perform ops.record_system_error(jsonb_build_object(
        'kind', 'perf_watch_alert', 'error_type', 'perf_watch:collector:probe:probe_broken', 'route', 'ops.perf_probe_run',
        'source_app', 'database', 'source_feature', 'perf', 'error_text', 'The performance door probe cannot run: ' || v_note,
        'created_by', v_actor, 'context', jsonb_build_object('signature', 'perf_watch:collector:probe:probe_broken')));
    end if;
    return jsonb_build_object('probe_broken', v_note);
  end if;
  v_claims := jsonb_build_object('sub', v_seat, 'role', 'authenticated', 'aud', 'authenticated',
                                 'email', 'admin@admin.com', 'perf_probe', true)::text;

  for w in
    select p.* from ops.proof_check p
     where p.kind = 'perf' and p.perf_kind = 'door' and p.is_active and p.deleted_at is null
       and (p_only_check is null or p.id = p_only_check)
       and (p_only_check is not null or p.last_run_at is null
            or p.last_run_at <= now() - make_interval(secs => greatest(p.live_every_seconds - 60, 60)))
     order by p.last_run_at nulls first, p.slug
  loop
    if clock_timestamp() > v_deadline then
      v_skipped := v_skipped || jsonb_build_object('slug', w.slug, 'why', 'wall cap reached');
      update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_probe_note', 'skipped: wall cap reached', 'perf_last_probe_at', now())
       where id = w.id;
      continue;
    end if;
    v_sql := ops.perf_door_sql(w.perf_subject);
    v_args := coalesce(w.perf_subject->'args', '{}'::jsonb);
    v_warm_err := null; v_warm_state := null;
    if v_sql is null then
      v_warm_err := 'the door function does not exist';
      v_warm_state := '42883';
    else
      -- Warm-up: not counted, rolled back like every call.
      begin
        perform set_config('request.jwt.claims', v_claims, true);
        perform set_config('request.jwt.claim.sub', v_seat::text, true);
        perform set_config('role', 'authenticated', true);
        execute v_sql into v_bytes using v_args;
        raise exception using errcode = 'PWRB1', message = 'perf probe rollback';
      exception
        when sqlstate 'PWRB1' then null;
        when others then v_warm_err := sqlerrm; v_warm_state := sqlstate;
      end;
    end if;
    if current_user <> v_me then
      raise exception 'perf_probe_run: role did not return to % (is %)', v_me, current_user;
    end if;
    -- A missing door or a missing pinned fixture is the probe's fault, never the door's.
    if v_warm_state in ('42883', 'P0002', '42P01', '22P02') then
      v_note := format('probe_broken: %s (%s)', left(v_warm_err, 300), v_warm_state);
      update ops.proof_check set perf_state = 'probe_broken',
             perf_state_since = case when perf_state = 'probe_broken' then perf_state_since else now() end,
             metadata = metadata || jsonb_build_object('perf_last_reason', v_note, 'perf_last_probe_at', now())
       where id = w.id;
      if w.perf_state is distinct from 'probe_broken' then
        v_alerts := v_alerts || jsonb_build_object('check_id', w.id, 'slug', w.slug, 'label', w.label, 'state', 'probe_broken',
                                                   'prior_state', w.perf_state, 'budget_ms', w.budget_ms, 'stat', w.budget_stat,
                                                   'owner', w.owner, 'reason', v_note);
      end if;
      v_done := v_done || jsonb_build_object('slug', w.slug, 'state', 'probe_broken', 'note', v_note);
      continue;
    end if;

    v_times := '{}'; v_errs := 0; v_first_err := null;
    for i in 1 .. v_calls loop
      begin
        perform set_config('request.jwt.claims', v_claims, true);
        perform set_config('request.jwt.claim.sub', v_seat::text, true);
        perform set_config('role', 'authenticated', true);
        v_t0 := clock_timestamp();
        execute v_sql into v_bytes using v_args;
        v_ms := extract(epoch from clock_timestamp() - v_t0) * 1000;
        raise exception using errcode = 'PWRB1', message = 'perf probe rollback';
      exception
        when sqlstate 'PWRB1' then v_times := v_times || round(v_ms, 3);
        when others then
          v_errs := v_errs + 1;
          v_first_err := coalesce(v_first_err, sqlstate || ': ' || left(sqlerrm, 200));
      end;
      if current_user <> v_me then
        raise exception 'perf_probe_run: role did not return to % (is %)', v_me, current_user;
      end if;
    end loop;

    select ops.perf_record_sample(w.id, 'probe', jsonb_build_object(
             'n', v_calls, 'errors', v_errs, 'bytes', v_bytes,
             'p50_ms', (select round(percentile_cont(0.5) within group (order by t)::numeric, 3) from unnest(v_times) t),
             'p95_ms', (select round(percentile_cont(0.95) within group (order by t)::numeric, 3) from unnest(v_times) t),
             'max_ms', (select max(t) from unnest(v_times) t),
             'mean_ms', (select round(avg(t), 3) from unnest(v_times) t),
             'note', case when v_errs > 0 then format('%s of %s calls failed: %s', v_errs, v_calls, v_first_err) end),
           true)
      into v_rec;
    update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_probe_at', now()) - 'perf_last_probe_note'
     where id = w.id;
    if v_rec->'alert_item' is not null and jsonb_typeof(v_rec->'alert_item') = 'object' then
      v_alerts := v_alerts || jsonb_build_array(v_rec->'alert_item');
    end if;
    v_done := v_done || jsonb_build_object('slug', w.slug, 'state', v_rec->>'state',
                                           'p50_ms', (select round(percentile_cont(0.5) within group (order by t)::numeric, 1) from unnest(v_times) t),
                                           'p95_ms', (select round(percentile_cont(0.95) within group (order by t)::numeric, 1) from unnest(v_times) t),
                                           'errors', v_errs);
  end loop;

  if jsonb_array_length(v_alerts) > 0 then
    v_alert_out := ops.perf_alert(v_alerts);
  end if;
  return jsonb_build_object('probed', v_done, 'skipped', v_skipped, 'alerts', v_alert_out, 'as', current_user);
end;
$function$;

-- Retention (PLAN §3): soft-delete samples older than perf.sample_retention_days.
create or replace function ops.perf_sample_retention()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_days int := coalesce((platform.knob_resolve('perf', 'sample_retention_days', '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, null, null) #>> '{}')::int, 180);
  v_n int;
begin
  perform set_config('app.user_id', '87a6e699-3622-4869-8843-d0867456c0dd', true);
  update ops.perf_sample set deleted_at = now()
   where deleted_at is null and measured_at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'ops.perf_judge_rule(jsonb, jsonb, jsonb, timestamptz)',
    'ops.perf_knobs()',
    'ops.perf_judge(uuid)',
    'ops.perf_watch_declare(text, text, text, jsonb, numeric, text, integer, text, text)',
    'ops.perf_alert(jsonb)',
    'ops.perf_record_sample(uuid, text, jsonb, boolean)',
    'ops.perf_door_sql(jsonb)',
    'ops.perf_probe_run(uuid)',
    'ops.perf_sample_retention()'
  ] loop
    insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                               reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
           (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
           'Performance watch write path and probe (performance-watch PLAN §1–§5). Check ids are checked against ops.proof_check (kind perf) by the function itself; no caller identity is involved because no client may call it.',
           'matrx-frontend/migrations/campaign/perf_watch_w1_c_functions.sql',
           'server_only: the pg_cron job perf-watch-probe (as postgres) and the server are the only callers; samples and watch states are platform-admin-only internal records, so no browser or signed-in client ever writes them.',
           false, false
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.oid = f::regprocedure
       and not exists (select 1 from platform.client_callable_door d
                        where d.schema_name = n.nspname and d.function_name = p.proname
                          and d.identity_args = pg_get_function_identity_arguments(p.oid));
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;

-- Retention policy row: purge a trashed sample a week after the daily job trashes it.
insert into platform.retention_policy (scope, entity_token, organization_id, trigger_kind, mode, retention_days,
                                       label, description, basis, set_by, review_due)
select 'entity', 'ops_perf_sample', '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'soft_deleted', 'purge', 7,
       'Performance sample retention',
       'Purges a performance sample 7 days after the daily job trashed it (samples older than perf.sample_retention_days).',
       'performance-watch PLAN §3: the history is bounded by the daily job; a week in the trash covers any recovery.',
       'agent', date '2027-04-08'
 where not exists (select 1 from platform.retention_policy p where p.entity_token = 'ops_perf_sample'
                    and p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid);

-- ── In-file assertions: roll everything back unless each holds ────────────────────────────────
do $assert$
begin
  if not iam.canonical_certify_ok('ops', 'perf_sample', 'ops_perf_sample') then
    raise exception 'ops.perf_sample is not canonical-certified: %',
      (select string_agg(x::text, '; ') from iam.verify_canonical('ops', 'perf_sample', 'ops_perf_sample', 'system') x);
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'ops.perf_sample'::regclass and polname = 'platform_admin_read') then
    raise exception 'ops.perf_sample has no platform_admin_read — our own admin database access is required';
  end if;
  if has_table_privilege('authenticated', 'ops.perf_sample', 'INSERT')
     or has_table_privilege('authenticated', 'ops.perf_sample', 'UPDATE')
     or has_table_privilege('authenticated', 'ops.perf_sample', 'DELETE')
     or has_table_privilege('anon', 'ops.perf_sample', 'INSERT') then
    raise exception 'ops.perf_sample still grants a client write privilege';
  end if;
  if has_function_privilege('authenticated', 'ops.perf_record_sample(uuid, text, jsonb, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'ops.perf_probe_run(uuid)', 'EXECUTE') then
    raise exception 'a perf function is still callable by a client role';
  end if;
end
$assert$;

notify pgrst, 'reload schema';
