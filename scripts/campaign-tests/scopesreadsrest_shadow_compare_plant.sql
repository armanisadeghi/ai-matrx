-- PLANTED DIVERGENCE (the red half): the store side only, inside the rolled-back transaction, triggers
-- off so neither the follow nor the fence carries it to the older tables.
set local session_replication_role = replica;
-- a Tag that files at least one item: its name
update custom.record set data = jsonb_set(data, '{name}', to_jsonb((data ->> 'name') || ' (planted)'))
 where id = (select r.id from custom.record r
               join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.data ->> 'kept_for' = 'context' and t.data ->> 'slug' = 'tag'
              where r.data_class = 'record' and r.deleted_at is null
                and exists (select 1 from platform.associations a where a.target_type = 'scope'
                             and a.target_id = r.id and a.deleted_at is null)
              order by r.id limit 1);
-- one of Castellano & Reyes' scope types: its singular label
update custom.record set data = jsonb_set(data, '{label_singular}', to_jsonb((data ->> 'label_singular') || ' (planted)'))
 where id = (select t.id from custom.record t join iam.organizations o on o.id = t.organization_id
              where o.name = 'Castellano & Reyes, LLP' and t.data_class = 'table'
                and t.data ->> 'kept_for' = 'context' and t.deleted_at is null
              order by t.data ->> 'label_plural' limit 1);
-- an archived scope: its name (Trash)
update custom.record set data = jsonb_set(data, '{name}', to_jsonb((data ->> 'name') || ' (planted)'))
 where id = (select r.id from custom.record r
               join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.data ->> 'kept_for' = 'context'
              where r.data_class = 'record' and r.deleted_at is not null order by r.id limit 1);
-- a scope a knowledge-graph suggestion targets: its name (the views)
update custom.record set data = jsonb_set(data, '{name}', to_jsonb((data ->> 'name') || ' (planted)'))
 where id = (select s.target_scope_id from rag.scope_association_suggestions s
              where s.deleted_at is null and s.target_scope_id is not null order by s.id limit 1);
set local session_replication_role = origin;
