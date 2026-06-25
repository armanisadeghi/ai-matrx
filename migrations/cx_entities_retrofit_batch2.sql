-- cx_entities_retrofit_batch2.sql
-- Applied 2026-06-24 (Wave 3 base-retrofit; routine-driven batch).
--
-- ADDITIVE retrofit of 6 cx Base-1 entities via platform.retrofit_entity.
-- DEFERRED: cx_agent_task (its created_by is an enum; rename → created_by_kind needs a
-- consumer audit first). cx_working_documents had TWO legacy updated-at triggers → both
-- dropped here (the routine adds _touch_row and reuses the existing `version` column).
-- Business triggers (e.g. cx_user_todo_done_at) are intentionally preserved.
-- RLS flip / history capture / NOT NULL / drops remain separate gated steps. Idempotent.

drop trigger if exists cx_working_documents_updated_at on public.cx_working_documents;
drop trigger if exists set_updated_at on public.cx_working_documents;

do $$
begin
  perform platform.retrofit_entity('cx_agent_plan','agent_plan','parent','user_id','cx_conversation','conversation_id','cx_agent_plan_updated_at');
  perform platform.retrofit_entity('cx_observational_memory','observational_memory','personal','user_id',null,null,'set_updated_at');
  perform platform.retrofit_entity('cx_tool_call','tool_call','parent','user_id','cx_conversation','conversation_id',null);
  perform platform.retrofit_entity('cx_user_request','user_request','personal','user_id',null,null,null);
  perform platform.retrofit_entity('cx_user_todo','user_todo','parent','user_id','cx_conversation','conversation_id','cx_user_todo_updated_at');
  perform platform.retrofit_entity('cx_working_documents','working_document','personal','user_id',null,null,null);
  raise notice 'cx batch 2 retrofit OK';
end $$;
