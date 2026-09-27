-- chair-step: lane CARRYING-EDGES-PERF — adds two partial btree indexes on platform.associations (live rows only), built CONCURRENTLY, so no write on the table ever waits for them. Its only DROPs are 'drop index concurrently if exists' of these same two names, so a rerun rebuilds an INVALID leftover of a cancelled build instead of skipping it; no data is touched.
-- lane: CARRYING-EDGES-PERF
-- AUTOCOMMIT FILE: CREATE INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.
--
-- CARRYING-EDGES-PERF — THE CARRYING EDGES OF ONE ORGANIZATION ARE FOUND WITHOUT READING ALL OF ITS
-- ASSOCIATIONS.
--
-- `custom.carrying_edges_in(organization)` is the edge set the store's two set-shaped carrying
-- questions walk (`custom.read_door_carried_ids`, the read door's containment pass, and
-- `custom.table_has_a_visible_record`, arm 4 of the one ladder for a Table row). Its only way to an
-- organization's associations was `idx_assoc_org (organization_id)`: every association of the
-- organization read, then joined to the rules. Measured on production 2026-09-27, admin's
-- Workspace: 29,409 associations read, twice (arm 1 and arm 2), to return 4,061 edges — 20,721 of
-- those rows are media-library links no rule carries. 35 ms per call planned with the literal,
-- 115–190 ms as the function, reached once per Table row by the ladder and once per (member, Table)
-- by the read door.
--
-- The two indexes let each arm start from its RULES and probe only the associations a rule names:
--   arm 1 (platform.association_types): (organization_id, source_type, target_type)
--   arm 2 (custom.carrying_rule, by role): (organization_id, role)
-- both partial on `deleted_at is null`, which every arm already requires. The body that uses them
-- is the sibling file `carryingedgesperf_a_record_walk_reads_only_the_edges_that_reach_a_record.sql`,
-- applied AFTER this one.
--
-- INVERSE: migrations/inverse/carryingedgesperf_the_carrying_edges_have_their_indexes_down.sql
--
-- RE-RUNNABLE WITHOUT A SILENT INVALID INDEX (the GUARDS-GREEN pattern). A CONCURRENTLY build
-- cancelled mid-way leaves an INVALID index behind, and `if not exists` would then skip it forever.
-- So each index is dropped (concurrently, if it exists) and built again, and the last statement
-- refuses the file unless both are valid.

drop index concurrently if exists platform.idx_assoc_org_pair_live;
create index concurrently idx_assoc_org_pair_live
  on platform.associations (organization_id, source_type, target_type)
  where deleted_at is null;

drop index concurrently if exists platform.idx_assoc_org_role_live;
create index concurrently idx_assoc_org_role_live
  on platform.associations (organization_id, role)
  where deleted_at is null;

do $check$
declare v_bad text;
begin
  select string_agg(w.n, ', ') into v_bad
    from (values ('idx_assoc_org_pair_live'), ('idx_assoc_org_role_live')) w(n)
    left join pg_catalog.pg_class c
      on c.relname = w.n and c.relkind = 'i'
     and c.relnamespace = 'platform'::regnamespace
    left join pg_catalog.pg_index i on i.indexrelid = c.oid
   where i.indisvalid is not true or i.indisready is not true;
  if v_bad is not null then
    raise exception 'carryingedgesperf indexes not valid: % — re-run the file', v_bad;
  end if;
end
$check$;
