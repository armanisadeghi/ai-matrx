-- The fixture `scripts/campaign-tests/w4_query_red.sql` rebuilds after each ROLLBACK, so every
-- break starts from the same GREEN state and the "it went red" claim is a change, not a
-- coincidence. Not a migration, not run on its own.

create function pg_temp.zz_r_table(p_org uuid, p_name text, p_slug text) returns uuid
language sql as $$
  select custom.table_declare(p_org, jsonb_build_object(
    'name', p_name, 'slug', p_slug, 'type', 'entity', 'display', 'list',
    'label_singular', p_name, 'label_plural', p_name || 's',
    'ordered', false, 'weight', 'light', 'retention_days', 365,
    'row_order', 'sorted', 'agent_writable', true,
    'parent_id', custom.table_kernel_id(), 'title_field', 'title', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'))))
$$;

\set org '39c38960-d30c-4840-b0c1-c9960de95582'
select pg_temp.zz_r_table(:'org'::uuid, 'ZZ R Job',    'zz_r_job')    as t_job    \gset
select pg_temp.zz_r_table(:'org'::uuid, 'ZZ R Client', 'zz_r_client') as t_client \gset
select custom.record_write(:'org'::uuid, :'t_client'::uuid, '{"title":"Alpha"}'::jsonb) as c_alpha \gset
select custom.record_write(:'org'::uuid, :'t_client'::uuid, '{"title":"Beta"}'::jsonb)  as c_beta  \gset
select custom.record_write(:'org'::uuid, :'t_job'::uuid, '{"title":"J1"}'::jsonb) as j1 \gset
select custom.record_write(:'org'::uuid, :'t_job'::uuid, '{"title":"J2"}'::jsonb) as j2 \gset
select custom.record_write(:'org'::uuid, :'t_job'::uuid, '{"title":"J3"}'::jsonb) as j3 \gset

update custom.record set data = jsonb_set(data, '{fields}',
         (data -> 'fields') || '[{"name":"client"},{"name":"next_job"}]'::jsonb)
 where organization_id = :'org'::uuid and id = :'t_job'::uuid;

insert into custom.field (organization_id, entity_definition_id, key, name, label, type,
                          relation_target, relation_max, on_target_delete, config, source,
                          source_config, sensitivity, context_policy, rules, depends_on,
                          applies_to_types, multi, dated, required, sort)
values (:'org'::uuid, :'t_job'::uuid, 'client', 'Client', 'Client', 'relation', :'t_client'::uuid,
        50, 'set_null', '{"target_mode":"one","loops":true}'::jsonb, 'manual', '{}'::jsonb,
        'internal', 'include', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 10),
       (:'org'::uuid, :'t_job'::uuid, 'next_job', 'Next', 'Next', 'relation', :'t_job'::uuid,
        50, 'set_null', '{"target_mode":"one","loops":true}'::jsonb, 'manual', '{}'::jsonb,
        'internal', 'include', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 20);

select platform.relation_set(:'org'::uuid, :'j1'::uuid, 'client', jsonb_build_array(:'c_alpha')) as e1;
select platform.relation_set(:'org'::uuid, :'j2'::uuid, 'client', jsonb_build_array(:'c_alpha', :'c_beta')) as e2;
select platform.relation_set(:'org'::uuid, :'j1'::uuid, 'next_job', jsonb_build_array(:'j2')) as e3;
select platform.relation_set(:'org'::uuid, :'j2'::uuid, 'next_job', jsonb_build_array(:'j3')) as e4;
select platform.relation_set(:'org'::uuid, :'j3'::uuid, 'next_job', jsonb_build_array(:'j1')) as e5;

select set_config('zz.org', :'org', true) as org,
       set_config('zz.tjob', :'t_job', true) as tjob,
       set_config('zz.alpha', :'c_alpha', true) as alpha,
       set_config('zz.beta', :'c_beta', true) as beta,
       set_config('zz.j1', :'j1', true) as j1;
