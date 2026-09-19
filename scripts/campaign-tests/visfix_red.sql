-- VIS-FIX — THE RED TWIN of `visfix_green.sql`.
--
-- It puts the two defects BACK inside one rolled-back transaction and proves that every clause the
-- green suite asserts then gives the WRONG answer. A guard you cannot show failing is not a guard.
--
-- RUN IT (against the MAIN database, same connection as the green suite):
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/visfix_red.sql
--
-- It ends in ROLLBACK, so the restored-broken bodies and the disabled trigger never outlive it.
-- It takes about a minute, because two of its clauses are the 30-second cancellations themselves.
--
-- 🚨 READ THE ORDER. The two SLOW clauses run FIRST, while nothing is locked. The trigger is only
-- disabled afterwards, for the few milliseconds the visibility clauses need — `ALTER TABLE …
-- DISABLE TRIGGER` takes an ACCESS EXCLUSIVE lock on `custom.record` and its sixteen partitions,
-- and holding that for a minute would block every other session writing the store.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '300s';
select set_config('app.actor_system', 'visfix_red_twin', true);

-- ── DEFECT 2 PUT BACK: the per-container bodies T1 could never finish ──────────────────────
create or replace function custom.visibility_parity()
 returns table(side text, container_type text, container_id uuid, item_type text, item_id uuid,
               stored_level permission_level, derived_level permission_level, reason text)
 language sql stable security definer set search_path to ''
as $$
  with containers as (
    select distinct r.container_type as ct, r.container_id as ci from platform.reachability r
  ), derived as (
    select c.ct as container_type, c.ci as container_id, d.item_type, d.item_id, d.depth, d.max_level
    from containers c
    cross join lateral custom.derive_visibility(c.ct, c.ci) d
  )
  select 'cache_only', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, null::public.permission_level, 'stored row the associations do not produce'
  from platform.reachability r
  left join derived d
    on  d.container_type = r.container_type and d.container_id = r.container_id
    and d.item_type = r.item_type and d.item_id = r.item_id
  where d.item_id is null;
$$;

create or replace function custom.visibility_cache_rebuild()
 returns integer language plpgsql security definer set search_path to ''
as $$
declare rec record; v_n integer := 0;
begin
  truncate custom.visibility_cache;
  for rec in select distinct e.container_type as ct, e.container_id as ci from custom.carrying_edges e
  loop
    v_n := v_n + custom.visibility_warm(rec.ct, rec.ci);
  end loop;
  return v_n;
end;
$$;

-- 🚨 THE 30 s LIMIT IS SET AT THE TOP LEVEL, not inside the block. `statement_timeout` is armed
-- when a top-level statement STARTS, so a `set_config('statement_timeout', …, true)` written inside
-- the DO block arrives too late to bind the block that is already running — measured here: the
-- per-container diff ran to completion in 76,743 ms with the timeout set from inside. Set from out
-- here, the DO block IS the statement the limit binds, the inner SELECT is cancelled, and the
-- handler below catches the cancellation.
set local statement_timeout = '30s';

do $slow1$
declare v_t0 timestamptz; v_n integer;
begin
  begin
    v_t0 := clock_timestamp();
    select count(*) into v_n from custom.visibility_parity();
    raise exception '[RED FAILED] the per-container diff finished in % ms and returned % row(s) - '
                    'the defect this twin exists to show is not there',
      round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1), v_n;
  exception
    when sqlstate '57014' then
      raise notice '[RED] custom.visibility_parity() was CANCELLED by the 30 s limit - T1''s diff cannot be run.';
  end;
end;
$slow1$;

set local statement_timeout = '30s';

do $slow2$
declare v_t0 timestamptz; v_n integer;
begin
  begin
    v_t0 := clock_timestamp();
    select custom.visibility_cache_rebuild() into v_n;
    raise exception '[RED FAILED] the per-container rebuild finished in % ms (% rows)',
      round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1), v_n;
  exception
    when sqlstate '57014' then
      raise notice '[RED] custom.visibility_cache_rebuild() was CANCELLED by the 30 s limit - T1''s other half cannot be run.';
  end;
end;
$slow2$;

set local statement_timeout = '300s';

-- ── DEFECT 1 PUT BACK: the containment that never reaches the ladder ───────────────────────
-- From here the lock is held, so everything below is milliseconds.
alter table custom.record disable trigger zz_w2_containment_association;

create or replace function custom.containment_edges(p_organization_id uuid)
 returns table(parent_id uuid, child_id uuid, via text)
 language sql stable set search_path to 'pg_catalog'
as $$
  select custom.containment_parent(r.data), r.id, 'contained'::text
    from custom.record r
   where r.organization_id = p_organization_id and r.deleted_at is null
     and custom.containment_parent(r.data) is not null
  union all
  select (r.data ->> 'from')::uuid, (r.data ->> 'to')::uuid, 'carrying'::text
    from custom.record r
   where r.organization_id = p_organization_id and r.deleted_at is null
     and r.data_class = 'relation'
     and coalesce((r.data ->> 'carrying')::boolean, false)
     and r.data ->> 'from' is not null and r.data ->> 'to' is not null;
$$;

do $t$
declare
  v_org    constant uuid := '344cfaa8-2b0c-4971-854a-9694614816f2';  -- V78 Blank Org
  v_korg   constant uuid := '11111111-0000-4000-8000-000000000004';
  v_dana   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, not a member
  v_hq uuid; v_proj uuid; v_x uuid; v_y uuid; v_risk uuid; v_r1 uuid;
  v_note_tbl uuid; v_note uuid; v_n integer;
begin
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_korg, 'record', jsonb_build_object('name', 'VIS-FIX RED HQ')) returning id into v_hq;

  v_proj := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Project', 'slug', 'visfix_red_project', 'label_singular', 'Project', 'label_plural', 'Projects',
    'type', 'entity', 'display', 'page', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name', 'kind', 'text')),
    'title_field', 'name', 'parent_id', v_hq::text));
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_proj, 'record', jsonb_build_object('name', 'Project X', 'parent_id', v_hq::text))
  returning id into v_x;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_proj, 'record', jsonb_build_object('name', 'Project Y', 'parent_id', v_hq::text))
  returning id into v_y;

  v_risk := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Risk', 'slug', 'visfix_red_risk', 'label_singular', 'Risk', 'label_plural', 'Risks',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));
  perform custom.home_add(v_org, v_risk, v_x);

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_risk, 'record', jsonb_build_object('title', 'X risk', 'parent_id', v_x::text))
  returning id into v_r1;

  v_note_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Note', 'slug', 'visfix_red_note', 'label_singular', 'Note', 'label_plural', 'Notes',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'body', 'kind', 'text')),
    'title_field', 'body', 'parent_id', v_hq::text));
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_note_tbl, 'record', jsonb_build_object('body', 'the note', 'parent_id', v_hq::text))
  returning id into v_note;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, null, 'relation',
          jsonb_build_object('kind', 'referenced', 'carrying', true, 'from', v_x, 'to', v_note));

  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  values ('record', v_x, v_dana, 'viewer', 'active');

  -- clause 1's RED: the store HAS the edge and the ladder does not.
  select count(*) into v_n from custom.containment_edges(v_org) e
   where e.parent_id = v_x and e.child_id = v_r1;
  if v_n <> 1 then
    raise exception '[RED FAILED] the store itself does not hold the containment (% rows)', v_n;
  end if;
  select count(*) into v_n from custom.carrying_edges e
   where e.container_id = v_x and e.item_id = v_r1;
  if v_n <> 0 then
    raise exception '[RED FAILED] the ladder already holds the edge (% rows) — the trigger is still on', v_n;
  end if;
  if custom.has_visibility(v_dana, 'record', v_r1, 'viewer') then
    raise exception '[RED FAILED] Dana already sees the contained record';
  end if;
  raise notice '[RED] clause 1 — 1 store edge, 0 ladder edges, has_visibility(contained record) = false.';

  -- clause 2's RED (T10): the Table homed in X is invisible to the person shared on X.
  if custom.has_visibility(v_dana, 'record', v_risk, 'viewer') then
    raise exception '[RED FAILED] Dana already sees the Risk Table';
  end if;
  raise notice '[RED] clause 2 (T10) — shared on X, Dana cannot see the Risk Table homed in X.';

  -- clause 3's RED (T2): the note carried by A is invisible to a viewer on A.
  if custom.has_visibility(v_dana, 'record', v_note, 'viewer') then
    raise exception '[RED FAILED] Dana already sees the note';
  end if;
  raise notice '[RED] clause 3 (T2) — a viewer on A does not see the note A carries.';

  raise notice '[RED] VIS-FIX: every clause the green suite asserts gives the wrong answer with the fix removed.';
end;
$t$;

rollback;
