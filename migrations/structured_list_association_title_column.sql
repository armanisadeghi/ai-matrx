-- structured_list_association_title_column.sql
-- Enable Pick Lists (`structured_list` / workbench.udt_structured_lists) on the
-- canonical association card grid + reference allowed-types chooser.
--
-- Gap: the token was registered and is_listed, but title_column / content_role /
-- reference_pickable were never set, and the FE ENTITY_OVERLAY had no entry —
-- so AssociationCardGrid (curatedTokens) and listableTokens both skipped it.
--
-- Idempotent. Applied live 2026-07-28 via Supabase MCP.

UPDATE platform.entity_types
SET title_column = 'list_name',
    content_role = 'utility',
    reference_pickable = true
WHERE token = 'structured_list'
  AND (
    title_column IS DISTINCT FROM 'list_name'
    OR content_role IS DISTINCT FROM 'utility'
    OR reference_pickable IS DISTINCT FROM true
  );
