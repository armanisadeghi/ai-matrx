-- chair-step: removes the one door tableactions_c_a_table_comes_back_in_passes_too.sql added (its door-register row and the function custom.table_restore(uuid, uuid, integer)) and puts public._trash_store_restore back to the body it had before (a Table in Trash comes back through custom.record_restore in one statement). Nothing else is touched.
-- lane: TABLE-ACTIONS
-- lock: custom
-- based-on: public._trash_store_restore(uuid, uuid) 046a48306dd670137cacbd4857a3cff1b02214dcbfeedefc5306e8884226f970

CREATE OR REPLACE FUNCTION public._trash_store_restore(p_organization_id uuid, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_class text;
begin
  select r.data_class into v_class
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id;
  case v_class
    when 'field'        then perform custom.field_restore(p_organization_id, p_id);
    when 'rule'         then perform custom.rule_restore(p_organization_id, p_id);
    when 'relation'     then perform custom.relation_restore(p_organization_id, p_id);
    when 'doc_template' then perform custom.doc_template_restore(p_organization_id, p_id);
    when 'dashboard'    then perform custom.dashboard_restore(p_organization_id, p_id);
    else perform custom.record_restore(p_organization_id, p_id);
  end case;
end
$function$
;

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'table_restore'
   and identity_args = 'p_organization_id uuid, p_table_id uuid, p_chunk integer';

drop function if exists custom.table_restore(uuid, uuid, integer);
