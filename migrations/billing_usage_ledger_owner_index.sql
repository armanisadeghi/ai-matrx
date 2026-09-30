-- billing_usage_ledger_owner_index.sql  (lane B-BILLING, 2026-09-29)
--
-- The per-person usage window (billing.resolve_capability's capability_limit branch and
-- billing.resolve_capability_effective) now reads created_by, the owner column. Its index twin of
-- usage_ledger_user_cap_idx (user_id, capability, created_at desc), which goes with user_id in the
-- billing window. ~23k rows: a plain build holds SHARE on this one table for milliseconds.

create index if not exists usage_ledger_owner_cap_idx
  on billing.usage_ledger (created_by, capability, created_at desc);
