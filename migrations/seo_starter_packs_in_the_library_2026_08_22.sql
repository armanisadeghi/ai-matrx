-- 2026-08-22 — Starter packs INSIDE the Matrx Library (Arman ruled D1–D8, see
-- common-docs/systems/marketing/seo/seo-keywords/starter-packs-in-the-library-PLAN.md).
--
-- What this does, in order:
--   A. The ONE library read lane becomes generic: the hard-coded `data_store` arm inside
--      iam.has_access_for_base / iam.is_discoverable_base now reads platform.entity_grants
--      for ANY entity type (public.user_can_read_via_library_grant). Packs keep their
--      canonical `entity` RLS untouched — they simply move to the Library org with
--      visibility='internal', so a row is readable only through a grant, a curatorship, or
--      the admin lane. Items / template rules inherit through entity_relationships.
--   B. Generic Library RPC family over platform.entity_grants — library_publish /
--      library_revoke / library_subscribe / library_unsubscribe / library_list_grants /
--      library_entitlement. rag.library_* become one-line delegates (DELETE them once the
--      repointed aidream services/rag/library_grants.py is deployed). Audit log gains
--      entity_type / entity_id.
--   C. Subscribe IS adopt (D2): library_subscribe('seo_starter_pack', …, p_target{site_id,…})
--      writes the org subscription and calls the materializer seo.adopt_starter_pack, whose
--      public EXECUTE is revoked — no second entry point.
--   D. Pack authoring RPCs for admins + industry curators (D5), status gate (D3), live
--      version bump (D4), draft-from-proposal landing for the proposer agent, new-version fork.
--   E. Catalog/detail filter by entitlement. Industries for the three packs. Library move.
--      Global default pack seeded empty (D8). Mandate row seo.starter_pack_proposer.
-- Idempotent. Ledger: public._schema_migrations source='matrx-frontend'.

-- ───────────────────────── A. generic library grant lane ─────────────────────────
create or replace function public.user_can_read_via_library_grant(p_user uuid, p_type text, p_id uuid)
returns boolean language plpgsql stable security definer
set search_path to 'public', 'platform', 'iam' as $function$
begin
  return p_user is not null and p_id is not null and p_type is not null
     and ((select auth.uid()) is null or (select auth.uid()) = p_user or public.is_admin())
     and exists (
       select 1 from platform.entity_grants g
       where g.entity_type = p_type and g.entity_id = p_id
         and (g.audience = 'global'
           or (g.audience = 'organization' and g.organization_id in (
                 select om.organization_id from iam.organization_member om where om.user_id = p_user))
           or (g.audience = 'industry' and exists (
                 select 1 from iam.org_industries oi
                 join iam.organization_member om on om.organization_id = oi.organization_id
                 where om.user_id = p_user and oi.industry_id = g.industry_id))));
end; $function$;

create or replace function public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid)
returns boolean language sql stable security definer
set search_path to 'public', 'rag', 'iam' as $function$
  select public.user_can_read_via_library_grant(p_user, 'data_store', p_store);
$function$;

-- Industry curators read (and, while draft/proposed, write) the packs of their industry.
create or replace function public.is_pack_curator(p_user uuid, p_pack_id uuid)
returns boolean language sql stable security definer
set search_path to 'public', 'seo', 'iam' as $function$
  select exists (
    select 1 from seo.starter_pack p
    join iam.industry_curators ic on ic.industry_id = p.industry_id and ic.deleted_at is null
    where p.id = p_pack_id and ic.user_id = p_user);
$function$;

create or replace function iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)
 returns boolean language plpgsql stable security definer cost 10000
 set search_path to 'public', 'platform', 'iam', 'rag' as $function$
declare
  v_schema text; v_table text; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_id uuid; v_parent_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;
begin
  if v_uid is null then return false; end if;
  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et where et.token = p_type and et.is_active;
  if v_schema is null then return false; end if;

  -- THE LIBRARY LANE (generic since 2026-08-22; was a data_store-only arm). A grant on
  -- (entity_type, entity_id) reaching the user conveys viewer — and viewer only.
  if p_required = 'viewer'::public.permission_level
     and public.user_can_read_via_library_grant(v_uid, p_type, p_id)
  then return true; end if;
  if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id) then return true; end if;

  v_attrs := platform.entity_row_access_attrs(v_schema, v_table, p_id);
  v_vis := v_attrs.o_vis; v_owner := v_attrs.o_owner; v_org := v_attrs.o_org; v_found := v_attrs.o_found;
  if not coalesce(v_found, false) then return false; end if;
  if v_owner = v_uid then return true; end if;
  if p_required = 'viewer'::public.permission_level and v_org is not null then
    if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
    if v_is_org_admin then return true; end if;
  end if;
  if p_include_public and v_vis = 'public'::platform.visibility and p_required = 'viewer'::public.permission_level then return true; end if;
  if p_include_public and p_required = 'viewer'::public.permission_level
     and v_vis >= 'internal'::platform.visibility and v_org is not null
     and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
  if v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
     and public.is_super_admin_for(v_uid) then return true; end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;
  if exists (
    select 1 from iam.memberships m
    join iam.membership_grant g on g.member_role = m.role and g.container_type in (p_type, '*')
    where m.container_type = p_type and m.container_id = p_id and m.user_id = v_uid
      and m.deleted_at is null and g.confers >= p_required) then return true; end if;
  if p_required = 'viewer'::public.permission_level and public._edu_can_read_via_assignment(v_uid, p_type, p_id) then return true; end if;
  for rec in
    select r.container_type, r.container_id from platform.reachability r
    where r.item_type = p_type and r.item_id = p_id and r.max_level >= p_required
  loop
    if (rec.container_type, rec.container_id) is distinct from (p_type, p_id)
       and iam.has_access_for_base(v_uid, rec.container_type, rec.container_id, p_required,
             p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility))
    then return true; end if;
  end loop;
  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
    if v_is_org_admin then return true; end if;
    if p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  end if;
  v_parent_include_public := p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility);
  for rec in
    select er.parent_type, er.fk_column from platform.entity_relationships er
    where er.child_type = p_type and er.kind in ('composition', 'containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    execute format('select %I from %I.%I where id = $1', rec.fk_column, v_schema, v_table) into v_parent_id using p_id;
    if v_parent_id is not null
       and iam.has_access_for_base(v_uid, rec.parent_type, v_parent_id, p_required, v_parent_include_public)
    then return true; end if;
  end loop;
  return false;
end; $function$;

create or replace function iam.is_discoverable_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)
 returns boolean language plpgsql stable security definer
 set search_path to 'public', 'platform', 'iam', 'rag' as $function$
declare
  v_schema text; v_table text; v_is_component boolean; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_type text; v_parent_col text; v_parent_id uuid; rec record;
begin
  if v_uid is null then return false; end if;
  select schema_name, table_name, coalesce(is_component, false) into v_schema, v_table, v_is_component
  from platform.entity_types where token = p_type and is_active;
  if v_schema is null then return false; end if;
  if v_is_component then
    select parent_type, fk_column into v_parent_type, v_parent_col
    from platform.entity_relationships where child_type = p_type and kind = 'composition' limit 1;
    if v_parent_type is null then return false; end if;
    execute format('select %I from %I.%I where id=$1', v_parent_col, v_schema, v_table) into v_parent_id using p_id;
    if v_parent_id is null then return false; end if;
    return iam.is_discoverable_base(v_uid, v_parent_type, v_parent_id, p_required, p_include_public);
  end if;
  if p_required = 'viewer' and public.user_can_read_via_library_grant(v_uid, p_type, p_id) then return true; end if;
  if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id) then return true; end if;
  select * into v_vis, v_owner, v_org, v_found from platform.entity_row_access_attrs(v_schema, v_table, p_id);
  if not coalesce(v_found, false) then return false; end if;
  if v_owner = v_uid then return true; end if;
  if p_required = 'viewer' and v_org is not null and public.is_org_admin_for(v_uid, v_org) then return true; end if;
  if p_include_public and v_vis = 'public' and p_required = 'viewer' then return true; end if;
  if p_include_public and p_required = 'viewer' and v_vis >= 'internal'::platform.visibility and v_org is not null
     and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
  if v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
     and public.is_super_admin_for(v_uid) then return true; end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;
  if exists (
    select 1 from iam.memberships m
    join iam.membership_grant g on g.member_role = m.role and g.container_type in (p_type, '*')
    where m.container_type = p_type and m.container_id = p_id and m.user_id = v_uid and m.deleted_at is null and g.confers >= p_required
  ) then return true; end if;
  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if public.is_org_admin_for(v_uid, v_org) then return true; end if;
    if p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  end if;
  if v_vis >= 'internal'::platform.visibility then
    for rec in select parent_type, fk_column from platform.entity_relationships where child_type = p_type and kind = 'containment' loop
      execute format('select %I from %I.%I where id=$1', rec.fk_column, v_schema, v_table) into v_parent_id using p_id;
      if v_parent_id is not null and iam.is_discoverable_base(v_uid, rec.parent_type, v_parent_id, p_required, false) then return true; end if;
    end loop;
  end if;
  return false;
end; $function$;

-- Items and template rules read THROUGH their pack (the library lane cascades by FK).
insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
values ('seo_starter_pack_item', 'seo_starter_pack', 'pack_id', 'composition', 'A pack item is part of its pack; access is the pack''s (library grant / curator / admin).'),
       ('seo_keyword_class_rule', 'seo_starter_pack', 'pack_id', 'containment', 'A template rule (is_template, pack_id) reads through its pack. Site rules keep site_id composition.')
on conflict (child_type, parent_type, fk_column) do nothing;

-- Purge trigger: the referential integrity a generic entity_id cannot carry (STATE.md P17).
create or replace function platform.entity_grants_purge_seo_starter_pack()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  delete from platform.entity_grants where entity_type = 'seo_starter_pack' and entity_id = old.id;
  return old;
end $function$;
drop trigger if exists entity_grants_purge_seo_starter_pack on seo.starter_pack;
create trigger entity_grants_purge_seo_starter_pack after delete on seo.starter_pack
for each row execute function platform.entity_grants_purge_seo_starter_pack();

-- ───────────────────────── B. generic Library RPC family ─────────────────────────
alter table rag.library_audit_log
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;
update rag.library_audit_log set entity_type = 'data_store', entity_id = data_store_id
 where data_store_id is not null and entity_type is null;
create index if not exists library_audit_log_entity_idx on rag.library_audit_log (entity_type, entity_id);

-- Resolve (schema, table) + the Library-org ownership of any registered entity.
create or replace function public._library_entity_owner(p_entity_type text, p_entity_id uuid)
returns uuid language plpgsql stable security definer set search_path to 'public', 'platform' as $function$
declare v_schema text; v_table text; v_org uuid;
begin
  select schema_name, table_name into v_schema, v_table from platform.entity_types where token = p_entity_type and is_active;
  if v_schema is null then raise exception 'library: unknown entity type %', p_entity_type; end if;
  execute format('select organization_id from %I.%I where id = $1', v_schema, v_table) into v_org using p_entity_id;
  if v_org is null then raise exception 'library: % % not found', p_entity_type, p_entity_id; end if;
  return v_org;
end $function$;

create or replace function public._library_audit(p_actor uuid, p_action text, p_entity_type text, p_entity_id uuid,
                                                 p_industry_id uuid, p_org uuid, p_detail jsonb)
returns void language sql security definer set search_path to 'public', 'rag' as $function$
  insert into rag.library_audit_log(actor_user_id, action, data_store_id, entity_type, entity_id, industry_id, target_organization_id, detail)
  values (p_actor, p_action, case when p_entity_type = 'data_store' then p_entity_id end, p_entity_type, p_entity_id,
          p_industry_id, p_org, coalesce(p_detail, '{}'::jsonb));
$function$;

-- The per-type publish gate (D3). Data stores: no extra rule (issuance is the admin's call,
-- exactly as before). Packs: industry/global audiences need `ratified`; a direct
-- organization grant is the PILOT lane and accepts `proposed` too.
create or replace function public._library_publish_gate(p_entity_type text, p_entity_id uuid, p_audience text)
returns void language plpgsql stable security definer set search_path to 'public', 'seo' as $function$
declare v_status text;
begin
  if p_entity_type = 'seo_starter_pack' then
    select status into v_status from seo.starter_pack where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'library: pack % not found', p_entity_id; end if;
    if p_audience in ('industry', 'global') and v_status <> 'ratified' then
      raise exception 'library: a pack must be ratified before it is published to an industry or everyone (status is %)', v_status
        using errcode = 'P0001';
    end if;
    if p_audience = 'organization' and v_status not in ('proposed', 'ratified') then
      raise exception 'library: only a proposed or ratified pack can be piloted with an organization (status is %)', v_status
        using errcode = 'P0001';
    end if;
  end if;
end $function$;

create or replace function public.library_publish(p_entity_type text, p_entity_id uuid, p_audience text,
    p_industry_id uuid default null, p_organization_id uuid default null, p_actor uuid default null)
returns platform.entity_grants language plpgsql security definer
set search_path to 'public', 'platform', 'rag', 'iam' as $function$
declare v_actor uuid; v_lib uuid; v_row platform.entity_grants;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  perform public._library_assert_admin(v_actor);
  v_lib := public.system_org_id('library');
  if v_lib is null then raise exception 'Matrx Library org not configured (system_orgs.key=''library'')'; end if;
  if public._library_entity_owner(p_entity_type, p_entity_id) <> v_lib then
    raise exception '% % is not a Matrx Library resource', p_entity_type, p_entity_id;
  end if;
  perform public._library_publish_gate(p_entity_type, p_entity_id, p_audience);
  select * into v_row from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = p_audience
     and industry_id is not distinct from p_industry_id and organization_id is not distinct from p_organization_id
   limit 1;
  if v_row.id is null then
    insert into platform.entity_grants(entity_type, entity_id, audience, industry_id, organization_id, granted_by)
    values (p_entity_type, p_entity_id, p_audience, p_industry_id, p_organization_id, v_actor)
    returning * into v_row;
  end if;
  perform public._library_audit(v_actor, 'grant_publish', p_entity_type, p_entity_id, p_industry_id, p_organization_id,
                                jsonb_build_object('audience', p_audience));
  return v_row;
end $function$;

create or replace function public.library_revoke(p_grant_id uuid, p_actor uuid default null)
returns void language plpgsql security definer set search_path to 'public', 'platform', 'rag' as $function$
declare v_actor uuid; v_row platform.entity_grants;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  perform public._library_assert_admin(v_actor);
  select * into v_row from platform.entity_grants where id = p_grant_id;
  if v_row.id is null then return; end if;
  delete from platform.entity_grants where id = p_grant_id;
  perform public._library_audit(v_actor, 'grant_revoke', v_row.entity_type, v_row.entity_id, v_row.industry_id, v_row.organization_id,
                                jsonb_build_object('audience', v_row.audience));
end $function$;

-- Who may see the grant list of a resource: any admin, the data store's creator, a pack's curator.
create or replace function public.library_list_grants(p_entity_type text, p_entity_id uuid)
returns table(id uuid, audience text, industry_id uuid, industry_name text, industry_slug text,
              organization_id uuid, organization_name text, granted_by uuid, created_at timestamptz)
language plpgsql stable security definer set search_path to 'public', 'platform', 'rag', 'iam', 'seo' as $function$
declare v_user uuid := auth.uid();
begin
  if not (auth.role() = 'service_role' or public.is_admin()
          or (p_entity_type = 'data_store' and exists (select 1 from rag.data_stores s where s.id = p_entity_id and s.created_by = v_user))
          or (p_entity_type = 'seo_starter_pack' and public.is_pack_curator(v_user, p_entity_id))) then
    raise exception 'insufficient permission on %', p_entity_type using errcode = '42501';
  end if;
  return query
  select g.id, g.audience, g.industry_id, i.name, i.slug, g.organization_id, o.name, g.granted_by, g.created_at
  from platform.entity_grants g
  left join iam.industries i on i.id = g.industry_id
  left join iam.organizations o on o.id = g.organization_id
  where g.entity_type = p_entity_type and g.entity_id = p_entity_id
  order by g.audience, g.created_at;
end $function$;

-- How (if at all) an organization is entitled to a resource: organization | industry | global | null.
create or replace function public.library_entitlement(p_entity_type text, p_entity_id uuid, p_organization_id uuid)
returns text language sql stable security definer set search_path to 'public', 'platform', 'iam' as $function$
  select case
    when exists (select 1 from platform.entity_grants g where g.entity_type = p_entity_type and g.entity_id = p_entity_id
                   and g.audience = 'organization' and g.organization_id = p_organization_id) then 'organization'
    when exists (select 1 from platform.entity_grants g join iam.org_industries oi on oi.industry_id = g.industry_id
                  where g.entity_type = p_entity_type and g.entity_id = p_entity_id
                    and g.audience = 'industry' and oi.organization_id = p_organization_id) then 'industry'
    when exists (select 1 from platform.entity_grants g where g.entity_type = p_entity_type and g.entity_id = p_entity_id
                   and g.audience = 'global') then 'global'
  end;
$function$;

-- SUBSCRIBE IS ADOPT (D2). The ONE user-side write for "we use this":
--   1. the caller must be a member of the org;
--   2. the org must be entitled (data_store: discoverable — the self-serve join, Decision 1;
--      seo_starter_pack: ratified + reachable by grant, or a direct pilot grant, or admin);
--   3. the organization-audience grant row IS the subscription (idempotent);
--   4. per-type materializer: a pack with p_target.site_id copies onto that site through
--      seo.adopt_starter_pack (public EXECUTE revoked below — no second door).
create or replace function public.library_subscribe(p_entity_type text, p_entity_id uuid, p_organization_id uuid,
                                                    p_target jsonb default null, p_actor uuid default null)
returns jsonb language plpgsql security definer
set search_path to 'public', 'platform', 'rag', 'iam', 'seo' as $function$
declare v_actor uuid; v_row platform.entity_grants; v_status text; v_result jsonb := '{}'::jsonb; v_via text;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  if v_actor is null or not exists (
      select 1 from iam.organization_member om where om.organization_id = p_organization_id and om.user_id = v_actor) then
    raise exception 'not authorized: caller is not a member of org %', p_organization_id using errcode = '42501';
  end if;

  if p_entity_type = 'data_store' then
    if not exists (select 1 from rag.data_stores s where s.id = p_entity_id and s.discoverable) then
      raise exception 'store % is not discoverable', p_entity_id;
    end if;
  elsif p_entity_type = 'seo_starter_pack' then
    select status into v_status from seo.starter_pack where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'seo_pack_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('seo_starter_pack', p_entity_id, p_organization_id);
    if not (public.is_admin()
            or v_via = 'organization'                                   -- pilot or prior subscription
            or (v_via in ('industry', 'global') and v_status = 'ratified')) then
      raise exception 'library: organization % is not entitled to pack % (status %, via %)',
        p_organization_id, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;
  else
    raise exception 'library: % cannot be subscribed to', p_entity_type;
  end if;

  select * into v_row from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = 'organization' and organization_id = p_organization_id
   limit 1;
  if v_row.id is null then
    insert into platform.entity_grants(entity_type, entity_id, audience, organization_id, granted_by)
    values (p_entity_type, p_entity_id, 'organization', p_organization_id, v_actor)
    returning * into v_row;
  end if;

  if p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    v_result := seo.adopt_starter_pack(
      (p_target->>'site_id')::uuid, p_entity_id,
      case when p_target ? 'include' then (select array_agg(x) from jsonb_array_elements_text(p_target->'include') x) end,
      case when p_target ? 'topic_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'topic_ids') x) end,
      coalesce((p_target->>'seed_guidelines')::boolean, true),
      p_target->'geo_places', p_target->'geo_place_ids',
      case when p_target ? 'item_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'item_ids') x) end,
      case when p_target ? 'rule_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'rule_ids') x) end,
      coalesce((p_target->>'reset')::boolean, false));
  end if;

  perform public._library_audit(v_actor, 'self_subscribe', p_entity_type, p_entity_id, null, p_organization_id,
                                jsonb_build_object('target', coalesce(p_target, '{}'::jsonb) - 'geo_places' - 'geo_place_ids'));
  return v_result || jsonb_build_object('grant_id', v_row.id, 'subscribed', true);
end $function$;

-- Unsubscribe removes the org's subscription row only. A site's adopted rows are the
-- site's own rulings (P13) and are never touched.
create or replace function public.library_unsubscribe(p_entity_type text, p_entity_id uuid, p_organization_id uuid, p_actor uuid default null)
returns void language plpgsql security definer set search_path to 'public', 'platform', 'rag', 'iam' as $function$
declare v_actor uuid;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  if v_actor is null or not exists (
      select 1 from iam.organization_member om where om.organization_id = p_organization_id and om.user_id = v_actor) then
    raise exception 'not authorized: caller is not a member of org %', p_organization_id using errcode = '42501';
  end if;
  delete from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = 'organization' and organization_id = p_organization_id;
  perform public._library_audit(v_actor, 'self_unsubscribe', p_entity_type, p_entity_id, null, p_organization_id, '{}'::jsonb);
end $function$;

-- rag.* delegates — the typed data-store API. DELETE these four once the repointed
-- aidream services/rag/library_grants.py (public.library_* with 'data_store') is deployed.
create or replace function rag.library_grant_publish(p_store_id uuid, p_audience text, p_industry_id uuid default null,
                                                      p_organization_id uuid default null, p_actor uuid default null)
returns rag.data_store_grants language plpgsql security definer set search_path to 'public', 'rag' as $function$
declare v_g platform.entity_grants; v_row rag.data_store_grants;
begin
  v_g := public.library_publish('data_store', p_store_id, p_audience, p_industry_id, p_organization_id, p_actor);
  select * into v_row from rag.data_store_grants where id = v_g.id;
  return v_row;
end $function$;

create or replace function rag.library_grant_revoke(p_grant_id uuid, p_actor uuid default null)
returns void language sql security definer set search_path to 'public', 'rag' as $function$
  select public.library_revoke(p_grant_id, p_actor);
$function$;

create or replace function rag.library_subscribe(p_store_id uuid, p_organization_id uuid, p_actor uuid default null)
returns rag.data_store_grants language plpgsql security definer set search_path to 'public', 'rag' as $function$
declare v_r jsonb; v_row rag.data_store_grants;
begin
  v_r := public.library_subscribe('data_store', p_store_id, p_organization_id, null, p_actor);
  select * into v_row from rag.data_store_grants where id = (v_r->>'grant_id')::uuid;
  return v_row;
end $function$;

create or replace function rag.library_unsubscribe(p_store_id uuid, p_organization_id uuid, p_actor uuid default null)
returns void language sql security definer set search_path to 'public', 'rag' as $function$
  select public.library_unsubscribe('data_store', p_store_id, p_organization_id, p_actor);
$function$;

-- The materializer is internal now: reachable only through public.library_subscribe.
revoke execute on function seo.adopt_starter_pack(uuid, uuid, text[], uuid[], boolean, jsonb, jsonb, uuid[], uuid[], boolean)
  from public, anon, authenticated;
grant execute on function public.library_publish(text, uuid, text, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.library_revoke(uuid, uuid) to authenticated, service_role;
grant execute on function public.library_subscribe(text, uuid, uuid, jsonb, uuid) to authenticated, service_role;
grant execute on function public.library_unsubscribe(text, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.library_list_grants(text, uuid) to authenticated, service_role;
grant execute on function public.library_entitlement(text, uuid, uuid) to authenticated, service_role;
revoke execute on function public._library_entity_owner(text, uuid) from public, anon, authenticated;
revoke execute on function public._library_audit(uuid, text, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._library_publish_gate(text, uuid, text) from public, anon, authenticated;

-- ───────────────────────── C. authoring gate, status, version, RPCs ─────────────────────────
-- Who may AUTHOR a pack: any platform admin; or a curator of the pack's industry while the
-- pack is still draft/proposed (D5). Ratify / retire / publish stay admin-only.
create or replace function seo._pack_assert_author(p_pack_id uuid)
returns void language plpgsql stable security definer set search_path to 'public', 'seo', 'iam' as $function$
declare v_uid uuid := auth.uid(); v_status text;
begin
  if public.is_admin() then return; end if;
  select status into v_status from seo.starter_pack where id = p_pack_id and deleted_at is null;
  if v_status is null then raise exception 'seo_pack_not_found: %', p_pack_id using errcode = 'P0002'; end if;
  if v_uid is not null and public.is_pack_curator(v_uid, p_pack_id) and v_status in ('draft', 'proposed') then return; end if;
  raise exception 'seo_pack_author_denied: admins, or curators of the pack''s industry while draft/proposed' using errcode = '42501';
end $function$;

create or replace function seo._pack_assert_creator(p_industry_id uuid)
returns void language plpgsql stable security definer set search_path to 'public', 'seo', 'iam' as $function$
declare v_uid uuid := auth.uid();
begin
  if public.is_admin() then return; end if;
  if v_uid is not null and p_industry_id is not null and public.is_industry_curator(v_uid, p_industry_id) then return; end if;
  raise exception 'seo_pack_author_denied: admins, or curators of the industry the pack is for' using errcode = '42501';
end $function$;

-- Every content edit bumps pack_version (D4 — live edits, counted; "changed since you adopted"
-- is a join on the version + item provenance the site rows already carry).
alter table seo.starter_pack
  add column if not exists pack_version integer not null default 1,
  add column if not exists supersedes_pack_id uuid references seo.starter_pack(id) on delete set null,
  add column if not exists proposed_industry text,
  add column if not exists proposed_by uuid,
  add column if not exists proposed_at timestamptz;

create or replace function seo._pack_touch(p_pack_id uuid)
returns void language sql security definer set search_path to 'seo' as $function$
  update seo.starter_pack set pack_version = pack_version + 1, updated_at = now(), updated_by = auth.uid()
   where id = p_pack_id;
$function$;

-- Pack core. p_pack.id null = create (Library org, visibility internal, status draft).
create or replace function seo.starter_pack_save(p_pack jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'seo', 'iam', 'platform' as $function$
declare v_id uuid := nullif(p_pack->>'id', '')::uuid; v_lib uuid := public.system_org_id('library');
        v_row seo.starter_pack; v_uid uuid := auth.uid(); v_industry uuid := nullif(p_pack->>'industry_id', '')::uuid;
begin
  if v_id is null then
    perform seo._pack_assert_creator(v_industry);
    insert into seo.starter_pack (slug, name, industry, industry_id, summary, description, geo_model, guidelines,
                                  source_notes, proposed_industry, status, organization_id, visibility, created_by, updated_by, metadata)
    values (coalesce(nullif(p_pack->>'slug',''), regexp_replace(lower(p_pack->>'name'), '[^a-z0-9]+', '-', 'g')),
            p_pack->>'name', p_pack->>'industry', v_industry, p_pack->>'summary', p_pack->>'description',
            coalesce(nullif(p_pack->>'geo_model',''), 'national'), p_pack->>'guidelines', p_pack->>'source_notes',
            p_pack->>'proposed_industry', 'draft', v_lib, 'internal', v_uid, v_uid,
            coalesce(p_pack->'metadata', '{}'::jsonb))
    returning * into v_row;
    perform public._library_audit(v_uid, 'pack_create', 'seo_starter_pack', v_row.id, v_industry, null, jsonb_build_object('slug', v_row.slug));
  else
    perform seo._pack_assert_author(v_id);
    update seo.starter_pack set
      name = coalesce(p_pack->>'name', name),
      industry = coalesce(p_pack->>'industry', industry),
      industry_id = case when p_pack ? 'industry_id' then v_industry else industry_id end,
      summary = case when p_pack ? 'summary' then p_pack->>'summary' else summary end,
      description = case when p_pack ? 'description' then p_pack->>'description' else description end,
      geo_model = coalesce(nullif(p_pack->>'geo_model',''), geo_model),
      guidelines = case when p_pack ? 'guidelines' then p_pack->>'guidelines' else guidelines end,
      source_notes = case when p_pack ? 'source_notes' then p_pack->>'source_notes' else source_notes end,
      proposed_industry = case when p_pack ? 'proposed_industry' then p_pack->>'proposed_industry' else proposed_industry end,
      metadata = case when p_pack ? 'metadata' then coalesce(metadata,'{}'::jsonb) || (p_pack->'metadata') else metadata end,
      pack_version = pack_version + 1, updated_at = now(), updated_by = v_uid
    where id = v_id and deleted_at is null
    returning * into v_row;
    perform public._library_audit(v_uid, 'pack_save', 'seo_starter_pack', v_id, v_row.industry_id, null, jsonb_build_object('keys', (select jsonb_agg(k) from jsonb_object_keys(p_pack) k)));
  end if;
  return to_jsonb(v_row) - 'proposal';
end $function$;

-- One item (topic worth / value band / geo band / geo archetype). p_item.id null = create.
create or replace function seo.starter_pack_item_save(p_item jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'seo', 'platform' as $function$
declare v_id uuid := nullif(p_item->>'id','')::uuid; v_pack uuid := (p_item->>'pack_id')::uuid; v_row seo.starter_pack_item;
        v_lib uuid := public.system_org_id('library'); v_uid uuid := auth.uid();
begin
  if v_id is not null then select pack_id into v_pack from seo.starter_pack_item where id = v_id; end if;
  perform seo._pack_assert_author(v_pack);
  if v_id is null then
    insert into seo.starter_pack_item (pack_id, item_kind, topic_id, weight, lead_quality, service_match, value, label, description,
                                       config, area_kind, match_tokens, geo_band, sort, notes, organization_id, visibility, created_by, updated_by)
    values (v_pack, p_item->>'item_kind', nullif(p_item->>'topic_id','')::uuid, (p_item->>'weight')::numeric,
            nullif(p_item->>'lead_quality',''), nullif(p_item->>'service_match',''), nullif(p_item->>'value',''), nullif(p_item->>'label',''),
            p_item->>'description', coalesce(p_item->'config', '{}'::jsonb), nullif(p_item->>'area_kind',''),
            coalesce(p_item->'match_tokens', '[]'::jsonb), nullif(p_item->>'geo_band',''), coalesce((p_item->>'sort')::int, 0),
            p_item->>'notes', v_lib, 'internal', v_uid, v_uid)
    returning * into v_row;
  else
    update seo.starter_pack_item set
      topic_id = case when p_item ? 'topic_id' then nullif(p_item->>'topic_id','')::uuid else topic_id end,
      weight = case when p_item ? 'weight' then (p_item->>'weight')::numeric else weight end,
      lead_quality = case when p_item ? 'lead_quality' then nullif(p_item->>'lead_quality','') else lead_quality end,
      service_match = case when p_item ? 'service_match' then nullif(p_item->>'service_match','') else service_match end,
      value = case when p_item ? 'value' then nullif(p_item->>'value','') else value end,
      label = case when p_item ? 'label' then nullif(p_item->>'label','') else label end,
      description = case when p_item ? 'description' then p_item->>'description' else description end,
      config = case when p_item ? 'config' then p_item->'config' else config end,
      area_kind = case when p_item ? 'area_kind' then nullif(p_item->>'area_kind','') else area_kind end,
      match_tokens = case when p_item ? 'match_tokens' then p_item->'match_tokens' else match_tokens end,
      geo_band = case when p_item ? 'geo_band' then nullif(p_item->>'geo_band','') else geo_band end,
      sort = case when p_item ? 'sort' then (p_item->>'sort')::int else sort end,
      notes = case when p_item ? 'notes' then p_item->>'notes' else notes end,
      deleted_at = null, updated_at = now(), updated_by = v_uid
    where id = v_id returning * into v_row;
  end if;
  perform seo._pack_touch(v_pack);
  return to_jsonb(v_row);
end $function$;

create or replace function seo.starter_pack_item_delete(p_item_id uuid)
returns void language plpgsql security definer set search_path to 'public', 'seo' as $function$
declare v_pack uuid;
begin
  select pack_id into v_pack from seo.starter_pack_item where id = p_item_id;
  if v_pack is null then return; end if;
  perform seo._pack_assert_author(v_pack);
  update seo.starter_pack_item set deleted_at = now(), updated_by = auth.uid() where id = p_item_id;
  perform seo._pack_touch(v_pack);
end $function$;

-- One template rule in THE ONE rules engine (keyword_class_rule, is_template, pack_id, site_id null).
create or replace function seo.starter_pack_rule_save(p_rule jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'seo', 'platform' as $function$
declare v_id uuid := nullif(p_rule->>'id','')::uuid; v_pack uuid := (p_rule->>'pack_id')::uuid; v_row seo.keyword_class_rule;
        v_lib uuid := public.system_org_id('library'); v_uid uuid := auth.uid();
begin
  if v_id is not null then select pack_id into v_pack from seo.keyword_class_rule where id = v_id; end if;
  perform seo._pack_assert_author(v_pack);
  if v_id is null then
    insert into seo.keyword_class_rule (name, description, pattern, match_kind, match_facet, match_facet_value, target_class,
                                        value_multiplier, notes, pack_id, is_template, auto_apply, site_id, organization_id, visibility,
                                        created_by, updated_by, metadata)
    values (p_rule->>'name', p_rule->>'description', nullif(p_rule->>'pattern',''), nullif(p_rule->>'match_kind',''),
            nullif(p_rule->>'match_facet',''), nullif(p_rule->>'match_facet_value',''), nullif(p_rule->>'target_class',''),
            (p_rule->>'value_multiplier')::numeric, p_rule->>'notes', v_pack, true, false, null, v_lib, 'internal', v_uid, v_uid,
            coalesce(p_rule->'metadata', '{}'::jsonb))
    returning * into v_row;
  else
    update seo.keyword_class_rule set
      name = coalesce(p_rule->>'name', name),
      description = case when p_rule ? 'description' then p_rule->>'description' else description end,
      pattern = case when p_rule ? 'pattern' then nullif(p_rule->>'pattern','') else pattern end,
      match_kind = case when p_rule ? 'match_kind' then nullif(p_rule->>'match_kind','') else match_kind end,
      match_facet = case when p_rule ? 'match_facet' then nullif(p_rule->>'match_facet','') else match_facet end,
      match_facet_value = case when p_rule ? 'match_facet_value' then nullif(p_rule->>'match_facet_value','') else match_facet_value end,
      target_class = case when p_rule ? 'target_class' then nullif(p_rule->>'target_class','') else target_class end,
      value_multiplier = case when p_rule ? 'value_multiplier' then (p_rule->>'value_multiplier')::numeric else value_multiplier end,
      notes = case when p_rule ? 'notes' then p_rule->>'notes' else notes end,
      deleted_at = null, updated_at = now(), updated_by = v_uid
    where id = v_id returning * into v_row;
  end if;
  perform seo._pack_touch(v_pack);
  return to_jsonb(v_row);
end $function$;

create or replace function seo.starter_pack_rule_delete(p_rule_id uuid)
returns void language plpgsql security definer set search_path to 'public', 'seo' as $function$
declare v_pack uuid;
begin
  select pack_id into v_pack from seo.keyword_class_rule where id = p_rule_id and is_template;
  if v_pack is null then return; end if;
  perform seo._pack_assert_author(v_pack);
  update seo.keyword_class_rule set deleted_at = now(), updated_by = auth.uid() where id = p_rule_id;
  perform seo._pack_touch(v_pack);
end $function$;

-- Status is a gate (D3): draft ↔ proposed by authors; proposed → ratified, → retired, retired → draft by admins.
create or replace function seo.starter_pack_set_status(p_pack_id uuid, p_status text, p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'seo', 'iam' as $function$
declare v_row seo.starter_pack; v_uid uuid := auth.uid(); v_from text;
begin
  select status into v_from from seo.starter_pack where id = p_pack_id and deleted_at is null;
  if v_from is null then raise exception 'seo_pack_not_found: %', p_pack_id using errcode = 'P0002'; end if;
  if p_status not in ('draft','proposed','ratified','retired') then raise exception 'seo_pack_bad_status: %', p_status; end if;
  if p_status in ('ratified', 'retired') or v_from in ('ratified', 'retired') then
    if not public.is_admin() then
      raise exception 'seo_pack_status_denied: only a platform admin ratifies or retires a pack' using errcode = '42501';
    end if;
  else
    perform seo._pack_assert_author(p_pack_id);
  end if;
  update seo.starter_pack set
    status = p_status,
    proposed_by = case when p_status = 'proposed' then v_uid else proposed_by end,
    proposed_at = case when p_status = 'proposed' then now() else proposed_at end,
    ratified_by = case when p_status = 'ratified' then v_uid else ratified_by end,
    ratified_at = case when p_status = 'ratified' then now() else ratified_at end,
    ratification_notes = case when p_status = 'ratified' then p_notes else ratification_notes end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('status_history',
      coalesce(metadata->'status_history', '[]'::jsonb) || jsonb_build_object('from', v_from, 'to', p_status, 'at', now(), 'by', v_uid, 'notes', p_notes)),
    updated_at = now(), updated_by = v_uid
  where id = p_pack_id returning * into v_row;
  -- A pack that leaves `ratified` must leave its industry/global audiences too — the grant
  -- was issued on the ratified content. Pilot (organization) grants stay.
  if v_from = 'ratified' and p_status <> 'ratified' then
    delete from platform.entity_grants where entity_type = 'seo_starter_pack' and entity_id = p_pack_id and audience in ('industry', 'global');
  end if;
  perform public._library_audit(v_uid, 'pack_status', 'seo_starter_pack', p_pack_id, v_row.industry_id, null,
                                jsonb_build_object('from', v_from, 'to', p_status, 'notes', p_notes));
  return to_jsonb(v_row) - 'proposal';
end $function$;

-- A deliberate fork: clone pack + items + template rules into a new DRAFT that supersedes this one.
create or replace function seo.starter_pack_new_version(p_pack_id uuid, p_slug text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'seo', 'platform' as $function$
declare v_src seo.starter_pack; v_new seo.starter_pack; v_uid uuid := auth.uid(); v_slug text;
begin
  perform seo._pack_assert_author(p_pack_id);
  select * into v_src from seo.starter_pack where id = p_pack_id and deleted_at is null;
  v_slug := coalesce(nullif(p_slug,''), v_src.slug || '-v' || (v_src.pack_version + 1)::text);
  insert into seo.starter_pack (slug, name, industry, industry_id, summary, description, geo_model, guidelines, source_notes,
                                source_corpus, status, organization_id, visibility, created_by, updated_by, metadata, supersedes_pack_id, pack_version)
  values (v_slug, v_src.name, v_src.industry, v_src.industry_id, v_src.summary, v_src.description, v_src.geo_model, v_src.guidelines,
          v_src.source_notes, v_src.source_corpus, 'draft', v_src.organization_id, 'internal', v_uid, v_uid,
          coalesce(v_src.metadata,'{}'::jsonb) - 'status_history', p_pack_id, 1)
  returning * into v_new;
  insert into seo.starter_pack_item (pack_id, item_kind, topic_id, weight, lead_quality, service_match, value, label, description,
                                     config, area_kind, match_tokens, geo_band, sort, notes, organization_id, visibility, created_by, updated_by, metadata)
  select v_new.id, item_kind, topic_id, weight, lead_quality, service_match, value, label, description, config, area_kind, match_tokens,
         geo_band, sort, notes, organization_id, 'internal', v_uid, v_uid, jsonb_build_object('cloned_from_item', id)
  from seo.starter_pack_item where pack_id = p_pack_id and deleted_at is null;
  insert into seo.keyword_class_rule (name, description, pattern, match_kind, match_facet, match_facet_value, target_class, value_multiplier,
                                      notes, pack_id, is_template, auto_apply, site_id, organization_id, visibility, created_by, updated_by, metadata)
  select name, description, pattern, match_kind, match_facet, match_facet_value, target_class, value_multiplier, notes, v_new.id, true, false,
         null, organization_id, 'internal', v_uid, v_uid, jsonb_build_object('cloned_from_rule', id)
  from seo.keyword_class_rule where pack_id = p_pack_id and is_template and deleted_at is null;
  perform public._library_audit(v_uid, 'pack_new_version', 'seo_starter_pack', v_new.id, v_new.industry_id, null, jsonb_build_object('supersedes', p_pack_id));
  return to_jsonb(v_new) - 'proposal';
end $function$;

-- Land a proposer-agent output (seo_starter_pack_proposal_v1) as a DRAFT pack.
create or replace function seo.starter_pack_from_proposal(p_proposal jsonb, p_industry_id uuid default null,
                                                          p_source_corpus jsonb default null, p_source_site_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'seo', 'platform' as $function$
declare v_pack seo.starter_pack; v_lib uuid := public.system_org_id('library'); v_uid uuid := auth.uid(); v_slug text; r jsonb; v_n int := 0;
begin
  perform seo._pack_assert_creator(p_industry_id);
  if p_proposal->>'error' is not null and p_proposal->>'error' <> '' then
    raise exception 'seo_pack_proposal_error: %', p_proposal->>'error';
  end if;
  v_slug := coalesce(nullif(p_proposal->'pack'->>'slug',''), 'pack-' || left(gen_random_uuid()::text, 8));
  while exists (select 1 from seo.starter_pack where slug = v_slug) loop
    v_n := v_n + 1; v_slug := (p_proposal->'pack'->>'slug') || '-' || v_n::text;
  end loop;
  insert into seo.starter_pack (slug, name, industry, industry_id, summary, description, geo_model, guidelines, source_notes, source_corpus,
                                proposal, status, organization_id, visibility, created_by, updated_by, metadata)
  values (v_slug, p_proposal->'pack'->>'name', p_proposal->>'industry', p_industry_id, p_proposal->'pack'->>'summary',
          p_proposal->'pack'->>'description', coalesce(nullif(p_proposal->'pack'->>'geo_model',''), 'national'),
          p_proposal->'pack'->>'guidelines', p_proposal->>'demand_reading', p_source_corpus, p_proposal, 'draft', v_lib, 'internal', v_uid, v_uid,
          jsonb_build_object('proposer_version', p_proposal->>'proposer_version', 'confidence', p_proposal->'confidence',
                             'open_questions', coalesce(p_proposal->'open_questions', '[]'::jsonb),
                             'source_site_ids', coalesce(to_jsonb(p_source_site_ids), '[]'::jsonb)))
  returning * into v_pack;
  for r in select * from jsonb_array_elements(coalesce(p_proposal->'rules', '[]'::jsonb)) loop
    insert into seo.keyword_class_rule (name, description, pattern, match_kind, match_facet, match_facet_value, target_class, value_multiplier,
                                        notes, pack_id, is_template, auto_apply, site_id, organization_id, visibility, created_by, updated_by, metadata)
    values (r->>'name', r->>'description', nullif(r->>'pattern',''), nullif(r->>'match_kind',''), nullif(r->>'match_facet',''),
            nullif(r->>'match_facet_value',''), nullif(r->>'target_class',''), (r->>'value_multiplier')::numeric, r->>'rationale',
            v_pack.id, true, false, null, v_lib, 'internal', v_uid, v_uid, '{}'::jsonb);
  end loop;
  insert into seo.starter_pack_item (pack_id, item_kind, value, label, description, config, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'value_band', b->>'value', b->>'label', b->>'description', jsonb_build_object('min_score', (b->>'min_score')::numeric),
         ord, b->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'value_bands', '[]'::jsonb)) with ordinality as t(b, ord);
  insert into seo.starter_pack_item (pack_id, item_kind, value, label, description, config, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'geo_band', b->>'value', b->>'label', b->>'description', jsonb_build_object('multiplier', (b->>'multiplier')::numeric),
         ord, b->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'geo_bands', '[]'::jsonb)) with ordinality as t(b, ord);
  insert into seo.starter_pack_item (pack_id, item_kind, label, area_kind, match_tokens, geo_band, sort, notes, organization_id, visibility, created_by, updated_by)
  select v_pack.id, 'geo_area', a->>'label', coalesce(nullif(a->>'area_kind',''), 'city'), coalesce(a->'match_tokens', '[]'::jsonb),
         a->>'geo_band', ord, a->>'rationale', v_lib, 'internal', v_uid, v_uid
  from jsonb_array_elements(coalesce(p_proposal->'geo_areas', '[]'::jsonb)) with ordinality as t(a, ord);
  perform public._library_audit(v_uid, 'pack_from_proposal', 'seo_starter_pack', v_pack.id, p_industry_id, null,
                                jsonb_build_object('slug', v_slug, 'proposer_version', p_proposal->>'proposer_version'));
  return to_jsonb(v_pack) - 'proposal';
end $function$;

-- ───────────────────────── D. catalog + detail filter by entitlement ─────────────────────────
-- The catalog a caller may see: every pack for admins; their industry's packs for curators;
-- otherwise only what a grant reaches (for p_organization_id when given, else any of the
-- caller's orgs). `org_match` keeps the other chip's contract (industry opt-in ordering).
drop function if exists seo.starter_pack_catalog(text, uuid);
create function seo.starter_pack_catalog(p_status text default null, p_organization_id uuid default null)
returns table(id uuid, slug text, name text, industry text, summary text, description text, status text, geo_model text,
              guidelines text, source_notes text, source_corpus jsonb, ratified_at timestamptz, ratification_notes text,
              topic_count int, rule_count int, value_band_count int, geo_band_count int, geo_area_count int,
              industry_id uuid, industry_name text, org_match boolean,
              industry_slug text, pack_version int, entitled_via text, subscribed boolean, subscriber_count int,
              supersedes_pack_id uuid, proposed_at timestamptz, updated_at timestamptz, can_author boolean)
language plpgsql stable security definer set search_path to 'seo', 'platform', 'iam', 'public', 'pg_temp' as $function$
declare v_uid uuid := auth.uid(); v_admin boolean := public.is_admin();
begin
  return query
  with ent as (
    select p.id as pid,
      case
        when v_admin then 'admin'
        when v_uid is not null and public.is_pack_curator(v_uid, p.id) then 'curator'
        when p_organization_id is not null then public.library_entitlement('seo_starter_pack', p.id, p_organization_id)
        when v_uid is not null and exists (select 1 from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id
               and g.audience='organization' and g.organization_id in (select om.organization_id from iam.organization_member om where om.user_id=v_uid)) then 'organization'
        when v_uid is not null and exists (select 1 from platform.entity_grants g join iam.org_industries oi on oi.industry_id=g.industry_id
               join iam.organization_member om on om.organization_id=oi.organization_id
               where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='industry' and om.user_id=v_uid) then 'industry'
        when exists (select 1 from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='global') then 'global'
      end as via
    from seo.starter_pack p where p.deleted_at is null)
  select p.id, p.slug, p.name, p.industry, p.summary, p.description, p.status, p.geo_model, p.guidelines, p.source_notes,
         p.source_corpus, p.ratified_at, p.ratification_notes,
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'topic' and i.deleted_at is null),
         (select count(*)::int from seo.keyword_class_rule r where r.pack_id = p.id and r.is_template and r.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'value_band' and i.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_band' and i.deleted_at is null),
         (select count(*)::int from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_area' and i.deleted_at is null),
         p.industry_id, ind.name,
         (p_organization_id is not null and p.industry_id is not null and exists (
            select 1 from iam.org_industries oi where oi.organization_id = p_organization_id and oi.industry_id = p.industry_id)),
         ind.slug, p.pack_version, e.via,
         (p_organization_id is not null and exists (select 1 from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id
             and g.audience='organization' and g.organization_id=p_organization_id)),
         (select count(*)::int from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='organization'),
         p.supersedes_pack_id, p.proposed_at, p.updated_at,
         (v_admin or (v_uid is not null and public.is_pack_curator(v_uid, p.id) and p.status in ('draft','proposed')))
  from seo.starter_pack p
  join ent e on e.pid = p.id
  left join iam.industries ind on ind.id = p.industry_id
  where p.deleted_at is null
    and (p_status is null or p.status = p_status)
    and e.via is not null
    -- a non-admin, non-curator sees proposed/draft packs only through a direct pilot grant (D3)
    and (e.via in ('admin','curator','organization') or p.status = 'ratified')
  order by
    (p_organization_id is not null and p.industry_id is not null and exists (
       select 1 from iam.org_industries oi where oi.organization_id = p_organization_id and oi.industry_id = p.industry_id)) desc,
    case p.status when 'ratified' then 0 when 'proposed' then 1 when 'draft' then 2 else 3 end,
    p.name;
end $function$;

create or replace function seo.starter_pack_detail(p_pack_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'seo', 'platform', 'iam', 'public', 'pg_temp' as $function$
declare v_uid uuid := auth.uid(); v_out jsonb;
begin
  if not (public.is_admin()
          or (v_uid is not null and public.is_pack_curator(v_uid, p_pack_id))
          or (v_uid is not null and public.user_can_read_via_library_grant(v_uid, 'seo_starter_pack', p_pack_id))) then
    raise exception 'seo_pack_not_entitled: %', p_pack_id using errcode = '42501';
  end if;
  select jsonb_build_object(
    'pack', (to_jsonb(p) - 'proposal') || jsonb_build_object(
              'industry_name', ind.name, 'industry_slug', ind.slug,
              'can_author', (public.is_admin() or (v_uid is not null and public.is_pack_curator(v_uid, p.id) and p.status in ('draft','proposed'))),
              'is_admin', public.is_admin(),
              'subscriber_count', (select count(*) from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='organization'),
              'open_questions', coalesce(p.metadata->'open_questions', '[]'::jsonb),
              'status_history', coalesce(p.metadata->'status_history', '[]'::jsonb)),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'topic_id', t.id, 'name', t.name, 'slug', t.slug, 'node_type', t.node_type, 'parent_id', t.parent_id,
        'description', t.description, 'weight', i.weight, 'lead_quality', i.lead_quality, 'service_match', i.service_match,
        'notes', i.notes, 'sort', i.sort) order by i.sort, t.name)
      from seo.starter_pack_item i join seo.topic t on t.id = i.topic_id and t.deleted_at is null
      where i.pack_id = p.id and i.item_kind = 'topic' and i.deleted_at is null), '[]'::jsonb),
    'value_bands', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', i.id, 'value', i.value, 'label', i.label, 'description', i.description,
        'config', i.config, 'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'value_band' and i.deleted_at is null), '[]'::jsonb),
    'geo_bands', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', i.id, 'value', i.value, 'label', i.label, 'description', i.description,
        'config', i.config, 'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_band' and i.deleted_at is null), '[]'::jsonb),
    'geo_areas', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', i.id, 'label', i.label, 'area_kind', i.area_kind, 'match_tokens', i.match_tokens,
        'geo_band', i.geo_band, 'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_area' and i.deleted_at is null), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object('rule_id', r.id, 'name', r.name, 'description', r.description, 'pattern', r.pattern,
        'match_kind', r.match_kind, 'match_facet', r.match_facet, 'match_facet_value', r.match_facet_value, 'target_class', r.target_class,
        'value_multiplier', r.value_multiplier, 'notes', r.notes) order by r.value_multiplier nulls last, r.name)
      from seo.keyword_class_rule r where r.pack_id = p.id and r.is_template and r.deleted_at is null), '[]'::jsonb))
  into v_out
  from seo.starter_pack p left join iam.industries ind on ind.id = p.industry_id
  where p.id = p_pack_id and p.deleted_at is null;
  return v_out;
end $function$;

grant execute on function seo.starter_pack_save(jsonb), seo.starter_pack_item_save(jsonb), seo.starter_pack_item_delete(uuid),
  seo.starter_pack_rule_save(jsonb), seo.starter_pack_rule_delete(uuid), seo.starter_pack_set_status(uuid, text, text),
  seo.starter_pack_new_version(uuid, text), seo.starter_pack_from_proposal(jsonb, uuid, jsonb, uuid[]),
  seo.starter_pack_catalog(text, uuid), seo.starter_pack_detail(uuid) to authenticated, service_role;
revoke execute on function seo._pack_assert_author(uuid), seo._pack_assert_creator(uuid), seo._pack_touch(uuid) from public, anon, authenticated;

-- ───────────────────────── E. industries, the Library move, seeds ─────────────────────────
-- Industries the first packs are FOR (industry_upsert is the ONE taxonomy write; the actor
-- is a super admin so the audit row is honest).
do $$
declare v_actor uuid := (select user_id from admin.admins where level = 'super_admin' order by user_id limit 1);
        v_itad uuid; v_consult uuid; v_medical uuid := (select id from iam.industries where slug = 'medical');
begin
  v_itad := (public.industry_upsert('itad', 'IT Asset Disposition & Electronics Recycling', 'domain', null, null,
              'ITAD, electronics recycling, certified data destruction, hard-drive shredding.', 0, v_actor)).id;
  v_consult := (public.industry_upsert('consulting-marketing-services', 'Consulting & Marketing Services', 'domain', null, null,
              'Marketing agencies, digital/SEO firms, business coaching and consulting.', 0, v_actor)).id;
  update seo.starter_pack set industry_id = v_itad where slug = 'itad-data-destruction' and industry_id is null;
  update seo.starter_pack set industry_id = v_consult where slug = 'consulting-marketing-services' and industry_id is null;
  update seo.starter_pack set industry_id = v_medical where slug = 'medical-practice' and industry_id is null;
end $$;

-- THE MOVE (D1): packs, their items and their template rules become Matrx Library resources —
-- Library org, visibility internal. From here a pack is readable only through a grant, a
-- curatorship, or the admin lane; never "public to all" again.
update seo.starter_pack set organization_id = public.system_org_id('library'), visibility = 'internal'
 where organization_id <> public.system_org_id('library') or visibility <> 'internal';
update seo.starter_pack_item set organization_id = public.system_org_id('library'), visibility = 'internal'
 where organization_id <> public.system_org_id('library') or visibility <> 'internal';
update seo.keyword_class_rule set organization_id = public.system_org_id('library'), visibility = 'internal'
 where pack_id is not null and is_template and (organization_id <> public.system_org_id('library') or visibility <> 'internal');

-- The platform-global default pack (HANDOFF I2 / D8): same table, no industry, seeded EMPTY as
-- a draft so the 80/20 rules have a home from day one. Publish audience = global once ratified.
insert into seo.starter_pack (slug, name, industry, summary, description, geo_model, status, organization_id, visibility, metadata)
select 'platform-defaults', 'Platform defaults (every site)',
       'Every industry — the 80/20 rules that hold for most businesses',
       'The opinionated starting point the platform applies once to a brand-new site; the site owns it from then on.',
       'Applied once per site on first data (P13), never re-applied over the site''s own rulings; "Re-apply defaults" is the site''s button.',
       'national', 'draft', public.system_org_id('library'), 'internal', jsonb_build_object('scope', 'global')
where not exists (select 1 from seo.starter_pack where slug = 'platform-defaults');

-- The proposer's MANDATE: the admin console launches `seo.starter_pack_proposer`, never a raw
-- agent id. Mirrored in aidream services/mandates/client_mandates.py (declare_mandate) so the
-- next sync keeps it.
insert into agent.mandate (mandate_key, label, description, default_agent_id, use_latest, is_enabled, visibility, organization_id,
                           output_kind, contract, metadata)
select 'seo.starter_pack_proposer', 'SEO Starter Pack Proposer',
       'Proposes an industry starter pack (rules, band vocabularies, geo archetypes, guidelines skeleton) from real sample-site demand; lands as a draft in the Shared Knowledge console.',
       '6e30326f-6108-46ae-9c64-309946d2257d', true, true, 'public', public.system_org_id('system'), null,
       jsonb_build_object('accepts_user_input', false,
                          'required_variables', jsonb_build_array('corpus_json','topic_tree_json','industry_hint','expert_rulings','proposer_version'),
                          'required_output_keys', jsonb_build_array('__kind','pack','rules','value_bands','geo_bands','geo_areas'),
                          'required_context_policies', '[]'::jsonb, 'auto_context_disabled', false),
       jsonb_build_object('side', 'client', 'pin_style', 'floating',
                          'code_ref', 'matrx-frontend/features/admin/shared-knowledge/packs/useProposePack.ts')
where not exists (select 1 from agent.mandate where mandate_key = 'seo.starter_pack_proposer');
