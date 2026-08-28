-- HRB-002 / HRB-022 — phone possession must reach the CRM contact graph.
--
-- The SMS resolver reads crm.party_contact_point -> crm.contact_medium and
-- deliberately refuses every unverified medium. HR phone fields and the
-- Twilio Verify enrollment previously wrote stores that never met there.
-- This migration gives both producers one graph writer:
--   * HR work/personal phones create unverified work/mobile points.
--   * a successful Twilio Verify check upgrades the caller's points to
--     verified/mobile through a service-role-only RPC.

create or replace function crm.normalize_phone_e164(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_trimmed text := nullif(btrim(coalesce(p_phone, '')), '');
  v_digits text;
begin
  if v_trimmed is null then
    return null;
  end if;

  if v_trimmed ~ '^\+[1-9][0-9]{6,14}$' then
    return v_trimmed;
  end if;

  v_digits := regexp_replace(v_trimmed, '[^0-9]', '', 'g');
  if length(v_digits) = 10 then
    return '+1' || v_digits;
  elsif length(v_digits) = 11 and left(v_digits, 1) = '1' then
    return '+' || v_digits;
  end if;

  return null;
end
$fn$;

comment on function crm.normalize_phone_e164(text) is
  'Canonicalizes E.164 and ordinary North-American phone input; invalid values return NULL.';

revoke all on function crm.normalize_phone_e164(text) from public, anon, authenticated;

create or replace function crm.upsert_party_phone_contact(
  p_party_id uuid,
  p_organization_id uuid,
  p_phone text,
  p_purpose_code text,
  p_verification_status text,
  p_source text,
  p_actor_user_id uuid default null,
  p_verified_at timestamptz default null,
  p_evidence jsonb default '{}'::jsonb
)
returns table(contact_point_id uuid, contact_medium_id uuid)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_phone text := crm.normalize_phone_e164(p_phone);
  v_medium_id uuid;
  v_point_id uuid;
  v_verified_at timestamptz := case
    when p_verification_status = 'verified' then coalesce(p_verified_at, now())
    else null
  end;
  v_source_marker jsonb;
begin
  if v_phone is null then
    raise exception 'upsert_party_phone_contact: phone is not canonicalizable to E.164'
      using errcode = '22023';
  end if;
  if p_purpose_code not in ('mobile', 'work') then
    raise exception 'upsert_party_phone_contact: purpose must be mobile or work'
      using errcode = '22023';
  end if;
  if p_verification_status not in ('unverified', 'verified') then
    raise exception 'upsert_party_phone_contact: unsupported verification status'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
      from crm.party p
     where p.id = p_party_id
       and p.organization_id = p_organization_id
       and p.deleted_at is null
  ) then
    raise exception 'upsert_party_phone_contact: party is not active in organization'
      using errcode = '23503';
  end if;

  v_source_marker := case p_source
    when 'hr.employee.work_phone' then jsonb_build_object('hr_work_phone', true)
    when 'hr.employee_private.personal_phone' then jsonb_build_object('hr_personal_phone', true)
    when 'twilio_verify' then jsonb_build_object('sms_enrollment', true)
    when 'auth_user' then jsonb_build_object('auth_user', true)
    else jsonb_build_object('source', p_source)
  end;

  insert into crm.contact_medium as existing (
    channel,
    value_raw,
    value_key,
    line_type,
    phone_country,
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
    v_phone,
    v_phone,
    'mobile',
    case when v_phone like '+1%' then 'US' else null end,
    p_verification_status,
    v_verified_at,
    p_organization_id,
    p_actor_user_id,
    p_actor_user_id,
    'internal',
    jsonb_build_object(
      'phone_sources', v_source_marker,
      'verification_evidence', case
        when p_verification_status = 'verified' then coalesce(p_evidence, '{}'::jsonb)
        else '{}'::jsonb
      end
    ),
    jsonb_build_object('phone_sources', v_source_marker)
  )
  on conflict (
    organization_id,
    channel,
    (coalesce(platform_slug, ''::text)),
    value_key
  ) where deleted_at is null
  do update set
    value_raw = excluded.value_raw,
    line_type = coalesce(existing.line_type, excluded.line_type),
    phone_country = coalesce(existing.phone_country, excluded.phone_country),
    verification_status = case
      when existing.verification_status = 'verified' or excluded.verification_status = 'verified'
        then 'verified'
      else excluded.verification_status
    end,
    verified_at = case
      when existing.verification_status = 'verified' then existing.verified_at
      when excluded.verification_status = 'verified' then excluded.verified_at
      else existing.verified_at
    end,
    updated_by = coalesce(excluded.updated_by, existing.updated_by),
    details = existing.details || jsonb_build_object(
      'phone_sources', coalesce(existing.details -> 'phone_sources', '{}'::jsonb) || v_source_marker,
      'verification_evidence', case
        when excluded.verification_status = 'verified'
          then coalesce(existing.details -> 'verification_evidence', '{}'::jsonb)
            || coalesce(excluded.details -> 'verification_evidence', '{}'::jsonb)
        else coalesce(existing.details -> 'verification_evidence', '{}'::jsonb)
      end
    ),
    metadata = existing.metadata || jsonb_build_object(
      'phone_sources', coalesce(existing.metadata -> 'phone_sources', '{}'::jsonb) || v_source_marker
    )
  returning existing.id into v_medium_id;

  insert into crm.party_contact_point as existing (
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
    p_party_id,
    v_medium_id,
    p_purpose_code,
    false,
    false,
    p_source,
    case when p_verification_status = 'verified' then 100 else 70 end,
    p_organization_id,
    p_actor_user_id,
    p_actor_user_id,
    'phone',
    jsonb_build_object('phone_sources', v_source_marker)
  )
  on conflict (party_id, medium_id) where deleted_at is null
  do update set
    purpose_code = case
      when existing.purpose_code = 'mobile' or excluded.purpose_code = 'mobile' then 'mobile'
      else 'work'
    end,
    source = case
      when p_verification_status = 'verified' then p_source
      else existing.source
    end,
    confidence = greatest(existing.confidence, excluded.confidence),
    updated_by = coalesce(excluded.updated_by, existing.updated_by),
    metadata = existing.metadata || jsonb_build_object(
      'phone_sources', coalesce(existing.metadata -> 'phone_sources', '{}'::jsonb) || v_source_marker
    )
  returning existing.id into v_point_id;

  return query select v_point_id, v_medium_id;
end
$fn$;

comment on function crm.upsert_party_phone_contact(uuid, uuid, text, text, text, text, uuid, timestamptz, jsonb) is
  'The one writer for party phone media. Unverified HR values never downgrade a verified medium.';

revoke all on function crm.upsert_party_phone_contact(uuid, uuid, text, text, text, text, uuid, timestamptz, jsonb)
  from public, anon, authenticated;

create or replace function crm._sync_hr_phone_to_contact_graph()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_party_id uuid;
  v_organization_id uuid;
  v_phone text;
  v_purpose text;
  v_source text;
  v_actor uuid;
begin
  if tg_table_name = 'employee' then
    if tg_op = 'UPDATE' and new.work_phone is not distinct from old.work_phone then
      return new;
    end if;
    v_party_id := new.party_id;
    v_organization_id := new.organization_id;
    v_phone := new.work_phone;
    v_purpose := 'work';
    v_source := 'hr.employee.work_phone';
    v_actor := coalesce(new.updated_by, new.created_by);
  elsif tg_table_name = 'employee_private' then
    if tg_op = 'UPDATE' and new.personal_phone is not distinct from old.personal_phone then
      return new;
    end if;
    select e.party_id, e.organization_id
      into v_party_id, v_organization_id
      from hr.employee e
     where e.id = new.employee_id
       and e.deleted_at is null;
    v_phone := new.personal_phone;
    v_purpose := 'mobile';
    v_source := 'hr.employee_private.personal_phone';
    v_actor := coalesce(new.updated_by, new.created_by);
  else
    raise exception '_sync_hr_phone_to_contact_graph: unsupported table %', tg_table_name;
  end if;

  if crm.normalize_phone_e164(v_phone) is not null then
    perform * from crm.upsert_party_phone_contact(
      v_party_id,
      v_organization_id,
      v_phone,
      v_purpose,
      'unverified',
      v_source,
      v_actor,
      null,
      '{}'::jsonb
    );
  end if;

  return new;
end
$fn$;

revoke all on function crm._sync_hr_phone_to_contact_graph() from public, anon, authenticated;

drop trigger if exists zzz_sync_work_phone_to_contact_graph on hr.employee;
create trigger zzz_sync_work_phone_to_contact_graph
after insert or update of work_phone on hr.employee
for each row execute function crm._sync_hr_phone_to_contact_graph();

drop trigger if exists zzz_sync_personal_phone_to_contact_graph on hr.employee_private;
create trigger zzz_sync_personal_phone_to_contact_graph
after insert or update of personal_phone on hr.employee_private
for each row execute function crm._sync_hr_phone_to_contact_graph();

create or replace function communication.record_verified_sms_phone(
  p_user_id uuid,
  p_phone_number text,
  p_verified_at timestamptz default now(),
  p_source text default 'twilio_verify'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_phone text := crm.normalize_phone_e164(p_phone_number);
  v_ai_party_id uuid;
  v_target record;
  v_point record;
  v_parties integer := 0;
  v_points jsonb := '[]'::jsonb;
  v_evidence jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id and coalesce(u.is_anonymous, false) = false
  ) then
    raise exception 'record_verified_sms_phone: permanent auth user required'
      using errcode = '23503';
  end if;
  if v_phone is null then
    raise exception 'record_verified_sms_phone: phone is not canonicalizable to E.164'
      using errcode = '22023';
  end if;
  if p_source <> 'twilio_verify' then
    raise exception 'record_verified_sms_phone: unsupported verification source'
      using errcode = '22023';
  end if;

  v_evidence := jsonb_build_object(
    'provider', 'twilio_verify',
    'verification_channel', 'sms',
    'verified_at', coalesce(p_verified_at, now())
  );

  -- The account party remains useful outside HR; employee parties are the ones
  -- communication.resolve_channel_address follows for workforce notices.
  v_ai_party_id := crm.ensure_user_party(p_user_id, 'reconcile');

  for v_target in
    select p.id as party_id, p.organization_id
      from crm.party p
     where p.id = v_ai_party_id
       and not exists (
         select 1
           from hr.employee e
          where e.login_user_id = p_user_id
            and e.organization_id = p.organization_id
            and e.party_id is not null
            and e.deleted_at is null
       )
    union
    select e.party_id, e.organization_id
      from hr.employee e
     where e.login_user_id = p_user_id
       and e.party_id is not null
       and e.deleted_at is null
  loop
    select * into v_point
      from crm.upsert_party_phone_contact(
        v_target.party_id,
        v_target.organization_id,
        v_phone,
        'mobile',
        'verified',
        'twilio_verify',
        p_user_id,
        coalesce(p_verified_at, now()),
        v_evidence
      );
    v_parties := v_parties + 1;
    v_points := v_points || jsonb_build_object(
      'party_id', v_target.party_id,
      'organization_id', v_target.organization_id,
      'contact_point_id', v_point.contact_point_id,
      'contact_medium_id', v_point.contact_medium_id
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'phone_number', v_phone,
    'parties_updated', v_parties,
    'contact_points', v_points
  );
end
$fn$;

comment on function communication.record_verified_sms_phone(uuid, text, timestamptz, text) is
  'Service-role-only Twilio Verify success writer. Marks the caller account and HR employee parties verified/mobile in the CRM contact graph.';

revoke all on function communication.record_verified_sms_phone(uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function communication.record_verified_sms_phone(uuid, text, timestamptz, text)
  to service_role;

-- Auth-backed phones are also SMS-capable phones. Correct the producer and the
-- already-written points; email remains personal.
do $fn$
declare
  v_definition text := pg_get_functiondef('crm.ensure_user_party(uuid,text)'::regprocedure);
  v_before text := $needle$      'personal',
      false,
      false,
      'auth_user',$needle$;
  v_after text := $replacement$      case when v_medium.channel = 'phone' then 'mobile' else 'personal' end,
      false,
      false,
      'auth_user',$replacement$;
begin
  if position(v_before in v_definition) = 0 then
    raise exception 'hr_c4_54: crm.ensure_user_party purpose producer shape drifted';
  end if;
  execute replace(v_definition, v_before, v_after);
end
$fn$;

update crm.party_contact_point pcp
   set purpose_code = 'mobile',
       updated_at = now(),
       metadata = pcp.metadata || jsonb_build_object(
         'phone_sources', coalesce(pcp.metadata -> 'phone_sources', '{}'::jsonb)
           || jsonb_build_object('auth_user', true)
       )
  from crm.contact_medium cm
 where cm.id = pcp.medium_id
   and cm.channel = 'phone'
   and pcp.source = 'auth_user'
   and pcp.deleted_at is null
   and pcp.purpose_code = 'personal';

-- Existing HR values become visible immediately, but remain unusable by the
-- verified-only resolver until their owner completes Twilio Verify.
do $fn$
declare
  v_row record;
begin
  for v_row in
    select e.party_id, e.organization_id, e.work_phone, e.updated_by
      from hr.employee e
     where e.deleted_at is null
       and crm.normalize_phone_e164(e.work_phone) is not null
  loop
    perform * from crm.upsert_party_phone_contact(
      v_row.party_id, v_row.organization_id, v_row.work_phone, 'work',
      'unverified', 'hr.employee.work_phone', v_row.updated_by, null, '{}'::jsonb
    );
  end loop;

  for v_row in
    select e.party_id, e.organization_id, ep.personal_phone, ep.updated_by
      from hr.employee_private ep
      join hr.employee e on e.id = ep.employee_id and e.deleted_at is null
     where ep.deleted_at is null
       and crm.normalize_phone_e164(ep.personal_phone) is not null
  loop
    perform * from crm.upsert_party_phone_contact(
      v_row.party_id, v_row.organization_id, v_row.personal_phone, 'mobile',
      'unverified', 'hr.employee_private.personal_phone', v_row.updated_by, null, '{}'::jsonb
    );
  end loop;
end
$fn$;

do $fn$
begin
  if has_function_privilege('anon', 'communication.record_verified_sms_phone(uuid,text,timestamptz,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'communication.record_verified_sms_phone(uuid,text,timestamptz,text)', 'EXECUTE') then
    raise exception 'hr_c4_54: verification writer is reachable by an ordinary client';
  end if;
  if not has_function_privilege('service_role', 'communication.record_verified_sms_phone(uuid,text,timestamptz,text)', 'EXECUTE') then
    raise exception 'hr_c4_54: service_role cannot record Twilio verification';
  end if;
end
$fn$;
