-- access_ladder_t13_24a_org_industries_edge_withdrawn.sql
-- chair-step: deletes one registry row (the org_industries -> organization composition edge added by 23x) so no later regeneration re-emits the recursive read that 23z reverted. No policy is touched (a delete on platform.entity_relationships does not regenerate).
--
-- Why: platform.entity_grants' read policy reads iam.org_industries (the industry audience), and every
-- generated read reads platform.entity_grants, so a generated read on org_industries recurses. It stays a
-- hand-written read (debt list) until that cycle is designed out.

set local lock_timeout = '2s';

delete from platform.entity_relationships
 where child_type = 'org_industries' and parent_type = 'organization' and fk_column = 'organization_id' and kind = 'composition';
