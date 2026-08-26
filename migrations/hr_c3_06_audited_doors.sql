-- HR domain C3 — migration 6 of 7 (register item HRB-007, lane core-c3-access).
--
-- THE AUDITED READ PATH. hr_confidential_get / _list, hr_restricted_get / _list, hr_break_glass,
-- hr_access_explain, hr_access_audit_query, hr_incident_status — and the UPGRADE of
-- hr.read_confidential and hr.reveal_ssn from fail-closed stubs to the real derived-role gate.
--
-- Authority: SPEC-ACCESS §3.1, §3.1a, §3.2, §4.1–§4.7, §5, §14 (SPEC-DATA-MODEL).
-- Applied live as `hr_c3_06_audited_doors`. Idempotent.
--
-- ===================================================================================
-- 🚨 THE REFUSAL-ENVELOPE LAW, INHERITED AND OBEYED WITHOUT EXCEPTION.
-- Core tranche 4 proved it live: an audit row written inside a SECURITY DEFINER function and then
-- followed by a RAISE is ROLLED BACK WITH THE EXCEPTION, because Postgres has no autonomous
-- transactions. A door that writes `granted = false` and then raises therefore logs NOTHING — and
-- a denial log that records only the denials which did not happen is worse than no log, because it
-- reads as evidence. Every door below RETURNS `{granted:false, reason, audit_id}`; the envelope
-- NEVER carries a row payload; `audit_id` comes back on both paths so a caller (and a test) can
-- prove the row was written. A RAISE is still correct for a PROGRAMMING error — an unknown token,
-- a malformed argument — because nothing was audited and nothing is being refused.
-- REFUSAL IS DATA; BREAKAGE IS AN EXCEPTION.
--
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 BREAK-GLASS IS CHECKED BY THE DOOR, NOT BY RLS — and §4.3 cannot mean anything else.
--    §4.3 says break-glass "writes a real, time-boxed iam.permissions grant … so the person can
--    actually do the work". But every table it can be used on is the `restricted` variant, whose
--    generated std_select is `deleted_at is null and (created_by = auth.uid() or is_super_admin())`
--    — there is NO has_access lane, so an iam.permissions row on a restricted token confers
--    exactly nothing through RLS. The grant is therefore what the DOOR consults: the audited RPCs
--    admit a live break-glass grant as an alternative basis, stamped `basis='break_glass'`. The
--    grant is still real, still time-boxed by `expires_at`, and still killed by the clock with no
--    job running — which is precisely what G-EXPIRES had to prove first.
--    OWED: §4.3 owes one sentence saying the grant is read by the door.
--
-- 2. THE TOKEN MAP IS A STATIC ALLOWLIST INSIDE THE FUNCTION AND IT IS FAIL-CLOSED. §4.2 requires
--    it ("p_token never interpolates into dynamic SQL; an unknown token raises 22023"). An
--    unlisted token is a RAISE, not a refusal envelope: nothing was reached and nothing is being
--    refused — the caller asked for something that does not exist.
--
-- 3. `hr_eeo_response` HAS NO `get` AND NO `list`, AND THE MAP SAYS SO BY NAME. §4.4 makes the
--    guarantee structural: "no individual read function is ever written", so the FEATURE-TREE's
--    "EEO self-ID segregated, aggregate-only" is enforced by the ABSENCE of code, which no
--    configuration mistake can undo. The map carries the token with a null capability set and a
--    reason, so a future maintainer meets the refusal deliberately rather than adding a row.
--
-- 4. THE SECRET-BEARING TOKENS HAVE NO DOOR AT ALL. `hr_kiosk_device`, `hr_kiosk_session` and
--    `hr_employment_pin` are §3.2's "never client-readable" row: W (RPC) only. They are absent
--    from the map for the same reason as EEO — by construction, not by configuration.
--
-- 5. §3.1a's CLASSES ARE THE LIVE `note_kind` SEVEN, NOT THE SPEC'S FIVE (recorded in file 1,
--    restated here because this is where it BITES). The reach map below is written against
--    investigation | witness_statement | medical_certification | accommodation_detail |
--    background_result | legal_advice | executive_only, is fail-closed on anything else, and gives
--    `legal_advice` / `executive_only` to hr_owner only with NO break-glass. §3.1a's `reference`
--    class has no live value and is therefore unreachable rather than silently mapped onto
--    something adjacent.
--
-- 6. `hr.performance_review` AND `hr.interview_feedback` ARE NOT IN THE MAP BECAUSE THEY DO NOT
--    EXIST. §3.1 names both; live, performance reviews belong to the performance-reviews node
--    (unbuilt) and the interview-feedback table shipped as `hr.scorecard`. `hr_scorecard` IS
--    mapped, under the blind-until-submitted rule §3.2 gives interview feedback.
--    OWED: §3.1/§3.2 owe the `hr.interview_feedback` → `hr.scorecard` rename.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ §4.2 the static token allowlist
-- Returns the tier and the ANY-OF capability set that opens this token's door. A NULL capability
-- array means "no read door exists at all" (RECORDED DECISIONS 3 and 4) and is distinct from an
-- empty one.
create or replace function hr._door_spec(p_token text)
returns table (tier text, caps text[], allows_break_glass boolean, no_door_reason text)
language plpgsql immutable
as $fn$
begin
  return query
  -- the projection is explicit: `select *` would return the lookup key as the first column and the
  -- declared result type would not match it
  select m.tier, m.caps, m.bg, m.reason from (values
    -- ---------- Confidential tier
    ('hr_employee_private',      'confidential', array['identity.read'],                              true,  null::text),
    ('hr_compensation',          'confidential', array['comp.read'],                                  true,  null),
    ('hr_emergency_contact',     'confidential', array['identity.read','working_record.read'],        true,  null),
    ('hr_separation',            'confidential', array['working_record.read'],                        true,  null),
    ('hr_corrective_action',     'confidential', array['working_record.read','corrective_action.issue'], true, null),
    ('hr_background_check',      'confidential', array['background_check.adjudicate','candidate.read','working_record.read'], true, null),
    ('hr_employer_profile',      'confidential', array['working_record.read'],                        true,  null),
    ('hr_tax_withholding',       'confidential', array['identity.read','payroll.export'],             true,  null),
    ('hr_i9',                    'confidential', array['identity.read'],                              true,  null),
    ('hr_offer',                 'confidential', array['candidate.read','requisition.manage'],        true,  null),
    ('hr_reference_check',       'confidential', array['candidate.read'],                             true,  null),
    ('hr_records_request',       'confidential', array['records.govern','identity.read'],             true,  null),
    ('hr_verification_letter_request','confidential', array['identity.read'],                         true,  null),
    ('hr_ai_evidence',           'confidential', array['audit.read','records.govern'],                true,  null),
    ('hr_legal_hold',            'confidential', array['records.govern'],                             true,  null),
    ('hr_scorecard',             'confidential', array['candidate.read'],                             false, null),
    -- ---------- Restricted tier
    ('hr_restricted_note',       'restricted',   array['__per_note_kind__'],                          true,  null),
    ('hr_incident',              'restricted',   array['incident.read'],                              false, null),
    ('hr_incident_party',        'restricted',   array['incident.read'],                              false, null),
    ('hr_accommodation_request', 'restricted',   array['medical.read'],                               false, null),
    ('hr_leave_case',            'restricted',   array['medical.read'],                               false, null),
    -- ---------- structurally doorless (RECORDED DECISIONS 3 and 4)
    ('hr_eeo_response',          'restricted',   null::text[],                                        false,
     'SPEC-ACCESS §4.4: no individual read function is ever written for EEO self-identification. The only reader is hr.eeo_aggregate, which suppresses any cell below hr.hiring.eeo_min_cell. The guarantee is the ABSENCE of code, which no configuration mistake can undo.'),
    ('hr_employment_pin',        'restricted',   null::text[],                                        false,
     'SPEC-ACCESS §3.2: never client-readable. A PIN hash has no read path; it is verified, never returned.'),
    ('hr_kiosk_device',          'restricted',   null::text[],                                        false,
     'SPEC-ACCESS §3.2: never client-readable. The device secret hash has no read path.'),
    ('hr_kiosk_session',         'restricted',   null::text[],                                        false,
     'SPEC-ACCESS §3.2: never client-readable.'),
    ('hr_access_audit',          'restricted',   null::text[],                                        false,
     'SPEC-ACCESS §4.7: read through hr_access_audit_query only, which applies the audit.read gate plus the subject''s own lane and audits itself once per query.')
  ) as m(token, tier, caps, bg, reason)
  where m.token = p_token;
end
$fn$;

-- ============================================================ §3.1a reach per note class
create or replace function hr._note_kind_caps(p_note_kind text)
returns table (caps text[], allows_break_glass boolean, veto_applies boolean)
language plpgsql immutable
as $fn$
begin
  return query
  select m.caps, m.bg, m.veto from (values
    -- 🚨 A MERGED TABLE MUST NOT BECOME A MERGED PERMISSION. An employee_relations investigator
    -- must never read a medical narrative because both happen to be rows in hr.restricted_note.
    ('investigation',        array['incident.read','incident.investigate'], false, true),
    ('witness_statement',    array['incident.read','incident.investigate'], false, true),
    -- medical: never employee_relations, never a manager, and BREAK-GLASS IS NOT PERMITTED —
    -- otherwise the merged table would make the medical wall a formality (§3.1a).
    ('medical_certification',array['medical.read'],                          false, false),
    ('accommodation_detail', array['medical.read'],                          false, false),
    ('background_result',    array['background_check.adjudicate'],           false, false),
    -- neither class exists in §3.1a; fail-closed to the owner rather than to the widest lane
    ('legal_advice',         array['records.govern'],                        false, false),
    ('executive_only',       array['role.assign'],                           false, false)
  ) as m(k, caps, bg, veto) where m.k = p_note_kind;
end
$fn$;

-- ============================================================ §4.3 the break-glass basis
create or replace function hr._break_glass_active(p_user uuid, p_token text, p_id uuid)
returns boolean
language sql stable security definer set search_path = hr, public
as $fn$
  select exists (
    select 1 from hr.derived_grant dg
      join iam.permissions p on p.id = dg.permission_id
     where dg.reason = 'break_glass'
       and dg.resource_type = p_token
       and dg.resource_id = p_id
       and dg.grantee_user_id = p_user
       and (p.expires_at is null or p.expires_at > now()));
$fn$;

revoke all on function hr._break_glass_active(uuid, text, uuid) from public;
grant execute on function hr._break_glass_active(uuid, text, uuid) to service_role;

-- ============================================================ the projection
-- §4.6: project the row MINUS platform.entity_types.client_excluded_columns. Stated limits
-- honestly: this is a projection convention, NOT a security boundary — a definer function or a
-- privileged session still sees the column. It is defence-in-depth on top of the `restricted`
-- wall, and it is what stops a well-meaning `select *` in a future RPC leaking ciphertext into a
-- client payload.
create or replace function hr._project_row(p_token text, p_schema text, p_table text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_row jsonb; c text;
begin
  execute format('select to_jsonb(t) from %I.%I t where t.id = $1', p_schema, p_table)
     into v_row using p_id;
  if v_row is null then return null; end if;
  foreach c in array coalesce(
      (select client_excluded_columns from platform.entity_types where token = p_token), '{}'::text[])
  loop
    v_row := v_row - c;
  end loop;
  return v_row;
end
$fn$;

revoke all on function hr._project_row(text, text, text, uuid) from public;
grant execute on function hr._project_row(text, text, text, uuid) to service_role;

-- ============================================================ the ONE gate every door runs
-- Returns a jsonb verdict: {allowed, basis, is_self, subject_employment_id, org, reason}.
-- 🚨 IT GATES ON hr.capability() AND NEVER ON iam.has_access. iam.has_access_for_base arm 9 grants
-- viewer to ANY org owner/admin on ANY row in the org regardless of visibility (read live, and
-- re-proven by this lane's own probe: an org admin reads hr_employment and is meant to), so
-- routing an audited-tier gate through it would silently hand every org admin the medical file.
create or replace function hr._door_verdict(
  p_user uuid, p_token text, p_id uuid, p_break_glass boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare
  d record; v_schema text; v_table text; v_org uuid; v_subject uuid; v_owner uuid;
  v_caps text[]; v_bg_ok boolean; v_note_kind text; nk record; v_is_self boolean := false;
  v_cap text; v_allowed boolean := false; v_basis text; v_veto boolean := false;
begin
  select * into d from hr._door_spec(p_token);
  if not found then
    raise exception 'hr audited door: % is not an audited-tier token', p_token
      using errcode = '22023',
            hint = 'Add it to hr._door_spec with the capability set that opens it. An unlisted token is refused by construction.';
  end if;
  if d.caps is null then
    return jsonb_build_object('allowed', false, 'basis', 'no_door', 'reason', d.no_door_reason,
                              'tier', d.tier);
  end if;

  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token;

  execute format('select organization_id from %I.%I where id = $1', v_schema, v_table)
     into v_org using p_id;
  if v_org is null then
    -- nothing was reached, so there is nothing to attribute and no audit row can exist:
    -- hr.access_audit.organization_id is NOT NULL by its own contract.
    raise exception 'hr audited door: no % row with id %', p_token, p_id using errcode = 'P0002';
  end if;

  -- the subject of the row, where the token has one
  begin
    execute format('select %s from %I.%I where id = $1',
      case
        when p_token in ('hr_compensation','hr_separation','hr_corrective_action','hr_leave_case',
                         'hr_tax_withholding','hr_i9','hr_accommodation_request',
                         'hr_verification_letter_request') then 'employment_id'
        when p_token = 'hr_employee_private' then
             '(select em.id from hr.employment em where em.employee_id = ' || quote_ident(v_table) || '.employee_id order by em.hire_date desc limit 1)'
        when p_token = 'hr_emergency_contact' then
             '(select em.id from hr.employment em where em.employee_id = ' || quote_ident(v_table) || '.employee_id order by em.hire_date desc limit 1)'
        when p_token = 'hr_incident' then 'subject_employment_id'
        else 'null::uuid'
      end, v_schema, v_table) into v_subject using p_id;
  exception when others then v_subject := null;
  end;

  -- the owner lane: `created_by` is the SUBJECT on a confidential row (§3), so a self-read is
  -- stamped is_self_access and is EXCLUDED from the anomaly queue — auditing a person for reading
  -- their own salary is noise, not signal.
  begin
    execute format('select created_by from %I.%I where id = $1', v_schema, v_table)
       into v_owner using p_id;
  exception when others then v_owner := null;
  end;
  v_is_self := (v_owner is not null and v_owner = p_user)
               or (v_subject is not null and v_subject = any(hr.employments_of(p_user)));

  if v_is_self then
    return jsonb_build_object('allowed', true, 'basis', 'self', 'is_self', true,
                              'subject_employment_id', v_subject, 'organization_id', v_org,
                              'tier', d.tier, 'schema', v_schema, 'table', v_table);
  end if;

  -- ---------- §3.1a: hr.restricted_note resolves its capability PER CLASS, never by the token
  v_caps  := d.caps;
  v_bg_ok := d.allows_break_glass;
  if p_token = 'hr_restricted_note' then
    execute 'select note_kind from hr.restricted_note where id = $1' into v_note_kind using p_id;
    select * into nk from hr._note_kind_caps(v_note_kind);
    if not found then
      return jsonb_build_object('allowed', false, 'basis', 'unmapped_note_kind',
        'reason', format('note_kind %s has no reader mapping; a class nobody assigned a reader to must not fall through to the widest lane', v_note_kind),
        'organization_id', v_org, 'tier', 'restricted', 'schema', v_schema, 'table', v_table);
    end if;
    v_caps  := nk.caps;
    v_bg_ok := nk.allows_break_glass;
    v_veto  := nk.veto_applies;
  end if;

  -- ---------- the capability check, ANY-OF, population-scoped to the row's subject
  foreach v_cap in array v_caps loop
    if hr.capability(p_user, v_cap, v_subject) then
      v_allowed := true; v_basis := 'role';
      exit;
    end if;
  end loop;

  -- ---------- §5's investigator lane: a party with role='investigator' reaches the case
  if not v_allowed and p_token in ('hr_incident','hr_incident_party') then
    if exists (select 1 from hr.incident_party ip
                where ip.party_role = 'investigator' and ip.deleted_at is null
                  and ip.employment_id = any(hr.employments_of(p_user))
                  and ip.incident_id = case when p_token = 'hr_incident' then p_id
                       else (select ip2.incident_id from hr.incident_party ip2 where ip2.id = p_id) end)
    then v_allowed := true; v_basis := 'authority'; end if;
  end if;

  -- ---------- break-glass, if this token and class permit it at all
  if not v_allowed and p_break_glass and v_bg_ok
     and hr._break_glass_active(p_user, p_token, p_id) then
    v_allowed := true; v_basis := 'break_glass';
  end if;
  if not v_allowed and not p_break_glass and hr._break_glass_active(p_user, p_token, p_id)
     and v_bg_ok then
    v_allowed := true; v_basis := 'break_glass';
  end if;

  -- ---------- 🚨 §5's VETO, EVALUATED LAST AND UNCONDITIONALLY.
  -- It is checked AFTER every allow lane, it overrides incident.read, it overrides hr_owner, and
  -- it overrides break-glass. An investigation record cannot be modelled additively — the accused
  -- would otherwise reach it through the HR-admin lane.
  if p_token in ('hr_incident','hr_incident_party') or v_veto then
    declare v_inc uuid;
    begin
      v_inc := case
        when p_token = 'hr_incident' then p_id
        when p_token = 'hr_incident_party' then (select incident_id from hr.incident_party where id = p_id)
        else (select rn.subject_id from hr.restricted_note rn
               where rn.id = p_id and rn.subject_token = 'hr_incident') end;
      if v_inc is not null and hr.incident_excluded(p_user, v_inc) then
        return jsonb_build_object('allowed', false, 'basis', 'subject_excluded',
          'reason', 'SPEC-ACCESS §5: the caller is the subject of, or a party to, this investigation. The veto overrides incident.read, it overrides hr_owner, and it overrides break-glass.',
          'organization_id', v_org, 'subject_employment_id', v_subject, 'tier', d.tier,
          'schema', v_schema, 'table', v_table);
      end if;
    end;
  end if;

  return jsonb_build_object('allowed', v_allowed, 'basis', coalesce(v_basis,'none'),
    'is_self', false, 'subject_employment_id', v_subject, 'organization_id', v_org,
    'tier', d.tier, 'schema', v_schema, 'table', v_table,
    'reason', case when v_allowed then null else
      format('the caller holds none of %s over this row''s population', array_to_string(v_caps, ', ')) end);
end
$fn$;

revoke all on function hr._door_verdict(uuid, text, uuid, boolean) from public;
grant execute on function hr._door_verdict(uuid, text, uuid, boolean) to service_role;

-- ============================================================ the shared door body
create or replace function hr._door_get(
  p_token text, p_id uuid, p_purpose text, p_justification text, p_break_glass boolean,
  p_expect_tier text)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_uid uuid := auth.uid(); v_verdict jsonb; v_audit uuid; v_row jsonb;
begin
  if v_uid is null then
    raise exception 'hr audited door: no authenticated caller' using errcode = '42501';
  end if;

  v_verdict := hr._door_verdict(v_uid, p_token, p_id, p_break_glass);

  -- the tier check keeps the two families honest: a Restricted token asked for through the
  -- confidential door is a caller mistake, not a refusal
  if p_expect_tier is not null and (v_verdict ->> 'tier') <> p_expect_tier then
    raise exception 'hr audited door: % is the % tier; use the % door',
      p_token, v_verdict ->> 'tier',
      case when (v_verdict ->> 'tier') = 'restricted' then 'hr_restricted_get' else 'hr_confidential_get' end
      using errcode = '22023';
  end if;

  if not (v_verdict ->> 'allowed')::boolean then
    -- 🚨 THE AUDIT ROW IS WRITTEN AND THE FUNCTION RETURNS. It does not raise. See the header.
    v_audit := hr._record_access_audit(
      p_organization_id => (v_verdict ->> 'organization_id')::uuid,
      p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_row_count => 0,
      p_sensitivity_tier => v_verdict ->> 'tier',
      p_subject_employment_id => nullif(v_verdict ->> 'subject_employment_id','')::uuid,
      p_justification => p_justification, p_is_break_glass => p_break_glass,
      p_denial_reason => coalesce(v_verdict ->> 'reason', v_verdict ->> 'basis'));
    return jsonb_build_object('granted', false, 'reason', v_verdict ->> 'basis',
                              'detail', v_verdict ->> 'reason', 'audit_id', v_audit);
  end if;

  v_row := hr._project_row(p_token, v_verdict ->> 'schema', v_verdict ->> 'table', p_id);

  -- §4.2: THE AUDIT WRITE IS FAIL-CLOSED. If this insert raises, the read raises too and returns
  -- nothing — the deliberate opposite of public.access_request_report, which wraps its
  -- activity-log write in a savepoint so a log failure cannot fail the operation. That is right
  -- for an activity feed and wrong for a compliance audit: an unauditable read of a medical
  -- record must not happen.
  v_audit := hr._record_access_audit(
    p_organization_id => (v_verdict ->> 'organization_id')::uuid,
    p_action => 'read', p_target_token => p_token,
    p_purpose => coalesce(p_purpose,'operational'), p_basis => v_verdict ->> 'basis',
    p_granted => true, p_target_ids => ARRAY[p_id], p_row_count => 1,
    p_sensitivity_tier => v_verdict ->> 'tier',
    p_subject_employment_id => nullif(v_verdict ->> 'subject_employment_id','')::uuid,
    p_is_self_access => coalesce((v_verdict ->> 'is_self')::boolean, false),
    p_justification => p_justification,
    p_is_break_glass => ((v_verdict ->> 'basis') = 'break_glass'));

  return jsonb_build_object('granted', true, 'row', v_row, 'basis', v_verdict ->> 'basis',
                            'is_self_access', coalesce((v_verdict ->> 'is_self')::boolean, false),
                            'audit_id', v_audit);
end
$fn$;

revoke all on function hr._door_get(text, uuid, text, text, boolean, text) from public;
grant execute on function hr._door_get(text, uuid, text, text, boolean, text) to service_role;

-- ---------------------------------------------------------------- the list body
-- §4.2: A LIST CALL WRITES **ONE** AUDIT ROW carrying row_count and the first 100 target ids, not
-- one row per record — otherwise an HR admin opening a 500-person list writes 500 audit rows and
-- the feature gets turned off.
create or replace function hr._door_list(
  p_token text, p_filter jsonb, p_limit int, p_cursor text, p_purpose text, p_expect_tier text)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_uid uuid := auth.uid(); d record; v_schema text; v_table text; v_org uuid;
  v_ids uuid[] := '{}'; v_rows jsonb := '[]'::jsonb; v_audit uuid; rec record;
  v_limit int; v_kept int := 0; v_verdict jsonb; v_next text;
begin
  if v_uid is null then
    raise exception 'hr audited door: no authenticated caller' using errcode = '42501';
  end if;
  select * into d from hr._door_spec(p_token);
  if not found then
    raise exception 'hr audited door: % is not an audited-tier token', p_token using errcode = '22023';
  end if;
  if p_expect_tier is not null and d.tier <> p_expect_tier then
    raise exception 'hr audited door: % is the % tier', p_token, d.tier using errcode = '22023';
  end if;

  v_org := nullif(p_filter ->> 'organization_id','')::uuid;
  if v_org is null then
    select em.organization_id into v_org
      from hr.employment em where em.id = any(hr.employments_of(v_uid)) limit 1;
  end if;
  if v_org is null then
    raise exception 'hr audited door: a list call needs an organization; pass p_filter.organization_id'
      using errcode = '22023';
  end if;

  if d.caps is null then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_row_count => 0, p_sensitivity_tier => d.tier, p_denial_reason => d.no_door_reason);
    return jsonb_build_object('granted', false, 'reason', 'no_door', 'detail', d.no_door_reason,
                              'audit_id', v_audit);
  end if;

  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token;

  -- §4.2 performance is a REQUIREMENT: 200 rows must come back inside the authenticated role's 8s
  -- statement_timeout with room to spare (§9 T-18 asserts p95 < 500 ms). A slow audited path is
  -- how HR admins end up demanding a bulk export, which is a worse outcome than the read they
  -- were slowed down on.
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);

  for rec in execute format(
      'select id from %I.%I where organization_id = $1 %s order by id limit $2',
      v_schema, v_table,
      case when to_jsonb(p_cursor) is null or p_cursor is null then ''
           else 'and id > ' || quote_literal(p_cursor) || '::uuid' end)
    using v_org, v_limit * 4
  loop
    v_verdict := hr._door_verdict(v_uid, p_token, rec.id, false);
    if (v_verdict ->> 'allowed')::boolean then
      v_ids := v_ids || rec.id;
      v_rows := v_rows || jsonb_build_array(hr._project_row(p_token, v_schema, v_table, rec.id));
      v_kept := v_kept + 1;
      exit when v_kept >= v_limit;
    end if;
  end loop;

  if v_kept > 0 then v_next := v_ids[array_upper(v_ids,1)]::text; end if;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'list', p_target_token => p_token,
    p_purpose => coalesce(p_purpose,'operational'),
    p_basis => case when v_kept = 0 then 'refused' else 'role' end,
    p_granted => (v_kept > 0),
    p_target_ids => v_ids[1:100], p_row_count => v_kept, p_sensitivity_tier => d.tier,
    p_denial_reason => case when v_kept = 0 then 'no row in this organization is reachable by the caller''s capabilities' end);

  return jsonb_build_object('granted', true, 'rows', v_rows, 'row_count', v_kept,
                            'next_cursor', v_next, 'audit_id', v_audit);
end
$fn$;

revoke all on function hr._door_list(text, jsonb, int, text, text, text) from public;
grant execute on function hr._door_list(text, jsonb, int, text, text, text) to service_role;

-- ============================================================ §4.2 the public contract shapes
create or replace function public.hr_confidential_get(
  p_token text, p_id uuid, p_purpose text default 'operational')
returns jsonb language sql security definer set search_path = public, hr
as $fn$ select hr._door_get(p_token, p_id, p_purpose, null, false, 'confidential'); $fn$;

create or replace function public.hr_confidential_list(
  p_token text, p_filter jsonb default '{}'::jsonb, p_limit int default 100,
  p_cursor text default null, p_purpose text default 'operational')
returns jsonb language sql security definer set search_path = public, hr
as $fn$ select hr._door_list(p_token, p_filter, p_limit, p_cursor, p_purpose, 'confidential'); $fn$;

create or replace function public.hr_restricted_get(
  p_token text, p_id uuid, p_purpose text, p_justification text default null)
returns jsonb language sql security definer set search_path = public, hr
as $fn$ select hr._door_get(p_token, p_id, p_purpose, p_justification, false, 'restricted'); $fn$;

create or replace function public.hr_restricted_list(
  p_token text, p_filter jsonb default '{}'::jsonb, p_limit int default 100,
  p_cursor text default null, p_purpose text default 'operational')
returns jsonb language sql security definer set search_path = public, hr
as $fn$ select hr._door_list(p_token, p_filter, p_limit, p_cursor, p_purpose, 'restricted'); $fn$;

create or replace function public.hr_access_explain(p_user uuid, p_token text, p_id uuid)
returns jsonb language sql security definer set search_path = public, hr
as $fn$ select hr.access_explain(coalesce(p_user, auth.uid()), p_token, p_id); $fn$;

-- ============================================================ §4.3 break-glass
create or replace function public.hr_break_glass(
  p_token text, p_id uuid, p_purpose text, p_justification text)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); d record; v_min int; v_ttl int; v_org uuid; v_schema text;
  v_table text; v_audit uuid; v_perm uuid; v_subject uuid; v_verdict jsonb; v_note_kind text;
  nk record; v_bg_ok boolean;
begin
  if v_uid is null then
    raise exception 'hr_break_glass: no authenticated caller' using errcode = '42501';
  end if;
  select * into d from hr._door_spec(p_token);
  if not found then
    raise exception 'hr_break_glass: % is not an audited-tier token', p_token using errcode = '22023';
  end if;

  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token;
  execute format('select organization_id from %I.%I where id = $1', v_schema, v_table)
     into v_org using p_id;
  if v_org is null then
    raise exception 'hr_break_glass: no % row with id %', p_token, p_id using errcode = 'P0002';
  end if;

  -- ---- the caller must hold a role whose catalogue row says break_glass_allowed
  if not exists (
    select 1 from hr.role_assignment ra
      join lateral (select ar.break_glass_allowed from hr.access_role ar
                     where ar.role_key = ra.role_key and ar.deleted_at is null and ar.is_active
                       and ar.organization_id in (ra.organization_id,
                                                  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
                     order by (ar.organization_id = ra.organization_id) desc limit 1) role on true
     where ra.organization_id = v_org
       and ra.employment_id = any(hr.employments_of(v_uid))
       and ra.is_active and ra.revoked_at is null
       and ra.effective_from <= current_date
       and (ra.effective_to is null or ra.effective_to >= current_date)
       and role.break_glass_allowed)
  then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => true,
      p_justification => p_justification,
      p_denial_reason => 'the caller holds no role with break_glass_allowed; a manager never can');
    return jsonb_build_object('granted', false, 'reason', 'no_break_glass_role', 'audit_id', v_audit);
  end if;

  -- ---- the justification floor, from the knob (D13: a missing knob raises)
  v_min := (hr._knob('hr.domain_wide','break_glass_justification_min_chars') #>> '{}')::integer;
  if p_justification is null or length(p_justification) < v_min then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => false,
      p_denial_reason => format('justification is shorter than the %s-character floor', v_min));
    return jsonb_build_object('granted', false, 'reason', 'justification_too_short',
      'detail', format('hr.domain_wide.break_glass_justification_min_chars is %s', v_min),
      'audit_id', v_audit);
  end if;

  -- ---- the purpose must come from the controlled dimension, not from prose
  if not exists (select 1 from platform.categories c
                  where c.dimension = 'hr_access_purpose' and c.slug = p_purpose
                    and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and c.deleted_at is null) then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => '(unregistered)', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier,
      p_justification => p_justification,
      p_denial_reason => format('purpose %s is not in the hr_access_purpose dimension', p_purpose));
    return jsonb_build_object('granted', false, 'reason', 'unregistered_purpose', 'audit_id', v_audit);
  end if;

  -- ---- 🚨 TWO THINGS BREAK-GLASS CAN NEVER REACH (§4.3), and both are checked before any grant:
  --      an hr.incident where the caller is a party (§5's veto is absolute), and an individual
  --      hr.eeo_response (no such read path exists in any function). The MEDICAL note class is a
  --      third, from §3.1a — otherwise the merged table makes the medical wall a formality.
  v_bg_ok := d.allows_break_glass;
  if p_token = 'hr_restricted_note' then
    execute 'select note_kind from hr.restricted_note where id = $1' into v_note_kind using p_id;
    select * into nk from hr._note_kind_caps(v_note_kind);
    v_bg_ok := coalesce(nk.allows_break_glass, false);
  end if;

  v_verdict := hr._door_verdict(v_uid, p_token, p_id, false);
  if (v_verdict ->> 'basis') = 'subject_excluded' then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => p_purpose, p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => true,
      p_justification => p_justification,
      p_denial_reason => 'SPEC-ACCESS §5: the subject-exclusion veto overrides break-glass, absolutely');
    return jsonb_build_object('granted', false, 'reason', 'subject_excluded', 'audit_id', v_audit);
  end if;

  if not v_bg_ok then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => p_purpose, p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => true,
      p_justification => p_justification,
      p_denial_reason => coalesce(d.no_door_reason,
        format('break-glass is not permitted on %s%s', p_token,
               case when v_note_kind is null then '' else ' / ' || v_note_kind end)));
    return jsonb_build_object('granted', false, 'reason', 'break_glass_not_permitted',
                              'audit_id', v_audit);
  end if;

  -- ---- §4.3: write a REAL, time-boxed grant, so the person can actually do the work. A one-shot
  --      read that forces twelve more break-glass calls is over-tightening dressed as rigour.
  v_ttl := (hr._knob('hr.access','break_glass_grant_ttl_minutes') #>> '{}')::integer;
  v_subject := nullif(v_verdict ->> 'subject_employment_id','')::uuid;

  perform set_config('hr.privileged_write','on',true);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               status, expires_at)
  values (p_token, p_id, v_uid, 'viewer', 'active', now() + make_interval(mins => v_ttl))
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set expires_at = excluded.expires_at, status = 'active'
  returning id into v_perm;

  insert into hr.derived_grant
    (organization_id, permission_id, subject_employment_id, grantee_user_id, resource_type,
     resource_id, permission_level, expires_at, reason, basis_kind, basis_id)
  values (v_org, v_perm, v_subject, v_uid, p_token, p_id, 'viewer',
          now() + make_interval(mins => v_ttl), 'break_glass', 'break_glass', p_id)
  on conflict (permission_id) do update
     set expires_at = excluded.expires_at, reason = 'break_glass', derived_at = now();

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'read', p_target_token => p_token,
    p_purpose => p_purpose, p_basis => 'break_glass', p_granted => true,
    p_target_ids => ARRAY[p_id], p_row_count => 1, p_sensitivity_tier => d.tier,
    p_subject_employment_id => v_subject, p_justification => p_justification,
    p_is_break_glass => true);

  -- 🚨 THE NOTIFICATION AUDIENCE IS NOT DECIDED HERE. Per D24g, recipients come from the
  -- principal-governed alert-routing panel (SPEC-DOMAIN-WIDE / hr.alert_routing_rule). This lane
  -- declares the EVENT and its tier — hr.access.break_glass_used, tier `immediate` — and resolves
  -- the audience through hr.alert_recipients; the org owner + every hr_owner is the seeded default
  -- the panel starts from, never a hard-coded recipient list here.
  return jsonb_build_object(
    'granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'expires_at', now() + make_interval(mins => v_ttl),
    'alert_event', 'hr.access.break_glass_used', 'alert_tier', 'immediate',
    'alert_recipients', (select coalesce(jsonb_agg(x), '[]'::jsonb)
                           from hr.alert_recipients(v_org, 'compliance',
                                'hr.access.break_glass_used', 'organization', null, 'urgent') x),
    'row', hr._project_row(p_token, v_schema, v_table, p_id));
end
$fn$;

-- ============================================================ §4.7 reading the audit itself
-- Gated on audit.read, PLUS the subject's own lane: hr.access.employee_can_see_own_access_log
-- (default true) lets an employee see who looked at their record. No competitor does this; it is
-- the right default for a platform whose owner insists the right people get in without blinking.
-- Reading the log is itself audited, once per query, with target_token='hr_access_audit' — a
-- definer insert, so there is no recursion.
create or replace function public.hr_access_audit_query(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now(),
  p_target_token text default null,
  p_include_self boolean default false,
  p_limit int default 100,
  p_organization_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid := p_organization_id; v_rows jsonb; v_n int;
  v_audit uuid; v_can_audit boolean; v_mine uuid[]; v_own_ok boolean;
begin
  if v_uid is null then
    raise exception 'hr_access_audit_query: no authenticated caller' using errcode = '42501';
  end if;
  v_mine := hr.employments_of(v_uid);
  if v_org is null then
    select em.organization_id into v_org from hr.employment em where em.id = any(v_mine) limit 1;
  end if;
  if v_org is null then
    raise exception 'hr_access_audit_query: pass p_organization_id' using errcode = '22023';
  end if;

  v_can_audit := hr.capability(v_uid, 'audit.read');
  v_own_ok := (hr._knob('hr.access','employee_can_see_own_access_log') #>> '{}')::boolean;

  if not v_can_audit and not v_own_ok then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_access_audit',
      p_purpose => 'audit', p_basis => 'refused', p_granted => false,
      p_sensitivity_tier => 'restricted', p_row_count => 0,
      p_denial_reason => 'the caller holds no audit.read capability and the own-log knob is off');
    return jsonb_build_object('granted', false, 'reason', 'no_capability', 'audit_id', v_audit);
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) - 'request_context'), '[]'::jsonb), count(*)
    into v_rows, v_n
  from (
    select * from hr.access_audit a
     where a.organization_id = v_org
       and a.occurred_at between p_from and p_to
       and (p_target_token is null or a.target_token = p_target_token)
       and (p_include_self or not a.is_self_access)
       -- 🚨 an audit.read holder sees the org's log; everyone else sees ONLY the rows ABOUT them
       and (v_can_audit or a.subject_employment_id = any(v_mine))
     order by a.occurred_at desc
     limit least(greatest(coalesce(p_limit,100),1), 500)) a;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'list', p_target_token => 'hr_access_audit',
    p_purpose => 'audit', p_basis => case when v_can_audit then 'role' else 'self' end,
    p_granted => true, p_row_count => v_n, p_sensitivity_tier => 'restricted',
    p_is_self_access => not v_can_audit);

  return jsonb_build_object('granted', true, 'rows', v_rows, 'row_count', v_n, 'audit_id', v_audit);
end
$fn$;

-- ============================================================ §5 the reporter's lane
-- A REPORTER IS NOT AN INVESTIGATOR. They reach state, last-updated and the case's declared next
-- step — and no investigation-class hr.restricted_note row.
create or replace function public.hr_incident_status(p_incident_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); i hr.incident%rowtype; v_mine uuid[]; v_audit uuid; v_is_reporter boolean;
begin
  if v_uid is null then
    raise exception 'hr_incident_status: no authenticated caller' using errcode = '42501';
  end if;
  select * into i from hr.incident where id = p_incident_id and deleted_at is null;
  if not found then
    raise exception 'hr_incident_status: no hr.incident with id %', p_incident_id using errcode = 'P0002';
  end if;
  v_mine := hr.employments_of(v_uid);
  v_is_reporter := i.reporter_employment_id is not null and i.reporter_employment_id = any(v_mine);

  if not (v_is_reporter or hr.capability(v_uid,'incident.read')
          or exists (select 1 from hr.incident_party ip
                      where ip.incident_id = i.id and ip.party_role = 'investigator'
                        and ip.deleted_at is null and ip.employment_id = any(v_mine))) then
    v_audit := hr._record_access_audit(
      p_organization_id => i.organization_id, p_action => 'denied', p_target_token => 'hr_incident',
      p_purpose => 'employee_request', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_incident_id], p_sensitivity_tier => 'restricted',
      p_subject_employment_id => i.subject_employment_id,
      p_denial_reason => 'the caller is neither the reporter, an investigator, nor an incident.read holder');
    return jsonb_build_object('granted', false, 'reason', 'no_capability', 'audit_id', v_audit);
  end if;

  -- the veto still applies: a SUBJECT probing for their own case leaves a trail and gets nothing
  if hr.incident_excluded(v_uid, p_incident_id) then
    v_audit := hr._record_access_audit(
      p_organization_id => i.organization_id, p_action => 'denied', p_target_token => 'hr_incident',
      p_purpose => 'employee_request', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_incident_id], p_sensitivity_tier => 'restricted',
      p_subject_employment_id => i.subject_employment_id,
      p_denial_reason => 'SPEC-ACCESS §5: subject-exclusion veto');
    return jsonb_build_object('granted', false, 'reason', 'subject_excluded', 'audit_id', v_audit);
  end if;

  v_audit := hr._record_access_audit(
    p_organization_id => i.organization_id, p_action => 'read', p_target_token => 'hr_incident',
    p_purpose => 'employee_request', p_basis => case when v_is_reporter then 'self' else 'role' end,
    p_granted => true, p_target_ids => ARRAY[p_incident_id], p_row_count => 1,
    p_sensitivity_tier => 'restricted', p_subject_employment_id => i.subject_employment_id,
    p_is_self_access => v_is_reporter and i.subject_employment_id = any(v_mine));

  -- state, last-updated and the declared next step. NOTHING else — no summary, no parties, no notes.
  return jsonb_build_object('granted', true, 'audit_id', v_audit,
    'incident_id', i.id, 'state', i.state, 'updated_at', i.updated_at,
    'next_step_on', i.follow_up_on, 'reported_at', i.reported_at,
    'resolved_at', i.resolved_at);
end
$fn$;

-- ============================================================ §14: the two doors, UPGRADED
-- 🚨 THIS IS THE DEBT core tranche 4 RECORDED AGAINST HRB-007. Both functions shipped
-- FAIL-CLOSED — "a door with no lock is worse than no door" — and their headers named this lane as
-- the owner of the real gate. The gate is now hr.capability() + the derived-role machinery, and
-- THE ENVELOPE SHAPE IS PRESERVED EXACTLY, because a gate that starts raising on denial silently
-- empties the denial log, and it does so without failing any test that only asserts "unauthorized
-- callers cannot read".
create or replace function hr.read_confidential(p_token text, p_id uuid, p_purpose text,
                                                p_break_glass boolean default false,
                                                p_justification text default null)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
begin
  return hr._door_get(p_token, p_id, p_purpose, p_justification, p_break_glass, null);
end
$fn$;

comment on function hr.read_confidential is
  'SPEC-DATA-MODEL §1.4 / §14.6 + SPEC-ACCESS §4.2: THE audited read path for every CONF table. Upgraded by HRB-007 from fail-closed to the real derived-role gate (hr.capability, population-checked, never iam.has_access). Returns a refusal ENVELOPE rather than raising, because a raise rolls back the audit row that justifies the refusal. Refused envelopes carry no row payload.';

create or replace function hr.reveal_ssn(p_employee_id uuid, p_purpose text,
                                         p_justification text default null)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_audit uuid; v_priv uuid; v_subject uuid;
  v_last4 text; v_threshold int; v_today int;
begin
  if v_uid is null then
    raise exception 'hr.reveal_ssn: no authenticated caller' using errcode = '42501';
  end if;
  select organization_id into v_org from hr.employee where id = p_employee_id;
  if v_org is null then
    raise exception 'hr.reveal_ssn: no hr.employee row with id %', p_employee_id using errcode = 'P0002';
  end if;
  select p.id, p.ssn_last4 into v_priv, v_last4
    from hr.employee_private p where p.employee_id = p_employee_id and p.deleted_at is null limit 1;
  select em.id into v_subject from hr.employment em
   where em.employee_id = p_employee_id and em.deleted_at is null order by em.hire_date desc limit 1;

  -- ---- the gate: the ssn.reveal capability over THIS person, or the subject themselves
  if not (hr.capability(v_uid, 'ssn.reveal', v_subject)
          or (v_subject is not null and v_subject = any(hr.employments_of(v_uid)))) then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_employee_private',
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_employee_id], p_sensitivity_tier => 'restricted',
      p_field_key => 'ssn', p_subject_employment_id => v_subject,
      p_justification => p_justification,
      p_denial_reason => 'the caller holds no ssn.reveal capability over this person');
    return jsonb_build_object('granted', false, 'reason', 'no_capability', 'audit_id', v_audit);
  end if;

  -- ---- §4.5 requires a justification for a reveal, always
  if p_justification is null or length(trim(p_justification)) = 0 then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_employee_private',
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_employee_id], p_sensitivity_tier => 'restricted',
      p_field_key => 'ssn', p_subject_employment_id => v_subject,
      p_denial_reason => 'a reveal without a justification is refused (SPEC-ACCESS §4.5)');
    return jsonb_build_object('granted', false, 'reason', 'justification_required', 'audit_id', v_audit);
  end if;

  -- ---- §4.5's volume alarm, measured from the log this function writes
  v_threshold := (hr._knob('hr.access','ssn_reveal_daily_alert_threshold') #>> '{}')::integer;
  select count(*) into v_today from hr.access_audit
   where actor_user_id = v_uid and action = 'reveal_field' and field_key = 'ssn'
     and occurred_at >= date_trunc('day', now());

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'reveal_field', p_target_token => 'hr_employee_private',
    p_purpose => coalesce(p_purpose,'payroll'), p_basis => 'role', p_granted => true,
    p_target_ids => ARRAY[p_employee_id], p_row_count => 1, p_sensitivity_tier => 'restricted',
    p_field_key => 'ssn', p_subject_employment_id => v_subject,
    p_is_self_access => (v_subject is not null and v_subject = any(hr.employments_of(v_uid))),
    p_justification => p_justification);

  -- 🚨 THE PLAINTEXT IS NOT AVAILABLE IN POSTGRES AND MUST NOT BE FAKED. §4.5 is explicit: there
  -- is NO in-database encryption precedent on this platform, every encrypted application column is
  -- an opaque bytea written and read BY AIDREAM IN PYTHON, and the full value is served by the
  -- aidream endpoint POST /hr/identity/{id}/ssn/reveal under acting_as_user. This function is the
  -- GATE and the AUDIT — it returns the hint plus a decrypt ticket, and the envelope says so
  -- rather than pretending a value it cannot produce.
  return jsonb_build_object(
    'granted', true, 'audit_id', v_audit, 'ssn_last4', v_last4,
    'employee_private_id', v_priv,
    'decrypt_via', 'aidream POST /hr/identity/{id}/ssn/reveal (acting_as_user); the envelope key is held there, never in Postgres',
    'reveals_today', v_today + 1,
    'volume_alarm', (v_today + 1) > v_threshold,
    'alert_event', case when (v_today + 1) > v_threshold then 'hr.access.ssn_reveal_threshold' end);
end
$fn$;

comment on function hr.reveal_ssn(uuid, text, text) is
  'SPEC-ACCESS §4.5 + SPEC-DATA-MODEL §14.6. Returns jsonb, not text, so a refusal can never be rendered where an SSN was expected. Upgraded by HRB-007 from fail-closed to the real ssn.reveal gate; it audits and authorises, and aidream decrypts — a Postgres RPC cannot.';

-- ============================================================ grants
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'public.hr_confidential_get(text, uuid, text)',
    'public.hr_confidential_list(text, jsonb, int, text, text)',
    'public.hr_restricted_get(text, uuid, text, text)',
    'public.hr_restricted_list(text, jsonb, int, text, text)',
    'public.hr_break_glass(text, uuid, text, text)',
    'public.hr_access_explain(uuid, text, uuid)',
    'public.hr_access_audit_query(timestamptz, timestamptz, text, boolean, int, uuid)',
    'public.hr_incident_status(uuid)',
    'hr.read_confidential(text, uuid, text, boolean, text)',
    'hr.reveal_ssn(uuid, text, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v_bad integer; v_rules text;
begin
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_confidential_get','hr_confidential_list','hr_restricted_get',
                       'hr_restricted_list','hr_break_glass','hr_access_explain',
                       'hr_access_audit_query','hr_incident_status');
  if v_bad <> 8 then
    raise exception 'hr_c3_06: expected 8 public door RPCs, found %', v_bad;
  end if;

  -- §9 T-34: no anon EXECUTE on any of them
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_confidential_get','hr_confidential_list','hr_restricted_get',
                       'hr_restricted_list','hr_break_glass','hr_access_explain',
                       'hr_access_audit_query','hr_incident_status')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_c3_06: % door RPCs are executable by anon (§9 T-34)', v_bad;
  end if;

  -- §4.4 / §3.2: the structurally doorless tokens really have no capability set
  if exists (select 1 from hr._door_spec('hr_eeo_response') where caps is not null) then
    raise exception 'hr_c3_06: hr_eeo_response has a read door; §4.4 makes its absence the guarantee';
  end if;
  foreach v_rules in array ARRAY['hr_employment_pin','hr_kiosk_device','hr_kiosk_session','hr_access_audit'] loop
    if exists (select 1 from hr._door_spec(v_rules) where caps is not null) then
      raise exception 'hr_c3_06: % must have no read door (§3.2 never client-readable)', v_rules;
    end if;
  end loop;

  -- §3.1a: break-glass is not permitted into the medical classes
  if exists (select 1 from hr._note_kind_caps('medical_certification') where allows_break_glass) then
    raise exception 'hr_c3_06: break-glass into the medical note class would make the medical wall a formality';
  end if;
  if exists (select 1 from hr._note_kind_caps('accommodation_detail') where allows_break_glass) then
    raise exception 'hr_c3_06: break-glass into the accommodation note class is not permitted';
  end if;

  -- §9 T-33: no audited-tier door may gate on iam.has_access
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('hr','public')
     and p.proname in ('_door_verdict','_door_get','_door_list','hr_break_glass',
                       'read_confidential','reveal_ssn','hr_incident_status')
     and p.prosrc like '%iam.has_access%';
  if v_bad > 0 then
    raise exception 'hr_c3_06: % audited-tier function(s) reference iam.has_access (§9 T-33)', v_bad;
  end if;

  -- the two upgraded doors must still return jsonb
  if (select t.typname from pg_proc p join pg_type t on t.oid = p.prorettype
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='hr' and p.proname='reveal_ssn') <> 'jsonb' then
    raise exception 'hr_c3_06: hr.reveal_ssn must return jsonb so a refusal cannot be rendered where an SSN was expected';
  end if;

  select count(*), string_agg(distinct rule, ', ') into v_bad, v_rules
    from platform.ddl_guard_log where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_c3_06: % unacked hr.%% DDL guard rows under rule(s): %', v_bad, v_rules;
  end if;
end $$;
