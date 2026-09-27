-- INVERSE of migrations/campaign/scopeswt_the_scope_doors.sql (lane SCOPES-WRITE-THROUGH).
-- chair-step: drops the store's scope doors (custom.context_*) and their door rows. Callers fall back to nothing: take the web app's scopes service and the server's write-back back to the old doors in the same step (their commits name this file).


delete from platform.client_callable_door where schema_name = 'custom'
   and function_name in ('_ctx_answer', '_ctx_value_write_store', 'context_type_write', 'context_type_archive', 'context_type_restore',
                         'context_scope_write', 'context_scope_archive', 'context_scope_restore', 'context_item_write',
                         'context_item_archive', 'context_item_restore', 'context_value_write', 'context_template_apply',
                         'context_templates', 'context_tags_set');
drop function if exists custom.context_tags_set(text, uuid, uuid[]);
drop function if exists custom.context_templates();
drop function if exists custom.context_template_apply(uuid, uuid);
drop function if exists custom.context_value_write(jsonb);
drop function if exists custom._ctx_value_write_store(jsonb);
drop function if exists custom.context_item_restore(uuid);
drop function if exists custom.context_item_archive(uuid);
drop function if exists custom.context_item_write(uuid, uuid, jsonb);
drop function if exists custom.context_scope_restore(uuid);
drop function if exists custom.context_scope_archive(uuid);
drop function if exists custom.context_scope_write(uuid, uuid, uuid, jsonb);
drop function if exists custom.context_type_restore(uuid);
drop function if exists custom.context_type_archive(uuid);
drop function if exists custom.context_type_write(uuid, uuid, jsonb);
drop function if exists custom._ctx_answer(uuid, uuid, jsonb);
