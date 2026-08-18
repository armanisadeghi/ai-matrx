-- Restore the owner SMS Binding to the exact direct choice it replaced. This
-- corrects an unintended picker write observed during read-only production
-- verification, before the legacy preference authority is retired.

set lock_timeout = '8s';

do $$
declare
  preference communication.sms_notification_preferences%rowtype;
  sms_mandate agent.mandate%rowtype;
  binding_count integer;
begin
  select p.* into strict preference
  from communication.sms_notification_preferences p
  where p.user_id = '4cf62e4e-2679-484f-b652-034e697418df'::uuid
    and p.assistant_program_key = 'ai_matrx_owner_beta'
    and p.preferred_agent_id is not null
    and p.deleted_at is null;

  select m.* into strict sms_mandate
  from agent.mandate m
  where m.mandate_key = 'sms.owner_beta'
    and m.is_enabled
    and m.deleted_at is null;

  select count(*) into binding_count
  from agent.mandate_binding b
  where b.mandate_id = sms_mandate.id
    and b.principal_type = 'user'
    and b.subject_user_id = preference.user_id
    and b.organization_id = preference.organization_id
    and b.is_enabled
    and b.deleted_at is null;

  if binding_count <> 1 then
    raise exception 'Expected exactly one enabled owner SMS user Binding, found %', binding_count;
  end if;

  update agent.mandate_binding b
  set agent_id = preference.preferred_agent_id,
      agent_version_id = preference.preferred_agent_version_id,
      use_latest = preference.preferred_agent_version_id is null,
      visibility = 'personal',
      updated_by = preference.user_id,
      updated_at = now()
  where b.mandate_id = sms_mandate.id
    and b.principal_type = 'user'
    and b.subject_user_id = preference.user_id
    and b.organization_id = preference.organization_id
    and b.is_enabled
    and b.deleted_at is null;
end;
$$;
