-- based-on: ops.perf_probe_run(uuid) 82a9be252603f47bce62dc34fae4b6dafb13dfcee3b1d199bc65a291677ffb1e
--
-- perf_watch_w3_k_reads_before_writes.sql
--
-- PERFORMANCE WATCH, WAVE 3b — THE PROBE MEASURES A READ DOOR THE WAY A READER CALLS IT.
-- Found by lane HOT-DOORS-4: the read doors' statement memo (iam.statement_memo_epoch) keys on
-- pg_current_xact_id_if_assigned(), so it switches itself off for the rest of a transaction once that
-- transaction has written. The probe ran every door in ONE pg_cron transaction and wrote each door's
-- sample (and metadata) right after measuring it, and the record_update door writes inside its
-- rolled-back call — so every door after the first was measured with the memo OFF, on a path real
-- readers (read-only PostgREST calls) no longer take.
-- Now: read doors are measured first, write doors last, and nothing at all is written until every door
-- has been measured (writes queue in v_pending and land after the loop). Each timed call also records
-- whether the transaction had already written; a read door that ever runs after a write says so in its
-- sample note. Second fix: a slow door gets at least perf.probe_min_calls (3) timed calls instead of 1
-- (data_home's "p95" was one call); doors that miss the wall cap go first next run.
-- A marker on every door watch explains the step in their history.
-- Inverse: migrations/inverse/perf_watch_w3_k_reads_before_writes_down.sql.

insert into platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value,
                                   label, description, set_by, basis, review_due, overridable_by)
values
  ('perf', 'probe_min_calls', to_jsonb(3), to_jsonb(3), 'integer', 'calls', 1, 50,
   'Probe minimum timed calls per door',
   'A slow door still gets at least this many timed calls per run; doors that miss the run''s time cap go first next run.',
   'agent', 'HOT-DOORS-4 / PERF-WATCH 2026-10-08: fair-share cut data_home to 1 call, so its p95 was a single call. Three is the fewest that gives a median.',
   date '2027-01-08', '{}')
on conflict (feature, key) do nothing;

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
$function$
;

select ops.perf_marker('door:%', now(),
  'probe: read doors now measured before any write (statement memo on, as real readers call them); at least 3 calls per door');
