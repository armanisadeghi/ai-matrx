-- INVERSE of migrations/campaign/scopesoldwriters_clients_lose_the_old_scope_write_doors.sql (lane SCOPES-OLD-WRITERS).
-- chair-step: gives `authenticated` EXECUTE back on the seventeen old public scope write functions and puts their seventeen register rows back as production held them on 2026-09-29 (signed-in callers, no anonymous callers, no non-client lane). The rows are re-opened FIRST, because platform.enforce_definer_client_grants takes a client grant straight back from a SECURITY DEFINER function the register does not declare for signed-in callers.

update platform.client_callable_door d
   set signed_in_callers = true,
       anonymous_callers = false,
       anonymous_purpose = null,
       non_client_lane   = null
 where d.schema_name = 'public'
   and d.function_name in ('create_scope_type', 'update_scope_type', 'delete_scope_type', 'restore_scope_type',
                           'create_scope', 'update_scope', 'delete_scope', 'restore_scope',
                           'create_context_item', 'update_context_item', 'delete_context_item', 'restore_context_item',
                           'set_context_value', 'set_scope_context_value', 'apply_template', 'apply_template_by_key',
                           'set_entity_scopes');

grant execute on function public.create_scope_type(uuid, text, text, uuid, text, text, smallint, smallint, text[], text, text) to authenticated;
grant execute on function public.update_scope_type(uuid, text, text, text, text, smallint, smallint, text, text) to authenticated;
grant execute on function public.delete_scope_type(uuid) to authenticated;
grant execute on function public.restore_scope_type(uuid) to authenticated;
grant execute on function public.create_scope(uuid, uuid, text, uuid, text, jsonb, text, smallint) to authenticated;
grant execute on function public.update_scope(uuid, text, text, jsonb, text, smallint) to authenticated;
grant execute on function public.delete_scope(uuid) to authenticated;
grant execute on function public.restore_scope(uuid) to authenticated;
grant execute on function public.create_context_item(uuid, text, text, public.context_value_type, text, text, public.context_fetch_hint, public.context_sensitivity, text[], text, smallint, text[], integer, uuid[], jsonb) to authenticated;
grant execute on function public.update_context_item(uuid, text, text, text, public.context_value_type, public.context_fetch_hint, public.context_sensitivity, text[], smallint, public.context_item_status, text) to authenticated;
grant execute on function public.delete_context_item(uuid) to authenticated;
grant execute on function public.restore_context_item(uuid) to authenticated;
grant execute on function public.set_context_value(jsonb) to authenticated;
grant execute on function public.set_scope_context_value(uuid, uuid, text, numeric, boolean, jsonb, text, date, timestamp with time zone, time without time zone, text) to authenticated;
grant execute on function public.apply_template(uuid, uuid) to authenticated;
grant execute on function public.apply_template_by_key(text, uuid) to authenticated;
grant execute on function public.set_entity_scopes(text, uuid, uuid[]) to authenticated;
