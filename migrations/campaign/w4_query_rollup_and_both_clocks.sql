-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W4-QUERY, file 3 — DOOR-7 (roll up along a chosen relation flavor without double-counting
--                    on loops) and DOOR-8 (query as-of a date on EITHER clock).
--
-- DOOR-7's own measurement is the whole design brief: on a 200,000-record graph with a
-- three-node loop the visited-set rollup returned 120,603 items in 675 ms and the naive walk
-- double-counted 3.67x — 220.7M against 60.1M — in 1,875 ms. Double counting is not a rounding
-- error here; it is a wrong number three and a half times too big, returned confidently.
--
-- HOW THIS ONE CANNOT DOUBLE COUNT, in two independent ways, because one is not enough:
--   1. `CYCLE record_id SET is_cycle USING path` — PostgreSQL's own cycle detection stops the
--      walk the moment a node reappears on its OWN path. A loop terminates; it does not
--      unroll to the depth cap.
--   2. `group by record_id` with `min(depth)` — a DIAMOND is not a cycle (two disjoint paths
--      to one node, no repetition on either), so cycle detection alone still reaches the node
--      twice. The grouping is what makes "each node once" true of the ANSWER rather than of
--      the walk.
-- Take either one away and a real graph returns a number that is too big. That is the RED
-- twin's second and third assertions.
--
-- FLAVOR IS READ FROM THE DECLARATION, NEVER FROM THE EDGE. `platform.relation_declaration`
-- is the one place a relation's flavor lives (REL-1: ownership is one fact stored once, on the
-- Field). Reading `owned` off the association row would be a second copy of that fact, and the
-- first thing to drift.
--
-- DOOR-8 — EITHER CLOCK, AND THEY ARE GENUINELY TWO. `p_recorded_at` asks what the store SAID
-- at a moment (the system clock, answered by `history.record_at` from the version chain);
-- `p_world_on` asks what was TRUE on a date (the world clock, answered by
-- `history.value_in_document` from the Field's own dated periods). Pass both and the question
-- is "on the day the store believed it, what did it then say was true in June" — which is a
-- different answer from either alone, and the reason the two arguments cannot be one.
--
-- THE INVERSE: `migrations/inverse/w4_query_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── the edges a rollup walks, filtered by DECLARATION ──────────────────────────
create or replace function custom.query_relation_edges(p_organization_id uuid,
                                                       p_flavor text default null,
                                                       p_role text default null)
returns table(parent_id uuid, child_id uuid, role text, flavor text)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select a.source_id, a.target_id, a.role, d.declaration ->> 'flavor'
    from platform.associations a
    cross join lateral (select platform.relation_declaration(p_organization_id, a.relation_field_id)
                          as declaration) d
   where a.organization_id = p_organization_id
     and a.deleted_at is null
     and a.relation_field_id is not null
     and a.source_type = 'record'
     and (p_role is null or a.role = p_role)
     and (p_flavor is null or d.declaration ->> 'flavor' = p_flavor);
$fn$;

comment on function custom.query_relation_edges(uuid, text, text) is
  'W4-QUERY / DOOR-7: the relation edges of one organization, flavor read from platform.relation_declaration (REL-1: the Field owns that fact) and never from the edge row.';

-- ── DOOR-7 ────────────────────────────────────────────────────────────────────
create or replace function custom.query_rollup(p_organization_id uuid,
                                               p_roots uuid[],
                                               p_flavor text default null,
                                               p_role text default null,
                                               p_max_depth integer default 33,
                                               p_required text default 'viewer')
returns table(record_id uuid, depth integer)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_cap integer := least(greatest(coalesce(p_max_depth, 33), 1), 64);
begin
  if p_organization_id is null or p_roots is null or cardinality(p_roots) = 0 then
    raise exception 'custom.query_rollup: the organization and at least one root are required'
      using errcode = '22004';
  end if;
  if p_flavor is not null and not (p_flavor = any (platform.relation_flavors())) then
    raise exception 'custom.query_rollup: % is not a relation flavor', p_flavor
      using errcode = '22023',
            hint = format('Legal flavors: %s. Null means every flavor.',
                          array_to_string(platform.relation_flavors(), ', '));
  end if;

  return query
  with recursive edge as (
    select e.parent_id, e.child_id from custom.query_relation_edges(p_organization_id, p_flavor, p_role) e
  ),
  walk (node, d) as (
      select x, 0 from unnest(p_roots) as x
    union all
      select e.child_id, walk.d + 1
        from walk
        join edge e on e.parent_id = walk.node
       where walk.d < v_cap
  ) cycle node set is_cycle using path
  -- The join is the Visibility filter (DOOR-10): a node the principal cannot see is never
  -- fetched, and a rollup therefore counts what THIS principal may see, which is the only
  -- number that is ever correct to show them.
  select w.node, min(w.d)::integer
    from walk w
    join custom.query_visible_ids(p_organization_id, null, p_required) v on v = w.node
   where not w.is_cycle
   group by w.node;
end;
$fn$;

comment on function custom.query_rollup(uuid, uuid[], text, text, integer, text) is
  'W4-QUERY / DOOR-7: roll up along a chosen relation flavor and role, counting every reachable record EXACTLY ONCE on loops and on diamonds — cycle detection stops the walk, the grouping makes once true of the answer. Visibility is joined, not applied after.';

create or replace function custom.query_rollup_sum(p_organization_id uuid,
                                                   p_roots uuid[],
                                                   p_field_key text,
                                                   p_flavor text default null,
                                                   p_role text default null,
                                                   p_max_depth integer default 33,
                                                   p_required text default 'viewer')
returns numeric
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- The value is read out of the Value ENVELOPE when there is one (`{"value": …}`) and out of
  -- the plain key when there is not, which is the same reading every other surface does.
  select coalesce(sum(
           case when jsonb_typeof(r.data -> p_field_key) = 'object'
                      and (r.data -> p_field_key) ? 'value'
                then nullif(r.data -> p_field_key ->> 'value', '')::numeric
                else nullif(r.data ->> p_field_key, '')::numeric end), 0)
    from custom.query_rollup(p_organization_id, p_roots, p_flavor, p_role, p_max_depth, p_required) k
    join custom.record r on r.organization_id = p_organization_id and r.id = k.record_id;
$fn$;

comment on function custom.query_rollup_sum(uuid, uuid[], text, text, text, integer, text) is
  'W4-QUERY / DOOR-7: the sum of one Field over a rollup. Built ON custom.query_rollup, so it inherits exactly-once counting rather than re-deriving it.';

-- ── DOOR-8 ────────────────────────────────────────────────────────────────────
create or replace function custom.query_record_as_of(p_organization_id uuid,
                                                     p_record_id uuid,
                                                     p_recorded_at timestamptz default null,
                                                     p_world_on date default null,
                                                     p_required text default 'viewer')
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc jsonb;
  v_out jsonb := '{}'::jsonb;
  v_key text;
begin
  -- Visibility first and through the same helper: history is not a side door into rows the
  -- principal may not read today.
  if not custom.query_can_see(p_organization_id, p_record_id, p_required) then
    return null;
  end if;

  -- CLOCK ONE, the system clock: what the store SAID at that moment.
  if p_recorded_at is null then
    select r.data into v_doc from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  else
    v_doc := history.record_at(p_organization_id, p_record_id, p_recorded_at);
    v_doc := coalesce(v_doc -> 'data', v_doc);
  end if;
  if v_doc is null then
    return null;
  end if;

  -- CLOCK TWO, the world clock: what was TRUE on that date, inside the document clock one
  -- just chose. Applied per key, because `dated` is a property of a Field and not of a record.
  if p_world_on is null then
    return v_doc;
  end if;
  for v_key in select jsonb_object_keys(v_doc) loop
    v_out := v_out || jsonb_build_object(v_key, history.value_in_document(v_doc, v_key, p_world_on));
  end loop;
  return v_out;
end;
$fn$;

comment on function custom.query_record_as_of(uuid, uuid, timestamptz, date, text) is
  'W4-QUERY / DOOR-8: one record as-of a date on EITHER clock, or both. p_recorded_at is what the store SAID (history.record_at); p_world_on is what was TRUE (history.value_in_document). Visibility is checked through the one helper first.';

create or replace function custom.query_table_as_of(p_organization_id uuid,
                                                    p_table_id uuid,
                                                    p_recorded_at timestamptz default null,
                                                    p_world_on date default null,
                                                    p_limit integer default 50,
                                                    p_offset integer default 0,
                                                    p_required text default 'viewer')
returns table(record_id uuid, data jsonb)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select v, custom.query_record_as_of(p_organization_id, v, p_recorded_at, p_world_on, p_required)
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r on r.organization_id = p_organization_id and r.id = v
   order by r.created_at desc, r.id
   limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

comment on function custom.query_table_as_of(uuid, uuid, timestamptz, date, integer, integer, text) is
  'W4-QUERY / DOOR-8: a page of one Table as-of a date on either clock. The same per-record function answers each row, so the page and the record can never disagree.';
