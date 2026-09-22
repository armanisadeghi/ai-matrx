-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W4-QUERY, file 2 — DOOR-6 (coordinates, any combination and any subset) and
--                    DOOR-9 (across every Home of one Table in a single answer).
--
-- A COORDINATE is one relation end: a role (the Field key that declares the relation), a
-- target, and which end of the edge the record sits on. `{"role":"client","target_id":"…"}`
-- reads "records whose `client` relation points at that party". Give two and the answer is
-- the intersection; give none and the answer is the Table. ANY SUBSET is not a feature of the
-- caller — it is the shape of the function: an absent key is an absent constraint, never a
-- null compared against.
--
-- WHY IT IS SET-BASED AND NOT A PREDICATE PER ROW. The obvious spelling is `where exists
-- (…)` once per coordinate per row, which is a correlated subquery the planner re-runs for
-- every candidate. This counts DISTINCT SATISFIED COORDINATES in ONE pass over
-- `platform.associations`, keeps the records that satisfy all of them, and joins that to
-- `custom.query_visible_ids`. DOOR-10 is therefore a JOIN in the plan, above an index scan,
-- and never `Rows Removed by Filter`.
--
-- DOOR-9 — EVERY HOME IN ONE ANSWER. A Table lives at many Homes (`custom.home`,
-- `custom.home_add`), and the naive shape is one query per Home stitched together by the
-- caller — N round trips, N plans, and a page size that means nothing. `custom.query_across_homes`
-- attributes each record to its Home by walking ITS OWN containment chain once, in the same
-- query, and returns one ordered page over the whole set. The measured cost DOOR-9 records is
-- 0.225 ms for a 50-row page across 40 Homes against 0.392 ms for one Home — the single answer
-- is not merely convenient, it is the faster one.
--
-- THE INVERSE: `migrations/inverse/w4_query_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── DOOR-6 ────────────────────────────────────────────────────────────────────
create or replace function custom.query_by_coordinates(p_organization_id uuid,
                                                       p_table_id uuid default null,
                                                       p_coordinates jsonb default '[]'::jsonb,
                                                       p_limit integer default 50,
                                                       p_offset integer default 0,
                                                       p_required text default 'viewer')
returns table(record_id uuid, table_id uuid, data jsonb, coordinates_matched integer)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_n integer;
begin
  if p_organization_id is null then
    raise exception 'custom.query_by_coordinates: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if jsonb_typeof(coalesce(p_coordinates, '[]'::jsonb)) <> 'array' then
    raise exception 'custom.query_by_coordinates: p_coordinates is a JSON ARRAY of coordinates, one object per relation end; got %',
                    jsonb_typeof(p_coordinates)
      using errcode = '22023',
            hint = 'e.g. [{"role":"client","target_id":"…"},{"role":"project","target_id":"…","direction":"to"}]. An empty array means no coordinate constraint, which is the whole Table.';
  end if;

  select count(*) into v_n from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb));

  return query
  with coord as (
    select ord                                        as n,
           c ->> 'role'                               as role,
           (c ->> 'target_id')::uuid                  as target_id,
           coalesce(c ->> 'direction', 'from')        as direction
      from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb))
           with ordinality as t(c, ord)
  ),
  -- ONE pass over the edges: every record that satisfies at least one coordinate, with the
  -- count of DISTINCT coordinates it satisfies. Two edges answering the same coordinate count
  -- once, which is why `distinct co.n` and not `count(*)`.
  hit as (
    select case when co.direction = 'to' then a.source_id else a.target_id end as other_id,
           case when co.direction = 'to' then a.target_id else a.source_id end as rec_id,
           co.n
      from coord co
      join platform.associations a
        on a.organization_id = p_organization_id
       and a.deleted_at is null
       and a.relation_field_id is not null
       and (co.role is null or a.role = co.role)
       and ((co.direction = 'from' and a.source_type = 'record'
             and a.target_id = co.target_id)
         or (co.direction = 'to'
             and a.source_id = co.target_id))
  ),
  satisfied as (
    select rec_id, count(distinct n)::integer as matched
      from hit
     group by rec_id
    having count(distinct n) = v_n
  )
  select r.id, r.table_id, r.data, coalesce(s.matched, 0)
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r
      on r.organization_id = p_organization_id and r.id = v
    left join satisfied s on s.rec_id = v
   where v_n = 0 or s.rec_id is not null
   order by r.created_at desc, r.id
   limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

comment on function custom.query_by_coordinates(uuid, uuid, jsonb, integer, integer, text) is
  'W4-QUERY / DOOR-6: query by any combination of relation coordinates and any subset of them. An absent key is an absent constraint. Visibility is joined (custom.query_visible_ids), never applied afterwards.';

-- ── DOOR-9 ────────────────────────────────────────────────────────────────────
create or replace function custom.query_table_homes(p_organization_id uuid, p_table_id uuid)
returns setof uuid
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- Both ways a Table declares a Home: the containment parent it was declared under, and
  -- every carrying `home` relation `custom.home_add` writes. One list, deduplicated, because
  -- "every Home" must not depend on which mechanism named it.
  select home_record_id from custom.home
   where organization_id = p_organization_id and table_id = p_table_id
  union
  select home_record_id from custom.home_relations()
   where organization_id = p_organization_id and table_id = p_table_id;
$fn$;

comment on function custom.query_table_homes(uuid, uuid) is
  'W4-QUERY / DOOR-9: every Home of one Table, from both mechanisms that declare one, deduplicated.';

create or replace function custom.query_across_homes(p_organization_id uuid,
                                                     p_table_id uuid,
                                                     p_limit integer default 50,
                                                     p_offset integer default 0,
                                                     p_required text default 'viewer')
returns table(record_id uuid, home_record_id uuid, data jsonb, created_at timestamptz)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.query_across_homes: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  return query
  with homes as (select h from custom.query_table_homes(p_organization_id, p_table_id) h)
  select r.id,
         -- The record's own Home: the nearest ancestor in its containment chain that is one
         -- of this Table's Homes. A record directly under a Home has depth 1; a record three
         -- containers down still reports the Home it ultimately sits in.
         (select c.ancestor_id
            from custom.containment_chain(p_organization_id, r.id) c
            join homes on homes.h = c.ancestor_id
           order by c.depth
           limit 1),
         r.data,
         r.created_at
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r
      on r.organization_id = p_organization_id and r.id = v
   order by r.created_at desc, r.id
   limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

comment on function custom.query_across_homes(uuid, uuid, integer, integer, text) is
  'W4-QUERY / DOOR-9: one ordered page over one Table across EVERY Home it lives at, each record carrying the Home it sits in. One query, one plan, one page size — never one query per Home stitched together by the caller.';
