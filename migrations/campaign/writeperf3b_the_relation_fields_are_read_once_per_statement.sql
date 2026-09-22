-- additive: yes
--
-- chair-step: it REPLACES `custom.record_relation_edges` and `custom._relation_associations_stmt_insert`
--   — two functions, both this campaign's own, both body-for-body equivalent. Nothing is dropped,
--   nothing is revoked, no row of anybody's data is touched. The inverse is
--   `migrations/inverse/writeperf3b_the_relation_fields_are_read_once_per_statement_down.sql`,
--   which restores the exact bytes this file replaced.
--
-- based-on: custom.record_relation_edges(uuid, uuid, uuid, text, jsonb, timestamp with time zone) a3f6ecc835a5608d1641b9d6f0cdc1cb7c0a20990cc480804fd8da3db30f6afb
-- based-on: custom._relation_associations_stmt_insert() a6554f4511cd1c18eca5c2ddd76bbbf70ecdbb1eff9b910911cc279d5f4dfa02
--
-- WRITE-PERF-3 — THE RELATION FIELDS OF A TABLE ARE READ ONCE PER STATEMENT, NOT ONCE PER ROW.
--
-- MEASURED, NOT GUESSED. `EXPLAIN (ANALYZE, BUFFERS)` of ONE 250-row batched insert into
-- `custom.record` on the main database — the shape every import, paste, form, booking and agent
-- write takes — reports `zz_w2a_relation_association_s_i` at 674–1,419 ms, the largest single
-- item on the whole write path. Inside it, `pg_stat_user_functions` reports
-- `custom.record_relation_edges` at 189 ms of self time over 325 calls: 0.58 ms a call, and
-- every one of those calls runs the SAME index scan over `custom.record` to answer the SAME
-- question — "which Fields of this Table are relations?" — for the SAME Table.
--
-- The question is a fact about the TABLE. Two hundred and fifty records of one Table ask it two
-- hundred and fifty times. This file makes them ask it once.
--
-- HOW, AND WHY IT CANNOT GO STALE. The answer is kept in `platform.memo_s` — the small bucket of
-- WRITE-PERF-3's transaction-local memo, the same machinery `custom.applicable_fields` already
-- uses for the same class of question (`af:<org>:<table>:<type>`; this one is
-- `rre:<org>:<table>`). The memo lives in a GUC set with `is_local => true`, so it dies with the
-- transaction and is never shared between sessions; `platform.memo_b_seat()` scopes it to the
-- seat, so a role change is a miss; and `custom.record` carries BOTH halves of the invalidation
-- this campaign already proved it needs — the BEFORE-ROW `_aa_memo_clear`
-- (`platform.memo_clear_on_structure_row`) and the after-statement `zz_memo_clear_i/_u/_d`. The
-- BEFORE-ROW half is the one that matters here and is exactly why it exists: a Field row written
-- EARLIER IN THE SAME STATEMENT empties the memo BEFORE this reader can be served a stale
-- answer. (WRITE-PERF-3's own defect, 2026-09-21: a statement-level invalidation cannot protect
-- a read inside the same statement.) `memo_clear_on_structure_row` fires on
-- `custom.field_kernel_id()`, which is precisely the table this memo reads.
--
-- WHAT IS UNCHANGED, CLAUSE FOR CLAUSE. The six early conditions (`p_deleted_at is null`,
-- `p_id is not null`, `p_table_id is not null`, `data_class = 'record'`) now guard the function
-- instead of sitting in the query's WHERE — an empty result either way, and they are evaluated
-- BEFORE the memo so a delete, a kernel row or a relation row still reads nothing and caches
-- nothing. The Field predicate is character for character what it was: `deleted_at is null`,
-- `table_id = custom.field_kernel_id()`, `data_class <> 'kernel'`, the organization,
-- `nullif(data ->> 'entity_definition_id','')::uuid = p_table_id`, `data ->> 'type' = 'relation'`.
-- The edge_role is still `coalesce(nullif(key,''), name)`, the ord is still the position only
-- when the Field says `config.ordered`, the uuid regex is unchanged, and the result is still
-- `distinct on (target_id, edge_role)` ordered by `(target_id, edge_role, seq)` — REL-10, REL-11
-- and the one-edge-per-(target, role) rule the seat suites hold are untouched.
--
-- WHAT IT IS NOT. It is not a cache of a DECISION. This campaign never remembers a NO, and this
-- memo holds no answer about who may reach what: `custom.record_relation_edges` asks no door and
-- never did. It remembers the SHAPE of a Table, which is what the memo is for.

create or replace function custom.record_relation_edges(
  p_organization_id uuid,
  p_id uuid,
  p_table_id uuid,
  p_data_class text,
  p_data jsonb,
  p_deleted_at timestamp with time zone)
returns table(target_id uuid, edge_role text, field_id uuid, ord integer)
language plpgsql
stable
set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_key  text;
  v_json jsonb;
begin
  -- The four conditions that made the query empty are asked first, so a retired record, a
  -- kernel row, a relation row and a row with no id read nothing and cache nothing.
  if p_deleted_at is not null
     or p_id is null
     or p_table_id is null
     or coalesce(p_data_class, '') <> 'record' then
    return;
  end if;

  -- THE SAME TABLE'S RELATION FIELDS, ALREADY READ IN THIS TRANSACTION.
  v_key  := 'rre:' || p_organization_id::text || ':' || p_table_id::text;
  v_json := platform.memo_s_get(v_key)::jsonb;
  if v_json is null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'field_id',  f.id,
             'edge_role', coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
             'ordered',   coalesce((f.data -> 'config' ->> 'ordered')::boolean, false))
             order by f.id), '[]'::jsonb)
      into v_json
      from custom.record f
     where f.deleted_at is null
       and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel'
       and f.organization_id = p_organization_id
       and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
       and f.data ->> 'type' = 'relation';
    perform platform.memo_s_put(v_key, v_json::text);
  end if;

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
               fj.edge_role as edge_role,
               fj.field_id  as field_id,
               case when fj.ordered then t.ord::integer else null end as ord,
               t.ord as seq
          from pg_catalog.jsonb_to_recordset(v_json)
                 as fj(field_id uuid, edge_role text, ordered boolean)
          cross join lateral pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(p_data -> fj.edge_role) = 'array'
                then p_data -> fj.edge_role
              when pg_catalog.jsonb_typeof(p_data -> fj.edge_role) = 'string'
                then pg_catalog.jsonb_build_array(p_data -> fj.edge_role)
              else '[]'::jsonb
            end) with ordinality as t(val, ord)
         where (t.val #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) e
     order by e.target_id, e.edge_role, e.seq;
end
$function$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- AND THE EDGES OF A BATCH ARE COMPUTED ONCE, NOT TWICE.
--
-- The trigger above this function ran `custom.record_relation_edges` over EVERY row of the
-- transition table TWICE: once in an UPDATE that revived soft-deleted associations, and once in
-- the INSERT that writes them. For a 250-row batch that is 500 computations of the same set, and
-- a whole UPDATE over `platform.associations` besides. `zz_w2a_relation_association_s_i` is the
-- single most expensive item on the write path (673 ms of one 250-row insert, measured).
--
-- THE UPDATE IS THE INSERT'S OWN CONFLICT ARM, WRITTEN OUT TWICE. `associations_unique` is a
-- FULL unique index on `(source_type, source_id, target_type, target_id, role)` — not a partial
-- one — so a soft-deleted association IS a conflict, and `on conflict … do update` already
-- reaches every row that UPDATE reached and already sets `deleted_at = null`,
-- `relation_field_id` and `"position"` on it. The ONLY thing the separate UPDATE did that the
-- conflict arm did not is clear `deleted_via_type` and `deleted_via_id`, so those two move onto
-- the conflict arm — CONDITIONALLY, `case when associations.deleted_at is not null`, which is
-- exactly the rows the UPDATE's `where a.deleted_at is not null` selected. A live row's bytes do
-- not change.
--
-- WRITE-PERF-3 measured on 2026-09-21 that a statement with an `ON CONFLICT DO UPDATE` clause
-- fires the statement-level UPDATE trigger as well as the INSERT one, so the memo invalidation
-- on `platform.associations` is reached exactly as it was.
--
-- REL-5, REL-7, REL-8 and REL-12 are held by `platform.enforce_relation_edge` over this write,
-- untouched, as before.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create or replace function custom._relation_associations_stmt_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_named boolean := false;
begin
  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('ai', 'code') then
    perform set_config('app.actor_system', 'custom.relations', true);
    v_named := true;
  end if;

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
         deleted_at        = null,
         -- The revive the separate UPDATE used to do, on exactly the rows it used to touch.
         deleted_via_type  = case when associations.deleted_at is not null
                                  then null else associations.deleted_via_type end,
         deleted_via_id    = case when associations.deleted_at is not null
                                  then null else associations.deleted_via_id end;

  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;
  return null;
end;
$function$;
