-- hr_l1_54_consent_is_the_subjects_to_give.sql
--
-- 🚨 P0 — THE CONSENT DOOR FAILED OPEN, AND IT IS THE ONE DOOR THAT MUST NOT.
-- `public.hr_verification_consent` decided "am I the subject?" with
--     v_self := hr._l1_self_employment(v_uid, v_org, current_date) = v_employment;
--     if not v_self then ... refuse ...
-- When `_l1_self_employment` returns NULL — which it does for anyone with no CURRENT
-- employment in that org, including every outsider and every PRE-START hire — `v_self` is
-- NULL, `not NULL` is NULL, and plpgsql's IF treats NULL as false. **The refusal is skipped
-- and the update runs.**
--
-- MEASURED, not reasoned: a user with no employment anywhere in the fixture org called
-- `hr_verification_consent(<someone else's income letter>, true)` and got
--   {"ok":true,"granted":true,"state":"received"}
-- — a stranger consented to the disclosure of another person's compensation, and the letter
-- became generatable. The door's own comment says "CONSENT IS THE SUBJECT'S TO GIVE AND
-- NOBODY ELSE'S. There is no HR override here, on purpose"; the code granted it to anybody.
--
-- 🚨 THE SAME NULL IS IN `hr_verification_request_create`, where it skips the WRITE GATE.
-- Same expression, same shape: an outsider's `not v_self` is NULL, so
-- `hr._l1_write_gate(... 'working_record.write' ...)` is never consulted. That one currently
-- fails CLOSED only by accident — it crashes later with 23502 on `access_audit.is_self_access`
-- because the same NULL is passed as `p_self`. Saved by a NOT NULL constraint two functions
-- away is not a guard.
--
-- BOTH now resolve identity the way hr_l1_52 already ruled for `viewer_is_subject`
-- (hr_c4_39 / hr_l3_88): **whether a letter is ABOUT ME is an IDENTITY fact, resolved by
-- login linkage, never by date-scoped employment.** A pre-start hire can be asked for consent
-- and must be able to answer. The comparison is NULL-safe (`is not distinct from`) with an
-- explicit `v_uid is not null`, so an anonymous caller is false, not NULL.
--
-- ALSO IN THIS MIGRATION
--   • `public.hr_my_verification_consents()` — the self-scoped read door that did not exist,
--     so the subject had nothing to read and no way to answer.
--   • `hr._l1_notify_consent_requested(uuid)` — fires the catalog event
--     `hr.people.verification_consent_requested`, which has been seeded and enabled since
--     hr_l1_08 and had NEVER been emitted by anything. Raising a compensation request told
--     the subject nothing.
--
-- Applied live 2026-08-28 and ledgered. Falsification recorded in the register.

-- ── 1. The consent door: identity, not date ────────────────────────────────────────────────
do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_verification_consent(uuid,boolean,text)'::regprocedure);
  if position('CONSENT IS AN IDENTITY FACT' in v_def) > 0 then
    raise notice 'hr_l1_54: consent door already fixed'; return;
  end if;
  v_new := replace(v_def,
    'v_self := hr._l1_self_employment(v_uid, v_org, current_date) = v_employment;',
E'-- 🚨 CONSENT IS AN IDENTITY FACT (hr_l1_52 / hr_c4_39). The old test was\n'
||E'  -- `_l1_self_employment(uid, org, TODAY) = v_employment`, which is NULL for a pre-start\n'
||E'  -- hire AND for any outsider — and `not NULL` skips the refusal, so a stranger could\n'
||E'  -- consent to another person''s pay being disclosed. Proven, not theorised.\n'
||E'  v_self := v_uid is not null and hr._wf_login_of(v_employment) is not distinct from v_uid;');
  if v_new = v_def then raise exception 'hr_l1_54: consent anchor not found'; end if;
  execute v_new;
end $mig$;

-- ── 2. Telling the subject (created FIRST: section 3 calls it) ─────────────────────────────────────────────────────────────────
create or replace function hr._l1_notify_consent_requested(p_request_id uuid)
returns integer
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_org uuid; v_employment uuid; v_requester text; v_uid uuid;
  v_ch text; v_n integer := 0;
begin
  select r.organization_id, r.employment_id,
         coalesce(nullif(r.requester_organization,''), nullif(r.requester_name,''), 'a third party')
    into v_org, v_employment, v_requester
    from hr.verification_letter_request r
   where r.id = p_request_id and r.deleted_at is null;
  if v_org is null then return 0; end if;

  -- 🚨 THE SUBJECT, AND ONLY THE SUBJECT (SPEC-NOTIFICATIONS §2). Resolved by login linkage,
  -- so a pre-start hire is reachable. No login means no notice — and the request still stands
  -- awaiting consent, which is the honest state, not a silent grant.
  v_uid := hr._wf_login_of(v_employment);
  if v_uid is null then return 0; end if;

  foreach v_ch in array coalesce(
      nullif(hr._notify_channels('hr.people.verification_consent_requested', v_org), '{}'),
      array['in_app'])
  loop
    insert into communication.notification
      (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values (v_org, 'hr.people.verification_consent_requested', v_uid, 'user', v_ch,
            jsonb_build_object('requester', jsonb_build_object('label', v_requester)),
            'hr_verification_letter_request', p_request_id, '/hr/me',
            'hrvercons:' || p_request_id::text || ':' || v_ch,
            'personal'::platform.visibility)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$fn$;

revoke all on function hr._l1_notify_consent_requested(uuid) from public;

-- ── 3. The raise door: same NULL, and it skipped the write gate ────────────────────────────
do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_verification_request_create(jsonb)'::regprocedure);
  if position('SELF IS AN IDENTITY FACT' in v_def) > 0 then
    raise notice 'hr_l1_54: raise door already fixed'; return;
  end if;
  v_new := replace(v_def,
    'v_self := hr._l1_self_employment(v_uid, v_org, current_date) = v_employment;',
E'-- 🚨 SELF IS AN IDENTITY FACT. As NULL this skipped `_l1_write_gate` entirely for any\n'
||E'  -- caller with no current employment in the org, and then passed NULL to the audit''s\n'
||E'  -- NOT NULL `is_self_access` — a crash standing in for a refusal.\n'
||E'  v_self := v_uid is not null and hr._wf_login_of(v_employment) is not distinct from v_uid;');
  if v_new = v_def then raise exception 'hr_l1_54: raise anchor not found'; end if;

  -- The subject is told. The catalog event has existed since hr_l1_08 and nothing ever fired it.
  v_new := replace(v_new,
    E'  return jsonb_build_object(\'ok\', true, \'verification_letter_request_id\', v_id,',
E'  if v_state = \'awaiting_consent\' then\n'
||E'    perform hr._l1_notify_consent_requested(v_id);\n'
||E'  end if;\n\n'
||E'  return jsonb_build_object(\'ok\', true, \'verification_letter_request_id\', v_id,');
  execute v_new;
end $mig$;

-- ── 4. The self-scoped read door that never existed ────────────────────────────────────────
-- 🚨 WITHOUT THIS THE CONSENT STEP HAS NO PRODUCT PATH. Five verification doors existed and
-- every one was a write or the generation call; nothing let the person the letter is ABOUT
-- read what was being asserted about them, so `awaiting_consent` was a state only HR could see.
--
-- Scoped by LOGIN LINKAGE, not by `_l1_self_employment` — the same identity law as above, so a
-- pre-start hire sees their own asks. It returns rows across every employer the caller is
-- linked to, because "letters about me" is not an employer-scoped question.
create or replace function public.hr_my_verification_consents()
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_rows jsonb; v_days int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_authenticated_caller');
  end if;

  v_days := coalesce((hr._knob('hr.employees','verification_consent_expiry_days') #>> '{}')::int, 14);

  select coalesce(jsonb_agg(x order by x ->> 'requested_at' desc), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', r.id,
      'state', r.state,
      'verification_kind', r.verification_kind,
      'includes_compensation', r.includes_compensation,
      -- WHO it goes to. The subject is deciding about a named recipient, not an abstraction.
      'requester_name', r.requester_name,
      'requester_organization', r.requester_organization,
      'requester_email', r.requester_email,
      'request_source', r.request_source,
      'employer_name', o.name,
      'requested_at', r.requested_at,
      'expires_at', r.requested_at + make_interval(days => v_days),
      'employee_consent_at', r.employee_consent_at,
      'decided', r.employee_consent_at is not null or r.state = 'denied',
      'granted', r.employee_consent_at is not null
    ) as x
    from hr.verification_letter_request r
    join iam.organizations o on o.id = r.organization_id
    where r.deleted_at is null
      and r.includes_compensation
      -- The identity law: letters about ME, by login linkage.
      and hr._wf_login_of(r.employment_id) is not distinct from v_uid
      -- Awaiting my answer, or recently answered so the outcome is visible.
      and (r.state = 'awaiting_consent'
           or (r.employee_consent_at is not null and r.requested_at > now() - interval '30 days')
           or (r.state = 'denied' and r.requested_at > now() - interval '30 days'))
  ) s;

  return jsonb_build_object('ok', true, 'granted', true,
    'consent_expiry_days', v_days, 'requests', v_rows);
end
$fn$;

revoke all on function public.hr_my_verification_consents() from public;
grant execute on function public.hr_my_verification_consents() to authenticated;

-- ── 5. Contract rows ───────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values
  ('public', 'hr_verification_consent', 'hr_l1_54_consent_is_the_subjects_to_give.sql',
   array['CONSENT IS AN IDENTITY FACT', 'hr._wf_login_of(v_employment) is not distinct from v_uid'],
   array['hr._l1_self_employment(v_uid, v_org, current_date) = v_employment'],
   'MEASURED FAIL-OPEN: with _l1_self_employment NULL (any outsider, any pre-start hire) the '
   || 'old test made `not v_self` NULL, plpgsql skipped the refusal, and a stranger granted '
   || 'consent to another person''s compensation disclosure. Restoring the date-scoped test '
   || 're-opens that hole.'),
  ('public', 'hr_verification_request_create', 'hr_l1_54_consent_is_the_subjects_to_give.sql',
   array['SELF IS AN IDENTITY FACT', 'hr._l1_notify_consent_requested(v_id)'],
   array['hr._l1_self_employment(v_uid, v_org, current_date) = v_employment'],
   'The same NULL skipped the working_record.write gate for any caller with no current '
   || 'employment in the org. It also fires the ONLY emitter of '
   || 'hr.people.verification_consent_requested — without it the subject is never told, and '
   || 'the request sits awaiting an answer nobody asked for.'),
  ('public', 'hr_my_verification_consents', 'hr_l1_54_consent_is_the_subjects_to_give.sql',
   array['hr._wf_login_of(r.employment_id) is not distinct from v_uid'],
   array['_l1_self_employment'],
   'The subject''s ONLY read path to letters about them. Login linkage, not date-scoped '
   || 'employment, so a pre-start hire can see and answer their own consent ask.')
on conflict do nothing;

do $verify$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_verification_consent';
  if v_src ~ '_l1_self_employment\(v_uid, v_org, current_date\) = v_employment' then
    raise exception 'hr_l1_54: consent door still date-scoped';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_verification_request_create';
  if v_src !~ '_l1_notify_consent_requested' then
    raise exception 'hr_l1_54: raise door does not notify';
  end if;
end $verify$;
