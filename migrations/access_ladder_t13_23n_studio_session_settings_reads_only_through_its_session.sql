-- access_ladder_t13_23n_studio_session_settings_reads_only_through_its_session.sql
-- chair-step: one table. Regenerates this child's policies from its parent studio session, then drops its hand-written read and write policies through iam.supersede_bespoke_policies.
--
-- T-13 2.3c (common-docs/policies/access-ladder.md: children inherit their parent only).
-- transcripts.studio_session_settings was a registered child of studio_session with only hand-written policies:
--   studio_session_settings_select       session viewer            -> generated std_select (same parent read)
--   studio_session_settings_public_read  anon + signed-in when the session is 'public' -> gone: studio sessions are
--                            Private (T-31), none is public, and anon holds no grant on this table
--   studio_session_settings_insert/update session editor         -> generated std_insert / std_update (same)
--   studio_session_settings_delete       session ADMIN             -> generated std_delete: session EDITOR (the
--                            platform's rule for every child: removing a part of a record is editing
--                            it). No studio session is shared with anyone today, so nobody gains it now.
-- Measured live 2026-09-28 before this file: every sampled person (session owners, members of the
-- sessions' organizations, sharees, unrelated accounts) sees the identical row set through the generated
-- read as through the hand-written ones; anon is refused before and after.

set local lock_timeout = '2s';

select iam.apply_rls('transcripts', 'studio_session_settings', 'studio_session_settings', 'component');

select iam.supersede_bespoke_policies('transcripts', 'studio_session_settings',
  array['studio_session_settings_select', 'studio_session_settings_public_read', 'studio_session_settings_insert', 'studio_session_settings_update', 'studio_session_settings_delete'],
  'T-13 2.3c: hand-written session-viewer read, public-session read (no public sessions; Private class) and session editor/admin writes replaced by the generated child policies read and written through transcripts.studio_sessions.');
