-- window-class: drop trigger takes ACCESS EXCLUSIVE on custom.io_outbox AND on the 23 auth / storage / realtime relations of the supautils set (scripts/lib/ddl-lock-footprint.json, drop trigger / plain table), so at production this runs 01:00–04:00 Pacific only.
-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_every_row_change_reaches_the_webhook.sql. It drops the
-- trigger on custom.io_outbox and its function, the three webhook doors and their door rows, and
-- the knob row it added.
-- WHAT IT DOES NOT UNDO: a webhook an admin declared stays in files.webhooks (switched on) and
-- the activity rows already written stay in platform.activity_log; once the trigger is gone no new
-- record change is logged, so those webhooks go quiet. Nothing is deleted.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop trigger if exists zz_gridprim_record_events_s_i on custom.io_outbox;
drop function if exists custom._record_events_to_activity();
drop function if exists custom.table_webhook_archive(uuid, uuid);
drop function if exists custom.table_webhooks(uuid, uuid);
drop function if exists custom.table_webhook_declare(uuid, uuid, text, text[], text);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'gridprim_every_row_change_reaches_the_webhook.sql';

delete from platform.feature_knob where feature = 'custom' and key = 'table_webhooks_max';
