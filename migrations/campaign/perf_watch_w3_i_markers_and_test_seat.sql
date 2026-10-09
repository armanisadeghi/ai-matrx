-- based-on: ops.perf_judge(uuid) 0357e128525bd89f53eefb2694426727fe74c6b1bb9bb6ad1c79ade3facbe508
-- chair-step: the REVOKE withdraws EXECUTE from public/anon/authenticated on ops.perf_marker, the function this same file creates; it is declared in platform.client_callable_door first. Nothing that existed before is narrowed. Emits no policy.
--
-- perf_watch_w3_i_markers_and_test_seat.sql
--
-- PERFORMANCE WATCH, WAVE 3 — MARKERS ANY LANE CAN WRITE; MEMBER TWINS MOVE TO THE DURABLE SEAT.
--   1. ops.perf_marker(p_slug_pattern, p_at, p_text) — service-only: one EVENT marker sample
--      (metadata.perf_marker, perf_marker_kind 'event', n = 0) on every watch whose slug matches the
--      LIKE pattern, at p_at; the admin drill draws every marker as a vertical line. ops.perf_judge
--      never judges a marker and cuts its history only at a SUBJECT marker (a re-declare), never at an
--      event, so an event explains a change without resetting the baseline.
--   2. Every @member twin re-declared with seat test@test.com (the durable non-admin test account,
--      already a plain MEMBER of Holloway Creative — no membership change), replacing the fixture seat
--      hugo.waelchi.cfd403@fixtures (expires 2026-10-09 03:06 UTC; the nightly sweep deletes it). Each
--      re-declare writes its subject marker.
--   3. Event marker on every @member watch and the admin read_records_page doors: lane HOT-DOORS-4
--      switched on access/kernel_batch around 23:30–23:45 UTC 2026-10-08.
-- Inverse: migrations/inverse/perf_watch_w3_i_markers_and_test_seat_down.sql.

create or replace function ops.perf_marker(p_slug_pattern text, p_at timestamptz, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_n int;
begin
  if coalesce(btrim(p_slug_pattern), '') = '' or coalesce(btrim(p_text), '') = '' then
    raise exception 'perf_marker: a slug pattern and a sentence are required' using errcode = '22023';
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  insert into ops.perf_sample (check_id, measured_at, source, n, errors, note, state_after, organization_id, created_by, metadata)
  select c.id, coalesce(p_at, now()),
         case c.perf_kind when 'door' then 'probe' when 'statement' then 'statement' when 'job' then 'job'
                          when 'vital' then 'vital' else 'cli' end,
         0, 0, left(p_text, 1000), c.perf_state, v_sys, v_actor,
         jsonb_build_object('perf_marker', true, 'perf_marker_kind', 'event')
    from ops.proof_check c
   where c.kind = 'perf' and c.deleted_at is null and c.slug like p_slug_pattern;
  get diagnostics v_n = row_count;
  return jsonb_build_object('marked', v_n);
end;
$function$;

do $grants$
begin
  insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                             reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
  select 'ops', 'perf_marker', pg_get_function_identity_arguments(p.oid),
         (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
         'Performance watch (PLAN §6): writes an event marker sample on the watches a slug pattern names, so a change (a release, a switch) is explained in their history.',
         'matrx-frontend/migrations/campaign/perf_watch_w3_i_markers_and_test_seat.sql',
         'server_only: any lane calls it with the service key or as postgres; no browser or signed-in client writes markers.',
         false, false
    from pg_proc p
   where p.oid = 'ops.perf_marker(text, timestamp with time zone, text)'::regprocedure
     and not exists (select 1 from platform.client_callable_door d where d.schema_name = 'ops' and d.function_name = 'perf_marker');
  revoke all on function ops.perf_marker(text, timestamptz, text) from public, anon, authenticated;
  grant execute on function ops.perf_marker(text, timestamptz, text) to service_role;
end
$grants$;

CREATE OR REPLACE FUNCTION ops.perf_judge(p_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    from (select id, measured_at, n, errors, p50_ms, p95_ms, mean_ms, max_ms,
                 -- WAVE 3: vitals carry p75 (web.dev's own percentile) in the sample's metadata.
                 nullif(metadata->>'p75_ms', '')::numeric p75_ms, state_after
            from ops.perf_sample
           where check_id = p_check_id and source = v_source and deleted_at is null
             and measured_at >= now() - make_interval(days => coalesce((v_knobs->>'baseline_days')::int, 7) + 1)
             -- WAVE 3: a marker (the subject was re-declared) is not a measurement, and nothing
             -- before the latest marker measured the subject being judged now.
             and not coalesce((metadata->>'perf_marker')::boolean, false)
             and measured_at > coalesce((select max(m.measured_at) from ops.perf_sample m
                                          where m.check_id = p_check_id and m.deleted_at is null
                                            and coalesce((m.metadata->>'perf_marker')::boolean, false)
                                            -- an EVENT marker (ops.perf_marker) explains a change; only a
                                            -- re-declared SUBJECT cuts the history being judged
                                            and coalesce(m.metadata->>'perf_marker_kind', 'subject') = 'subject'), '-infinity')
           order by measured_at desc
           limit 2000) s;
  return ops.perf_judge_rule(
    v_hist,
    jsonb_build_object('budget_ms', c.budget_ms, 'budget_stat', c.budget_stat, 'state', c.perf_state,
                       'baseline_pinned', c.perf_baseline_pinned, 'baseline_ms', c.perf_baseline_ms,
                       'last_recovery_at', c.metadata->>'perf_last_recovery_at',
                       'episode_started_at', c.metadata->>'perf_episode_started_at', 'last_alert_at', c.perf_last_alert_at),
    v_knobs, now());
end;
$function$;

select ops.perf_watch_declare(p.slug, 'door', p.label, p.perf_subject || '{"seat_email": "test@test.com"}'::jsonb,
         p.budget_ms, p.budget_stat, p.live_every_seconds, p.owner, p.source_feature)
  from ops.proof_check p
 where p.kind = 'perf' and p.perf_kind = 'door' and p.deleted_at is null and p.slug like 'door:%@member%'
   and p.perf_subject->>'seat_email' is distinct from 'test@test.com';

select ops.perf_marker('door:%@member%', timestamptz '2026-10-08 23:30:00+00',
  'lane HOT-DOORS-4 switched on access/kernel_batch (23:30–23:45 UTC): member-seat row doors expected to drop');
select ops.perf_marker('door:custom.read_records_page%', timestamptz '2026-10-08 23:30:00+00',
  'lane HOT-DOORS-4 switched on access/kernel_batch (23:30–23:45 UTC)');

do $assert$
begin
  if exists (select 1 from ops.proof_check where slug like 'door:%@member%' and deleted_at is null
              and perf_subject->>'seat_email' <> 'test@test.com') then
    raise exception 'a member twin still names another seat';
  end if;
end
$assert$;
