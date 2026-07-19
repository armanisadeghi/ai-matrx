-- entity_types_reference_pickable.sql
--
-- Moves the "can this entity type be chosen as a reference-cell type" gate out
-- of the hand-maintained FE overlay (features/scopes/registry/entityRegistry.ts)
-- and into platform.entity_types, where super admins manage it from
-- /administration/relationships/entity-types:
--
--   reference_pickable  — token appears in the "Allowed types" chooser for
--                         value_type='reference' context items.
--   title_column        — the human-readable column generic pickers read for
--                         candidate titles (NULL = no generic table read; the
--                         token needs an FE candidate-source override).
--   content_role        — the knowledge-model grouping bucket (utility /
--                         source / destination / hybrid / container) used by
--                         the two-tier type chooser and resource surfaces.
--
-- Backfill mirrors the overlay exactly as of 2026-07-19, so behavior is
-- unchanged until an admin flips a row.

alter table platform.entity_types
  add column if not exists reference_pickable boolean not null default false,
  add column if not exists title_column text,
  add column if not exists content_role text;

do $$ begin
  alter table platform.entity_types
    add constraint entity_types_content_role_check
    check (content_role is null or content_role in
      ('utility','source','destination','hybrid','container'));
exception when duplicate_object then null; end $$;

comment on column platform.entity_types.reference_pickable is
  'Token is offered as an allowed type for reference context items (scope context "Allowed types" chooser).';
comment on column platform.entity_types.title_column is
  'Human-readable title column on the backing table for generic candidate pickers. NULL = not generically listable (needs an FE candidate-source override).';
comment on column platform.entity_types.content_role is
  'Knowledge-model grouping: utility | source | destination | hybrid | container. Drives two-tier pickers and resource surfaces.';

-- ── Backfill (mirrors ENTITY_OVERLAY as of 2026-07-19) ──────────────────────
update platform.entity_types e set
  reference_pickable = true,
  title_column = v.title_column,
  content_role = v.content_role
from (values
  ('agent','name','utility'),
  ('agent_shortcut','label','utility'),
  ('app','name','utility'),
  ('skill','label','utility'),
  ('workflow','name','utility'),
  ('content_template','label','utility'),
  ('file','file_name','source'),
  ('folder','folder_name','source'),
  ('transcript','title','source'),
  ('studio_session','title','source'),
  ('dataset','description','hybrid'),
  ('workbook','description','hybrid'),
  ('data_store',null,'source'), -- picker candidates come from the rag API, not a table read
  ('code_file','name','source'),
  ('code_folder','name','container'),
  ('code_repository','name','container'),
  ('note','label','hybrid'),
  ('udt_document','document_name','hybrid'),
  ('working_document','title','destination'),
  ('conversation','title','destination'),
  ('flashcard_set','title','destination'),
  ('quiz_session','title','destination'),
  ('project','name','container'),
  ('task','title','container')
) as v(token, title_column, content_role)
where e.token = v.token;

-- Container display-only tokens: content_role set, NOT reference-pickable.
update platform.entity_types set content_role = 'container'
where token in ('scope','scope_type','organization') and content_role is null;

-- ── entity_types_list (anon/generator read) — return type grows ─────────────
drop function if exists public.entity_types_list();
create function public.entity_types_list()
returns table(
  token text, schema_name text, table_name text, label text,
  base_tier smallint, is_versioned boolean, has_soft_delete boolean,
  is_listed boolean, is_component boolean, is_module boolean,
  category text, default_scopeable boolean, is_active boolean,
  reference_pickable boolean, title_column text, content_role text)
language sql stable security definer set search_path = ''
as $$
  select et.token, et.schema_name, et.table_name, et.label, et.base_tier,
         et.is_versioned, et.has_soft_delete, et.is_listed, et.is_component,
         et.is_module, et.category, et.default_scopeable, et.is_active,
         et.reference_pickable, et.title_column, et.content_role
    from platform.entity_types et
   where et.is_active
   order by et.token;
$$;
grant execute on function public.entity_types_list() to anon, authenticated;

-- ── admin_entity_types_list — return type grows ─────────────────────────────
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
  reference_pickable boolean, title_column text, content_role text)
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
         e.reference_pickable, e.title_column, e.content_role
    from platform.entity_types e
   where public.is_super_admin()
   order by e.is_active desc, e.token;
$$;
grant execute on function public.admin_entity_types_list() to authenticated;

-- ── admin_upsert_entity_type — three new params (defaults keep old calls valid,
--    but drop the old signature so there is exactly ONE overload) ─────────────
drop function if exists public.admin_upsert_entity_type(
  text, text, text, text, smallint, boolean, boolean, boolean, boolean,
  boolean, text, boolean, text, boolean, boolean, boolean, text, boolean, text);
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
  p_content_role text default null)
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

  if p_reference_pickable and nullif(p_title_column, '') is not null then
    -- Loud validation: a pickable token's title column must exist on the table.
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
    reference_pickable, title_column, content_role
  ) values (
    p_token, p_schema_name, p_table_name, p_label, p_base_tier,
    p_is_versioned, p_has_soft_delete, p_is_listed, p_is_component, p_is_module,
    nullif(p_category, ''), p_default_scopeable,
    nullif(p_default_visibility, '')::platform.visibility, p_default_members_can_add,
    p_default_needs_approval, p_default_auto_ingest,
    nullif(p_rls_variant, ''), v_ref,
    p_is_active, nullif(p_notes, ''),
    p_reference_pickable, nullif(p_title_column, ''), nullif(p_content_role, '')
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
    content_role = excluded.content_role;
end $function$;
grant execute on function public.admin_upsert_entity_type(
  text, text, text, text, smallint, boolean, boolean, boolean, boolean,
  boolean, text, boolean, text, boolean, boolean, boolean, text, boolean, text,
  boolean, text, text) to authenticated;
