-- chair-step: inverse of perf_watch_w3_a_member_seat.sql — restores ops.perf_probe_run and ops.perf_watch_declare verbatim (one admin seat for every watch; empty answers count as samples; no re-declare marker), soft-deletes the eleven member twins, and re-pins views@large and the record_update subjects to their wave-2 subjects. Marker samples stay as history.
set local lock_timeout = '3s';
CREATE OR REPLACE FUNCTION ops.perf_probe_run(p_only_check uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  v_total int;
  v_index int := 0;
  v_warm_ms numeric;
  v_n int;
  v_allow_ms numeric;
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

  select count(*) into v_total from ops.proof_check p
   where p.kind = 'perf' and p.perf_kind = 'door' and p.is_active and p.deleted_at is null
     and (p_only_check is null or p.id = p_only_check)
     and (p_only_check is not null or p.last_run_at is null
          or p.last_run_at <= now() - make_interval(secs => greatest(p.live_every_seconds - 60, 60)));

  for w in
    select p.* from ops.proof_check p
     where p.kind = 'perf' and p.perf_kind = 'door' and p.is_active and p.deleted_at is null
       and (p_only_check is null or p.id = p_only_check)
       and (p_only_check is not null or p.last_run_at is null
            or p.last_run_at <= now() - make_interval(secs => greatest(p.live_every_seconds - 60, 60)))
     order by p.last_run_at nulls first, p.slug
  loop
    v_index := v_index + 1;
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

    -- A door slower than its share of the remaining wall time gets fewer timed calls (at least
    -- one), so one slow door can never starve the others or the statement timeout. Said in the note.
    v_warm_ms := extract(epoch from clock_timestamp() - v_t0) * 1000;
    v_allow_ms := greatest(extract(epoch from v_deadline - clock_timestamp()) * 1000, 0) / greatest(v_total - v_index + 1, 1);
    v_n := least(v_calls, greatest(1, floor(v_allow_ms / greatest(v_warm_ms, 1))::int));
    v_times := '{}'; v_errs := 0; v_first_err := null;
    for i in 1 .. v_n loop
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
             'n', v_n, 'errors', v_errs, 'bytes', v_bytes,
             'p50_ms', (select round(percentile_cont(0.5) within group (order by t)::numeric, 3) from unnest(v_times) t),
             'p95_ms', (select round(percentile_cont(0.95) within group (order by t)::numeric, 3) from unnest(v_times) t),
             'max_ms', (select max(t) from unnest(v_times) t),
             'mean_ms', (select round(avg(t), 3) from unnest(v_times) t),
             'note', concat_ws(' · ',
                       case when v_n < v_calls then format('%s of %s calls: the warm-up took %s ms', v_n, v_calls, round(v_warm_ms)) end,
                       case when v_errs > 0 then format('%s of %s calls failed: %s', v_errs, v_n, v_first_err) end)),
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
$function$

;
CREATE OR REPLACE FUNCTION ops.perf_watch_declare(p_slug text, p_perf_kind text, p_label text, p_subject jsonb, p_budget_ms numeric, p_budget_stat text, p_cadence_seconds integer, p_owner text, p_source_feature text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$

;
update ops.proof_check set deleted_at = now(), is_active = false where slug like 'door:%@member%' and deleted_at is null;
update ops.proof_check
   set perf_subject = jsonb_build_object('schema', 'custom', 'function', 'views', 'argtypes', 'uuid, uuid', 'table_records', 25000,
                        'args', jsonb_build_object('p_organization_id', '344cfaa8-2b0c-4971-854a-9694614816f2',
                                                   'p_table_id', 'a312f617-a388-41f4-b1ed-37a844827684'))
 where slug = 'door:custom.views@large';
update ops.proof_check set perf_subject = perf_subject - 'expect_nonempty'
 where slug in ('door:custom.record_update', 'door:custom.record_update@large');
