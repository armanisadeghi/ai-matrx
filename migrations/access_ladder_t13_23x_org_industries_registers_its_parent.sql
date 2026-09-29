-- access_ladder_t13_23x_org_industries_registers_its_parent.sql
-- chair-step: one table. Registers this child's composition edge (its trigger regenerates the child's policies from the parent in this transaction) and drops its hand-written read through iam.supersede_bespoke_policies.
--
-- T-13 2.3d (common-docs/policies/access-ladder.md: children inherit their parent only; owner-session ruling 2026-09-28).
-- iam.org_industries: parent is its organization (organization_id -> iam.organizations); industry_id is a
-- reference catalogue entry, not an owner. Registering the edge regenerates it.

set local lock_timeout = '2s';

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
values ('org_industries', 'organization', 'organization_id', 'composition', 'T-13 2.3d: the child reads and writes through its parent');

select iam.supersede_bespoke_policies('iam', 'org_industries', array['org_industries_select_member'],
  'T-13 2.3d: hand-written child policies replaced by the generated parent-derived set (owner ruling 2026-09-28: children inherit their parent); proved per person live before and after.');
