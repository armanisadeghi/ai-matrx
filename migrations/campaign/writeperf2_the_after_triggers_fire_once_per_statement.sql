-- additive: yes
--
-- chair-step: it DROPS seven row-level triggers on `custom.record` and creates thirteen
--   statement-level ones in their place. Every trigger function it creates is NEW (nothing is
--   replaced, so no `-- based-on:` line can exist for one), and the seven row-level bodies are
--   left in the catalogue untouched — `platform._gc_entity_associations` is still the live
--   per-row body on every other table that uses it. A `-- guard:` line would be a comment
--   pretending to be a switch: these triggers ARE the write path. The inverse is
--   `migrations/inverse/writeperf2_the_after_triggers_fire_once_per_statement_down.sql` and it
--   puts all seven row-level triggers back exactly as `pg_get_triggerdef` held them.
--
-- WRITE-PERF-2 — THE AFTER-ROW TRIGGERS ON `custom.record` FIRE ONCE PER STATEMENT.
--
-- WHAT WAS MEASURED, ON THE MAIN DATABASE, 2026-09-20 (EXPLAIN ANALYZE of ONE 200-row insert
-- into `custom.record`, a throwaway organization with an Accounts Table of 10 and a Deals Table
-- of six typed columns — text, currency, datetime, select, member, relation):
--
--     zz_w2a_relation_association    912.8 ms / 200 = 4.56 ms PER ROW
--     io_record_changed              473.2 ms / 200 = 2.37 ms PER ROW
--     zzz_history_capture            119.9 ms / 200 = 0.60 ms PER ROW
--     zz_ckl_watch                    50.9 ms / 200 = 0.25 ms PER ROW
--     zz_w2_containment_association   37.5 ms / 200 = 0.19 ms PER ROW
--                                                     ────────────────
--                                     8.0 ms PER ROW of AFTER-ROW work, on every single write
--
-- Not one of them asks anything that needs the row to be alone. Each is now ONE set-based
-- statement over `REFERENCING OLD TABLE / NEW TABLE`, producing the same history rows, the same
-- outbox rows and the same edges.
--
-- THE THIRTEEN, AND WHY THE NAMES CARRY A SUFFIX. A trigger with transition tables may name
-- exactly ONE event, so each of the old multi-event triggers becomes one trigger per event.
-- Postgres fires triggers in NAME order, so every new name is the old one plus `_s_i` / `_s_u` /
-- `_s_d` (`_s` for the two single-event ones): appending the same suffix to every name keeps the
-- ORDER among them identical to what it was.
--
--     io_record_changed              -> io_record_changed_s_i / _s_u / _s_d
--     zz_ckl_watch                   -> zz_ckl_watch_s_i / _s_u
--     zz_w2_containment_association  -> zz_w2_containment_association_s_i / _s_u
--     zz_w2a_relation_association    -> zz_w2a_relation_association_s_i / _s_u
--     zzz_history_capture            -> zzz_history_capture_s_i / _s_u / _s_d
--     _gc_assoc_softdelete           -> _gc_assoc_softdelete_s
--     _gc_assoc_harddelete           -> _gc_assoc_harddelete_s
--
-- TWO AFTER-ROW TRIGGERS STAY ROW-LEVEL, ON PURPOSE, AND THE REASON IS NAMED HERE RATHER THAN
-- LEFT FOR SOMEBODY TO WONDER ABOUT:
--   * `zzz_pipelines_on_entry` (`custom._pipeline_on_entry`) — it is lane PIPELINES's object,
--     they hold `campaign_watch.build_lock` row `PIPELINES` for it RIGHT NOW and are editing its
--     writer context; converting it would either revert their work or be reverted by it. It
--     costs 9.8 ms per 200 rows (0.05 ms/row), which is 0.6% of what this file takes out.
--   * `custom_record_field_type_converts_values` (`custom._field_type_converts_values`) — it
--     fires only when a FIELD record's own behaviour changes, rewrites the values of the Table
--     that Field defines, and records ONE `history.migration_log` row for that ONE Field. A
--     statement is never more than a handful of Field rows, so there is nothing to amortise.
--
-- THE TWO ORDER CHANGES THIS MAKES, STATED:
--   1. Postgres runs ALL row-level AFTER triggers of a statement before ANY statement-level
--      one. So on a write that is also a pipeline entry, `zzz_pipelines_on_entry` (still
--      row-level) now runs BEFORE the outbox and the history capture instead of after them.
--      Both still run, in the same transaction, over the same rows; what moves is the order of
--      the two events in `custom.io_outbox` when a pipeline effect writes back to the record.
--   2. Across the rows of ONE multi-row statement, the work is now grouped by concern rather
--      than interleaved per row: every row's outbox event, then every row's checklist, then
--      every row's edges, then every row's history. Within each concern the rows are taken in
--      `id` order, and the contract the readers hold — ONE version per row per statement, one
--      event per row per statement, the operation names unchanged, `changed_field_ids` the same
--      ids — is unchanged. Every single-row statement, which is what every door except
--      `custom.record_write_many` issues, is byte-identical.
--
-- PARITY: `scripts/campaign-tests/writeperf2_parity.sql` — 2,000 records written through the
-- batched door with these triggers, then the REAL BYTES of this lane's inverses inside the SAME
-- transaction on ONE snapshot, then the same 2,000 again with the row-level triggers back, with
-- every history row, every outbox row and every record envelope compared.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. HISTORY CAPTURE — one version per row per statement, in one INSERT.
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION history.record_capture_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_mig  uuid;
  v_verb text;
  v_n    integer;
begin
  -- MERGE-HISTORY: WHAT THIS WRITE WAS FOR. `history.migration_record` marks the statement a
  -- compound verb runs in; the mark is honoured only while `statement_timestamp()` still
  -- matches, so it belongs to that verb's call and to nothing that runs after it. It is read
  -- ONCE here rather than once per row, which is the same read: the mark cannot change inside
  -- one statement, because the fence IS the statement.
  if nullif(current_setting('history.mark_at', true), '') = statement_timestamp()::text then
    v_mig  := nullif(current_setting('history.mark_id', true), '')::uuid;
    v_verb := nullif(current_setting('history.mark_verb', true), '');
  end if;

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier,
          migration_id, operation_name)
  select 'custom.record',
         n.id,
         n.organization_id,
         coalesce(n.version, 1),
         'INSERT',
         to_jsonb(n),
         coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
         platform.actor_tier(),
         v_mig,
         v_verb
    from new_rows n
   -- THE GUARD, through the one predicate (see history.capture_is_open), asked per organization
   -- exactly as the row trigger asked it per row. An AFTER trigger on a write the BEFORE
   -- triggers already admitted must never raise, so the refusal is read as a boolean.
   where history.capture_is_open(n.organization_id)
   order by n.id;
  get diagnostics v_n = row_count;

  -- The window opens on the first row actually recorded, never on the apply. A replay can
  -- then tell "nothing happened" from "nobody was watching".
  if v_n > 0 then
    insert into history.capture_window (entity_type, note)
    values ('custom.record', 'HIS-1/HIS-7: W3-HIST''s capture on custom.record — Values and structure in one store')
    on conflict (entity_type) do nothing;
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION history.record_capture_stmt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_mig  uuid;
  v_verb text;
  v_n    integer;
begin
  if nullif(current_setting('history.mark_at', true), '') = statement_timestamp()::text then
    v_mig  := nullif(current_setting('history.mark_id', true), '')::uuid;
    v_verb := nullif(current_setting('history.mark_verb', true), '');
  end if;

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier,
          migration_id, operation_name)
  select 'custom.record',
         n.id,
         n.organization_id,
         coalesce(n.version, 1),
         -- REC-23's soft delete and its undo are distinguishable operations in the store, or
         -- "who deleted this and when did it come back" is unanswerable.
         case
           when n.deleted_at is not null and o.deleted_at is null then 'SOFT_DELETE'
           when n.deleted_at is null and o.deleted_at is not null then 'RESTORE'
           else 'UPDATE'
         end,
         to_jsonb(n),
         coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
         platform.actor_tier(),
         v_mig,
         v_verb
    from new_rows n
    join old_rows o
      on o.organization_id = n.organization_id and o.id = n.id
   where history.capture_is_open(n.organization_id)
     -- The contentless-update guard, the same one platform._version_capture applies: a
     -- snapshot identical to its predecessor in everything but the bookkeeping columns is
     -- not a version of anything. HIS-1 is "nothing can opt out of being RECORDED", not
     -- "every statement writes a row whether or not it changed anything". The `v_op = 'UPDATE'`
     -- arm of the row trigger is exactly "neither a soft delete nor a restore", which is what
     -- the two deleted_at tests below say.
     and not ((n.deleted_at is null) = (o.deleted_at is null)
              and (to_jsonb(n) - 'version' - 'updated_at' - 'updated_by')
                  is not distinct from (to_jsonb(o) - 'version' - 'updated_at' - 'updated_by'))
   order by n.id;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into history.capture_window (entity_type, note)
    values ('custom.record', 'HIS-1/HIS-7: W3-HIST''s capture on custom.record — Values and structure in one store')
    on conflict (entity_type) do nothing;
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION history.record_capture_stmt_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_mig  uuid;
  v_verb text;
  v_n    integer;
begin
  if nullif(current_setting('history.mark_at', true), '') = statement_timestamp()::text then
    v_mig  := nullif(current_setting('history.mark_id', true), '')::uuid;
    v_verb := nullif(current_setting('history.mark_verb', true), '');
  end if;

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier,
          migration_id, operation_name)
  select 'custom.record', o.id, o.organization_id, coalesce(o.version, 1), 'DELETE', to_jsonb(o),
         coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
         platform.actor_tier(), v_mig, v_verb
    from old_rows o
   where history.capture_is_open(o.organization_id)
   order by o.id;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into history.capture_window (entity_type, note)
    values ('custom.record', 'HIS-1/HIS-7: W3-HIST''s capture on custom.record — Values and structure in one store')
    on conflict (entity_type) do nothing;
  end if;

  return null;
end;
$function$;
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE OUTBOX — one event per row per statement, in one INSERT.
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid;
begin
  -- THE ONE DOOR PREDICATE, and it IS the guard this file is headed with:
  -- `custom.assert_store_door` resolves `custom/system_enabled` through `custom.store_is_open`,
  -- so while that knob is false this trigger — like every other door in the store — takes
  -- writes only from the role that owns `custom.record`. The row trigger asked it once per row
  -- about that row's organization; this asks it once per organization in the statement, which
  -- is the same question and the same refusal.
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key)
  select n.organization_id, 'records.changed', n.id, n.table_id, 'created',
         -- WHICH FIELDS MOVED — ASKED ONLY WHEN SOMETHING MOVED, exactly as the row trigger
         -- asks it. On an INSERT the old side is '{}' because tg_op is not UPDATE.
         case when coalesce(array_length(custom.io_changed_keys('{}'::jsonb, n.data), 1), 0) = 0
              then '[]'::jsonb
              else custom.io_changed_field_ids(n.organization_id, n.table_id,
                     '{}'::jsonb, coalesce(n.data, '{}'::jsonb)) end,
         jsonb_build_object(
           'user_id',   custom.query_principal(),
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  coalesce(n.data, '{}'::jsonb) ->> '_actor'),
         n.organization_id::text || ':' || n.id::text || ':' || coalesce(n.version, 0)::text || ':created'
    from new_rows n
   order by n.id
  on conflict do nothing;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key)
  select n.organization_id, 'records.changed', n.id, n.table_id, k.op,
         -- The row trigger's `v_changed`, character for character: `[]` when no key moved,
         -- otherwise the field ids of (old.data -> new.data) — the old side is `old.data`
         -- whenever tg_op is UPDATE, which is every row here, including the restore arm.
         case when coalesce(array_length(k.keys, 1), 0) = 0
              then '[]'::jsonb
              else custom.io_changed_field_ids(n.organization_id, n.table_id,
                     o.data, coalesce(n.data, '{}'::jsonb)) end,
         jsonb_build_object(
           'user_id',   custom.query_principal(),
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  coalesce(n.data, o.data) ->> '_actor'),
         n.organization_id::text || ':' || n.id::text || ':' ||
           coalesce(n.version, o.version, 0)::text || ':' || k.op
    from new_rows n
    join old_rows o
      on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral (
      select
        -- A soft delete is a DELETE to everyone downstream. An automation that fired "updated"
        -- when a record disappeared would be lying in the one case people notice.
        case when n.deleted_at is not null and o.deleted_at is null then 'deleted'
             when o.deleted_at is not null and n.deleted_at is null then 'created'
             else 'updated' end as op,
        case when n.deleted_at is not null and o.deleted_at is null then array[]::text[]
             when o.deleted_at is not null and n.deleted_at is null
               then custom.io_changed_keys('{}'::jsonb, n.data)
             else custom.io_changed_keys(o.data, n.data) end as keys) k
   -- NO VALUE MOVED, so there is no event. Asked of the KEYS, never of the resolved Field ids.
   where not (k.op = 'updated'
              and coalesce(array_length(k.keys, 1), 0) = 0
              and o.deleted_at is not distinct from n.deleted_at)
   order by n.id
  on conflict do nothing;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid;
begin
  for v_org in select distinct o.organization_id from old_rows o loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key)
  select o.organization_id, 'records.changed', o.id, o.table_id, 'deleted',
         -- On a delete `v_keys` is empty by construction, so the answer is `[]` whatever the
         -- join would have done — and asking anyway made a deletion event depend on the caller
         -- still being allowed to READ the Table.
         '[]'::jsonb,
         jsonb_build_object(
           'user_id',   custom.query_principal(),
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  o.data ->> '_actor'),
         o.organization_id::text || ':' || o.id::text || ':' || coalesce(o.version, 0)::text || ':deleted'
    from old_rows o
   order by o.id
  on conflict do nothing;

  return null;
end;
$function$;
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE CONTAINMENT EDGE (VIS-FIX's) — withdraw, revive, write; once per statement.
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom._containment_association_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_named boolean := false;
begin
  -- `platform._stamp_actor_tier` refuses an automated write that names no system, and it is
  -- right to: "an AI did it" with no name is not provenance. The edge names ITSELF as the
  -- system and the row says so — announced in the data, never swallowed. Once per statement
  -- now; it was once per row, and the value written was the same every time.
  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('ai', 'code') then
    perform set_config('app.actor_system', 'custom.containment', true);
    v_named := true;
  end if;

  -- BRING BACK a tombstoned edge this row declares again. Its own UPDATE rather than an
  -- `on conflict do update`, because `platform.revive_tombstoned_association` is a BEFORE
  -- INSERT trigger that un-tombstones the very row the ON CONFLICT clause then targets and
  -- Postgres refuses that as "cannot affect row a second time".
  update platform.associations a
     set deleted_at       = null,
         deleted_via_type = null,
         deleted_via_id   = null
    from new_rows n
   where a.deleted_at is not null
     and a.source_type = 'record'
     and a.target_type = 'record'
     and (a.source_id, a.target_id, a.role) in (
           select e.container_id, e.item_id, e.edge_role
             from custom.record_carrying_edges(n.id, n.data_class, n.data, n.deleted_at) e);

  -- WRITE what it declares now.
  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id)
  select 'record', e.container_id, 'record', e.item_id, e.edge_role, n.organization_id
    from new_rows n
    cross join lateral custom.record_carrying_edges(n.id, n.data_class, n.data, n.deleted_at) e
   order by n.id
  on conflict (source_type, source_id, target_type, target_id, role) do nothing;

  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._containment_association_stmt_update()
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
    perform set_config('app.actor_system', 'custom.containment', true);
    v_named := true;
  end if;

  -- WITHDRAW what a row used to declare and no longer does (a reparent, a relation repointed,
  -- a parent removed). `deleted_via_*` is deliberately NOT stamped: this is not a trashing, so
  -- `platform._gc_entity_associations`'s restore must not bring it back. The row trigger's
  -- "nothing that can move an edge moved" early return is the NOT(...) join predicate here.
  update platform.associations a
     set deleted_at = now()
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.deleted_at is not distinct from n.deleted_at)
     and a.deleted_at is null
     and a.source_type = 'record'
     and a.target_type = 'record'
     and (a.source_id, a.target_id, a.role) in (
           select e.container_id, e.item_id, e.edge_role
             from custom.record_carrying_edges(o.id, o.data_class, o.data, o.deleted_at) e)
     and (a.source_id, a.target_id, a.role) not in (
           select e.container_id, e.item_id, e.edge_role
             from custom.record_carrying_edges(n.id, n.data_class, n.data, n.deleted_at) e);

  update platform.associations a
     set deleted_at       = null,
         deleted_via_type = null,
         deleted_via_id   = null
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.deleted_at is not distinct from n.deleted_at)
     and a.deleted_at is not null
     and a.source_type = 'record'
     and a.target_type = 'record'
     and (a.source_id, a.target_id, a.role) in (
           select e.container_id, e.item_id, e.edge_role
             from custom.record_carrying_edges(n.id, n.data_class, n.data, n.deleted_at) e);

  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id)
  select 'record', e.container_id, 'record', e.item_id, e.edge_role, n.organization_id
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral custom.record_carrying_edges(n.id, n.data_class, n.data, n.deleted_at) e
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.deleted_at is not distinct from n.deleted_at)
   order by n.id
  on conflict (source_type, source_id, target_type, target_id, role) do nothing;

  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;
  return null;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE RELATION EDGES — the single largest AFTER-ROW item on the write path.
-- ─────────────────────────────────────────────────────────────────────────────────────────

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
$function$;

CREATE OR REPLACE FUNCTION custom._relation_associations_stmt_update()
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
     set deleted_at = now()
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.table_id   is not distinct from n.table_id
              and o.deleted_at is not distinct from n.deleted_at)
     and a.deleted_at is null
     and a.source_type = 'record'
     and a.source_id = o.id
     and a.relation_field_id is not null
     and (a.target_id, a.role) in (
           select e.target_id, e.edge_role
             from custom.record_relation_edges(o.organization_id, o.id, o.table_id,
                                               o.data_class, o.data, o.deleted_at) e)
     and (a.target_id, a.role) not in (
           select e.target_id, e.edge_role
             from custom.record_relation_edges(n.organization_id, n.id, n.table_id,
                                               n.data_class, n.data, n.deleted_at) e);

  update platform.associations a
     set deleted_at        = null,
         deleted_via_type  = null,
         deleted_via_id    = null,
         relation_field_id = e.field_id,
         "position"        = e.ord
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral custom.record_relation_edges(n.organization_id, n.id, n.table_id,
                                                    n.data_class, n.data, n.deleted_at) e
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.table_id   is not distinct from n.table_id
              and o.deleted_at is not distinct from n.deleted_at)
     and a.deleted_at is not null
     and a.source_type = 'record'
     and a.source_id = n.id
     and a.target_id = e.target_id
     and a.role = e.edge_role;

  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id,
     relation_field_id, "position")
  select 'record', n.id, 'record', e.target_id, e.edge_role, n.organization_id,
         e.field_id, e.ord
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral custom.record_relation_edges(n.organization_id, n.id, n.table_id,
                                                    n.data_class, n.data, n.deleted_at) e
   where not (o.data       is not distinct from n.data
              and o.data_class is not distinct from n.data_class
              and o.table_id   is not distinct from n.table_id
              and o.deleted_at is not distinct from n.deleted_at)
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
$function$;
CREATE OR REPLACE FUNCTION custom._checklist_watch_for(p_op text, p_old custom.record, p_new custom.record)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tpl    uuid;
  v_run    uuid;
  v_left   integer;
  v_closed text;
  v_status text;
  v_want   text;
begin
  if p_new.data_class <> 'record' or p_new.deleted_at is not null then
    return;
  end if;

  -- A STEP OF A RUN. Its status just moved, so the run may have just finished — or may have
  -- just re-opened, because somebody pulled a done step back to In progress.
  if p_new.data ? 'run_id' then
    if p_op = 'UPDATE'
       and nullif(p_new.data ->> 'status', '') is distinct from nullif(p_old.data ->> 'status', '') then
      v_run := nullif(p_new.data ->> 'run_id', '')::uuid;
      select count(*)::integer into v_left
        from custom.record s
       where s.organization_id = p_new.organization_id
         and s.deleted_at is null
         and s.data_class = 'record'
         and nullif(s.data ->> 'run_id', '')::uuid = v_run
         and not custom._checklist_finished(p_new.organization_id, s.table_id, s.data ->> 'status');
      v_closed := case when v_left = 0
                       then to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end;
      update custom.record r
         set data = r.data || jsonb_build_object('closed_at', v_closed)
       where r.organization_id = p_new.organization_id
         and r.id = v_run
         and r.data_class = 'checklist_run'
         and r.deleted_at is null
         and coalesce(r.data ->> 'closed_at', '') is distinct from coalesce(v_closed, '');
    end if;
    return;
  end if;

  if p_new.table_id is null then
    return;
  end if;
  if p_op = 'UPDATE'
     and nullif(p_new.data ->> 'status', '') is not distinct from nullif(p_old.data ->> 'status', '') then
    return;
  end if;

  for v_tpl in
    select c.id
      from custom.record c
     where c.organization_id = p_new.organization_id
       and c.data_class = 'checklist_template'
       and c.deleted_at is null
       and (c.data #>> '{trigger,table_id}') = p_new.table_id::text
       and coalesce(c.data #>> '{trigger,kind}', 'manual')
           = case when p_op = 'INSERT' then 'record_created' else 'status_reached' end
  loop
    if p_op = 'UPDATE' then
      select s.data ->> 'name' into v_status
        from custom.record s
       where s.organization_id = p_new.organization_id
         and s.id = custom.work_state_id(p_new.organization_id, p_new.table_id, p_new.data ->> 'status');
      select c.data #>> '{trigger,status}' into v_want
        from custom.record c
       where c.organization_id = p_new.organization_id and c.id = v_tpl;
      if coalesce(v_status, '') is distinct from coalesce(v_want, '') then
        continue;
      end if;
    end if;

    -- ONE RUN PER RECORD PER CHECKLIST. A record edited twice does not get onboarded twice.
    if exists (select 1 from custom.record r
                where r.organization_id = p_new.organization_id
                  and r.data_class = 'checklist_run'
                  and r.deleted_at is null
                  and nullif(r.data ->> 'template_id', '')::uuid = v_tpl
                  and nullif(r.data ->> 'about_record_id', '')::uuid = p_new.id) then
      continue;
    end if;

    perform custom._checklist_instantiate(p_new.organization_id, v_tpl, p_new.id, '{}'::jsonb, now(),
                                          case when p_op = 'INSERT' then 'record_created'
                                               else 'status_reached' end);
  end loop;

  return;
end
$function$;

-- `custom._checklist_watch_for` is the ONLY function this file creates that has a direct call
-- surface: the other twelve `RETURNS trigger` and the store's guard excuses those by shape. It
-- runs as the definer, exactly as `custom._checklist_watch` did, so who may call it has to be
-- said IN DATA and not in a comment. NOBODY may call it: it is the row body of a statement
-- trigger and its two arguments are whole `custom.record` rows the trigger hands it from its own
-- transition table, never anything a caller chooses.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', '_checklist_watch_for',
   'p_op text, p_old custom.record, p_new custom.record',
   array['text'::regtype, 'custom.record'::regtype, 'custom.record'::regtype]::oid[],
   'WRITE-PERF-2: the per-row body of the checklist watch, lifted out of custom._checklist_watch unchanged so the statement-level triggers zz_ckl_watch_s_i / _s_u can call it for the rows that can possibly matter. It takes NO entity id: p_old and p_new are whole custom.record rows handed to it by the trigger from its own REFERENCING OLD TABLE / NEW TABLE, and p_op is the trigger operation. There is nothing here for a caller to choose and therefore nothing to check an id against; the access decision was made by the BEFORE-ROW triggers that admitted the write this statement is the AFTER half of.',
   'WRITE-PERF-2',
   'server_only: the statement-level triggers zz_ckl_watch_s_i and zz_ckl_watch_s_u on custom.record are its only callers, and they hand it rows out of their own transition tables. No client ever calls it: schema custom is revoked, it carries no client grant, and a caller who could call it could only hand it rows it already wrote.',
   false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5b. THE CHECKLIST WATCH — the per-row body above, reached only by the rows that can
--     possibly matter. The row trigger asked "does this Table have a template that fires on
--     this operation?" once PER ROW; the statement asks it once per (organization, Table).
--     A row that is neither a step of a run nor covered by a template reached the loop and
--     found nothing, so skipping it changes nothing anybody can observe.
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom._checklist_watch_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r custom.record;
begin
  for r in
    select n.* from new_rows n
     where n.data_class = 'record' and n.deleted_at is null
       and (n.data ? 'run_id'
            or (n.table_id is not null and exists (
                  select 1 from custom.record c
                   where c.organization_id = n.organization_id
                     and c.data_class = 'checklist_template'
                     and c.deleted_at is null
                     and (c.data #>> '{trigger,table_id}') = n.table_id::text
                     and coalesce(c.data #>> '{trigger,kind}', 'manual') = 'record_created')))
     order by n.id
  loop
    perform custom._checklist_watch_for('INSERT', null::custom.record, r);
  end loop;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._checklist_watch_stmt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r record;
begin
  for r in
    select n as nrow, o as orow from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
     where n.data_class = 'record' and n.deleted_at is null
       and (n.data ? 'run_id'
            or (n.table_id is not null and exists (
                  select 1 from custom.record c
                   where c.organization_id = n.organization_id
                     and c.data_class = 'checklist_template'
                     and c.deleted_at is null
                     and (c.data #>> '{trigger,table_id}') = n.table_id::text
                     and coalesce(c.data #>> '{trigger,kind}', 'manual') = 'status_reached')))
     order by n.id
  loop
    perform custom._checklist_watch_for('UPDATE', r.orow, r.nrow);
  end loop;
  return null;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 6. THE EDGE COLLECTOR — `platform._gc_entity_associations` is the ONE generic body on
--    many tables, keyed by its `tg_argv[0]` token, and it is NOT forked here: it stays
--    exactly as it is for every other table. These are its statement-level twins, taking the
--    same token the same way, and only `custom.record`'s two triggers are moved onto them.
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION platform._gc_entity_associations_stmt_harddelete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token       text := tg_argv[0];
  v_key_is_uuid boolean;
begin
  -- 🚨 DD-225. An edge's endpoint is a uuid, so a row whose own `id` is bigint or text can
  -- never be an endpoint and there is nothing here to collect. The skip is a proof, not a
  -- fallback: it is reached only where the sweep is empty by construction.
  select a.atttypid = 'uuid'::regtype
    into v_key_is_uuid
    from pg_catalog.pg_attribute a
   where a.attrelid = tg_relid
     and a.attname  = 'id'
     and a.attnum   > 0
     and not a.attisdropped;
  if v_key_is_uuid is not true then
    return null;
  end if;

  -- A true hard DELETE destroys the edges for good, tombstoned ones included.
  delete from platform.associations x
   using old_rows o
   where (x.source_type = v_token and x.source_id = o.id)
      or (x.target_type = v_token and x.target_id = o.id);
  return null;
end
$function$;

CREATE OR REPLACE FUNCTION platform._gc_entity_associations_stmt_softdelete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token       text := tg_argv[0];
  v_key_is_uuid boolean;
begin
  select a.atttypid = 'uuid'::regtype
    into v_key_is_uuid
    from pg_catalog.pg_attribute a
   where a.attrelid = tg_relid
     and a.attname  = 'id'
     and a.attnum   > 0
     and not a.attisdropped;
  if v_key_is_uuid is not true then
    return null;
  end if;

  -- TRASH: soft-remove every LIVE edge, stamped with the entity that caused it.
  -- Already-tombstoned edges keep their original stamp so the entity that first
  -- removed them is the entity that brings them back.
  update platform.associations x
     set deleted_at       = now(),
         deleted_via_type = v_token,
         deleted_via_id   = n.id
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
   where o.deleted_at is null and n.deleted_at is not null
     and x.deleted_at is null
     and ((x.source_type = v_token and x.source_id = n.id)
       or (x.target_type = v_token and x.target_id = n.id));

  -- RESTORE: bring back exactly what THIS entity's trashing removed. An edge the
  -- user detached before trashing was hard-deleted and is not resurrected.
  update platform.associations x
     set deleted_at       = null,
         deleted_via_type = null,
         deleted_via_id   = null
    from new_rows n
    join old_rows o on o.organization_id = n.organization_id and o.id = n.id
   where o.deleted_at is not null and n.deleted_at is null
     and x.deleted_at is not null
     and x.deleted_via_type = v_token
     and x.deleted_via_id   = n.id;
  return null;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 7. THE SWAP. Seven row-level triggers out, thirteen statement-level ones in, in the order
--    the names give them, which is the order they had.
-- ─────────────────────────────────────────────────────────────────────────────────────────

drop trigger if exists io_record_changed             on custom.record;
drop trigger if exists zz_ckl_watch                  on custom.record;
drop trigger if exists zz_w2_containment_association on custom.record;
drop trigger if exists zz_w2a_relation_association   on custom.record;
drop trigger if exists zzz_history_capture           on custom.record;
drop trigger if exists _gc_assoc_softdelete          on custom.record;
drop trigger if exists _gc_assoc_harddelete          on custom.record;

drop trigger if exists io_record_changed_s_i on custom.record;
create trigger io_record_changed_s_i after insert on custom.record
  referencing new table as new_rows
  for each statement execute function custom.io_record_changed_stmt_insert();

drop trigger if exists io_record_changed_s_u on custom.record;
create trigger io_record_changed_s_u after update on custom.record
  referencing old table as old_rows new table as new_rows
  for each statement execute function custom.io_record_changed_stmt_update();

drop trigger if exists io_record_changed_s_d on custom.record;
create trigger io_record_changed_s_d after delete on custom.record
  referencing old table as old_rows
  for each statement execute function custom.io_record_changed_stmt_delete();

drop trigger if exists zz_ckl_watch_s_i on custom.record;
create trigger zz_ckl_watch_s_i after insert on custom.record
  referencing new table as new_rows
  for each statement execute function custom._checklist_watch_stmt_insert();

drop trigger if exists zz_ckl_watch_s_u on custom.record;
create trigger zz_ckl_watch_s_u after update on custom.record
  referencing old table as old_rows new table as new_rows
  for each statement execute function custom._checklist_watch_stmt_update();

drop trigger if exists zz_w2_containment_association_s_i on custom.record;
create trigger zz_w2_containment_association_s_i after insert on custom.record
  referencing new table as new_rows
  for each statement execute function custom._containment_association_stmt_insert();

drop trigger if exists zz_w2_containment_association_s_u on custom.record;
create trigger zz_w2_containment_association_s_u after update on custom.record
  referencing old table as old_rows new table as new_rows
  for each statement execute function custom._containment_association_stmt_update();

drop trigger if exists zz_w2a_relation_association_s_i on custom.record;
create trigger zz_w2a_relation_association_s_i after insert on custom.record
  referencing new table as new_rows
  for each statement execute function custom._relation_associations_stmt_insert();

drop trigger if exists zz_w2a_relation_association_s_u on custom.record;
create trigger zz_w2a_relation_association_s_u after update on custom.record
  referencing old table as old_rows new table as new_rows
  for each statement execute function custom._relation_associations_stmt_update();

drop trigger if exists zzz_history_capture_s_i on custom.record;
create trigger zzz_history_capture_s_i after insert on custom.record
  referencing new table as new_rows
  for each statement execute function history.record_capture_stmt_insert();

drop trigger if exists zzz_history_capture_s_u on custom.record;
create trigger zzz_history_capture_s_u after update on custom.record
  referencing old table as old_rows new table as new_rows
  for each statement execute function history.record_capture_stmt_update();

drop trigger if exists zzz_history_capture_s_d on custom.record;
create trigger zzz_history_capture_s_d after delete on custom.record
  referencing old table as old_rows
  for each statement execute function history.record_capture_stmt_delete();

-- POSTGRES REFUSES `after update of <column>` WITH TRANSITION TABLES ("transition tables
-- cannot be specified for triggers with column lists"), so this one is `after update` and the
-- column list becomes a VALUE test inside the body. That is the same set of rows and then some:
-- `after update of deleted_at` fires whenever the statement's SET list MENTIONS `deleted_at`,
-- whether or not the value moved, and both arms of the body then need an actual transition
-- (null -> not null, or not null -> null). The body's `o.deleted_at is null and n.deleted_at is
-- not null` / the mirror image are exactly those two transitions, so a statement that mentions
-- the column without moving it does nothing here, as it did nothing before.
drop trigger if exists _gc_assoc_softdelete_s on custom.record;
create trigger _gc_assoc_softdelete_s after update on custom.record
  referencing old table as old_rows new table as new_rows
  for each statement execute function platform._gc_entity_associations_stmt_softdelete('record');

drop trigger if exists _gc_assoc_harddelete_s on custom.record;
create trigger _gc_assoc_harddelete_s after delete on custom.record
  referencing old table as old_rows
  for each statement execute function platform._gc_entity_associations_stmt_harddelete('record');
