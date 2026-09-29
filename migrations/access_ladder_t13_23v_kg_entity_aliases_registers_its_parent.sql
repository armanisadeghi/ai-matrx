-- access_ladder_t13_23v_kg_entity_aliases_registers_its_parent.sql
-- chair-step: one table. Registers this child's composition edge (its trigger regenerates the child's policies from the parent in this transaction) and drops its hand-written read through iam.supersede_bespoke_policies.
--
-- T-13 2.3d (common-docs/policies/access-ladder.md: children inherit their parent only; owner-session ruling 2026-09-28).
-- rag.kg_entity_aliases: its only parent reference is entity_id -> rag.kg_entities (organization_id names the
-- organization, not a parent record). Registering the edge regenerates it (platform._component_edge_regenerates).

set local lock_timeout = '2s';

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
values ('kg_entity_aliases', 'kg_entities', 'entity_id', 'composition', 'T-13 2.3d: the child reads and writes through its parent');

select iam.supersede_bespoke_policies('rag', 'kg_entity_aliases', array['kg_entity_aliases_org_select'],
  'T-13 2.3d: hand-written child policies replaced by the generated parent-derived set (owner ruling 2026-09-28: children inherit their parent); proved per person live before and after.');
