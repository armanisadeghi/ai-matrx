set lock_timeout = '5s';
set statement_timeout = '60s';

do $$
declare
  v_picklists_kind text;
  v_picklist_items_kind text;
begin
  select c.relkind::text
    into v_picklists_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'workbench'
    and c.relname = 'udt_picklists';

  select c.relkind::text
    into v_picklist_items_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'workbench'
    and c.relname = 'udt_picklist_items';

  if to_regclass('workbench.udt_structured_lists') is null then
    if v_picklists_kind is distinct from 'r' then
      raise exception 'Expected workbench.udt_picklists to be a base table before structured-list rename, found %', v_picklists_kind;
    end if;

    alter table workbench.udt_picklists rename to udt_structured_lists;
  end if;

  if to_regclass('workbench.udt_structured_list_items') is null then
    if v_picklist_items_kind is distinct from 'r' then
      raise exception 'Expected workbench.udt_picklist_items to be a base table before structured-list rename, found %', v_picklist_items_kind;
    end if;

    alter table workbench.udt_picklist_items rename to udt_structured_list_items;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_lists'::regclass
      and conname = 'udt_picklists_pkey'
  ) then
    alter table workbench.udt_structured_lists
      rename constraint udt_picklists_pkey to udt_structured_lists_pkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_lists'::regclass
      and conname = 'udt_picklists_user_id_fkey'
  ) then
    alter table workbench.udt_structured_lists
      rename constraint udt_picklists_user_id_fkey to udt_structured_lists_user_id_fkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_lists'::regclass
      and conname = 'udt_picklists_organization_id_fkey'
  ) then
    alter table workbench.udt_structured_lists
      rename constraint udt_picklists_organization_id_fkey to udt_structured_lists_organization_id_fkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_lists'::regclass
      and conname = 'udt_picklists_created_by_fkey'
  ) then
    alter table workbench.udt_structured_lists
      rename constraint udt_picklists_created_by_fkey to udt_structured_lists_created_by_fkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_lists'::regclass
      and conname = 'udt_picklists_updated_by_fkey'
  ) then
    alter table workbench.udt_structured_lists
      rename constraint udt_picklists_updated_by_fkey to udt_structured_lists_updated_by_fkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_list_items'::regclass
      and conname = 'udt_picklist_items_pkey'
  ) then
    alter table workbench.udt_structured_list_items
      rename constraint udt_picklist_items_pkey to udt_structured_list_items_pkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_list_items'::regclass
      and conname = 'udt_picklist_items_picklist_id_fkey'
  ) then
    alter table workbench.udt_structured_list_items
      rename constraint udt_picklist_items_picklist_id_fkey to udt_structured_list_items_list_id_fkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_list_items'::regclass
      and conname = 'user_list_items_user_id_fkey'
  ) then
    alter table workbench.udt_structured_list_items
      rename constraint user_list_items_user_id_fkey to udt_structured_list_items_user_id_fkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_list_items'::regclass
      and conname = 'udt_picklist_items_organization_id_fkey'
  ) then
    alter table workbench.udt_structured_list_items
      rename constraint udt_picklist_items_organization_id_fkey to udt_structured_list_items_organization_id_fkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_list_items'::regclass
      and conname = 'udt_picklist_items_created_by_fkey'
  ) then
    alter table workbench.udt_structured_list_items
      rename constraint udt_picklist_items_created_by_fkey to udt_structured_list_items_created_by_fkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'workbench.udt_structured_list_items'::regclass
      and conname = 'udt_picklist_items_updated_by_fkey'
  ) then
    alter table workbench.udt_structured_list_items
      rename constraint udt_picklist_items_updated_by_fkey to udt_structured_list_items_updated_by_fkey;
  end if;
end $$;

alter index if exists workbench.idx_udt_picklists_organization_id
  rename to idx_udt_structured_lists_organization_id;

drop policy if exists udt_picklists_select on workbench.udt_structured_lists;
drop policy if exists udt_picklists_insert on workbench.udt_structured_lists;
drop policy if exists udt_picklists_update on workbench.udt_structured_lists;
drop policy if exists udt_picklists_delete on workbench.udt_structured_lists;
drop policy if exists udt_structured_lists_select on workbench.udt_structured_lists;
drop policy if exists udt_structured_lists_insert on workbench.udt_structured_lists;
drop policy if exists udt_structured_lists_update on workbench.udt_structured_lists;
drop policy if exists udt_structured_lists_delete on workbench.udt_structured_lists;

create policy udt_structured_lists_select
on workbench.udt_structured_lists
for select
using (
  user_id = auth.uid()
  or is_public = true
  or public.has_permission('structured_list', id, 'viewer'::permission_level)
);

create policy udt_structured_lists_insert
on workbench.udt_structured_lists
for insert
with check (user_id = auth.uid());

create policy udt_structured_lists_update
on workbench.udt_structured_lists
for update
using (
  user_id = auth.uid()
  or public.has_permission('structured_list', id, 'editor'::permission_level)
);

create policy udt_structured_lists_delete
on workbench.udt_structured_lists
for delete
using (user_id = auth.uid());

drop policy if exists udt_picklist_items_select on workbench.udt_structured_list_items;
drop policy if exists udt_picklist_items_insert on workbench.udt_structured_list_items;
drop policy if exists udt_picklist_items_update on workbench.udt_structured_list_items;
drop policy if exists udt_picklist_items_delete on workbench.udt_structured_list_items;
drop policy if exists udt_structured_list_items_select on workbench.udt_structured_list_items;
drop policy if exists udt_structured_list_items_insert on workbench.udt_structured_list_items;
drop policy if exists udt_structured_list_items_update on workbench.udt_structured_list_items;
drop policy if exists udt_structured_list_items_delete on workbench.udt_structured_list_items;

create policy udt_structured_list_items_select
on workbench.udt_structured_list_items
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from workbench.udt_structured_lists ul
    where ul.id = udt_structured_list_items.list_id
      and (
        ul.user_id = auth.uid()
        or public.has_permission('structured_list', ul.id, 'editor'::permission_level)
      )
  )
);

create policy udt_structured_list_items_insert
on workbench.udt_structured_list_items
for insert
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from workbench.udt_structured_lists ul
    where ul.id = udt_structured_list_items.list_id
      and public.has_permission('structured_list', ul.id, 'editor'::permission_level)
  )
);

create policy udt_structured_list_items_update
on workbench.udt_structured_list_items
for update
using (
  user_id = auth.uid()
  or exists (
    select 1
    from workbench.udt_structured_lists ul
    where ul.id = udt_structured_list_items.list_id
      and (
        ul.user_id = auth.uid()
        or public.has_permission('structured_list', ul.id, 'editor'::permission_level)
      )
  )
);

create policy udt_structured_list_items_delete
on workbench.udt_structured_list_items
for delete
using (user_id = auth.uid());

comment on table workbench.udt_structured_lists is
  'User-owned structured lists. Each row is a named collection of editable option objects that can be used as choices, task lists, shopping lists, grouped collections, and similar list-shaped data.';
comment on table workbench.udt_structured_list_items is
  'Items inside a structured list. Each row is an editable option object with label, description, help text, optional group, and icon metadata.';

insert into platform.entity_types (
  token,
  schema_name,
  table_name,
  label,
  base_tier,
  is_versioned,
  has_soft_delete,
  is_active,
  notes,
  default_visibility,
  is_listed,
  is_component,
  category,
  is_module,
  default_members_can_add,
  default_needs_approval,
  default_scopeable,
  default_auto_ingest,
  table_ref,
  rls_variant
)
values (
  'structured_list',
  'workbench',
  'udt_structured_lists',
  'Structured List',
  1,
  true,
  true,
  true,
  'Reusable, optionally grouped list of editable option objects.',
  null,
  true,
  false,
  null,
  false,
  true,
  false,
  true,
  false,
  'workbench.udt_structured_lists'::regclass,
  null
)
on conflict (token) do update
set schema_name = excluded.schema_name,
    table_name = excluded.table_name,
    label = excluded.label,
    base_tier = excluded.base_tier,
    is_versioned = excluded.is_versioned,
    has_soft_delete = excluded.has_soft_delete,
    is_active = excluded.is_active,
    notes = excluded.notes,
    default_visibility = excluded.default_visibility,
    is_listed = excluded.is_listed,
    is_component = excluded.is_component,
    category = excluded.category,
    is_module = excluded.is_module,
    default_members_can_add = excluded.default_members_can_add,
    default_needs_approval = excluded.default_needs_approval,
    default_scopeable = excluded.default_scopeable,
    default_auto_ingest = excluded.default_auto_ingest,
    table_ref = excluded.table_ref,
    rls_variant = excluded.rls_variant;

insert into platform.shareable_resource_registry (
  resource_type,
  schema_name,
  table_name,
  id_column,
  owner_column,
  is_public_column,
  display_label,
  url_path_template,
  rls_uses_has_permission,
  is_active,
  notes,
  content_role,
  is_scopeable,
  public_columns,
  is_link_shareable
)
values (
  'structured_list',
  'workbench',
  'udt_structured_lists',
  'id',
  'user_id',
  'is_public',
  'Structured List',
  '/structured-lists/{id}',
  true,
  true,
  'Reusable, optionally grouped list of editable option objects.',
  'source',
  true,
  array['id', 'list_name', 'description', 'created_at']::text[],
  true
)
on conflict (resource_type) do update
set schema_name = excluded.schema_name,
    table_name = excluded.table_name,
    id_column = excluded.id_column,
    owner_column = excluded.owner_column,
    is_public_column = excluded.is_public_column,
    display_label = excluded.display_label,
    url_path_template = excluded.url_path_template,
    rls_uses_has_permission = excluded.rls_uses_has_permission,
    is_active = excluded.is_active,
    notes = excluded.notes,
    content_role = excluded.content_role,
    is_scopeable = excluded.is_scopeable,
    public_columns = excluded.public_columns,
    is_link_shareable = excluded.is_link_shareable,
    updated_at = now();

update platform.shareable_resource_registry
set schema_name = 'workbench',
    table_name = 'udt_picklists',
    display_label = 'Structured List',
    public_columns = array['id', 'list_name', 'description', 'created_at']::text[],
    is_active = true,
    updated_at = now()
where resource_type = 'udt_picklists';

create or replace function public.has_permission_for(
  p_user_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_required_permission permission_level
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  with normalized as (
    select coalesce(
      (
        select a.canonical
        from (
          values
            ('structured_list', 'structured_list'),
            ('structured_list', 'udt_structured_lists'),
            ('structured_list', 'workbench.udt_structured_lists'),
            ('structured_list', 'udt_picklists'),
            ('structured_list', 'workbench.udt_picklists'),
            ('structured_list', 'picklist')
        ) as a(canonical, alias)
        where a.alias = p_resource_type
        limit 1
      ),
      p_resource_type
    ) as resource_type
  ),
  registry_forms as (
    select array_remove(array[
      r.resource_type,
      r.table_name,
      concat_ws('.', r.schema_name, r.table_name)
    ], null) as spellings
    from platform.shareable_resource_registry r
    join normalized n on r.resource_type = n.resource_type
       or r.table_name = n.resource_type
       or concat_ws('.', r.schema_name, r.table_name) = n.resource_type
    where r.is_active
    limit 1
  ),
  alias_forms as (
    select case
      when n.resource_type = 'structured_list' then
        array[
          'structured_list',
          'udt_structured_lists',
          'workbench.udt_structured_lists',
          'udt_picklists',
          'workbench.udt_picklists',
          'picklist'
        ]
      else array[n.resource_type]
    end as spellings
    from normalized n
  ),
  forms as (
    select coalesce(
      (
        select array(
          select distinct spelling
          from unnest(rf.spellings || af.spellings) as spelling
        )
        from registry_forms rf
        cross join alias_forms af
      ),
      (select spellings from alias_forms)
    ) as spellings
  )
  select exists (
    select 1
    from iam.permissions p, forms f
    where p.resource_type = any(f.spellings)
      and p.resource_id = p_resource_id
      and coalesce(p.status, 'active') <> 'rejected'
      and (p.expires_at is null or p.expires_at > now())
      and (
        p.granted_to_user_id = p_user_id
        or (
          p.granted_to_organization_id is not null
          and p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om
            where om.user_id = p_user_id
          )
        )
      )
      and case p_required_permission
        when 'viewer' then p.permission_level in ('viewer', 'editor', 'admin')
        when 'editor' then p.permission_level in ('editor', 'admin')
        when 'admin' then p.permission_level = 'admin'
      end
    limit 1
  );
$function$;

drop view if exists workbench.udt_picklist_items;
drop view if exists workbench.udt_picklists;

create view workbench.udt_picklists
with (security_invoker = true)
as
select *
from workbench.udt_structured_lists;

create view workbench.udt_picklist_items
with (security_invoker = true)
as
select *
from workbench.udt_structured_list_items;

grant select, insert, update, delete on workbench.udt_structured_lists to anon, authenticated, service_role;
grant select, insert, update, delete on workbench.udt_structured_list_items to anon, authenticated, service_role;
grant select, insert, update, delete on workbench.udt_picklists to anon, authenticated, service_role;
grant select, insert, update, delete on workbench.udt_picklist_items to anon, authenticated, service_role;

notify pgrst, 'reload schema';
