-- billing_usage_reset_2026_10_04b_access.sql
-- Regenerate billing.usage_reset's policies + grants after _10_04a set client_read_only /
-- suppress_platform_admin_lane (one generator per file — POLICY-LOCK window).
select iam.apply_rls('billing', 'usage_reset', 'billing_usage_reset', 'system');
