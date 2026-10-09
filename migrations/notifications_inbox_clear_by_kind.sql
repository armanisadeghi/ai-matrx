-- Lane BELL-OWNER, 2026-10-07 (Arman: "Nothing in the badge or in inbox zero may be impossible to clear in one or two clicks").
--
-- INBOX ZERO IN ONE OR TWO CLICKS (Arman, 2026-10-07: "we don't play mind games with them with
-- things that are incredibly hard to do being part of the count").
--
-- `set_notifications_state` acts on ids the client holds (at most 500, the loaded page). A person
-- with 300 unread "Request submitted" notices could not clear them without paging through every
-- one. These two doors act on the WHOLE inbox, by kind:
--
--   communication.my_inbox_kinds()
--     every event type in the caller's Inbox (not Done, not snoozed) with its count and how many
--     are unseen — the "group by kind" the bell and the inbox list, newest kind first.
--   communication.clear_inbox(p_action, p_event_keys, p_until)
--     Done / read / snooze every Inbox notice of the given kinds (null = every kind) in one call,
--     and return the ids it changed so the client's Undo can put exactly those back through
--     `set_notifications_state(ids, 'undone' | 'unread' | 'unsnooze')`.
--
-- Nothing is destroyed: Done is recoverable from the Done view; snooze returns on its own.
-- Both doors are SECURITY DEFINER, resolve auth.uid() inside, touch only the caller's own in_app
-- rows, and are declared in platform.client_callable_door before the GRANT. Adds only.
-- Inverse: migrations/inverse/notifications_inbox_clear_by_kind_down.sql

set local lock_timeout = '2s';

create or replace function communication.my_inbox_kinds()
returns table (event_key text, event_label text, event_bucket text, notices integer, unseen integer, latest_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select n.event_key,
         max(et.label),
         coalesce(max(et.config->>'bucket'), 'direct'),
         count(*)::integer,
         (count(*) filter (where n.seen_at is null and n.read_at is null))::integer,
         max(n.created_at)
    from communication.notification n
    left join communication.notification_event_type et
      on et.event_key = n.event_key and et.deleted_at is null
   where n.recipient_user_id = auth.uid()
     and auth.uid() is not null
     and n.channel = 'in_app'
     and n.status = 'succeeded'
     and n.deleted_at is null
     and n.done_at is null
     and (n.snoozed_until is null or n.snoozed_until <= now())
   group by n.event_key
   order by max(n.created_at) desc;
$function$;

create or replace function communication.clear_inbox(
  p_action text default 'done',
  p_event_keys text[] default null,
  p_until timestamptz default null
)
returns uuid[]
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_action not in ('done', 'read', 'snooze') then
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;
  if p_action = 'snooze' and (p_until is null or p_until <= now()) then
    raise exception 'A snooze needs a time in the future' using errcode = '22023';
  end if;

  with changed as (
    update communication.notification n
       set done_at       = case when p_action = 'done' then coalesce(n.done_at, now()) else n.done_at end,
           snoozed_until = case p_action when 'snooze' then p_until when 'done' then null else n.snoozed_until end,
           read_at       = case p_action when 'read' then coalesce(n.read_at, now())
                                         when 'snooze' then null else n.read_at end,
           read_channel  = case p_action when 'read' then coalesce(n.read_channel, 'in_app')
                                         when 'snooze' then null else n.read_channel end,
           seen_at       = case p_action when 'snooze' then null else coalesce(n.seen_at, now()) end,
           updated_at    = now()
     where n.recipient_user_id = v_uid
       and n.channel = 'in_app'
       and n.status = 'succeeded'
       and n.deleted_at is null
       and n.done_at is null
       and (n.snoozed_until is null or n.snoozed_until <= now())
       and (p_event_keys is null or n.event_key = any(p_event_keys))
       and (p_action <> 'read' or n.read_at is null)
    returning n.id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into v_ids from changed;
  return v_ids;
end
$function$;

insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes,
  reason, declared_by, gate_predicate, signed_in_callers, anonymous_callers, argument_rules
)
select v.schema_name, v.function_name, v.identity_args, v.identity_argtypes,
       'Signed-in door for the shell Inbox: the caller is resolved inside the body by auth.uid() and only rows with recipient_user_id = caller are read/updated (in_app channel of communication.notification). p_event_keys only narrows the caller''s own rows.',
       'notifications_inbox_clear_by_kind.sql', 'auth.uid()', true, false, null::jsonb
  from (values
    ('communication', 'my_inbox_kinds', '', array[]::oid[]),
    ('communication', 'clear_inbox', 'p_action text, p_event_keys text[], p_until timestamp with time zone',
     array['text','text[]','timestamptz']::regtype[]::oid[])
  ) as v(schema_name, function_name, identity_args, identity_argtypes)
 where not exists (
   select 1 from platform.client_callable_door d
    where d.schema_name = v.schema_name and d.function_name = v.function_name
 );

grant execute on function communication.my_inbox_kinds() to authenticated;
grant execute on function communication.clear_inbox(text, text[], timestamptz) to authenticated;

notify pgrst, 'reload schema';
