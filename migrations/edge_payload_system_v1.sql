-- Edge Payload System v1 (2026-07-19, Arman-approved)
--
-- Typed, validated payloads on `platform.associations` edges. Free-form
-- `metadata` stays for loose annotations (provenance markers, bridge tags);
-- REAL LOGIC an edge carries now lives in `payload`, typed by `payload_kind`
-- and validated on every write against a JSON Schema registered in
-- `platform.edge_payload_kind` (the kind-registry pattern applied to edges).
--
-- First adopter: agent<->surface bindings (`value_mappings` moves out of
-- metadata into payload_kind='surface_binding').
--
-- Components:
--   1. pg_jsonschema extension (Supabase-provided validator)
--   2. platform.edge_payload_kind — the schema registry (one row per kind)
--   3. platform.associations.payload_kind + payload columns
--   4. trg_validate_edge_payload — BEFORE INSERT/UPDATE validation (LOUD)
--   5. assoc_add extended with p_payload_kind / p_payload (backward compatible)
--   6. Seed 'surface_binding' kind + backfill existing binding edges
--   7. agent.menu_surface reads payload (metadata leg kept as legacy fallback)
--
-- Idempotent.

-- 1. Validator extension --------------------------------------------------
create extension if not exists pg_jsonschema with schema extensions;

-- 2. Schema registry ------------------------------------------------------
create table if not exists platform.edge_payload_kind (
  kind        text primary key,
  version     int  not null default 1,
  description text not null,
  json_schema jsonb not null,
  -- Optional endpoint contract: when set, the trigger enforces that edges of
  -- this kind connect exactly these entity types.
  source_type text,
  target_type text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table platform.edge_payload_kind is
  'Registry of typed edge-payload kinds for platform.associations. One row per kind: the JSON Schema every payload of that kind must satisfy (enforced by trg_validate_edge_payload), plus optional source/target entity-type contract. Writes are service/admin-side only.';

alter table platform.edge_payload_kind enable row level security;
drop policy if exists edge_payload_kind_read on platform.edge_payload_kind;
create policy edge_payload_kind_read on platform.edge_payload_kind
  for select to authenticated, anon using (true);
-- No insert/update/delete policies: registry writes are service-role/admin only.

-- 3. Payload columns on associations --------------------------------------
alter table platform.associations
  add column if not exists payload_kind text
    references platform.edge_payload_kind(kind) on update cascade,
  add column if not exists payload jsonb;

comment on column platform.associations.payload is
  'Typed edge payload, shape governed by payload_kind via platform.edge_payload_kind. Real logic lives here; metadata is for loose annotations only.';
comment on column platform.associations.payload_kind is
  'FK into platform.edge_payload_kind. NULL = plain edge (no typed payload). A non-null payload REQUIRES a kind.';

-- 4. Validation trigger (LOUD) --------------------------------------------
create or replace function platform.validate_edge_payload()
returns trigger
language plpgsql
security definer
set search_path to 'platform', 'extensions'
as $$
declare
  reg platform.edge_payload_kind%rowtype;
begin
  -- Payload without a kind is a defect, never silently accepted.
  if new.payload is not null and new.payload_kind is null then
    raise exception 'edge payload without payload_kind (% / % -> % / %): real logic in an untyped bag is exactly what this system exists to kill',
      new.source_type, new.source_id, new.target_type, new.target_id
      using errcode = '23514';
  end if;

  if new.payload_kind is null then
    return new;
  end if;

  select * into reg from platform.edge_payload_kind k where k.kind = new.payload_kind;
  if not found then
    raise exception 'unknown edge payload_kind "%" — register it in platform.edge_payload_kind first', new.payload_kind
      using errcode = '23514';
  end if;

  if reg.source_type is not null and reg.source_type <> new.source_type then
    raise exception 'payload_kind "%" requires source_type "%" but edge has "%"',
      new.payload_kind, reg.source_type, new.source_type using errcode = '23514';
  end if;
  if reg.target_type is not null and reg.target_type <> new.target_type then
    raise exception 'payload_kind "%" requires target_type "%" but edge has "%"',
      new.payload_kind, reg.target_type, new.target_type using errcode = '23514';
  end if;

  if new.payload is null then
    raise exception 'payload_kind "%" set but payload is null', new.payload_kind
      using errcode = '23514';
  end if;

  if not extensions.json_matches_schema(reg.json_schema::json, new.payload::json) then
    raise exception 'edge payload failed schema validation for kind "%" (v%): %',
      new.payload_kind, reg.version, new.payload::text using errcode = '23514';
  end if;

  return new;
end $$;

drop trigger if exists trg_validate_edge_payload on platform.associations;
create trigger trg_validate_edge_payload
  before insert or update of payload, payload_kind on platform.associations
  for each row execute function platform.validate_edge_payload();

-- 5. assoc_add gains payload params (backward compatible) ------------------
create or replace function public.assoc_add(
  p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid,
  p_org_id uuid default null, p_label text default null,
  p_metadata jsonb default '{}'::jsonb, p_role text default null,
  p_position integer default null,
  p_payload_kind text default null, p_payload jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid := p_org_id; v_id uuid; v_schema text; v_table text;
begin
  if v_org is null then
    if    p_target_type='scope'    then select organization_id into v_org from context.scopes      where id=p_target_id;
    elsif p_target_type='task'     then select organization_id into v_org from workspace.tasks     where id=p_target_id;
    elsif p_target_type='project'  then select organization_id into v_org from workspace.projects  where id=p_target_id;
    elsif p_target_type='category' then select organization_id into v_org from platform.categories where id=p_target_id;
    end if;
  end if;
  if v_org is null then
    select et.schema_name, et.table_name into v_schema, v_table
      from platform.entity_types et where et.token = p_source_type and et.is_active;
    if v_schema is not null then
      begin
        execute format('select organization_id from %I.%I where id = $1', v_schema, v_table) into v_org using p_source_id;
      exception when undefined_column or undefined_table then v_org := null;
      end;
    end if;
  end if;
  if v_org is null or not iam.has_org_access(v_org) then
    raise exception 'assoc_add: no org access (org=%, %/% -> %/% role=%)', v_org, p_source_type, p_source_id, p_target_type, p_target_id, p_role
      using errcode = '42501';
  end if;
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, role, label, position, metadata, payload_kind, payload, created_by)
  values (p_source_type, p_source_id, p_target_type, p_target_id, v_org, p_role, p_label, p_position, coalesce(p_metadata,'{}'::jsonb), p_payload_kind, p_payload, auth.uid())
  on conflict (source_type, source_id, target_type, target_id, role)
  do update set label        = coalesce(excluded.label, platform.associations.label),
                position     = coalesce(excluded.position, platform.associations.position),
                metadata     = excluded.metadata,
                -- A payload-bearing upsert replaces the payload wholesale;
                -- a payload-less upsert leaves any existing payload intact.
                payload_kind = coalesce(excluded.payload_kind, platform.associations.payload_kind),
                payload      = case when excluded.payload_kind is not null
                                    then excluded.payload
                                    else platform.associations.payload end
  returning id into v_id;
  return v_id;
end $$;

-- 6. Seed the surface_binding kind + backfill ------------------------------
insert into platform.edge_payload_kind (kind, version, description, json_schema, source_type, target_type)
values (
  'surface_binding', 1,
  'Agent bound to a UI surface: per-variable value mappings resolved at launch (features/surfaces/utils/value-mapping-resolver.ts). Tier is the edge role (binding:*).',
  '{
    "type": "object",
    "properties": {
      "value_mappings": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "properties": {
            "mapType": { "enum": ["surface_value", "direct_value", "prompt_user", "unmapped"] },
            "target": { "type": "string" },
            "required": { "type": "boolean" },
            "prompt": { "type": "string" },
            "defaultValue": { "type": "string" }
          },
          "required": ["mapType"],
          "additionalProperties": false
        }
      }
    },
    "required": ["value_mappings"],
    "additionalProperties": false
  }'::jsonb,
  'agent', 'surface'
)
on conflict (kind) do update
  set version = excluded.version,
      description = excluded.description,
      json_schema = excluded.json_schema,
      source_type = excluded.source_type,
      target_type = excluded.target_type,
      updated_at = now();

-- Backfill existing binding edges: value_mappings metadata -> payload, then
-- strip the key from metadata (single source of truth; provenance keys stay).
update platform.associations a
set payload_kind = 'surface_binding',
    payload = jsonb_build_object('value_mappings', coalesce(a.metadata->'value_mappings', '{}'::jsonb)),
    metadata = a.metadata - 'value_mappings'
where a.source_type = 'agent' and a.target_type = 'surface'
  and a.payload_kind is null;

-- 7. menu_surface reads payload + RESTORES tier scoping --------------------
-- The metadata leg is LEGACY fallback only (edges written before this
-- migration by external writers, if any) — scheduled for removal once all
-- writers are confirmed on assoc_add v2.
--
-- SECURITY RESTORE: the live view was found (2026-07-19) WITHOUT the
-- tier-scoping WHERE that migrations/menu_surface_tier_scoping.sql added on
-- 2026-07-13 — some later CREATE OR REPLACE regressed it, re-exposing other
-- users' user-tier and foreign orgs' org-tier bindings. This definition
-- re-includes the scoping clause verbatim. That WHERE is the security
-- boundary (associations RLS does not apply through the owner-rights view).
create or replace view agent.menu_surface as
 select a.id,
    a.source_id as agent_id,
    us.name as surface_name,
    nullif(a.metadata ->> 'user_id', '')::uuid as user_id,
    a.organization_id,
    nullif(a.metadata ->> 'project_id', '')::uuid as project_id,
    nullif(a.metadata ->> 'task_id', '')::uuid as task_id,
    coalesce(a.payload -> 'value_mappings', a.metadata -> 'value_mappings', '{}'::jsonb) as value_mappings,
    coalesce((a.metadata ->> 'version')::integer, 1) as version,
    coalesce((a.metadata ->> 'visibility')::platform.visibility, 'internal'::platform.visibility) as visibility,
    a.created_at,
    a.created_at as updated_at,
    a.created_by,
    a.created_by as updated_by,
    c.name as agent_name,
    c.description as agent_description,
    c.agent_type,
    c.category as agent_category,
    c.tags as agent_tags,
    c.variable_definitions as agent_variable_definitions,
    c.output_schema as agent_output_schema,
    c.is_active as agent_is_active,
    c.card_visibility as agent_card_visibility,
    to_jsonb(c.*) as agent,
        case
            when o.id is not null then jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'description', o.description, 'logo_url', o.logo_url, 'is_personal', o.is_personal, 'is_system', o.is_system)
            else null::jsonb
        end as organizations,
    a.role
   from platform.associations a
     join agent.card c on c.id = a.source_id
     left join iam.organizations o on o.id = a.organization_id
     join ui.ui_surface us on us.id = a.target_id
  where a.source_type = 'agent'::text and a.target_type = 'surface'::text
    and (
      a.role = 'binding:global'
      or a.role = 'binding:u:' || (select auth.uid())::text
      or ((a.role like 'binding:o:%' or a.role like 'binding:p:%' or a.role like 'binding:t:%')
          and iam.has_org_access(a.organization_id))
    );

notify pgrst, 'reload schema';
