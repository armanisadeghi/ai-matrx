-- chair-step: the inverse of migrations/campaign/drilltoolfacts_b_a_tool_call_carries_its_repeat_facts.sql (lane DRILL-TOOLFACTS) — drops the eleven refetch triggers on chat.tool_call, chat.request and tool.definition, their five functions and the backfill function, then the seven refetch_* columns of chat.tool_call (a catalogue-only drop, no rewrite). Apply AFTER the inverse of file 3 (the views read these columns until then). No other column or row is touched.
-- lane: DRILL-TOOLFACTS
-- lock: platform

set lock_timeout = '3s';

drop trigger if exists zz_refetch_mark_insert on chat.tool_call;
drop trigger if exists zz_refetch_mark_update on chat.tool_call;
drop trigger if exists zz_refetch_settle_insert on chat.tool_call;
drop trigger if exists zz_refetch_settle_update on chat.tool_call;
drop trigger if exists zz_refetch_settle_delete on chat.tool_call;
drop trigger if exists zz_refetch_trim_insert on chat.request;
drop trigger if exists zz_refetch_trim_update on chat.request;
drop trigger if exists zz_refetch_trim_delete on chat.request;
drop trigger if exists zz_refetch_definition_insert on tool.definition;
drop trigger if exists zz_refetch_definition_update on tool.definition;
drop trigger if exists zz_refetch_definition_delete on tool.definition;

delete from platform.client_callable_door
 where schema_name = 'chat' and function_name in ('_tool_call_refetch_settle', 'tool_call_refetch_backfill');

drop function if exists chat.tool_call_refetch_backfill(integer);
drop function if exists chat._tool_call_refetch_definition_trigger();
drop function if exists chat._tool_call_refetch_request_trigger();
drop function if exists chat._tool_call_refetch_settle_trigger();
drop function if exists chat._tool_call_refetch_mark();
drop function if exists chat._tool_call_refetch_settle(uuid);

alter table chat.tool_call
  drop column if exists refetch_args_hash,
  drop column if exists refetch_out_hash,
  drop column if exists refetch_seq,
  drop column if exists refetch_first_id,
  drop column if exists refetch_prior,
  drop column if exists refetch_trimmed,
  drop column if exists refetch_settled_at;
