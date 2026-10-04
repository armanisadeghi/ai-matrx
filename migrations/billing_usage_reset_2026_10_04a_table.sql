-- billing_usage_reset_2026_10_04a_table.sql
--
-- AI usage limits — admin RESET (Arman, 2026-10-04: "a way of letting us manually reset someone's
-- limit … 5-hour, week, month, or all 3 at once"). A reset is a dated marker per person per
-- window; billing._points_usage_state counts a window from greatest(period start, latest marker).
-- Law: common-docs/systems/platform/entitlements-knobs/USAGE-GATE.md § Database contract.
--
-- ACCESS. `system` variant, data_class `organization` (the default; rows live in the system org), suppress_platform_admin_lane = true (no
-- system-org global lane; platform_admin_read still emitted — the admin law), client_read_only =
-- true so every regeneration grants `authenticated` SELECT only. The ONLY write path is
-- billing.usage_reset_apply (super-admin, _10_04c). Rows are `internal` visibility so the
-- platform-admin read arm sees them (DD-165). Regeneration is _10_04b (one generator per file).

select platform.create_entity_table(
  p_schema => 'billing', p_table => 'usage_reset', p_token => 'billing_usage_reset', p_label => 'Usage reset',
  p_fields => array[
    'subject_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE',
    'period billing.meter_period NOT NULL',
    'reset_at timestamptz NOT NULL DEFAULT now()',
    'reset_by uuid REFERENCES iam.users(id) ON DELETE SET NULL',
    'note text'
  ],
  p_variant => 'system', p_versioned => false, p_soft_delete => true, p_visibility => 'internal',
  p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
  p_data_class => 'organization', p_default_list_scope => 'organization');

-- Every FK needs a covering index; the hot read is "latest marker for (person, period)".
create index if not exists usage_reset_subject_period_idx
  on billing.usage_reset (subject_user_id, period, reset_at desc) where deleted_at is null;
create index if not exists usage_reset_reset_by_idx on billing.usage_reset (reset_by);

update platform.entity_types
   set suppress_platform_admin_lane = true,
       client_read_only = true,
       data_class_reason = 'Admin-issued AI-usage resets (who cleared whose window, when, why): platform admins read; written only by billing.usage_reset_apply (super-admin).'
 where token = 'billing_usage_reset';
