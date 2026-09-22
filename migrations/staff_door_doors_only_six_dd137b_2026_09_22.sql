-- staff_door_doors_only_six_dd137b_2026_09_22
-- chair-step: closes the platform-admin read lane on the six doors-only tokens carrying platform_admin_all_select; each paired bespoke read re-created with the real arm verbatim and no staff arm
--
-- THE FINDING. Fifth file of the DD-137b staff-door sweep (GATES-3, 2026-09-22), which opened at
-- 99 tokens / 50 components and stands at 24 / 9. This one takes the DOORS-ONLY shape: in schemas
-- `platform` and `iam` a write is a door (DOORS-ONLY-4), so the generator emits
-- `platform_admin_all_select` — the FOR SELECT twin of `platform_admin_all` — instead of a FOR ALL
-- lane. Six tokens carry it: platform.feature_knob, platform.mtx_media_heal_queue,
-- platform.org_change_policy, iam.org_industries, iam.organization_preferences, iam.system_orgs.
--
-- WHAT EACH ONE ACTUALLY HAD. The twin is a standalone permissive SELECT whose whole predicate is
-- `(select is_platform_admin())`, so it grants the lane on its own; it is dropped on all six. Four
-- of them ALSO weld the staff arm into the customer's own read — `org_industries_select_member`,
-- `org_read`, `ocp_read`, `feature_knob_no_write_select` — each `((select is_platform_admin()) OR
-- <the real arm>)`. Those four are superseded through `iam.supersede_bespoke_policies` and
-- re-created with `<the real arm>` VERBATIM, same roles, no staff arm. Two details worth reading:
--
--   · `org_industries_select_member` carried a SECOND staff arm, `OR (select is_super_admin())`,
--     inside the part that survives the first strip. It goes too — a super admin is our own staff
--     and this guard measures `is_super_admin` exactly as it measures `is_platform_admin`. What is
--     left is the arm the policy is named for: `is_member_of_organization(organization_id)`.
--   · `feature_knob_no_write_select` was `((select is_platform_admin()) OR false)`, so after the
--     strip it is `false` — a permissive policy that grants nothing, which is precisely what its
--     name says. It is re-created rather than dropped: the real read on platform.feature_knob is
--     `feature_knob_read_authenticated USING (true)`, untouched, so every signed-in reader still
--     reads every knob row and nothing about the register changes.
--
-- NOT IN THIS FILE: platform.outcome_event. Its staff arm lives inside `std_select`, a GENERATED
-- policy name, and `iam.supersede_bespoke_policies` refuses a generated name by design (DD-204) —
-- while `iam.apply_rls` cannot be used either, because the table carries bespoke
-- `outcome_event_client_*_refused` policies it would not re-emit. It needs its own decision and is
-- named in the GATES-3 report.
--
-- WHO LOSES WHAT. A platform admin browsing with their own session loses a standing read of these
-- six. iam.system_orgs and platform.mtx_media_heal_queue keep a `USING (true)` read for every
-- signed-in caller; org members keep their organization's industries, preferences and change
-- policy. Every write on all six is a door, unchanged, and every service-role path is unaffected
-- by construction.

set local lock_timeout = '30s';

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in ('feature_knob', 'mtx_media_heal_queue', 'org_change_policy', 'org_industries',
                 'organization_preferences', 'system_orgs')
   and not suppress_platform_admin_lane;

select iam.supersede_bespoke_policies('iam', 'org_industries', array['org_industries_select_member'],
  'DD-137b staff door (2026-09-22, GATES-3): the read lane opened with a staff arm; re-created with the real arm verbatim, same roles, and no staff arm.');
create policy org_industries_select_member on iam.org_industries
  for select to authenticated
  using (is_member_of_organization(organization_id));

select iam.supersede_bespoke_policies('iam', 'organization_preferences', array['org_read'],
  'DD-137b staff door (2026-09-22, GATES-3): the read lane opened with a staff arm; re-created with the real arm verbatim, same roles, and no staff arm.');
create policy org_read on iam.organization_preferences
  for select to authenticated
  using (((organization_id IS NOT NULL) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs))));

select iam.supersede_bespoke_policies('platform', 'feature_knob', array['feature_knob_no_write_select'],
  'DD-137b staff door (2026-09-22, GATES-3): the read lane opened with a staff arm; re-created with the real arm verbatim, same roles, and no staff arm.');
create policy feature_knob_no_write_select on platform.feature_knob
  for select to authenticated
  using (false);

select iam.supersede_bespoke_policies('platform', 'org_change_policy', array['ocp_read'],
  'DD-137b staff door (2026-09-22, GATES-3): the read lane opened with a staff arm; re-created with the real arm verbatim, same roles, and no staff arm.');
create policy ocp_read on platform.org_change_policy
  for select to authenticated
  using ((organization_id IN ( SELECT iam.my_orgs() AS my_orgs)));

drop policy platform_admin_all_select on platform.feature_knob;
drop policy platform_admin_all_select on platform.mtx_media_heal_queue;
drop policy platform_admin_all_select on platform.org_change_policy;
drop policy platform_admin_all_select on iam.org_industries;
drop policy platform_admin_all_select on iam.organization_preferences;
drop policy platform_admin_all_select on iam.system_orgs;