-- INVERSE of migrations/campaign/uiedit_a_choice_field_can_be_chosen.sql.
--
-- It puts `custom.field_options` back to the `LANGUAGE sql` body it had before
-- the door was declared, and removes the declaration row. It deliberately does
-- NOT revoke the EXECUTE grant with a `revoke` of its own: `custom.field_options`
-- becomes SECURITY INVOKER again, and `authenticated` holds SELECT on zero
-- tables in schema `custom`, so the grant it leaves behind opens nothing — while
-- a REVOKE on a live door is the one thing this campaign never does on a
-- database the app is pointed at.

set lock_timeout = '2s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.field_options(p_organization_id uuid, p_field_id uuid)
 RETURNS SETOF custom.record
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select o.*
    from custom.record f
    join custom.record o
      on o.organization_id = f.organization_id
     and o.table_id = (f.data -> 'config' ->> 'options_table_id')::uuid
     and o.deleted_at is null
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
$function$;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'field_options'
   and declared_by = 'migrations/campaign/uiedit_a_choice_field_can_be_chosen.sql (lane UI-EDIT)';
