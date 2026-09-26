-- chair-step: inverse of admin_audit_log_admin_lane_action_2026_09_26.sql — removes the admin-lane audit action. It FAILS while any admission row exists (the CHECK would reject it); archive those rows first. Without the action, every admin-lane admission is refused (fail-closed).
-- inverse of admin_audit_log_admin_lane_action_2026_09_26.sql

ALTER TABLE admin.admin_audit_log DROP CONSTRAINT admin_audit_log_action_check;
ALTER TABLE admin.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action = ANY (ARRAY['promote'::text, 'update'::text, 'revoke'::text]));
