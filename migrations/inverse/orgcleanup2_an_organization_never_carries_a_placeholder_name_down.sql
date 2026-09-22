-- additive: yes
-- window-class: drop trigger takes ACCESS EXCLUSIVE on iam.organizations AND on the 23
--   auth/storage/realtime relations supautils.policy_grants hooks (DDL-LOCK census,
--   scripts/lib/ddl-lock-footprint.json) — nobody signs in while it runs.
--
-- Inverse of migrations/campaign/orgcleanup2_an_organization_never_carries_a_placeholder_name.sql.
-- Takes the refusal back off the door. NOTE: running this reintroduces the defect — any
-- script can then mint "ZZZ … throwaway <uuid> — safe to delete" again, which is how 48 of
-- them reached the organization picker overnight. It exists so rule 27 (up -> inverse ->
-- up) can prove the guard against its own prior state, not as an end state.

set lock_timeout = '4s';

drop trigger if exists organization_name_is_never_a_placeholder_i on iam.organizations;
drop trigger if exists organization_name_is_never_a_placeholder_u on iam.organizations;
drop function if exists iam.organization_name_is_never_a_placeholder();
drop function if exists iam.placeholder_in_a_name(text, text);
