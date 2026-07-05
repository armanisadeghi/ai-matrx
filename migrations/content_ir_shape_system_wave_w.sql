-- Shape System Wave W: kind_component + kind_surface + kind_example + capture cols + workflow.node_outcome.output_kind
-- Applied 2026-07-05 via Supabase MCP (content_ir_shape_system_wave_w + content_ir_shape_system_wave_w_base_fks).
-- Idempotent. Mirrors the live content_ir provisioning pattern (tokens content_ir_kind_*, component RLS, shared triggers).
-- All three tables pass iam.verify_canonical_ok(..., 'component') — verified live.

-- ============ 1. content_ir.kind_component ============
-- (kind, platform, role) -> component resolution. component_key is the cross-platform
-- contract (pre-bundled per-platform maps); source='db' (web sandbox) requires component_source.
create table if not exists content_ir.kind_component (
  id uuid primary key default gen_random_uuid(),
  kind_definition_id uuid not null references content_ir.kind_definition(id) on delete cascade,
  platform text not null check (platform in ('web','vite','react-native','chrome-extension','desktop','html-js')),
  role text not null check (role in ('output','input')),
  component_key text not null,
  source text not null default 'bundled' check (source in ('bundled','db')),
  component_source text,
  props_transform text,
  config jsonb not null default '{}',
  pinned_kind_version int,
  is_default boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 100,
  organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  version int not null default 1,
  metadata jsonb not null default '{}',
  constraint kind_component_db_source_has_code check (source <> 'db' or component_source is not null)
);
create index if not exists kind_component_kind_definition_id_idx on content_ir.kind_component (kind_definition_id);
create unique index if not exists kind_component_default_unique
  on content_ir.kind_component (kind_definition_id, platform, role)
  where is_default and deleted_at is null;

-- ============ 2. content_ir.kind_surface ============
-- The ONE enumerable list of input surfaces (xml tag / fence lang / json root key / tool name -> kind).
-- parser_strategy is a NAMED strategy implemented in both runtimes; never stored code.
create table if not exists content_ir.kind_surface (
  id uuid primary key default gen_random_uuid(),
  kind_definition_id uuid not null references content_ir.kind_definition(id) on delete cascade,
  surface_type text not null check (surface_type in ('json_root_key','xml_tag','fence_lang','tool_name')),
  token text not null,
  parser_strategy text not null,
  parser_config jsonb not null default '{}',
  streaming boolean not null default true,
  priority int not null default 100,
  is_active boolean not null default true,
  organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  version int not null default 1,
  metadata jsonb not null default '{}'
);
create index if not exists kind_surface_kind_definition_id_idx on content_ir.kind_surface (kind_definition_id);
create unique index if not exists kind_surface_token_unique
  on content_ir.kind_surface (surface_type, token)
  where is_active and deleted_at is null;

-- ============ 3. content_ir.kind_example ============
-- Version-bound samples, many per kind@version; replaces kind_definition.sample_data (migration in Stage 2).
create table if not exists content_ir.kind_example (
  id uuid primary key default gen_random_uuid(),
  kind_definition_id uuid not null references content_ir.kind_definition(id) on delete cascade,
  kind_version int not null,
  data jsonb not null,
  label text,
  description text,
  source text not null default 'authored' check (source in ('authored','captured','migrated','synthetic')),
  source_ref jsonb,
  is_canonical boolean not null default false,
  validation_status text not null default 'pending' check (validation_status in ('pending','passed','failed')),
  validated_at timestamptz,
  captured_at timestamptz not null default now(),
  organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  version int not null default 1,
  metadata jsonb not null default '{}'
);
create index if not exists kind_example_kind_definition_id_idx on content_ir.kind_example (kind_definition_id);
create unique index if not exists kind_example_canonical_unique
  on content_ir.kind_example (kind_definition_id, kind_version)
  where is_canonical and deleted_at is null;

-- ============ 4. Grants (mirror kind_edge) ============
grant select, insert, update, delete on content_ir.kind_component to authenticated;
grant select, insert, update, delete on content_ir.kind_surface to authenticated;
grant select, insert, update, delete on content_ir.kind_example to authenticated;
grant all on content_ir.kind_component to service_role;
grant all on content_ir.kind_surface to service_role;
grant all on content_ir.kind_example to service_role;

-- ============ 5. Registry: entity_types (components of content_ir_kind) ============
insert into platform.entity_types (token, schema_name, table_name, label, is_component, is_versioned, is_active)
select 'content_ir_kind_component','content_ir','kind_component','Kind Component',true,false,true
where not exists (select 1 from platform.entity_types where token='content_ir_kind_component');

insert into platform.entity_types (token, schema_name, table_name, label, is_component, is_versioned, is_active)
select 'content_ir_kind_surface','content_ir','kind_surface','Kind Surface',true,false,true
where not exists (select 1 from platform.entity_types where token='content_ir_kind_surface');

insert into platform.entity_types (token, schema_name, table_name, label, is_component, is_versioned, is_active)
select 'content_ir_kind_example','content_ir','kind_example','Kind Example',true,false,true
where not exists (select 1 from platform.entity_types where token='content_ir_kind_example');

-- ============ 6. Composition edges ============
insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select 'content_ir_kind_component','content_ir_kind','kind_definition_id','composition'
where not exists (select 1 from platform.entity_relationships where child_type='content_ir_kind_component' and kind='composition');

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select 'content_ir_kind_surface','content_ir_kind','kind_definition_id','composition'
where not exists (select 1 from platform.entity_relationships where child_type='content_ir_kind_surface' and kind='composition');

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select 'content_ir_kind_example','content_ir_kind','kind_definition_id','composition'
where not exists (select 1 from platform.entity_relationships where child_type='content_ir_kind_example' and kind='composition');

-- ============ 7. Canonical RLS (component variant — after edges exist) ============
select iam.apply_rls('content_ir','kind_component','content_ir_kind_component','component');
select iam.apply_rls('content_ir','kind_surface','content_ir_kind_surface','component');
select iam.apply_rls('content_ir','kind_example','content_ir_kind_example','component');

-- ============ 8. Shared triggers (mirror kind_edge: touch + stamp + org default) ============
create or replace trigger _touch_row before insert or update on content_ir.kind_component
  for each row execute function platform._touch_row();
create or replace trigger _stamp_actor before insert or update on content_ir.kind_component
  for each row execute function platform._stamp_actor();
create or replace trigger _stamp_org_default before insert or update on content_ir.kind_component
  for each row execute function public._stamp_org_default();

create or replace trigger _touch_row before insert or update on content_ir.kind_surface
  for each row execute function platform._touch_row();
create or replace trigger _stamp_actor before insert or update on content_ir.kind_surface
  for each row execute function platform._stamp_actor();
create or replace trigger _stamp_org_default before insert or update on content_ir.kind_surface
  for each row execute function public._stamp_org_default();

create or replace trigger _touch_row before insert or update on content_ir.kind_example
  for each row execute function platform._touch_row();
create or replace trigger _stamp_actor before insert or update on content_ir.kind_example
  for each row execute function platform._stamp_actor();
create or replace trigger _stamp_org_default before insert or update on content_ir.kind_example
  for each row execute function public._stamp_org_default();

-- ============ 9. Base bar: org NOT NULL + FKs (tables empty; instant) ============
do $$
declare t text;
begin
  foreach t in array array['kind_component','kind_surface','kind_example'] loop
    execute format('alter table content_ir.%I alter column organization_id set not null', t);
    if not exists (select 1 from information_schema.table_constraints
                   where table_schema='content_ir' and table_name=t and constraint_name=t||'_organization_id_fkey') then
      execute format('alter table content_ir.%I add constraint %I foreign key (organization_id) references iam.organizations(id)', t, t||'_organization_id_fkey');
    end if;
    if not exists (select 1 from information_schema.table_constraints
                   where table_schema='content_ir' and table_name=t and constraint_name=t||'_created_by_fkey') then
      execute format('alter table content_ir.%I add constraint %I foreign key (created_by) references auth.users(id)', t, t||'_created_by_fkey');
    end if;
    if not exists (select 1 from information_schema.table_constraints
                   where table_schema='content_ir' and table_name=t and constraint_name=t||'_updated_by_fkey') then
      execute format('alter table content_ir.%I add constraint %I foreign key (updated_by) references auth.users(id)', t, t||'_updated_by_fkey');
    end if;
  end loop;
end $$;

-- ============ 10. kind_definition capture-window columns ============
alter table content_ir.kind_definition add column if not exists capture_until timestamptz;
alter table content_ir.kind_definition add column if not exists capture_target int not null default 5;

-- ============ 11. workflow.node_outcome.output_kind ============
-- The kind of the persisted node output (Shape system); nullable, additive.
alter table workflow.node_outcome add column if not exists output_kind text;
