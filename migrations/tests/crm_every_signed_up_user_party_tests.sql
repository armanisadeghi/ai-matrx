begin;

do $$
declare
  v_ai_matrx_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid;
  v_user_id uuid;
  v_party_first uuid;
  v_party_second uuid;
  v_party_count integer;
  v_medium_count integer;
  v_point_count integer;
  v_rejected boolean := false;
begin
  select u.id into strict v_user_id
  from auth.users u
  where u.is_anonymous is false
  order by u.created_at, u.id
  limit 1;

  v_party_first := crm.ensure_user_party(v_user_id, 'reconcile');
  v_party_second := crm.ensure_user_party(v_user_id, 'reconcile');
  if v_party_first is null or v_party_first <> v_party_second then
    raise exception 'ensure_user_party did not return one stable party';
  end if;

  select count(*) into v_party_count
  from crm.party party
  where party.organization_id = v_ai_matrx_org
    and party.claimed_by = v_user_id
    and party.deleted_at is null;
  if v_party_count <> 1 then
    raise exception 'ensure_user_party produced % active claimed parties', v_party_count;
  end if;

  if exists (
    select 1
    from auth.users u
    where u.is_anonymous is false
      and not exists (
        select 1
        from crm.party party
        where party.organization_id = v_ai_matrx_org
          and party.claimed_by = u.id
          and party.party_kind = 'person'
          and party.canonical_id is null
          and party.deleted_at is null
      )
  ) then
    raise exception 'At least one permanent auth user is missing the required AI Matrx party';
  end if;

  if exists (
    select 1
    from crm.party party
    join iam.organizations organization on organization.id = party.organization_id
    where party.claimed_by is not null
      and party.source = 'user_registration'
      and (
        party.organization_id <> v_ai_matrx_org
        or organization.is_system is true
        or organization.is_personal is true
      )
  ) then
    raise exception 'A provisioned user party escaped the normal AI Matrx tenant';
  end if;

  begin
    insert into crm.party (
      party_kind, display_name, record_class, claimed_by, claimed_at, source,
      organization_id, created_by, updated_by, visibility
    ) values (
      'person', 'Duplicate claim probe', 'contact', v_user_id, now(), 'test',
      v_ai_matrx_org, v_user_id, v_user_id, 'internal'
    );
  exception when unique_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'The same-org claimed-user uniqueness guard did not reject a duplicate';
  end if;

  v_rejected := false;
  begin
    perform crm.ensure_user_party(gen_random_uuid(), 'reconcile');
  exception when others then
    if sqlerrm like 'ensure_user_party: auth user does not exist%' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'ensure_user_party did not reject a nonexistent auth user';
  end if;

  select count(*) into v_medium_count
  from communication.sms_notification_preferences preference
  join crm.contact_medium medium
    on medium.organization_id = v_ai_matrx_org
   and medium.channel = 'phone'
   and medium.value_key = preference.phone_number
   and medium.verification_status = 'verified'
   and medium.deleted_at is null
  where preference.assistant_program_key = 'ai_matrx_owner_beta'
    and preference.deleted_at is null;
  if v_medium_count <> 1 then
    raise exception 'Owner beta did not resolve exactly one verified same-tenant phone medium';
  end if;

  select count(*) into v_point_count
  from communication.sms_notification_preferences preference
  join crm.party party
    on party.organization_id = v_ai_matrx_org
   and party.claimed_by = preference.user_id
   and party.deleted_at is null
  join crm.contact_medium medium
    on medium.organization_id = party.organization_id
   and medium.channel = 'phone'
   and medium.value_key = preference.phone_number
   and medium.deleted_at is null
  join crm.party_contact_point point
    on point.party_id = party.id
   and point.medium_id = medium.id
   and point.organization_id = party.organization_id
   and point.deleted_at is null
  where preference.assistant_program_key = 'ai_matrx_owner_beta'
    and preference.deleted_at is null;
  if v_point_count <> 1 then
    raise exception 'Owner beta did not resolve exactly one same-tenant party/contact point';
  end if;
end;
$$;

rollback;
