-- chair-step: widens admin.admin_audit_log_action_check by one value (a CHECK cannot be widened without DROP + ADD); every existing row still satisfies it, nothing is removed. Without it every admin-lane admission is refused (fail-closed).
--
-- admin_audit_log_admin_lane_action_2026_09_26.sql
--
-- THE ADMIN LANE is audited in the platform admin audit trail. aidream's
-- `aidream/api/middleware/admin_lane_admission.py` writes one
-- `admin.admin_audit_log` row per admission of a verified platform admin to the
-- platform tenant (`x-matrx-admin-lane: 1`), and refuses the admission when the
-- row cannot be written. The action CHECK knew only the admin-roster actions
-- (promote / update / revoke), so every admission was refused with 23514 —
-- fail-closed, as designed. This adds the one new action word.
--
-- Inverse: migrations/inverse/admin_audit_log_admin_lane_action_2026_09_26_down.sql

ALTER TABLE admin.admin_audit_log DROP CONSTRAINT admin_audit_log_action_check;
ALTER TABLE admin.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action = ANY (ARRAY['promote'::text, 'update'::text, 'revoke'::text,
                             'admin_lane_platform_tenant_admission'::text]));
