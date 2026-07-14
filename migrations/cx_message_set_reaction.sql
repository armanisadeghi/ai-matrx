-- cx_message_set_reaction — persist the user's like/dislike on a message.
--
-- Stores the reaction at metadata.user_reaction ('like' | 'dislike'; NULL or
-- '' clears it) via jsonb_set so concurrent metadata writers are never
-- clobbered by a client-side read-modify-write. The empty-string clear form
-- exists because supabase codegen types function args non-nullable — the
-- client passes '' to clear without fighting the generated types.
--
-- SECURITY INVOKER on purpose: chat.message RLS (std_update — conversation
-- editor via iam.has_access) is the authorization layer, same as every other
-- direct message write. Companion to cx_message_edit / cx_message_soft_delete.

create or replace function public.cx_message_set_reaction(
  p_message_id uuid,
  p_reaction text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_metadata jsonb;
begin
  if p_reaction is not null and p_reaction not in ('', 'like', 'dislike') then
    raise exception 'invalid reaction: %', p_reaction;
  end if;

  update chat.message
     set metadata = case
       when p_reaction is null or p_reaction = ''
         then coalesce(metadata, '{}'::jsonb) - 'user_reaction'
       else jsonb_set(
         coalesce(metadata, '{}'::jsonb),
         '{user_reaction}',
         to_jsonb(p_reaction),
         true
       )
     end
   where id = p_message_id
  returning metadata into v_metadata;

  if not found then
    raise exception 'message not found or not permitted: %', p_message_id;
  end if;

  return v_metadata;
end;
$$;

grant execute on function public.cx_message_set_reaction(uuid, text) to authenticated;
