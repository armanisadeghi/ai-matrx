-- chair-step: lane STORE-RESTORE-DOORS (second file). public._trash_store_children answers personal Trash and Organization Trash as two separate queries, so each walks only its own rows: an organization's removed store things through the organization's partition, a person's through the owner and updater indexes. Same rows, same order; nothing else changes.
--
-- WHY. The first file wrote the person-or-organization choice as one CASE inside one SQL predicate.
-- A CASE is not sargable, so PostgreSQL scanned every archived row of the class in every organization
-- and partition on every call: Organization Trash for AI Matrx asked for its removed Fields took
-- 311-327 ms on production (it has none; ceiling 300 ms, pnpm check:trash-answers-fast), and the
-- merged Organization Trash page went to 438 ms. A Table-is-live check per candidate row became one
-- semi-join over the organization's live Tables.
--
-- lane: STORE-RESTORE-DOORS
-- additive: yes
-- INVERSE: migrations/inverse/storerestoredoors_trash_reads_store_things_by_person_or_organization_apart_down.sql
-- based-on: public._trash_store_children(uuid, uuid, uuid, text, integer) 70504fc50e5db7bd9aea7522835fb7d9785f6b3718b04780b69252ba8fdd6e86

create or replace function public._trash_store_children(p_uid uuid, p_org uuid, p_member uuid, p_class text, p_window integer)
 returns table(id uuid, organization_id uuid, deleted_at timestamp with time zone, created_by uuid)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
-- lane STORE-RESTORE-DOORS. THE ONE PREDICATE for the five record-store Trash kinds, read by the
-- listing AND the counts. Personal: what the person made, or removed (the removal stamps updated_by).
-- Organization: that organization's (optionally one member's), never another member's personal row.
-- A thing is listed while what it belongs to is live — a Field, Rule, template or dashboard its Table
-- (a Rule, template or dashboard with no Table is listed as it is); a link both of its records.
-- The two modes are two queries, each walking only its own rows.
begin
  if p_class not in ('field', 'rule', 'relation', 'doc_template', 'dashboard') then
    return;
  end if;

  if p_org is not null then
    return query
    select c.id, c.organization_id, c.deleted_at, c.created_by
      from custom.record c
     where c.organization_id = p_org
       and c.data_class = p_class
       and c.deleted_at is not null
       and (p_member is null or c.created_by = p_member)
       and (c.visibility is distinct from 'personal'::platform.visibility or c.created_by = p_uid)
       and case when p_class = 'relation' then
                  exists (select 1 from custom.record x
                           where x.organization_id = p_org and x.id = nullif(c.data ->> 'from', '')::uuid
                             and x.deleted_at is null)
              and exists (select 1 from custom.record x
                           where x.organization_id = p_org and x.id = nullif(c.data ->> 'to', '')::uuid
                             and x.deleted_at is null)
                else
                  coalesce(c.data ->> case p_class when 'field' then 'entity_definition_id'
                                                   when 'rule' then 'scope_table_id'
                                                   when 'doc_template' then 'renders_table_id'
                                                   else 'subject_table_id' end, '') = ''
                  and p_class <> 'field'
               or (c.data ->> case p_class when 'field' then 'entity_definition_id'
                                             when 'rule' then 'scope_table_id'
                                             when 'doc_template' then 'renders_table_id'
                                             else 'subject_table_id' end)
                  in (select t.id::text from custom.record t
                       where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is null)
           end
     order by c.deleted_at desc, c.id
     limit p_window;
    return;
  end if;

  return query
  select c.id, c.organization_id, c.deleted_at, c.created_by
    from custom.record c
   where (c.created_by = p_uid or c.updated_by = p_uid)
     and c.data_class = p_class
     and c.deleted_at is not null
     and case when p_class = 'relation' then
                exists (select 1 from custom.record x
                         where x.organization_id = c.organization_id and x.id = nullif(c.data ->> 'from', '')::uuid
                           and x.deleted_at is null)
            and exists (select 1 from custom.record x
                         where x.organization_id = c.organization_id and x.id = nullif(c.data ->> 'to', '')::uuid
                           and x.deleted_at is null)
              else
                coalesce(c.data ->> case p_class when 'field' then 'entity_definition_id'
                                                 when 'rule' then 'scope_table_id'
                                                 when 'doc_template' then 'renders_table_id'
                                                 else 'subject_table_id' end, '') = ''
                and p_class <> 'field'
             or exists (select 1 from custom.record t
                         where t.organization_id = c.organization_id and t.data_class = 'table' and t.deleted_at is null
                           and t.id = nullif(c.data ->> case p_class when 'field' then 'entity_definition_id'
                                                               when 'rule' then 'scope_table_id'
                                                               when 'doc_template' then 'renders_table_id'
                                                               else 'subject_table_id' end, '')::uuid)
         end
   order by c.deleted_at desc, c.id
   limit p_window;
end
$function$;
