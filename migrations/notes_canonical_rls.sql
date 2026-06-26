-- notes_canonical_rls.sql
-- ---------------------------------------------------------------------------
-- Canonical-RLS lane — `notes` entity (proof slice).
--
-- Brings public.notes onto the one canonical RLS path (iam.apply_rls v2 +
-- iam.has_access). Access is PRESERVED exactly, not changed:
--   legacy notes_select_scope = user_id=me OR org-member OR has_permission
--   canonical std_select       = created_by=me OR has_access('note', id, 'viewer')
--                                where has_access('note') resolves owner / org
--                                (visibility>=internal) / grant — same set.
--
-- Mapping: note is registered default_visibility='internal' (org-readable), which
-- matches the legacy org-member read. is_public -> visibility: true->'public'
-- (0 rows today), false->'internal'. created_by already == user_id for 704/710
-- (the 6 are null-creator orphans, unchanged).
--
-- Non-breaking: created_by auto-stamps via _stamp_actor; new notes insert
-- organization_id=NULL which the canonical insert allows; user_id/is_public/
-- is_deleted columns remain (read-migrated in code, dropped later under PITR).
--
-- DEFERRED (flagged, not in this pass): is_deleted->deleted_at, note_shares +
-- notes.shared_with -> public.permissions (sharing), note_versions -> canonical
-- versions, notes.project_id/task_id -> platform.associations (already mirrored),
-- anon public-read (gated on the canonical anon/public decision).
--
-- Idempotent.
-- ---------------------------------------------------------------------------

-- visibility column (matches entity_types.default_visibility='internal' for 'note')
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'internal';

-- preserve access: any public note -> 'public' (none today, but correct going forward)
UPDATE public.notes SET visibility = 'public'
WHERE is_public IS TRUE AND visibility <> 'public';

-- the one canonical generator (drops the 5 hand-written notes_* policies, emits std_*)
SELECT iam.apply_rls('public', 'notes', 'note', 'entity');
