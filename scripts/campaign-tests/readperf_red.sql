-- READ-PERF — THE RED TWIN of `readperf_green.sql`.
--
-- Five blocks, each inside ONE transaction that ROLLS BACK. Each one breaks exactly one thing
-- the green suite asserts, and the block is RED only if the green assertion FAILS while it is
-- broken. A guard nobody has seen fail is not a guard.
--
--   1  the class argument: forget that a grant withdraws what membership confers (VIS-19), and
--      the set shows a record the one ladder refuses.
--   2  containment: forget the downward walk, and the set hides a record the one ladder admits.
--   3  the mirror: drop one arm of custom.carrying_edges_in, and PART 1's comparison sees it.
--   4  the ceiling: set it to zero, and the door must SAY it is walking instead, with a remedy.
--   5  the old body: put the per-row ladder back, and the read door is O(rows scanned) again.
--
-- RUN IT (against the MAIN database):
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/readperf_red.sql

\set ON_ERROR_STOP on
\timing off

-- ══════════════════════════════════════ BLOCK 1 — a grant withdraws, and the class must not speak
begin;
set local statement_timeout = '600s';
select set_config('app.actor_system', 'readperf_red_suite', true);
do $t$
declare
  v_org  constant uuid := 'dce7130b-a922-4f22-aaf5-564bd86b0ba7';  -- admin owner, test member
  v_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_tbl  uuid; v_rec uuid; v_diff int; v_row record;
begin
  -- THE STORE SWITCH, set by this suite rather than assumed. Another lane may have this
  -- organization's `custom/system_enabled` off, and with the store off the access kernel falls
  -- back to the 2026-08-12 editor cap, every member answers `editor` on everything, and nothing
  -- below can diverge at all. The transaction rolls back, so the organization keeps its own word.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'readperf red')
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = excluded.value;

  -- THREE PLAIN ROWS: made by the admin, under no container, spoken about by nothing. They are
  -- exactly the rows a visibility CLASS is supposed to answer for, which is what makes the next
  -- step a real test rather than a coincidence.
  v_tbl := '11111111-0000-4000-8000-000000000004';   -- the kernel Table `Organization`
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  select v_org, v_tbl, 'record',
         jsonb_build_object('name', 'READ-PERF red ' || g),
         '87a6e699-3622-4869-8843-d0867456c0dd'::uuid
    from generate_series(1, 3) g;
  select rec.id into v_rec from custom.record rec
   where rec.organization_id = v_org and rec.table_id = v_tbl and rec.deleted_at is null
     and rec.data ->> 'name' like 'READ-PERF red %'
   order by rec.data ->> 'name' limit 1;

  -- THE ORGANIZATION SAYS MEMBERSHIP CONFERS `editor` (LEVEL-FIX's knob, at the organization
  -- rung). Now a grant addressed to Dana at `viewer` on ONE record WITHDRAWS that (VIS-19), and
  -- the one ladder refuses her `editor` on it while saying yes to every other row of the Table.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'readperf red block 1')
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = excluded.value;
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               created_by, status)
  values ('record', v_rec, v_dana, 'viewer', '87a6e699-3622-4869-8843-d0867456c0dd', 'active');

  -- GREEN passes here. Now break the one thing that makes it pass: the granted ids.
  create or replace function custom.read_door_granted_ids(p_organization_id uuid, p_table_id uuid)
  returns uuid[] language sql stable security definer set search_path to ''
  as $f$ select '{}'::uuid[]; $f$;

  select count(*) into v_diff
    from custom.read_door_parity(v_org, v_tbl, v_dana, 'editor', 0) p
   where p.verdict <> 'same';
  if v_diff = 0 then
    raise exception 'BLOCK 1 IS NOT RED: custom.read_door_granted_ids was emptied, a grant at `viewer` was left standing against an organization default of `editor`, and PART 2''s parity still saw nothing. The assertion cannot fail, so it proves nothing.';
  end if;
  select * into v_row from custom.read_door_parity(v_org, v_tbl, v_dana, 'editor', 0) p
   where p.verdict <> 'same' limit 1;
  raise notice 'BLOCK 1 RED — % disagreeing row(s). First: % — %', v_diff, v_row.record_id, left(v_row.verdict, 90);
end $t$;
rollback;

-- ══════════════════════════════════════ BLOCK 2 — containment, forgotten
begin;
set local statement_timeout = '600s';
select set_config('app.actor_system', 'readperf_red_suite', true);
do $t$
declare
  v_org  constant uuid := 'dce7130b-a922-4f22-aaf5-564bd86b0ba7';
  v_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_tbl  constant uuid := '11111111-0000-4000-8000-000000000004';   -- kernel Table `Organization`
  v_parent uuid; v_diff int; v_row record; v_before int;
begin
  -- THE STORE SWITCH, set by this suite rather than assumed. Another lane may have this
  -- organization's `custom/system_enabled` off, and with the store off the access kernel falls
  -- back to the 2026-08-12 editor cap, every member answers `editor` on everything, and nothing
  -- below can diverge at all. The transaction rolls back, so the organization keeps its own word.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'readperf red')
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = excluded.value;

  -- The organization says membership alone shows nothing (VIS-33), so containment is the ONLY
  -- arm that can admit Dana to these rows — which is what makes emptying it visible.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb, 'readperf red block 2')
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = excluded.value;

  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, v_tbl, 'record', jsonb_build_object('name', 'READ-PERF red parent'),
          '87a6e699-3622-4869-8843-d0867456c0dd'::uuid)
  returning id into v_parent;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  select v_org, v_tbl, 'record',
         jsonb_build_object('name', 'READ-PERF red child ' || g, 'parent_id', v_parent::text),
         '87a6e699-3622-4869-8843-d0867456c0dd'::uuid
    from generate_series(1, 3) g;

  -- THREE DECOYS: same Table, same admin, no container, no grant. Under `shared_only` Dana must
  -- not see them, so a class that answers `true` for the carried children answers wrongly for
  -- these — which is what makes the break visible whichever row the class lands on.
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  select v_org, v_tbl, 'record',
         jsonb_build_object('name', 'READ-PERF red decoy ' || g),
         '87a6e699-3622-4869-8843-d0867456c0dd'::uuid
    from generate_series(1, 3) g;

  -- Dana is given the PARENT. Containment is what carries the three children to her.
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               created_by, status)
  values ('record', v_parent, v_dana, 'viewer', '87a6e699-3622-4869-8843-d0867456c0dd', 'active');

  select count(*) into v_before
    from custom.read_door_parity(v_org, v_tbl, v_dana, 'viewer', 0) p
   where p.verdict <> 'same';
  if v_before <> 0 then
    raise exception 'BLOCK 2 CANNOT RUN: the fixture itself is already in disagreement (% row(s)) before anything was broken.', v_before;
  end if;

  -- Now forget the downward walk.
  create or replace function custom.read_door_carried_ids(
    p_user uuid, p_organization_id uuid, p_table_id uuid, p_required public.permission_level,
    out o_ids uuid[], out o_containers integer)
  returns record language plpgsql stable security definer set search_path to ''
  as $f$ begin o_ids := '{}'::uuid[]; o_containers := 0; return; end; $f$;

  select count(*) into v_diff
    from custom.read_door_parity(v_org, v_tbl, v_dana, 'viewer', 0) p
   where p.verdict <> 'same';
  if v_diff = 0 then
    raise exception 'BLOCK 2 IS NOT RED: three records sat under a container Dana holds, containment was emptied, and parity still saw nothing.';
  end if;
  select * into v_row from custom.read_door_parity(v_org, v_tbl, v_dana, 'viewer', 0) p
   where p.verdict <> 'same' limit 1;
  raise notice 'BLOCK 2 RED — % disagreeing row(s). First: % — %', v_diff, v_row.record_id, left(v_row.verdict, 90);
end $t$;
rollback;

-- ══════════════════════════════════════ BLOCK 3 — the mirror loses an arm
begin;
set local statement_timeout = '600s';
do $t$
declare v_org uuid; v_missing int;
begin
  select distinct rec.organization_id into v_org from custom.record rec limit 1;
  create or replace function custom.carrying_edges_in(p_organization_id uuid)
  returns table(container_type text, container_id uuid, item_type text, item_id uuid,
                conveys_max public.permission_level)
  language sql stable security definer set search_path to ''
  as $f$
    -- arm 1 only: the platform.containment_edges half, with the carrying-rule half dropped.
    select case when r.container_side = 'source' then a.source_type else a.target_type end,
           case when r.container_side = 'source' then a.source_id   else a.target_id   end,
           case when r.container_side = 'source' then a.target_type else a.source_type end,
           case when r.container_side = 'source' then a.target_id   else a.source_id   end,
           r.conveys_max
      from platform.associations a
      join platform.association_types r
        on r.source_type = a.source_type and r.target_type = a.target_type
       and (r.label is null or r.label = a.label)
     where a.deleted_at is null and r.is_active
       and r.container_side = any (array['source','target'])
       and (a.organization_id = p_organization_id or a.organization_id is null);
  $f$;

  select count(*) into v_missing
    from (select ce.container_type, ce.container_id, ce.item_type, ce.item_id, ce.conveys_max
            from custom.carrying_edges ce
            join platform.associations a
              on a.deleted_at is null
             and (a.organization_id = v_org or a.organization_id is null)
             and ((a.source_id = ce.container_id and a.target_id = ce.item_id)
               or (a.target_id = ce.container_id and a.source_id = ce.item_id))
          except
          select * from custom.carrying_edges_in(v_org)) x;
  if v_missing = 0 then
    raise exception 'BLOCK 3 IS NOT RED: an arm of the mirror was removed and PART 1''s comparison still found nothing missing.';
  end if;
  raise notice 'BLOCK 3 RED — PART 1 sees % edge(s) the crippled mirror no longer returns.', v_missing;
end $t$;
rollback;

-- ══════════════════════════════════════ BLOCK 4 — the ceiling, and the sentence under it
begin;
set local statement_timeout = '600s';
do $t$
declare v_set record;
begin
  create or replace function custom.read_door_ladder_ceiling() returns integer
    language sql immutable set search_path to '' as $f$ select 0; $f$;
  v_set := custom.visible_set('87a6e699-3622-4869-8843-d0867456c0dd'::uuid,
                              'dce7130b-a922-4f22-aaf5-564bd86b0ba7'::uuid,
                              '11111111-0000-4000-8000-000000000001'::uuid, 'viewer');
  if not v_set.o_fallback then
    raise exception 'BLOCK 4 IS NOT RED: the ceiling was zero and custom.visible_set answered set-based anyway.';
  end if;
  raise notice 'BLOCK 4 RED — the door refused the set-based shape and said so: %', left(v_set.o_note, 160);
end $t$;
rollback;

-- ══════════════════════════════════════ BLOCK 5 — the old body, and what it costs
begin;
set local statement_timeout = '600s';
do $t$
declare
  v_org constant uuid := 'dce7130b-a922-4f22-aaf5-564bd86b0ba7';
  v_tbl uuid; v_t0 timestamptz; v_new numeric; v_old numeric; v_n int;
begin
  select rec.table_id into v_tbl from custom.record rec
   where rec.organization_id = v_org and rec.deleted_at is null and rec.table_id is not null
   group by rec.table_id order by count(*) desc limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text, true);

  v_t0 := clock_timestamp();
  select count(*) into v_n from custom.query_visible_ids(v_org, v_tbl, 'viewer');
  v_new := extract(epoch from clock_timestamp() - v_t0) * 1000;

  -- THE BODY THIS LANE REPLACED, put back inside the rolled-back transaction.
  create or replace function custom.query_visible_ids(p_organization_id uuid, p_table_id uuid default null::uuid, p_required text default 'viewer'::text)
  returns setof uuid language plpgsql stable security definer set search_path to 'pg_catalog'
  as $f$
  declare v_user uuid := custom.query_principal();
  begin
    perform custom.assert_client_may_reach(p_organization_id, 'custom.query_visible_ids');
    return query
      select r.id from custom.record r
       where r.organization_id = p_organization_id
         and (p_table_id is null or r.table_id = p_table_id)
         and r.deleted_at is null
         and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
         and ((v_user is null and custom.query_is_store_owner())
              or custom.has_visibility(v_user, 'record', r.id, p_required::public.permission_level));
  end; $f$;

  v_t0 := clock_timestamp();
  perform count(*) from custom.query_visible_ids(v_org, v_tbl, 'viewer');
  v_old := extract(epoch from clock_timestamp() - v_t0) * 1000;

  if v_old <= v_new then
    raise exception 'BLOCK 5 IS NOT RED: the per-row body answered in % ms against the set-based % ms, so this database is too small to show the difference. Run it against a Table with more rows.', round(v_old,1), round(v_new,1);
  end if;
  raise notice 'BLOCK 5 RED — % rows: the per-row body takes % ms where the set-based one takes % ms (%x).',
    v_n, round(v_old,1), round(v_new,1), round(v_old / greatest(v_new, 0.001), 1);
end $t$;
rollback;

select '5 of 5 blocks are RED' as readperf_red;
-- Nothing this suite wrote survives it, and nothing it replaced is still replaced. It asks
-- about ITS OWN rows by name rather than about the table as a whole: other lanes share this
-- database and their grants are not this suite's business.
select 'ROLLBACK VERIFIED' as leftovers
 where not exists (select 1 from custom.record where data ->> 'name' like 'READ-PERF red %')
   and not exists (select 1 from platform.knob_override
                    where organization_id = 'dce7130b-a922-4f22-aaf5-564bd86b0ba7'
                      and set_note like 'readperf red%')
   and (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'custom' and p.proname = 'read_door_ladder_ceiling') like '%5000%'
   and (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'custom' and p.proname = 'read_door_carried_ids') like '%recursive%';
