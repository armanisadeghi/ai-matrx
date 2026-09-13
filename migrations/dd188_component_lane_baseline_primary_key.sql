-- DD-188: `iam.dd175_component_lane_baseline` (B-60's DD-175 forcing-test harness table) was
-- created with `create table if not exists` and no primary key. `db/generate.py` in aidream
-- introspects every table it can see to emit ORM models/managers, and a table with no primary
-- key aborts that walk for EVERY caller, not just whoever runs it next — B-62 hit this and had to
-- revert the partial generation it left in the shared working tree.
--
-- The natural key for this harness's own rows is (component_token, principal_email, measured_at):
-- one probe run inserts every (component, principal) pairing it found widened in a single INSERT
-- statement, so `measured_at` (default now(), evaluated once per statement/transaction) is the
-- "snapshot" the rows belong to, `component_token` names the widened component, and
-- `principal_email` names the identity the probe measured. A live census before this migration
-- (2026-09-13, DB brsgrqvjdzwihsvnfqkf) found 23 rows with zero duplicates on that triple, so the
-- key is safe to add without deleting or renumbering anything.
alter table iam.dd175_component_lane_baseline
  add constraint dd175_component_lane_baseline_pkey
  primary key (component_token, principal_email, measured_at);
