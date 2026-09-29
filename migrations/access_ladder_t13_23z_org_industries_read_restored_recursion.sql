-- access_ladder_t13_23z_org_industries_read_restored_recursion.sql
-- chair-step: one table, EMERGENCY REVERT of 23x. Drops the generated std_select on iam.org_industries and restores its prior read policy, because the generated read reads platform.entity_grants whose own read policy reads iam.org_industries: infinite policy recursion for every signed-in read that touches entity_grants (measured 2026-09-28 20:14 PT).
--
-- Restores exactly the pre-23x read: org_industries_select_member (is_member_of_organization(organization_id)).
-- The composition edge row stays registered until the recursion is designed out; see the access-ladder REGISTER.

set local lock_timeout = '2s';

drop policy if exists std_select on iam.org_industries;
create policy org_industries_select_member on iam.org_industries for select to authenticated
  using (is_member_of_organization(organization_id));
