-- LANE 9 W2-W — THE SIDE EFFECTS A SCOPE WRITE LEAVES BEHIND, read the same way for the old body and the new one
-- (included by the scopesw2w same-answer suites, inside their transaction). Added after the independent verify
-- (scopes-verify-w2w.md H1/H3): a suite that compares only the image row and the store Record let a doubled
-- suggestion-sweep enqueue and a provisioned value without its provenance pass as "SAME". It reads, for one row:
--   sweep        every rag.kg_sweep_queue row of the row and of its Table's Fields made in this transaction; a
--                queued row is the proxy for its pg_notify, which both writers send only with the insert
--   search       the platform.search_item row of the scope or type
--   history      every history.row_versions row of it (old table and store, per entity type and version)
--   made         the store rows this transaction made for it: Fields of its Table (p_type), and Tables that name
--                it (a dataset Table) with their Fields. Read by what they name, never by "made since", because
--                the clone is shared and other lanes commit rows into the same organizations meanwhile.
--   datasets     context.scope_dataset_instances rows of the scope
create or replace function pg_temp.w2w_side_effects(p_org uuid, p_id uuid, p_type uuid) returns jsonb language sql as $se$
  with tbls as (
    select r.id from custom.record r
     where r.organization_id = p_org and r.data_class = 'table' and r.created_at >= now() and r.id <> p_id
       and (r.data ->> 'parent_id' = p_id::text or r.data::text like '%' || p_id::text || '%')
  ), made as (
    select r.* from custom.record r
     where r.organization_id = p_org and r.created_at >= now() and r.id <> p_id
       and (r.id in (select id from tbls)
            or (r.data_class = 'field' and (r.data ->> 'entity_definition_id' = p_type::text
                                            or (r.data ->> 'entity_definition_id')::uuid in (select id from tbls))))
  )
  select jsonb_build_object(
    'sweep', (select jsonb_agg(jsonb_build_object('change_type', q.change_type, 'entity_id', q.entity_id,
                                                  'scope_type_id', q.scope_type_id, 'organization_id', q.organization_id,
                                                  'created_by', q.created_by, 'status', q.status)
                               order by (q.entity_id = p_id) desc, q.change_type,
                                        (select f.data ->> 'key' from custom.record f where f.organization_id = p_org and f.id = q.entity_id), q.entity_id::text)
                from rag.kg_sweep_queue q
               where q.created_at >= now() and (q.entity_id = p_id or q.entity_id in (select id from made))),
    'search', (select to_jsonb(si) - 'title_tsv' - 'projected_at' from platform.search_item si where si.entity_id = p_id),
    'history', (select jsonb_agg(jsonb_build_object('entity_type', h.entity_type, 'operation', h.operation, 'version', h.version,
                                                    'actor_tier', h.actor_tier, 'operation_name', h.operation_name,
                                                    'actor_id', h.actor_id, 'row', h.row_data)
                                 order by h.entity_type, h.version, h.operation)
                  from history.row_versions h where h.row_id = p_id),
    'made', (select count(*) from made),
    'made_docs', (select jsonb_agg(jsonb_build_object('class', m.data_class, 'data', m.data - '_values', 'by', m.created_by)
                                   order by m.data_class, m.data ->> 'key', m.data ->> 'name') from made m),
    'datasets', (select jsonb_agg(jsonb_build_object('item', d.context_item_id, 'template', d.template_id,
                                                     'template_version', d.template_version, 'by', d.created_by, 'org', d.organization_id)
                                  order by d.context_item_id::text)
                   from context.scope_dataset_instances d where d.scope_id = p_id))
$se$;
