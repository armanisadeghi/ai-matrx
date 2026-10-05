-- INVERSE of campaign/onehome_w5_flexible_data_and_the_custom_object_tables_move_to_deprecated.sql (lane FINISH-THE-SWITCH FTS-3). Captured from production 2026-10-05 before the up file ran.
-- NOT PROVEN end to end: the up file was applied and ledgered on the clone (rehearsal 2026-10-05 04:53Z); this inverse was run there and stopped at the registration check (a table moved back into platform must be registered in platform.entity_types in the same transaction, and the provisioning guard refuses a hand-registered entity table). Re-register through the provisioner (or as audit_class machinery with a reason) if the tables are ever needed back.
-- The 33 search projection rows are not restored one by one: platform._search_item_sync_flexible_data re-projects on the next write, or run platform.search_item_backfill('flexible_data').
set local lock_timeout = '3s';
-- The two foreign keys into auth.users are not restored: the sign-in table guard refuses any new one (iam.users is the only table allowed one). Their iam.users twins (..._fkey_p) are restored.
-- platform.entity_types rows (flexible_data, custom_entity_definition, custom_record) are not re-activated: the provisioning guard refuses a hand-registered entity table. Re-register through the provisioner if the tables are ever needed back.
set local statement_timeout = '120s';
alter table deprecated.flexible_data            set schema platform;
alter table deprecated.custom_record            set schema platform;
alter table deprecated.custom_entity_definition set schema platform;
grant select on table platform.flexible_data, platform.custom_entity_definition, platform.custom_record to authenticated;
alter table platform.custom_entity_definition add constraint custom_entity_definition_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.users(id) not valid;
alter table platform.custom_entity_definition validate constraint custom_entity_definition_created_by_fkey;
alter table platform.custom_entity_definition add constraint custom_entity_definition_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) not valid;
alter table platform.custom_entity_definition validate constraint custom_entity_definition_organization_id_fkey;
alter table platform.custom_entity_definition add constraint custom_entity_definition_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES iam.users(id) not valid;
alter table platform.custom_entity_definition validate constraint custom_entity_definition_updated_by_fkey;
alter table platform.custom_record add constraint custom_record_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.users(id) not valid;
alter table platform.custom_record validate constraint custom_record_created_by_fkey;
alter table platform.custom_record add constraint custom_record_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) not valid;
alter table platform.custom_record validate constraint custom_record_organization_id_fkey;
alter table platform.custom_record add constraint custom_record_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES iam.users(id) not valid;
alter table platform.custom_record validate constraint custom_record_updated_by_fkey;
alter table platform.flexible_data add constraint flexible_data_category_id_fkey FOREIGN KEY (category_id) REFERENCES platform.categories(id) not valid;
alter table platform.flexible_data validate constraint flexible_data_category_id_fkey;
alter table platform.flexible_data add constraint flexible_data_created_by_fkey_p FOREIGN KEY (created_by) REFERENCES iam.users(id) not valid;
alter table platform.flexible_data validate constraint flexible_data_created_by_fkey_p;
alter table platform.flexible_data add constraint flexible_data_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id) not valid;
alter table platform.flexible_data validate constraint flexible_data_organization_id_fkey;
alter table platform.flexible_data add constraint flexible_data_updated_by_fkey_p FOREIGN KEY (updated_by) REFERENCES iam.users(id) not valid;
alter table platform.flexible_data validate constraint flexible_data_updated_by_fkey_p;
update platform.shareable_resource_registry set is_active = true where resource_type in ('flexible_data', 'custom_entity_definition', 'custom_record');
update platform.deprecated_relations set archived_as = null where old_ref in ('platform.custom_entity_definition', 'platform.custom_record');
delete from platform.deprecated_relations where old_ref = 'platform.flexible_data' and archived_as = 'deprecated.flexible_data';

CREATE OR REPLACE FUNCTION public.flexible_data_write(p_organization_id uuid, p_patch jsonb, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_row platform.flexible_data;
begin
  if v_actor is null then
    raise exception 'flexible_data_write: nobody is signed in.' using errcode = '42501';
  end if;
  if p_organization_id is null or jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'flexible_data_write: name the organization and pass an object.'
      using errcode = '22004';
  end if;
  if not iam.has_org_access(p_organization_id) then
    raise exception 'flexible_data_write: that is not an organization you can act in.' using errcode = '42501',
            detail = jsonb_build_object('organization_id', p_organization_id)::text;
  end if;

  if p_id is null then
    insert into platform.flexible_data
      (label, slug, data, category_id, organization_id, created_by, visibility)
    values (
      coalesce(nullif(btrim(coalesce(p_patch ->> 'label', '')), ''), 'Untitled'),
      nullif(btrim(coalesce(p_patch ->> 'slug', '')), ''),
      case when jsonb_typeof(p_patch -> 'data') = 'object' then p_patch -> 'data' else '{}'::jsonb end,
      nullif(p_patch ->> 'category_id', '')::uuid,
      p_organization_id,
      v_actor,
      coalesce(nullif(p_patch ->> 'visibility', '')::platform.visibility, 'personal'::platform.visibility))
    returning * into v_row;
    return jsonb_build_object('id', v_row.id, 'label', v_row.label, 'version', v_row.version);
  end if;

  select * into v_row from platform.flexible_data f
   where f.id = p_id and f.organization_id = p_organization_id and f.deleted_at is null;
  if not found then
    raise exception 'flexible_data_write: there is no such record here.' using errcode = '23503';
  end if;
  -- THE LADDER. The predicate `std_update` carried.
  if not (v_row.created_by = v_actor
          or iam.has_access('flexible_data', v_row.id, 'editor'::public.permission_level)
          or (v_row.visibility >= 'internal'::platform.visibility and public.is_platform_admin())) then
    raise exception 'flexible_data_write: this record is not yours to change.' using errcode = '42501';
  end if;

  -- `deleted_at` IS NOT A KEY OF THIS PATCH. Archiving is flexible_data_archive: an archive is
  -- a different act from an edit, and a door that lets a caller set deleted_at in a patch is a
  -- delete wearing an edit''s name.
  update platform.flexible_data f
     set label      = case when p_patch ? 'label'      then coalesce(nullif(btrim(p_patch ->> 'label'), ''), f.label) else f.label end,
         slug       = case when p_patch ? 'slug'       then nullif(btrim(coalesce(p_patch ->> 'slug', '')), '') else f.slug end,
         data       = case when jsonb_typeof(p_patch -> 'data') = 'object' then p_patch -> 'data' else f.data end,
         visibility = case when p_patch ? 'visibility' then coalesce(nullif(p_patch ->> 'visibility', '')::platform.visibility, f.visibility) else f.visibility end,
         updated_by = v_actor
   where f.id = p_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'label', v_row.label, 'version', v_row.version);
end;
$function$;
revoke all on function flexible_data_write(uuid,jsonb,uuid) from public;
grant execute on function flexible_data_write(uuid,jsonb,uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.flexible_data_archive(p_organization_id uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_row platform.flexible_data;
begin
  if v_actor is null then
    raise exception 'flexible_data_archive: nobody is signed in.' using errcode = '42501';
  end if;
  select * into v_row from platform.flexible_data f
   where f.id = p_id and f.organization_id = p_organization_id and f.deleted_at is null;
  if not found then
    raise exception 'flexible_data_archive: there is no such record here.' using errcode = '23503';
  end if;
  -- ARCHIVING IS THE ADMIN RUNG, which is what `std_delete` asked for -- one rung above an
  -- edit, because putting something away is not the same as changing it.
  if not (v_row.created_by = v_actor
          or iam.has_access('flexible_data', v_row.id, 'admin'::public.permission_level)
          or (v_row.visibility >= 'internal'::platform.visibility and public.is_platform_admin())) then
    raise exception 'flexible_data_archive: this record is not yours to archive.' using errcode = '42501';
  end if;

  update platform.flexible_data f
     set deleted_at = now(), updated_by = v_actor
   where f.id = p_id
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'deleted_at', v_row.deleted_at);
end;
$function$;
revoke all on function flexible_data_archive(uuid,uuid) from public;
grant execute on function flexible_data_archive(uuid,uuid) to authenticated, service_role;

alter table platform.flexible_data enable trigger _search_item_sync;
