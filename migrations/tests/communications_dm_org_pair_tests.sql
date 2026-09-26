-- The authenticated admin's DM with the system bot must resolve inside the
-- organization named by the call, even if the same pair has another thread.
-- All writes are transaction-scoped and rolled back. No message is sent.
begin;

do $fixture$
declare
  v_admin uuid;
  v_target uuid;
  v_other uuid;
  v_bot constant uuid := '71b55cc0-f333-462f-8176-f558f866ea5d';
  v_conv uuid;
begin
  select id into strict v_admin from auth.users where email = 'admin@admin.com';
  select id into strict v_target from iam.organizations
   where is_personal is true and created_by = v_admin and archived_at is null
   order by created_at limit 1;
  select o.id into strict v_other from iam.organizations o
   join iam.memberships m on m.organization_id = o.id
   where m.user_id = v_admin and m.status = 'active'
     and o.archived_at is null and o.id <> v_target
   order by o.created_at limit 1;

  -- The target pair must not already have a conversation: otherwise a
  -- missing organization predicate can select it and produce a false green.
  if exists (
    select 1 from communication.dm_conversations c
     where c.type = 'direct' and c.organization_id = v_target
       and c.deleted_at is null
       and exists (select 1 from communication.dm_conversation_participants p
                    where p.conversation_id = c.id and p.user_id = v_admin)
       and exists (select 1 from communication.dm_conversation_participants p
                    where p.conversation_id = c.id and p.user_id = v_bot)
  ) then
    raise exception 'Fixture needs an admin-owned target org without this DM pair';
  end if;

  insert into communication.dm_conversations (type, created_by, organization_id)
  values ('direct', v_admin, v_other) returning id into v_conv;
  insert into communication.dm_conversation_participants
    (conversation_id, user_id, role, organization_id)
  values (v_conv, v_admin, 'owner', v_other),
         (v_conv, v_bot, 'member', v_other);

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('communications.test.target_org', v_target::text, true);
  perform set_config('communications.test.other_org', v_other::text, true);
  perform set_config('communications.test.admin', v_admin::text, true);
end;
$fixture$;

set local role authenticated;
do $test$
declare
  v_admin uuid := current_setting('communications.test.admin')::uuid;
  v_target uuid := current_setting('communications.test.target_org')::uuid;
  v_bot constant uuid := '71b55cc0-f333-462f-8176-f558f866ea5d';
  v_first uuid;
  v_second uuid;
  v_actual_org uuid;
  v_count integer;
begin
  v_first := public.dm_get_or_create_direct_conversation(v_admin, v_bot, v_target);
  select organization_id into strict v_actual_org
    from communication.dm_conversations where id = v_first;
  if v_actual_org <> v_target then
    raise exception 'DM resolved in a different organization';
  end if;
  v_second := public.dm_get_or_create_direct_conversation(v_admin, v_bot, v_target);
  if v_first <> v_second then
    raise exception 'Repeated get-or-create duplicated the target conversation';
  end if;
  select count(*) into v_count from communication.dm_conversations c
   where c.id = v_first and c.organization_id = v_target and c.type = 'direct'
     and c.deleted_at is null;
  if v_count <> 1 then
    raise exception 'Target conversation not present';
  end if;

  -- A prior conversation never grants admission to an unrelated tenant.
  begin
    perform public.dm_get_or_create_direct_conversation(
      v_admin, v_bot, '00000000-0000-4000-8000-000000000026'::uuid
    );
    raise exception 'An inaccessible organization reused an existing DM';
  exception when insufficient_privilege then
    if sqlerrm not like 'dm_organization_denied:%' then
      raise exception 'Unexpected DM refusal: %', sqlerrm;
    end if;
  end;
end;
$test$;
reset role;
rollback;
