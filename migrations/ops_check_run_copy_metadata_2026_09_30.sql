-- based-on: ops.check_run_record(uuid, jsonb) 3eafea5ae6600d26f78468aaf908f3eaa520d3e2add7a39cda274f9f81d9420f
--
-- ops_check_run_copy_metadata_2026_09_30.sql
--
-- The database-reading checks run ONLY on the nightly copy (checks-run-in-the-app PLAN decision 1,
-- C7; build: COORDINATOR.md "P3 database-reading leg"). Two things the store needs for that:
--
--   1. ops.check_run_record keeps the run's `metadata` (p_run->'metadata'). The ingest puts
--      {"db_target": {"kind": "clone", "ref": …, "promoted_at": …}} there for every run from the
--      copy, so every finding (through its first_seen / last_transition run) says it came from the
--      copy and the copy's date. Before this the function dropped the key and the column stayed {}.
--      The body is otherwise byte-for-byte the live one.
--   2. The knob checks.clone_max_age_hours (the copy-age gate): a copy older than this when the run
--      started files NOTHING — every check records `skipped` / `copy_stale`, loudly.
--
-- No policy, no grant, no table change.

create or replace function ops.check_run_record(p_check_id uuid, p_run jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_actor constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_started timestamptz := coalesce((p_run->>'started_at')::timestamptz, now());
  v_id uuid;
begin
  if not exists (select 1 from ops.proof_check where id = p_check_id and kind = 'static') then
    raise exception 'check_run_record: % is not a static check in ops.proof_check', p_check_id using errcode = 'P0002';
  end if;
  if p_run ? 'metadata' and jsonb_typeof(p_run->'metadata') is distinct from 'object' then
    raise exception 'check_run_record: metadata must be a JSON object, not %', jsonb_typeof(p_run->'metadata') using errcode = '22023';
  end if;
  perform set_config('app.user_id', v_actor::text, true);
  perform pg_advisory_xact_lock(hashtext('ops.check_run:' || p_check_id::text));
  select id into v_id from ops.check_run
   where check_id = p_check_id and started_at = v_started
     and coalesce(git_sha, '') = coalesce(p_run->>'git_sha', '') and coalesce(host, '') = coalesce(p_run->>'host', '');
  if v_id is not null then
    return v_id;  -- the same run, ingested again: one row (V8)
  end if;
  insert into ops.check_run (
    check_id, status, git_sha, host, started_at, finished_at, duration_ms, exit_code,
    new_count, known_count, findings_count, peak_rss_mb, skipped_reason, run_scope,
    scan_complete, verdict, headline, malformed_count, organization_id, created_by, visibility, metadata)
  values (
    p_check_id, p_run->>'status', p_run->>'git_sha', p_run->>'host', v_started,
    (p_run->>'finished_at')::timestamptz, (p_run->>'duration_ms')::integer, (p_run->>'exit_code')::integer,
    coalesce((p_run->>'new_count')::integer, 0), coalesce((p_run->>'known_count')::integer, 0),
    coalesce((p_run->>'findings_count')::integer, 0), (p_run->>'peak_rss_mb')::integer,
    p_run->>'skipped_reason', coalesce(p_run->>'run_scope', 'partial'),
    coalesce((p_run->>'scan_complete')::boolean, false), p_run->>'verdict', left(p_run->>'headline', 500),
    coalesce((p_run->>'malformed_count')::integer, 0), v_sys, v_actor, 'internal',
    coalesce(p_run->'metadata', '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$function$;

-- The copy-age gate. Idempotent: never overwrites an admin's value.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due, overridable_by)
values
  ('checks', 'clone_max_age_hours', to_jsonb(12), to_jsonb(12), 'integer', 'hours', 1, 168,
   'Database checks: oldest copy to trust',
   'The database-reading checks run on the nightly copy of the database, never the live one. When the copy they read is older than this many hours, the run files no findings at all and says "skipped: copy is stale" on every check instead, so a missed nightly copy never produces findings about a database that has since moved on.',
   'agent',
   'The copy is promoted nightly around 02:00 Pacific and the checks run about 1.5 hours later, so a fresh copy is 1-3 hours old. Anything past 12 hours means that night''s copy did not arrive; the previous day''s data would re-file yesterday''s state as today''s. Loud skip over quiet staleness.',
   date '2026-12-30', '{organization,user}')
on conflict (feature, key) do nothing;
