-- staff_door_outcome_event_dd137b_2026_09_22
-- chair-step: closes the platform-admin read lane on platform.outcome_event through iam.apply_rls, the only door that may touch its GENERATED std_select
--
-- THE FINDING. Seventh file of the DD-137b staff-door sweep (GATES-3, 2026-09-22). The sweep opened
-- at 99 tokens / 50 components; the component/ledger finding is closed and two tokens remain. This
-- is one of them.
--
-- WHY IT NEEDED ITS OWN FILE. `platform.outcome_event`'s staff lane is not a standalone policy and
-- not a bespoke one. It lives inside `std_select` and `platform_admin_select`, both GENERATED names
-- — and `iam.supersede_bespoke_policies` refuses a generated name by design (DD-204: regeneration
-- already replaces them, so superseding one would hand a hand-written body to a function that will
-- overwrite it). The only door that may touch a generated policy is `iam.apply_rls`.
--
-- WHY apply_rls IS SAFE HERE, which is what held it back. The earlier files avoided apply_rls on a
-- table carrying bespoke policies, because it would ADD generated policies the table never had and
-- WIDEN access. This table already carries the generated set for its variant — `std_select`,
-- `platform_admin_select` (the doors-only FOR SELECT twin: in schema `platform` a write is a door,
-- DOORS-ONLY-4) and `svc_all` — so regeneration re-emits the same shapes. Its three bespoke
-- policies, `outcome_event_client_delete_refused`, `_insert_refused` and `_update_refused`, are
-- RESTRICTIVE: apply_rls leaves them untouched (it only drops names in
-- `iam.generated_policy_names()`), and a restrictive policy refuses a client write no matter what
-- any permissive policy says. So the write door cannot be opened by this file even in principle.
--
-- WHAT CHANGES. `suppress_platform_admin_lane = true` stops `iam.platform_admin_read_prefix`
-- emitting the `((visibility >= 'internal') AND (select is_platform_admin())) OR` arm, so the
-- regenerated `std_select` keeps only the creator, public-visibility, organization-member,
-- permission, membership, reachability, association and entity-grant arms — verbatim, because the
-- generator writes them — and `platform_admin_select` is not re-emitted at all. A platform admin
-- browsing with their own session loses a standing read of every organization's outcome events.
-- Every server-side writer runs as the service role, which RLS does not apply to.

set local lock_timeout = '30s';

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token = 'platform_outcome_event'
   and not suppress_platform_admin_lane;

select iam.apply_rls('platform', 'outcome_event', 'platform_outcome_event', 'entity');
