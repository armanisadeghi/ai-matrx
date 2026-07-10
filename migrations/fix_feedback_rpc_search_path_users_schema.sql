-- The users.user_feedback table was moved out of public during the 2026 schema
-- reorg, but these SECURITY DEFINER functions still reference "user_feedback"
-- unqualified and rely on search_path, which never included "users". Pin
-- search_path so the bare references resolve, and as SECURITY DEFINER hardening.

alter function public.add_feedback_comment(uuid,text,text,text) set search_path = users, public, extensions, pg_temp;
alter function public.admin_reply_user_review(uuid,text,text) set search_path = users, public, extensions, pg_temp;
alter function public.admin_reply_user_review(uuid,text,text,text[]) set search_path = users, public, extensions, pg_temp;
alter function public.claim_feedback_item(uuid,text,text,integer) set search_path = users, public, extensions, pg_temp;
alter function public.close_feedback_item(uuid,text,text) set search_path = users, public, extensions, pg_temp;
alter function public.get_agent_work_queue() set search_path = users, public, extensions, pg_temp;
alter function public.get_feedback_by_status(text) set search_path = users, public, extensions, pg_temp;
alter function public.get_feedback_summary() set search_path = users, public, extensions, pg_temp;
alter function public.get_pending_feedback() set search_path = users, public, extensions, pg_temp;
alter function public.get_triage_batch(integer) set search_path = users, public, extensions, pg_temp;
alter function public.get_untriaged_feedback() set search_path = users, public, extensions, pg_temp;
alter function public.get_user_own_feedback(uuid) set search_path = users, public, extensions, pg_temp;
alter function public.reply_to_user_review(uuid,text,text) set search_path = users, public, extensions, pg_temp;
alter function public.reply_to_user_review(uuid,text,text,text[]) set search_path = users, public, extensions, pg_temp;
alter function public.resolve_feedback_item(uuid,text,uuid) set search_path = users, public, extensions, pg_temp;
alter function public.resolve_with_testing(uuid,text,text,text) set search_path = users, public, extensions, pg_temp;
alter function public.send_user_review_message(uuid,text,text) set search_path = users, public, extensions, pg_temp;
alter function public.send_user_review_message(uuid,text,text,text[]) set search_path = users, public, extensions, pg_temp;
alter function public.set_admin_decision(uuid,text,text,integer) set search_path = users, public, extensions, pg_temp;
alter function public.split_feedback_item(uuid,text[]) set search_path = users, public, extensions, pg_temp;
alter function public.triage_feedback_item(uuid,text,text,text,text[],integer,text) set search_path = users, public, extensions, pg_temp;
alter function public.triage_feedback_item(uuid,text,text,text,text[],integer,text,uuid) set search_path = users, public, extensions, pg_temp;
