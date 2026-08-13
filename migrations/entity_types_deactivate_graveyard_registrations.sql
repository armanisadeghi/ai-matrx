-- Deactivate the 4 grandfathered ACTIVE entity_types registrations pointing at graveyard tables
-- (doctrine §7: an active registration on a graveyard table is a defect in both directions).
-- All four verified DEAD before this change (2026-08-12, graveyard-dispositions chip):
--   * cx_conversation_documents → graveyard.conversation_documents: junction retired in favor of
--     workbench.working_documents + platform.associations (see cx-working-document.service.ts).
--   * share_link → graveyard.files_share_links: the LIVE link-sharing system is platform.share_links
--     + its RPC family and NEVER uses the entity token 'share_link' (0 grants, 0 edges, 0 registry
--     rows, zero function bodies contain the quoted token or the graveyard table name).
--   * skill_category → graveyard.skill_category_legacy and shortcut_category →
--     graveyard.shortcut_categories_legacy: superseded by platform.categories — every live
--     category_id FK (skill.definition, skill.render_definition, agent.shortcut) points at
--     platform.categories; 0 live rows reference the legacy tables.
-- Also removes the 3 orphan platform.entity_relationships rows referencing the dead tokens
-- (conversation→cx_conversation_documents, plus the forbidden project/task edges → skill_category).
-- The G2 guard (platform._enforce_entity_is_table) always permits deactivation.

update platform.entity_types
set is_active = false
where token in ('cx_conversation_documents', 'share_link', 'skill_category', 'shortcut_category')
  and schema_name = 'graveyard'
  and is_active;

delete from platform.entity_relationships
where (parent_type = 'conversation' and child_type = 'cx_conversation_documents')
   or (parent_type in ('project', 'task') and child_type = 'skill_category');
