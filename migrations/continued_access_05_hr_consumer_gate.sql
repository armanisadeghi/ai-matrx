-- continued_access_05 — THE HR CONSUMER GATE (former-employee verification consent).
--
-- RECORD of a live change applied via the Supabase MCP on 2026-08-29.
-- Amends SPEC-EMPLOYEES §2.1 + §4.9 (common-docs, EXECUTION §4 amendment, changelogged there).
--
-- 🚨 THIS IS NOT AN HR OVERRIDE OF CONSENT, AND MUST NEVER BECOME ONE.
-- `hr_verification_consent` still refuses everybody but the subject -- HR admins included --
-- and that check is untouched. The gate added here asks a DIFFERENT question: does this
-- organization offer a former employee any channel at all? With the portal off, a former
-- employee's income letter is refused for want of consent, which is the strict §4.9 rule
-- HOLDING, not failing. Nothing here lets anyone consent on another person's behalf.
--
-- 🚨 STRICTLY ADDITIVE. States 'active_member' and 'none' (no departure record -- pre-start
-- hires, kiosk employees, everyone who has never left) fall straight through unchanged. Only a
-- caller with an actual departure record in the letter's organization is newly gated. Verified
-- against a current-employee baseline before it shipped.
--
-- 🚨 IDEMPOTENT. Each patch is skipped when its marker is already present.

do $$
declare v_def text; v_old text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_verification_consent';

  if position('continued_access_unavailable' in v_def) > 0 then
    raise notice 'continued_access_05: hr_verification_consent already gated, skipping';
  else
    v_old := '  perform hr.arm_write();';
    v_new := $x$  -- 🚨 A DEPARTED SUBJECT ANSWERS ONLY WHERE THE EMPLOYER OFFERS THE PORTAL.
  -- This is NOT an HR override of consent -- consent is still the subject's and nobody else's,
  -- and no HR admin gains anything here. It is the ORGANIZATION deciding whether it offers a
  -- former employee any channel at all (platform primitive `continued-access`, Arman 2026-08-29).
  -- With the portal off, a former employee's income letter is simply refused for want of consent,
  -- which is the strict rule holding, not failing.
  -- Strictly ADDITIVE: state 'none' (no departure record -- pre-start hires, kiosk employees,
  -- everyone who has never left) and 'active_member' both fall straight through, unchanged.
  declare v_ca text;
  begin
    v_ca := platform.continued_access_state(v_org, v_uid) ->> 'state';
    if v_ca not in ('active_member', 'none')
       and not platform.continued_access_allows(v_org, v_uid, 'verification_consent_enabled') then
      return jsonb_build_object('ok', false, 'reason', 'continued_access_unavailable',
        'continued_access_state', v_ca,
        'detail', case v_ca
          when 'portal_off' then 'Your former employer does not offer a portal to people who have left, so there is no way to answer this here.'
          when 'access_expired' then 'Your access to this former employer''s portal has ended.'
          when 'access_revoked' then 'Your access to this former employer''s portal has been withdrawn.'
          else 'This former employer has not switched on employment and income verification for people who have left.' end);
    end if;
  end;

  perform hr.arm_write();$x$;

    if position(v_old in v_def) = 0 then
      raise exception 'continued_access_05 ABORTED: anchor missing in hr_verification_consent';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $$;

-- Do not show a departed person an ask they are not permitted to answer. If their former
-- employer has the portal off (or their window has closed), the request is INVISIBLE here
-- rather than a live-looking button that refuses on click.
do $$
declare v_def text; v_old text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_my_verification_consents';

  if position('continued_access_allows' in v_def) > 0 then
    raise notice 'continued_access_05: hr_my_verification_consents already gated, skipping';
  else
    v_old := '      and hr._wf_login_of(r.employment_id) is not distinct from v_uid';
    v_new := '      and hr._wf_login_of(r.employment_id) is not distinct from v_uid
      -- Do not show a departed person an ask they are not permitted to answer.
      and ((platform.continued_access_state(r.organization_id, v_uid) ->> ''state'')
             in (''active_member'', ''none'')
           or platform.continued_access_allows(r.organization_id, v_uid, ''verification_consent_enabled''))';
    if position(v_old in v_def) = 0 then
      raise exception 'continued_access_05 ABORTED: anchor missing in hr_my_verification_consents';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $$;
