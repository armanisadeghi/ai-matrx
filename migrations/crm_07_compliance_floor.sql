-- Compliance floor completion: MX/disposable enforcement, purchased-list
-- detection, RFC 8058 provider coverage, and the reply-opt-out write seam.
--
-- Applied live first; this file is the durable record. The one authority remains
-- crm.check_send_eligibility(). Every new send-time refusal below lives there.

-- A list-quality verdict derived from the data already attached to the list.
-- There is deliberately no second "suppression" or "approved list" table: the
-- list, its members, and each medium's provenance are the evidence.
create or replace function crm.evaluate_outreach_list_quality(p_list_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = crm, public, pg_temp
as $fn$
declare
  ol crm.outreach_list;
  v_total integer := 0;
  v_email_total integer := 0;
  v_missing_provenance integer := 0;
  v_role_addresses integer := 0;
  v_dominant_pattern integer := 0;
  v_origin text;
  v_explicit_purchased boolean := false;
  v_suspicious_bulk boolean := false;
  v_high_role_share boolean := false;
  v_uniform_pattern boolean := false;
  v_signals jsonb := '[]'::jsonb;
begin
  select * into ol
    from crm.outreach_list
   where id = p_list_id and deleted_at is null;

  if ol.id is null then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'list_not_found',
      'message', 'That outreach list no longer exists.',
      'fix', 'Refresh the campaign and choose an existing list.',
      'signals', jsonb_build_array('list_not_found'));
  end if;

  v_origin := lower(coalesce(
    ol.definition->>'acquisition_method',
    ol.definition->>'list_origin',
    ol.definition->>'source_kind',
    ol.metadata->>'acquisition_method',
    ol.metadata->>'list_origin',
    ol.metadata->>'source_kind',
    ''));
  v_explicit_purchased := v_origin ~
    '(^|[^a-z])(purchased|bought|rented|broker|data[ _-]?broker|third[ _-]?party[ _-]?list)([^a-z]|$)';

  with member_media as (
    select cm.*,
           regexp_replace(
             split_part(lower(cm.value_key), '@', 1),
             '[a-z]+', 'a', 'g') as local_pattern
      from crm.outreach_list_member olm
      left join crm.party_contact_point pcp
        on pcp.id = olm.contact_point_id and pcp.deleted_at is null
      left join crm.contact_medium cm
        on cm.id = pcp.medium_id and cm.deleted_at is null
     where olm.outreach_list_id = p_list_id
       and olm.deleted_at is null
  ), pattern_counts as (
    select local_pattern, count(*)::integer as n
      from member_media
     where channel = 'email' and local_pattern is not null
     group by local_pattern
  )
  select count(*)::integer,
         count(*) filter (where channel = 'email')::integer,
         count(*) filter (
           where channel = 'email'
             and consent_basis = 'none'
             and nullif(btrim(consent_source), '') is null
             and nullif(btrim(consent_source_url), '') is null
         )::integer,
         count(*) filter (where channel = 'email' and is_role_address)::integer,
         coalesce((select max(n) from pattern_counts), 0)
    into v_total, v_email_total, v_missing_provenance, v_role_addresses,
         v_dominant_pattern
    from member_media;

  -- High-confidence construction signals. A legitimate first-party import can
  -- be large or patterned; the refusal requires the absence of provenance too.
  v_suspicious_bulk := v_email_total >= 20
    and v_missing_provenance * 100 >= v_email_total * 80;
  v_high_role_share := v_email_total >= 20
    and v_role_addresses * 100 >= v_email_total * 50
    and v_missing_provenance * 100 >= v_email_total * 50;
  v_uniform_pattern := v_email_total >= 20
    and v_dominant_pattern * 100 >= v_email_total * 80
    and v_missing_provenance * 100 >= v_email_total * 50;

  if v_explicit_purchased then
    v_signals := v_signals || jsonb_build_array('declared_purchased_source');
  end if;
  if v_suspicious_bulk then
    v_signals := v_signals || jsonb_build_array('bulk_without_provenance');
  end if;
  if v_high_role_share then
    v_signals := v_signals || jsonb_build_array('role_address_concentration');
  end if;
  if v_uniform_pattern then
    v_signals := v_signals || jsonb_build_array('uniform_address_pattern');
  end if;

  if v_explicit_purchased or v_suspicious_bulk
     or v_high_role_share or v_uniform_pattern then
    return jsonb_build_object(
      'status', 'blocked',
      'code', 'purchased_list_suspected',
      'message', 'This list has the signs of a purchased or bulk-scraped list. Purchased lists are never allowed, in either sending lane.',
      'fix', 'Remove recipients without first-party consent or a specific discovery source. If this is your own list, attach the opt-in form, import source, or page where each address was found.',
      'signals', v_signals,
      'member_count', v_total,
      'email_count', v_email_total,
      'missing_provenance_count', v_missing_provenance,
      'role_address_count', v_role_addresses,
      'dominant_pattern_count', v_dominant_pattern);
  end if;

  return jsonb_build_object(
    'status', 'passed',
    'signals', v_signals,
    'member_count', v_total,
    'email_count', v_email_total,
    'missing_provenance_count', v_missing_provenance,
    'role_address_count', v_role_addresses,
    'dominant_pattern_count', v_dominant_pattern);
end
$fn$;

revoke all on function crm.evaluate_outreach_list_quality(uuid)
  from public, anon, authenticated;
grant execute on function crm.evaluate_outreach_list_quality(uuid)
  to service_role;

comment on function crm.evaluate_outreach_list_quality(uuid) is
  'High-confidence purchased/bulk-scraped list signals derived from list members and contact provenance. crm.check_send_eligibility is the enforcement point.';

-- G6 will deliver one normalized inbound reply to this seam. Detection stays
-- in aidream (pure and provider-independent); this function performs the one
-- atomic, idempotent suppression write once detection says the reply opts out.
create or replace function crm.honor_reply_opt_out(
  p_identity_id uuid,
  p_in_reply_to_provider_message_id text,
  p_reply_provider_message_id text,
  p_detected_phrase text,
  p_received_at timestamptz default now()
) returns jsonb
language plpgsql security definer
set search_path = crm, public, pg_temp
as $fn$
declare
  original crm.sending_event;
  v_already boolean := false;
  v_event_id uuid;
begin
  if nullif(btrim(p_in_reply_to_provider_message_id), '') is null
     or nullif(btrim(p_reply_provider_message_id), '') is null
     or nullif(btrim(p_detected_phrase), '') is null then
    raise exception 'reply opt-out requires the original id, reply id, and detected phrase'
      using errcode = '22023';
  end if;

  select * into original
    from crm.sending_event
   where identity_id = p_identity_id
     and event_kind = 'sent'
     and provider_message_id = p_in_reply_to_provider_message_id
     and deleted_at is null
   order by occurred_at desc
   limit 1;

  if original.id is null or original.medium_id is null then
    return jsonb_build_object(
      'ok', false,
      'matched', false,
      'error', 'original_send_not_found');
  end if;

  select unsubscribed_at is not null into v_already
    from crm.contact_medium where id = original.medium_id;

  update crm.contact_medium
     set unsubscribed_at = coalesce(unsubscribed_at, p_received_at),
         suppressed_at = coalesce(suppressed_at, p_received_at),
         suppression_reason = coalesce(suppression_reason, 'reply_opt_out'),
         suppression_expires_at = null
   where id = original.medium_id;

  insert into crm.sending_event
    (identity_id, event_kind, party_id, medium_id, outreach_list_id,
     interaction_id, to_address_key, provider_message_id, actor_kind,
     occurred_at, organization_id, detail)
  values
    (original.identity_id, 'unsubscribed', original.party_id,
     original.medium_id, original.outreach_list_id, original.interaction_id,
     original.to_address_key, p_reply_provider_message_id, 'system',
     p_received_at, original.organization_id,
     jsonb_build_object(
       'via', 'reply',
       'in_reply_to_provider_message_id', p_in_reply_to_provider_message_id,
       'detected_phrase', p_detected_phrase))
  on conflict (identity_id, event_kind, provider_message_id)
    where provider_message_id is not null and deleted_at is null
  do nothing
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'matched', true,
    'already_unsubscribed', v_already,
    'medium_id', original.medium_id,
    'event_id', v_event_id);
end
$fn$;

revoke all on function crm.honor_reply_opt_out(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function crm.honor_reply_opt_out(uuid, text, text, text, timestamptz)
  to service_role;

comment on function crm.honor_reply_opt_out(uuid, text, text, text, timestamptz) is
  'Atomic, idempotent reply-based opt-out write. G6 inbound calls aidream''s detector, then this seam; crm.contact_medium remains the one suppression authority.';

-- THE ONE SEND AUTHORITY. This replacement preserves the existing checks and
-- adds the four floor items. No plan, tier, trust level, or caller bypasses it.
create or replace function crm.check_send_eligibility(
  p_medium_id uuid,
  p_list_id uuid default null,
  p_identity_id uuid default null
) returns jsonb
language plpgsql stable security definer
set search_path = crm, public, pg_temp
as $fn$
declare
  cm crm.contact_medium;
  ol crm.outreach_list;
  si crm.sending_identity;
  sp crm.sending_policy;
  jp crm.jurisdiction_policy;
  v_country text;
  v_conf text := 'none';
  v_method text := 'none';
  v_lane text := 'cold_outreach';
  v_list_quality jsonb;
  v_is_list_member boolean := false;
  blocks jsonb := '[]'::jsonb;
  warns jsonb := '[]'::jsonb;
  v_postal_ok boolean;
  v_accepted boolean;
begin
  select * into cm
    from crm.contact_medium
   where id = p_medium_id and deleted_at is null;
  if cm.id is null then
    return jsonb_build_object(
      'allowed', false,
      'lane', v_lane,
      'blocks', jsonb_build_array(jsonb_build_object(
        'code', 'medium_not_found',
        'message', 'That contact no longer exists.',
        'fix', 'Refresh the list.')),
      'warnings', warns,
      'resolved', jsonb_build_object());
  end if;

  if p_list_id is not null then
    select * into ol
      from crm.outreach_list
     where id = p_list_id and deleted_at is null;
    if ol.id is null then
      blocks := blocks || jsonb_build_object(
        'code', 'list_not_found',
        'message', 'That outreach list no longer exists.',
        'fix', 'Refresh the campaign and choose an existing list.');
    elsif ol.organization_id <> cm.organization_id then
      blocks := blocks || jsonb_build_object(
        'code', 'list_other_org',
        'message', 'That list belongs to a different organization.',
        'fix', 'Choose a list from this organization.');
    else
      v_lane := coalesce(ol.lane, 'cold_outreach');
      select exists (
        select 1
          from crm.outreach_list_member olm
          join crm.party_contact_point pcp
            on pcp.id = olm.contact_point_id and pcp.deleted_at is null
         where olm.outreach_list_id = p_list_id
           and olm.deleted_at is null
           and pcp.medium_id = p_medium_id
      ) into v_is_list_member;
      if not v_is_list_member then
        blocks := blocks || jsonb_build_object(
          'code', 'recipient_not_in_list',
          'message', 'This address is not a member of that outreach list.',
          'fix', 'Refresh the campaign and choose the recipient from its current members.');
      end if;

      v_list_quality := crm.evaluate_outreach_list_quality(p_list_id);
      if v_list_quality->>'status' = 'blocked' then
        blocks := blocks || jsonb_build_object(
          'code', coalesce(v_list_quality->>'code', 'purchased_list_suspected'),
          'message', coalesce(v_list_quality->>'message', 'This list cannot be sent.'),
          'fix', coalesce(v_list_quality->>'fix', 'Review how this list was acquired.'),
          'detail', v_list_quality);
      end if;
    end if;
  end if;

  if p_identity_id is not null then
    select * into si
      from crm.sending_identity
     where id = p_identity_id and deleted_at is null;
    if si.id is not null and si.organization_id <> cm.organization_id then
      blocks := blocks || jsonb_build_object(
        'code', 'identity_other_org',
        'message', 'That sending mailbox belongs to a different organization.',
        'fix', 'Choose a mailbox from this organization.');
      si := null;
    end if;
  end if;

  select * into sp
    from crm.sending_policy
   where organization_id = cm.organization_id and deleted_at is null
   limit 1;

  select r.country_code, r.confidence, r.method
    into v_country, v_conf, v_method
    from crm.resolve_recipient_jurisdiction(p_medium_id) r;
  if v_country is not null then
    select * into jp
      from crm.jurisdiction_policy
     where country_code = v_country and is_active;
  end if;

  -- 0. org kill switch
  if sp.id is not null and sp.outreach_enabled is false then
    blocks := blocks || jsonb_build_object(
      'code', 'org_outreach_disabled',
      'message', 'Sending is turned off for this organization.',
      'fix', coalesce(sp.disabled_reason, 'Contact support to re-enable it.'));
  end if;

  -- 1. suppression. An opt-out outranks every other fact in both lanes.
  if cm.unsubscribed_at is not null then
    blocks := blocks || jsonb_build_object(
      'code', 'unsubscribed',
      'message', 'This person asked to stop receiving email. That is permanent.',
      'fix', 'Nothing — only they can reverse it.');
  end if;
  if cm.complaint_at is not null then
    blocks := blocks || jsonb_build_object(
      'code', 'complained',
      'message', 'This person marked earlier email as spam.',
      'fix', 'Nothing — do not contact them again.');
  end if;
  if cm.suppressed_at is not null and cm.unsubscribed_at is null then
    blocks := blocks || jsonb_build_object(
      'code', 'suppressed',
      'message', 'This address is on your suppression list.',
      'fix', coalesce(cm.suppression_reason, 'Remove the suppression if it was a mistake.'));
  end if;
  if cm.dnc_state = 'listed' then
    blocks := blocks || jsonb_build_object(
      'code', 'dnc_listed',
      'message', 'This contact is on a do-not-contact register.',
      'fix', 'Nothing.');
  end if;
  if cm.bounce_type in ('hard', 'block', 'complaint') then
    blocks := blocks || jsonb_build_object(
      'code', 'hard_bounced',
      'message', 'Mail to this address permanently failed before.',
      'fix', 'Find a current address for this person.');
  end if;

  -- 2. address verification. MX is explicit: a generic "verified" flag can
  -- never buy past a missing exchanger. Disposable addresses are a floor too.
  if cm.mx_valid is false then
    blocks := blocks || jsonb_build_object(
      'code', 'mx_missing',
      'message', 'The domain after @ has no mail exchanger, so this message would hard-bounce.',
      'fix', 'Use a different address at a domain that accepts email.');
  elsif cm.verification_status = 'invalid' then
    blocks := blocks || jsonb_build_object(
      'code', 'address_invalid',
      'message', 'This address is not deliverable.',
      'fix', 'Find a current address.');
  elsif lower(coalesce(cm.details->'email_verification'->>'disposable', 'false')) = 'true' then
    blocks := blocks || jsonb_build_object(
      'code', 'disposable_address',
      'message', 'This is a temporary or disposable email address. Outreach to it is not allowed.',
      'fix', 'Use the person''s permanent business address instead.');
  elsif cm.verification_status = 'unverified'
     or cm.mx_valid is not true
     or cm.verified_at is null
     or cm.verified_at < now() - interval '30 days' then
    blocks := blocks || jsonb_build_object(
      'code', 'address_unverified',
      'message', 'We have not recently confirmed that this address has a working mail exchanger.',
      'fix', 'Run verification on this list — we do it for you.');
  elsif cm.verification_status = 'risky' then
    warns := warns || jsonb_build_object(
      'code', 'address_risky',
      'message', 'This address has a deliverability risk that needs monitoring.');
  end if;

  -- 3. lane-specific consent and jurisdiction. Purchased-list detection ran
  -- above this branch, so it applies equally to BOTH lanes.
  if v_lane = 'opt_in_marketing' then
    if cm.consent_basis not in ('express', 'soft_opt_in') then
      blocks := blocks || jsonb_build_object(
        'code', 'no_consent_record',
        'message', 'This person has no record of asking to hear from you, so they cannot be included in a marketing campaign.',
        'fix', 'Move them to an outreach campaign, or collect consent first.');
    elsif cm.consent_expires_at is not null and cm.consent_expires_at < now() then
      blocks := blocks || jsonb_build_object(
        'code', 'consent_expired',
        'message', 'Their permission has run out.',
        'fix', 'Ask them to opt in again.');
    end if;
  else
    if v_country is null then
      blocks := blocks || jsonb_build_object(
        'code', 'jurisdiction_unresolved',
        'message', 'We cannot tell which country this person is in, and the rules depend on it.',
        'fix', 'Set the country on this contact, or remove them from the campaign.');
    elsif jp.country_code is null then
      blocks := blocks || jsonb_build_object(
        'code', 'jurisdiction_unknown',
        'message', 'We have not confirmed the rules for ' || v_country || ' yet.',
        'fix', 'Remove recipients in this country until we have.');
    elsif jp.cold_b2b = 'prohibited' then
      blocks := blocks || jsonb_build_object(
        'code', 'jurisdiction_prohibited',
        'message', jp.country_name || ' requires permission BEFORE you write, even for business email.',
        'fix', 'Remove recipients in ' || jp.country_name || ', or get their permission first.');
    elsif jp.cold_b2b = 'unknown' then
      blocks := blocks || jsonb_build_object(
        'code', 'jurisdiction_unknown',
        'message', 'We have not confirmed the rules for ' || jp.country_name || ' yet, so we will not send there.',
        'fix', 'Remove recipients in ' || jp.country_name || '.');
    elsif jp.cold_b2b = 'conditional' then
      if jp.requires_role_relevance
         and cm.consent_basis not in (
           'conspicuous_publication', 'legitimate_interest', 'express',
           'implied_ebr', 'implied_inquiry') then
        blocks := blocks || jsonb_build_object(
          'code', 'role_relevance_unproven',
          'message', jp.country_name || ' only allows this if the message relates to what this person does at work, and we have no record of why you picked them.',
          'fix', 'Record where you found this contact and why the message fits their role.');
      end if;
      if jp.distinguishes_subscriber_kind and cm.subscriber_kind = 'individual' then
        blocks := blocks || jsonb_build_object(
          'code', 'individual_subscriber',
          'message', jp.country_name || ' treats sole traders and individuals differently from companies, and this contact is marked as an individual.',
          'fix', 'Only contact them with their permission.');
      elsif jp.distinguishes_subscriber_kind and cm.subscriber_kind = 'unknown' then
        warns := warns || jsonb_build_object(
          'code', 'subscriber_kind_unknown',
          'message', jp.country_name || ': confirm this is a company, not a sole trader.');
      end if;
    end if;

    if jp.requires_source_disclosure
       and cm.consent_source_url is null and cm.consent_source is null then
      blocks := blocks || jsonb_build_object(
        'code', 'source_undisclosed',
        'message', 'In this country you must tell people where you got their details, and we have no record of where this came from.',
        'fix', 'Record the page you found this contact on.');
    end if;

    if jp.region in ('EEA', 'UK') and p_list_id is not null
       and coalesce(ol.lawful_basis, 'legitimate_interest') = 'legitimate_interest'
       and ol.lia_completed_at is null then
      blocks := blocks || jsonb_build_object(
        'code', 'lia_missing',
        'message', 'Before contacting people in Europe you need to write down why this outreach is fair to them.',
        'fix', 'Complete the short assessment on this campaign — we draft it for you.');
    end if;
  end if;

  if v_conf = 'medium' then
    warns := warns || jsonb_build_object(
      'code', 'jurisdiction_inferred',
      'message', 'Country guessed from the email domain (' || v_method || '). Confirm it.');
  end if;

  -- 4. sender. Google Workspace is the only live adapter whose provider-side
  -- DKIM signer has been proven to cover both RFC 8058 headers. Future provider
  -- support is a DB-authority change after the same live proof, never a tier.
  if p_identity_id is not null then
    if si.id is null then
      blocks := blocks || jsonb_build_object(
        'code', 'identity_not_found',
        'message', 'That sending mailbox no longer exists.',
        'fix', 'Pick another mailbox.');
    else
      if (p_list_id is not null and si.status <> 'ready')
         or (p_list_id is null and si.status not in ('warming', 'ready')) then
        blocks := blocks || jsonb_build_object(
          'code', 'identity_not_ready',
          'message', case si.status
            when 'warming' then 'This mailbox is still warming up. It cannot run a campaign yet.'
            when 'paused' then 'This mailbox is paused: ' || coalesce(si.pause_reason, 'health check failed') || '.'
            when 'draft' then 'This mailbox has not finished setup.'
            when 'verifying' then 'We are still checking this mailbox.'
            else 'This mailbox is disabled.' end,
          'fix', case si.status
            when 'warming' then 'Wait for warmup to finish, or use a mailbox that is ready.'
            when 'paused' then 'A person on our team reviews this before it turns back on.'
            else 'Finish setting up this mailbox.' end);
      end if;
      if si.domain_verified_at is null then
        blocks := blocks || jsonb_build_object(
          'code', 'domain_unverified',
          'message', 'You have not proven you own this domain yet.',
          'fix', 'Add the DNS record we generated for you — we check it automatically.');
      end if;
      if si.spf_pass is not true or si.dkim_pass is not true or si.dmarc_pass is not true then
        blocks := blocks || jsonb_build_object(
          'code', 'authentication_failing',
          'message', 'Your email is not set up to prove it is really from you, so most of it will be thrown away before anyone sees it.',
          'fix', 'Open the setup checklist — we show you the exact records to add.');
      end if;
      if si.provider <> 'google_workspace' then
        blocks := blocks || jsonb_build_object(
          'code', 'rfc8058_dkim_unavailable',
          'message', 'This mailbox provider has not been proven to DKIM-sign the one-click unsubscribe headers.',
          'fix', 'Use a Google Workspace mailbox until this provider passes the live signing check.');
      end if;
      if split_part(si.from_address_key, '@', 1) in (
        'info', 'sales', 'hello', 'contact', 'support', 'admin', 'noreply',
        'no-reply', 'marketing', 'team', 'office') then
        blocks := blocks || jsonb_build_object(
          'code', 'role_sender_address',
          'message', 'You cannot send outreach from a shared address like ' || split_part(si.from_address_key, '@', 1) || '@.',
          'fix', 'Send from your own named address.');
      end if;
      if si.domain_registered_at is not null
         and si.domain_registered_at > now() - interval '30 days' then
        blocks := blocks || jsonb_build_object(
          'code', 'domain_too_new',
          'message', 'This domain is less than a month old. Sending from it now would get it blocked.',
          'fix', 'Wait until the domain is at least 30 days old.');
      end if;
    end if;
  end if;

  -- 5. required postal footer
  v_postal_ok := coalesce(nullif(si.postal_line1, ''), nullif(sp.postal_line1, '')) is not null
             and coalesce(nullif(si.postal_country, ''), nullif(sp.postal_country, '')) is not null;
  if not v_postal_ok then
    blocks := blocks || jsonb_build_object(
      'code', 'no_postal_address',
      'message', 'Every marketing or outreach email must show a real postal address for your business. We do not have one.',
      'fix', 'Add your business address once — it goes in the footer automatically.');
  end if;

  -- 6. AUP acceptance
  select exists (
    select 1 from crm.outreach_acceptance oa
     where oa.organization_id = cm.organization_id and oa.lane = v_lane
  ) into v_accepted;
  if not v_accepted then
    blocks := blocks || jsonb_build_object(
      'code', 'aup_not_accepted',
      'message', 'Before your first send, someone in your organization needs to agree to the sending rules.',
      'fix', 'Read and accept the sending rules — it takes a minute.');
  end if;

  return jsonb_build_object(
    'allowed', jsonb_array_length(blocks) = 0,
    'lane', v_lane,
    'blocks', blocks,
    'warnings', warns,
    'resolved', jsonb_build_object(
      'jurisdiction', v_country,
      'confidence', v_conf,
      'method', v_method,
      'jurisdiction_verdict', jp.cold_b2b,
      'jurisdiction_ratified', jp.ratified_at is not null,
      'consent_basis', cm.consent_basis,
      'subscriber_kind', cm.subscriber_kind,
      'list_quality', v_list_quality));
end
$fn$;

revoke all on function crm.check_send_eligibility(uuid, uuid, uuid) from public;
grant execute on function crm.check_send_eligibility(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function crm.check_send_eligibility(uuid, uuid, uuid) is
  'THE ONE SEND AUTHORITY. Every send path asks this and refuses on a block. MX/disposable verification, purchased-list detection, RFC 8058 DKIM coverage, consent, jurisdiction, suppression, sender readiness, postal address, and AUP are floor checks with a fix on every block.';
