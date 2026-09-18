-- ============================================================================
-- FILTERABLE IDENTITY LIVES IN REAL COLUMNS (2026-09-17, CS-30, chair ruling R9)
--
-- The coding-session Files tab's only read (`features/ai-work/conversations/
-- artifacts/service.ts`) asks `files.files` for one session's artifacts by two
-- JSONB paths:
--     metadata->>'kind'           = 'coding_session_artifact'
--     metadata->>'cli_session_id' = <the provider's session id>
-- It timed out about one open in four, and CS-27 proved an index CANNOT fix it:
-- `files.files` has RLS enabled, and PostgreSQL may not evaluate a qual whose
-- operator is not LEAKPROOF before the security quals — so such a qual can
-- never become an index condition. `jsonb_object_field_text` (`->>`) has
-- `proleakproof = false`. Both equalities are therefore demoted into a per-row
-- Filter and the planner walks every live row of the table, running the
-- `std_select` policy (a ~180-subplan OR chain) on each one. Measured as
-- admin@admin.com against role `authenticated`: 4,792-29,147 ms, 714,965
-- buffers, 155,731 rows removed by filter, against an 8 s statement_timeout.
-- The control that proves it is leakproofness and not the planner's taste: the
-- same read with a leakproof qual (`uuid_eq` on `created_by`) DOES get an Index
-- Cond under the same policy — 1.1 ms.
--
-- So the identity a client filters by becomes a REAL COLUMN, where `texteq` is
-- leakproof and a btree can be an index condition under RLS. This file adds the
-- two columns; `20260917_files_artifact_identity_backfill_and_index.sql` fills
-- them and builds the index.
--
-- WHY NOT a STORED generated column (which would need no writer change): it
-- REWRITES a 335 MB, 156k-row table under ACCESS EXCLUSIVE while ~30 indexes
-- rebuild, and this platform's maintenance-DDL guard caps `lock_timeout` at 2 s
-- precisely to stop that being taken casually. Plain nullable ADD COLUMN is
-- metadata-only: no rewrite, no scan. Not a trigger either — `files.files` is
-- the platform's hottest write path.
--
-- THE NAMES. `artifact_kind`, not `kind`: the canonical vocabulary retires bare
-- `kind` as a generic discriminator (common-docs/systems/platform/vocabulary/
-- FEATURE.md) and this table already names such a fact with that suffix
-- (`derivation_kind`). `provider_session_id`, not `cli_session_id`: that is the
-- platform's existing canonical name for "the id the outside provider gave this
-- session" (`chat.coding_session.provider_session_id`, and the voice-agent
-- facts use the same word), and a second name for one fact is what the Data
-- Doctrine forbids. Neither column is scoped to coding sessions by its name, so
-- the next feature that needs a filterable provider session on a file inherits
-- it instead of inventing a third JSON key.
--
-- Nullable and unconstrained on purpose: 156k existing rows are not artifacts
-- and stay NULL, and NULL is what "this row carries no such identity" means.
-- New columns inherit the table-level SELECT grant, so the client sees them
-- without a GRANT (every `GRANT` is refused by the migration judgement).
-- ============================================================================

SET lock_timeout = '2s';

ALTER TABLE files.files
  ADD COLUMN IF NOT EXISTS artifact_kind text,
  ADD COLUMN IF NOT EXISTS provider_session_id text;

COMMENT ON COLUMN files.files.artifact_kind IS
  'What KIND of produced artifact this row is, as a filterable real column — today only ''coding_session_artifact'' (a file a coding agent produced, mirrored in by the desktop publisher). Mirrors metadata->>''kind'' and is written by the ONE upload door in aidream (matrx_files SyncEngine); NULL means the row is not a produced artifact. It exists as a column because a client read cannot index metadata->>''kind'' under RLS: the ->> operator is not LEAKPROOF, so that qual can never be an index condition (CS-27/CS-30, 2026-09-17).';

COMMENT ON COLUMN files.files.provider_session_id IS
  'The id the OUTSIDE provider gave the session this file belongs to — for coding artifacts, chat.coding_session.provider_session_id (mirrors metadata->>''cli_session_id''). A filterable real column for the same leakproofness reason as artifact_kind; NULL means the row belongs to no provider session. Written by the ONE upload door in aidream, including the placement-alias rows (duplicate_of_file_id).';
