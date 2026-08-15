-- EVERY SIGNED-UP USER HAS A PARTY.
--
-- AI Matrx consumes the normal CRM product under its normal tenant. Permanent
-- auth accounts are crm.party people there; claimed_by is the account join.
-- Anonymous execution principals are deliberately excluded until promotion.

create unique index if not exists party_org_claimed_user_key
  on crm.party (organization_id, claimed_by)
  where claimed_by is not null and deleted_at is null;

create or replace function crm.ensure_user_party(
  p_user_id uuid,
  p_source text default 'signup'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ai_matrx_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid;
  v_user auth.users%rowtype;
  v_email text;
  v_phone text;
  v_display_name text;
  v_party_id uuid;
  v_candidate_ids uuid[] := '{}'::uuid[];
  v_candidate_claim uuid;
  v_medium record;
  v_medium_id uuid;
  v_rows integer;
  v_changed boolean := false;
  v_party_disposition text := 'existing';
  v_media_added text[] := '{}'::text[];
begin
  if p_user_id is null then
    raise exception 'ensure_user_party: p_user_id cannot be null';
  end if;
  if p_source not in ('signup', 'promotion', 'backfill', 'reconcile') then
    raise exception 'ensure_user_party: unsupported source';
  end if;

  if not exists (
    select 1
    from iam.organizations o
    where o.id = v_ai_matrx_org
      and o.slug = 'ai-matrx'
      and o.is_system is false
      and o.is_personal is false
  ) then
    raise exception 'ensure_user_party: AI Matrx normal CRM tenant binding is unavailable';
  end if;

  select u.* into v_user
  from auth.users u
  where u.id = p_user_id;
  if not found then
    raise exception 'ensure_user_party: auth user does not exist';
  end if;
  if v_user.is_anonymous is true then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_ai_matrx_org::text || ':' || p_user_id::text, 0)
  );

  v_email := nullif(lower(trim(v_user.email)), '');
  v_phone := nullif(trim(v_user.phone), '');
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'ensure_user_party: auth phone is not canonical E.164';
  end if;

  select coalesce(
    nullif(case
      when lower(trim(profile.display_name)) <> 'user' then trim(profile.display_name)
      else ''
    end, ''),
    nullif(trim(coalesce(
      v_user.raw_user_meta_data ->> 'full_name',
      v_user.raw_user_meta_data ->> 'name',
      v_user.raw_user_meta_data ->> 'preferred_username',
      v_user.raw_user_meta_data ->> 'user_name'
    )), ''),
    nullif(initcap(regexp_replace(split_part(v_email, '@', 1), '[._+-]+', ' ', 'g')), ''),
    'AI Matrx User'
  ) into v_display_name
  from (select 1) seed
  left join users.profiles profile
    on profile.id = p_user_id and profile.deleted_at is null;

  select p.id into v_party_id
  from crm.party p
  where p.organization_id = v_ai_matrx_org
    and p.claimed_by = p_user_id
    and p.deleted_at is null
    and p.canonical_id is null;

  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
    into v_candidate_ids
  from crm.contact_medium medium
  join crm.party_contact_point point
    on point.medium_id = medium.id and point.deleted_at is null
  join crm.party p
    on p.id = point.party_id
   and p.organization_id = medium.organization_id
   and p.deleted_at is null
   and p.canonical_id is null
   and p.party_kind = 'person'
  where medium.organization_id = v_ai_matrx_org
    and medium.deleted_at is null
    and (
      (v_email is not null and medium.channel = 'email' and medium.value_key = v_email)
      or
      (v_phone is not null and medium.channel = 'phone' and medium.value_key = v_phone)
    );

  if cardinality(v_candidate_ids) > 1 then
    raise exception 'ensure_user_party: auth identity matches multiple active CRM parties';
  end if;

  if v_party_id is not null then
    if exists (
      select 1 from unnest(v_candidate_ids) candidate_id
      where candidate_id <> v_party_id
    ) then
      raise exception 'ensure_user_party: claimed party conflicts with contact identity';
    end if;
  elsif cardinality(v_candidate_ids) = 1 then
    v_party_id := v_candidate_ids[1];
    select p.claimed_by into v_candidate_claim
    from crm.party p where p.id = v_party_id for update;
    if v_candidate_claim is not null and v_candidate_claim <> p_user_id then
      raise exception 'ensure_user_party: contact identity is claimed by another user';
    end if;
    if v_candidate_claim is null then
      update crm.party
      set claimed_by = p_user_id,
          claimed_at = coalesce(claimed_at, now()),
          updated_by = p_user_id
      where id = v_party_id;
      v_changed := true;
      v_party_disposition := 'claimed';
    end if;
  else
    insert into crm.party (
      party_kind,
      display_name,
      record_class,
      claimed_by,
      claimed_at,
      source,
      source_detail,
      organization_id,
      created_by,
      updated_by,
      visibility,
      attributes,
      metadata
    ) values (
      'person',
      v_display_name,
      'contact',
      p_user_id,
      now(),
      'user_registration',
      p_source,
      v_ai_matrx_org,
      p_user_id,
      p_user_id,
      'internal',
      jsonb_build_object('identity_kind', 'auth_user'),
      jsonb_build_object('provisioning_source', p_source)
    )
    returning id into v_party_id;
    v_changed := true;
    v_party_disposition := 'created';
  end if;

  for v_medium in
    select *
    from (values
      ('email'::text, v_user.email::text, v_email::text, v_user.email_confirmed_at),
      ('phone'::text, v_user.phone::text, v_phone::text, v_user.phone_confirmed_at)
    ) as candidate(channel, value_raw, value_key, confirmed_at)
    where candidate.value_key is not null
  loop
    insert into crm.contact_medium (
      channel,
      value_raw,
      value_key,
      verification_status,
      verified_at,
      organization_id,
      created_by,
      updated_by,
      visibility,
      details,
      metadata
    ) values (
      v_medium.channel,
      v_medium.value_raw,
      v_medium.value_key,
      case when v_medium.confirmed_at is null then 'unverified' else 'verified' end,
      v_medium.confirmed_at,
      v_ai_matrx_org,
      p_user_id,
      p_user_id,
      'internal',
      jsonb_build_object('source', 'auth_user', 'provisioning_source', p_source),
      jsonb_build_object('provisioning_source', p_source)
    )
    on conflict (
      organization_id,
      channel,
      (coalesce(platform_slug, ''::text)),
      value_key
    ) where deleted_at is null
    do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_changed := true;
      v_media_added := array_append(v_media_added, v_medium.channel);
    end if;

    select medium.id into strict v_medium_id
    from crm.contact_medium medium
    where medium.organization_id = v_ai_matrx_org
      and medium.channel = v_medium.channel
      and coalesce(medium.platform_slug, '') = ''
      and medium.value_key = v_medium.value_key
      and medium.deleted_at is null;

    if v_medium.confirmed_at is not null then
      update crm.contact_medium
      set verification_status = 'verified',
          verified_at = coalesce(verified_at, v_medium.confirmed_at),
          updated_by = p_user_id,
          details = details || jsonb_build_object('auth_verified', true)
      where id = v_medium_id
        and verification_status = 'unverified';
      get diagnostics v_rows = row_count;
      v_changed := v_changed or v_rows > 0;
    end if;

    insert into crm.party_contact_point (
      party_id,
      medium_id,
      purpose_code,
      is_primary,
      is_identity_key,
      source,
      confidence,
      organization_id,
      created_by,
      updated_by,
      channel,
      metadata
    ) values (
      v_party_id,
      v_medium_id,
      'personal',
      false,
      false,
      'auth_user',
      100,
      v_ai_matrx_org,
      p_user_id,
      p_user_id,
      v_medium.channel,
      jsonb_build_object('provisioning_source', p_source)
    )
    on conflict (party_id, medium_id) where deleted_at is null
    do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_changed := true;
      if not v_medium.channel = any(v_media_added) then
        v_media_added := array_append(v_media_added, v_medium.channel);
      end if;
    end if;
  end loop;

  if v_changed then
    perform platform.log_activity(
      v_ai_matrx_org,
      case
        when v_party_disposition = 'claimed' then 'crm.user_party.claimed'
        else 'crm.user_party.provisioned'
      end,
      'party',
      v_party_id,
      jsonb_build_object(
        'source', p_source,
        'party_disposition', v_party_disposition,
        'media_attached', to_jsonb(v_media_added)
      ),
      p_user_id
    );
  end if;

  return v_party_id;
end;
$$;

comment on function crm.ensure_user_party(uuid, text) is
  'Idempotently provisions or claims the one AI Matrx-tenant CRM party for a permanent auth user and attaches Auth-backed media. Not a general party resolver.';

revoke all on function crm.ensure_user_party(uuid, text) from public, anon, authenticated;
grant execute on function crm.ensure_user_party(uuid, text) to service_role, supabase_auth_admin;

create or replace function crm._provision_signed_up_user_party()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_anonymous is false then
    perform crm.ensure_user_party(
      new.id,
      case when tg_op = 'UPDATE' then 'promotion' else 'signup' end
    );
  end if;
  return new;
end;
$$;

revoke all on function crm._provision_signed_up_user_party() from public, anon, authenticated;
grant execute on function crm._provision_signed_up_user_party() to service_role, supabase_auth_admin;

drop trigger if exists on_auth_user_created_crm_party on auth.users;
create trigger on_auth_user_created_crm_party
after insert or update of is_anonymous, email, phone on auth.users
for each row
when (new.is_anonymous is false)
execute function crm._provision_signed_up_user_party();

do $$
declare
  v_user record;
  v_backfilled integer := 0;
begin
  for v_user in
    select u.id
    from auth.users u
    where u.is_anonymous is false
    order by u.created_at, u.id
  loop
    perform crm.ensure_user_party(v_user.id, 'backfill');
    v_backfilled := v_backfilled + 1;
  end loop;

  perform platform.log_activity(
    '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid,
    'crm.user_party.backfill_completed',
    null,
    null,
    jsonb_build_object('permanent_users_processed', v_backfilled),
    null
  );
end;
$$;

-- Bind the owner Voice enrollment to the normal AI Matrx CRM tenant through
-- the same party/contact-medium/contact-point model. The program row resolves
-- the user and phone; no personal identifier is hardcoded in this migration.
do $$
declare
  v_ai_matrx_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid;
  v_program constant text := 'ai_matrx_owner_beta';
  v_preference communication.sms_notification_preferences%rowtype;
  v_party_id uuid;
  v_medium_id uuid;
begin
  if (
    select count(*)
    from communication.sms_notification_preferences preference
    where preference.assistant_program_key = v_program
      and preference.phone_number is not null
      and preference.deleted_at is null
  ) <> 1 then
    raise exception 'Owner Voice party binding requires exactly one verified program enrollment';
  end if;

  select preference.* into strict v_preference
  from communication.sms_notification_preferences preference
  where preference.assistant_program_key = v_program
    and preference.phone_number is not null
    and preference.deleted_at is null;

  if v_preference.phone_number !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'Owner Voice party binding requires a canonical E.164 phone';
  end if;

  select party.id into strict v_party_id
  from crm.party party
  where party.organization_id = v_ai_matrx_org
    and party.claimed_by = v_preference.user_id
    and party.party_kind = 'person'
    and party.canonical_id is null
    and party.deleted_at is null;

  insert into crm.contact_medium (
    channel,
    value_raw,
    value_key,
    verification_status,
    verified_at,
    organization_id,
    created_by,
    updated_by,
    visibility,
    details,
    metadata
  ) values (
    'phone',
    v_preference.phone_number,
    v_preference.phone_number,
    'verified',
    coalesce(v_preference.updated_at, v_preference.created_at, now()),
    v_ai_matrx_org,
    v_preference.user_id,
    v_preference.user_id,
    'internal',
    jsonb_build_object('source', 'owner_beta_verified_enrollment', 'program_key', v_program),
    jsonb_build_object('program_key', v_program)
  )
  on conflict (
    organization_id,
    channel,
    (coalesce(platform_slug, ''::text)),
    value_key
  ) where deleted_at is null
  do nothing;

  select medium.id into strict v_medium_id
  from crm.contact_medium medium
  where medium.organization_id = v_ai_matrx_org
    and medium.channel = 'phone'
    and coalesce(medium.platform_slug, '') = ''
    and medium.value_key = v_preference.phone_number
    and medium.deleted_at is null;

  update crm.contact_medium
  set verification_status = 'verified',
      verified_at = coalesce(verified_at, v_preference.updated_at, v_preference.created_at, now()),
      updated_by = v_preference.user_id,
      details = details || jsonb_build_object(
        'owner_beta_verified', true,
        'program_key', v_program
      )
  where id = v_medium_id
    and verification_status = 'unverified';

  insert into crm.party_contact_point (
    party_id,
    medium_id,
    purpose_code,
    is_primary,
    is_identity_key,
    source,
    confidence,
    organization_id,
    created_by,
    updated_by,
    channel,
    metadata
  ) values (
    v_party_id,
    v_medium_id,
    'mobile',
    false,
    false,
    'owner_beta_verified_enrollment',
    100,
    v_ai_matrx_org,
    v_preference.user_id,
    v_preference.user_id,
    'phone',
    jsonb_build_object('program_key', v_program)
  )
  on conflict (party_id, medium_id) where deleted_at is null
  do nothing;

  perform platform.log_activity(
    v_ai_matrx_org,
    'crm.user_party.owner_beta_phone_bound',
    'party',
    v_party_id,
    jsonb_build_object('program_key', v_program, 'phone_value_logged', false),
    v_preference.user_id
  );
end;
$$;
