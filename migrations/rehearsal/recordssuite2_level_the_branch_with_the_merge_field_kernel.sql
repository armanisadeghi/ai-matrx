-- target: branch
--
-- THE NINTH KERNEL TABLE — `Merge Field` — BACK ON THE REHEARSAL BRANCH.
--
-- WHY
-- ---
-- The record store's kernel Tables are nine fixed rows of `custom.record` with fixed ids. The
-- first live BRANCH-REFRESH restores production's SCHEMA and none of its DATA, so every row a
-- campaign migration seeded into `custom.*` was gone from the branch while the copied runner
-- ledger still said those migrations were applied. Lane RECORDS-SUITE-2 measured ZERO kernel rows
-- on the branch against nine on main, and `matrx_records.movers` stopped by name:
-- "The record store is missing kernel Tables ['Table', 'Field', 'Rule', 'Organization', 'Person',
-- 'File', 'Presentation', 'Widget', 'Merge Field'] — every Field this mover plans is homed under
-- the kernel 'Field' Table … so the run stops here rather than homing rows under an id that means
-- nothing."
--
-- Eight of the nine came back by re-applying `migrations/campaign/w1_store_kernel_tables.sql` to
-- the branch (idempotent, `on conflict do nothing`, applied 2026-09-22 16:11:36Z). The NINTH,
-- `Merge Field` (id …0009), is seeded inside
-- `migrations/campaign/w1_field_definitions_and_validation.sql`, and that file **cannot be
-- replayed and must not be**: it also carries seventeen `create or replace function` statements
-- with no `-- based-on:` lines, so the runner refuses it by name. Replaying it would overwrite
-- `custom.field_kernel_id`, `merge_field_kernel_id`, `field_rules`, `table_type_field`,
-- `applicable_fields`, `field_options` and eleven more with September bodies, silently reverting
-- every change other lanes have made to them since. That refusal is the guard working.
--
-- So this file carries the ONE ROW, and touches no function. Values read from main with a SELECT
-- on 2026-09-22; the organization is the system organization (`Matrx System`), which the refresh
-- does synthesize.
--
-- ADDITIVE and idempotent: `on conflict (organization_id, id) do nothing` (the store's PK). No
-- DDL, no DROP, no REVOKE, no function replaced. No customer data — a kernel row is the store's
-- own vocabulary.
--
-- THE CLASS IS NOT FIXED HERE and it is the biggest thing left on the branch: the refresh carries
-- schema but not the campaign's own seeded rows, and it copies a ledger that says otherwise, so
-- the ordinary re-apply path answers "already applied, nothing to do" for rows that are gone.
-- That belongs to BRANCH-REFRESH.
--
-- lane: RECORDS-SUITE-2

insert into custom.record (id, organization_id, table_id, data_class, data)
values
  ('11111111-0000-4000-8000-000000000009'::uuid,
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
   '11111111-0000-4000-8000-000000000001'::uuid,
   'kernel',
   '{"row": "REC-27", "name": "Merge Field", "kernel": true}'::jsonb)
on conflict do nothing;

do $$
declare n int;
begin
    select count(*) into n from custom.record where data_class = 'kernel' and deleted_at is null;
    if n <> 9 then
        raise exception 'the record store holds % kernel Tables; main holds 9, and every Field a mover plans is homed under the kernel Field Table', n;
    end if;
end $$;
