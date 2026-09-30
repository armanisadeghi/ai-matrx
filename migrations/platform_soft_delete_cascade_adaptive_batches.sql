-- chair-step: replaces trigger function bodies whose hard-delete branch (DELETE FROM platform.associations) is carried over unchanged
-- =============================================================================
-- SOFT-DELETE CASCADE: ADAPTIVE BATCHES (third of three; apply after
-- platform_soft_delete_cascade_deferred.sql and platform_soft_delete_association_gc_bounded.sql).
--
-- Measured 2026-09-30 on the clone, 500 rows per statement under website d0aff5b6…:
--   analysis_result 268 ms · gsc_page_stat 191 · finding 409 · crawl_url 645 ·
--   link_edge 715 · crawl_event 1,044 · snapshot 1,481 · page 2,955
-- (0.4–5.9 ms/row — pages there carry their own associations). A fixed batch
-- either crawls on light tables or runs one statement for seconds on heavy ones,
-- and the removing request (in-line step + association batch) reached 7.7 s.
--
-- So each batch now starts at `batch_rows` and doubles/halves toward
-- `batch_target_ms` (bounded by `batch_rows_max`), and the association GC does one
-- `inline_assoc_rows` batch in the request, queueing the rest. The in-line edge
-- ceiling drops to 500 rows: at the measured worst case (~6 ms/row) that is ~3 s.
-- =============================================================================

update platform.feature_knob
   set value = to_jsonb(100), default_value = to_jsonb(100), min_value = 10, max_value = 2000,
       label = 'Removal: first batch size',
       description = 'Rows stamped by the first statement of a removal step; later batches adapt.',
       basis = 'Measured 2026-09-30 on the clone: 0.4–5.9 ms/row by table. 100 rows is at most ~0.6 s even on the heaviest table; the batch then adapts toward batch_target_ms.',
       updated_at = now()
 where feature = 'platform.soft_delete_cascade' and key = 'batch_rows';

update platform.feature_knob
   set value = to_jsonb(500), default_value = to_jsonb(500), max_value = 5000,
       basis = 'Measured 2026-09-30 on the clone: in-line children cost up to ~6 ms/row, so 500 rows is ~3 s — the most one removing request should spend on one in-line edge. Largest in-line fan-out today is 259 rows.',
       updated_at = now()
 where feature = 'platform.soft_delete_cascade' and key = 'sync_fanout_ceiling';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due, overridable_by)
values
  ('platform.soft_delete_cascade', 'batch_target_ms', to_jsonb(250), to_jsonb(250), 'integer', 'ms', 50, 2000,
   'Removal: time per batch',
   'Batches grow or shrink so one statement takes about this long.',
   'agent',
   'Short statements keep row locks and the in-request overshoot small; 250 ms is ~10 statements per 2.5 s step.',
   date '2026-12-30', '{}'),
  ('platform.soft_delete_cascade', 'batch_rows_max', to_jsonb(2000), to_jsonb(2000), 'integer', 'rows', 100, 20000,
   'Removal: largest batch',
   'The most rows one statement of a removal step may stamp.',
   'agent',
   'Light tables (0.4 ms/row) reach the time target near 600 rows; 2,000 bounds the lightest ones.',
   date '2026-12-30', '{}'),
  ('platform.soft_delete_cascade', 'inline_assoc_rows', to_jsonb(100), to_jsonb(100), 'integer', 'rows', 0, 2000,
   'Removal: links un-linked in the request',
   'How many of a removed item''s links are un-linked inside the removing request.',
   'agent',
   'Each link fires the reachability refresh (1.6–11 ms measured 2026-09-30); 100 keeps it under ~1 s. The rest is queued.',
   date '2026-12-30', '{}')
on conflict (feature, key) do nothing;

-- based-on: platform.soft_delete_cascade_step(uuid, integer) fcea85b52133cc1a1f7167334e4ca0c9b9e2be5b756651850051e37c34c999ba
create or replace function platform.soft_delete_cascade_step(p_job_id uuid, p_budget_ms integer default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  j platform.soft_delete_cascade_job;
  e record;
  v_batch integer := platform._soft_delete_cascade_knob('batch_rows', 500);
  v_budget integer := coalesce(p_budget_ms, platform._soft_delete_cascade_knob('step_budget_ms', 2500));
  v_deadline timestamptz;
  v_type text;
  v_edge text;
  v_n bigint;
  v_count bigint;
  v_total bigint := 0;
  v_all_done boolean := true;
  v_pred text;
  v_assoc_id uuid;
  v_target integer := platform._soft_delete_cascade_knob('batch_target_ms', 250);
  v_max integer := platform._soft_delete_cascade_knob('batch_rows_max', 2000);
  v_used integer;
  v_t0 timestamptz;
  v_ms numeric;
begin
  select * into j from platform.soft_delete_cascade_job
   where id = p_job_id and state = 'pending'
   for update skip locked;
  if not found or v_budget <= 0 then
    return platform._soft_delete_cascade_job_json(p_job_id);
  end if;
  v_deadline := clock_timestamp() + make_interval(secs => v_budget / 1000.0);

  -- A background run has no signed-in person; it says which system wrote.
  if auth.uid() is null and coalesce(current_setting('app.actor_system', true), '') = '' then
    perform pg_catalog.set_config('app.actor_system', 'platform.soft_delete_cascade', true);
  end if;

  begin
    -- ASSOCIATIONS first (the pseudo-edge): the parent's links, keyed exactly as
    -- platform._gc_entity_associations keys them.
    if j.assoc_token is not null and not ('platform.associations' = any (j.completed_edges)) then
      v_assoc_id := j.parent_key::uuid;
      if j.rows_total is null then
        if j.direction = 'trash' then
          select count(*) into v_count from platform.associations
           where deleted_at is null
             and ((source_type = j.assoc_token and source_id = v_assoc_id)
               or (target_type = j.assoc_token and target_id = v_assoc_id));
        else
          select count(*) into v_count from platform.associations
           where deleted_at is not null and deleted_via_type = j.assoc_token and deleted_via_id = v_assoc_id;
        end if;
        v_total := v_total + v_count;
      end if;
      loop
        exit when clock_timestamp() >= v_deadline;
        v_t0 := clock_timestamp();
        if j.direction = 'trash' then
          update platform.associations
             set deleted_at = now(), deleted_via_type = j.assoc_token, deleted_via_id = v_assoc_id
           where ctid = any (array(
                   select ctid from platform.associations
                    where deleted_at is null
                      and ((source_type = j.assoc_token and source_id = v_assoc_id)
                        or (target_type = j.assoc_token and target_id = v_assoc_id))
                    limit v_batch));
        else
          update platform.associations
             set deleted_at = null, deleted_via_type = null, deleted_via_id = null
           where ctid = any (array(
                   select ctid from platform.associations
                    where deleted_at is not null
                      and deleted_via_type = j.assoc_token and deleted_via_id = v_assoc_id
                    limit v_batch));
        end if;
        get diagnostics v_n = row_count;
        -- Adaptive batch: per-row cost ranges ~0.3–6 ms by table (trigger
        -- chains), so the batch grows or shrinks toward batch_target_ms and a
        -- single statement never runs away from the step budget.
        v_used := v_batch;
        v_ms := extract(epoch from clock_timestamp() - v_t0) * 1000;
        if v_ms < v_target / 2.0 then
          v_batch := least(v_max, v_batch * 2);
        elsif v_ms > v_target * 2.0 then
          v_batch := greatest(10, v_batch / 2);
        end if;
        j.rows_done := j.rows_done + v_n;
        if v_n < v_used then
          j.completed_edges := j.completed_edges || 'platform.associations'::text;
          exit;
        end if;
      end loop;
      if not ('platform.associations' = any (j.completed_edges)) then
        v_all_done := false;
      end if;
    end if;

    -- trash takes live rows (and rows a superseded job left stamped);
    -- restore takes exactly the rows this removal stamped.
    v_pred := case j.direction
      when 'trash'   then '(deleted_at is null or deleted_at = any($3))'
      else                '(deleted_at = $1 or deleted_at = any($3))'
    end;

    for e in
      select child_schema, child_table, child_column
        from platform.soft_delete_edge
       where parent_schema = j.parent_schema and parent_table = j.parent_table
         and parent_column = j.parent_column and action = 'cascade_deferred'
       order by child_schema, child_table, child_column
    loop
      v_edge := e.child_schema || '.' || e.child_table || '.' || e.child_column;
      select pg_catalog.format_type(a.atttypid, a.atttypmod) into v_type
        from pg_catalog.pg_attribute a
       where a.attrelid = pg_catalog.format('%I.%I', e.child_schema, e.child_table)::pg_catalog.regclass
         and a.attname = e.child_column and not a.attisdropped;

      if j.rows_total is null then
        execute pg_catalog.format('select count(*) from %I.%I where %I = $2::%s and ' || v_pred,
                                  e.child_schema, e.child_table, e.child_column, v_type)
          into v_count using j.stamp, j.parent_key, j.absorb_stamps;
        v_total := v_total + v_count;
      end if;

      continue when v_edge = any (j.completed_edges);
      if clock_timestamp() >= v_deadline then
        v_all_done := false;
        continue;  -- still counting on a first step
      end if;

      loop
        v_t0 := clock_timestamp();
        execute pg_catalog.format(
          'update %I.%I set deleted_at = %s where ctid = any (array('
          'select ctid from %I.%I where %I = $2::%s and ' || v_pred || ' limit $4))',
          e.child_schema, e.child_table,
          case j.direction when 'trash' then '$1' else 'null' end,
          e.child_schema, e.child_table, e.child_column, v_type
        ) using j.stamp, j.parent_key, j.absorb_stamps, v_batch;
        get diagnostics v_n = row_count;
        -- Adaptive batch: per-row cost ranges ~0.3–6 ms by table (trigger
        -- chains), so the batch grows or shrinks toward batch_target_ms and a
        -- single statement never runs away from the step budget.
        v_used := v_batch;
        v_ms := extract(epoch from clock_timestamp() - v_t0) * 1000;
        if v_ms < v_target / 2.0 then
          v_batch := least(v_max, v_batch * 2);
        elsif v_ms > v_target * 2.0 then
          v_batch := greatest(10, v_batch / 2);
        end if;
        j.rows_done := j.rows_done + v_n;
        if v_n < v_used then
          j.completed_edges := j.completed_edges || v_edge;
          exit;
        end if;
        exit when clock_timestamp() >= v_deadline;
      end loop;

      if not (v_edge = any (j.completed_edges)) then
        v_all_done := false;
      end if;
    end loop;

    update platform.soft_delete_cascade_job
       set rows_done = j.rows_done,
           rows_total = coalesce(rows_total, v_total),
           completed_edges = j.completed_edges,
           steps = steps + 1,
           started_at = coalesce(started_at, now()),
           state = case when v_all_done then 'done' else 'pending' end,
           finished_at = case when v_all_done then now() end,
           last_error = null,
           updated_at = now()
     where id = j.id;
  exception when others then
    -- Nothing fails silently: the job carries the error and, after five tries,
    -- stops as `failed`, which the conformance check reports.
    update platform.soft_delete_cascade_job
       set attempts = attempts + 1,
           last_error = left(sqlstate || ': ' || sqlerrm, 1000),
           state = case when attempts + 1 >= 5 then 'failed' else 'pending' end,
           finished_at = case when attempts + 1 >= 5 then now() end,
           updated_at = now()
     where id = j.id;
    raise warning '[soft-delete-cascade] job % (%.% %) step failed: % %',
      j.id, j.parent_schema, j.parent_table, j.parent_key, sqlstate, sqlerrm;
  end;

  return platform._soft_delete_cascade_job_json(j.id);
end;
$function$;

-- based-on: platform._gc_entity_associations() 3610cbf83c3f85a73f33cd5d76ce068797dfaef5074805ab2e6533fa9ceb1481
create or replace function platform._gc_entity_associations()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_token       text := tg_argv[0];
  v_key_is_uuid boolean;
  v_id          uuid;
  v_batch       integer;
  v_n           bigint;
  v_job         uuid;
begin
  -- An edge's endpoint is a uuid. A row whose own id is bigint or text can
  -- never be an endpoint, so there is nothing to collect. The skip is reached
  -- only where the sweep is empty by construction.
  select a.atttypid = 'uuid'::regtype
    into v_key_is_uuid
    from pg_catalog.pg_attribute a
   where a.attrelid = tg_relid
     and a.attname  = 'id'
     and a.attnum   > 0
     and not a.attisdropped;

  if v_key_is_uuid is not true then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_id := old.id::text::uuid;
    delete from platform.associations
     where (source_type = v_token and source_id = v_id)
        or (target_type = v_token and target_id = v_id);
    return null;
  end if;

  if tg_op <> 'UPDATE' then
    return null;
  end if;

  v_id := new.id::text::uuid;
  -- Each association fires the reachability refresh (~2.4 ms), and one record
  -- can carry thousands: at most one batch runs here, the rest is queued
  -- (platform.soft_delete_cascade_job.assoc_token) — never a timed-out removal.
  v_batch := platform._soft_delete_cascade_knob('inline_assoc_rows', 100);

  if old.deleted_at is null and new.deleted_at is not null then
    update platform.associations
       set deleted_at       = now(),
           deleted_via_type = v_token,
           deleted_via_id   = v_id
     where ctid = any (array(
             select ctid from platform.associations
              where deleted_at is null
                and ((source_type = v_token and source_id = v_id)
                  or (target_type = v_token and target_id = v_id))
              limit v_batch));
    get diagnostics v_n = row_count;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update platform.associations
       set deleted_at       = null,
           deleted_via_type = null,
           deleted_via_id   = null
     where ctid = any (array(
             select ctid from platform.associations
              where deleted_at is not null
                and deleted_via_type = v_token
                and deleted_via_id   = v_id
              limit v_batch));
    get diagnostics v_n = row_count;
  else
    return null;
  end if;

  if v_n >= v_batch then
    v_job := platform._soft_delete_cascade_enqueue(
      tg_table_schema, tg_table_name, 'id', v_id::text,
      case when new.deleted_at is not null then 'trash' else 'restore' end,
      coalesce(new.deleted_at, old.deleted_at));
    update platform.soft_delete_cascade_job set assoc_token = v_token where id = v_job;
  end if;

  return null;
end
$function$;
