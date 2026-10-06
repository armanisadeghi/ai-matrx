-- lane: CHAIR-WORLD-LANE
-- Inverse of migrations/campaign/chairworld_b_the_example_tables_and_the_public_datasets_are_public_again.sql:
-- the same eleven Table records unpublished again (the T-13 dual-write
-- trigger returns the row column from `public` to `internal`), only where they are still published.

set local lock_timeout = '3s';

update custom.record t
   set published_to_web = false,
       updated_at = now()
 where t.table_id = custom.table_kernel_id()
   and t.deleted_at is null
   and t.published_to_web
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
