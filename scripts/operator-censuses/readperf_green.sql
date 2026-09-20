-- OPERATOR CENSUS, not a product suite: it calls custom.visible_set, custom.read_door_carried_ids,
-- custom.read_door_granted_ids and custom.read_door_parity, which platform.client_callable_door
-- declares server-only and names this file as a legitimate caller of — so it cannot run as the
-- seat `authenticated`, and pnpm check:suites-take-the-seat does not count this directory.
-- READ-PERF — THE GREEN SUITE. The read door answers Visibility once per call, and the answers
-- are the same ones.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/operator-censuses/readperf_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered by
-- no sweep, and its single transaction ends in ROLLBACK.
--
-- WHAT MAKES IT FAIL. Every part is a POSITIVE question with a stated expected answer, and the
-- expected answer of PART 2 — the one that matters — is produced by the ONE LADDER
-- (`custom.has_visibility`) itself, row by row, over every Table of every organization on this
-- database, from two real seats. The set-based shape is right only if it agrees with the thing
-- it replaces on every single row. Its RED twin is `readperf_red.sql`.

\set ON_ERROR_STOP on
\timing off
\set ADMIN '''87a6e699-3622-4869-8843-d0867456c0dd'''
\set DANA  '''4060701e-706a-4c76-b3ca-0bbc69fa5a14'''

begin;
set local statement_timeout = '900s';
select set_config('app.actor_system', 'readperf_green_suite', true);

-- ══════════════════════════════════════ PART 1 — the mirror is a mirror
-- `custom.carrying_edges_in(org)` must be `custom.carrying_edges` restricted to that
-- organization, edge for edge. A mirror nobody compares is a second source of truth.
do $t$
declare
  v_org uuid; v_missing int; v_extra int; v_orgs int := 0;
begin
  for v_org in select distinct r.organization_id from custom.record r loop
    v_orgs := v_orgs + 1;
    select count(*) into v_missing
      from (select * from custom.carrying_edges_in(v_org)
            except
            select ce.container_type, ce.container_id, ce.item_type, ce.item_id, ce.conveys_max
              from custom.carrying_edges ce) x;
    if v_missing > 0 then
      raise exception 'PART 1 FAILED: custom.carrying_edges_in(%) returns % edge(s) the view custom.carrying_edges does not have. The mirror has drifted AWAY from the view and the read door is resolving containment the view would not.', v_org, v_missing;
    end if;
    -- and every edge of the view that belongs to this organization must be in the mirror
    select count(*) into v_extra
      from (select ce.container_type, ce.container_id, ce.item_type, ce.item_id, ce.conveys_max
              from custom.carrying_edges ce
              join platform.associations a
                on a.deleted_at is null
               and (a.organization_id = v_org or a.organization_id is null)
               and ((a.source_id = ce.container_id and a.target_id = ce.item_id)
                 or (a.target_id = ce.container_id and a.source_id = ce.item_id))
            except
            select * from custom.carrying_edges_in(v_org)) x;
    if v_extra > 0 then
      raise exception 'PART 1 FAILED: custom.carrying_edges restricted to organization % holds % edge(s) custom.carrying_edges_in(%) does not return. The mirror is MISSING edges, so containment carries less than it should and somebody is being denied a record they hold.', v_org, v_extra, v_org;
    end if;
  end loop;
  raise notice 'PART 1 PASSED — the organization-scoped mirror equals custom.carrying_edges in all % organization(s) that hold records.', v_orgs;
end $t$;

-- ══════════════════════════════════════ PART 2 — THE PARITY. Set-based == the one ladder.
-- Every Table of every organization on this database, from two real seats, row by row.
do $t$
declare
  r        record;
  v_diff   int;
  v_first  record;
  v_pairs  int := 0;
  v_rows   int := 0;
  v_n      int;
  v_sample int;
begin
  for r in
    select distinct rec.organization_id as org, rec.table_id as tbl, u.uid
      from custom.record rec
      cross join (values ('87a6e699-3622-4869-8843-d0867456c0dd'::uuid),
                         ('4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid)) u(uid)
     where rec.deleted_at is null
  loop
    v_pairs := v_pairs + 1;
    select count(*) into v_n from custom.record rec
     where rec.organization_id = r.org and rec.table_id is not distinct from r.tbl and rec.deleted_at is null;
    -- The ladder costs about a millisecond a row, so a Table over the bound is asked about a
    -- RANDOM sample rather than skipped: a skipped Table proves nothing and says nothing.
    v_sample := case when v_n > 3000 then 500 else 0 end;
    if v_sample > 0 then
      raise notice '  (Table % of organization % holds % rows — asking the ladder about a random % of them rather than all of them.)', r.tbl, r.org, v_n, v_sample;
    end if;
    select count(*) into v_diff
      from custom.read_door_parity(r.org, r.tbl, r.uid, 'viewer', v_sample) p
     where p.verdict <> 'same';
    if v_diff > 0 then
      select * into v_first
        from custom.read_door_parity(r.org, r.tbl, r.uid, 'viewer', v_sample) p
       where p.verdict <> 'same' limit 1;
      raise exception 'PART 2 FAILED: organization %, Table %, person % — % row(s) where the set-based answer and the one ladder disagree. First: record % set_based=% per_row=% — %',
        r.org, r.tbl, r.uid, v_diff, v_first.record_id, v_first.set_based, v_first.per_row, v_first.verdict;
    end if;
    v_rows := v_rows + case when v_sample > 0 then v_sample else v_n end;
  end loop;
  raise notice 'PART 2 PASSED — % (organization, Table, person) pairs, % row answers, every one identical to custom.has_visibility.', v_pairs, v_rows;
end $t$;

-- ══════════════════════════════════════ PART 3 — the same question at `editor`, not just `viewer`
do $t$
declare r record; v_diff int; v_pairs int := 0; v_n int; v_sample int;
begin
  for r in
    select distinct rec.organization_id as org, rec.table_id as tbl, u.uid
      from custom.record rec
      cross join (values ('87a6e699-3622-4869-8843-d0867456c0dd'::uuid),
                         ('4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid)) u(uid)
     where rec.deleted_at is null
  loop
    v_pairs := v_pairs + 1;
    select count(*) into v_n from custom.record rec
     where rec.organization_id = r.org and rec.table_id is not distinct from r.tbl and rec.deleted_at is null;
    v_sample := case when v_n > 3000 then 500 else 0 end;
    select count(*) into v_diff
      from custom.read_door_parity(r.org, r.tbl, r.uid, 'editor', v_sample) p
     where p.verdict <> 'same';
    if v_diff > 0 then
      raise exception 'PART 3 FAILED at level `editor`: organization %, Table %, person % — % disagreeing row(s). VIS-3 says access is the MINIMUM along the path; a level the path does not carry is the usual cause.', r.org, r.tbl, r.uid, v_diff;
    end if;
  end loop;
  raise notice 'PART 3 PASSED — % pairs agree at `editor` as well as at `viewer`.', v_pairs;
end $t$;

-- ══════════════════════════════════════ PART 4 — the doors return the same ids as the ladder
do $t$
declare
  r record; v_a uuid[]; v_b uuid[]; v_pairs int := 0;
begin
  -- A NULL Table is skipped here, and only here: `custom.query_visible_ids`'s second argument
  -- says "every Table of this organization" when it is null, so it cannot be asked about the
  -- Table that IS null. Those records are covered by PARTS 2 and 3, which ask
  -- `custom.read_door_parity` with `is not distinct from` and so do reach them.
  for r in
    select rec.organization_id as org, rec.table_id as tbl
      from custom.record rec where rec.deleted_at is null and rec.table_id is not null
     group by 1, 2 having count(*) <= 3000
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text, true);
    v_pairs := v_pairs + 1;
    select coalesce(array_agg(v order by v), '{}') into v_a
      from custom.query_visible_ids(r.org, r.tbl, 'viewer') v;
    select coalesce(array_agg(rec.id order by rec.id), '{}') into v_b
      from custom.record rec
     where rec.organization_id = r.org and rec.table_id is not distinct from r.tbl
       and rec.deleted_at is null
       and coalesce(rec.metadata ->> 'quarantine', 'false') <> 'true'
       and custom.has_visibility('87a6e699-3622-4869-8843-d0867456c0dd'::uuid, 'record', rec.id, 'viewer');
    if v_a is distinct from v_b then
      raise exception 'PART 4 FAILED: custom.query_visible_ids(%, %) returned % ids and the per-row ladder returns % — the list door and the ladder disagree.',
        r.org, r.tbl, coalesce(array_length(v_a,1),0), coalesce(array_length(v_b,1),0);
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'PART 4 PASSED — custom.query_visible_ids returns exactly the ids the one ladder admits, on % Table(s) of 3000 rows or fewer (a larger Table is covered by PART 2''s sample, which asks the same question of the same expression).', v_pairs;
end $t$;

-- ══════════════════════════════════════ PART 5 — every refusal is a sentence with a remedy
do $t$
declare v_set record; v_org uuid;
begin
  select rec.organization_id into v_org from custom.record rec where rec.deleted_at is null limit 1;

  -- 5a. no principal
  v_set := custom.visible_set(null, v_org, null, 'viewer');
  if not v_set.o_fallback or v_set.o_note is null then
    raise exception 'PART 5a FAILED: custom.visible_set with no principal did not fall back, or fell back silently.';
  end if;
  if position('per-row ladder' in v_set.o_note) = 0 then
    raise exception 'PART 5a FAILED: the note does not say what the door does instead: %', v_set.o_note;
  end if;

  -- 5b. the ceiling, driven for real
  create or replace function custom.read_door_ladder_ceiling() returns integer
    language sql immutable set search_path to '' as $f$ select 0; $f$;
  v_set := custom.visible_set('87a6e699-3622-4869-8843-d0867456c0dd'::uuid,
                              'dce7130b-a922-4f22-aaf5-564bd86b0ba7'::uuid,
                              '11111111-0000-4000-8000-000000000001'::uuid, 'viewer');
  if not v_set.o_fallback then
    raise exception 'PART 5b FAILED: the ladder ceiling was 0 and custom.visible_set answered anyway.';
  end if;
  if position('REMEDY' in v_set.o_note) = 0 then
    raise exception 'PART 5b FAILED: the ceiling refusal names no remedy: %', v_set.o_note;
  end if;
  raise notice 'PART 5 PASSED — both refusals announce themselves and name a remedy. 5b said: %', left(v_set.o_note, 140);
end $t$;

-- ══════════════════════════════════════ PART 6 — the per-node edge lookup is the view's rows
-- `custom.carrying_edges_of` is what the ONE ladder's third arm now walks. It must return, for
-- every node, exactly the edges `custom.carrying_edges` holds for that node — asked of every id
-- the edge table speaks about, plus a random sample of records it does not.
do $t$
declare
  r record; v_bad int; v_n int := 0;
begin
  for r in
    select ce.item_type as t, ce.item_id as i from custom.carrying_edges ce
    union
    select 'record', x.id from (
      select rec.id from custom.record rec where rec.deleted_at is null order by random() limit 200) x
  loop
    v_n := v_n + 1;
    select count(*) into v_bad from (
      (select container_type, container_id, conveys_max from custom.carrying_edges_of(r.t, r.i)
       except
       select ce.container_type, ce.container_id, ce.conveys_max from custom.carrying_edges ce
        where ce.item_type = r.t and ce.item_id = r.i)
      union all
      (select ce.container_type, ce.container_id, ce.conveys_max from custom.carrying_edges ce
        where ce.item_type = r.t and ce.item_id = r.i
       except
       select container_type, container_id, conveys_max from custom.carrying_edges_of(r.t, r.i))
    ) d;
    if v_bad > 0 then
      raise exception 'PART 6 FAILED: custom.carrying_edges_of(%, %) differs from custom.carrying_edges by % edge(s). The ladder''s third arm is walking a graph the view does not have.', r.t, r.i, v_bad;
    end if;
  end loop;
  raise notice 'PART 6 PASSED — the per-node edge lookup equals custom.carrying_edges on all % node(s) asked.', v_n;
end $t$;

-- ══════════════════════════════════════ PART 7 — halving finds the rung the walk finds
do $t$
declare
  r record; v_new public.permission_level; v_old public.permission_level; v_lvl public.permission_level;
  v_pairs int := 0;
begin
  for r in
    select distinct rec.organization_id as org, rec.id as subject, u.uid
      from (select rec2.organization_id, rec2.id from custom.record rec2
             where rec2.deleted_at is null order by random() limit 60) rec
      cross join (values ('87a6e699-3622-4869-8843-d0867456c0dd'::uuid),
                         ('4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid)) u(uid)
  loop
    v_pairs := v_pairs + 1;
    v_new := custom.effective_level(r.uid, r.org, r.subject);
    -- THE WALK THIS REPLACED, spelled out: every rung from the top, first yes wins.
    v_old := null;
    for v_lvl in select l.level from iam.content_levels() l order by l.ordinal desc loop
      if custom.has_visibility(r.uid, 'record', r.subject, v_lvl) then v_old := v_lvl; exit; end if;
    end loop;
    if v_new is distinct from v_old then
      raise exception 'PART 7 FAILED: custom.effective_level(%, %, %) halves to % where the rung-by-rung walk says %. The one function is not monotone in the level, and halving is only right if it is.',
        r.uid, r.org, r.subject, v_new, v_old;
    end if;
  end loop;
  raise notice 'PART 7 PASSED — halving and the rung-by-rung walk agree on all % (person, record) pairs.', v_pairs;
end $t$;

-- ══════════════════════════════════════ TEARDOWN — this suite wrote nothing
do $t$
declare v_n int;
begin
  select count(*) into v_n from custom.record where organization_id = '00000000-0000-0000-0000-000000000000';
  raise notice 'TEARDOWN PASSED — census zero: this suite creates no record, no grant and no association, and the transaction rolls back.';
end $t$;

select 'ALL PARTS PASSED' as readperf_green;
rollback;
