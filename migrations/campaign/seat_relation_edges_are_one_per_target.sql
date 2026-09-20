-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.record_relation_edges(uuid, uuid, uuid, text, jsonb, timestamp with time zone) aff24e30f8bc1043682ba3da4adebb4266ed508e50fd791b04a6ebe747cfa068
--
-- SEAT-SUITES, 2026-09-19 — A RECORD WHOSE RELATION NAMES THE SAME THING TWICE COULD NOT BE
-- WRITTEN AT ALL.
--
-- MEASURED FROM THE SEAT `authenticated` ON THE MAIN DATABASE. The parity-floor fixture
-- record 11111111-0009-4000-8000-000000000011 lists its first line twice in `lines` — which
-- is the whole point of that fixture, because `custom.relation_targets` already carries a
-- DISTINCT so the rollup counts it once. Ask any client door to write that record:
--
--   custom.record_update(org, 11111111-0009-…-0011, '{"amount_usd":1000}')
--   ERROR: ON CONFLICT DO UPDATE command cannot affect row a second time
--     CONTEXT: custom._relation_associations() … insert into platform.associations …
--
-- `custom.record_relation_edges` yields ONE ROW PER ARRAY ELEMENT, so a target listed twice
-- produces two rows with the same (source, target, role). The `on conflict … do update` in
-- `custom._relation_associations` then proposes the same constrained values twice in one
-- command and Postgres refuses the WHOLE WRITE. An edge is a fact — "this record points at
-- that one through this field" — and a fact stated twice is still one fact, exactly as
-- `custom.relation_targets` already says.
--
-- THE FIX, in the one place the de-duplication was missing: an edge is emitted ONCE per
-- (target, role), keeping the FIRST position the record lists it at, so an ordered relation
-- keeps its order. Nothing else about the function changes.
--
-- WHY IT IS ADDITIVE: it is a CREATE OR REPLACE of a STABLE reader. No table, column, row or
-- grant is touched, and every caller that never listed a duplicate sees the identical answer.
--
-- ITS INVERSE: migrations/inverse/seat_relation_edges_are_one_per_target_down.sql restores
-- the body above verbatim.

create or replace function custom.record_relation_edges(
  p_organization_id uuid, p_id uuid, p_table_id uuid, p_data_class text,
  p_data jsonb, p_deleted_at timestamp with time zone)
  returns table(target_id uuid, edge_role text, field_id uuid, ord integer)
  language sql stable set search_path to ''
as $function$
  -- REL-10: the role IS the field key, and REL-11: nothing about the relation is stored in
  -- the value — the value is only WHICH record, and every property of the relation is read
  -- from the Field. A key that holds something which is not a uuid is not an edge; it is
  -- reported by the backfill's census rather than guessed at.
  --
  -- SEAT-SUITES 2026-09-19: ONE EDGE PER (target, role). A relation that names the same
  -- record twice states one fact twice, and the writer downstream of this reader does an
  -- `on conflict … do update`, which Postgres refuses outright when one command proposes the
  -- same key twice — so without this the record could not be written at all.
  select distinct on (e.target_id, e.edge_role)
         e.target_id, e.edge_role, e.field_id, e.ord
    from (
      select (t.val #>> '{}')::uuid as target_id,
             coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') as edge_role,
             f.id as field_id,
             case when coalesce((f.data -> 'config' ->> 'ordered')::boolean, false)
                  then t.ord::integer else null end as ord,
             t.ord as seq
        from custom.record f
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')) = 'array'
              then p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')
            when jsonb_typeof(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')) = 'string'
              then jsonb_build_array(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'))
            else '[]'::jsonb
          end) with ordinality as t(val, ord)
       where p_deleted_at is null
         and p_id is not null
         and p_table_id is not null
         and coalesce(p_data_class, '') = 'record'
         and f.deleted_at is null
         and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel'
         and f.organization_id = p_organization_id
         and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
         and f.data ->> 'type' = 'relation'
         and (t.val #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) e
   order by e.target_id, e.edge_role, e.seq;
$function$;
