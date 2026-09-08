-- =============================================================================
-- ONE PLACE DECIDES WHAT REMOVING A THING MEANS.
--
-- 🚨 The defect (found 2026-09-08, one-resolution campaign FIX-R14 → FIX-R15):
-- soft-deleting a `mandate.definition` left every row that hangs off it LIVE.
-- Four campaign lanes each obeyed the fixture law exactly — removed their
-- scratch job through the UI, re-read, confirmed it gone — and each left live
-- rows behind. A rule that can be satisfied on the surface people look at and
-- missed underneath it is a defect in the door, not in the people using it.
--
-- Measured RED on this database, 2026-09-08, before this file was applied:
--   one job removed  ->  live bindings 1, treatments 1, exemplars 1, notes 1
--   and attaching a NEW part to an ALREADY-removed job was ACCEPTED.
--
-- WHY THE DATABASE AND NOT THE SERVICE. A mandate can be removed through at
-- least three doors that do not share a line of code: the frontend writes
-- `deleted_at` straight to PostgREST (`features/mandates/admin/service.ts`),
-- `public.entity_soft_delete(token, id)` stamps it for any registered entity,
-- and aidream's ORM / a migration / psql can stamp it directly. Putting the
-- answer in any one of them leaves the other two wrong. The row is the only
-- thing all three doors pass through.
--
-- WHY A REGISTRY AND NOT A MANDATE-SHAPED TRIGGER. The platform already carries
-- FIVE hand-rolled soft-delete cascades, each knowing one feature's tables:
-- `workflow._cascade_definition_soft_delete`, `web.site_cascade_soft_delete_
-- descendants`, `docproc.cascade_file_softdelete_to_documents`,
-- `rag.soft_delete_members_on_file_delete`, `plan._node_cascade`. A sixth would
-- have been the instance fix. This is the shared layer instead: the parent/child
-- meaning is DATA, one generic trigger reads it, and any feature declares its
-- own with one INSERT. It is a deliberate sibling of the entity-table trigger
-- the platform already attaches for exactly this event —
-- `platform._gc_entity_associations`, AFTER UPDATE OF deleted_at — and it
-- copies that function's trash/restore symmetry on purpose.
--
-- SCOPE OF THIS FILE. It builds the primitive and declares the mandate edges.
-- It does NOT classify the rest of the platform: 2,050 foreign keys point at a
-- soft-deletable parent from a soft-deletable child, and 86 of them are holding
-- 30,451 live rows under removed parents today (census 2026-09-08). Most of
-- those are almost certainly legitimate `keep` references; some are this same
-- defect. That is a campaign with an owner, not a side effect of this one —
-- `platform.v_soft_delete_edge_unclassified` is the scoreboard it starts from.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. THE DECLARATION — what a child row means to its parent.
-- -----------------------------------------------------------------------------
-- Machinery, not tenant data: no `organization_id`, no entity token, RLS on with
-- no policy so no client can read or write it (the shape `platform.lifecycle_
-- reference_map` and `platform.deprecated_relations` already use).
create table if not exists platform.soft_delete_edge (
  id            uuid primary key default gen_random_uuid(),
  parent_schema text not null,
  parent_table  text not null,
  parent_column text not null default 'id',
  child_schema  text not null,
  child_table   text not null,
  child_column  text not null,
  -- 'cascade' = the child is PART OF the parent and goes away with it.
  -- 'keep'    = the child merely REFERENCES the parent and outlives it.
  -- There is no third answer and no default: an edge nobody has ruled on shows
  -- up in platform.v_soft_delete_edge_unclassified rather than guessing.
  action        text not null check (action in ('cascade', 'keep')),
  -- What a person calls the parent. `mandate.definition` is a "job" to the human
  -- who removed it; the guard below refuses in THEIR words, never the table's.
  parent_noun   text not null default 'item',
  -- Why, in the words of someone deciding it. Not optional — an unexplained
  -- 'keep' is how this defect survives its next reader.
  reason        text not null check (length(btrim(reason)) > 0),
  declared_by   text not null,
  declared_at   timestamptz not null default now(),
  constraint soft_delete_edge_unique
    unique (child_schema, child_table, child_column, parent_schema, parent_table)
);

comment on table platform.soft_delete_edge is
  'The one declaration of what soft-deleting a row means for the rows that hang off it. '
  'action=cascade: the child is part of the parent and is stamped with the parent''s '
  'exact deleted_at (and un-stamped on restore). action=keep: the child references the '
  'parent and outlives it. Enforced by platform._cascade_soft_delete on the parent and '
  'platform._guard_soft_delete_parent on the child.';

alter table platform.soft_delete_edge
  add column if not exists parent_noun text not null default 'item';

alter table platform.soft_delete_edge enable row level security;

-- -----------------------------------------------------------------------------
-- 2. THE CASCADE — one generic trigger, on the parent.
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER because the children are RLS-protected and the person
-- removing the parent is allowed to remove its parts by definition — they are
-- not separate things they need separate permission for. The permission
-- decision already happened on the parent row: RLS and
-- iam._guard_governance_columns both ran against the caller before this fires.
create or replace function platform._cascade_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  e record;
  v_rows bigint;
  v_parent_id uuid;
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
    v_parent_id := (to_jsonb(new) ->> e.parent_column)::uuid;

    -- TRASH: stamp every live part with the parent's EXACT deleted_at. The
    -- shared timestamp is what makes the restore below exact — it is the same
    -- trick platform._gc_entity_associations plays with deleted_via_id, without
    -- needing two new columns on every child table.
    if old.deleted_at is null and new.deleted_at is not null then
      execute format(
        'update %I.%I set deleted_at = $1 where %I = $2 and deleted_at is null',
        e.child_schema, e.child_table, e.child_column
      ) using new.deleted_at, v_parent_id;
      get diagnostics v_rows = row_count;

    -- RESTORE: bring back exactly what THIS removal took, and nothing else. A
    -- part someone had already removed by hand keeps its own timestamp and
    -- stays removed.
    elsif old.deleted_at is not null and new.deleted_at is null then
      execute format(
        'update %I.%I set deleted_at = null where %I = $1 and deleted_at = $2',
        e.child_schema, e.child_table, e.child_column
      ) using v_parent_id, old.deleted_at;
      get diagnostics v_rows = row_count;
    end if;
    if v_rows > 0 then
      -- Nothing fails silently, and nothing succeeds silently either: a removal
      -- that reached other rows says so where the DB log can be read.
      raise notice '[soft-delete-cascade] %.% -> %.%.% : % row(s) followed %.% %',
        tg_table_schema, tg_table_name, e.child_schema, e.child_table,
        e.child_column, v_rows, tg_table_schema, tg_table_name, v_parent_id;
    end if;
  end loop;

  return null;
end;
$fn$;

comment on function platform._cascade_soft_delete() is
  'AFTER UPDATE OF deleted_at on a parent table: soft-deletes (and on restore, '
  'restores) every child declared cascade in platform.soft_delete_edge. Attach with '
  'platform.attach_soft_delete_cascade.';

-- -----------------------------------------------------------------------------
-- 3. THE GUARD — one generic trigger, on the child.
-- -----------------------------------------------------------------------------
-- The census that found this defect turned up two live rows created two days
-- AFTER their job was removed. Cascading only on the way down would leave that
-- door open: "removed" has to keep meaning removed, so a part cannot be
-- attached to — or revived under — a job that is gone.
create or replace function platform._guard_soft_delete_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  e record;
  v_child_ref uuid;
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
       and action = 'cascade'
  loop
    v_child_ref := nullif(to_jsonb(new) ->> e.child_column, '')::uuid;
    continue when v_child_ref is null;

    execute format(
      'select deleted_at from %I.%I where %I = $1',
      e.parent_schema, e.parent_table, e.parent_column
    ) into v_parent_gone using v_child_ref;

    if v_parent_gone is not null then
      raise exception using
        errcode = '23514',
        message = format(
          'That %s has been removed, so nothing more can be added to it.',
          e.parent_noun
        ),
        detail  = format(
          'This row points at %I.%I %s, which was removed on %s. Leaving it live here '
          'would put working parts under something no screen shows any more.',
          e.parent_schema, e.parent_table, v_child_ref,
          to_char(v_parent_gone, 'YYYY-MM-DD HH24:MI')
        ),
        hint    = 'Restore it first if you still need it, or point this at one that is still there.';
    end if;
  end loop;

  return new;
end;
$fn$;

comment on function platform._guard_soft_delete_parent() is
  'BEFORE INSERT OR UPDATE on a child table: refuses a LIVE child row whose cascade '
  'parent (per platform.soft_delete_edge) is soft-deleted. Attach with '
  'platform.attach_soft_delete_child_guard.';

-- -----------------------------------------------------------------------------
-- 4. ATTACHING — idempotent, so re-running this file changes nothing.
-- -----------------------------------------------------------------------------
create or replace function platform.attach_soft_delete_cascade(
  p_schema text, p_table text
) returns void
language plpgsql
as $fn$
begin
  execute format('drop trigger if exists _cascade_softdelete on %I.%I', p_schema, p_table);
  execute format(
    'create trigger _cascade_softdelete after update of deleted_at on %I.%I '
    'for each row execute function platform._cascade_soft_delete()',
    p_schema, p_table
  );
end;
$fn$;

create or replace function platform.attach_soft_delete_child_guard(
  p_schema text, p_table text
) returns void
language plpgsql
as $fn$
begin
  execute format('drop trigger if exists _guard_soft_delete_parent on %I.%I', p_schema, p_table);
  execute format(
    'create trigger _guard_soft_delete_parent before insert or update on %I.%I '
    'for each row execute function platform._guard_soft_delete_parent()',
    p_schema, p_table
  );
end;
$fn$;

-- An earlier shape of this helper took no parent_noun. Replace, never overload:
-- two functions with the same name is exactly how a call site silently keeps the
-- old meaning.
drop function if exists platform.declare_soft_delete_edge(text,text,text,text,text,text,text,text,text);

-- Declaring an edge and wiring it are one act, so a registry row can never be a
-- decision nobody enforced.
create or replace function platform.declare_soft_delete_edge(
  p_parent_schema text,
  p_parent_table  text,
  p_child_schema  text,
  p_child_table   text,
  p_child_column  text,
  p_action        text,
  p_reason        text,
  p_declared_by   text,
  p_parent_noun   text default 'item',
  p_parent_column text default 'id'
) returns void
language plpgsql
as $fn$
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

  if p_action = 'cascade' then
    perform platform.attach_soft_delete_cascade(p_parent_schema, p_parent_table);
    perform platform.attach_soft_delete_child_guard(p_child_schema, p_child_table);
  end if;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 5. THE SCOREBOARD — every edge of this shape nobody has ruled on.
-- -----------------------------------------------------------------------------
create or replace view platform.v_soft_delete_edge_unclassified as
with fk as (
  select cl.relnamespace::regnamespace::text as child_schema,
         cl.relname                          as child_table,
         pl.relnamespace::regnamespace::text as parent_schema,
         pl.relname                          as parent_table,
         (select attname from pg_attribute
           where attrelid = cl.oid and attnum = con.conkey[1])   as child_column,
         (select attname from pg_attribute
           where attrelid = pl.oid and attnum = con.confkey[1])  as parent_column
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_class pl on pl.oid = con.confrelid
   where con.contype = 'f' and array_length(con.conkey, 1) = 1
)
select fk.*
  from fk
 where exists (select 1 from information_schema.columns c
                where c.table_schema = fk.child_schema and c.table_name = fk.child_table
                  and c.column_name = 'deleted_at')
   and exists (select 1 from information_schema.columns c
                where c.table_schema = fk.parent_schema and c.table_name = fk.parent_table
                  and c.column_name = 'deleted_at')
   and not exists (select 1 from platform.soft_delete_edge e
                    where e.child_schema  = fk.child_schema
                      and e.child_table   = fk.child_table
                      and e.child_column  = fk.child_column
                      and e.parent_schema = fk.parent_schema
                      and e.parent_table  = fk.parent_table);

comment on view platform.v_soft_delete_edge_unclassified is
  'Foreign keys where a soft-deletable child points at a soft-deletable parent and '
  'nobody has declared what removal means. 2,050 edges on 2026-09-08; the mandate ones '
  'are declared below. Not a defect list — a decision list.';

-- The live harm, for the edges that HAVE been ruled on. Cheap: it only walks the
-- registry, never the whole schema.
create or replace function platform.soft_delete_orphan_census()
returns table (edge text, action text, live_rows_under_removed_parent bigint)
language plpgsql
stable
as $fn$
declare e record; v_n bigint;
begin
  for e in select * from platform.soft_delete_edge order by parent_schema, parent_table, child_schema, child_table loop
    execute format(
      'select count(*) from %I.%I ch join %I.%I pa on pa.%I = ch.%I '
      'where ch.deleted_at is null and pa.deleted_at is not null',
      e.child_schema, e.child_table, e.parent_schema, e.parent_table,
      e.parent_column, e.child_column
    ) into v_n;
    edge := format('%s.%s.%s -> %s.%s',
                   e.child_schema, e.child_table, e.child_column,
                   e.parent_schema, e.parent_table);
    action := e.action;
    live_rows_under_removed_parent := v_n;
    return next;
  end loop;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 6. THE MANDATE EDGES — every inbound foreign key, ruled on, none skipped.
-- -----------------------------------------------------------------------------
do $seed$
begin
  -- PARTS OF THE JOB. Removing the job removes these; restoring it brings them back.
  perform platform.declare_soft_delete_edge(
    'mandate','definition','mandate','binding','mandate_id','cascade',
    'A binding is which agent does THIS job for a given person, organization, or everyone. '
    'It has no meaning without the job and no screen of its own.',
    'one-resolution campaign FIX-R15', 'job');

  perform platform.declare_soft_delete_edge(
    'mandate','definition','mandate','treatment','mandate_id','cascade',
    'A treatment is how THIS job renders its answer. It is a facet of the job, not a thing beside it.',
    'one-resolution campaign FIX-R15', 'job');

  perform platform.declare_soft_delete_edge(
    'mandate','definition','agent','exemplar','mandate_id','cascade',
    'An exemplar is a worked example held up as the standard for THIS job. The admin UI already '
    'treats it as owned by the job (deleteMandateExemplar); the database now agrees.',
    'one-resolution campaign FIX-R15', 'job');

  perform platform.declare_soft_delete_edge(
    'mandate','definition','agent','mandate_note','mandate_id','cascade',
    'A note written ON a job. It is commentary about that job and nothing else.',
    'one-resolution campaign FIX-R15', 'job');

  -- THINGS THAT MERELY POINT AT THE JOB. These outlive it on purpose.
  perform platform.declare_soft_delete_edge(
    'mandate','definition','app','definition','mandate_id','keep',
    'An app is a product someone built; it USES a job. Removing the job must never quietly '
    'remove the app — the app becomes a broken reference a person can see and repair, which is '
    'the honest outcome. If that reference should refuse or warn, that is app work, not a cascade.',
    'one-resolution campaign FIX-R15', 'job');

  perform platform.declare_soft_delete_edge(
    'mandate','definition','mandate','definition','source_mandate_id','keep',
    'A job copied FROM another job. The copy is its own job with its own owner; deleting the '
    'original must not delete everything ever duplicated from it. Cascading here would also '
    'recurse through the copy chain.',
    'one-resolution campaign FIX-R15', 'job');
end;
$seed$;

-- -----------------------------------------------------------------------------
-- 7. THE LIVENESS ASSERTION — a guard's source on disk proves nothing.
-- -----------------------------------------------------------------------------
-- Read by `pnpm check:soft-delete-cascade`. Everything here is answered from the
-- CATALOG and from live rows, never from this file, so a trigger someone drops,
-- disables, or re-creates as AFTER/STATEMENT shows up red.
create or replace function public.__soft_delete_cascade_conformance()
returns table (check_key text, ok boolean, severity text, detail jsonb)
language plpgsql
security definer
stable
set search_path = ''
as $fn$
declare
  v_missing_cascade jsonb;
  v_missing_guard   jsonb;
  v_bad_shape       jsonb;
  v_orphans         jsonb;
  v_mandate_edges   jsonb;
begin
  -- 1. Every cascade edge in the registry has its parent trigger bound, ENABLED,
  --    AFTER, and FOR EACH ROW. An AFTER-STATEMENT twin still shows in pg_trigger
  --    while cascading nothing.
  select coalesce(jsonb_agg(distinct e.parent_schema||'.'||e.parent_table), '[]'::jsonb)
    into v_missing_cascade
    from platform.soft_delete_edge e
   where e.action = 'cascade'
     and not exists (
       select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = e.parent_schema and c.relname = e.parent_table
         and t.tgname = '_cascade_softdelete'
         and not t.tgisinternal
         and t.tgenabled <> 'D'
         and (t.tgtype & 1) = 1   -- FOR EACH ROW
         and (t.tgtype & 2) = 0   -- AFTER
         and (t.tgtype & 16) = 16 -- UPDATE
     );

  -- 2. Every cascade edge has its child guard bound, ENABLED, BEFORE, FOR EACH ROW.
  select coalesce(jsonb_agg(distinct e.child_schema||'.'||e.child_table), '[]'::jsonb)
    into v_missing_guard
    from platform.soft_delete_edge e
   where e.action = 'cascade'
     and not exists (
       select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = e.child_schema and c.relname = e.child_table
         and t.tgname = '_guard_soft_delete_parent'
         and not t.tgisinternal
         and t.tgenabled <> 'D'
         and (t.tgtype & 1) = 1  -- FOR EACH ROW
         and (t.tgtype & 2) = 2  -- BEFORE
     );

  -- 3. The two functions are still SECURITY DEFINER. Flipped to INVOKER, the
  --    cascade silently stops reaching RLS-protected children for real users
  --    while every privileged test stays green.
  select coalesce(jsonb_agg(n.nspname||'.'||p.proname), '[]'::jsonb)
    into v_bad_shape
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform'
     and p.proname in ('_cascade_soft_delete', '_guard_soft_delete_parent')
     and p.prosecdef is not true;

  -- 4. Zero live rows under a removed parent, on every declared cascade edge.
  select coalesce(jsonb_agg(jsonb_build_object('edge', c.edge, 'live_rows', c.live_rows_under_removed_parent)), '[]'::jsonb)
    into v_orphans
    from platform.soft_delete_orphan_census() c
   where c.action = 'cascade' and c.live_rows_under_removed_parent > 0;

  -- 5. The mandate edges specifically — the defect this was built for. A row
  --    quietly flipped to 'keep' would pass every generic check above.
  select coalesce(jsonb_object_agg(e.child_schema||'.'||e.child_table||'.'||e.child_column, e.action), '{}'::jsonb)
    into v_mandate_edges
    from platform.soft_delete_edge e
   where e.parent_schema = 'mandate' and e.parent_table = 'definition';

  return query
  select 'cascade_trigger_installed',
         v_missing_cascade = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'Parents with a cascade edge but no live AFTER-UPDATE-ROW _cascade_softdelete trigger.',
                            'parents_missing_trigger', v_missing_cascade)
  union all
  select 'child_guard_installed',
         v_missing_guard = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'Cascade children with no live BEFORE-ROW _guard_soft_delete_parent trigger — a part could be attached to a removed parent again.',
                            'children_missing_guard', v_missing_guard)
  union all
  select 'functions_security_definer',
         v_bad_shape = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'Both trigger functions must stay SECURITY DEFINER; as INVOKER the cascade stops reaching RLS-protected children for real users.',
                            'not_definer', v_bad_shape)
  union all
  select 'no_live_orphans',
         v_orphans = '[]'::jsonb, 'error',
         jsonb_build_object('why', 'Live rows sitting under a soft-deleted parent on a declared cascade edge — the original defect, back.',
                            'edges', v_orphans)
  union all
  select 'mandate_edges_declared',
         v_mandate_edges = jsonb_build_object(
           'mandate.binding.mandate_id', 'cascade',
           'mandate.treatment.mandate_id', 'cascade',
           'agent.exemplar.mandate_id', 'cascade',
           'agent.mandate_note.mandate_id', 'cascade',
           'app.definition.mandate_id', 'keep',
           'mandate.definition.source_mandate_id', 'keep'), 'error',
         jsonb_build_object('why', 'The six inbound edges of mandate.definition and what each was ruled to mean. A new FK into mandate.definition lands here as a mismatch rather than as silence.',
                            'declared', v_mandate_edges);
end;
$fn$;

revoke all on function public.__soft_delete_cascade_conformance() from public;
grant execute on function public.__soft_delete_cascade_conformance() to service_role;

comment on function public.__soft_delete_cascade_conformance() is
  'Liveness assertion for the soft-delete cascade primitive. Read by '
  'pnpm check:soft-delete-cascade. service_role only — it reports on the whole '
  'database, so it is never a client door.';
