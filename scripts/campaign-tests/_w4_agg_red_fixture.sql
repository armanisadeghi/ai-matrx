-- The fixture `scripts/campaign-tests/w4_agg_red.sql` rebuilds after each ROLLBACK, so every
-- break starts from the same GREEN state. Not a migration, not run on its own.

\set org '39c38960-d30c-4840-b0c1-c9960de95582'

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

select custom.table_declare(:'org'::uuid, jsonb_build_object(
  'name', 'ZZ A Deal', 'slug', 'zz_a_deal', 'type', 'entity', 'display', 'list',
  'label_singular', 'Deal', 'label_plural', 'Deals', 'ordered', false, 'weight', 'light',
  'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
  'parent_id', custom.table_kernel_id(), 'title_field', 'title', 'default_sort', '[]'::jsonb,
  'fields', jsonb_build_array(jsonb_build_object('name','title'),
                              jsonb_build_object('name','status'),
                              jsonb_build_object('name','amount')))) as t_deal \gset

-- THE FIXTURE, and every expected number below is read straight off it:
--   open   : 100 + 200 + 700 = 1000 over 3 records
--   won    : 300 + 400       =  700 over 2 records
--   lost   : 500             =  500 over 1 record
--   total  :                   2200 over 6 records
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D1","status":"open","amount":"100"}'::jsonb) as d1 \gset
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D2","status":"open","amount":"200"}'::jsonb) as d2 \gset
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D3","status":"won","amount":"300"}'::jsonb)  as d3 \gset
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D4","status":"won","amount":"400"}'::jsonb)  as d4 \gset
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D5","status":"lost","amount":"500"}'::jsonb) as d5 \gset
select custom.record_write(:'org'::uuid, :'t_deal'::uuid, '{"title":"D6","status":"open","amount":"700"}'::jsonb) as d6 \gset

select set_config('zz.org', :'org', true) as org,
       set_config('zz.tdeal', :'t_deal', true) as tdeal,
       set_config('zz.d1', :'d1', true) as d1,
       set_config('zz.d5', :'d5', true) as d5;

insert into platform.saved_view (name, surface_key, organization_id, definition, visibility)
values ('ZZ A Open deals', 'custom/records', :'org'::uuid,
        jsonb_build_object('table_id', :'t_deal', 'filters', jsonb_build_object('status', 'open')),
        'internal'::platform.visibility)
returning id as v_open \gset

insert into platform.saved_view (name, surface_key, organization_id, definition, visibility)
values ('ZZ A Everything', 'custom/records', :'org'::uuid,
        jsonb_build_object('table_id', :'t_deal', 'filters', '{}'::jsonb),
        'internal'::platform.visibility)
returning id as v_all \gset

-- TWO subscriptions over the SAME organization: one immediate on one channel, one digest on
-- another. DOOR-18's "immediately or on a schedule, per channel" is one mechanism, so both are
-- Rule records of the same kind differing in two keys.
insert into custom.record (organization_id, table_id, data_class, data)
values (:'org'::uuid, custom.rule_kernel_id(), 'rule', jsonb_build_object(
          'kind','predicate','name','ZZ A Now','sort',10,
          'uses', jsonb_build_array('membership'),
          'expr', jsonb_build_object('op','const','args', jsonb_build_array(true)),
          'message','this deal counts','applies_to_types','[]'::jsonb,
          'scope_table_id', :'t_deal',
          'subscription', jsonb_build_object(
            'saved_view_id', :'v_open', 'cadence','immediate','channel','in_app',
            'recipient_user_id','87a6e699-3622-4869-8843-d0867456c0dd',
            'event_key','records.changed'))),
       (:'org'::uuid, custom.rule_kernel_id(), 'rule', jsonb_build_object(
          'kind','predicate','name','ZZ A Monday','sort',20,
          'uses', jsonb_build_array('membership'),
          'expr', jsonb_build_object('op','const','args', jsonb_build_array(true)),
          'message','this deal counts','applies_to_types','[]'::jsonb,
          'scope_table_id', :'t_deal',
          'subscription', jsonb_build_object(
            'saved_view_id', :'v_all', 'cadence','digest','schedule','0 9 * * 1',
            'channel','email','recipient_user_id','87a6e699-3622-4869-8843-d0867456c0dd',
            'event_key','records.changed')));

