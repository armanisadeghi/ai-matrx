-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W1-STORE — the kernel Table rows.
--
-- REC-27, and the chair's ruling of 2026-09-17 recorded in the build log before this
-- lane's first migration: the kernel is NINE Tables — `Table`, `Field`, `Rule`,
-- `Organization`, `Person`, `File`, `Presentation` (REC-N-15), `Widget` (REC-N-16) and
-- `Merge Field` (DYN-1) — and NOT V-27's `Record · Field · Value · Relation · Visibility ·
-- History`, which names the STORAGE primitives at a different altitude. This lane lands
-- the first EIGHT; `W1-FIELD` lands `Merge Field`. So
--   select count(*) from custom.record where data_class = 'kernel'
-- is 8 until `W1-FIELD` runs and 9 after it, and every exit proof that counts kernel rows
-- counts against THIS list and the lanes that have landed when it runs.
--
-- REC-25: a Table is a Record. Each kernel row therefore carries `table_id` pointing at
-- the `Table` kernel record — including the `Table` record itself, which is its own type.
--
-- THE ORGANIZATION. `39c38960-d30c-4840-b0c1-c9960de95582` is the platform system
-- organization, read on BOTH databases 2026-09-17 by
--   select key, organization_id from iam.system_orgs where key = 'system';
-- It is written as a literal rather than as `public.system_org_id('system')` so the row's
-- source is constants, which is what the bounded custom-data INSERT shape admits.
--
-- WHY AN INSERT INTO `custom.record` IS ADMITTED AT PRODUCTION AT ALL: schema `custom` is
-- created by this campaign, revoked from PUBLIC, anon, authenticated and service_role
-- (default privileges included), absent from `pgrst.db_schemas` and held shut by
-- `custom/system_enabled`. A row written here is unreachable by every client and is
-- removed by this file's own inverse. It is also this lane's ONLY positive production
-- proof: a count that cannot be non-zero unless this file actually ran there.
--
-- THE INVERSE: `migrations/inverse/w1_store_kernel_tables_down.sql` (§4.13).

set lock_timeout = '5s';
set statement_timeout = '120s';

insert into custom.record (id, organization_id, table_id, data_class, data)
values
  ('11111111-0000-4000-8000-000000000001'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '11111111-0000-4000-8000-000000000001'::uuid, 'kernel', '{"name":"Table","kernel":true,"row":"REC-27"}'::jsonb),
  ('11111111-0000-4000-8000-000000000002'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '11111111-0000-4000-8000-000000000001'::uuid, 'kernel', '{"name":"Field","kernel":true,"row":"REC-27"}'::jsonb),
  ('11111111-0000-4000-8000-000000000003'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '11111111-0000-4000-8000-000000000001'::uuid, 'kernel', '{"name":"Rule","kernel":true,"row":"REC-27"}'::jsonb),
  ('11111111-0000-4000-8000-000000000004'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '11111111-0000-4000-8000-000000000001'::uuid, 'kernel', '{"name":"Organization","kernel":true,"row":"REC-27"}'::jsonb),
  ('11111111-0000-4000-8000-000000000005'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '11111111-0000-4000-8000-000000000001'::uuid, 'kernel', '{"name":"Person","kernel":true,"row":"REC-27"}'::jsonb),
  ('11111111-0000-4000-8000-000000000006'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '11111111-0000-4000-8000-000000000001'::uuid, 'kernel', '{"name":"File","kernel":true,"row":"REC-27"}'::jsonb),
  ('11111111-0000-4000-8000-000000000007'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '11111111-0000-4000-8000-000000000001'::uuid, 'kernel', '{"name":"Presentation","kernel":true,"row":"REC-N-15"}'::jsonb),
  ('11111111-0000-4000-8000-000000000008'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '11111111-0000-4000-8000-000000000001'::uuid, 'kernel', '{"name":"Widget","kernel":true,"row":"REC-N-16"}'::jsonb)
on conflict do nothing;
