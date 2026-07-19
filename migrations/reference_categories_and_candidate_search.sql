-- reference_categories_and_candidate_search.sql
--
-- 1. `platform.reference_categories` — free-form, admin-defined buckets for
--    the reference "Allowed types" chooser. An entity type may be assigned to
--    one (`entity_types.reference_category`); unassigned types bucket under
--    their schema's pretty name (`platform.schemas`). Admins define whatever
--    taxonomy they want without migrations.
-- 2. `reference_search_candidates` — THE universal candidate reader for
--    reference pickers. SECURITY DEFINER dynamic read keyed by entity token,
--    so candidate listing works for EVERY pickable type regardless of
--    PostgREST schema exposure or per-table RLS variants. Access model:
--      - table has created_by/organization_id → owner's rows + org-mates'
--        rows (minus rows marked visibility='private' that aren't yours)
--      - table has neither → global catalog (listing it is the admin's
--        explicit decision via reference_pickable)
--    Passing p_ids resolves titles for known ids (same access rules).

create table if not exists platform.reference_categories (
  slug text primary key,
  label text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true
);

comment on table platform.reference_categories is
  'Admin-defined buckets for reference type choosers; entity_types.reference_category points here. Unassigned types bucket by schema.';

alter table platform.entity_types
  add column if not exists reference_category text;

do $$ begin
  alter table platform.entity_types
    add constraint entity_types_reference_category_fkey
    foreign key (reference_category) references platform.reference_categories(slug);
exception when duplicate_object then null; end $$;

comment on column platform.entity_types.reference_category is
  'Optional admin-assigned chooser bucket (platform.reference_categories.slug). NULL = bucket by schema pretty name.';

create or replace function public.reference_categories_list()
returns table(slug text, label text, sort_order integer, is_active boolean)
language sql stable security definer set search_path = ''
as $$
  select c.slug, c.label, c.sort_order, c.is_active
    from platform.reference_categories c
   order by c.sort_order, c.label;
$$;
grant execute on function public.reference_categories_list() to anon, authenticated;

create or replace function public.admin_upsert_reference_category(
  p_slug text, p_label text,
  p_sort_order integer default 100, p_is_active boolean default true)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  if p_slug !~ '^[a-z][a-z0-9_-]*$' then
    raise exception 'invalid category slug "%"', p_slug;
  end if;
  insert into platform.reference_categories (slug, label, sort_order, is_active)
  values (p_slug, p_label, p_sort_order, p_is_active)
  on conflict (slug) do update set
    label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;
end $$;
grant execute on function public.admin_upsert_reference_category(text, text, integer, boolean) to authenticated;

-- ── entity-type RPCs grow reference_category ────────────────────────────────
drop function if exists public.entity_types_list();
create function public.entity_types_list()
returns table(
  token text, schema_name text, table_name text, label text,
  base_tier smallint, is_versioned boolean, has_soft_delete boolean,
  is_listed boolean, is_component boolean, is_module boolean,
  category text, default_scopeable boolean, is_active boolean,
  reference_pickable boolean, title_column text, content_role text,
  reference_category text)
language sql stable security definer set search_path = ''
as $$
  select et.token, et.schema_name, et.table_name, et.label, et.base_tier,
         et.is_versioned, et.has_soft_delete, et.is_listed, et.is_component,
         et.is_module, et.category, et.default_scopeable, et.is_active,
         et.reference_pickable, et.title_column, et.content_role,
         et.reference_category
    from platform.entity_types et
   where et.is_active
   order by et.token;
$$;
grant execute on function public.entity_types_list() to anon, authenticated;

drop function if exists public.admin_entity_types_list();
create function public.admin_entity_types_list()
returns table(
  token text, schema_name text, table_name text, label text,
  base_tier smallint, is_versioned boolean, has_soft_delete boolean,
  is_listed boolean, is_component boolean, is_module boolean,
  category text, default_scopeable boolean, default_visibility text,
  default_members_can_add boolean, default_needs_approval boolean,
  default_auto_ingest boolean, rls_variant text, table_ref text,
  is_active boolean, notes text,
  reference_pickable boolean, title_column text, content_role text,
  reference_category text)
language sql stable security definer set search_path = ''
as $$
  select e.token, e.schema_name, e.table_name, e.label,
         e.base_tier, e.is_versioned, e.has_soft_delete,
         e.is_listed, e.is_component, e.is_module,
         e.category, e.default_scopeable,
         e.default_visibility::text, e.default_members_can_add,
         e.default_needs_approval, e.default_auto_ingest,
         e.rls_variant, e.table_ref::text,
         e.is_active, e.notes,
         e.reference_pickable, e.title_column, e.content_role,
         e.reference_category
    from platform.entity_types e
   where public.is_super_admin()
   order by e.is_active desc, e.token;
$$;
grant execute on function public.admin_entity_types_list() to authenticated;

drop function if exists public.admin_upsert_entity_type(
  text, text, text, text, smallint, boolean, boolean, boolean, boolean,
  boolean, text, boolean, text, boolean, boolean, boolean, text, boolean, text,
  boolean, text, text);
create or replace function public.admin_upsert_entity_type(
  p_token text, p_schema_name text, p_table_name text, p_label text,
  p_base_tier smallint default 1,
  p_is_versioned boolean default true,
  p_has_soft_delete boolean default true,
  p_is_listed boolean default false,
  p_is_component boolean default false,
  p_is_module boolean default false,
  p_category text default null,
  p_default_scopeable boolean default true,
  p_default_visibility text default null,
  p_default_members_can_add boolean default true,
  p_default_needs_approval boolean default false,
  p_default_auto_ingest boolean default false,
  p_rls_variant text default null,
  p_is_active boolean default true,
  p_notes text default null,
  p_reference_pickable boolean default false,
  p_title_column text default null,
  p_content_role text default null,
  p_reference_category text default null)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare v_ref regclass;
begin
  if not public.is_super_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  if p_token !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'invalid token "%": must be snake_case starting with a letter (^[a-z][a-z0-9_]*$)', p_token;
  end if;

  if p_content_role is not null and p_content_role not in
     ('utility','source','destination','hybrid','container') then
    raise exception 'invalid content_role "%": must be utility | source | destination | hybrid | container', p_content_role;
  end if;

  if nullif(p_reference_category, '') is not null and not exists (
    select 1 from platform.reference_categories c where c.slug = p_reference_category
  ) then
    raise exception 'unknown reference_category "%": create it first via admin_upsert_reference_category', p_reference_category;
  end if;

  if p_reference_pickable and nullif(p_title_column, '') is not null then
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = p_schema_name
        and c.table_name = p_table_name
        and c.column_name = p_title_column
    ) then
      raise exception 'title_column "%" does not exist on %.%', p_title_column, p_schema_name, p_table_name;
    end if;
  end if;

  v_ref := pg_catalog.to_regclass(pg_catalog.quote_ident(p_schema_name) || '.' || pg_catalog.quote_ident(p_table_name));
  if v_ref is null then
    raise exception 'table %.% does not exist — register the token only after the physical table is live', p_schema_name, p_table_name;
  end if;

  insert into platform.entity_types (
    token, schema_name, table_name, label, base_tier,
    is_versioned, has_soft_delete, is_listed, is_component, is_module,
    category, default_scopeable,
    default_visibility, default_members_can_add, default_needs_approval,
    default_auto_ingest, rls_variant, table_ref,
    is_active, notes,
    reference_pickable, title_column, content_role, reference_category
  ) values (
    p_token, p_schema_name, p_table_name, p_label, p_base_tier,
    p_is_versioned, p_has_soft_delete, p_is_listed, p_is_component, p_is_module,
    nullif(p_category, ''), p_default_scopeable,
    nullif(p_default_visibility, '')::platform.visibility, p_default_members_can_add,
    p_default_needs_approval, p_default_auto_ingest,
    nullif(p_rls_variant, ''), v_ref,
    p_is_active, nullif(p_notes, ''),
    p_reference_pickable, nullif(p_title_column, ''), nullif(p_content_role, ''),
    nullif(p_reference_category, '')
  )
  on conflict (token) do update set
    schema_name = excluded.schema_name,
    table_name = excluded.table_name,
    label = excluded.label,
    base_tier = excluded.base_tier,
    is_versioned = excluded.is_versioned,
    has_soft_delete = excluded.has_soft_delete,
    is_listed = excluded.is_listed,
    is_component = excluded.is_component,
    is_module = excluded.is_module,
    category = excluded.category,
    default_scopeable = excluded.default_scopeable,
    default_visibility = excluded.default_visibility,
    default_members_can_add = excluded.default_members_can_add,
    default_needs_approval = excluded.default_needs_approval,
    default_auto_ingest = excluded.default_auto_ingest,
    rls_variant = excluded.rls_variant,
    table_ref = excluded.table_ref,
    is_active = excluded.is_active,
    notes = excluded.notes,
    reference_pickable = excluded.reference_pickable,
    title_column = excluded.title_column,
    content_role = excluded.content_role,
    reference_category = excluded.reference_category;
end $function$;
grant execute on function public.admin_upsert_entity_type(
  text, text, text, text, smallint, boolean, boolean, boolean, boolean,
  boolean, text, boolean, text, boolean, boolean, boolean, text, boolean, text,
  boolean, text, text, text) to authenticated;

-- ── THE universal candidate reader ──────────────────────────────────────────
create or replace function public.reference_search_candidates(
  p_token text,
  p_search text default null,
  p_limit integer default 50,
  p_ids uuid[] default null)
returns table(id uuid, title text)
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_row platform.entity_types%rowtype;
  v_has_owner boolean;
  v_has_org boolean;
  v_has_visibility boolean;
  v_has_deleted boolean;
  v_access text;
  v_sql text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from platform.entity_types e
   where e.token = p_token and e.is_active;
  if not found then
    raise exception 'unknown or inactive entity token "%"', p_token;
  end if;
  if not v_row.reference_pickable or v_row.title_column is null then
    raise exception 'entity "%" is not reference-pickable with a title column — enable it at /administration/relationships/entity-types', p_token;
  end if;

  select
    bool_or(c.column_name = 'created_by'),
    bool_or(c.column_name = 'organization_id'),
    bool_or(c.column_name = 'visibility'),
    bool_or(c.column_name = 'deleted_at')
  into v_has_owner, v_has_org, v_has_visibility, v_has_deleted
  from information_schema.columns c
  where c.table_schema = v_row.schema_name and c.table_name = v_row.table_name;

  -- Access predicate:
  --   owner rows always; org-mates' rows unless marked visibility='private';
  --   tables with no owner/org columns are global catalogs (admin's call via
  --   reference_pickable).
  if v_has_owner and v_has_org then
    v_access := format(
      't.created_by = %L or (t.organization_id in (select m.organization_id from iam.organization_member m where m.user_id = %L)%s)',
      v_uid, v_uid,
      case when v_has_visibility
        then format(' and (t.visibility is null or t.visibility::text <> %L or t.created_by = %L)', 'private', v_uid)
        else '' end);
  elsif v_has_owner then
    v_access := format('t.created_by = %L', v_uid);
  elsif v_has_org then
    v_access := format(
      't.organization_id in (select m.organization_id from iam.organization_member m where m.user_id = %L)', v_uid);
  else
    v_access := 'true';
  end if;

  v_sql := format(
    'select t.id, t.%I::text as title from %I.%I t where (%s)',
    v_row.title_column, v_row.schema_name, v_row.table_name, v_access);

  if v_has_deleted then
    v_sql := v_sql || ' and t.deleted_at is null';
  end if;
  if p_ids is not null then
    v_sql := v_sql || format(' and t.id = any(%L::uuid[])', p_ids);
  end if;
  if nullif(trim(p_search), '') is not null then
    v_sql := v_sql || format(' and t.%I::text ilike %L',
      v_row.title_column, '%' || trim(p_search) || '%');
  end if;
  v_sql := v_sql || format(' order by t.%I limit %s',
    v_row.title_column, least(greatest(coalesce(p_limit, 50), 1), 200));

  return query execute v_sql;
end $function$;
grant execute on function public.reference_search_candidates(text, text, integer, uuid[]) to authenticated;
