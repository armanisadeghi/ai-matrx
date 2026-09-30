-- chair-step: replaces trigger function bodies whose hard-delete branch (DELETE FROM platform.associations) is carried over unchanged
-- =============================================================================
-- A BULK UN-LINK REFRESHES EACH CONTAINER ONCE, NOT ONCE PER LINK
-- (fourth of four; apply after platform_soft_delete_cascade_adaptive_batches.sql).
--
-- Measured 2026-09-30 on the clone: removing website d0aff5b6… spent 4,079 ms in
-- `_gc_assoc_softdelete` un-linking just 100 of its 1,738 associations.
-- `platform.trg_reachability_on_association` runs `reachability_touch` for EVERY
-- row, and each touch re-derives the whole container (`refresh_reachability`:
-- delete + re-insert every reachable item) — ~40 ms per link on a 1,738-item site,
-- quadratic in the container's size. The same row-at-a-time refresh sits under
-- every entity's removal (platform._gc_entity_associations is on every entity).
--
-- The fix keeps "removal narrows access immediately": the two bulk un-link
-- statements (the association GC trigger and the cascade step) set the
-- transaction-local flag `platform.reachability_batch`, the row trigger skips its
-- per-row refresh for a soft delete/restore that does not move the edge, and the
-- caller refreshes each DISTINCT container (and its ancestors) once, in the same
-- statement, through `platform._reachability_touch_edges`. The flag is RESTORED to
-- its previous value right after the UPDATE (never forced off: association rows are
-- entities too, so their own GC trigger runs inside the outer batch and must not
-- end it); an aborted batch rolls it back with its subtransaction. Campaign-origin edges keep the per-row path (their origin stamp
-- is written after the refresh).
-- =============================================================================

create or replace function platform._reachability_touch_edges(p_edges jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
  a record;
  n integer := 0;
begin
  -- The container rule is reachability_touch's, applied once per DISTINCT container.
  for r in
    select distinct c.ct, c.cid
      from jsonb_to_recordset(coalesce(p_edges, '[]'::jsonb))
             as e(source_type text, source_id uuid, target_type text, target_id uuid, label text)
      cross join lateral (
        select t.container_side
          from platform.association_types t
         where t.source_type = e.source_type and t.target_type = e.target_type
           and (t.label is null or t.label = e.label)
           and t.is_active and t.container_side in ('source', 'target')
         order by (t.label is not null) desc
         limit 1) s
      cross join lateral (
        select case when s.container_side = 'source' then e.source_type else e.target_type end as ct,
               case when s.container_side = 'source' then e.source_id   else e.target_id   end as cid) c
  loop
    perform platform.refresh_reachability(r.ct, r.cid);
    for a in select * from platform.reachability_ancestors(r.ct, r.cid) loop
      perform platform.refresh_reachability(a.container_type, a.container_id);
    end loop;
    n := n + 1;
  end loop;
  return n;
end;
$function$;
revoke all on function platform._reachability_touch_edges(jsonb) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', '_reachability_touch_edges', 'p_edges jsonb', array['jsonb'::regtype]::oid[],
   'p_edges: the rows a bulk association UPDATE just returned; it only re-derives reachability for their containers, which is what the per-row trigger would have done.',
   'platform_reachability_batch_unlink.sql',
   'server_only: called by platform._gc_entity_associations and platform.soft_delete_cascade_step right after their own bulk UPDATE, never by a client.',
   false, false);

-- based-on: platform.trg_reachability_on_association() 8f5f0db300e8544f6c91224bcb3b29dedda6d2d60cbfadd0dbb7321ab3bf5ca0
create or replace function platform.trg_reachability_on_association()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
BEGIN
  -- A bulk un-link/re-link (platform._gc_entity_associations, soft_delete_cascade_step)
  -- refreshes each distinct container ONCE after its statement, through
  -- platform._reachability_touch_edges; the per-row refresh here would re-derive the
  -- same container for every link. Only an UPDATE that leaves the edge where it is.
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('platform.reachability_batch', true), '') = 'on'
     AND (OLD.source_type, OLD.source_id, OLD.target_type, OLD.target_id, OLD.label)
         IS NOT DISTINCT FROM
         (NEW.source_type, NEW.source_id, NEW.target_type, NEW.target_id, NEW.label)
     AND NEW.origin IS DISTINCT FROM 'campaign' THEN
    RETURN NEW;
  END IF;

  -- The OLD edge's container is refreshed when the edge is removed or when it MOVED. An UPDATE
  -- that leaves the endpoints and label alone (a soft delete, a restore) names the same container
  -- in OLD and NEW, and the refresh reads the table as it is now — one refresh, below, is the
  -- whole answer; doing it twice doubled the cost of every trash and restore.
  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE'
         AND (OLD.source_type, OLD.source_id, OLD.target_type, OLD.target_id, OLD.label)
             IS DISTINCT FROM
             (NEW.source_type, NEW.source_id, NEW.target_type, NEW.target_id, NEW.label)) THEN
    PERFORM platform.reachability_touch(OLD.source_type, OLD.source_id,
                                        OLD.target_type, OLD.target_id, OLD.label);
  END IF;
  -- 1381: a bulk writer on the server may DEFER the refresh a NEW edge causes (never a removed
  -- edge: removal narrows access and is always immediate). platform.reachability_deferring() is
  -- true only for a trusted backend that set the transaction-local flag; the container is
  -- recorded in platform.reachability_pending, and platform.reachability_flush() settles it.
  IF TG_OP = 'INSERT' AND platform.reachability_deferring() THEN
    PERFORM platform.reachability_defer(NEW.source_type, NEW.source_id,
                                        NEW.target_type, NEW.target_id, NEW.label);
  ELSIF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM platform.reachability_touch(NEW.source_type, NEW.source_id,
                                        NEW.target_type, NEW.target_id, NEW.label);
  END IF;

  -- ---------------------------------------------------------------- W1-REL, and nothing above
  -- this line moved. custom/associations_guard: while it resolves false, or while this edge is
  -- not one of the campaign's own (origin IS NULL on every row that predates it), the function
  -- ends exactly where it used to.
  IF TG_OP <> 'DELETE'
     AND NEW.origin = 'campaign'
     AND platform.relations_are_on(NEW.organization_id) THEN
    UPDATE platform.reachability r
       SET origin = 'campaign'
     WHERE r.origin IS DISTINCT FROM 'campaign'
       AND ((r.container_id = NEW.source_id AND r.item_id = NEW.target_id)
         OR (r.container_id = NEW.target_id AND r.item_id = NEW.source_id));
  END IF;

  RETURN COALESCE(NEW, OLD);
END $function$;

update platform.feature_knob
   set value = to_jsonb(1000), default_value = to_jsonb(1000), max_value = 10000,
       basis = 'After platform_reachability_batch_unlink.sql a link costs ~0.3 ms plus ONE container refresh per batch (~40 ms on a 1,738-item site), so 1,000 links is well under a second. The rest is queued.',
       updated_at = now()
 where feature = 'platform.soft_delete_cascade' and key = 'inline_assoc_rows';

-- based-on: platform.soft_delete_cascade_step(uuid, integer) 2be33162d833cbb92bb238a0d087d2ee822d7b9911c6ebe39415d8511bfff867
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
  v_edges jsonb;
  v_prev_batch text;
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
        -- One reachability refresh per container per batch, not per link.
        v_prev_batch := coalesce(current_setting('platform.reachability_batch', true), '');
        perform pg_catalog.set_config('platform.reachability_batch', 'on', true);
        if j.direction = 'trash' then
          with u as (
            update platform.associations
               set deleted_at = now(), deleted_via_type = j.assoc_token, deleted_via_id = v_assoc_id
             where ctid = any (array(
                     select ctid from platform.associations
                      where deleted_at is null
                        and ((source_type = j.assoc_token and source_id = v_assoc_id)
                          or (target_type = j.assoc_token and target_id = v_assoc_id))
                      limit v_batch))
            returning source_type, source_id, target_type, target_id, label)
          select count(*), coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) into v_n, v_edges from u;
        else
          with u as (
            update platform.associations
               set deleted_at = null, deleted_via_type = null, deleted_via_id = null
             where ctid = any (array(
                     select ctid from platform.associations
                      where deleted_at is not null
                        and deleted_via_type = j.assoc_token and deleted_via_id = v_assoc_id
                      limit v_batch))
            returning source_type, source_id, target_type, target_id, label)
          select count(*), coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) into v_n, v_edges from u;
        end if;
        perform pg_catalog.set_config('platform.reachability_batch', v_prev_batch, true);
        perform platform._reachability_touch_edges(v_edges);
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

-- based-on: platform._gc_entity_associations() e0ff63ebe0919df23b6ecec312b905cdce24ed630785eccd26ecfe8ce9fb6824
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
  v_edges       jsonb;
  v_prev_batch  text;
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
    v_prev_batch := coalesce(current_setting('platform.reachability_batch', true), '');
        perform pg_catalog.set_config('platform.reachability_batch', 'on', true);
    with u as (
      update platform.associations
         set deleted_at       = now(),
             deleted_via_type = v_token,
             deleted_via_id   = v_id
       where ctid = any (array(
               select ctid from platform.associations
                where deleted_at is null
                  and ((source_type = v_token and source_id = v_id)
                    or (target_type = v_token and target_id = v_id))
                limit v_batch))
      returning source_type, source_id, target_type, target_id, label)
    select count(*), coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) into v_n, v_edges from u;
    perform pg_catalog.set_config('platform.reachability_batch', v_prev_batch, true);
    perform platform._reachability_touch_edges(v_edges);
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_prev_batch := coalesce(current_setting('platform.reachability_batch', true), '');
        perform pg_catalog.set_config('platform.reachability_batch', 'on', true);
    with u as (
      update platform.associations
         set deleted_at       = null,
             deleted_via_type = null,
             deleted_via_id   = null
       where ctid = any (array(
               select ctid from platform.associations
                where deleted_at is not null
                  and deleted_via_type = v_token
                  and deleted_via_id   = v_id
                limit v_batch))
      returning source_type, source_id, target_type, target_id, label)
    select count(*), coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) into v_n, v_edges from u;
    perform pg_catalog.set_config('platform.reachability_batch', v_prev_batch, true);
    perform platform._reachability_touch_edges(v_edges);
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

-- ---------------------------------------------------------------------------
-- Backfill, every declared edge: parts already live under a removed parent.
-- Measured 2026-09-30 on production: 104 on in-line edges (tool.binding 16,
-- transcripts studio segments/items 88) and, under removed websites, 283 links /
-- frontier rows plus 1,062 analysis results. In-line parts take the parent's exact
-- deleted_at (so a restore brings them back); deferred parts are queued and the
-- queue is drained here once.
-- ---------------------------------------------------------------------------
do $backfill$
declare
  e record;
  n bigint;
begin
  perform pg_catalog.set_config('app.actor_system', 'platform.soft_delete_cascade', true);
  for e in select * from platform.soft_delete_edge where action = 'cascade'
            order by parent_schema, parent_table, child_schema, child_table loop
    execute pg_catalog.format(
      'update %I.%I ch set deleted_at = pa.deleted_at from %I.%I pa '
      'where pa.%I = ch.%I and pa.deleted_at is not null and ch.deleted_at is null',
      e.child_schema, e.child_table, e.parent_schema, e.parent_table, e.parent_column, e.child_column);
    get diagnostics n = row_count;
    if n > 0 then
      raise notice '[soft-delete-cascade backfill] %.%.% -> %.%: % live part(s) stamped removed',
        e.child_schema, e.child_table, e.child_column, e.parent_schema, e.parent_table, n;
    end if;
  end loop;

  for e in select * from platform.soft_delete_edge where action = 'cascade_deferred'
            order by parent_schema, parent_table, child_schema, child_table loop
    execute pg_catalog.format(
      'insert into platform.soft_delete_cascade_job '
      '(parent_schema, parent_table, parent_column, parent_key, direction, stamp) '
      'select distinct %L, %L, %L, pa.%I::text, ''trash'', pa.deleted_at '
      'from %I.%I pa where pa.deleted_at is not null and exists ('
      'select 1 from %I.%I ch where ch.%I = pa.%I and ch.deleted_at is null) '
      'on conflict do nothing',
      e.parent_schema, e.parent_table, e.parent_column, e.parent_column,
      e.parent_schema, e.parent_table,
      e.child_schema, e.child_table, e.child_column, e.parent_column);
    get diagnostics n = row_count;
    if n > 0 then
      raise notice '[soft-delete-cascade backfill] %.% : % removed parent(s) queued for %.%',
        e.parent_schema, e.parent_table, n, e.child_schema, e.child_table;
    end if;
  end loop;
end
$backfill$;

select platform.soft_delete_cascade_drain(240000);
