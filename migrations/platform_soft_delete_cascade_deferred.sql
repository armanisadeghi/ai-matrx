-- chair-step: replaces web.site hand-rolled cascade triggers (DROP) with declared edges; server-only machinery table REVOKE closes a new relation to clients
-- =============================================================================
-- REMOVING A BIG THING NEVER TIMES OUT — the deferred soft-delete cascade.
--
-- 🚨 The defect (verified 2026-09-14, re-measured 2026-09-30 on the nightly clone):
-- deleting a marketing website with a large crawl hit the statement timeout, so
-- a customer could not delete it. `web.site_cascade_soft_delete_descendants`
-- stamped 19 child tables inside the one UPDATE of `web.site`, and every child
-- row fires its own trigger chain (history capture, association GC, provenance,
-- cross-pointer validation…). Measured on the clone, rolled back:
--   web.site f7f3208d… (31,474 pages)          24,856 ms   (authenticated: 8 s)
--   web.page, 1,000 rows                         738 ms   (_version_capture 354 ms of it)
-- The same class sits on two declared generic edges:
--   docproc.processed_documents -> rag.kg_chunks   max 10,319 per parent  19,321 ms
--   context.scope_types -> context.scopes          max  4,780 per parent
--
-- THE FIX, the way Vercel / GitHub / Stripe remove large resources: the parent is
-- marked removed at once (it leaves every list and stops being crawled or
-- scheduled in the same statement), and its bulk parts follow in bounded batches
-- through a durable queue.
--
--   * `platform.soft_delete_edge.action` gains `cascade_deferred` — "this child is
--     PART of the parent, but there can be too many to stamp inside one request".
--     It is a declaration, like `cascade`: one row per edge, one generic trigger.
--   * `platform._cascade_soft_delete()` still stamps `cascade` children in-line,
--     then ENQUEUES one `platform.soft_delete_cascade_job` per removed/restored
--     parent and runs ONE in-line step of it (knob `inline_budget_ms`), so a small
--     parent still finishes inside its own request and only a large one spills.
--   * `platform.soft_delete_cascade_step(job)` stamps at most `batch_rows` rows per
--     statement until `step_budget_ms` is spent, and records per-edge progress.
--     Trash stamps the parent's EXACT deleted_at, so restore stays exact — the same
--     contract as `_cascade_soft_delete`. A restore while a trash job is pending
--     cancels it and queues the inverse; stamps a cancelled job left behind are
--     carried forward (`absorb_stamps`) so nothing is stranded either way.
--   * `platform.soft_delete_cascade_drain(budget)` is the durable backstop for a
--     scheduler; the pg_cron job `soft-delete-cascade-drain` is created INACTIVE,
--     pending Arman's approval by name and interval (operations/scheduled-tasks.md).
--   * Two client doors: `public.soft_delete_cascade_progress(token, id)` (viewer)
--     reads server state; `public.soft_delete_cascade_advance(token, id)` (editor)
--     runs one bounded step so an open screen finishes the job and shows progress.
--
-- NOT a retention/purge job: nothing here destroys a row. Purge stays a policy row
-- of the lifecycle engine (common-docs/projects/data-lifecycle-platform/EXECUTION.md).
--
-- web.site's hand-rolled cascade (and the redundant website-property trigger) is
-- replaced by 19 declared edges with the SAME children: the five that stop crawling
-- or scheduling (schedule, preset, session, property, item config) stay `cascade`;
-- the fourteen bulk tables become `cascade_deferred`.
--
-- Guard: `public.__soft_delete_cascade_conformance()` gains
-- `sync_cascade_fanout_bounded` (no in-line edge whose largest live fan-out exceeds
-- knob `sync_fanout_ceiling`) and `deferred_cascade_draining` (no job stuck,
-- failed, or live part left under a removed parent with no job) — read by
-- `pnpm check:soft-delete-cascade`.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. The declaration gains `cascade_deferred`.
-- ---------------------------------------------------------------------------
alter table platform.soft_delete_edge drop constraint soft_delete_edge_action_check;
alter table platform.soft_delete_edge add constraint soft_delete_edge_action_check
  check (action = any (array['cascade'::text, 'cascade_deferred'::text, 'keep'::text]));

-- ---------------------------------------------------------------------------
-- 2. Knobs — every bound is a knob, never a constant.
-- ---------------------------------------------------------------------------
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due, overridable_by)
values
  ('platform.soft_delete_cascade', 'batch_rows', to_jsonb(500), to_jsonb(500), 'integer', 'rows', 50, 5000,
   'Removal: rows per batch',
   'How many parts of a removed item are stamped in one statement.',
   'agent',
   'Measured 2026-09-30 on the clone: 1,000 web.page rows took 738 ms with their triggers, so 500 is ~0.4 s per statement — far under the 8 s signed-in timeout on the heaviest child table.',
   date '2026-12-30', '{}'),
  ('platform.soft_delete_cascade', 'step_budget_ms', to_jsonb(2500), to_jsonb(2500), 'integer', 'ms', 200, 6000,
   'Removal: time per step',
   'How long one background or on-screen step keeps stamping before it stops.',
   'agent',
   'A step overshoots its budget by at most one batch (~0.4 s), so 2.5 s stays under the 8 s signed-in timeout with room for the rest of the request.',
   date '2026-12-30', '{}'),
  ('platform.soft_delete_cascade', 'inline_budget_ms', to_jsonb(1500), to_jsonb(1500), 'integer', 'ms', 0, 4000,
   'Removal: work done inside the request',
   'How much of a removal runs inside the request that removed the item.',
   'agent',
   'Small items finish inside their own request (~2,000 page-weight rows in 1.5 s); only large ones spill to the queue. 0 queues everything.',
   date '2026-12-30', '{}'),
  ('platform.soft_delete_cascade', 'drain_budget_ms', to_jsonb(45000), to_jsonb(45000), 'integer', 'ms', 1000, 55000,
   'Removal: time per background run',
   'How long one scheduled background run keeps working through the queue.',
   'agent',
   'Fits inside a once-a-minute schedule with room to spare: 45 s at ~1.4 rows/ms is ~60,000 page-weight rows a minute.',
   date '2026-12-30', '{}'),
  ('platform.soft_delete_cascade', 'sync_fanout_ceiling', to_jsonb(2000), to_jsonb(2000), 'integer', 'rows', 100, 10000,
   'Removal: most parts removed in-line',
   'An in-line removal edge with more live parts than this under one item must be queued instead.',
   'agent',
   '2,000 rows at the measured worst case (0.74 ms/row) is ~1.5 s — the in-line budget. Above it an edge belongs in cascade_deferred.',
   date '2026-12-30', '{}'),
  ('platform.soft_delete_cascade', 'stale_minutes', to_jsonb(15), to_jsonb(15), 'integer', 'minutes', 2, 1440,
   'Removal: queued too long',
   'A queued removal older than this is reported as stuck.',
   'agent',
   'The drain runs every minute and moves ~60,000 rows per run, so any real job clears in a few minutes; 15 is a loud margin.',
   date '2026-12-30', '{}')
on conflict (feature, key) do nothing;

create or replace function platform._soft_delete_cascade_knob(p_key text, p_default integer)
returns integer
language sql
stable
set search_path to ''
as $function$
  select coalesce(
    (select (coalesce(k.value, k.default_value))::text::integer
       from platform.feature_knob k
      where k.feature = 'platform.soft_delete_cascade' and k.key = p_key and k.archived_at is null),
    p_default);
$function$;

-- ---------------------------------------------------------------------------
-- 3. The queue — system machinery, server-only.
-- ---------------------------------------------------------------------------
create table platform.soft_delete_cascade_job (
  id              uuid primary key default gen_random_uuid(),
  parent_schema   text        not null,
  parent_table    text        not null,
  parent_column   text        not null default 'id',
  parent_key      text        not null,
  direction       text        not null check (direction in ('trash', 'restore')),
  stamp           timestamptz not null,
  absorb_stamps   timestamptz[] not null default '{}',
  state           text        not null default 'pending'
                              check (state in ('pending', 'done', 'cancelled', 'failed')),
  completed_edges text[]      not null default '{}',
  rows_total      bigint,
  rows_done       bigint      not null default 0,
  steps           integer     not null default 0,
  attempts        integer     not null default 0,
  last_error      text,
  requested_by    uuid,
  enqueued_at     timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table platform.soft_delete_cascade_job is
  'Queued removal/restore of a soft-deleted parent''s cascade_deferred parts, stamped in bounded batches '
  'by platform.soft_delete_cascade_step. Server-only; clients read progress through '
  'public.soft_delete_cascade_progress. Rows are kept as the audit trail.';

create unique index soft_delete_cascade_job_one_pending
  on platform.soft_delete_cascade_job (parent_schema, parent_table, parent_column, parent_key)
  where state = 'pending';
create index soft_delete_cascade_job_pending_idx
  on platform.soft_delete_cascade_job (enqueued_at) where state = 'pending';
create index soft_delete_cascade_job_parent_idx
  on platform.soft_delete_cascade_job (parent_schema, parent_table, parent_key, enqueued_at desc);

alter table platform.soft_delete_cascade_job enable row level security;
revoke all on platform.soft_delete_cascade_job from public, anon, authenticated;

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'soft_delete_cascade_job', 'platform', 'soft_delete_cascade_job', 'Soft-delete cascade job', 1, false, false, true,
  'Queue of bulk removals/restores following a soft-deleted parent (cascade_deferred edges).',
  false, false, false, 'system', false, 'machinery',
  'Server-only queue written by platform._cascade_soft_delete and drained by platform.soft_delete_cascade_step; iam.apply_rls must never generate client policies over it.',
  'table', 'organization',
  'System machinery has no client lane; it holds parent keys and counts only, and clients read progress through an access-checked door.',
  'organization', 'standard', 'system',
  'Platform soft-delete machinery (db-rules §8a), consumed only by definer functions.',
  false, false, 'platform.soft_delete_cascade_job'::regclass
);

-- ---------------------------------------------------------------------------
-- 4. Enqueue, step, drain.
-- ---------------------------------------------------------------------------
create or replace function platform._soft_delete_cascade_job_json(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
           'job_id', j.id, 'direction', j.direction, 'state', j.state,
           'rows_done', j.rows_done, 'rows_total', j.rows_total, 'steps', j.steps,
           'enqueued_at', j.enqueued_at, 'updated_at', j.updated_at,
           'finished_at', j.finished_at, 'last_error', j.last_error)
    from platform.soft_delete_cascade_job j
   where j.id = p_job_id;
$function$;
revoke all on function platform._soft_delete_cascade_job_json(uuid) from public, anon, authenticated;

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
revoke all on function platform._soft_delete_cascade_enqueue(text, text, text, text, text, timestamptz)
  from public, anon, authenticated;

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
revoke all on function platform.soft_delete_cascade_step(uuid, integer) from public, anon, authenticated;

create or replace function platform.soft_delete_cascade_drain(p_budget_ms integer default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_budget integer := coalesce(p_budget_ms, platform._soft_delete_cascade_knob('drain_budget_ms', 45000));
  v_step integer := platform._soft_delete_cascade_knob('step_budget_ms', 2500);
  v_deadline timestamptz := clock_timestamp() + make_interval(secs => v_budget / 1000.0);
  v_job uuid;
  v_seen uuid[] := '{}';
  v_state jsonb;
  v_steps integer := 0;
  v_done integer := 0;
begin
  perform pg_catalog.set_config('app.actor_system', 'platform.soft_delete_cascade', true);
  while clock_timestamp() < v_deadline loop
    select id into v_job
      from platform.soft_delete_cascade_job
     where state = 'pending' and not (id = any (v_seen))
     order by enqueued_at
     limit 1
     for update skip locked;
    exit when v_job is null;
    loop
      v_state := platform.soft_delete_cascade_step(
        v_job,
        least(v_step, greatest(1, (extract(epoch from (v_deadline - clock_timestamp())) * 1000)::integer)));
      v_steps := v_steps + 1;
      exit when v_state ->> 'state' <> 'pending'
             or v_state ->> 'last_error' is not null
             or clock_timestamp() >= v_deadline;
    end loop;
    if v_state ->> 'state' = 'done' then v_done := v_done + 1; end if;
    v_seen := v_seen || v_job;
    v_job := null;
  end loop;
  return jsonb_build_object('steps', v_steps, 'jobs_finished', v_done,
    'pending', (select count(*) from platform.soft_delete_cascade_job where state = 'pending'));
end;
$function$;
revoke all on function platform.soft_delete_cascade_drain(integer) from public, anon, authenticated;

-- The four definers above are server-only machinery; they say so in data.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', '_soft_delete_cascade_job_json', 'p_job_id uuid', array['uuid'::regtype]::oid[],
   'p_job_id: a platform.soft_delete_cascade_job id, only ever passed by the cascade functions and by public.soft_delete_cascade_progress after its iam.has_access check. NULL returns NULL.',
   'platform_soft_delete_cascade_deferred.sql',
   'server_only: called inside the soft-delete cascade functions and the two access-checked public doors, never by a client.',
   false, false),
  ('platform', '_soft_delete_cascade_enqueue',
   'p_schema text, p_table text, p_parent_column text, p_key text, p_direction text, p_stamp timestamp with time zone',
   array['text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype, 'timestamptz'::regtype]::oid[],
   'p_key: the key of a parent row whose deleted_at just changed; only platform._cascade_soft_delete calls it, after the caller''s own UPDATE passed RLS on that parent.',
   'platform_soft_delete_cascade_deferred.sql',
   'server_only: called only by the platform._cascade_soft_delete trigger, never by a client.',
   false, false),
  ('platform', 'soft_delete_cascade_step', 'p_job_id uuid, p_budget_ms integer',
   array['uuid'::regtype, 'int4'::regtype]::oid[],
   'p_job_id: a queued cascade job; it stamps only rows under that job''s parent on its declared edges. Callers: the parent trigger, the drain, and public.soft_delete_cascade_advance after its iam.has_access editor check.',
   'platform_soft_delete_cascade_deferred.sql',
   'server_only: called by the cascade trigger, the scheduled drain and one access-checked public door, never by a client.',
   false, false),
  ('platform', 'soft_delete_cascade_drain', 'p_budget_ms integer', array['int4'::regtype]::oid[],
   'No entity id; p_budget_ms is a time budget. Drains every pending cascade job.',
   'platform_soft_delete_cascade_deferred.sql',
   'server_only: the pg_cron job soft-delete-cascade-drain is its only caller; a client must never drain every organization''s queue.',
   false, false);

-- ---------------------------------------------------------------------------
-- 5. The generic trigger: in-line edges as before, deferred edges queued.
-- ---------------------------------------------------------------------------
-- based-on: platform._cascade_soft_delete() 474f882b24bfebe0b123201e0ef24f430fa2624a1c6964de2f6a0f6c28c952fe
create or replace function platform._cascade_soft_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  e record;
  v_rows bigint;
  v_parent_key text;
  v_child_type text;
  v_job uuid;
begin
  for e in
    select child_schema, child_table, child_column, parent_column
      from platform.soft_delete_edge
     where parent_schema = tg_table_schema
       and parent_table  = tg_table_name
       and action = 'cascade'
     order by child_schema, child_table, child_column
  loop
    v_rows := 0;
    -- The key travels as text and is compared cast to the child column's real
    -- type: uuid edges keep their index, text edges (surface names, executor
    -- names) work instead of failing a uuid cast.
    v_parent_key := to_jsonb(new) ->> e.parent_column;
    continue when v_parent_key is null;
    select pg_catalog.format_type(a.atttypid, a.atttypmod) into v_child_type
      from pg_catalog.pg_attribute a
     where a.attrelid = pg_catalog.format('%I.%I', e.child_schema, e.child_table)::pg_catalog.regclass
       and a.attname = e.child_column and not a.attisdropped;

    -- TRASH: stamp every live part with the parent's EXACT deleted_at. The
    -- shared timestamp is what makes the restore below exact — it is the same
    -- trick platform._gc_entity_associations plays with deleted_via_id, without
    -- needing two new columns on every child table.
    if old.deleted_at is null and new.deleted_at is not null then
      execute pg_catalog.format(
        'update %I.%I set deleted_at = $1 where %I = $2::%s and deleted_at is null',
        e.child_schema, e.child_table, e.child_column, v_child_type
      ) using new.deleted_at, v_parent_key;
      get diagnostics v_rows = row_count;

    -- RESTORE: bring back exactly what THIS removal took, and nothing else. A
    -- part someone had already removed by hand keeps its own timestamp and
    -- stays removed.
    elsif old.deleted_at is not null and new.deleted_at is null then
      execute pg_catalog.format(
        'update %I.%I set deleted_at = null where %I = $1::%s and deleted_at = $2',
        e.child_schema, e.child_table, e.child_column, v_child_type
      ) using v_parent_key, old.deleted_at;
      get diagnostics v_rows = row_count;
    end if;
    if v_rows > 0 then
      -- Nothing fails silently, and nothing succeeds silently either: a removal
      -- that reached other rows says so where the DB log can be read.
      raise notice '[soft-delete-cascade] %.% -> %.%.% : % row(s) followed %.% %',
        tg_table_schema, tg_table_name, e.child_schema, e.child_table,
        e.child_column, v_rows, tg_table_schema, tg_table_name, v_parent_key;
    end if;
  end loop;

  -- DEFERRED: parts that can be too many to stamp inside one request are queued
  -- (platform.soft_delete_cascade_job) and one bounded step runs right here, so a
  -- small parent still finishes in its own request and a large one never times out.
  if (old.deleted_at is null) <> (new.deleted_at is null) then
    for e in
      select distinct parent_column
        from platform.soft_delete_edge
       where parent_schema = tg_table_schema
         and parent_table  = tg_table_name
         and action = 'cascade_deferred'
    loop
      v_parent_key := to_jsonb(new) ->> e.parent_column;
      continue when v_parent_key is null;
      v_job := platform._soft_delete_cascade_enqueue(
        tg_table_schema, tg_table_name, e.parent_column, v_parent_key,
        case when new.deleted_at is not null then 'trash' else 'restore' end,
        coalesce(new.deleted_at, old.deleted_at));
      perform platform.soft_delete_cascade_step(
        v_job, platform._soft_delete_cascade_knob('inline_budget_ms', 1500));
    end loop;
  end if;

  return null;
end;
$function$;

-- The child guard covers deferred edges too: a part may not be attached LIVE to
-- a parent that is already removed, whichever lane stamps its siblings.
-- based-on: platform._guard_soft_delete_parent() 5fcc61c9032aab88f55e13e7dca90935f3e93b1d3c9a5a4004998f567b03c75d
create or replace function platform._guard_soft_delete_parent()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  e record;
  v_child_ref text;
  v_parent_type text;
  v_parent_gone timestamptz;
begin
  -- Removing the child is always allowed; only leaving it LIVE under a removed
  -- parent is refused. This also lets the cascade above do its work.
  if to_jsonb(new) ->> 'deleted_at' is not null then
    return new;
  end if;

  for e in
    select parent_schema, parent_table, parent_column, child_column, parent_noun
      from platform.soft_delete_edge
     where child_schema = tg_table_schema
       and child_table  = tg_table_name
       and action in ('cascade', 'cascade_deferred')
  loop
    -- Text, compared cast to the parent column's real type (uuid or text key).
    v_child_ref := nullif(to_jsonb(new) ->> e.child_column, '');
    continue when v_child_ref is null;
    select pg_catalog.format_type(a.atttypid, a.atttypmod) into v_parent_type
      from pg_catalog.pg_attribute a
     where a.attrelid = pg_catalog.format('%I.%I', e.parent_schema, e.parent_table)::pg_catalog.regclass
       and a.attname = e.parent_column and not a.attisdropped;

    execute pg_catalog.format(
      'select deleted_at from %I.%I where %I = $1::%s',
      e.parent_schema, e.parent_table, e.parent_column, v_parent_type
    ) into v_parent_gone using v_child_ref;

    if v_parent_gone is not null then
      raise exception using
        errcode = '23514',
        message = pg_catalog.format(
          'That %s has been removed, so nothing more can be added to it.',
          e.parent_noun
        ),
        detail  = pg_catalog.format(
          'This row points at %I.%I %s, which was removed on %s. Leaving it live here '
          'would put working parts under something no screen shows any more.',
          e.parent_schema, e.parent_table, v_child_ref,
          pg_catalog.to_char(v_parent_gone, 'YYYY-MM-DD HH24:MI')
        ),
        hint    = 'Restore it first if you still need it, or point this at one that is still there.';
    end if;
  end loop;

  return new;
end;
$function$;

-- Declaring a deferred edge wires the parent trigger too (never the child guard:
-- deferred children are the hot bulk tables, and the guard is a per-row lookup).
-- based-on: platform.declare_soft_delete_edge(text, text, text, text, text, text, text, text, text, text) 95104a43381bdabbe676cb4683fbe0d53efe7649677c924f255d2b096c472d03
create or replace function platform.declare_soft_delete_edge(p_parent_schema text, p_parent_table text, p_child_schema text, p_child_table text, p_child_column text, p_action text, p_reason text, p_declared_by text, p_parent_noun text default 'item'::text, p_parent_column text default 'id'::text)
 returns void
 language plpgsql
as $function$
begin
  insert into platform.soft_delete_edge(
    parent_schema, parent_table, parent_column,
    child_schema, child_table, child_column,
    action, parent_noun, reason, declared_by)
  values (p_parent_schema, p_parent_table, p_parent_column,
          p_child_schema, p_child_table, p_child_column,
          p_action, p_parent_noun, p_reason, p_declared_by)
  on conflict (child_schema, child_table, child_column, parent_schema, parent_table)
  do update set action      = excluded.action,
                parent_noun = excluded.parent_noun,
                reason      = excluded.reason,
                declared_by = excluded.declared_by,
                declared_at = now();

  if p_action in ('cascade', 'cascade_deferred') then
    perform platform.attach_soft_delete_cascade(p_parent_schema, p_parent_table);
  end if;
  if p_action = 'cascade' then
    perform platform.attach_soft_delete_child_guard(p_child_schema, p_child_table);
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. web.site: the hand-rolled cascade becomes 19 declared edges (same children).
-- ---------------------------------------------------------------------------
drop trigger _cascade_soft_delete_descendants on web.site;
drop trigger _cascade_website_property on web.site;
drop function web.site_cascade_soft_delete_descendants();
drop function web.site_cascade_website_property();

select platform.declare_soft_delete_edge('web', 'site', 'web', t.child, 'site_id', t.action, t.reason,
                                         'platform_soft_delete_cascade_deferred.sql', 'website')
  from (values
    ('crawl_schedule',   'cascade', 'A schedule of a removed site must stop firing in the same statement.'),
    ('crawl_preset',     'cascade', 'A crawl preset is configuration of the site; a handful per site.'),
    ('crawl_session',    'cascade', 'Crawl runs of a removed site stop being resumable in the same statement.'),
    ('property',         'cascade', 'The site''s web presence (one live row per site) leaves with it.'),
    ('site_item_config', 'cascade', 'Per-site finding configuration; bounded by the item catalogue.'),
    ('analysis_result',  'cascade_deferred', 'Computed analyses of the site; grows with every crawl.'),
    ('crawl_event',      'cascade_deferred', 'Crawl log lines; hundreds per crawl.'),
    ('crawl_url',        'cascade_deferred', 'The crawl frontier; one row per URL seen.'),
    ('discovered_item',  'cascade_deferred', 'Items discovered on the site''s pages.'),
    ('finding',          'cascade_deferred', 'Audit findings; one per page per rule.'),
    ('gsc_page_stat',    'cascade_deferred', 'Search Console stats per page per day.'),
    ('link_edge',        'cascade_deferred', 'Internal link graph; many rows per page.'),
    ('page',             'cascade_deferred', 'Pages of the site; 33,517 on the largest measured site.'),
    ('page_content',     'cascade_deferred', 'Extracted page content; one per page version.'),
    ('page_evidence',    'cascade_deferred', 'Evidence rows per page and source.'),
    ('page_sitemap',     'cascade_deferred', 'Page-to-sitemap membership; one per page per sitemap.'),
    ('screenshot',       'cascade_deferred', 'Page screenshots.'),
    ('sitemap',          'cascade_deferred', 'Sitemaps; a large site has hundreds of sitemap files.'),
    ('snapshot',         'cascade_deferred', 'Captured page snapshots.')
  ) as t(child, action, reason);

-- The two generic edges measured over the in-line ceiling move to the queue.
update platform.soft_delete_edge
   set action = 'cascade_deferred',
       reason = reason || ' — deferred 2026-09-30: up to 10,319 chunks under one document took 19.3 s in-line.',
       declared_by = 'platform_soft_delete_cascade_deferred.sql', declared_at = now()
 where parent_schema = 'docproc' and parent_table = 'processed_documents'
   and child_schema = 'rag' and child_table = 'kg_chunks' and child_column = 'processed_document_id';
update platform.soft_delete_edge
   set action = 'cascade_deferred',
       reason = reason || ' — deferred 2026-09-30: one scope type holds 4,780 scopes, over the in-line ceiling.',
       declared_by = 'platform_soft_delete_cascade_deferred.sql', declared_at = now()
 where parent_schema = 'context' and parent_table = 'scope_types'
   and child_schema = 'context' and child_table = 'scopes' and child_column = 'scope_type_id';

-- Parts already left live under removed sites (283 measured 2026-09-30, written
-- after their site was removed) are queued like any other removal.
insert into platform.soft_delete_cascade_job
  (parent_schema, parent_table, parent_column, parent_key, direction, stamp)
select 'web', 'site', 'id', s.id::text, 'trash', s.deleted_at
  from web.site s
 where s.deleted_at is not null
   and (exists (select 1 from web.link_edge c where c.site_id = s.id and c.deleted_at is null)
     or exists (select 1 from web.crawl_url c where c.site_id = s.id and c.deleted_at is null)
     or exists (select 1 from web.page c where c.site_id = s.id and c.deleted_at is null)
     or exists (select 1 from web.crawl_event c where c.site_id = s.id and c.deleted_at is null));

-- ---------------------------------------------------------------------------
-- 7. Client doors — progress from server state, and a bounded step.
-- ---------------------------------------------------------------------------
create or replace function public.soft_delete_cascade_progress(p_token text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_s text; v_t text; v_job uuid;
begin
  if not iam.has_access(p_token, p_id, 'viewer') then
    raise exception 'access denied' using errcode = '42501';
  end if;
  select schema_name, table_name into v_s, v_t from platform.entity_types where token = p_token;
  select id into v_job from platform.soft_delete_cascade_job
   where parent_schema = v_s and parent_table = v_t and parent_key = p_id::text
   order by enqueued_at desc limit 1;
  return platform._soft_delete_cascade_job_json(v_job);
end;
$function$;

create or replace function public.soft_delete_cascade_advance(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_s text; v_t text; v_job uuid;
begin
  if not iam.has_access(p_token, p_id, 'editor') then
    raise exception 'access denied' using errcode = '42501';
  end if;
  select schema_name, table_name into v_s, v_t from platform.entity_types where token = p_token;
  select id into v_job from platform.soft_delete_cascade_job
   where parent_schema = v_s and parent_table = v_t and parent_key = p_id::text and state = 'pending'
   order by enqueued_at desc limit 1;
  if v_job is not null then
    perform platform.soft_delete_cascade_step(v_job, null);
  end if;
  return public.soft_delete_cascade_progress(p_token, p_id);
end;
$function$;


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by)
values
  ('public', 'soft_delete_cascade_progress', 'p_token text, p_id uuid', '{25,2950}',
   'Reads the latest removal/restore job of one record the caller can view (iam.has_access viewer); returns counts and state only.',
   'platform_soft_delete_cascade_deferred.sql'),
  ('public', 'soft_delete_cascade_advance', 'p_token text, p_id uuid', '{25,2950}',
   'Runs one bounded step (knob step_budget_ms) of the pending removal/restore of one record the caller can edit (iam.has_access editor); stamps only rows that record''s declared removal already owns.',
   'platform_soft_delete_cascade_deferred.sql');

grant execute on function public.soft_delete_cascade_progress(text, uuid) to authenticated;
grant execute on function public.soft_delete_cascade_advance(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The durable backstop — created INACTIVE pending Arman's approval
--    ("soft-delete-cascade-drain", every minute; operations/scheduled-tasks.md).
-- ---------------------------------------------------------------------------
select cron.schedule(
  'soft-delete-cascade-drain', '* * * * *',
  $cron$SET statement_timeout = '2min'; SET lock_timeout = '5s'; SELECT platform.soft_delete_cascade_drain();$cron$);
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'soft-delete-cascade-drain';

-- ---------------------------------------------------------------------------
-- 9. The guard.
-- ---------------------------------------------------------------------------
-- based-on: public.__soft_delete_cascade_conformance() bda3da720807c00a472beec1e479005f5e520a10b2c54c2327d5c73f9966582e
create or replace function public.__soft_delete_cascade_conformance()
 returns table(check_key text, ok boolean, severity text, detail jsonb)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_missing_cascade jsonb;
  v_missing_guard   jsonb;
  v_bad_shape       jsonb;
  v_orphans         jsonb;
  v_mandate_edges   jsonb;
  v_unsoftdeletable jsonb;
  v_over_fanout     jsonb := '[]'::jsonb;
  v_ceiling         integer := platform._soft_delete_cascade_knob('sync_fanout_ceiling', 2000);
  v_stale_minutes   integer := platform._soft_delete_cascade_knob('stale_minutes', 15);
  v_stuck           jsonb;
  v_deferred_orphans jsonb := '[]'::jsonb;
  e record;
  v_n bigint;
begin
  select coalesce(jsonb_agg(distinct e2.parent_schema||'.'||e2.parent_table), '[]'::jsonb)
    into v_missing_cascade
    from platform.soft_delete_edge e2
   where e2.action in ('cascade', 'cascade_deferred')
     and not exists (
       select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = e2.parent_schema and c.relname = e2.parent_table
         and t.tgname = '_cascade_softdelete'
         and not t.tgisinternal
         and t.tgenabled <> 'D'
         and (t.tgtype & 1) = 1
         and (t.tgtype & 2) = 0
         and (t.tgtype & 16) = 16
     );

  select coalesce(jsonb_agg(distinct e2.child_schema||'.'||e2.child_table), '[]'::jsonb)
    into v_missing_guard
    from platform.soft_delete_edge e2
   where e2.action = 'cascade'
     and not exists (
       select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = e2.child_schema and c.relname = e2.child_table
         and t.tgname = '_guard_soft_delete_parent'
         and not t.tgisinternal
         and t.tgenabled <> 'D'
         and (t.tgtype & 1) = 1
         and (t.tgtype & 2) = 2
     );

  select coalesce(jsonb_agg(n.nspname||'.'||p.proname), '[]'::jsonb)
    into v_bad_shape
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform'
     and p.proname in ('_cascade_soft_delete', '_guard_soft_delete_parent', 'soft_delete_cascade_step')
     and p.prosecdef is not true;

  select coalesce(jsonb_agg(e2.child_schema||'.'||e2.child_table), '[]'::jsonb)
    into v_unsoftdeletable
    from platform.soft_delete_edge e2
   where e2.action in ('cascade', 'cascade_deferred')
     and not exists (
       select 1 from information_schema.columns c
        where c.table_schema = e2.child_schema
          and c.table_name   = e2.child_table
          and c.column_name  = 'deleted_at'
     );

  select coalesce(jsonb_agg(jsonb_build_object('edge', c.edge, 'live_rows', c.live_rows_under_removed_parent)), '[]'::jsonb)
    into v_orphans
    from platform.soft_delete_orphan_census() c
   where c.action = 'cascade' and c.live_rows_under_removed_parent > 0;

  -- An in-line edge is stamped inside the removing request; one whose largest
  -- live fan-out exceeds the ceiling will time out that request. It belongs in
  -- cascade_deferred.
  for e in
    select * from platform.soft_delete_edge
     where action = 'cascade'
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = soft_delete_edge.child_schema
                      and c.table_name = soft_delete_edge.child_table
                      and c.column_name = 'deleted_at')
  loop
    execute pg_catalog.format(
      'select coalesce(max(n), 0) from (select count(*) n from %I.%I '
      'where deleted_at is null and %I is not null group by %I) x',
      e.child_schema, e.child_table, e.child_column, e.child_column) into v_n;
    if v_n > v_ceiling then
      v_over_fanout := v_over_fanout || jsonb_build_object(
        'edge', e.child_schema||'.'||e.child_table||'.'||e.child_column||' -> '||e.parent_schema||'.'||e.parent_table,
        'largest_live_fanout', v_n);
    end if;
  end loop;

  -- The queue must drain: no job waiting past the stale window, none failed, and
  -- no live deferred part under a removed parent that has no job coming for it.
  select coalesce(jsonb_agg(jsonb_build_object(
           'job_id', j.id, 'parent', j.parent_schema||'.'||j.parent_table||' '||j.parent_key,
           'state', j.state, 'enqueued_at', j.enqueued_at, 'last_error', j.last_error)), '[]'::jsonb)
    into v_stuck
    from platform.soft_delete_cascade_job j
   where (j.state = 'pending' and j.enqueued_at < now() - make_interval(mins => v_stale_minutes))
      or (j.state = 'failed' and j.finished_at > now() - interval '30 days');

  for e in select * from platform.soft_delete_edge where action = 'cascade_deferred' loop
    execute pg_catalog.format(
      'select count(*) from %I.%I ch where ch.deleted_at is null and ch.%I = any (array('
      'select pa.%I from %I.%I pa where pa.deleted_at is not null and not exists ('
      'select 1 from platform.soft_delete_cascade_job j where j.state = ''pending'' '
      'and j.parent_schema = %L and j.parent_table = %L and j.parent_key = pa.%I::text)))',
      e.child_schema, e.child_table, e.child_column,
      e.parent_column, e.parent_schema, e.parent_table,
      e.parent_schema, e.parent_table, e.parent_column) into v_n;
    if v_n > 0 then
      v_deferred_orphans := v_deferred_orphans || jsonb_build_object(
        'edge', e.child_schema||'.'||e.child_table||'.'||e.child_column||' -> '||e.parent_schema||'.'||e.parent_table,
        'live_rows_without_job', v_n);
    end if;
  end loop;

  select coalesce(jsonb_object_agg(e2.child_schema||'.'||e2.child_table||'.'||e2.child_column, e2.action), '{}'::jsonb)
    into v_mandate_edges
    from platform.soft_delete_edge e2
   where e2.parent_schema = 'mandate' and e2.parent_table = 'definition';

  return query
  select 'cascade_trigger_installed',
         v_missing_cascade = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'Parents with a cascade or cascade_deferred edge but no live AFTER-UPDATE-ROW _cascade_softdelete trigger.',
                            'parents_missing_trigger', v_missing_cascade)
  union all
  select 'child_guard_installed',
         v_missing_guard = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'Cascade children with no live BEFORE-ROW _guard_soft_delete_parent trigger — a part could be attached to a removed parent again.',
                            'children_missing_guard', v_missing_guard)
  union all
  select 'functions_security_definer',
         v_bad_shape = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'The cascade functions must stay SECURITY DEFINER; as INVOKER the cascade stops reaching RLS-protected children for real users.',
                            'not_definer', v_bad_shape)
  union all
  select 'cascade_child_is_soft_deletable',
         v_unsoftdeletable = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'A cascade edge whose child table has no deleted_at column is a cascade that can never fire — the parent is removed and every part stays live.',
                            'children_without_deleted_at', v_unsoftdeletable)
  union all
  select 'no_live_orphans',
         v_orphans = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'Live rows sitting under a soft-deleted parent on a declared cascade edge — the original defect, back.',
                            'edges', v_orphans)
  union all
  select 'sync_cascade_fanout_bounded',
         v_over_fanout = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'An in-line cascade edge whose largest live fan-out is over the ceiling times out the request that removes its parent. Declare it cascade_deferred.',
                            'ceiling', v_ceiling, 'edges', v_over_fanout)
  union all
  select 'deferred_cascade_draining',
         v_stuck = '[]'::jsonb and v_deferred_orphans = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'Queued removals must finish: a job pending past the stale window or failed, or live deferred parts under a removed parent with no job coming, means the queue is not draining.',
                            'stale_minutes', v_stale_minutes, 'stuck_jobs', v_stuck,
                            'orphans_without_job', v_deferred_orphans)
  union all
  select 'mandate_edges_declared',
         v_mandate_edges = jsonb_build_object(
           'mandate.binding.mandate_id', 'cascade',
           'mandate.treatment.mandate_id', 'cascade',
           'agent.exemplar.mandate_id', 'cascade',
           'agent.mandate_note.mandate_id', 'cascade',
           'app.definition.mandate_id', 'keep',
           'mandate.definition.source_mandate_id', 'keep',
           'mandate.reference.mandate_id', 'keep',
           'mandate.observation.mandate_id', 'keep'), 'error',
         jsonb_build_object('why', 'The eight inbound edges of mandate.definition and what each was ruled to mean. A new FK into mandate.definition lands here as a mismatch rather than as silence. reference + observation were ruled KEEP by migration 0607 (2026-09-09).',
                            'declared', v_mandate_edges);
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('public', '__soft_delete_cascade_conformance', '', '{}'::oid[],
   'No arguments; returns catalog facts and row counts across every declared soft-delete edge.',
   'platform_soft_delete_cascade_deferred.sql',
   'server_only: read with the secret key by pnpm check:soft-delete-cascade (service_role); it counts rows across every organization, so no client may call it.',
   false, false)
on conflict do nothing;
