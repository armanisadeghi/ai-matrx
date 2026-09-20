-- target: branch,production
-- additive: yes
--   It REPLACES one body, `custom.portal_field_map`, with a `-- based-on:` line. Nothing else.
--   The inverse is in `migrations/inverse/portal_the_field_that_names_the_client_is_what_carries_down.sql`'s sibling.
-- guard: custom/external_principal_enabled
--
-- PORTAL — DEFECT FOUND BY RUNNING IT, 2026-09-20.
--
-- `custom.portal_field_map` read a relation Field's target from
-- `data -> 'config' ->> 'entity_definition_id'`. That is not where the store keeps it, and
-- `entity_definition_id` is a key that DOES exist on every Field — it is the Table the field
-- BELONGS TO, which is the opposite end of the arrow.
--
-- What `custom._field_document_for` actually writes, measured on the main database:
--     'type',            'relation',
--     'relation_target', <the Table the column points at>,   -- top level, not under config
--     'entity_definition_id', <the Table the column is ON>
--
-- So `points_at` came back NULL for every real relation Field and `custom.portal_declare`
-- refused every legitimate one with *"The field "client" points at a different Table from the
-- one whose records are the clients"* — a refusal that was true of nothing. A portal could not
-- be declared at all. The first fixture caught it, which is what a fixture is for.
--
-- `relation_target` is also what a `member` (person) and an `attachment` (file) column carry,
-- pointing at the kernel Person and File Tables, so the same read will answer for a portal
-- that one day names its outsider by a person column rather than by a client record.
-- based-on: custom.portal_field_map(uuid, uuid) e62b651ca0d576113b713eac822a0ddd500bfd490e3294b208d4e3be6cd3c719

create or replace function custom.portal_field_map(p_organization_id uuid, p_table_id uuid)
returns table(field_id uuid, field_key text, field_type text, points_at uuid)
language sql
stable security definer
set search_path to ''
as $function$
  -- Every declared Field of one Table, with what a relation Field points at. Read from
  -- the Field kernel, which is where a Field lives (REC-27) - never from a cache.
  select f.id,
         coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
         f.data ->> 'type',
         nullif(f.data ->> 'relation_target', '')::uuid
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
     and f.deleted_at is null
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id;
$function$;
