-- autocommit: yes
--
-- chair-step: it builds an index on `history.row_versions`, which is 7,095 MB across 29
--   partitions. Every statement is CREATE INDEX CONCURRENTLY, so no partition is locked
--   against writes, but it is a long job on a large live relation and it must therefore run
--   inside the 1-4 AM Pacific maintenance window (Arman, 2026-09-21: "Anything that is
--   routine and big should only run between 1AM and 4AM Pacific time"). It adds an index and
--   changes nothing else: no body, no grant, no policy, no row.
--
-- RED-SUITES-2 — A BRAND-NEW ORGANIZATION'S FIRST MIGRATION VERB SCANS SEVEN GIGABYTES.
--
-- MEASURED on the MAIN database on 2026-09-21 through `scripts/campaign-tests/storet_red.sql`,
-- which died on the 60-second ceiling this lane gave every suite earlier today:
--
--   ERROR: canceling statement due to statement timeout
--   CONTEXT: SQL statement "select max(v.id) from history.row_versions v
--             where v.entity_type = 'custom.record' and v.organization_id = p_organization_id"
--            PL/pgSQL function history.migration_record(uuid,text,text,uuid,jsonb,text) line 30
--
-- `history.migration_record` is called by EVERY Migration verb — rename, retype, merge, delete,
-- reparent, split — and that is its first statement. The plan is a Merge Append over all 29
-- partitions, each an Index Scan Backward on the primary key `(id, occurred_at)` with
-- `entity_type` and `organization_id` as a FILTER, stopping at the first match:
--
--   Result  (cost=10326.29..10326.30 rows=1)
--     InitPlan 1
--       ->  Limit  (cost=6.42..10326.29 rows=1)
--             ->  Merge Append  (cost=6.42..712077.82 rows=69)
--                   Sort Key: v.id DESC
--                   ->  Index Scan Backward using row_versions_2025_11_pkey …
--                         Filter: ((entity_type = 'custom.record') AND (organization_id = …))
--                   … 29 partitions …
--
-- 🚨 SO IT IS FAST FOR AN ORGANIZATION THAT HAS HISTORY AND PATHOLOGICAL FOR ONE THAT DOES NOT.
-- With a match near the end of the table the Limit stops almost at once. With NO match it must
-- read every row of every partition backwards before it can answer "none" — the whole 7 GB.
-- "An organization with no history yet" is not an edge case: it is every new customer's first
-- minutes, and every disposable fixture every suite in this campaign creates. A real person's
-- FIRST rename of a record, on their first day, is the slowest this query will ever be.
--
-- There is NO index on `organization_id` anywhere on this table or its 29 partitions — checked:
--   select count(*) from pg_indexes where schemaname='history'
--    and tablename like 'row_versions%' and indexdef ilike '%organization_id%';   ->  0
--
-- WHY NOBODY SAW IT: the suites used to give themselves up to 600-second statement ceilings, so
-- this scan finished inside the budget and only looked slow. AUTH-504's fixture ceilings —
-- landed by this lane earlier today, 60s statements and 10s lock waits across all 174 suites —
-- are what turned a slow query into a failing one. The ceiling doing exactly its job.
--
-- THE FIX is the canonical shape for an equality-plus-max query: `(entity_type,
-- organization_id, id desc)` turns both cases into a single index probe. It is additive;
-- no plan that works today gets worse.
--
-- ITS INVERSE: `migrations/inverse/redsuites2_a_new_organizations_first_migration_verb_down.sql`.
--
-- HOW TO APPLY (autocommit, so NOT `pnpm db:apply` — that runner refuses CONCURRENTLY by name):
--   cd aidream && uv run python db/apply_migrations.py \
--     --only redsuites2_a_new_organizations_first_migration_verb.sql --source matrx-frontend
-- IN THE 1-4 AM PACIFIC WINDOW, and nowhere else.
--
-- 🚨 NIGHT-SWEEP 2026-09-21: THIS FILE COULD NOT HAVE SUCCEEDED AS WRITTEN. The 29 `alter index`
-- statements named `rv_org_latest_idx` and each partition index UNQUALIFIED. The parent index is
-- created in schema `history` (it follows its table), which is not on the runner's search_path, so
-- statement 31 of 59 died with `relation "rv_org_latest_idx" does not exist` — AFTER statements
-- 1..30 had already committed under autocommit: 29 indexes built and NO ledger row. Caught by
-- rehearsing on the branch, which is exactly what the rehearsal is for. Every `alter index` is now
-- schema-qualified on BOTH names (the inverse file was already qualified, which is what gave it
-- away). Re-run on the branch: ok (12.15s) executed sha256 413b564fa16c, ledger verified.

-- 1. One index per partition, CONCURRENTLY, so no partition is ever locked against writes.
create index concurrently if not exists row_versions_2025_11_org_latest_idx
  on history.row_versions_2025_11 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2025_12_org_latest_idx
  on history.row_versions_2025_12 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_01_org_latest_idx
  on history.row_versions_2026_01 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_02_org_latest_idx
  on history.row_versions_2026_02 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_03_org_latest_idx
  on history.row_versions_2026_03 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_04_org_latest_idx
  on history.row_versions_2026_04 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_05_org_latest_idx
  on history.row_versions_2026_05 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_06_org_latest_idx
  on history.row_versions_2026_06 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_07_org_latest_idx
  on history.row_versions_2026_07 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_08_org_latest_idx
  on history.row_versions_2026_08 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_09_org_latest_idx
  on history.row_versions_2026_09 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_10_org_latest_idx
  on history.row_versions_2026_10 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_11_org_latest_idx
  on history.row_versions_2026_11 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2026_12_org_latest_idx
  on history.row_versions_2026_12 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_01_org_latest_idx
  on history.row_versions_2027_01 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_02_org_latest_idx
  on history.row_versions_2027_02 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_03_org_latest_idx
  on history.row_versions_2027_03 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_04_org_latest_idx
  on history.row_versions_2027_04 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_05_org_latest_idx
  on history.row_versions_2027_05 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_06_org_latest_idx
  on history.row_versions_2027_06 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_07_org_latest_idx
  on history.row_versions_2027_07 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_08_org_latest_idx
  on history.row_versions_2027_08 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_09_org_latest_idx
  on history.row_versions_2027_09 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_10_org_latest_idx
  on history.row_versions_2027_10 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_11_org_latest_idx
  on history.row_versions_2027_11 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2027_12_org_latest_idx
  on history.row_versions_2027_12 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2028_01_org_latest_idx
  on history.row_versions_2028_01 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_2028_02_org_latest_idx
  on history.row_versions_2028_02 (entity_type, organization_id, id desc);
create index concurrently if not exists row_versions_default_org_latest_idx
  on history.row_versions_default (entity_type, organization_id, id desc);

-- 2. The parent index, ON ONLY, which is invalid until every partition is attached.
create index if not exists rv_org_latest_idx
  on only history.row_versions (entity_type, organization_id, id desc);

-- 3. Attach each partition's index. The parent index becomes valid on the last one.
alter index history.rv_org_latest_idx attach partition history.row_versions_2025_11_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2025_12_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_01_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_02_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_03_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_04_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_05_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_06_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_07_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_08_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_09_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_10_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_11_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2026_12_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_01_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_02_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_03_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_04_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_05_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_06_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_07_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_08_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_09_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_10_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_11_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2027_12_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2028_01_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_2028_02_org_latest_idx;
alter index history.rv_org_latest_idx attach partition history.row_versions_default_org_latest_idx;
