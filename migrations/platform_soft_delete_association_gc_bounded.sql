-- chair-step: replaces trigger function bodies whose hard-delete branch (DELETE FROM platform.associations) is carried over unchanged
-- =============================================================================
-- REMOVING A THING UN-LINKS ITS ASSOCIATIONS IN BOUNDED BATCHES.
--
-- Second half of platform_soft_delete_cascade_deferred.sql (apply after it).
--
-- 🚨 Measured 2026-09-30 on the clone: after the deferred cascade landed, the
-- CRM-org website d0aff5b6… still took 5,924 ms to remove, 4,253 ms of it in
-- `_gc_assoc_softdelete` — `platform._gc_entity_associations` soft-deleting the
-- site's 1,738 live associations in one UPDATE, each firing the reachability
-- refresh (~2.4 ms/row). The largest live fan-out on any single record is 7,311
-- associations (~18 s). This trigger is attached to EVERY entity table, so it is
-- the same synchronous-cascade class platform-wide.
--
-- The fix: the trigger stamps at most `batch_rows` associations in-line and, when
-- more remain, hands the rest to the SAME queue (`platform.soft_delete_cascade_job`,
-- column `assoc_token`), which `platform.soft_delete_cascade_step` drains as a
-- pseudo-edge before the declared deferred edges. Restore stays exact: it keys on
-- deleted_via_type / deleted_via_id exactly as before.
--
-- `_soft_delete_cascade_enqueue` now MERGES: two triggers on one parent row in one
-- statement (the parts cascade and the association GC) share one job instead of
-- the second cancelling the first.
-- =============================================================================

alter table platform.soft_delete_cascade_job add column assoc_token text;
comment on column platform.soft_delete_cascade_job.assoc_token is
  'Set when the parent''s associations overflowed the in-line batch: the entity token platform.associations '
  'knows the parent by. The step drains them as the pseudo-edge platform.associations.';

-- based-on: platform._soft_delete_cascade_enqueue(text, text, text, text, text, timestamp with time zone) 49147ae9f6421f75c614b596c38cd884b80d8c2346e6ce7f2f0c84d8e2a34279
create or replace function platform._soft_delete_cascade_enqueue(
  p_schema text, p_table text, p_parent_column text, p_key text, p_direction text, p_stamp timestamptz)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_absorb timestamptz[];
  v_id uuid;
begin
  -- The same removal reaching this parent twice (parts cascade + association GC
  -- in one statement) is ONE job.
  select id into v_id
    from platform.soft_delete_cascade_job
   where parent_schema = p_schema and parent_table = p_table
     and parent_column = p_parent_column and parent_key = p_key
     and state = 'pending' and direction = p_direction and stamp = p_stamp;
  if v_id is not null then
    return v_id;
  end if;

  -- One pending job per parent. A new removal or restore supersedes the pending
  -- one; every stamp that job may have left on rows it had not yet turned back is
  -- carried forward, so a trash → restore → trash sequence strands nothing.
  with c as (
    update platform.soft_delete_cascade_job
       set state = 'cancelled', finished_at = now(), updated_at = now()
     where parent_schema = p_schema and parent_table = p_table
       and parent_column = p_parent_column and parent_key = p_key
       and state = 'pending'
    returning stamp, absorb_stamps
  )
  select coalesce(array_agg(distinct s) filter (where s is not null and s <> p_stamp), '{}')
    into v_absorb
    from c, lateral unnest(c.absorb_stamps || c.stamp) s;

  insert into platform.soft_delete_cascade_job
    (parent_schema, parent_table, parent_column, parent_key, direction, stamp, absorb_stamps, requested_by)
  values (p_schema, p_table, p_parent_column, p_key, p_direction, p_stamp, v_absorb, auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;

-- based-on: platform.soft_delete_cascade_step(uuid, integer) bbc19251f7d3781f9d8bf65893fbeee4f6641c4a8898180074439f1cce56058d
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
        j.rows_done := j.rows_done + v_n;
        if v_n < v_batch then
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
        execute pg_catalog.format(
          'update %I.%I set deleted_at = %s where ctid = any (array('
          'select ctid from %I.%I where %I = $2::%s and ' || v_pred || ' limit $4))',
          e.child_schema, e.child_table,
          case j.direction when 'trash' then '$1' else 'null' end,
          e.child_schema, e.child_table, e.child_column, v_type
        ) using j.stamp, j.parent_key, j.absorb_stamps, v_batch;
        get diagnostics v_n = row_count;
        j.rows_done := j.rows_done + v_n;
        if v_n < v_batch then
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

-- based-on: platform._gc_entity_associations() e84f40e7cee404cf8ea1b578d20098ca76f8ecea252a5891778df35ac417c8ea
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
  v_batch := platform._soft_delete_cascade_knob('batch_rows', 500);

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
