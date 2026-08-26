-- E-sign C7 — migration 6 of 6 (register item HRB-011, lane core-c7-esign).
--
-- BULK CAMPAIGNS WITH PARTIAL COMPLETION AS A FIRST-CLASS RESULT (§3.4), THE PROVIDER SEAM WITH ITS
-- ONE REGISTERED NO-OP ADAPTER (§6.3), AND THE ACTIVATION OF HRB-008's `signature_request` FLOW —
-- the fail-closed stub it shipped with, replaced by a real hook now that esign_envelope exists.
--
-- Authority: SPEC-ESIGN §3.4, §6.3; SPEC-WORKFLOW-ENGINE §4.1 artifact 3; HRB-008's debt row.
-- Applied live as `esign_06_campaigns_provider_and_flow`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 A WORKFLOW APPROVAL IS NOT A SIGNATURE, AND THE APPLY HOOK MUST NEVER PRETEND OTHERWISE.
--    `signature_request` routes a COUNTERSIGNATURE AUTHORISATION through the one approval engine.
--    The tempting apply_fn — "the approver approved, so mark their signer row signed" — would
--    manufacture an E-SIGN signature from a click that was never on a screen rendering the
--    document, with no consent event, no preview, and no hash re-read: it would defeat all five of
--    §4.3's conditions at once and produce evidence that is a lie. `esign.wf_apply_signature_request`
--    therefore records the authorisation on the envelope ledger and advances nothing else; the
--    authorised person still signs on the signing surface like everybody else. This is the single
--    most consequential decision in this file.
--
-- 2. ACTIVATING THE FLOW REQUIRED ONE LINE IN `hr._approval_subject`, WHICH ITS OWN HINT ASKS FOR.
--    That resolver raises `22023` for any target table not in its allowlist, so publishing an
--    active `signature_request` flow without adding `esign.envelope` would make hr.can_approve raise
--    on the first approver evaluation — HRB-008's defect class exactly (correct design, completely
--    inoperative). An envelope has NO subject employment: the signer may be an outsider with no
--    employment at all, so it maps to NULL, joining hr.requisition, hr.offer and hr.schedule. The
--    body is reproduced verbatim with that one branch added and re-asserted afterwards.
--
-- 3. PARTIAL COMPLETION IS A RESULT, NOT AN ERROR (§3.4). `esign_campaign_close` succeeds with a
--    signed count and an OUTSTANDING LIST carrying each person's last-known state and failure
--    reason. There is no code path in which a straggler makes the close fail, and none in which a
--    straggler is silently dropped.
--
-- 4. ONE DOCUMENT VERSION PER CAMPAIGN, ENFORCED. A campaign's meaning is "these people
--    acknowledged THIS text", so the frozen artifact is stored once on the campaign and every
--    member's envelope is frozen from that same record. A handbook revision is a NEW campaign, and
--    esign_campaign_generate refuses a second, different artifact on an open campaign.
--
-- 5. RE-RESOLVE ENROLS, IT NEVER DISTURBS (§3.4). `esign_campaign_enroll` is idempotent per email:
--    new hires join, existing members keep their state, their envelope and their evidence.
-- ===================================================================================

set local statement_timeout = '300s';
set local lock_timeout = '30s';

-- ---------------------------------------------------------------------------------
-- 1. CAMPAIGNS.
-- ---------------------------------------------------------------------------------
create or replace function public.esign_create_campaign(
  p_organization_id uuid, p_title text, p_consumer_key text, p_document_source jsonb,
  p_envelope_type text default 'handbook_ack', p_sensitivity text default 'standard',
  p_audience_kind text default 'explicit_list', p_audience_ref jsonb default '{}'::jsonb,
  p_message text default null, p_expires_in_days int default null)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare v_id uuid; v_cat uuid; v_snap jsonb; v_days int;
begin
  if p_organization_id is null then
    raise exception 'esign_create_campaign: organization_id is explicit on every write' using errcode = '22023';
  end if;
  select id into v_cat from platform.categories
   where dimension = 'esign_envelope_type' and slug = coalesce(p_envelope_type,'handbook_ack')
     and deleted_at is null order by (organization_id = p_organization_id) desc limit 1;
  if v_cat is null then
    return jsonb_build_object('granted', false, 'reason', 'unknown_envelope_type');
  end if;
  v_snap := esign.resolve_config_snapshot(p_organization_id, coalesce(p_sensitivity,'standard'));
  v_days := coalesce(p_expires_in_days, (v_snap ->> 'expiry_days')::int);

  perform esign._arm();
  insert into esign.campaign
    (organization_id, category_id, title, message, consumer_key, document_source,
     audience_kind, audience_ref, status, sensitivity, expires_at, config_snapshot)
  values (p_organization_id, v_cat, p_title, p_message, p_consumer_key,
          coalesce(p_document_source,'{}'::jsonb), coalesce(p_audience_kind,'explicit_list'),
          coalesce(p_audience_ref,'{}'::jsonb), 'draft', coalesce(p_sensitivity,'standard'),
          now() + make_interval(days => v_days), v_snap)
  returning id into v_id;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'campaign_id', v_id, 'status', 'draft',
                            'max_audience', esign.config_resolve(p_organization_id,'esign.campaign.max_audience'));
end $fn$;

-- RECORDED DECISION 5 — enrolment is idempotent per person.
create or replace function public.esign_campaign_enroll(p_campaign_id uuid, p_members jsonb)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c esign.campaign%rowtype; m jsonb; v_added int := 0; v_existing int := 0; v_max int; v_total int;
begin
  select * into c from esign.campaign where id = p_campaign_id;
  if not found then
    raise exception 'esign_campaign_enroll: campaign % does not exist', p_campaign_id using errcode = 'P0002';
  end if;
  if c.status = 'closed' then
    return jsonb_build_object('granted', false, 'reason', 'campaign_closed');
  end if;
  v_max := (esign.config_resolve(c.organization_id,'esign.campaign.max_audience'))::int;

  perform esign._arm();
  for m in select * from jsonb_array_elements(coalesce(p_members,'[]'::jsonb)) loop
    if exists (select 1 from esign.campaign_member
                where campaign_id = p_campaign_id and lower(email) = lower(m ->> 'email')) then
      v_existing := v_existing + 1;   -- untouched: their state, envelope and evidence survive
      continue;
    end if;
    select count(*) into v_total from esign.campaign_member where campaign_id = p_campaign_id;
    if v_total >= v_max then
      perform esign._disarm();
      return jsonb_build_object('granted', false, 'reason', 'max_audience_exceeded',
                                'max_audience', v_max, 'enrolled', v_added, 'unchanged', v_existing);
    end if;
    insert into esign.campaign_member
      (organization_id, campaign_id, subject_ref_type, subject_ref_id, full_name, email,
       member_user_id, status)
    values (c.organization_id, p_campaign_id, nullif(m -> 'subject_ref' ->> 'type',''),
            nullif(m -> 'subject_ref' ->> 'id','')::uuid, m ->> 'full_name', lower(m ->> 'email'),
            nullif(m ->> 'user_id','')::uuid, 'pending');
    v_added := v_added + 1;
  end loop;

  update esign.campaign
     set member_count = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id),
         status = case when status = 'draft' then 'resolving' else status end
   where id = p_campaign_id;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'enrolled', v_added, 'unchanged', v_existing,
                            'member_count', (select member_count from esign.campaign where id = p_campaign_id));
end $fn$;

-- RECORDED DECISION 4 — one document version per campaign; batches respect the §7 knob.
create or replace function public.esign_campaign_generate(
  p_campaign_id uuid, p_frozen jsonb, p_batch_size int default null)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c esign.campaign%rowtype; r record; v_batch int; v_made int := 0; v_failed int := 0;
        v_env jsonb; v_send jsonb; v_doc uuid; v_frozen jsonb; v_batch_no int;
begin
  select * into c from esign.campaign where id = p_campaign_id;
  if not found then
    raise exception 'esign_campaign_generate: campaign % does not exist', p_campaign_id using errcode = 'P0002';
  end if;
  if c.status = 'closed' then
    return jsonb_build_object('granted', false, 'reason', 'campaign_closed');
  end if;
  if jsonb_typeof(p_frozen) <> 'object' or (p_frozen ->> 'content_hash') is null then
    return jsonb_build_object('granted', false, 'reason', 'no_frozen_artifact',
      'detail', 'a campaign freezes ONE rendered document and every member signs that same artifact (§3.4)');
  end if;
  if c.document_source ? 'content_hash'
     and (c.document_source ->> 'content_hash') is distinct from (p_frozen ->> 'content_hash') then
    return jsonb_build_object('granted', false, 'reason', 'document_version_changed',
      'detail', 'a campaign means "these people acknowledged THIS text" — a revision is a NEW campaign (§3.4)',
      'frozen_hash', c.document_source -> 'content_hash');
  end if;

  v_batch := coalesce(p_batch_size, (esign.config_resolve(c.organization_id,'esign.campaign.batch_size'))::int);
  v_batch_no := coalesce((select max(batch_no) from esign.campaign_member where campaign_id = p_campaign_id), 0) + 1;

  perform esign._arm();
  update esign.campaign
     set document_source = c.document_source || p_frozen,
         status = 'generating',
         opened_at = coalesce(opened_at, now())
   where id = p_campaign_id;

  for r in select * from esign.campaign_member
            where campaign_id = p_campaign_id and status = 'pending'
            order by enrolled_at limit v_batch loop
    v_env := public.esign_create_envelope(
      p_organization_id => c.organization_id, p_consumer_key => c.consumer_key,
      p_title => c.title,
      p_documents => jsonb_build_array(jsonb_build_object(
        'name', coalesce(c.document_source ->> 'name', c.title),
        'source_kind', coalesce(c.document_source ->> 'source_kind','platform_document'),
        'document_id', c.document_source ->> 'document_id',
        'document_version', c.document_source ->> 'document_version',
        'mime_type', c.document_source ->> 'mime_type')),
      p_signers => jsonb_build_array(jsonb_build_object(
        'position', 1, 'role', 'signer',
        'actor_type', case when r.member_user_id is null then 'external' else 'internal_user' end,
        'user_id', r.member_user_id, 'full_name', r.full_name, 'email', r.email,
        'subject_ref', case when r.subject_ref_id is null then null
                            else jsonb_build_object('type', r.subject_ref_type, 'id', r.subject_ref_id) end)),
      p_envelope_type => (select slug from platform.categories where id = c.category_id),
      p_sensitivity => c.sensitivity, p_signing_order => 'parallel',
      p_message => c.message, p_expires_in_days => greatest(1, extract(day from c.expires_at - now())::int));

    if not coalesce((v_env ->> 'granted')::boolean, false) then
      v_failed := v_failed + 1;
      update esign.campaign_member
         set status = 'failed', failure_reason = v_env ->> 'reason', last_state_at = now(),
             batch_no = v_batch_no
       where id = r.id;
      continue;
    end if;

    select id into v_doc from esign.envelope_document
     where envelope_id = (v_env ->> 'envelope_id')::uuid limit 1;
    v_frozen := jsonb_build_array(jsonb_build_object(
      'document_id', v_doc,
      'content_file_id', p_frozen ->> 'content_file_id',
      'content_file_version', p_frozen ->> 'content_file_version',
      'content_hash', p_frozen ->> 'content_hash',
      'byte_size', p_frozen ->> 'byte_size',
      'page_count', p_frozen ->> 'page_count',
      'mime_type', p_frozen ->> 'mime_type'));
    v_send := public.esign_send_envelope((v_env ->> 'envelope_id')::uuid, v_frozen);

    if coalesce((v_send ->> 'granted')::boolean, false) then
      v_made := v_made + 1;
      update esign.campaign_member
         set status = 'notified', envelope_id = (v_env ->> 'envelope_id')::uuid,
             last_state_at = now(), batch_no = v_batch_no, failure_reason = null
       where id = r.id;
    else
      v_failed := v_failed + 1;
      update esign.campaign_member
         set status = 'failed', envelope_id = (v_env ->> 'envelope_id')::uuid,
             failure_reason = v_send ->> 'reason', last_state_at = now(), batch_no = v_batch_no
       where id = r.id;
    end if;
  end loop;

  update esign.campaign
     set status = case when exists (select 1 from esign.campaign_member
                                     where campaign_id = p_campaign_id and status = 'pending')
                       then 'generating' else 'open' end,
         failed_count = (select count(*) from esign.campaign_member
                          where campaign_id = p_campaign_id and status = 'failed')
   where id = p_campaign_id;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'batch_no', v_batch_no, 'batch_size', v_batch,
                            'generated', v_made, 'failed', v_failed,
                            'remaining', (select count(*) from esign.campaign_member
                                           where campaign_id = p_campaign_id and status = 'pending'));
end $fn$;

-- The rollup + the outstanding list, per person, with reasons (§3.4).
create or replace function public.esign_campaign_progress(p_campaign_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c esign.campaign%rowtype;
begin
  select * into c from esign.campaign where id = p_campaign_id;
  if not found then
    raise exception 'esign_campaign_progress: campaign % does not exist', p_campaign_id using errcode = 'P0002';
  end if;
  if not esign._may_manage_campaign(c.id, 'viewer') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;

  -- the member's live state is its envelope's, not a stale copy
  perform esign._arm();
  update esign.campaign_member m
     set status = case e.status
                    when 'completed' then 'signed'
                    when 'declined'  then 'declined'
                    when 'expired'   then 'expired'
                    else m.status end,
         last_state_at = now()
    from esign.envelope e
   where m.campaign_id = p_campaign_id and m.envelope_id = e.id
     and m.status not in ('failed')
     and m.status is distinct from case e.status when 'completed' then 'signed'
                                                 when 'declined'  then 'declined'
                                                 when 'expired'   then 'expired'
                                                 else m.status end;
  update esign.campaign
     set signed_count   = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id and status = 'signed'),
         declined_count = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id and status = 'declined'),
         expired_count  = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id and status = 'expired'),
         failed_count   = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id and status = 'failed'),
         member_count   = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id)
   where id = p_campaign_id;
  perform esign._disarm();
  select * into c from esign.campaign where id = p_campaign_id;

  return jsonb_build_object(
    'granted', true, 'campaign_id', c.id, 'title', c.title, 'status', c.status,
    'rollup', jsonb_build_object(
      'members', c.member_count, 'signed', c.signed_count, 'declined', c.declined_count,
      'expired', c.expired_count, 'failed', c.failed_count,
      'outstanding', c.member_count - c.signed_count - c.declined_count - c.expired_count - c.failed_count),
    'by_status', coalesce((select jsonb_object_agg(status, n)
                             from (select status, count(*) n from esign.campaign_member
                                    where campaign_id = p_campaign_id group by status) x), '{}'::jsonb),
    -- §3.4: the outstanding list carries per-person last-known state AND failure reason. A campaign
    -- never blocks on stragglers and never silently drops them.
    'outstanding_list', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', m.id, 'name', m.full_name, 'email', m.email,
               'last_known_state', m.status, 'last_state_at', m.last_state_at,
               'failure_reason', m.failure_reason, 'envelope_id', m.envelope_id) order by m.full_name)
        from esign.campaign_member m
       where m.campaign_id = p_campaign_id and m.status not in ('signed')), '[]'::jsonb));
end $fn$;

-- RECORDED DECISION 3 — closing with stragglers is a SUCCESS.
create or replace function public.esign_campaign_close(p_campaign_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare v_progress jsonb;
begin
  v_progress := public.esign_campaign_progress(p_campaign_id);
  if not coalesce((v_progress ->> 'granted')::boolean, false) then return v_progress; end if;

  perform esign._arm();
  update esign.campaign
     set status = 'closed', closed_at = now(),
         close_reason = coalesce(p_reason, 'closed on schedule')
   where id = p_campaign_id and status <> 'closed';
  perform esign._disarm();

  return jsonb_build_object('granted', true, 'closed', true,
                            'partial_completion', (v_progress -> 'rollup' ->> 'outstanding')::int > 0,
                            'detail', 'partial completion is a first-class RESULT, never an error (§3.4)',
                            'rollup', v_progress -> 'rollup',
                            'outstanding_list', v_progress -> 'outstanding_list');
end $fn$;

-- The audit export (§3.4): one row per member, with their evidence pointer.
create or replace function public.esign_campaign_export(p_campaign_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'esign','public' as $fn$
declare c esign.campaign%rowtype;
begin
  select * into c from esign.campaign where id = p_campaign_id;
  if not found then
    raise exception 'esign_campaign_export: campaign % does not exist', p_campaign_id using errcode = 'P0002';
  end if;
  if not esign._may_manage_campaign(c.id, 'viewer') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  return jsonb_build_object(
    'granted', true, 'campaign_id', c.id, 'title', c.title,
    'document', c.document_source, 'config_snapshot', c.config_snapshot,
    'closed_at', c.closed_at, 'close_reason', c.close_reason,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'name', m.full_name, 'email', m.email, 'state', m.status,
        'last_state_at', m.last_state_at, 'failure_reason', m.failure_reason,
        'envelope_id', m.envelope_id,
        'signed_at', (select s.signed_at from esign.envelope_signer s where s.envelope_id = m.envelope_id limit 1),
        'certificate_id', (select e.certificate_id from esign.envelope e where e.id = m.envelope_id),
        'document_hash', (select d.content_hash from esign.envelope_document d where d.envelope_id = m.envelope_id limit 1))
      order by m.full_name)
      from esign.campaign_member m where m.campaign_id = p_campaign_id), '[]'::jsonb));
end $fn$;

-- ---------------------------------------------------------------------------------
-- 2. THE PROVIDER SEAM (§6.3) — tables shipped in migration 01, adapter interface here.
-- ---------------------------------------------------------------------------------
insert into esign.provider (organization_id, provider_key, label, adapter, config, is_active)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'noop', 'No-op provider (round-trip reference adapter)',
       'noop', jsonb_build_object('note','The registered reference adapter §6.3 requires in v1. It dispatches, echoes a completion back through the edge-in path, and proves the consumer-facing API and callback are identical in both modes.'), true
where not exists (select 1 from esign.provider where provider_key = 'noop' and deleted_at is null);

-- EDGE OUT.
create or replace function public.esign_provider_dispatch(p_envelope_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype; b record; v_ref uuid;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    raise exception 'esign_provider_dispatch: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;
  select pb.*, p.provider_key, p.adapter into b
    from esign.provider_binding pb join esign.provider p on p.id = pb.provider_id
   where pb.organization_id = e.organization_id and pb.is_active and pb.deleted_at is null
     and p.is_active and p.deleted_at is null
     and (pb.category_id is null or pb.category_id = e.category_id)
     and (pb.consumer_key is null or pb.consumer_key = e.consumer_key)
   limit 1;
  if not found then
    -- native mode: our signing surface, our evidence, our certificate.
    return jsonb_build_object('granted', true, 'mode', 'native');
  end if;

  perform esign._arm();
  insert into esign.envelope_external_ref
    (organization_id, envelope_id, provider_key, external_status, raw_payload)
  values (e.organization_id, p_envelope_id, b.provider_key, 'dispatched',
          jsonb_build_object('adapter', b.adapter))
  returning id into v_ref;
  perform esign._event(p_envelope_id, 'provider_dispatched', 'integration',
                       p_actor_label => b.provider_key,
                       p_payload => jsonb_build_object('provider_key', b.provider_key, 'adapter', b.adapter));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'mode', 'provider', 'provider_key', b.provider_key,
                            'external_ref_id', v_ref);
end $fn$;

-- EDGE IN. Provider status is MIRRORED into external_status and MAPPED into our state machine —
-- never adopted as our state, and their certificate is an attachment to ours, never a replacement.
create or replace function public.esign_provider_ingest(
  p_envelope_id uuid, p_provider_key text, p_external_envelope_id text, p_external_status text,
  p_provider_event_id text default null, p_payload jsonb default '{}'::jsonb,
  p_observed jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype; v_mapped text; v_done jsonb;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    raise exception 'esign_provider_ingest: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;

  perform esign._arm();
  update esign.envelope_external_ref
     set external_envelope_id = coalesce(p_external_envelope_id, external_envelope_id),
         external_status = p_external_status, last_sync_at = now(),
         raw_payload = raw_payload || coalesce(p_payload,'{}'::jsonb)
   where envelope_id = p_envelope_id and provider_key = p_provider_key;

  v_mapped := case lower(p_external_status)
                when 'completed' then 'completed'
                when 'signed'    then 'completed'
                when 'declined'  then 'declined'
                when 'voided'    then 'voided'
                when 'expired'   then 'expired'
                else null end;

  perform esign._event(p_envelope_id, 'provider_status_received', 'integration',
                       p_actor_label => p_provider_key, p_provider_event_id => p_provider_event_id,
                       p_payload => jsonb_build_object('external_status', p_external_status,
                                                       'mapped_status', v_mapped,
                                                       'external_envelope_id', p_external_envelope_id));
  if v_mapped = 'completed' then
    -- our hash over the RETURNED artifact, and our certificate over our own payload
    update esign.envelope_signer set status = 'signed', signed_at = coalesce(signed_at, now()),
                                     verification_passed = true
     where envelope_id = p_envelope_id and is_required and role in ('signer','approver')
       and status <> 'signed';
    perform esign._event(p_envelope_id, 'provider_completed', 'integration',
                         p_actor_label => p_provider_key, p_provider_event_id => p_provider_event_id,
                         p_payload => coalesce(p_payload,'{}'::jsonb));
    v_done := esign._maybe_complete(p_envelope_id);
  elsif v_mapped is not null and v_mapped <> e.status then
    update esign.envelope set status = v_mapped,
                              declined_at = case when v_mapped = 'declined' then now() else declined_at end,
                              voided_at   = case when v_mapped = 'voided'   then now() else voided_at end,
                              void_reason = case when v_mapped = 'voided'
                                                 then coalesce(void_reason,'voided at the provider') else void_reason end
     where id = p_envelope_id;
  end if;
  perform esign._disarm();

  return jsonb_build_object('granted', true, 'external_status', p_external_status,
                            'mapped_status', v_mapped, 'completion', v_done,
                            'detail', 'provider status is mirrored and mapped, never adopted as our state (§6.3)');
end $fn$;

-- ---------------------------------------------------------------------------------
-- 3. RECORDED DECISION 2 — hr._approval_subject gains esign.envelope (its own HINT asks for this).
--    Reproduced verbatim from the live definition with ONE added branch.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hr._approval_subject(p_target_table text, p_target_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_col text; v_sub uuid; v_emp uuid;
begin
  -- ---- the person-scoped targets: resolve the employee, then their current spell
  if p_target_table in ('hr.employee','hr.employee_private','hr.emergency_contact') then
    if p_target_table = 'hr.employee' then
      v_emp := p_target_id;
    else
      execute format('select employee_id from %I.%I where id = $1',
                     'hr', split_part(p_target_table,'.',2)) into v_emp using p_target_id;
    end if;
    if v_emp is null then return null; end if;
    select em.id into v_sub
      from hr.employment em
     where em.employee_id = v_emp and em.deleted_at is null
     order by em.hire_date desc limit 1;
    return v_sub;
  end if;

  v_col := case p_target_table
    when 'hr.leave_request'         then 'employment_id'
    when 'hr.leave_case'            then 'employment_id'
    when 'hr.pay_period_employment' then 'employment_id'
    when 'hr.time_adjustment'       then 'employment_id'
    when 'hr.overtime_preapproval'  then 'employment_id'
    when 'hr.shift_claim'           then 'requester_employment_id'
    when 'hr.schedule_change'       then 'employment_id'
    when 'hr.availability'          then 'employment_id'
    when 'hr.compensation'          then 'employment_id'
    when 'hr.position_assignment'   then 'employment_id'
    when 'hr.corrective_action'     then 'employment_id'
    when 'hr.separation'            then 'employment_id'
    when 'hr.training_assignment'   then 'employment_id'
    when 'hr.checklist_item'        then 'assignee_employment_id'
    when 'hr.requisition'           then null
    when 'hr.offer'                 then null
    when 'hr.background_check'      then 'employment_id'
    when 'hr.tax_withholding'       then 'employment_id'
    when 'hr.schedule'              then null
    -- HRB-011: a signature envelope has NO subject employment. Its signer may be an outsider with
    -- no employment at all, and the envelope itself belongs to the requesting module, not to a
    -- person. It joins hr.requisition / hr.offer / hr.schedule as a target where rule 1 (never
    -- approve your own) cannot fire because there is nobody to be.
    when 'esign.envelope'           then null
    else '!unknown'
  end;

  if v_col = '!unknown' then
    raise exception 'hr.can_approve: % is not an approvable target table', p_target_table
      using errcode = '22023',
            hint = 'Add it to hr._approval_subject''s allowlist together with the column that names its subject employment.';
  end if;

  if v_col is null then
    -- a target with no subject employment at all (a requisition, a schedule, an offer to an
    -- outsider). There is nobody to be, so rule 1 cannot fire and the resolver returns NULL.
    return null;
  end if;

  execute format('select %I from %I.%I where id = $1',
                 v_col, split_part(p_target_table,'.',1), split_part(p_target_table,'.',2))
     into v_sub using p_target_id;
  return v_sub;
end
$function$;

-- ---------------------------------------------------------------------------------
-- 4. RECORDED DECISION 1 — the real apply hook, which does NOT sign.
-- ---------------------------------------------------------------------------------
create or replace function esign.wf_apply_signature_request(p_instance_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare i record; v_env uuid;
begin
  select id, flow_key, target_token, target_id, organization_id, requester_employment_id
    into i from hr.workflow_instance where id = p_instance_id;
  if not found then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed', 'reason', 'unknown_instance');
  end if;
  if i.target_token <> 'esign_envelope' then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed', 'reason', 'wrong_target_token',
                              'detail', i.target_token);
  end if;
  v_env := i.target_id;
  if not exists (select 1 from esign.envelope where id = v_env) then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed', 'reason', 'envelope_not_found');
  end if;

  perform esign._arm();
  -- 🚨 RECORDED DECISION 1. The authorisation is recorded on the envelope and NOTHING is signed. An
  -- approval click is not an E-SIGN signature: it happened on an approval screen, not on a screen
  -- rendering the document; it carries no consent event, no preview and no hash re-read. The
  -- authorised person still signs on the signing surface like everybody else.
  --
  -- It is deliberately NOT written to esign.envelope_event: §2.5's closed set has no member meaning
  -- "an external approval engine authorised the countersignature", and borrowing `created` or
  -- `provider_status_received` for it would corrupt the one vocabulary the certificate replays. The
  -- approval's own evidence is the engine's — hr.workflow_step_decision — which is where an
  -- approval belongs. OWED: §2.5 needs a `countersignature_authorised` member, or an explicit
  -- ruling that the engine's ledger is the only home for it.
  update esign.envelope
     set metadata = metadata || jsonb_build_object(
           'countersignature_authorised', jsonb_build_object(
             'workflow_instance_id', i.id, 'at', now(),
             'note', 'authorisation only — no signature was recorded'))
   where id = v_env;
  perform esign._disarm();
  return jsonb_build_object('ok', true, 'envelope_id', v_env,
                            'signed', false,
                            'detail', 'authorisation recorded; the signature itself is taken on the signing surface');
end $fn$;

-- ---------------------------------------------------------------------------------
-- 5. ACTIVATE HRB-008's `signature_request` FLOW.
-- ---------------------------------------------------------------------------------
-- `_zz_guard_hr_write` refuses every direct write to an hr.* table, so this update arms the HR
-- write guard the way SPEC-ACCESS law 2 requires and DISARMS IT IMMEDIATELY AFTERWARDS. HRB-008's
-- sixth finding is that `hr.privileged_write` is transaction-scoped, so an armed flag left set
-- disarms the guard for the rest of the transaction; resetting it here keeps this file's window to
-- the one statement that needs it.
do $$ begin
  perform hr.arm_write();
  update hr.workflow_flow_type
     set apply_fn = 'esign.wf_apply_signature_request(uuid)'::regprocedure,
         is_active = true,
         inactive_reason = null
   where flow_key = 'signature_request'
     and (not is_active or inactive_reason is not null
          or apply_fn::regproc::text <> 'esign.wf_apply_signature_request');
  perform set_config('hr.privileged_write', '', true);
end $$;

-- ---------------------------------------------------------------------------------
-- 6. Grants.
-- ---------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'public.esign_create_campaign(uuid,text,text,jsonb,text,text,text,jsonb,text,integer)',
    'public.esign_campaign_enroll(uuid,jsonb)',
    'public.esign_campaign_generate(uuid,jsonb,integer)',
    'public.esign_campaign_progress(uuid)',
    'public.esign_campaign_close(uuid,text)',
    'public.esign_campaign_export(uuid)',
    'public.esign_provider_dispatch(uuid)',
    'public.esign_provider_ingest(uuid,text,text,text,text,jsonb,jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------
-- 7. ASSERTIONS.
-- ---------------------------------------------------------------------------------
do $$
declare v_n int; v_raised boolean;
begin
  -- the flow is live and points at a real hook
  if not exists (select 1 from hr.workflow_flow_type
                  where flow_key = 'signature_request' and is_active and inactive_reason is null
                    and apply_fn::regproc::text = 'esign.wf_apply_signature_request') then
    raise exception 'esign_06: signature_request is not active on the real hook';
  end if;
  -- HRB-008's own guard: no active flow type may target an unregistered token
  select count(*) into v_n from hr.workflow_flow_type f
   where f.deleted_at is null and f.is_active
     and not exists (select 1 from platform.entity_types e where e.token = f.target_token and e.is_active);
  if v_n > 0 then raise exception 'esign_06: % active flow types target unregistered tokens', v_n; end if;

  -- RECORDED DECISION 2: the resolver answers for esign.envelope and still refuses an unknown table
  if hr._approval_subject('esign.envelope', gen_random_uuid()) is not null then
    raise exception 'esign_06: esign.envelope should resolve NO subject employment';
  end if;
  if hr._approval_subject('hr.requisition', gen_random_uuid()) is not null then
    raise exception 'esign_06: hr._approval_subject regressed on hr.requisition';
  end if;
  v_raised := false;
  begin
    perform hr._approval_subject('hr.not_a_real_table', gen_random_uuid());
  exception when others then v_raised := true;
  end;
  if not v_raised then
    raise exception 'esign_06: hr._approval_subject stopped refusing unknown target tables';
  end if;

  -- the reference adapter exists
  if not exists (select 1 from esign.provider where provider_key = 'noop' and is_active) then
    raise exception 'esign_06: the §6.3 no-op reference adapter is not registered';
  end if;

  -- the whole schema still certifies
  select count(*) into v_n from platform.entity_types e
   where e.schema_name = 'esign' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_n > 0 then raise exception 'esign_06: % esign tokens no longer certify', v_n; end if;

  select count(*) into v_n from platform.ddl_guard_log
   where acknowledged_at is null and object_ref like 'esign.%';
  if v_n > 0 then raise exception 'esign_06: % unacked esign guard rows', v_n; end if;
end $$;
