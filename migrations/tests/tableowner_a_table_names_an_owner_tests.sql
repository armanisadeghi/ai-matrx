-- TABLE-OWNER — THE SUITE. A Table always names an Owner.
--
-- Run it as a whole file against the main database. It opens a transaction, makes a throwaway
-- organization owned by admin@admin.com, writes Tables down both paths, asserts, and ROLLS
-- BACK — so the census after it is zero by construction: no organization, no member, no record
-- and no history row survives it.
--
--   PART 1 (green, and green before this lane too — it is here so the suite proves the whole
--           rung and not only the half that moved): a Table declared through the store's own
--           door by a signed-in person names that person as its Owner. The SHARE lane's
--           left-behind note said this was broken; it never was.
--   PART 2 (the RED TWIN): a Table written with NO acting identity — a migration, a seed, any
--           server lane holding the service role and no claims — is the path that actually
--           minted the nine ownerless Tables on the main database. Before `zz0_table_owner`
--           it leaves `created_by` null and this part FAILS; after it, the organization's
--           owner holds the Table.
--   PART 3 (green): an organization with no members at all keeps an ownerless Table, on
--           purpose. There is nobody there to name, and naming somebody would be a lie.

\set ON_ERROR_STOP on
begin;

\set org   '''aaaaaaaa-0919-4000-8000-00000000f001'''
\set org2  '''aaaaaaaa-0919-4000-8000-00000000f002'''
\set admin '''87a6e699-3622-4869-8843-d0867456c0dd'''

insert into iam.organizations (id, name, slug, abbreviation)
values (:org::uuid,  'TABLE-OWNER Throwaway', 'table-owner-throwaway-f001', 'TOT'),
       (:org2::uuid, 'TABLE-OWNER Ownerless', 'table-owner-ownerless-f002', 'TOO');
-- `iam.organization_member` is a view over `iam.memberships` and its `role` column is a cast,
-- so the membership is written where it lives.
insert into iam.memberships (container_type, container_id, organization_id, user_id, role, status)
values ('organization', :org::uuid, :org::uuid, :admin::uuid, 'owner', 'active');

-- A spec the store's own shape guards accept, taken from a live Table so nothing here is a
-- guess about what REC-1 requires of a Table.
select (data - 'parent_id')::text as base_spec
  from custom.record where id = 'b0f01454-5fad-4d3b-b7d7-98e3ea995081' \gset

-- THE FIRST RECORD OF A BLANK ORGANIZATION CANNOT BE A TABLE (a Table needs a Home, a Home
-- must be a record of the same organization), so each throwaway organization gets the record
-- every organization gets: one row of the `Organization` kernel, which is what REC-3 means by
-- a Table living AT the organization.
insert into custom.record (organization_id, table_id, data_class, data)
values (:org::uuid, '11111111-0000-4000-8000-000000000004'::uuid, 'record',
        jsonb_build_object('name', 'Home', 'description', 'TABLE-OWNER suite'))
returning id as home1 \gset
insert into custom.record (organization_id, table_id, data_class, data)
values (:org2::uuid, '11111111-0000-4000-8000-000000000004'::uuid, 'record',
        jsonb_build_object('name', 'Home', 'description', 'TABLE-OWNER suite'))
returning id as home2 \gset

-- ── PART 1 — the store's own door, as admin@admin.com ────────────────────────────────────
-- Through the REAL door, which means a real organization: the store's product switch
-- (`custom/system_enabled`) is off for a brand-new organization and a lane never turns it on,
-- so part 1 declares its Table in admin's own Workspace where the switch is already on. The
-- whole file rolls back, so it leaves nothing there either.
\set live_org '''884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'''
select data ->> 'parent_id' as live_home
  from custom.record where id = 'b0f01454-5fad-4d3b-b7d7-98e3ea995081' \gset
select set_config('request.jwt.claims',
  json_build_object('sub', :admin, 'role', 'authenticated', 'email', 'admin@admin.com')::text, true);
set local role authenticated;
select custom.table_declare(:live_org::uuid,
         :'base_spec'::jsonb
         || jsonb_build_object('name','TABLE-OWNER part 1','slug','table_owner_part_1',
                               'parent_id', :'live_home')) as t1 \gset
reset role;
select set_config('tableowner.t1', :'t1', true);

do $$
declare v uuid;
begin
  select created_by into v from custom.record where id = current_setting('tableowner.t1')::uuid;
  if v is distinct from '87a6e699-3622-4869-8843-d0867456c0dd'::uuid then
    raise exception 'PART 1 FAILED: a Table declared by admin@admin.com names % as its Owner',
      coalesce(v::text, 'nobody');
  end if;
  raise notice 'PART 1 ok - the door stamps the person who declared the Table.';
end $$;

-- ── PART 2 — THE RED TWIN: no acting identity at all ─────────────────────────────────────
-- `platform._stamp_actor` reads `app.user_id` and `auth.uid()`; both are empty here, which is
-- exactly what a migration or a service-role lane looks like to it.
select set_config('request.jwt.claims', '', true);
insert into custom.record (organization_id, table_id, data_class, data)
values (:org::uuid, custom.table_kernel_id(), 'table',
        :'base_spec'::jsonb
        || jsonb_build_object('name','TABLE-OWNER part 2','slug','table_owner_part_2',
                              'parent_id', :'home1'))
returning id as t2 \gset
select set_config('tableowner.t2', :'t2', true);

do $$
declare v uuid;
begin
  select created_by into v from custom.record where id = current_setting('tableowner.t2')::uuid;
  if v is null then
    raise exception 'PART 2 FAILED (the red twin): a Table written with no acting identity was minted with NO Owner. Nobody can share, re-level or revoke it - public.may_manage_sharing admits the Owner (created_by) or admin on the thing, and this row has neither.';
  end if;
  if v is distinct from '87a6e699-3622-4869-8843-d0867456c0dd'::uuid then
    raise exception 'PART 2 FAILED: the ownerless Table was given % rather than the organization''s owner', v;
  end if;
  raise notice 'PART 2 ok - a Table written with no acting identity is held by the organization''s owner.';
end $$;

-- ── PART 3 — an organization with nobody in it keeps an ownerless Table ──────────────────
insert into custom.record (organization_id, table_id, data_class, data)
values (:org2::uuid, custom.table_kernel_id(), 'table',
        :'base_spec'::jsonb
        || jsonb_build_object('name','TABLE-OWNER part 3','slug','table_owner_part_3',
                              'parent_id', :'home2'))
returning id as t3 \gset
select set_config('tableowner.t3', :'t3', true);

do $$
declare v uuid;
begin
  select created_by into v from custom.record where id = current_setting('tableowner.t3')::uuid;
  if v is not null then
    raise exception 'PART 3 FAILED: an organization with no members named % as an Owner', v;
  end if;
  raise notice 'PART 3 ok - an organization with nobody in it names nobody, which is the truth.';
end $$;

rollback;

-- The census this suite leaves behind, measured after the rollback.
select (select count(*) from iam.organizations
         where id in ('aaaaaaaa-0919-4000-8000-00000000f001','aaaaaaaa-0919-4000-8000-00000000f002')) as throwaway_orgs,
       (select count(*) from custom.record
         where organization_id in ('aaaaaaaa-0919-4000-8000-00000000f001','aaaaaaaa-0919-4000-8000-00000000f002')) as throwaway_records;
