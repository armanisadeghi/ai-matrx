-- additive: yes
--
-- chair-step: the inverse of writeperf3b_the_outbox_asks_its_questions_once_per_statement.sql —
--   it restores custom.io_record_changed_stmt_insert to the exact bytes that file replaced.
--
-- based-on: custom.io_record_changed_stmt_insert() 0f0134ec1bfef8a7e7108ddc1c75c5557c60af696a9668c9ad8d0d38051d71db

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  select n.organization_id, 'records.changed', n.id, n.table_id, 'created',
         case when coalesce(array_length(custom.io_changed_keys('{}'::jsonb, n.data), 1), 0) = 0
              then '[]'::jsonb
              else custom.io_changed_field_ids(n.organization_id, n.table_id,
                     '{}'::jsonb, coalesce(n.data, '{}'::jsonb)) end,
         jsonb_build_object(
           'user_id',   custom.query_principal(),
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  coalesce(n.data, '{}'::jsonb) ->> '_actor'),
         n.organization_id::text || ':' || n.id::text || ':' || coalesce(n.version, 0)::text || ':created',
         nullif(current_setting('custom.op_id', true), '')::uuid
    from new_rows n
   order by n.id
  on conflict do nothing;

  return null;
end;
$function$

;
