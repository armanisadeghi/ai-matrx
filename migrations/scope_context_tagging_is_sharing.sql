-- Scope context v1 (Brief 2): tagging = sharing (read-only), scopes org-readable.
-- Applied live 2026-07-16. Live-verified: org member of a scope's org can OPEN a
-- tagged note (viewer=true), cannot edit (editor=false), and it does NOT appear
-- in their lists (is_discoverable=false); non-members denied. Conversations are
-- deliberately excluded — a chat tagged to a scope stays the owner's (its own
-- row visibility governs it; the tag only feeds agent context).

-- 1. Canonicalize context.scopes with the base `visibility` column, default
--    'internal' — the resolver-visible twin of what scopes RLS already grants
--    (scopes_select = iam.has_org_access(organization_id) OR open OR member).
--    "Everyone in the org, unless restricted"; restricting later = visibility
--    'private' + explicit scope memberships (existing edu machinery).
ALTER TABLE context.scopes
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'internal';

-- 2. Tagging = sharing for CONTENT: note→scope and file→scope become container
--    edges conveying READ-ONLY (viewer). Scope members open tagged notes/files
--    through the scope; is_discoverable still excludes them from personal lists.
--    conversation/task/thread/war_room → scope stay container_side='none'.
UPDATE platform.association_types
   SET container_side = 'target', conveys_max = 'viewer'
 WHERE target_type = 'scope'
   AND source_type IN ('note', 'file');

-- 3. Read-only ruling (same as chat attachments): scope/scope_type container
--    edges for agents and projects convey viewer, not editor. Editing requires
--    a deliberate direct share.
UPDATE platform.association_types
   SET conveys_max = 'viewer'
 WHERE target_type IN ('scope', 'scope_type')
   AND source_type IN ('agent', 'project')
   AND conveys_max = 'editor';

-- 4. Recompute the materialized reachability graph under the new rules.
SELECT platform.rebuild_reachability();
