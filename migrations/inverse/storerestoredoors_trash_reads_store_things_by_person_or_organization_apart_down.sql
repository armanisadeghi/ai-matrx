-- chair-step: lane STORE-RESTORE-DOORS inverse (second file). Puts back the first file's one-query body of public._trash_store_children (the CASE predicate). No row is touched.
-- INVERSE of migrations/campaign/storerestoredoors_trash_reads_store_things_by_person_or_organization_apart.sql
-- lane: STORE-RESTORE-DOORS
-- based-on: public._trash_store_children(uuid, uuid, uuid, text, integer) c3e2597f6f9fc74eeba07c550e3a8bc9f281a9371a9d024dbd382ae77fe479cb

create or replace function public._trash_store_children(p_uid uuid, p_org uuid, p_member uuid, p_class text, p_window integer)
 returns table(id uuid, organization_id uuid, deleted_at timestamp with time zone, created_by uuid)
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
  select c.id, c.organization_id, c.deleted_at, c.created_by
    from (
      select r.id, r.organization_id, r.deleted_at, r.created_by, r.data,
             case r.data_class
               when 'field'        then nullif(r.data ->> 'entity_definition_id', '')::uuid
               when 'rule'         then nullif(r.data ->> 'scope_table_id', '')::uuid
               when 'doc_template' then nullif(r.data ->> 'renders_table_id', '')::uuid
               when 'dashboard'    then nullif(r.data ->> 'subject_table_id', '')::uuid
             end as parent_id
        from custom.record r
       where r.data_class = p_class
         and r.data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard')
         and r.deleted_at is not null
         and case when p_org is null
                  then (r.created_by = p_uid or r.updated_by = p_uid)
                  else r.organization_id = p_org
                       and (p_member is null or r.created_by = p_member)
                       and (r.visibility is distinct from 'personal'::platform.visibility or r.created_by = p_uid)
             end
    ) c
   where case when p_class = 'relation' then
               exists (select 1 from custom.record x
                        where x.organization_id = c.organization_id and x.id = nullif(c.data ->> 'from', '')::uuid
                          and x.deleted_at is null)
           and exists (select 1 from custom.record x
                        where x.organization_id = c.organization_id and x.id = nullif(c.data ->> 'to', '')::uuid
                          and x.deleted_at is null)
              when p_class = 'field' then
               exists (select 1 from custom.record t
                        where t.organization_id = c.organization_id and t.id = c.parent_id
                          and t.data_class = 'table' and t.deleted_at is null)
              else
               c.parent_id is null
            or exists (select 1 from custom.record t
                        where t.organization_id = c.organization_id and t.id = c.parent_id
                          and t.data_class = 'table' and t.deleted_at is null)
         end
   order by c.deleted_at desc, c.id
   limit p_window;
$function$;
