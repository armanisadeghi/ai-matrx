-- additive: yes
-- lane: CHAIR-WORLD-LANE
-- LOCKS: eleven rows of custom.record (Table records), one statement. No function, table, trigger, grant or
-- policy is touched; nothing is tightened.
--
-- THE TABLES EVERYBODY COULD READ ARE PUBLIC AGAIN (chair ruling 2026-10-05). Needs
-- chairworld_a_a_public_table_is_read_by_every_signed_in_person.sql (the world lane through the wall) first.
--
-- WHY THEY WERE INTERNAL. The final switch's dataset mover (aidream matrx_records.movers.user_tables, removed
-- from aidream 2026-10-04 in 2e25ec7a7d with the rest of the switch's code) built each Table record from the
-- older table's name, columns and order and never carried its row-access words: matrx_records PlannedTable
-- had no visibility, so every copied Table landed at the store's default, `internal`. Every older table that
-- was `public` became organization-only. Measured 2026-10-05 against deprecated.udt_datasets and
-- deprecated.udt_structured_lists by the `moved_from` stamp each copied Table carries: 7 datasets and 1 list
-- were `public` (all published to the web) and are `internal` in the store. No mover that builds a Table
-- remains (matrx_records.movers.ALL_MOVERS is BagMover and CmsFieldSchemaMover, neither plans a Table), so
-- the class is closed by restoring these rows.
--
-- 1. The 8 moved Tables whose older table was public: AG Pickup Data, WC File Types, Content Guidance
--    Documents, IOPBM Research, Official US Matropolitan Areas, US Major Metropolitan Areas Top 100
--    (Arman's Org), "test" (Laquisha's Org), Example: Teams by Department (Matrx System).
-- 2. The 3 Matrx System example tables the old Sheet showed everybody: Example: Project Tracker,
--    Example: Product Catalog, Example: Team Directory.
-- Each is published to the web (the ladder's word for a Public table; the T-13 dual-write trigger on
-- custom.record sets the retiring row column to `public` beside it, which is what the access kernel's public
-- arm reads). Only a Table not already published is touched.
-- Inverse: migrations/inverse/chairworld_b_the_example_tables_and_the_public_datasets_are_public_again_down.sql.

set local lock_timeout = '3s';

update custom.record t
   set published_to_web = true,
       updated_at = now()
 where t.table_id = custom.table_kernel_id()
   and t.deleted_at is null
   and not t.published_to_web
   and (t.organization_id, t.id) in (
     ('3e790542-fdaf-40b2-8bf3-658bf94fe67f'::uuid, '4ddb39e5-8fa5-4236-b17b-ec2fe82e277a'::uuid),  -- AG Pickup Data
     ('3e790542-fdaf-40b2-8bf3-658bf94fe67f'::uuid, '6a3b98a9-ab10-4be4-984a-911322b919ef'::uuid),  -- WC File Types
     ('3e790542-fdaf-40b2-8bf3-658bf94fe67f'::uuid, '718ec442-a4d0-42cd-b8d1-2ad3ac676eb3'::uuid),  -- Content Guidance Documents
     ('3e790542-fdaf-40b2-8bf3-658bf94fe67f'::uuid, 'f218cc16-c65c-4241-9786-6c7297c5d54d'::uuid),  -- IOPBM Research
     ('3e790542-fdaf-40b2-8bf3-658bf94fe67f'::uuid, '1fb72e97-19d3-4592-b1ab-154196dc31c5'::uuid),  -- Official US Matropolitan Areas
     ('3e790542-fdaf-40b2-8bf3-658bf94fe67f'::uuid, 'f692c065-6f50-488a-8ffd-e5f89ee651b6'::uuid),  -- US Major Metropolitan Areas Top 100
     ('91d1a786-571f-4ce6-b9de-22796f4cacbf'::uuid, '0f2184cc-cca4-4932-be3f-61fdd07c98d4'::uuid),  -- test (Laquisha's Org)
     ('39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '0b3ed937-fb0a-4ad5-9f1e-68708b4317ae'::uuid),  -- Example: Teams by Department
     ('39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '30374c26-f16d-4e78-ab12-01495f86b954'::uuid),  -- Example: Project Tracker
     ('39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '437ad3e2-0b61-4cc2-938c-db22fc5c5220'::uuid),  -- Example: Product Catalog
     ('39c38960-d30c-4840-b0c1-c9960de95582'::uuid, '6a4b2950-935a-4c26-a3f6-0e1ab760d184'::uuid)   -- Example: Team Directory
   );
