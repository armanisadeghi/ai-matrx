-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- READ-PERF — THE TWO INDEXES THE NEW PLAN NEEDS, BUILT WITHOUT BLOCKING A WRITER.
--
-- (1) `custom.record (id)`. `platform.entity_row_access_attrs` — which EVERY arm of the access
--     kernel goes through, for every node of every walk — probes the row it is asked about with
--     `SELECT visibility, created_by, organization_id FROM custom.record WHERE id = $1`: BY ID
--     ALONE, on a table hash-partitioned by `organization_id` whose only unique index is
--     `(organization_id, id)`. Measured on the main database with EXPLAIN (ANALYZE, BUFFERS):
--     one such probe touches ALL SIXTEEN partitions and reads 95 buffers, nine of them by SEQ
--     SCAN because those partitions carry no index the probe can use. At 4,580 rows that is
--     merely wasteful; at 100,000 rows per partition it is a table scan per access question.
--     The function is the platform's, not this campaign's, and it is asked the same way about
--     every token — so the index goes where the cost is, on the partitions.
--
-- (2) `custom.record (organization_id, table_id, visibility) where deleted_at is null`.
--     `custom.visible_set` asks the one ladder once per `platform.visibility` label the Table
--     actually holds, and finds the row to ask about with
--     `… and visibility = $3 and created_by is distinct from $4 limit 1`. Without this index
--     that probe walks the whole (organization, Table) range for every label the Table does NOT
--     hold — three full scans of a 100,000-row Table to learn three times that there is nothing
--     there. With it, each is an index probe that stops at the first entry or none.
--
-- ROUTE B, the promotion layer's own per-partition path (`custom.promoted_index_ddl`): one
-- CONCURRENTLY build per partition, so no writer is blocked for the length of a build.
--
-- THEY ARE PARTITION-LOCAL, WITH NO PARENT INDEX AND NO ATTACH, and that is deliberate: the
-- runners' allow-list does not carry `ALTER INDEX … ATTACH PARTITION`, and a parent index buys
-- nothing here — neither index is unique, so neither needs the partition key, and the planner
-- uses a partition's own index whether or not a parent stands over it. `custom.record` has
-- SIXTEEN hash partitions and the provisioner mints no more, so there is no seventeenth to be
-- forgotten; a partition added later would need its two lines added here, which is what the
-- names say. CONCURRENTLY cannot run inside a transaction block, so this file is an AUTOCOMMIT
-- file and runs through aidream's runner:
--   uv run python db/apply_migrations.py --source campaign \
--     --only readperf_the_page_scan_has_its_indexes.sql --target production --lane READ-PERF

create index concurrently if not exists record_id_rp_00 on custom.record_p00 (id);
create index concurrently if not exists record_id_rp_01 on custom.record_p01 (id);
create index concurrently if not exists record_id_rp_02 on custom.record_p02 (id);
create index concurrently if not exists record_id_rp_03 on custom.record_p03 (id);
create index concurrently if not exists record_id_rp_04 on custom.record_p04 (id);
create index concurrently if not exists record_id_rp_05 on custom.record_p05 (id);
create index concurrently if not exists record_id_rp_06 on custom.record_p06 (id);
create index concurrently if not exists record_id_rp_07 on custom.record_p07 (id);
create index concurrently if not exists record_id_rp_08 on custom.record_p08 (id);
create index concurrently if not exists record_id_rp_09 on custom.record_p09 (id);
create index concurrently if not exists record_id_rp_10 on custom.record_p10 (id);
create index concurrently if not exists record_id_rp_11 on custom.record_p11 (id);
create index concurrently if not exists record_id_rp_12 on custom.record_p12 (id);
create index concurrently if not exists record_id_rp_13 on custom.record_p13 (id);
create index concurrently if not exists record_id_rp_14 on custom.record_p14 (id);
create index concurrently if not exists record_id_rp_15 on custom.record_p15 (id);

create index concurrently if not exists record_org_table_vis_rp_00 on custom.record_p00 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_01 on custom.record_p01 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_02 on custom.record_p02 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_03 on custom.record_p03 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_04 on custom.record_p04 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_05 on custom.record_p05 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_06 on custom.record_p06 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_07 on custom.record_p07 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_08 on custom.record_p08 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_09 on custom.record_p09 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_10 on custom.record_p10 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_11 on custom.record_p11 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_12 on custom.record_p12 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_13 on custom.record_p13 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_14 on custom.record_p14 (organization_id, table_id, visibility) where deleted_at is null;
create index concurrently if not exists record_org_table_vis_rp_15 on custom.record_p15 (organization_id, table_id, visibility) where deleted_at is null;
