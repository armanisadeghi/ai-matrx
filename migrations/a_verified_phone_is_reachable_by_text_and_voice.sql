-- chair-step: the two new SECURITY DEFINER doors must not be callable by `anon` or
-- `authenticated`. Postgres grants EXECUTE to PUBLIC on every function it creates, so
-- locking a new door is a REVOKE and there is no additive spelling of it. The REVOKEs
-- here name ONLY the two functions this file creates, in two schemas (crm and
-- communication), which is why the single-schema `-- allows: revoke <schema>` exemption
-- cannot cover it. Nothing else in the file is non-additive: no DROP, no column change,
-- no data deletion, and `crm.ensure_user_party(uuid, text)` keeps its exact signature and
-- behaviour (it delegates with require_membership => false, which is what it has always
-- done). Owned end to end by Lane AL of the Personal Staff campaign.
-- A VERIFIED PHONE IS REACHABLE — BY TEXT *AND* BY VOICE — THROUGH ONE DOOR.
--
-- based-on: crm.ensure_user_party(uuid, text) 0c5ec62a0ea82f3dca5ec21019be359a1f55953050cd147c0502181cb148929f
-- reads (never replaced): communication.record_verified_sms_phone(uuid, text, timestamptz, text)
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE DEFECT (P1, production, measured live 2026-09-21 against db.matrxserver.com)
-- ════════════════════════════════════════════════════════════════════════════
--
-- A person who completes the REAL phone-verification flow
-- (matrx-frontend `POST /api/sms/verify`, action=check) ends up UNREACHABLE on
-- both channels, and nothing anywhere says so.
--
--   TEXT.  The inbound resolver (matrx-frontend `lib/sms/receive.ts`) matches an
--          inbound message on `communication.sms_notification_preferences`
--          .assistant_destination_id + .assistant_program_key. The verify route
--          never wrote either column — it upserted `{user_id, organization_id,
--          phone_number, sms_enabled}` and stopped. So the resolver answered
--          `verified_user_binding_not_found`, the webhook returned empty TwiML,
--          and the person's first text produced NO sms_messages row, NO
--          ops.system_error row and NO reply. Silent.
--
--   VOICE. `communication.resolve_voice_owner_call_context` requires, IN THE
--          ORGANIZATION THE ENROLLMENT NAMES: a `crm.party` (person, claimed_by
--          = the user, canonical_id null), a verified phone `crm.contact_medium`
--          and the `crm.party_contact_point` joining them. The verify route's
--          only CRM write is `communication.record_verified_sms_phone`, whose
--          party step is `crm.ensure_user_party`, which is hardcoded to
--
--              v_ai_matrx_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'
--
--          plus that person's HR employee parties. The enrollment's OWN
--          organization — the one the caller states on `X-Organization-Id` — is
--          never among them unless it happens to BE AI Matrx. So the caller
--          context does not exist and the call is refused with
--          "No exact pre-existing enrolled CRM caller context matched".
--
-- The two halves are why the obvious one-line repair is wrong. Lane AH bound
-- `test@test.com`'s text columns by hand to run a proof; that made
-- `aidream/services/communications/test_a_call_and_a_text_open_one_thread.py`
-- go RED, because a text-bound number with no CRM caller context is a person
-- who can be texted and cannot be called. The binding was reverted. THEY ARE
-- ONE ENROLLMENT AND THEY MUST BE WRITTEN TOGETHER.
--
-- WHY NOBODY NOTICED. `arman@armansadeghi.com` and `admin@admin.com` work
-- because a one-off migration (`communications_p0_shared_assistant_binding`,
-- August) bound the text half from pre-existing transport rows, and the voice
-- half was hand-provisioned. NOBODY WHO VERIFIED SINCE THAT BACKFILL HAS BEEN
-- REACHABLE. Live census before this migration:
--
--   arman@armansadeghi.com  org 3e790542  bound  full CRM chain   reachable
--   admin@admin.com         org 884d1ce8  bound  full CRM chain   reachable
--   test@test.com           org 8cb71c8b  UNBOUND  0 parties      UNREACHABLE
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE FIX — ONE PRIMITIVE, NOT A SECOND COPY OF THE BACKFILL
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. `crm.ensure_user_party_in_org(user, organization, source, require_membership)`
--    is `crm.ensure_user_party` with the tenant lifted out of the body and into
--    a parameter. `crm.ensure_user_party` becomes a thin wrapper that passes the
--    AI Matrx organization and `require_membership => false`, so its behaviour
--    and its signature are BIT-FOR-BIT what every existing caller already
--    depends on. The hardcoded tenant is not removed from the platform — it is
--    removed from the only place it was doing damage: the bottom of the stack,
--    where a caller that knows its organization could not say so.
--
-- 2. `communication.enroll_verified_phone_for_assistant(...)` is THE enrollment
--    door. Every surface that enrolls a person — the verify flow, the settings
--    PUT, onboarding, admin — calls this and nothing else. It writes, in one
--    transaction and idempotently:
--      * the account + HR contact-graph proof (`record_verified_sms_phone`,
--        unchanged — this migration adds a tenant, it removes none);
--      * the CRM caller context IN THE ENROLLMENT'S ORGANIZATION — the voice
--        half that did not exist;
--      * the enrollment row bound to the ONE active assistant destination — the
--        text half the verify flow never wrote.
--
--    It NEVER GUESSES a destination. Exactly one active, assistant-enabled,
--    provider-backed row in `communication.sms_phone_numbers` is a binding; zero
--    or many is an outcome the caller is told about by name
--    (`no_active_assistant_destination` / `ambiguous_assistant_destination`), so
--    a platform with no assistant number announces itself instead of quietly
--    enrolling people into unreachability — which is the exact defect above.
--
-- 3. The census repair at the end runs the SAME function over every live
--    enrollment. It is idempotent (re-running changes nothing) and it is the
--    only repair: there is no hand-written UPDATE of the binding columns
--    anywhere in this file, because a repair that does not go through the door
--    is a second copy of the door.
--
-- NOTHING IS DELETED. No enrollment, party, medium or contact point is dropped,
-- and no existing binding is repointed: a person already bound to a destination
-- keeps it, and the outcome says `already_bound`.

set lock_timeout = '60s';
set statement_timeout = '10min';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. THE PARTY PRIMITIVE, WITH ITS TENANT AS A PARAMETER
-- ────────────────────────────────────────────────────────────────────────────

create or replace function crm.ensure_user_party_in_org(
  p_user_id uuid,
  p_organization_id uuid,
  p_source text default 'signup',
  p_require_membership boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
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
    raise exception 'ensure_user_party_in_org: p_user_id cannot be null';
  end if;
  if p_organization_id is null then
    raise exception 'ensure_user_party_in_org: p_organization_id cannot be null';
  end if;
  if p_source not in ('signup', 'promotion', 'backfill', 'reconcile', 'hr.employee_create') then
    raise exception 'ensure_user_party_in_org: unsupported source';
  end if;

  if not exists (
    select 1 from iam.organizations o where o.id = p_organization_id
  ) then
    raise exception 'ensure_user_party_in_org: organization % does not exist', p_organization_id;
  end if;

  -- 🚨 ORGANIZATION IS TENANCY. This asks whether the person BELONGS to the
  -- tenant their party is about to be filed in — never whether they may touch
  -- some row. A caller that already knows the membership holds (the AI Matrx
  -- account-party wrapper below, which has never required one) passes false.
  if p_require_membership and not iam.is_org_member(p_user_id, p_organization_id) then
    raise exception 'ensure_user_party_in_org: user % is not a member of organization %',
      p_user_id, p_organization_id using errcode = '42501';
  end if;

  select u.* into v_user from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'ensure_user_party_in_org: auth user does not exist';
  end if;
  if v_user.is_anonymous is true then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_user_id::text, 0)
  );

  v_email := nullif(lower(trim(v_user.email)), '');
  v_phone := nullif(trim(v_user.phone), '');
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'ensure_user_party_in_org: auth phone is not canonical E.164';
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
  where p.organization_id = p_organization_id
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
  where medium.organization_id = p_organization_id
    and medium.deleted_at is null
    and (
      (v_email is not null and medium.channel = 'email' and medium.value_key = v_email)
      or
      (v_phone is not null and medium.channel = 'phone' and medium.value_key = v_phone)
    );

  if cardinality(v_candidate_ids) > 1 then
    raise exception 'ensure_user_party_in_org: auth identity matches multiple active CRM parties';
  end if;

  if v_party_id is not null then
    if exists (
      select 1 from unnest(v_candidate_ids) candidate_id
      where candidate_id <> v_party_id
    ) then
      raise exception 'ensure_user_party_in_org: claimed party conflicts with contact identity';
    end if;
  elsif cardinality(v_candidate_ids) = 1 then
    v_party_id := v_candidate_ids[1];
    select p.claimed_by into v_candidate_claim
    from crm.party p where p.id = v_party_id for update;
    if v_candidate_claim is not null and v_candidate_claim <> p_user_id then
      raise exception 'ensure_user_party_in_org: contact identity is claimed by another user';
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
      party_kind, display_name, record_class, claimed_by, claimed_at,
      source, source_detail, organization_id, created_by, updated_by,
      visibility, attributes, metadata
    ) values (
      'person', v_display_name, 'contact', p_user_id, now(),
      'user_registration', p_source, p_organization_id, p_user_id, p_user_id,
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
      channel, value_raw, value_key, verification_status, verified_at,
      organization_id, created_by, updated_by, visibility, details, metadata
    ) values (
      v_medium.channel, v_medium.value_raw, v_medium.value_key,
      case when v_medium.confirmed_at is null then 'unverified' else 'verified' end,
      v_medium.confirmed_at, p_organization_id, p_user_id, p_user_id, 'internal',
      jsonb_build_object('source', 'auth_user', 'provisioning_source', p_source),
      jsonb_build_object('provisioning_source', p_source)
    )
    on conflict (
      organization_id, channel, (coalesce(platform_slug, ''::text)), value_key
    ) where deleted_at is null
    do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_changed := true;
      v_media_added := array_append(v_media_added, v_medium.channel);
    end if;

    select medium.id into strict v_medium_id
    from crm.contact_medium medium
    where medium.organization_id = p_organization_id
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
      party_id, medium_id, purpose_code, is_primary, is_identity_key,
      source, confidence, organization_id, created_by, updated_by, channel, metadata
    ) values (
      v_party_id, v_medium_id,
      case when v_medium.channel = 'phone' then 'mobile' else 'personal' end,
      false, false, 'auth_user', 100, p_organization_id, p_user_id, p_user_id,
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
      p_organization_id,
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
$function$;

comment on function crm.ensure_user_party_in_org(uuid, uuid, text, boolean) is
  'Ensure the person has exactly one claimed CRM person-party (plus their auth email/phone media) in a NAMED organization. The tenant is a parameter because a caller that knows its organization must be able to say so; crm.ensure_user_party is the AI Matrx account-party wrapper over this.';

revoke all on function crm.ensure_user_party_in_org(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function crm.ensure_user_party_in_org(uuid, uuid, text, boolean)
  to service_role;

-- The access decision, IN DATA (§6d-4 / DD-223). Neither of these two doors is
-- ever reachable from a browser: both are SECURITY DEFINER, both take a
-- `p_user_id` they act AS, and a client that could name someone else's user id
-- would be enrolling a stranger's phone. So both are declared server-only.
insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes, reason,
  declared_by, non_client_lane, signed_in_callers, anonymous_callers
) values (
  'crm', 'ensure_user_party_in_org',
  'p_user_id uuid, p_organization_id uuid, p_source text, p_require_membership boolean',
  array['uuid','uuid','text','boolean']::regtype[]::oid[],
  'p_user_id is the person the party is FOR and is never checked against the caller, because there is no caller: this runs only from other SECURITY DEFINER functions and from migrations. p_organization_id is the tenant the party is filed in and is checked with iam.is_org_member(p_user_id, p_organization_id) whenever p_require_membership is true; the one caller that passes false is crm.ensure_user_party, whose AI Matrx account party has never required a membership and whose signup callers would break if it started to. Neither argument may be NULL (both raise). p_source is an enum-by-CHECK, not an identity.',
  'a_verified_phone_is_reachable_by_text_and_voice.sql (Lane AL)',
  'server_only: EXECUTE is revoked from PUBLIC, anon and authenticated in this same file and granted only to service_role. Its callers are crm.ensure_user_party (the AI Matrx account-party wrapper, itself server-only) and communication.enroll_verified_phone_for_assistant. No route, RPC or browser call reaches it.',
  false, false
)
on conflict do nothing;

-- The AI Matrx account party, unchanged in signature, behaviour and tenant.
-- `require_membership => false` is deliberate and is what preserves it: this
-- function has NEVER required the person to be a member of AI Matrx, and every
-- signup flow depends on that.
create or replace function crm.ensure_user_party(
  p_user_id uuid,
  p_source text default 'signup'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ai_matrx_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid;
begin
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
  return crm.ensure_user_party_in_org(p_user_id, v_ai_matrx_org, p_source, false);
end;
$function$;

-- CREATE OR REPLACE preserves a function's ACL, and these two grants are re-issued
-- explicitly anyway: `supabase_auth_admin` is how the signup path reaches this
-- function, and a replace that silently dropped it would break every new account.
grant execute on function crm.ensure_user_party(uuid, text) to service_role;
grant execute on function crm.ensure_user_party(uuid, text) to supabase_auth_admin;

-- Pre-existing debt this file is the first to touch, so it is this file's to
-- settle (§6d-4 / DD-223): crm.ensure_user_party has been a SECURITY DEFINER
-- with no declared access decision since it was written. Replacing its body
-- makes the shape guard ask, and the honest answer is that nothing client-side
-- has ever called it — its ACL has only ever held postgres, service_role and
-- supabase_auth_admin (read live 2026-09-21).
insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes, reason,
  declared_by, non_client_lane, signed_in_callers, anonymous_callers
) values (
  'crm', 'ensure_user_party', 'p_user_id uuid, p_source text',
  array['uuid','text']::regtype[]::oid[],
  'p_user_id is the person the AI Matrx account party is FOR and is never checked against a caller, because there is no caller: this runs from the signup path as supabase_auth_admin and from server-side definers as service_role. It must be a real auth.users row or the call raises; an anonymous user returns NULL rather than a party. The organization is not an argument at all — it is the AI Matrx tenant, asserted present before anything is written. p_source is an enum-by-CHECK, not an identity.',
  'a_verified_phone_is_reachable_by_text_and_voice.sql (Lane AL) — settling pre-existing debt',
  'server_only: its ACL has only ever held postgres, service_role and supabase_auth_admin; PUBLIC, anon and authenticated have never had EXECUTE. It is reached from the auth signup path and from other SECURITY DEFINER functions, never from a browser.',
  false, false
)
on conflict do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. THE ONE ENROLLMENT DOOR
-- ────────────────────────────────────────────────────────────────────────────

create or replace function communication.enroll_verified_phone_for_assistant(
  p_user_id uuid,
  p_organization_id uuid,
  p_phone_number text,
  p_verified_at timestamptz default now(),
  p_source text default 'twilio_verify'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_phone text := crm.normalize_phone_e164(p_phone_number);
  v_party_id uuid;
  v_point record;
  v_destination communication.sms_phone_numbers%rowtype;
  v_destination_count integer;
  v_existing communication.sms_notification_preferences%rowtype;
  v_binding text;
  v_preference_id uuid;
  v_contact_graph jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users u
    where u.id = p_user_id and coalesce(u.is_anonymous, false) = false
  ) then
    raise exception 'enroll_verified_phone_for_assistant: permanent auth user required'
      using errcode = '23503';
  end if;
  if p_organization_id is null then
    raise exception 'enroll_verified_phone_for_assistant: an enrollment names its organization'
      using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'enroll_verified_phone_for_assistant: phone is not canonicalizable to E.164'
      using errcode = '22023';
  end if;
  if p_source <> 'twilio_verify' then
    raise exception 'enroll_verified_phone_for_assistant: unsupported verification source'
      using errcode = '22023';
  end if;
  if not iam.is_org_member(p_user_id, p_organization_id) then
    raise exception 'enroll_verified_phone_for_assistant: user % is not a member of organization %',
      p_user_id, p_organization_id using errcode = '42501';
  end if;

  -- (a) The account + HR contact-graph proof. Unchanged contract; this call is
  --     why the door can replace the old one rather than sit beside it.
  v_contact_graph := communication.record_verified_sms_phone(
    p_user_id, v_phone, coalesce(p_verified_at, now()), 'twilio_verify'
  );

  -- (b) THE VOICE HALF. The caller context
  --     `communication.resolve_voice_owner_call_context` looks for, in the
  --     organization the enrollment names — the thing that did not exist.
  v_party_id := crm.ensure_user_party_in_org(
    p_user_id, p_organization_id, 'reconcile', true
  );
  if v_party_id is null then
    raise exception 'enroll_verified_phone_for_assistant: no CRM party could be established'
      using errcode = 'P0002';
  end if;
  select * into v_point
  from crm.upsert_party_phone_contact(
    v_party_id, p_organization_id, v_phone, 'mobile', 'verified', 'twilio_verify',
    p_user_id, coalesce(p_verified_at, now()),
    jsonb_build_object(
      'provider', 'twilio_verify',
      'verification_channel', 'sms',
      'verified_at', coalesce(p_verified_at, now()),
      'enrollment_organization_id', p_organization_id
    )
  );

  -- (c) THE TEXT HALF. Exactly one destination is a binding; anything else is
  --     an outcome with a name, never a guess.
  select count(*) into v_destination_count
  from communication.sms_phone_numbers d
  where d.is_active
    and d.assistant_enabled
    and d.provider_account_id is not null
    and d.deleted_at is null;

  select * into v_existing
  from communication.sms_notification_preferences pref
  where pref.user_id = p_user_id and pref.deleted_at is null;

  if v_existing.id is not null and v_existing.assistant_destination_id is not null then
    -- A binding somebody already has is never repointed from here. Moving a
    -- person between assistant programs is a deliberate act with its own door.
    v_binding := 'already_bound';
    select * into v_destination
    from communication.sms_phone_numbers d
    where d.id = v_existing.assistant_destination_id
      and d.program_key = v_existing.assistant_program_key;
    update communication.sms_notification_preferences pref
    set organization_id = p_organization_id,
        phone_number = v_phone,
        sms_enabled = true,
        updated_by = p_user_id,
        updated_at = now()
    where pref.id = v_existing.id
    returning pref.id into v_preference_id;
  elsif v_destination_count = 0 then
    v_binding := 'no_active_assistant_destination';
  elsif v_destination_count > 1 then
    v_binding := 'ambiguous_assistant_destination';
  else
    select * into v_destination
    from communication.sms_phone_numbers d
    where d.is_active
      and d.assistant_enabled
      and d.provider_account_id is not null
      and d.deleted_at is null;
    v_binding := 'bound';
  end if;

  if v_preference_id is null then
    insert into communication.sms_notification_preferences (
      user_id, organization_id, phone_number, sms_enabled,
      assistant_destination_id, assistant_program_key, created_by, updated_by
    ) values (
      p_user_id, p_organization_id, v_phone, true,
      v_destination.id, v_destination.program_key, p_user_id, p_user_id
    )
    on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        phone_number = excluded.phone_number,
        sms_enabled = true,
        assistant_destination_id = coalesce(
          sms_notification_preferences.assistant_destination_id,
          excluded.assistant_destination_id
        ),
        assistant_program_key = coalesce(
          sms_notification_preferences.assistant_program_key,
          excluded.assistant_program_key
        ),
        updated_by = excluded.updated_by,
        updated_at = now()
    returning id into v_preference_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'phone_number', v_phone,
    'user_id', p_user_id,
    'organization_id', p_organization_id,
    'preference_id', v_preference_id,
    'assistant_binding', v_binding,
    'assistant_destination_id', v_destination.id,
    'assistant_program_key', v_destination.program_key,
    'party_id', v_party_id,
    'contact_point_id', v_point.contact_point_id,
    'contact_medium_id', v_point.contact_medium_id,
    'text_reachable', v_binding in ('bound', 'already_bound'),
    'voice_reachable', v_point.contact_point_id is not null,
    'contact_graph', v_contact_graph
  );
end;
$function$;

comment on function communication.enroll_verified_phone_for_assistant(uuid, uuid, text, timestamptz, text) is
  'THE enrollment door. Writes, idempotently and together, the three things a verified phone needs to be reachable: the account/HR contact-graph proof, the CRM caller context IN THE ENROLLMENT ORGANIZATION (voice), and the assistant destination/program binding (text). Every enrollment surface calls this and nothing else.';

revoke all on function communication.enroll_verified_phone_for_assistant(uuid, uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function communication.enroll_verified_phone_for_assistant(uuid, uuid, text, timestamptz, text)
  to service_role;

-- The access decision, IN DATA (§6d-4 / DD-223).
insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes, reason,
  declared_by, non_client_lane, signed_in_callers, anonymous_callers
) values (
  'communication', 'enroll_verified_phone_for_assistant',
  'p_user_id uuid, p_organization_id uuid, p_phone_number text, p_verified_at timestamp with time zone, p_source text',
  array['uuid','uuid','text','timestamptz','text']::regtype[]::oid[],
  'p_user_id is the person being enrolled; it must be a permanent (non-anonymous) auth user and it is never inferred from a session, because this door has no session — the trusted server route that calls it has already proved possession of the number through Twilio Verify. p_organization_id is the tenant the enrollment is filed in and is checked with iam.has-access-style tenancy: iam.is_org_member(p_user_id, p_organization_id) must be true or the call is refused 42501. p_phone_number must canonicalize to E.164 or the call is refused 22023. p_verified_at is provenance only. p_source accepts the single value twilio_verify. No argument may be NULL except p_verified_at, which defaults to now().',
  'a_verified_phone_is_reachable_by_text_and_voice.sql (Lane AL)',
  'server_only: EXECUTE is revoked from PUBLIC, anon and authenticated in this same file and granted only to service_role. Its callers are matrx-frontend app/api/sms/verify/route.ts and app/api/sms/preferences/route.ts, both of which run on the service-role admin client after authenticating the person and admitting their organization from X-Organization-Id. A browser that could name a p_user_id would be enrolling a stranger phone.',
  false, false
)
on conflict do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. THE CENSUS REPAIR — every live enrollment, through the same door
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_row record;
  v_result jsonb;
  v_repaired integer := 0;
  v_skipped integer := 0;
begin
  -- 🚨 AN AUTOMATED WRITE NAMES ITSELF. `platform._stamp_actor_tier` refuses a
  -- `code`-tier write with no `app.actor_system` (23514), and it is right to: "an
  -- AI did it" with no name is not provenance. This repair is not a person, so it
  -- says which system it is. Local to the transaction, so nothing leaks onto the
  -- pooled connection afterwards.
  perform set_config('app.actor_system', 'communications.enrollment_repair', true);
  for v_row in
    select pref.id, pref.user_id, pref.organization_id, pref.phone_number
    from communication.sms_notification_preferences pref
    where pref.deleted_at is null
      and pref.user_id is not null
      and pref.organization_id is not null
      and pref.phone_number is not null
    order by pref.created_at
  loop
    if not iam.is_org_member(v_row.user_id, v_row.organization_id) then
      raise warning 'enrollment % : user % is not a member of organization % — left exactly as it is. A membership is not something a repair may invent.',
        v_row.id, v_row.user_id, v_row.organization_id;
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_result := communication.enroll_verified_phone_for_assistant(
      v_row.user_id, v_row.organization_id, v_row.phone_number, now(), 'twilio_verify'
    );
    v_repaired := v_repaired + 1;
    raise notice 'enrollment % : binding=%  text_reachable=%  voice_reachable=%',
      v_row.id,
      v_result ->> 'assistant_binding',
      v_result ->> 'text_reachable',
      v_result ->> 'voice_reachable';
  end loop;
  raise notice 'census repair: % enrollment(s) run through the door, % skipped', v_repaired, v_skipped;
end;
$$;
