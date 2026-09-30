-- chair-step: moves NOT NULL from the retired column to the owner column on billing.usage_ledger (DROP NOT NULL on user_id); the bridge trigger from billing_usage_owner_and_soft_delete.sql fills whichever of the two a writer omits and refuses a split, so neither can be NULL on any write. Lane B-BILLING.
-- billing_usage_ledger_owner_not_null.sql  (lane B-BILLING, 2026-09-29)
--
-- created_by is the owner of every usage row (backfilled; 0 NULL, 0 disagreeing). It becomes NOT NULL,
-- and the retired user_id stops being NOT NULL so a writer that sends only created_by (the new aidream
-- metering code) is not refused by a generated model's client-side NOT NULL check before the bridge
-- trigger can fill it. user_id itself is dropped in the window. Locks: billing.usage_ledger only
-- (one validating scan of ~23k rows).

alter table billing.usage_ledger alter column created_by set not null;
alter table billing.usage_ledger alter column user_id drop not null;

do $$
begin
  if exists (select 1 from billing.usage_ledger where created_by is distinct from user_id) then
    raise exception 'billing.usage_ledger: owner columns disagree';
  end if;
end $$;
