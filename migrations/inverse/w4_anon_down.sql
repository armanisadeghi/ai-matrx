-- chair-step: the inverse of W4-ANON — drops the anonymous door, its six tables and its declared doors, in dependency order, and nothing it did not create
--
-- W4-ANON — THE INVERSE.
--
-- Running this CLOSES the campaign's only unauthenticated surface completely, which is the safe
-- direction: nothing else in the platform calls these, because schema `custom` is closed and
-- absent from `pgrst.db_schemas`, so no client and no route reaches them.

set lock_timeout = '2s';
set statement_timeout = '600s';

drop function if exists custom.anon_write(text, text, jsonb, text, jsonb);
drop function if exists custom.anon_clear(uuid, uuid);
drop function if exists custom.anon_inbound_land(text, text, jsonb, jsonb, text);
drop function if exists custom.anon_capture(uuid, text, uuid, jsonb, text, timestamptz);
drop function if exists custom.anon_rate_take(uuid, uuid, text, uuid);
drop function if exists custom.anon_token_verify(text, text, text);
drop function if exists custom.anon_token_revoke(uuid, uuid);
drop function if exists custom.anon_token_issue(uuid, text, jsonb, uuid, uuid, uuid, timestamptz);
drop function if exists custom.anon_publish(uuid, uuid, boolean);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('anon_publish', 'anon_token_issue', 'anon_token_revoke',
                         'anon_token_verify', 'anon_rate_take', 'anon_write', 'anon_clear',
                         'anon_inbound_land', 'anon_capture');

drop table if exists custom.anon_replay;
drop table if exists custom.anon_hit;
drop table if exists custom.anon_submission;
drop table if exists custom.anon_inbound;
drop table if exists custom.anon_token;
drop table if exists custom.anon_form;

delete from platform.entity_types
 where token in ('anon_form', 'anon_token', 'anon_submission', 'anon_hit', 'anon_inbound',
                 'anon_replay');
