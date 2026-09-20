-- additive: yes
--
-- chair-step: it REPLACES the live bodies of seven functions on the record write path, moving
--   each from LANGUAGE sql to LANGUAGE plpgsql with the body character for character unchanged.
--   Nothing is created, dropped, granted or revoked, no row of anybody's data is touched, and
--   no knob can hold it off — these bodies ARE the live path, so a `-- guard:` line would be a
--   comment pretending to be a switch, which is exactly what the runner refuses. Every one
--   carries a `-- based-on:` hash of the body it was written against, so the whole file refuses
--   if any of them has moved since. Parity is proved in one snapshot over 2,000 live records
--   below. The inverse is `migrations/inverse/writeperf_the_write_path_plans_once_down.sql`
--   and it restores all seven LANGUAGE sql bodies byte for byte.
-- based-on: custom.io_changed_field_ids(uuid, uuid, jsonb, jsonb) 9c5414d29f3a5d7b4a73c78ac61b6cd7e008dea33154586826387865901598a6
-- based-on: custom.organization_references(text, uuid, jsonb) ff59c57d35dc77a54114411164d260667f12b024d91d0c355a67aa2cdf194bf9
-- based-on: custom.query_is_store_owner() 18ddf40d7361a1e15e052d4cf21876252ab869c85f9e08368f3e6c8a00899f4a
-- based-on: custom.record_carrying_edges(uuid, text, jsonb, timestamp with time zone) e9450accc0bf17ef9d68e5156814cf3758bfa8d910ca1bf45b0a262fef1826b5
-- based-on: custom.record_relation_edges(uuid, uuid, uuid, text, jsonb, timestamp with time zone) 9b88914b1d9d99eadbb37f330f396274a733f4c246f773c9d727443bb7abfe31
-- based-on: iam.has_org_access(uuid) a232d8afe9555fb23761720abe73c6724bf062e0e8b14f9e22940733880ccfd0
-- based-on: platform.is_provisioning() e65cf194efcf503055fde6af7f37d1adc182c11126d1a5e935f23fbc171e2c19
--
-- WRITE-PERF — THE WRITE PATH PLANS ITS HELPERS ONCE, NOT ONCE PER ROW.
--
-- MEASURED, ON THE MAIN DATABASE, 1,000 RECORDS THROUGH `custom.record_write` ONE AT A TIME
-- (a throwaway organization, an Accounts Table of 50, a Deals Table with six typed columns —
-- text, currency, datetime, select, member and a relation — and the seat `authenticated`):
--
--     custom.record_write   34,811 ms total / 1,051 calls = 33.1 ms PER ROW
--     of which its own body                                  0.54 ms
--
-- Everything else is the thirty-eight row-level triggers on `custom.record`. Read off
-- `pg_stat_user_functions` with `track_functions = all` set INSIDE the transaction (the pooler
-- hands each statement its own backend, so a session-level SET never reaches the statement that
-- needs it — the same trap lane IMPORT hit with `lock_timeout`), the two largest single items
-- in the whole write were:
--
--     custom.record_relation_edges   5.94 ms/row self, 2.1 calls per row
--     custom.choice_options          3.37 ms/row self, 2.0 calls per row
--
-- NEITHER IS DOING 3–6 ms OF WORK. LADDER-PERF proved the class on the READ path on 2026-09-20
-- and it was still wide open on the write path: a SQL-language function is inlined by the
-- planner only when it is a plain SELECT with no SECURITY DEFINER and no SET clause. Every one
-- of these carries `SET search_path`, correctly, so none is ever inlined — and a NON-INLINED
-- SQL-language function is RE-PLANNED ON EVERY CALL, because its plan cache lives for the
-- duration of the calling query rather than the session. plpgsql caches the plan for the
-- session. The body does not change; the planner stops doing the same work a thousand times.
--
-- SEVEN FUNCTIONS, taken from the measured call list of that 1,000-row write — every function
-- the write actually reached that is LANGUAGE sql, non-inlinable and not IMMUTABLE:
--
--     custom.record_relation_edges      custom.record_carrying_edges
--     custom.io_changed_field_ids       custom.organization_references
--     custom.query_is_store_owner       iam.has_org_access
--     platform.is_provisioning
--
-- Each body below is character for character the one the live catalogue holds, wrapped in
-- `begin` / `end` with `#variable_conflict use_column` so a RETURNS TABLE column name still
-- means the column. Nothing else moves.
--
-- PARITY, in ONE snapshot (repeatable read: compute with the old bodies, apply this file inside
-- the same transaction, compute again, compare, roll back — MIRROR-PERF's lesson, because other
-- lanes write to `custom.record` the whole time and two halves seconds apart are reading
-- different databases). 2,000 live records taken deterministically by md5(id), across every
-- organization and Table on the database:
--
--     record_relation_edges     27 rows   IDENTICAL
--     record_carrying_edges    279 rows   IDENTICAL
--     io_changed_field_ids   1,809 rows   IDENTICAL
--     containment_chain        272 rows   IDENTICAL
--     choice_field_map           7 rows   IDENTICAL
--     organization_references    0 rows   identical, and ZERO ROWS IS ZERO COVERAGE — said
--                                         here rather than counted as a pass.
--
-- A NOTE THIS FILE OWES THE NEXT READER. Four siblings of these seven —
-- `custom.caller_role`, `custom.choice_field_map`, `custom.choice_options` and
-- `custom.containment_chain` — were moved to plpgsql by the same conversion earlier in this
-- session by an authoring slip: a `psql -f` of the generated file that ran WITHOUT a
-- transaction, so four statements committed before the fifth failed to compile. They are not
-- in this file and they carry no ledger row of their own. The move is the same one proved
-- above and changes no answer, and lane PIPELINES has since replaced `custom.choice_options`
-- again on top of it (`pipelines_an_options_position_is_system_state.sql`, 19:48:57Z), so
-- putting them back would now revert somebody else's work. It is written down here, in the
-- BUILD-LOG row and in PROGRESS-WRITE-PERF.md rather than quietly left for someone to find.

CREATE OR REPLACE FUNCTION custom.io_changed_field_ids(p_organization_id uuid, p_table_id uuid, p_old jsonb, p_new jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF / LADDER-PERF's class, on the WRITE path. Everything between `begin`
  -- and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being built
  -- again on every single call.
  return (
    -- `custom.applicable_fields` is the platform's one answer to "which Fields does this Table
    -- have". Joining on key alone matched every Table's Field of the same name.
    select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
      from unnest(custom.io_changed_keys(p_old, p_new)) k
      join custom.applicable_fields(p_organization_id, p_table_id, null) f
        on (f.data ->> 'key') = k
  );
    -- It reads no knob of its own: it is payload for an event the trigger above only writes
    -- after custom.assert_store_door has resolved custom/system_enabled.
end
$function$;

CREATE OR REPLACE FUNCTION custom.organization_references(p_kind text, p_organization_id uuid, p_row jsonb)
 RETURNS TABLE(site text, what text, ref_id uuid, openable boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF / LADDER-PERF's class, on the WRITE path. Everything between `begin`
  -- and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being built
  -- again on every single call.
  return query
    -- THE CENSUS. One row per id the store accepts that must resolve inside the organization.
    -- `openable` marks the one site REC-29's "unless the Table allows it" can open.
    --
    -- custom.record — the Table a record belongs to.
    select 'table_id', 'the table this record belongs to',
           nullif(p_row ->> 'table_id', '')::uuid, false
     where p_kind = 'custom.record'
  
    union all
    -- custom.record — the two ends of a relation row (REC-26). THE OPENABLE SITE.
    select 'data.' || e.k, case e.k when 'from' then 'the record this relation starts at'
                                    else 'the record this relation points at' end,
           nullif(p_row -> 'data' ->> e.k, '')::uuid, true
      from (values ('from'), ('to')) e(k)
     where p_kind = 'custom.record' and p_row ->> 'data_class' = 'relation'
  
    union all
    -- custom.record — a Field's declared relation target (FLD-13), and a list Field's options
    -- Table (FLD-5), and the Table a Field defines (FLD-8).
    select 'data.' || e.k, e.w, nullif(p_row -> 'data' ->> e.k, '')::uuid, false
      from (values ('relation_target',      'the table this relation field points at'),
                   ('entity_definition_id', 'the table this field belongs to'),
                   ('scope_table_id',       'the table this rule is about'),
                   ('target_field_id',      'the field this rule works out'),
                   ('rule_id',              'the rule this merge field uses')) e(k, w)
     where p_kind = 'custom.record'
  
    union all
    select 'data.config.options_table_id', 'the table this list field takes its choices from',
           nullif(p_row -> 'data' -> 'config' ->> 'options_table_id', '')::uuid, false
     where p_kind = 'custom.record'
  
    union all
    -- custom.record — every Field a Rule's expression reaches for, by id (REC-17).
    select 'data.expr.field', 'a field this rule reads', (l ->> 'field')::uuid, false
      from jsonb_path_query(coalesce(p_row -> 'data' -> 'expr', '{}'::jsonb),
                            '$.**{0 to 12} ? (exists(@.field))') l
     where p_kind = 'custom.record'
       and jsonb_typeof(l -> 'field') = 'string'
       and (l ->> 'field') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  
    union all
    -- custom.external_link — the stub Record it stands for and the source it came from.
    select 'record_id', 'the record this external link stands for',
           nullif(p_row ->> 'record_id', '')::uuid, false
     where p_kind = 'custom.external_link'
    union all
    select 'source_id', 'the external source this link came from',
           nullif(p_row ->> 'source_id', '')::uuid, false
     where p_kind = 'custom.external_link';
    -- custom.external_source carries no reference into the store: its columns are the
    -- connection token, the foreign schema and table, and the link template. It is listed here
    -- in words rather than omitted, so the next reader knows it was looked at.
end
$function$;

CREATE OR REPLACE FUNCTION custom.query_is_store_owner()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF / LADDER-PERF's class, on the WRITE path. Everything between `begin`
  -- and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being built
  -- again on every single call.
  return (
    select pg_has_role(custom.caller_role(),
                       (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                       'member')
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_carrying_edges(p_id uuid, p_data_class text, p_data jsonb, p_deleted_at timestamp with time zone)
 RETURNS TABLE(container_id uuid, item_id uuid, edge_role text)
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
    -- arm 1 — REC-7 / REC-14: the parent IS the containment edge, and there is at most one.
    select custom.containment_parent(p_data), p_id, 'contains'::text
    where p_deleted_at is null
      and p_id is not null
      and custom.containment_parent(p_data) is not null
    union all
    -- arm 2 — REC-26 / REL-6: a referenced CARRYING relation reaches what it points at, so the
    -- `from` end is the container and the `to` end is the item. Its declared role is honoured
    -- when `custom.carrying_rule` knows it (that table is what decides how much a role conveys);
    -- a role nobody declared falls back to `references`, the rule for a plain referenced
    -- relation, rather than producing an edge `custom.carrying_edges` would drop in silence.
    select (p_data ->> 'from')::uuid,
           (p_data ->> 'to')::uuid,
           case
             when exists (select 1 from custom.carrying_rule cr
                           where cr.role = (p_data ->> 'role') and cr.is_active)
               then p_data ->> 'role'
             else 'references'
           end
    where p_deleted_at is null
      and p_data_class = 'relation'
      and coalesce((p_data ->> 'carrying')::boolean, false)
      and coalesce(p_data ->> 'kind', 'referenced') <> 'owned'
      and p_data ->> 'from' is not null
      and p_data ->> 'to' is not null;
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION iam.has_org_access(p_org uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 5000
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF / LADDER-PERF's class, on the WRITE path. Everything between `begin`
  -- and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being built
  -- again on every single call.
  return (
    SELECT iam.has_org_access_for((SELECT auth.uid()), p_org)
  );
end
$function$;

CREATE OR REPLACE FUNCTION platform.is_provisioning()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF / LADDER-PERF's class, on the WRITE path. Everything between `begin`
  -- and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being built
  -- again on every single call.
  return (
    -- pg_current_xact_id_if_assigned() (never pg_current_xact_id()) so a read-only
    -- transaction is not forced to burn a transaction id just to answer "no".
    select coalesce(
             (select m.active
                from platform.provision_marker m
               where m.txid = pg_current_xact_id_if_assigned()),
             false)
  );
end
$function$;
