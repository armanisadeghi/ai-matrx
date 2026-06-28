-- agent_run_canon_02_move_to_chat
-- Move agent_run + agent_run_stage public -> chat (clean cut). Policies/triggers/FKs (incl. inbound
-- pc_studio_run_assets FKs) follow. No functions reference these tables; no sharing-registry rows.
-- Idempotent-on-fresh (SET SCHEMA is not re-runnable once moved). Applied live via Supabase MCP.
alter table public.agent_run       set schema chat;
alter table public.agent_run_stage set schema chat;

grant select, insert, update, delete on chat.agent_run, chat.agent_run_stage to authenticated;
grant all on chat.agent_run, chat.agent_run_stage to service_role;

update platform.entity_types set schema_name='chat' where token in ('agent_run','agent_run_stage');
