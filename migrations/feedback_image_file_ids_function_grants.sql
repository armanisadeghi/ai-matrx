-- The public wrappers enforce platform-admin / feedback-owner access. Their
-- implementation functions are internal and must never be callable directly.

revoke all on function public._d31_impl_send_user_review_message(uuid,text,text,uuid[])
  from public, anon, authenticated;
revoke all on function public._d31_impl_admin_reply_user_review(uuid,text,text,uuid[])
  from public, anon, authenticated;
revoke all on function public._d31_impl_reply_to_user_review(uuid,text,text,uuid[])
  from public, anon, authenticated;

revoke all on function public.send_user_review_message(uuid,text,text,uuid[])
  from public, anon;
revoke all on function public.admin_reply_user_review(uuid,text,text,uuid[])
  from public, anon;
revoke all on function public.reply_to_user_review(uuid,text,text,uuid[])
  from public, anon;

grant execute on function public.send_user_review_message(uuid,text,text,uuid[])
  to authenticated, service_role;
grant execute on function public.admin_reply_user_review(uuid,text,text,uuid[])
  to authenticated, service_role;
grant execute on function public.reply_to_user_review(uuid,text,text,uuid[])
  to authenticated, service_role;
