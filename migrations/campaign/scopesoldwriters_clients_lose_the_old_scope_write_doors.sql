-- chair-step: lane SCOPES-OLD-WRITERS (L11 of common-docs/projects/data-doctrine-adoption/v5/SCOPES-CUTOVER-PLAN.md, Phase 3.1, census S5 and S9). The seventeen old public scope write functions stop being client doors: the scope, scope type and context item create / update / archive / restore functions, set_context_value, set_scope_context_value, apply_template, apply_template_by_key and the old tag door set_entity_scopes. Every client write of scopes already goes through the record store's scope doors (custom.context_*), which since scopesoldwriters_the_old_writers_write_through_the_scope_doors.sql reach these functions in the owner's right; the server keeps them (service_role), and so do the definer functions that call them (Trash restore, the value door, the scope doors). Measured on production 2026-09-29: zero PostgREST calls of any of the seventeen by a client role since the statistics reset at 10:17Z, and no runtime file in matrx-frontend, aidream, matrx-extend or matrx-local calls one as a client. Each register row is closed FIRST (signed_in_callers false, the lane that keeps it named), because platform._reopen_declared_doors_after_revoke hands a declared door's grant straight back. Proof: scripts/campaign-tests/scopesoldwriters_clients_lose_red_green.sql (RED before: a signed-in owner calls public.create_scope and it lands; GREEN after: refused 42501, while custom.context_scope_write lands for the same person and a server call of public.create_scope still lands).
-- lane: SCOPES-OLD-WRITERS
-- INVERSE: migrations/inverse/scopesoldwriters_clients_lose_the_old_scope_write_doors_down.sql
-- window-class: seventeen register rows updated, seventeen REVOKEs; no function body, table, policy or trigger touched; no relation lock.

update platform.client_callable_door d
   set signed_in_callers = false,
       anonymous_callers = false,
       anonymous_purpose = null,
       non_client_lane   = 'server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, '
                           'context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / '
                           '_archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / '
                           '_restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this '
                           'function in the owner''s right. The server (service_role) and the definer functions that call it keep it.'
 where d.schema_name = 'public'
   and d.function_name in ('create_scope_type', 'update_scope_type', 'delete_scope_type', 'restore_scope_type',
                           'create_scope', 'update_scope', 'delete_scope', 'restore_scope',
                           'create_context_item', 'update_context_item', 'delete_context_item', 'restore_context_item',
                           'set_context_value', 'set_scope_context_value', 'apply_template', 'apply_template_by_key',
                           'set_entity_scopes');

revoke execute on function public.create_scope_type(uuid, text, text, uuid, text, text, smallint, smallint, text[], text, text) from authenticated, anon, public;
revoke execute on function public.update_scope_type(uuid, text, text, text, text, smallint, smallint, text, text) from authenticated, anon, public;
revoke execute on function public.delete_scope_type(uuid) from authenticated, anon, public;
revoke execute on function public.restore_scope_type(uuid) from authenticated, anon, public;
revoke execute on function public.create_scope(uuid, uuid, text, uuid, text, jsonb, text, smallint) from authenticated, anon, public;
revoke execute on function public.update_scope(uuid, text, text, jsonb, text, smallint) from authenticated, anon, public;
revoke execute on function public.delete_scope(uuid) from authenticated, anon, public;
revoke execute on function public.restore_scope(uuid) from authenticated, anon, public;
revoke execute on function public.create_context_item(uuid, text, text, public.context_value_type, text, text, public.context_fetch_hint, public.context_sensitivity, text[], text, smallint, text[], integer, uuid[], jsonb) from authenticated, anon, public;
revoke execute on function public.update_context_item(uuid, text, text, text, public.context_value_type, public.context_fetch_hint, public.context_sensitivity, text[], smallint, public.context_item_status, text) from authenticated, anon, public;
revoke execute on function public.delete_context_item(uuid) from authenticated, anon, public;
revoke execute on function public.restore_context_item(uuid) from authenticated, anon, public;
revoke execute on function public.set_context_value(jsonb) from authenticated, anon, public;
revoke execute on function public.set_scope_context_value(uuid, uuid, text, numeric, boolean, jsonb, text, date, timestamp with time zone, time without time zone, text) from authenticated, anon, public;
revoke execute on function public.apply_template(uuid, uuid) from authenticated, anon, public;
revoke execute on function public.apply_template_by_key(text, uuid) from authenticated, anon, public;
revoke execute on function public.set_entity_scopes(text, uuid, uuid[]) from authenticated, anon, public;
