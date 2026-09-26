-- lane TRASH-COVERAGE-2 — Organization Trash reads an organization's SHARED archived files through their own index.
-- AUTOCOMMIT FILE: CREATE INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.
--
-- Organization Trash lists an organization's archived rows except members' personal ones (those stay
-- in their owner's own Trash). On files.files the organization index walks every archived row of the
-- organization and filters: AI Matrx holds 75,540 archived personal files and 3 shared ones, so the
-- walk read all of them to find three (org_trash_list file 100-890 ms on production, ceiling 300 ms;
-- pnpm check:trash-answers-fast). public._trash_kind_rows now asks for the shared rows and the caller's
-- own personal rows separately (migrations/campaign/trashcoverage2_organization_trash_walks_shared_and_own_personal_rows_apart.sql);
-- this partial index makes the shared half a bounded index walk. Partial on deleted_at is not null, so
-- live-file writes never touch it.
--
-- INVERSE: migrations/inverse/trashcoverage2_organization_trash_reads_shared_rows_through_their_own_index_down.sql
-- lane: TRASH-COVERAGE-2

create index concurrently if not exists files_trash_org_shared_deleted_idx
  on files.files (organization_id, deleted_at desc, id)
  where deleted_at is not null and visibility is distinct from 'personal';
