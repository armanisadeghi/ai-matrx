-- skl_render_component_graveyard.sql
--
-- Shape System STAGE 3 — annihilate the dormant competitor (SHAPE_SYSTEM.md R1).
--
-- `skill.render_component` was an abandoned "render registry": (render_definition,
-- platform) -> component_key / import_path / parser_key / props_schema. It was
-- superseded by `content_ir.kind_component`, the canonical component resolver
-- ((kind, platform, role) -> component_key, source: bundled|db).
--
-- Dormancy proof (2026-07-07):
--   * 36 rows, 9 of them platform='web' (chart, diff, item_presentation, map,
--     mermaid, presentation, questionnaire, stats, svg); the other 27 are
--     is_active=false placeholders for chrome-extension / desktop / mobile.
--   * NOTHING read the table at render time. The only reader was the
--     `fetchRenderComponents` redux thunk (features/agent-connections/redux/skl/),
--     which had zero dispatch sites, zero importers, and fed a slice branch
--     (state.skl.renderComponents) that no selector consumer ever read.
--   * No inbound FKs, no views, no functions/RPCs reference it.
--
-- `skill.render_definition` STAYS — it is the markdown-atom palette (the
-- `template` column) powering the right-click render-block palette
-- (useRenderBlocks / RenderBlocksSection). Only its `render_component` satellite dies.
--
-- THE CUT: `SET SCHEMA graveyard` — data preserved, old name stops resolving, so
-- every stale reference errors loudly. Never a compat view, never a DROP.
-- Reverse with: alter table graveyard.render_component set schema skill;
--
-- Idempotent: safe to re-apply.

-- 1) Move the table offline (reversible, zero data loss).
--    Its policies, triggers and outbound FKs travel with it.
do $$
begin
  if to_regclass('skill.render_component') is not null then
    execute 'alter table skill.render_component set schema graveyard';
  end if;
end $$;

-- 2) De-register the platform entity footprint so nothing resolves to it.
delete from platform.entity_relationships
 where child_type = 'skill_render_component'
    or parent_type = 'skill_render_component';

delete from platform.entity_types
 where token = 'skill_render_component';

-- 3) Register the clean cut (mirror of scripts/dead-relations.json).
insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
values (
  'skill.render_component',
  'content_ir.kind_component',
  'graveyard.render_component',
  'Shape System Stage 3 (SHAPE_SYSTEM.md R1): the dormant render registry is replaced by content_ir.kind_component, the canonical (kind, platform, role) -> component_key resolver. Its only reader was the never-dispatched fetchRenderComponents thunk, now deleted. skill.render_definition survives as the markdown-atom palette. Never reference skill.render_component.'
)
on conflict (old_ref) do update
  set new_ref     = excluded.new_ref,
      archived_as = excluded.archived_as,
      reason      = excluded.reason;
