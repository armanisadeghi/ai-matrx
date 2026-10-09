-- chair-step: restores the pre-tail ops.perf_probe_run, ops.perf_health_run and ops.perf_watch_status bodies, drops the two group functions and returns the single perf-watch-probe cron job (every 15 minutes); the marker sample on each door watch stays as history.
CREATE OR REPLACE FUNCTION ops.perf_probe_run(p_only_check uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_default_seat constant text := 'admin@admin.com';
  v_knobs jsonb;
  v_me text := current_user;
  v_calls int;
  v_wall int;
  v_share numeric;
  v_active int;
  v_max int := current_setting('max_connections')::int;
  v_seats jsonb := '{}'::jsonb;   -- email → {"id": uuid|null, "expires_at": text|null}, once per run
  v_seat_email text;
  v_seat uuid;
  v_seat_expires text;
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
  v_total int;
  v_index int := 0;
  v_warm_ms numeric;
  v_n int;
  v_allow_ms numeric;
  v_min int;
  v_is_write boolean;
  v_ro boolean;
  v_not_ro int;
  v_pending jsonb := '[]'::jsonb;   -- WAVE 3b: every write waits until all doors are measured
  v_p jsonb;
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
  v_min := least(v_calls, greatest(1, coalesce((v_knobs->>'probe_min_calls')::int, 3)));
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

  select count(*) into v_total from ops.proof_check p
   where p.kind = 'perf' and p.perf_kind = 'door' and p.is_active and p.deleted_at is null
     and (p_only_check is null or p.id = p_only_check)
     and (p_only_check is not null or p.last_run_at is null
          or p.last_run_at <= now() - make_interval(secs => greatest(p.live_every_seconds - 60, 60)));

  -- WAVE 3b (HOT-DOORS-4): the read doors' statement memo switches itself off for the rest of a
  -- transaction once it has written (iam.statement_memo_epoch keys on the xid). Real readers never
  -- write first, so: every READ door is measured before any write door, and NOTHING is written —
  -- no sample, no metadata, no state — until every door has been measured (v_pending, applied below).
  for w in
    select p.*, coalesce((select pp.provolatile = 'v' from pg_proc pp
                           where pp.oid = to_regprocedure(format('%I.%I(%s)', p.perf_subject->>'schema', p.perf_subject->>'function',
                                                                 coalesce(p.perf_subject->>'argtypes', '')))), false) as is_write
      from ops.proof_check p
     where p.kind = 'perf' and p.perf_kind = 'door' and p.is_active and p.deleted_at is null
       and (p_only_check is null or p.id = p_only_check)
       and (p_only_check is not null or p.last_run_at is null
            or p.last_run_at <= now() - make_interval(secs => greatest(p.live_every_seconds - 60, 60)))
     order by (case when coalesce((select pp.provolatile = 'v' from pg_proc pp
                           where pp.oid = to_regprocedure(format('%I.%I(%s)', p.perf_subject->>'schema', p.perf_subject->>'function',
                                                                 coalesce(p.perf_subject->>'argtypes', '')))), false) then 1 else 0 end),
              p.last_run_at nulls first, p.slug
  loop
    v_is_write := w.is_write;
    v_index := v_index + 1;
    if clock_timestamp() > v_deadline then
      v_skipped := v_skipped || jsonb_build_object('slug', w.slug, 'why', 'wall cap reached');
      v_pending := v_pending || jsonb_build_object('op', 'meta', 'id', w.id, 'set', jsonb_build_object('perf_last_probe_note', 'skipped: wall cap reached; first in line next run'));
      continue;
    end if;

    -- WAVE 3: the seat is the watch's own (perf_subject.seat_email), resolved once per run.
    v_seat_email := lower(coalesce(nullif(btrim(w.perf_subject->>'seat_email'), ''), v_default_seat));
    if not v_seats ? v_seat_email then
      select jsonb_build_object('id', u.id, 'expires_at', u.raw_app_meta_data #>> '{test_fixture,expires_at}')
        into v_rec from auth.users u where lower(u.email) = v_seat_email and u.deleted_at is null;
      v_seats := v_seats || jsonb_build_object(v_seat_email, coalesce(v_rec, jsonb_build_object('id', null)));
    end if;
    v_seat := nullif(v_seats #>> array[v_seat_email, 'id'], '')::uuid;
    v_seat_expires := v_seats #>> array[v_seat_email, 'expires_at'];
    if v_seat is null then
      v_seat_expires := coalesce(w.metadata->>'perf_seat_expires_at', w.perf_subject->>'seat_expires_at');
      v_note := format('probe_broken: the probe seat %s does not exist%s', v_seat_email,
                       case when v_seat_expires is not null
                            then format(' — it was a test fixture that expired %s; the nightly fixture sweep (aidream nightly_fixture_sweep) removes expired fixtures. Re-pin seat_email to a lasting member account.', v_seat_expires)
                            else '' end);
      v_pending := v_pending || jsonb_build_object('op', 'broken', 'id', w.id, 'note', v_note);
      if w.perf_state is distinct from 'probe_broken' then
        v_alerts := v_alerts || jsonb_build_object('check_id', w.id, 'slug', w.slug, 'label', w.label, 'state', 'probe_broken',
                                                   'prior_state', w.perf_state, 'budget_ms', w.budget_ms, 'stat', w.budget_stat,
                                                   'owner', w.owner, 'reason', v_note);
      end if;
      v_done := v_done || jsonb_build_object('slug', w.slug, 'state', 'probe_broken', 'note', v_note);
      continue;
    end if;
    if v_seat_expires is distinct from w.metadata->>'perf_seat_expires_at' then
      v_pending := v_pending || jsonb_build_object('op', 'seat_expires', 'id', w.id, 'value', v_seat_expires);
    end if;
    v_claims := jsonb_build_object('sub', v_seat, 'role', 'authenticated', 'aud', 'authenticated',
                                   'email', v_seat_email, 'perf_probe', true)::text;

    v_sql := ops.perf_door_sql(w.perf_subject);
    v_args := coalesce(w.perf_subject->'args', '{}'::jsonb);
    v_warm_err := null; v_warm_state := null; v_bytes := null;
    if v_sql is null then
      v_warm_err := 'the door function does not exist';
      v_warm_state := '42883';
    else
      -- Warm-up: not counted, rolled back like every call.
      v_t0 := clock_timestamp();
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
    -- WAVE 3: an empty answer from a door declared non-empty is the probe's fault (the seat cannot
    -- see the pinned fixture, or the fixture lost its data) — never a fast, healthy sample.
    -- The default promise follows the door: a read door (STABLE/IMMUTABLE) promises an answer, a
    -- write door (VOLATILE) does not; perf_subject.expect_nonempty overrides either way.
    if v_warm_state is null
       and coalesce((w.perf_subject->>'expect_nonempty')::boolean,
                    (select p.provolatile <> 'v' from pg_proc p
                      where p.oid = to_regprocedure(format('%I.%I(%s)', w.perf_subject->>'schema', w.perf_subject->>'function',
                                                           coalesce(w.perf_subject->>'argtypes', '')))),
                    true)
       and coalesce(v_bytes, 0) <= 2 then
      v_warm_err := format('the answer is empty (%s bytes) as seat %s, and this watch is declared non-empty: the seat cannot see the pinned fixture, or the fixture lost its data',
                           coalesce(v_bytes, 0), v_seat_email);
      v_warm_state := 'EMPTY';
    end if;
    -- A missing door, a missing pinned fixture or an empty answer is the probe's fault, never the door's.
    if v_warm_state in ('42883', 'P0002', '42P01', '22P02', 'EMPTY') then
      v_note := format('probe_broken: %s (%s)', left(v_warm_err, 300), v_warm_state);
      v_pending := v_pending || jsonb_build_object('op', 'broken', 'id', w.id, 'note', v_note);
      if w.perf_state is distinct from 'probe_broken' then
        v_alerts := v_alerts || jsonb_build_object('check_id', w.id, 'slug', w.slug, 'label', w.label, 'state', 'probe_broken',
                                                   'prior_state', w.perf_state, 'budget_ms', w.budget_ms, 'stat', w.budget_stat,
                                                   'owner', w.owner, 'reason', v_note);
      end if;
      v_done := v_done || jsonb_build_object('slug', w.slug, 'state', 'probe_broken', 'note', v_note);
      continue;
    end if;

    -- A door slower than its share of the remaining wall time gets fewer timed calls (at least
    -- one), so one slow door can never starve the others or the statement timeout. Said in the note.
    v_warm_ms := extract(epoch from clock_timestamp() - v_t0) * 1000;
    v_allow_ms := greatest(extract(epoch from v_deadline - clock_timestamp()) * 1000, 0) / greatest(v_total - v_index + 1, 1);
    v_n := least(v_calls, greatest(v_min, floor(v_allow_ms / greatest(v_warm_ms, 1))::int));
    v_times := '{}'; v_errs := 0; v_first_err := null; v_not_ro := 0;
    for i in 1 .. v_n loop
      begin
        perform set_config('request.jwt.claims', v_claims, true);
        perform set_config('request.jwt.claim.sub', v_seat::text, true);
        perform set_config('role', 'authenticated', true);
        v_ro := pg_current_xact_id_if_assigned() is null;
        if not v_ro then v_not_ro := v_not_ro + 1; end if;
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

    v_pending := v_pending || jsonb_build_object('op', 'sample', 'id', w.id, 'slug', w.slug, 'seat', v_seat_email, 'stats', jsonb_build_object(
             'n', v_n, 'errors', v_errs, 'bytes', v_bytes,
             'p50_ms', (select round(percentile_cont(0.5) within group (order by t)::numeric, 3) from unnest(v_times) t),
             'p95_ms', (select round(percentile_cont(0.95) within group (order by t)::numeric, 3) from unnest(v_times) t),
             'max_ms', (select max(t) from unnest(v_times) t),
             'mean_ms', (select round(avg(t), 3) from unnest(v_times) t),
             'note', concat_ws(' · ',
                       case when v_seat_email <> v_default_seat then 'seat ' || v_seat_email end,
                       case when v_n < v_calls then format('%s of %s calls: the warm-up took %s ms', v_n, v_calls, round(v_warm_ms)) end,
                       case when v_not_ro > 0 and not v_is_write then format('%s of %s calls ran after a write (statement memo off)', v_not_ro, v_n) end,
                       case when v_errs > 0 then format('%s of %s calls failed: %s', v_errs, v_n, v_first_err) end)));
  end loop;

  -- Every door is measured; now write (samples judge, alert items collect, metadata lands).
  for v_p in select * from jsonb_array_elements(v_pending) loop
    if v_p->>'op' = 'broken' then
      update ops.proof_check set perf_state = 'probe_broken',
             perf_state_since = case when perf_state = 'probe_broken' then perf_state_since else now() end,
             metadata = metadata || jsonb_build_object('perf_last_reason', v_p->>'note', 'perf_last_probe_at', now())
       where id = (v_p->>'id')::uuid;
    elsif v_p->>'op' = 'seat_expires' then
      update ops.proof_check set metadata = case when v_p->>'value' is null then metadata - 'perf_seat_expires_at'
                                                 else metadata || jsonb_build_object('perf_seat_expires_at', v_p->>'value') end
       where id = (v_p->>'id')::uuid;
    elsif v_p->>'op' = 'meta' then
      update ops.proof_check set metadata = metadata || (v_p->'set') || jsonb_build_object('perf_last_probe_at', now())
       where id = (v_p->>'id')::uuid;
    elsif v_p->>'op' = 'sample' then
      select ops.perf_record_sample((v_p->>'id')::uuid, 'probe', v_p->'stats', true) into v_rec;
      update ops.proof_check set metadata = metadata || jsonb_build_object('perf_last_probe_at', now()) - 'perf_last_probe_note'
       where id = (v_p->>'id')::uuid;
      if v_rec->'alert_item' is not null and jsonb_typeof(v_rec->'alert_item') = 'object' then
        v_alerts := v_alerts || jsonb_build_array(v_rec->'alert_item');
      end if;
      v_done := v_done || jsonb_build_object('slug', v_p->>'slug', 'state', v_rec->>'state', 'seat', v_p->>'seat',
                                             'p50_ms', v_p #> '{stats,p50_ms}', 'p95_ms', v_p #> '{stats,p95_ms}',
                                             'errors', v_p #> '{stats,errors}');
    end if;
  end loop;

  if jsonb_array_length(v_alerts) > 0 then
    v_alert_out := ops.perf_alert(v_alerts);
  end if;
  return jsonb_build_object('probed', v_done, 'skipped', v_skipped, 'alerts', v_alert_out, 'as', current_user);
end;
$function$;

CREATE OR REPLACE FUNCTION ops.perf_health_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_knobs jsonb := ops.perf_knobs();
  v_k int;
  v_probe_cad int;
  v_stmt_cad int;
  v_probe_last timestamptz;
  v_stmt_last timestamptz;
  v_probe_bad text;
  v_stmt_bad text;
  c record;
  w record;
  v_coll_bad text;
  v_items jsonb := '[]'::jsonb;
  v_stale jsonb := '[]'::jsonb;
  v_collectors jsonb := '[]'::jsonb;
  v_alert_out jsonb;
  v_err uuid;
  v_admin uuid;
  v_notified int;
  v_reason text;
  v_failed jsonb;
  v_failed_last timestamptz;
  v_later_ok boolean;
begin
  if not coalesce((v_knobs->>'enabled')::boolean, true) then
    return jsonb_build_object('skipped', 'perf.enabled is off');
  end if;
  v_k := coalesce((v_knobs->>'stale_after_cadences')::int, 3);
  v_probe_cad := coalesce((v_knobs->>'probe_cadence_minutes')::int, 15);
  v_stmt_cad := coalesce((v_knobs->>'statement_cadence_minutes')::int, 60);
  perform set_config('app.user_id', v_actor::text, true);

  -- When did each collector last finish? The probe stamps perf_last_probe_at on every door it
  -- probed or skipped (pressure / wall cap); the statement collector writes a snapshot every run.
  select max((p.metadata->>'perf_last_probe_at')::timestamptz) into v_probe_last
    from ops.proof_check p where p.kind = 'perf' and p.perf_kind = 'door' and p.deleted_at is null;
  select max(s.taken_at) into v_stmt_last from ops.perf_statement_snapshot s where s.deleted_at is null;

  if exists (select 1 from ops.proof_check p where p.kind = 'perf' and p.perf_kind = 'door' and p.is_active and p.deleted_at is null) then
    if coalesce(v_probe_last, (select min(created_at) from ops.proof_check where kind = 'perf' and perf_kind = 'door' and deleted_at is null))
         < now() - make_interval(mins => v_k * v_probe_cad) then
      v_probe_bad := format('the door probe has not finished since %s (expected every %s minutes)', coalesce(v_probe_last::text, 'it was declared'), v_probe_cad);
    elsif not exists (select 1 from ops.proof_check p where p.kind = 'perf' and p.perf_kind = 'door' and p.is_active
                         and p.deleted_at is null and p.perf_state is distinct from 'probe_broken') then
      v_probe_bad := 'every active door watch is probe_broken (the probe seat or its pinned fixtures are missing)';
    elsif exists (select 1 from ops.system_error e where e.kind = 'perf_watch_alert'
                    and e.error_type = 'perf_watch:collector:probe:probe_broken' and e.resolved_at is null
                    and not exists (select 1 from ops.perf_sample s where s.source = 'probe' and s.measured_at > e.created_at)) then
      v_probe_bad := 'the door probe reported probe_broken and has not sampled since';
    end if;
  end if;
  if exists (select 1 from ops.proof_check p where p.kind = 'perf' and p.perf_kind = 'statement' and p.is_active and p.deleted_at is null) then
    if coalesce(v_stmt_last, (select min(created_at) from ops.proof_check where kind = 'perf' and perf_kind = 'statement' and deleted_at is null))
         < now() - make_interval(mins => v_k * v_stmt_cad) then
      v_stmt_bad := format('the statement collector has not finished since %s (expected every %s minutes)', coalesce(v_stmt_last::text, 'it was declared'), v_stmt_cad);
    end if;
  end if;

  -- One alert per collector, held open until it is healthy again.
  for c in select * from (values ('probe', v_probe_bad, v_probe_last), ('statement', v_stmt_bad, v_stmt_last)) x(name, bad, last_at) loop
    v_collectors := v_collectors || jsonb_build_object('collector', c.name, 'last_finished_at', c.last_at, 'problem', c.bad);
    if c.bad is not null then
      if not exists (select 1 from ops.system_error e where e.kind = 'perf_watch_alert' and e.resolved_at is null
                       and e.error_type in ('perf_watch:collector:' || c.name, 'perf_watch:collector:' || c.name || ':probe_broken')) then
        v_err := ops.record_system_error(jsonb_build_object(
          'kind', 'perf_watch_alert', 'error_type', 'perf_watch:collector:' || c.name, 'route', 'ops.perf_health_run',
          'source_app', 'database', 'source_feature', 'perf',
          'error_text', format('The performance %s collector is not healthy: %s.', c.name, c.bad),
          'created_by', v_actor,
          'context', jsonb_build_object('signature', 'perf_watch:collector:' || c.name, 'collector', c.name,
                                        'last_finished_at', c.last_at, 'line', c.bad)));
        v_notified := 0;
        for v_admin in select a.user_id from admin.admins a join auth.users u on u.id = a.user_id order by a.user_id loop
          perform communication.notify_from_sql(v_sys, 'platform.perf.watch_alert', v_admin, null, null,
            jsonb_build_object('notice', jsonb_build_object('subject', format('The performance %s collector stopped', c.name), 'line', c.bad)),
            '/administration/reporting/performance', null, null,
            format('perf_watch:collector:%s:%s:%s', c.name, to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS'), v_admin), '{}'::jsonb);
          v_notified := v_notified + 1;
        end loop;
        v_collectors := jsonb_set(v_collectors, array[(jsonb_array_length(v_collectors) - 1)::text, 'alerted'], to_jsonb(v_notified));
      end if;
    else
      update ops.system_error set resolved_at = now(), resolution_note = format('the %s collector finished again at %s', c.name, c.last_at)
       where kind = 'perf_watch_alert' and resolved_at is null
         and error_type in ('perf_watch:collector:' || c.name, 'perf_watch:collector:' || c.name || ':probe_broken');
    end if;
  end loop;

  -- WAVE 2 (review of wave 1): a run that FAILED (statement timeout, error) rolled back every trace
  -- it would have left; pg_cron's own record survives. Each failed run alerts once (by runid), and
  -- the row is resolved at once when a later run of the same job succeeded.
  for c in select * from (values ('probe', 'perf-watch-probe'), ('statement', 'perf-watch-statements'),
                                 ('job', 'perf-watch-jobs'), ('vital', 'perf-watch-vitals')) x(name, job) loop
    select jsonb_agg(jsonb_build_object('runid', d.runid, 'started', d.start_time, 'message', left(d.return_message, 300)) order by d.start_time),
           max(d.start_time)
      into v_failed, v_failed_last
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where j.jobname = c.job and d.status = 'failed'
       and d.start_time > now() - make_interval(mins => greatest(2 * v_stmt_cad, 120))
       and not exists (select 1 from ops.system_error e where e.kind = 'perf_watch_alert'
                         and e.error_type = 'perf_watch:collector:' || c.name || ':failed_run'
                         and e.context->'runids' @> to_jsonb(d.runid));
    if v_failed is not null then
      -- WAVE 3 (review of wave 2): a later run of the same job that already SUCCEEDED before this
      -- check ran means the failure healed itself — the row is kept for the record, resolved at
      -- once, and rings no bell.
      v_later_ok := exists (select 1 from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                             where j.jobname = c.job and d.status = 'succeeded' and d.start_time > v_failed_last);
      v_err := ops.record_system_error(jsonb_build_object(
        'kind', 'perf_watch_alert', 'error_type', 'perf_watch:collector:' || c.name || ':failed_run', 'route', 'ops.perf_health_run',
        'source_app', 'database', 'source_feature', 'perf',
        'error_text', format('%s run(s) of the performance %s collector failed: %s', jsonb_array_length(v_failed), c.name, v_failed->-1->>'message'),
        'created_by', v_actor,
        'context', jsonb_build_object('signature', 'perf_watch:collector:' || c.name || ':failed_run', 'collector', c.name,
                                      'runids', (select jsonb_agg(f->'runid') from jsonb_array_elements(v_failed) f), 'runs', v_failed)));
      if v_later_ok then
        update ops.system_error set resolved_at = now(),
               resolution_note = 'a later run of the same job had already succeeded before the health check ran; no bell'
         where id = v_err;
      else
        for v_admin in select a.user_id from admin.admins a join auth.users u on u.id = a.user_id order by a.user_id loop
          perform communication.notify_from_sql(v_sys, 'platform.perf.watch_alert', v_admin, null, null,
            jsonb_build_object('notice', jsonb_build_object('subject', format('A performance %s run failed', c.name),
                                                            'line', left(v_failed->-1->>'message', 200))),
            '/administration/reporting/performance', null, null,
            format('perf_watch:collector:%s:failed_run:%s:%s', c.name, v_failed->-1->>'runid', v_admin), '{}'::jsonb);
        end loop;
      end if;
      v_collectors := v_collectors || jsonb_build_object('collector', c.name, 'failed_runs', v_failed, 'healed', v_later_ok);
    end if;
  end loop;

  -- Stale watches: silent under a sick collector (its one alert covers them), alerted under a healthy one.
  for w in
    select p.* from ops.proof_check p
     where p.kind = 'perf' and p.perf_kind in ('door', 'statement') and p.is_active and p.deleted_at is null
       and p.perf_state is distinct from 'stale' and p.perf_state is distinct from 'paused'
       and coalesce(p.last_run_at, p.created_at) < now() - make_interval(secs => v_k * p.live_every_seconds)
     order by p.slug
  loop
    v_coll_bad := case w.perf_kind when 'door' then v_probe_bad else v_stmt_bad end;
    v_reason := format('stale: no sample since %s (%s × the %s-minute cadence)', coalesce(w.last_run_at::text, 'it was declared'),
                       v_k, round(w.live_every_seconds / 60.0));
    update ops.proof_check
       set perf_state = 'stale', perf_state_since = now(), last_verdict = 'fail',
           metadata = metadata || jsonb_build_object('perf_last_reason', v_reason, 'perf_stale_from', w.perf_state)
     where id = w.id;
    v_stale := v_stale || jsonb_build_object('slug', w.slug, 'from', w.perf_state, 'silent', v_coll_bad is not null);
    if v_coll_bad is null and not (coalesce(w.perf_state, 'learning') = any (array['over_budget', 'regressed', 'erroring', 'stale', 'probe_broken'])) then
      v_items := v_items || jsonb_build_object('check_id', w.id, 'slug', w.slug, 'label', w.label, 'state', 'stale',
                                               'prior_state', w.perf_state, 'budget_ms', w.budget_ms, 'stat', w.budget_stat,
                                               'owner', w.owner, 'reason', v_reason);
    end if;
  end loop;
  if jsonb_array_length(v_items) > 0 then
    v_alert_out := ops.perf_alert(v_items);
  end if;

  return jsonb_build_object('collectors', v_collectors, 'stale', v_stale, 'alerts', v_alert_out);
end;
$function$;

CREATE OR REPLACE FUNCTION ops.perf_watch_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with k as (select ops.perf_knobs() v),
  w as (select * from ops.proof_check where kind = 'perf' and deleted_at is null),
  coll as (
    select 'probe' name, (select max((metadata->>'perf_last_probe_at')::timestamptz) from w where perf_kind = 'door') last_at,
           coalesce((k.v->>'probe_cadence_minutes')::int, 15) cadence,
           exists (select 1 from w where perf_kind = 'door' and is_active) has_watches
      from k
    union all
    select 'statement', (select max(taken_at) from ops.perf_statement_snapshot where deleted_at is null),
           coalesce((k.v->>'statement_cadence_minutes')::int, 60),
           exists (select 1 from w where perf_kind = 'statement' and is_active)
      from k
  )
  select jsonb_build_object(
    'enabled', coalesce(((select v from k)->>'enabled')::boolean, true),
    'watches', (select count(*) from w),
    'states', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
                 from (select coalesce(case when is_active then perf_state else 'paused' end, 'learning') s, count(*) n from w group by 1) x),
    'bad', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'state', perf_state, 'since', perf_state_since,
                                                         'reason', metadata->>'perf_last_reason') order by slug), '[]'::jsonb)
              from w where is_active and perf_state in ('over_budget', 'regressed', 'erroring', 'stale', 'probe_broken')),
    'collectors', (select jsonb_object_agg(c.name, jsonb_build_object(
                       'last_finished_at', c.last_at,
                       'age_minutes', round(extract(epoch from now() - c.last_at) / 60.0, 1),
                       'cadence_minutes', c.cadence,
                       'healthy', not c.has_watches
                                  or (c.last_at is not null and c.last_at >= now() - make_interval(mins => coalesce(((select v from k)->>'stale_after_cadences')::int, 3) * c.cadence))))
                     from coll c),
    'open_alerts', (select count(*) from ops.system_error where kind = 'perf_watch_alert' and resolved_at is null),
    'screen', '/administration/reporting/performance');
$function$;

select cron.unschedule('perf-watch-probe-admin');
select cron.unschedule('perf-watch-probe-member');
select cron.schedule('perf-watch-probe', '*/15 * * * *',
  $c$SET statement_timeout='90s'; SET lock_timeout='1s'; SELECT ops.perf_probe_run();$c$);
drop function ops.perf_probe_group_run(uuid, text);
drop function ops.perf_probe_group(jsonb);
