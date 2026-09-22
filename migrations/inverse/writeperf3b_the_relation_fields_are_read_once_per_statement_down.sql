-- additive: yes
--
-- chair-step: the inverse of writeperf3b_the_relation_fields_are_read_once_per_statement.sql —
--   it restores custom.record_relation_edges to the exact bytes that file replaced.
--
-- WRITE-PERF-3 — THE INVERSE. The relation fields go back to being read once per ROW.
--
-- based-on: custom.record_relation_edges(uuid, uuid, uuid, text, jsonb, timestamp with time zone) c2a8425790f84c5d7ddf233a8c8b36c88a8879a181c2f342878ab9a1f01333e5
-- based-on: custom._relation_associations_stmt_insert() 69c85956d7f2fda696de7457ab268269a898b6a1c04afb9bf824f68af75e76cf

CREATE OR REPLACE FUNCTION custom.record_relation_edges(p_organization_id uuid, p_id uuid, p_table_id uuid, p_data_class text, p_data jsonb, p_deleted_at timestamp with time zone)
 RETURNS TABLE(target_id uuid, edge_role text, field_id uuid, ord integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF / LADDER-PERF's class, on the WRITE path. Everything between `begin`
  -- and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being built
  -- again on every single call.
  return query
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
end
$function$

;

-- and the trigger function it also replaced:
CREATE OR REPLACE FUNCTION custom._relation_associations_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_named boolean := false;
begin
  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('ai', 'code') then
    perform set_config('app.actor_system', 'custom.relations', true);
    v_named := true;
  end if;

  update platform.associations a
     set deleted_at        = null,
         deleted_via_type  = null,
         deleted_via_id    = null,
         relation_field_id = e.field_id,
         "position"        = e.ord
    from new_rows n
    cross join lateral custom.record_relation_edges(n.organization_id, n.id, n.table_id,
                                                    n.data_class, n.data, n.deleted_at) e
   where a.deleted_at is not null
     and a.source_type = 'record'
     and a.source_id = n.id
     and a.target_id = e.target_id
     and a.role = e.edge_role;

  -- WRITE what it declares now, WITH THE FIELD ON IT. `platform.enforce_relation_edge` is
  -- what then holds REL-5, REL-7, REL-8 and REL-12 over it.
  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id,
     relation_field_id, "position")
  select 'record', n.id, 'record', e.target_id, e.edge_role, n.organization_id,
         e.field_id, e.ord
    from new_rows n
    cross join lateral custom.record_relation_edges(n.organization_id, n.id, n.table_id,
                                                    n.data_class, n.data, n.deleted_at) e
   order by n.id
  on conflict (source_type, source_id, target_type, target_id, role) do update
     set relation_field_id = excluded.relation_field_id,
         "position"        = excluded."position",
         deleted_at        = null;

  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;
  return null;
end;
$function$

;
