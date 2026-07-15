-- D31: feedback workflow functions ran as owner while PUBLIC/anon could invoke
-- them.  Keep external-agent operations service-only and put the four browser
-- workflows behind explicit admin/owner wrappers.

drop function public.send_user_review_message(uuid, text, text);
drop function public.admin_reply_user_review(uuid, text, text);
drop function public.reply_to_user_review(uuid, text, text);

alter function public.add_feedback_comment(uuid, text, text, text)
  rename to _d31_impl_add_feedback_comment;
alter function public.get_feedback_comments(uuid)
  rename to _d31_impl_get_feedback_comments;
alter function public.send_user_review_message(uuid, text, text, text[])
  rename to _d31_impl_send_user_review_message;
alter function public.admin_reply_user_review(uuid, text, text, text[])
  rename to _d31_impl_admin_reply_user_review;
alter function public.reply_to_user_review(uuid, text, text, text[])
  rename to _d31_impl_reply_to_user_review;
alter function public.get_user_messages(uuid)
  rename to _d31_impl_get_user_messages;
alter function public.close_feedback_item(uuid, text, text)
  rename to _d31_impl_close_feedback_item;

revoke execute on function public._d31_impl_add_feedback_comment(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke execute on function public._d31_impl_get_feedback_comments(uuid) from public,anon,authenticated,service_role;
revoke execute on function public._d31_impl_send_user_review_message(uuid,text,text,text[]) from public,anon,authenticated,service_role;
revoke execute on function public._d31_impl_admin_reply_user_review(uuid,text,text,text[]) from public,anon,authenticated,service_role;
revoke execute on function public._d31_impl_reply_to_user_review(uuid,text,text,text[]) from public,anon,authenticated,service_role;
revoke execute on function public._d31_impl_get_user_messages(uuid) from public,anon,authenticated,service_role;
revoke execute on function public._d31_impl_close_feedback_item(uuid,text,text) from public,anon,authenticated,service_role;

create function public.add_feedback_comment(
  p_feedback_id uuid,
  p_author_type text,
  p_author_name text,
  p_content text
)
returns public.feedback_comments language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare v_name text; v_type text;
begin
  if (auth.role()='service_role' or coalesce(public.is_platform_admin(),false)) is not true then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_content,''))) not between 1 and 20000 then
    raise exception 'comment content is required and must be at most 20000 characters' using errcode='22023';
  end if;
  if auth.role()='service_role' then
    v_name := coalesce(nullif(btrim(p_author_name),''),'Agent');
    v_type := case when p_author_type in ('admin','ai_agent') then p_author_type else 'ai_agent' end;
  else
    select coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.email::text,'Admin')
      into v_name from auth.users u where u.id=auth.uid();
    v_type := 'admin';
  end if;
  return public._d31_impl_add_feedback_comment(p_feedback_id,v_type,v_name,p_content);
end;
$function$;

create function public.get_feedback_comments(p_feedback_id uuid)
returns setof public.feedback_comments language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
begin
  if (auth.role()='service_role' or coalesce(public.is_platform_admin(),false)) is not true then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  return query select * from public._d31_impl_get_feedback_comments(p_feedback_id);
end;
$function$;

create function public.send_user_review_message(
  p_feedback_id uuid,
  p_message text,
  p_sender_name text default 'Admin',
  p_image_urls text[] default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare v_name text;
begin
  if (auth.role()='service_role' or coalesce(public.is_platform_admin(),false)) is not true then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_message,''))) not between 1 and 20000 then
    raise exception 'message is required and must be at most 20000 characters' using errcode='22023';
  end if;
  if auth.role()='service_role' then v_name:=coalesce(nullif(btrim(p_sender_name),''),'Admin');
  else
    select coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.email::text,'Admin')
      into v_name from auth.users u where u.id=auth.uid();
  end if;
  return public._d31_impl_send_user_review_message(p_feedback_id,p_message,v_name,p_image_urls);
end;
$function$;

create function public.admin_reply_user_review(
  p_feedback_id uuid,
  p_message text,
  p_sender_name text default 'Admin',
  p_image_urls text[] default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare v_name text;
begin
  if (auth.role()='service_role' or coalesce(public.is_platform_admin(),false)) is not true then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_message,''))) not between 1 and 20000 then
    raise exception 'message is required and must be at most 20000 characters' using errcode='22023';
  end if;
  if auth.role()='service_role' then v_name:=coalesce(nullif(btrim(p_sender_name),''),'Admin');
  else
    select coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.email::text,'Admin')
      into v_name from auth.users u where u.id=auth.uid();
  end if;
  return public._d31_impl_admin_reply_user_review(p_feedback_id,p_message,v_name,p_image_urls);
end;
$function$;

create function public.reply_to_user_review(
  p_feedback_id uuid,
  p_message text,
  p_sender_name text default 'User',
  p_image_urls text[] default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare v_name text;
begin
  if (
    auth.role()='service_role'
    or exists (
      select 1 from users.user_feedback f
      where f.id=p_feedback_id and f.deleted_at is null
        and (f.user_id=auth.uid() or f.created_by=auth.uid())
    )
  ) is not true then
    raise exception 'feedback owner required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_message,''))) not between 1 and 20000 then
    raise exception 'message is required and must be at most 20000 characters' using errcode='22023';
  end if;
  if auth.role()='service_role' then v_name:=coalesce(nullif(btrim(p_sender_name),''),'User');
  else
    select coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.email::text,'User')
      into v_name from auth.users u where u.id=auth.uid();
  end if;
  return public._d31_impl_reply_to_user_review(p_feedback_id,p_message,v_name,p_image_urls);
end;
$function$;

create function public.get_user_messages(p_feedback_id uuid)
returns setof public.feedback_user_messages language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
begin
  if (
    auth.role()='service_role'
    or coalesce(public.is_platform_admin(),false)
    or exists (
      select 1 from users.user_feedback f
      where f.id=p_feedback_id and f.deleted_at is null
        and (f.user_id=auth.uid() or f.created_by=auth.uid())
    )
  ) is not true then
    raise exception 'feedback access denied' using errcode='42501';
  end if;
  return query select * from public._d31_impl_get_user_messages(p_feedback_id);
end;
$function$;

create function public.close_feedback_item(
  p_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns users.user_feedback language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare v_is_admin boolean:=coalesce(public.is_platform_admin(),false); v_is_owner boolean; v_current text;
begin
  select (f.user_id=auth.uid() or f.created_by=auth.uid()),f.status
    into v_is_owner,v_current from users.user_feedback f
    where f.id=p_id and f.deleted_at is null;
  if auth.role()<>'service_role' and not v_is_admin then
    if coalesce(v_is_owner,false) is not true or p_status<>'closed' or v_current<>'resolved' then
      raise exception 'only the owner may close resolved feedback' using errcode='42501';
    end if;
    p_admin_notes:=null;
  end if;
  return public._d31_impl_close_feedback_item(p_id,p_status,p_admin_notes);
end;
$function$;

revoke execute on function public.add_feedback_comment(uuid,text,text,text) from public,anon;
revoke execute on function public.get_feedback_comments(uuid) from public,anon;
revoke execute on function public.send_user_review_message(uuid,text,text,text[]) from public,anon;
revoke execute on function public.admin_reply_user_review(uuid,text,text,text[]) from public,anon;
revoke execute on function public.reply_to_user_review(uuid,text,text,text[]) from public,anon;
revoke execute on function public.get_user_messages(uuid) from public,anon;
revoke execute on function public.close_feedback_item(uuid,text,text) from public,anon;
grant execute on function public.add_feedback_comment(uuid,text,text,text) to authenticated,service_role;
grant execute on function public.get_feedback_comments(uuid) to authenticated,service_role;
grant execute on function public.send_user_review_message(uuid,text,text,text[]) to authenticated,service_role;
grant execute on function public.admin_reply_user_review(uuid,text,text,text[]) to authenticated,service_role;
grant execute on function public.reply_to_user_review(uuid,text,text,text[]) to authenticated,service_role;
grant execute on function public.get_user_messages(uuid) to authenticated,service_role;
grant execute on function public.close_feedback_item(uuid,text,text) to authenticated,service_role;

-- External-agent/admin pipeline operations are reachable only through the
-- API-key-gated service layer, which uses createAdminClient().
revoke execute on function public.claim_feedback_item(uuid,text,text,integer) from public,anon,authenticated;
revoke execute on function public.triage_feedback_item(uuid,text,text,text,text[],integer,text,uuid) from public,anon,authenticated;
revoke execute on function public.resolve_feedback_item(uuid,text,uuid) from public,anon,authenticated;
revoke execute on function public.resolve_with_testing(uuid,text,text,text) from public,anon,authenticated;
revoke execute on function public.split_feedback_item(uuid,text[]) from public,anon,authenticated;
revoke execute on function public.get_agent_work_queue() from public,anon,authenticated;
revoke execute on function public.get_feedback_by_status(text) from public,anon,authenticated;
revoke execute on function public.get_feedback_summary() from public,anon,authenticated;
revoke execute on function public.get_pending_feedback() from public,anon,authenticated;
revoke execute on function public.get_triage_batch(integer) from public,anon,authenticated;
revoke execute on function public.get_untriaged_feedback() from public,anon,authenticated;
revoke execute on function public.set_admin_decision(uuid,text,text,integer) from public,anon,authenticated;
revoke execute on function public.mark_user_message_emailed(uuid) from public,anon,authenticated;

grant execute on function public.claim_feedback_item(uuid,text,text,integer) to service_role;
grant execute on function public.triage_feedback_item(uuid,text,text,text,text[],integer,text,uuid) to service_role;
grant execute on function public.resolve_feedback_item(uuid,text,uuid) to service_role;
grant execute on function public.resolve_with_testing(uuid,text,text,text) to service_role;
grant execute on function public.split_feedback_item(uuid,text[]) to service_role;
grant execute on function public.get_agent_work_queue() to service_role;
grant execute on function public.get_feedback_by_status(text) to service_role;
grant execute on function public.get_feedback_summary() to service_role;
grant execute on function public.get_pending_feedback() to service_role;
grant execute on function public.get_triage_batch(integer) to service_role;
grant execute on function public.get_untriaged_feedback() to service_role;
grant execute on function public.set_admin_decision(uuid,text,text,integer) to service_role;
grant execute on function public.mark_user_message_emailed(uuid) to service_role;

-- Eliminate the two table-level workflow bypasses. Owner edits go through the
-- narrow RPC below; review-message inserts go through reply_to_user_review.
revoke update on table users.user_feedback from authenticated;
revoke insert on table public.feedback_user_messages from authenticated;
revoke insert,update,delete on table public.feedback_comments from authenticated;

create or replace function public.update_user_own_feedback(
  p_feedback_id uuid,
  p_description text default null,
  p_feedback_type text default null
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_description is not null and length(btrim(p_description)) not between 1 and 20000 then
    raise exception 'description must be between 1 and 20000 characters' using errcode='22023';
  end if;
  if p_feedback_type is not null and p_feedback_type not in ('bug','feature','suggestion','other') then
    raise exception 'invalid feedback type' using errcode='22023';
  end if;
  update users.user_feedback f
  set description=coalesce(p_description,f.description),
      feedback_type=coalesce(p_feedback_type,f.feedback_type),
      updated_at=now()
  where f.id=p_feedback_id and f.deleted_at is null and f.status='new'
    and (f.user_id=auth.uid() or f.created_by=auth.uid())
  returning to_jsonb(f.*) into v_result;
  if v_result is null then raise exception 'editable feedback not found' using errcode='P0002'; end if;
  return v_result;
end;
$function$;

revoke execute on function public.update_user_own_feedback(uuid,text,text) from public,anon;
grant execute on function public.update_user_own_feedback(uuid,text,text) to authenticated,service_role;
