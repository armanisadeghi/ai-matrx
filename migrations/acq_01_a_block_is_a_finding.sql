-- A block is a finding.
--
-- Acquisition Frontier row H2 — "The Block Ledger". Mandate:
-- common-docs/projects/acquisition-frontier/ARMAN-2026-09-17-verbatim.md;
-- law: IDEAS-WIDE.md §C1 rule 2 — "the moment an ingest path fails ... that failure is the
-- deliverable. It gets recorded, classed, and fixed or escalated. A block that gets routed
-- around silently is a defect worse than a crash."
--
-- ONE org-scoped register for every failed acquisition anywhere on the platform: the scraper,
-- the server browser, the capture ladder, the media catalog adapters, bring-your-export, the
-- file readers, and the connected-account readers. One row per (input, source type, error
-- class) per organization; a repeat increments instead of duplicating.
--
-- Variant `ledger`: this is the organization's own operational record. Nobody owns a row, a row
-- has a position rather than an identity, and everyone in the org must see the same list — the
-- same class as batch.provider_batch and platform.judge_verdict (DD-137b10).
--
-- Header-less on purpose: `select platform.create_entity_table(...)` is not an allow-list shape,
-- so this file takes the deny-list route (JUDGMENT.md §4b) at --target production. It carries no
-- DROP, REVOKE, TRUNCATE, DELETE, ALTER POLICY or SET NOT NULL.
--
-- Written against live db.matrxserver.com (project brsgrqvjdzwihsvnfqkf) 2026-09-17.

select platform.create_entity_table(
  p_schema     => 'platform',
  p_table      => 'acquisition_block',
  p_token      => 'acquisition_block',
  p_label      => 'Acquisition Block',
  p_fields     => ARRAY[
    -- WHAT WE COULD NOT GET
    'input_ref text NOT NULL',
    'input_label text NOT NULL DEFAULT ''''',
    'source_type text NOT NULL',
    -- WHO TRIED, AND HOW FAR IT GOT
    'engine text NOT NULL',
    'rung text',
    'rung_trail jsonb NOT NULL DEFAULT ''[]''::jsonb',
    -- WHAT HAPPENED, VERBATIM
    'error_class text NOT NULL',
    'error_sentence text NOT NULL',
    -- WHAT WOULD UNBLOCK IT
    'unblock_note text NOT NULL DEFAULT ''''',
    'lawful_route text',
    -- HOW OFTEN, AND WHEN
    'first_seen_at timestamptz NOT NULL DEFAULT now()',
    'last_seen_at timestamptz NOT NULL DEFAULT now()',
    'occurrence_count integer NOT NULL DEFAULT 1',
    -- WHAT WE DID ABOUT IT
    'status text NOT NULL DEFAULT ''open''',
    'retry_count integer NOT NULL DEFAULT 0',
    'last_retry_at timestamptz',
    'handoff_id uuid',
    'library_id uuid',
    'detail jsonb NOT NULL DEFAULT ''{}''::jsonb'
  ],
  p_variant            => 'ledger',
  p_versioned          => false,
  p_soft_delete        => true,
  p_visibility         => 'none',
  p_category           => false,
  p_listed             => false,
  p_org_default        => false,
  p_gin_jsonb          => true,
  p_data_class         => 'organization',
  p_default_list_scope => 'organization'
);

-- The closed vocabularies. Every one of these is declared once in Python
-- (aidream/services/block_ledger/vocabulary.py) and the database refuses anything else, so a
-- new engine or source type is a deliberate two-line change rather than a typo that lands a
-- row nobody can facet on.
alter table platform.acquisition_block
  add constraint acquisition_block_engine_known check (
    engine in ('scraper','server_browser','own_browser','human','file_reader',
               'catalog_adapter','export_reader','connected_account')
  ) not valid;

alter table platform.acquisition_block
  add constraint acquisition_block_rung_known check (
    rung is null or rung in ('http','browser','own_browser','human_drive')
  ) not valid;

alter table platform.acquisition_block
  add constraint acquisition_block_status_known check (
    status in ('open','retrying','resolved','escalated','decision')
  ) not valid;

alter table platform.acquisition_block
  add constraint acquisition_block_says_something check (
    length(btrim(error_sentence)) > 0 and length(btrim(input_ref)) > 0
  ) not valid;

-- DEDUPE: one row per (organization, input, source type, error class). `input_ref` is a URL and
-- can exceed the btree tuple limit, so the index keys its digest — the service reads by the same
-- four values before it writes, and this index is what holds when two engines fail at once.
create unique index if not exists acquisition_block_dedupe_uniq
  on platform.acquisition_block (organization_id, source_type, error_class, md5(input_ref))
  where deleted_at is null;

-- Every foreign key the provisioner made gets a covering index in this same transaction —
-- `provision_shape_guard` refuses the COMMIT otherwise, and it is right to: without one, every
-- delete of a parent organization or user sequentially scans this table.
create index if not exists acquisition_block_organization_id_idx
  on platform.acquisition_block (organization_id);

create index if not exists acquisition_block_created_by_idx
  on platform.acquisition_block (created_by);

create index if not exists acquisition_block_updated_by_idx
  on platform.acquisition_block (updated_by);

-- The screen's three reads: newest first, by engine, by open status.
create index if not exists acquisition_block_recent_idx
  on platform.acquisition_block (organization_id, last_seen_at desc)
  where deleted_at is null;

create index if not exists acquisition_block_engine_idx
  on platform.acquisition_block (organization_id, engine, last_seen_at desc)
  where deleted_at is null;

create index if not exists acquisition_block_status_idx
  on platform.acquisition_block (organization_id, status, last_seen_at desc)
  where deleted_at is null;

comment on table platform.acquisition_block is
  'The Block Ledger: every failed acquisition anywhere on the platform, as one org-scoped row — the input, the engine and rung that failed, the exact error sentence, how often, and what would unblock it. Written by aidream/services/block_ledger, read at /acquisition/blocks.';

notify pgrst, 'reload schema';
