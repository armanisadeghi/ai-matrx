-- chair-step: the inverse of migrations/campaign/choiceval_every_option_gets_its_key.sql. It takes
--   the stored `key` back off every option record, removes the `key` entry from each choice
--   Table's own `fields` array, and soft-deletes the `key` Field definitions that file inserted.
--   The Field definitions are RETIRED rather than destroyed, because this store never destroys a
--   record: `custom.record_delete` is the verb and a retirement is what it does. Running this puts
--   the options back where they were at 2026-09-20 06:35Z — with `custom.choice_options` deriving
--   a key from the title on the fly, which is what made a rename unsafe. It exists so the red twin
--   can execute these bytes.

set lock_timeout = '2s';
set statement_timeout = '600s';

-- The field definition first: while the `key` values are still in the documents, the Table still
-- declares the column they belong to, so `custom._field_shape_guard` has nothing to object to.
update custom.record f
   set deleted_at = now()
 where f.table_id = custom.field_kernel_id()
   and f.deleted_at is null
   and f.data ->> 'key' = 'key'
   and coalesce((f.data ->> 'kept_by_the_app')::boolean, false)
   and (f.data ->> 'entity_definition_id')::uuid in (
         select distinct (g.data -> 'config' ->> 'options_table_id')::uuid
           from custom.record g
          where g.table_id = custom.field_kernel_id()
            and g.deleted_at is null
            and g.data ->> 'type' = 'list'
            and nullif(g.data -> 'config' ->> 'options_table_id', '') is not null);

update custom.record o
   set data = o.data - 'key'
 where o.data ? 'key'
   and o.table_id in (
         select distinct (g.data -> 'config' ->> 'options_table_id')::uuid
           from custom.record g
          where g.table_id = custom.field_kernel_id()
            and g.deleted_at is null
            and g.data ->> 'type' = 'list'
            and nullif(g.data -> 'config' ->> 'options_table_id', '') is not null);

update custom.record t
   set data = jsonb_set(t.data, '{fields}',
                (select coalesce(jsonb_agg(e), '[]'::jsonb)
                   from jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) e
                  where e ->> 'name' is distinct from 'key'))
 where t.table_id = custom.table_kernel_id()
   and t.id in (
         select distinct (g.data -> 'config' ->> 'options_table_id')::uuid
           from custom.record g
          where g.organization_id = t.organization_id
            and g.table_id = custom.field_kernel_id()
            and g.deleted_at is null
            and g.data ->> 'type' = 'list'
            and nullif(g.data -> 'config' ->> 'options_table_id', '') is not null);
