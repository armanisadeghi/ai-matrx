-- Canonicalize feedback screenshots on files.files identity.
-- image_urls remains solely as a lossless read path for historical rows whose
-- URLs cannot be mapped to a file deterministically; new writes use UUIDs.

alter table users.user_feedback
  add column if not exists image_file_ids uuid[] not null default '{}'::uuid[];

alter table public.feedback_user_messages
  add column if not exists image_file_ids uuid[] not null default '{}'::uuid[];

comment on column users.user_feedback.image_file_ids is
  'Canonical files.files IDs for attached screenshots. New writes must not populate image_urls.';
comment on column public.feedback_user_messages.image_file_ids is
  'Canonical files.files IDs for attached screenshots. New writes must not populate image_urls.';

drop function if exists public.send_user_review_message(uuid,text,text,text[]);
drop function if exists public.admin_reply_user_review(uuid,text,text,text[]);
drop function if exists public.reply_to_user_review(uuid,text,text,text[]);
drop function if exists public._d31_impl_send_user_review_message(uuid,text,text,text[]);
drop function if exists public._d31_impl_admin_reply_user_review(uuid,text,text,text[]);
drop function if exists public._d31_impl_reply_to_user_review(uuid,text,text,text[]);

create function public._d31_impl_send_user_review_message(
  p_feedback_id uuid,
  p_message text,
  p_sender_name text default 'Admin'::text,
  p_image_file_ids uuid[] default null::uuid[]
) returns json
language plpgsql security definer
set search_path to 'users', 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_message feedback_user_messages;
  v_feedback user_feedback;
begin
  select * into v_feedback from user_feedback where id = p_feedback_id;
  if not found then raise exception 'Feedback item not found: %', p_feedback_id; end if;

  update user_feedback set status = 'user_review', updated_at = now()
  where id = p_feedback_id;

  insert into feedback_user_messages
    (feedback_id, sender_type, sender_name, content, image_file_ids)
  values
    (p_feedback_id, 'admin', p_sender_name, p_message, coalesce(p_image_file_ids, '{}'::uuid[]))
  returning * into v_message;

  return row_to_json(v_message);
end;
$function$;

create function public._d31_impl_admin_reply_user_review(
  p_feedback_id uuid,
  p_message text,
  p_sender_name text default 'Admin'::text,
  p_image_file_ids uuid[] default null::uuid[]
) returns json
language plpgsql security definer
set search_path to 'users', 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_message feedback_user_messages;
begin
  insert into feedback_user_messages
    (feedback_id, sender_type, sender_name, content, image_file_ids)
  values
    (p_feedback_id, 'admin', p_sender_name, p_message, coalesce(p_image_file_ids, '{}'::uuid[]))
  returning * into v_message;

  update user_feedback set status = 'user_review', updated_at = now()
  where id = p_feedback_id and status = 'awaiting_review';

  return row_to_json(v_message);
end;
$function$;

create function public._d31_impl_reply_to_user_review(
  p_feedback_id uuid,
  p_message text,
  p_sender_name text default 'User'::text,
  p_image_file_ids uuid[] default null::uuid[]
) returns json
language plpgsql security definer
set search_path to 'users', 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_message feedback_user_messages;
  v_feedback user_feedback;
begin
  select * into v_feedback from user_feedback where id = p_feedback_id;
  if not found then raise exception 'Feedback item not found: %', p_feedback_id; end if;

  insert into feedback_user_messages
    (feedback_id, sender_type, sender_name, content, image_file_ids)
  values
    (p_feedback_id, 'user', p_sender_name, p_message, coalesce(p_image_file_ids, '{}'::uuid[]))
  returning * into v_message;

  update user_feedback set status = 'awaiting_review', updated_at = now()
  where id = p_feedback_id;

  return row_to_json(v_message);
end;
$function$;

create function public.send_user_review_message(
  p_feedback_id uuid,
  p_message text,
  p_sender_name text default 'Admin'::text,
  p_image_file_ids uuid[] default null::uuid[]
) returns json
language plpgsql security definer
set search_path to 'public', 'pg_temp'
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
  return public._d31_impl_send_user_review_message(p_feedback_id,p_message,v_name,p_image_file_ids);
end;
$function$;

create function public.admin_reply_user_review(
  p_feedback_id uuid,
  p_message text,
  p_sender_name text default 'Admin'::text,
  p_image_file_ids uuid[] default null::uuid[]
) returns json
language plpgsql security definer
set search_path to 'public', 'pg_temp'
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
  return public._d31_impl_admin_reply_user_review(p_feedback_id,p_message,v_name,p_image_file_ids);
end;
$function$;

create function public.reply_to_user_review(
  p_feedback_id uuid,
  p_message text,
  p_sender_name text default 'User'::text,
  p_image_file_ids uuid[] default null::uuid[]
) returns json
language plpgsql security definer
set search_path to 'public', 'pg_temp'
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
  return public._d31_impl_reply_to_user_review(p_feedback_id,p_message,v_name,p_image_file_ids);
end;
$function$;

revoke all on function public.send_user_review_message(uuid,text,text,uuid[]) from public;
revoke all on function public.admin_reply_user_review(uuid,text,text,uuid[]) from public;
revoke all on function public.reply_to_user_review(uuid,text,text,uuid[]) from public;
grant execute on function public.send_user_review_message(uuid,text,text,uuid[]) to authenticated, service_role;
grant execute on function public.admin_reply_user_review(uuid,text,text,uuid[]) to authenticated, service_role;
grant execute on function public.reply_to_user_review(uuid,text,text,uuid[]) to authenticated, service_role;
