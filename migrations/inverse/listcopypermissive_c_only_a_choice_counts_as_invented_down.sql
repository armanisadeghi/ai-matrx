-- chair-step: INVERSE of migrations/campaign/listcopypermissive_c_only_a_choice_counts_as_invented.sql (lane LIST-COPY-PERMISSIVE). Puts back platform.cutover_older_removal_rows as the first LIST-COPY-PERMISSIVE file left it.
-- based-on: platform.cutover_older_removal_rows(uuid, uuid[]) f0a168c421dd1c68d73398aeb36c1f16ad556b9861e6a6d39723fe1a2239777f
-- lane: LIST-COPY-PERMISSIVE

CREATE OR REPLACE FUNCTION platform.cutover_older_removal_rows(p_org uuid, p_tables uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(kind text, record_id uuid, table_id uuid, table_name text, what text, principal_kind text, kept_image boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with truth as (
    -- The older tables are the truth only until the organization presses its switch.
    select (platform._cutover_seam_last_done('older_tables', p_org)).direction is distinct from 'new' as older_is_truth
  ), ev as (
    select e.record_id, e.created, e.pre_image
      from platform.cutover_evaluation_write e
     where e.organization_id = p_org and e.replaced_at is null
  ), copied as (
    select d.id, coalesce(nullif(d.table_name, ''), 'Untitled table') as table_name
      from workbench.udt_datasets d
      join custom.record t on t.organization_id = p_org and t.id = d.id and t.data_class = 'table'
                          and t.deleted_at is null
                          and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
     where d.organization_id = p_org and d.deleted_at is null
       and (p_tables is null or d.id = any (p_tables))
       and (select older_is_truth from truth)
  ), lists as (
    -- The live older lists whose copy is in the store: every one with a whole-organization run, and
    -- with a table run the lists its columns choose from.
    select l.id, coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') as table_name
      from workbench.udt_structured_lists l
      join custom.record t on t.organization_id = p_org and t.id = l.id and t.data_class = 'table' and t.deleted_at is null
     where l.organization_id = p_org and l.deleted_at is null
       and (select older_is_truth from truth)
       and (p_tables is null
            or exists (select 1 from custom.record f
                        where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                          and f.data ->> 'entity_definition_id' = any (p_tables::text[])
                          and f.data -> 'config' ->> 'options_table_id' = l.id::text))
  )
  -- rows
  select 'row', r.id, c.id, c.table_name, 'row ' || left(r.id::text, 8), null::text,
         (ev.record_id is not null)
    from copied c
    join custom.record r on r.organization_id = p_org and r.table_id = c.id and r.data_class = 'record'
    left join ev on ev.record_id = r.id
   where case when ev.record_id is not null then not ev.created and (ev.pre_image ->> 'deleted_at') is null
              else r.deleted_at is null end
     and not exists (select 1 from workbench.udt_dataset_rows w where w.id = r.id and w.deleted_at is null)
  union all
  -- columns
  select 'column', f.id, c.id, c.table_name, 'the column ' || coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), null, false
    from copied c
    join custom.record f on f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = c.id::text
   where not exists (select 1 from ev where ev.record_id = f.id and ev.created)
     and not exists (select 1 from workbench.udt_dataset_fields o where o.id = f.id and o.deleted_at is null)
  union all
  -- choices
  select 'choice', r.id, l.id, l.table_name, 'the choice ' || coalesce(nullif(r.data ->> 'name', ''), left(r.id::text, 8)), null,
         (ev.record_id is not null)
    from lists l
    join custom.record r on r.organization_id = p_org and r.table_id = l.id and r.data_class = 'record'
    left join ev on ev.record_id = r.id
   where case when ev.record_id is not null then not ev.created and (ev.pre_image ->> 'deleted_at') is null
              else r.deleted_at is null end
     and coalesce(r.metadata #>> '{moved_from,table}', '') <> 'workbench.udt_dataset_rows'
     and not exists (select 1 from workbench.udt_structured_list_items i where i.id = r.id and i.deleted_at is null)
  union all
  -- LIST-COPY-PERMISSIVE: choices the MOVER invented. An earlier copy added a live row's off-list
  -- value to the column's choices (its `moved_from` names that row's cell, not an older choice).
  -- The older list never had it; the copy keeps the value as an other value instead, so the rerun
  -- takes the invented choice off the copy - unless an older choice with the same words now backs it.
  select 'invented_choice', r.id, r.table_id,
         coalesce(nullif(t.data ->> 'name', ''), 'Untitled list'),
         'the choice ' || coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'title', ''), left(r.id::text, 8)),
         null, false
    from custom.record r
    join custom.record t on t.organization_id = p_org and t.id = r.table_id and t.data_class = 'table' and t.deleted_at is null
   where (select older_is_truth from truth)
     and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is null
     and r.metadata #>> '{moved_from,table}' = 'workbench.udt_dataset_rows'
     and not exists (select 1 from ev where ev.record_id = r.id and ev.created)
     and (p_tables is null
          or exists (select 1 from custom.record f
                      where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = any (p_tables::text[])
                        and f.data -> 'config' ->> 'options_table_id' = r.table_id::text))
     and not exists (select 1 from workbench.udt_structured_list_items i
                      where i.list_id = r.table_id and i.deleted_at is null
                        and lower(btrim(i.label)) = lower(btrim(coalesce(r.data ->> 'name', r.data ->> 'title', ''))))
     and not exists (select 1 from custom.record f
                       join workbench.udt_dataset_fields o on o.id = f.id and o.deleted_at is null
                       cross join lateral jsonb_array_elements(
                         case when jsonb_typeof(o.metadata #> '{format,options,choices}') = 'array'
                              then o.metadata #> '{format,options,choices}' else '[]'::jsonb end) c
                      where f.organization_id = p_org and f.data_class = 'field'
                        and f.data -> 'config' ->> 'options_table_id' = r.table_id::text
                        and lower(btrim(coalesce(case when jsonb_typeof(c) = 'object' then coalesce(c ->> 'value', c ->> 'label') else c #>> '{}' end, '')))
                            = lower(btrim(coalesce(r.data ->> 'name', r.data ->> 'title', ''))))
  union all
  -- whole tables a person archived on the older side
  select 'table', t.id, t.id, coalesce(nullif(d.table_name, ''), 'Untitled table'), 'the whole table', null, false
    from workbench.udt_datasets d
    join custom.record t on t.organization_id = p_org and t.id = d.id and t.data_class = 'table' and t.deleted_at is null
                        and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
   where p_tables is null and (select older_is_truth from truth)
     and d.organization_id = p_org and d.deleted_at is not null and not (coalesce(d.metadata, '{}'::jsonb) ? 'moved_to')
  union all
  -- whole lists a person archived or deleted on the older side
  select 'list', t.id, t.id, coalesce(nullif(t.data ->> 'name', ''), 'Untitled list'), 'the whole list', null, false
    from custom.record t
   where p_tables is null and (select older_is_truth from truth)
     and t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is null
     and t.metadata #>> '{moved_from,table}' = 'workbench.udt_structured_lists'
     and not exists (select 1 from workbench.udt_structured_lists l
                      where l.id = t.id and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id)))
  union all
  -- shares the mover carried whose older share is gone
  select 'share', p.id, c.id, c.table_name,
         coalesce((select u.email from auth.users u where u.id = p.granted_to_user_id),
                  (select g.name from iam.organizations g where g.id = p.granted_to_organization_id), 'someone')
           || '''s share', case when p.granted_to_user_id is not null then 'person' else 'organization' end, false
    from copied c
    join custom.record t on t.organization_id = p_org and t.id = c.id and t.data_class = 'table'
    join iam.permissions p on p.resource_type = 'record' and p.resource_id = c.id and p.status = 'active'
                          and not coalesce(p.is_public, false)
   where jsonb_typeof(t.metadata -> 'older_shares_seen') = 'array'
     and t.metadata -> 'older_shares_seen' ? coalesce(p.granted_to_user_id, p.granted_to_organization_id)::text
     and not exists (select 1 from iam.permissions q
                      where q.resource_type = 'dataset' and q.resource_id = c.id and q.status = 'active'
                        and coalesce(q.granted_to_user_id, q.granted_to_organization_id)
                            = coalesce(p.granted_to_user_id, p.granted_to_organization_id))
  union all
  -- THE OTHER DIRECTION: what the rerun archived because the older one was gone, now live again.
  select r.metadata #>> '{removed_on_older,kind}' || '_back', r.id,
         case when r.data_class in ('table') then r.id
              when r.data_class = 'field' then nullif(r.data ->> 'entity_definition_id', '')::uuid
              else r.table_id end,
         null, coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'label', ''), left(r.id::text, 8)), null, false
    from custom.record r
   where (select older_is_truth from truth)
     and r.organization_id = p_org and r.deleted_at is not null
     and jsonb_typeof(r.metadata -> 'removed_on_older') = 'object'
     and (case r.metadata #>> '{removed_on_older,kind}'
            when 'row'    then exists (select 1 from workbench.udt_dataset_rows w where w.id = r.id and w.deleted_at is null)
                               and (p_tables is null or r.table_id = any (p_tables))
                               and exists (select 1 from workbench.udt_datasets d where d.id = r.table_id and d.deleted_at is null)
            when 'column' then exists (select 1 from workbench.udt_dataset_fields o where o.id = r.id and o.deleted_at is null)
                               and (p_tables is null or r.data ->> 'entity_definition_id' = any (p_tables::text[]))
                               and exists (select 1 from workbench.udt_datasets d where d.id::text = r.data ->> 'entity_definition_id' and d.deleted_at is null)
            when 'choice' then exists (select 1 from workbench.udt_structured_list_items i where i.id = r.id and i.deleted_at is null)
                               and exists (select 1 from workbench.udt_structured_lists l where l.id = r.table_id and l.deleted_at is null)
            when 'table'  then p_tables is null and exists (select 1 from workbench.udt_datasets d where d.id = r.id and d.deleted_at is null)
            when 'list'   then p_tables is null and exists (select 1 from workbench.udt_structured_lists l where l.id = r.id and l.deleted_at is null)
            else false end);
$function$
;
