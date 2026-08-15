-- Authenticated, family-scoped SMS preference contract for the production
-- Messaging surface. The browser never receives authority over another user or
-- over unrelated SMS/assistant settings.

drop function if exists communication.get_my_sms_task_notification_preference(text);
create function communication.get_my_sms_task_notification_preference(
  p_program_key text default 'ai_matrx_owner_beta'
)
returns table (
  masked_phone text,
  sms_enabled boolean,
  task_notifications boolean,
  consent_status text,
  program_key text,
  destination_ready boolean,
  can_enable boolean,
  blocked_reasons text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_program_key), '') is null then
    raise exception 'Program key is required' using errcode = '22023';
  end if;

  return query
  select
    case
      when preference.phone_number is null then null::text
      else '•••' || right(preference.phone_number, 4)
    end,
    preference.sms_enabled,
    preference.task_notifications,
    coalesce(consent.status, 'unknown'),
    preference.assistant_program_key,
    destination.id is not null,
    preference.sms_enabled
      and preference.phone_number is not null
      and preference.assistant_program_key = p_program_key
      and coalesce(consent.status, 'unknown') = 'opted_in',
    array_remove(array[
      case when not preference.sms_enabled then 'sms_disabled' end,
      case when preference.phone_number is null then 'verified_phone_missing' end,
      case when preference.assistant_program_key is distinct from p_program_key
        then 'sms_program_not_enrolled' end,
      case when coalesce(consent.status, 'unknown') <> 'opted_in'
        then 'consent_not_opted_in' end,
      case when destination.id is null then 'destination_not_ready' end
    ]::text[], null)
  from communication.sms_notification_preferences preference
  left join communication.sms_phone_numbers destination
    on destination.id = preference.assistant_destination_id
   and destination.program_key = preference.assistant_program_key
   and destination.program_key = p_program_key
   and destination.is_active
   and destination.provider_account_id is not null
   and destination.deleted_at is null
  left join lateral (
    select consent_row.status
    from communication.sms_consent consent_row
    where consent_row.user_id = caller
      and consent_row.organization_id = preference.organization_id
      and consent_row.phone_number = preference.phone_number
      and consent_row.consent_type in ('transactional', 'all')
      and consent_row.deleted_at is null
    order by consent_row.updated_at desc
    limit 1
  ) consent on true
  where preference.user_id = caller
    and preference.deleted_at is null;
end;
$$;

drop function if exists communication.configure_my_sms_task_notifications(boolean, text);
create function communication.configure_my_sms_task_notifications(
  p_enabled boolean,
  p_program_key text default 'ai_matrx_owner_beta'
)
returns table (
  masked_phone text,
  sms_enabled boolean,
  task_notifications boolean,
  consent_status text,
  program_key text,
  destination_ready boolean,
  can_enable boolean,
  blocked_reasons text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  preference communication.sms_notification_preferences%rowtype;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Task notification preference is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_program_key), '') is null then
    raise exception 'Program key is required' using errcode = '22023';
  end if;

  select preference_row.* into preference
  from communication.sms_notification_preferences preference_row
  where preference_row.user_id = caller
    and preference_row.deleted_at is null
  for update;
  if not found then
    raise exception 'Verify a mobile number before enabling task reminders'
      using errcode = 'P0002';
  end if;

  if p_enabled then
    if not preference.sms_enabled then
      raise exception 'Enable SMS notifications before enabling task reminders'
        using errcode = '22023';
    end if;
    if preference.phone_number is null then
      raise exception 'Verify a mobile number before enabling task reminders'
        using errcode = '22023';
    end if;
    if preference.assistant_program_key is distinct from p_program_key then
      raise exception 'This SMS program is not connected to your account'
        using errcode = '22023';
    end if;
    if not exists (
      select 1
      from communication.sms_consent consent
      where consent.user_id = caller
        and consent.organization_id = preference.organization_id
        and consent.phone_number = preference.phone_number
        and consent.consent_type in ('transactional', 'all')
        and consent.status = 'opted_in'
        and consent.deleted_at is null
    ) then
      raise exception 'SMS consent is not opted in for this mobile number'
        using errcode = '22023';
    end if;
  end if;

  update communication.sms_notification_preferences preference_row
  set task_notifications = p_enabled
  where preference_row.id = preference.id;

  return query
  select *
  from communication.get_my_sms_task_notification_preference(p_program_key);
end;
$$;

revoke all on function communication.get_my_sms_task_notification_preference(text) from public, anon;
revoke all on function communication.configure_my_sms_task_notifications(boolean, text) from public, anon;
grant execute on function communication.get_my_sms_task_notification_preference(text)
  to authenticated, service_role;
grant execute on function communication.configure_my_sms_task_notifications(boolean, text)
  to authenticated, service_role;

comment on function communication.get_my_sms_task_notification_preference(text) is
  'Returns the authenticated caller task-reminder SMS preference and eligibility without exposing unrelated settings.';
comment on function communication.configure_my_sms_task_notifications(boolean, text) is
  'Explicitly opts the authenticated caller in or out of SMS task reminders after verified-consent checks.';
