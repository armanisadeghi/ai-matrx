-- E-signature parity, wave A — platform.device_handoff gains soft delete so iam.canonical_certify_ok
-- is true (CONTRACT.md §5.1: "done only when canonical_certify_ok is true"; an entity without
-- deleted_at certifies WARN). Handoffs are never deleted by a door; the column is the base contract.
alter table platform.device_handoff add column if not exists deleted_at timestamptz;
update platform.entity_types set has_soft_delete = true where token = 'device_handoff';
select iam.apply_rls('platform', 'device_handoff', 'device_handoff', 'entity');
