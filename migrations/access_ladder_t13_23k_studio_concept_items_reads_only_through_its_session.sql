-- access_ladder_t13_23k_studio_concept_items_reads_only_through_its_session.sql
-- chair-step: one table. Regenerates this child's policies from its parent studio session, then drops its hand-written read and write policies through iam.supersede_bespoke_policies.
--
-- T-13 2.3c (common-docs/policies/access-ladder.md: children inherit their parent only).
-- transcripts.studio_concept_items was a registered child of studio_session with only hand-written policies:
--   studio_concept_items_select       session viewer            -> generated std_select (same parent read)
--   studio_concept_items_public_read  anon + signed-in when the session is 'public' -> gone: studio sessions are
--                            Private (T-31), none is public, and anon holds no grant on this table
--   studio_concept_items_insert/update session editor         -> generated std_insert / std_update (same)
--   studio_concept_items_delete       session ADMIN             -> generated std_delete: session EDITOR (the
--                            platform's rule for every child: removing a part of a record is editing
--                            it). No studio session is shared with anyone today, so nobody gains it now.
-- Measured live 2026-09-28 before this file: every sampled person (session owners, members of the
-- sessions' organizations, sharees, unrelated accounts) sees the identical row set through the generated
-- read as through the hand-written ones; anon is refused before and after.

set local lock_timeout = '2s';

select iam.apply_rls('transcripts', 'studio_concept_items', 'studio_concept_items', 'component');

select iam.supersede_bespoke_policies('transcripts', 'studio_concept_items',
  array['studio_concept_items_select', 'studio_concept_items_public_read', 'studio_concept_items_insert', 'studio_concept_items_update', 'studio_concept_items_delete'],
  'T-13 2.3c: hand-written session-viewer read, public-session read (no public sessions; Private class) and session editor/admin writes replaced by the generated child policies read and written through transcripts.studio_sessions.');
