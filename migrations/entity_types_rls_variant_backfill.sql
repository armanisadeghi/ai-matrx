-- Applied live 2026-08-12 via Supabase MCP (migration: entity_types_rls_variant_backfill).
-- Kill the NULL-variant ambiguity class: rls_variant is now always explicit.
-- 'component' where the registry already declares is_component; 'entity' otherwise.
-- (NULL was being coalesced to 'entity' by consumers, which runs the WRONG check set
--  for components — the planner's fake component_rls_mismatch and doctrine Trap 2
--  both stem from it. Post-backfill: is_component=true ⇔ rls_variant='component'.)
UPDATE platform.entity_types SET rls_variant = 'component'
WHERE rls_variant IS NULL AND is_component;

UPDATE platform.entity_types SET rls_variant = 'entity'
WHERE rls_variant IS NULL AND NOT is_component;

ALTER TABLE platform.entity_types ALTER COLUMN rls_variant SET DEFAULT 'entity';
