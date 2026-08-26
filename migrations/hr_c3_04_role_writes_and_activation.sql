-- HR domain C3 — migration 4 of 7 (register item HRB-007, lane core-c3-access).
--
-- THE GOVERNANCE WRITE LANE. The six role/authority RPCs §1.2 names, the delegation request that
-- makes §1.3b's two-table design usable, and `hr_activate_employer` — the ONE bounded standing
-- conferral in the whole domain (§1.1). Plus the three `hr.access_audit` vocabulary corrections
-- these RPCs and the outsider lane cannot express without.
--
-- Authority: SPEC-ACCESS §1.1, §1.2, §1.3b, §4.7, §6.1. Applied live as
-- `hr_c3_04_role_writes_and_activation`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THREE `hr.access_audit` CHECKs COULD NOT EXPRESS THIS SPEC'S OWN VOCABULARY, and each is
--    widened here rather than worked around. SPEC-DATA-MODEL §14.6 is explicit that the column set
--    is "the UNION of both published shapes, with SPEC-ACCESS's names where they differ", so these
--    are omissions in that union, not design changes:
--    (a) `action` had no **`write`** value, and §4.7's own list is
--        `read | list | reveal | export | write | denied`. §1.2 requires every role/authority RPC
--        to "write an hr.access_audit row"; without `write` there is no honest value for one.
--    (b) `sensitivity_tier` admitted only confidential|restricted. A role assignment is
--        directory-grade governance (§3.2 gives it ORG). Rather than invent a fourth vocabulary,
--        the CHECK now uses **the exact four values `hr.record_class.sensitivity_tier` already
--        uses live** — directory | internal | confidential | restricted.
--    (c) `actor_type` carried 9 of §6.1's **15** values. The six missing ones are the ones this
--        lane creates actors for: `org_owner` (§1.1's activation row names it by hand),
--        `applicant`, `preboarding_hire`, `former_employee`, `anonymous_reporter`,
--        `external_investigator`. `access_audit_actor_identified` is widened with them: an
--        outsider identifies by **actor_token_id**, never by a user id, and the CHECK now says so
--        — which is also what makes §5.1's "the token id, never a person" structural.
--    OWED: SPEC-DATA-MODEL §14.6's `action` and `sensitivity_tier` CHECK bodies and its
--    `{{ACTOR}}` actor_type list.
--
-- 2. THE REFUSAL-ENVELOPE LAW BINDS THESE RPCs TOO. Every one returns `jsonb` and RETURNS
--    `{granted:false, reason, audit_id}` on refusal. It is not a style choice: Postgres has no
--    autonomous transactions, so an audit row written and then RAISEd is rolled back WITH the
--    exception, and a denial log that holds only the denials which did not happen is worse than
--    no log because it reads as evidence (build-proven, core tranche 4). A RAISE is still correct
--    for a PROGRAMMING error — an unknown role key, a malformed argument — because nothing was
--    audited and nothing is being refused. Refusal is data; breakage is an exception.
--
-- 3. `hr_authority_delegation_request` IS A SEVENTH RPC AND IT IS OWED AN OWNER. §1.2 lists six
--    and §1.3b calls `hr.approval_delegation` "a workflow object, not an access object", so the
--    creator belongs to SPEC-WORKFLOW-ENGINE. But a delegation nobody can request is a lane with
--    no entrance, and §9 T-21 requires the whole accept→materialise→expire path to be provable
--    today. It is built here, minimally and audited, and ROUTED to HRB-008 to absorb or replace.
--
-- 4. ACTIVATION SETS `created_by` ON THE EMPLOYMENT TO THE NOMINEE'S LOGIN, NOT THE CALLER'S.
--    §2.1 makes `created_by` the subject's `hr.employee.login_user_id` so the kernel's owner arm
--    answers a self-read first and costs nothing. `platform._stamp_actor` uses
--    `coalesce(NEW.created_by, uid)`, so an explicitly supplied value survives — proven live in
--    the component-neutralisation work and re-proven by this lane's own probe.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ RECORDED DECISION 1: the vocabulary
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'access_audit_action_check'
              and conrelid = 'hr.access_audit'::regclass
              and pg_get_constraintdef(oid) not like '%write%') then
    alter table hr.access_audit drop constraint access_audit_action_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'access_audit_action_check'
                  and conrelid = 'hr.access_audit'::regclass) then
    alter table hr.access_audit add constraint access_audit_action_check
      check (action in ('read','list','export','reveal_field','bulk_read','print','write','denied'));
  end if;

  if exists (select 1 from pg_constraint where conname = 'access_audit_sensitivity_tier_check'
              and conrelid = 'hr.access_audit'::regclass
              and pg_get_constraintdef(oid) not like '%directory%') then
    alter table hr.access_audit drop constraint access_audit_sensitivity_tier_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'access_audit_sensitivity_tier_check'
                  and conrelid = 'hr.access_audit'::regclass) then
    alter table hr.access_audit add constraint access_audit_sensitivity_tier_check
      check (sensitivity_tier in ('directory','internal','confidential','restricted'));
  end if;

  if exists (select 1 from pg_constraint where conname = 'access_audit_actor_type_check'
              and conrelid = 'hr.access_audit'::regclass
              and pg_get_constraintdef(oid) not like '%anonymous_reporter%') then
    alter table hr.access_audit drop constraint access_audit_actor_type_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'access_audit_actor_type_check'
                  and conrelid = 'hr.access_audit'::regclass) then
    -- SPEC-ACCESS §6.1's taxonomy, all 15
    alter table hr.access_audit add constraint access_audit_actor_type_check
      check (actor_type in ('employee','manager','hr_admin','org_owner','platform_admin',
                            'kiosk_device','external_signer','applicant','preboarding_hire',
                            'former_employee','anonymous_reporter','external_investigator',
                            'integration','automation','ai_agent'));
  end if;

  if exists (select 1 from pg_constraint where conname = 'access_audit_actor_identified'
              and conrelid = 'hr.access_audit'::regclass
              and pg_get_constraintdef(oid) not like '%actor_token_id%') then
    alter table hr.access_audit drop constraint access_audit_actor_identified;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'access_audit_actor_identified'
                  and conrelid = 'hr.access_audit'::regclass) then
    -- 🚨 an OUTSIDER identifies by token and by nothing else. §5.1: "the token id, never a person".
    alter table hr.access_audit add constraint access_audit_actor_identified
      check (case actor_type
               when 'kiosk_device'          then actor_device_id is not null
               when 'external_signer'       then actor_token_id is not null or actor_external_ref is not null
               when 'applicant'             then actor_token_id is not null
               when 'preboarding_hire'      then actor_token_id is not null
               when 'former_employee'       then actor_token_id is not null
               when 'anonymous_reporter'    then actor_token_id is not null
               when 'external_investigator' then actor_token_id is not null
               when 'ai_agent'              then actor_agent_id is not null
               when 'integration'           then actor_external_ref is not null
               when 'automation'            then true
               else actor_user_id is not null or actor_employment_id is not null
             end);
  end if;
end $$;

-- the writer defaults `sensitivity_tier` to 'confidential'; governance writes pass 'directory'
comment on column hr.access_audit.sensitivity_tier is
  'The tier of the RECORD the event is about, on the same four-value vocabulary hr.record_class uses. A governance write (a role assignment, an authority grant) is `directory`.';

-- ============================================================ §1.2 the governance write lane
-- Shape, in order, exactly as §1.2 specifies (the public.admin_manage_organization_membership
-- shape): auth.uid() gate → capability gate → the write → an hr.access_audit row.
-- Refusals RETURN (RECORDED DECISION 2).

create or replace function hr._governance_refusal(
  p_org uuid, p_target_token text, p_reason_code text, p_reason text,
  p_subject_employment uuid default null, p_target_ids uuid[] default '{}')
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_audit uuid;
begin
  v_audit := hr._record_access_audit(
    p_organization_id => p_org, p_action => 'denied', p_target_token => p_target_token,
    p_purpose => 'governance', p_basis => 'refused', p_granted => false,
    p_target_ids => coalesce(p_target_ids,'{}'), p_sensitivity_tier => 'directory',
    p_subject_employment_id => p_subject_employment, p_denial_reason => p_reason);
  return jsonb_build_object('granted', false, 'reason', p_reason_code,
                            'detail', p_reason, 'audit_id', v_audit);
end
$fn$;

revoke all on function hr._governance_refusal(uuid, text, text, text, uuid, uuid[]) from public;
grant execute on function hr._governance_refusal(uuid, text, text, text, uuid, uuid[]) to service_role;

-- ---------------------------------------------------------------- hr_role_assign
create or replace function public.hr_role_assign(
  p_employment_id        uuid,
  p_role_key             text,
  p_scope_kind           text   default 'org',
  p_scope_id             uuid   default null,
  p_scope_employment_ids uuid[] default '{}',
  p_effective_from       date   default current_date,
  p_effective_to         date   default null,
  p_reason               text   default null)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_id  uuid;
  v_audit uuid;
  v_assignable boolean;
  v_actor_emp uuid;
begin
  if v_uid is null then
    raise exception 'hr_role_assign: no authenticated caller' using errcode = '42501';
  end if;

  select em.organization_id into v_org from hr.employment em
   where em.id = p_employment_id and em.deleted_at is null;
  if v_org is null then
    raise exception 'hr_role_assign: no hr.employment with id %', p_employment_id using errcode = 'P0002';
  end if;

  select ar.is_assignable into v_assignable from hr.access_role ar
   where ar.role_key = p_role_key and ar.deleted_at is null and ar.is_active
     and ar.organization_id in (v_org, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
   order by (ar.organization_id = v_org) desc limit 1;
  if v_assignable is null then
    raise exception 'hr_role_assign: % is not a registered hr.access_role', p_role_key using errcode = '22023';
  end if;
  if not v_assignable then
    -- `manager` and `employee` are DERIVED, never assigned (§1.4). Refusing by name is what stops
    -- someone "granting" a lane that is computed.
    return hr._governance_refusal(v_org, 'hr_role_assignment', 'role_not_assignable',
      format('%s is a derived role and is never assigned; it is resolved from the reporting line or the login on the person row (SPEC-ACCESS §1.4)', p_role_key),
      p_employment_id);
  end if;

  -- §1.2's gate: the role.assign capability, or org owner
  if not (hr.capability(v_uid, 'role.assign', p_employment_id)
          or exists (select 1 from iam.organization_member om
                      where om.organization_id = v_org and om.user_id = v_uid and om.role = 'owner')) then
    return hr._governance_refusal(v_org, 'hr_role_assignment', 'no_capability',
      'the caller holds neither the role.assign capability over this population nor org ownership',
      p_employment_id);
  end if;

  select em.id into v_actor_emp from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = v_org and em.deleted_at is null limit 1;

  perform set_config('hr.privileged_write','on',true);
  insert into hr.role_assignment
    (organization_id, employment_id, role_key, scope_kind, scope_id, scope_employment_ids,
     effective_from, effective_to, granted_by_employment_id, granted_by_user_id, reason)
  values (v_org, p_employment_id, p_role_key, p_scope_kind, p_scope_id, coalesce(p_scope_employment_ids,'{}'),
          p_effective_from, p_effective_to, v_actor_emp, v_uid, p_reason)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_role_assignment',
    p_purpose => 'governance', p_basis => 'role', p_granted => true,
    p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => p_employment_id, p_access_role_key => p_role_key,
    p_justification => p_reason, p_actor_employment_id => v_actor_emp,
    p_request_context => jsonb_build_object('scope_kind', p_scope_kind, 'scope_id', p_scope_id));

  -- the derivation trigger on hr.role_assignment does the grant work synchronously (§2.4)
  return jsonb_build_object('granted', true, 'assignment_id', v_id, 'audit_id', v_audit);
end
$fn$;

-- ---------------------------------------------------------------- hr_role_revoke
create or replace function public.hr_role_revoke(p_assignment_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_emp uuid; v_key text; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr_role_revoke: no authenticated caller' using errcode = '42501';
  end if;
  select ra.organization_id, ra.employment_id, ra.role_key into v_org, v_emp, v_key
    from hr.role_assignment ra where ra.id = p_assignment_id;
  if v_org is null then
    raise exception 'hr_role_revoke: no hr.role_assignment with id %', p_assignment_id using errcode = 'P0002';
  end if;

  if not (hr.capability(v_uid, 'role.assign', v_emp)
          or exists (select 1 from iam.organization_member om
                      where om.organization_id = v_org and om.user_id = v_uid and om.role = 'owner')) then
    return hr._governance_refusal(v_org, 'hr_role_assignment', 'no_capability',
      'the caller holds neither role.assign over this population nor org ownership', v_emp,
      ARRAY[p_assignment_id]);
  end if;

  perform set_config('hr.privileged_write','on',true);
  -- never a delete: the immutable-history rule (AD-8). The row stays and stops being active.
  update hr.role_assignment
     set is_active = false, revoked_at = now(), revoked_reason = p_reason,
         effective_to = least(coalesce(effective_to, current_date), current_date)
   where id = p_assignment_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_role_assignment',
    p_purpose => 'governance', p_basis => 'role', p_granted => true,
    p_target_ids => ARRAY[p_assignment_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => v_emp, p_access_role_key => v_key, p_justification => p_reason,
    p_request_context => '{"op":"revoke"}'::jsonb);

  return jsonb_build_object('granted', true, 'assignment_id', p_assignment_id, 'audit_id', v_audit);
end
$fn$;

-- ---------------------------------------------------------------- hr_authority_grant
create or replace function public.hr_authority_grant(
  p_holder_kind          text,
  p_holder_id            text,
  p_action_type          text,
  p_scope_kind           text   default 'org',
  p_scope_id             uuid   default null,
  p_scope_employment_ids uuid[] default '{}',
  p_limits               jsonb  default '{}'::jsonb,
  p_rank                 integer default 100,
  p_effective_from       date   default current_date,
  p_effective_to         date   default null,
  p_reason               text   default null,
  p_organization_id      uuid   default null)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_id uuid; v_audit uuid; v_holder_emp uuid;
begin
  if v_uid is null then
    raise exception 'hr_authority_grant: no authenticated caller' using errcode = '42501';
  end if;

  if not exists (select 1 from platform.categories c
                  where c.dimension = 'hr_approval_action' and c.slug = p_action_type
                    and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and c.deleted_at is null) then
    raise exception 'hr_authority_grant: % is not a registered hr_approval_action', p_action_type
      using errcode = '22023';
  end if;

  -- resolve the org from the holder where we can, so a caller cannot grant into another tenant
  if p_holder_kind = 'employment' then
    select em.organization_id into v_org from hr.employment em where em.id = p_holder_id::uuid;
    v_holder_emp := p_holder_id::uuid;
  elsif p_holder_kind = 'position' then
    select pa.organization_id, pa.employment_id into v_org, v_holder_emp
      from hr.position_assignment pa where pa.id = p_holder_id::uuid;
  else
    v_org := p_organization_id;
  end if;
  if v_org is null then
    raise exception 'hr_authority_grant: the organization could not be resolved from the holder; pass p_organization_id for a role holder'
      using errcode = 'P0002';
  end if;

  if not (hr.capability(v_uid, 'authority.grant', v_holder_emp)
          or exists (select 1 from iam.organization_member om
                      where om.organization_id = v_org and om.user_id = v_uid and om.role = 'owner')) then
    return hr._governance_refusal(v_org, 'hr_approval_authority', 'no_capability',
      'the caller holds neither the authority.grant capability nor org ownership', v_holder_emp);
  end if;

  perform set_config('hr.privileged_write','on',true);
  insert into hr.approval_authority
    (organization_id, holder_kind, holder_id, action_type, scope_kind, scope_id,
     scope_employment_ids, limits, rank, effective_from, effective_to, source,
     granted_by_user_id, reason)
  values (v_org, p_holder_kind, p_holder_id, p_action_type, p_scope_kind, p_scope_id,
          coalesce(p_scope_employment_ids,'{}'), coalesce(p_limits,'{}'::jsonb), p_rank,
          p_effective_from, p_effective_to, 'assigned', v_uid, p_reason)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_approval_authority',
    p_purpose => 'governance', p_basis => 'authority', p_granted => true,
    p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => v_holder_emp, p_justification => p_reason,
    p_request_ref => p_action_type);

  return jsonb_build_object('granted', true, 'authority_id', v_id, 'audit_id', v_audit);
end
$fn$;

-- ---------------------------------------------------------------- hr_authority_revoke
create or replace function public.hr_authority_revoke(p_authority_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_audit uuid; v_holder_emp uuid; v_kind text; v_hid text;
begin
  if v_uid is null then
    raise exception 'hr_authority_revoke: no authenticated caller' using errcode = '42501';
  end if;
  select aa.organization_id, aa.holder_kind, aa.holder_id into v_org, v_kind, v_hid
    from hr.approval_authority aa where aa.id = p_authority_id;
  if v_org is null then
    raise exception 'hr_authority_revoke: no hr.approval_authority with id %', p_authority_id using errcode = 'P0002';
  end if;
  if v_kind = 'employment' then v_holder_emp := v_hid::uuid; end if;

  if not (hr.capability(v_uid, 'authority.grant', v_holder_emp)
          or exists (select 1 from iam.organization_member om
                      where om.organization_id = v_org and om.user_id = v_uid and om.role = 'owner')) then
    return hr._governance_refusal(v_org, 'hr_approval_authority', 'no_capability',
      'the caller holds neither authority.grant nor org ownership', v_holder_emp, ARRAY[p_authority_id]);
  end if;

  perform set_config('hr.privileged_write','on',true);
  update hr.approval_authority
     set is_active = false, effective_to = least(coalesce(effective_to, current_date), current_date),
         reason = coalesce(reason,'') || case when p_reason is null then '' else ' | revoked: ' || p_reason end
   where id = p_authority_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_approval_authority',
    p_purpose => 'governance', p_basis => 'authority', p_granted => true,
    p_target_ids => ARRAY[p_authority_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => v_holder_emp, p_justification => p_reason,
    p_request_context => '{"op":"revoke"}'::jsonb);

  return jsonb_build_object('granted', true, 'authority_id', p_authority_id, 'audit_id', v_audit);
end
$fn$;

-- ---------------------------------------------------------------- hr_authority_delegation_request
-- RECORDED DECISION 3: built here because §9 T-21 must be provable today; routed to HRB-008.
create or replace function public.hr_authority_delegation_request(
  p_authority_id            uuid,
  p_delegate_employment_id  uuid,
  p_effective_from          date,
  p_effective_to            date,
  p_reason                  text)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_kind text; v_hid text; v_holder_emp uuid;
  v_id uuid; v_audit uuid; v_horizon integer; v_depth integer; v_source text;
begin
  if v_uid is null then
    raise exception 'hr_authority_delegation_request: no authenticated caller' using errcode = '42501';
  end if;
  select aa.organization_id, aa.holder_kind, aa.holder_id, aa.source
    into v_org, v_kind, v_hid, v_source
    from hr.approval_authority aa where aa.id = p_authority_id and aa.is_active;
  if v_org is null then
    raise exception 'hr_authority_delegation_request: no active hr.approval_authority with id %', p_authority_id
      using errcode = 'P0002';
  end if;
  if v_kind = 'employment' then v_holder_emp := v_hid::uuid; end if;

  -- only the HOLDER hands their own authority on
  if v_holder_emp is null or not (v_holder_emp = any(hr.employments_of(v_uid))) then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'not_the_holder',
      'only the holder of an authority may delegate it', v_holder_emp, ARRAY[p_authority_id]);
  end if;

  -- §1.3b: depth ≤ hr.approvals.delegation_max_depth, so materialising from an already-delegated
  -- row is refused (default depth 1)
  v_depth := (hr._knob('hr.approvals','delegation_max_depth') #>> '{}')::integer;
  if v_source = 'delegated' and v_depth < 2 then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'redelegation_too_deep',
      format('re-delegation depth exceeds hr.approvals.delegation_max_depth (%s)', v_depth),
      v_holder_emp, ARRAY[p_authority_id]);
  end if;

  -- expiry is mandatory and bounded
  v_horizon := (hr._knob('hr.approvals','delegation_max_horizon_days') #>> '{}')::integer;
  if p_effective_to is null or p_effective_to > p_effective_from + v_horizon then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'horizon_exceeded',
      format('a delegation must end, and no later than %s days after it starts', v_horizon),
      v_holder_emp, ARRAY[p_authority_id]);
  end if;

  perform set_config('hr.privileged_write','on',true);
  insert into hr.approval_delegation
    (organization_id, authority_id, delegator_employment_id, delegate_employment_id,
     effective_from, effective_to, reason)
  values (v_org, p_authority_id, v_holder_emp, p_delegate_employment_id,
          p_effective_from, p_effective_to, p_reason)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_approval_delegation',
    p_purpose => 'governance', p_basis => 'authority', p_granted => true,
    p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => p_delegate_employment_id, p_justification => p_reason);

  return jsonb_build_object('granted', true, 'delegation_id', v_id, 'state', 'pending',
                            'audit_id', v_audit);
end
$fn$;

-- ---------------------------------------------------------------- hr_authority_delegate
-- 🚨 ACCEPTANCE IS WHAT MATERIALISES THE AUTHORITY. Until this runs, the delegation grants exactly
-- nothing — hr.can_approve and SPEC-WORKFLOW-ENGINE's resolver read hr.approval_authority and
-- nothing else, so there is no second code path in which a delegated right is evaluated
-- differently from an assigned one.
create or replace function public.hr_authority_delegate(p_delegation_id uuid)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_uid uuid := auth.uid(); d hr.approval_delegation%rowtype; a hr.approval_authority%rowtype;
  v_new uuid; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr_authority_delegate: no authenticated caller' using errcode = '42501';
  end if;
  select * into d from hr.approval_delegation where id = p_delegation_id;
  if not found then
    raise exception 'hr_authority_delegate: no hr.approval_delegation with id %', p_delegation_id using errcode = 'P0002';
  end if;
  select * into a from hr.approval_authority where id = d.authority_id;

  -- only the DELEGATE accepts. A delegation the delegate never accepted grants nothing.
  if not (d.delegate_employment_id = any(hr.employments_of(v_uid))) then
    return hr._governance_refusal(d.organization_id, 'hr_approval_delegation', 'not_the_delegate',
      'only the named delegate may accept a delegation', d.delegate_employment_id, ARRAY[p_delegation_id]);
  end if;
  if d.state <> 'pending' then
    return hr._governance_refusal(d.organization_id, 'hr_approval_delegation', 'not_pending',
      format('this delegation is %s and can no longer be accepted', d.state),
      d.delegate_employment_id, ARRAY[p_delegation_id]);
  end if;

  perform set_config('hr.privileged_write','on',true);
  -- scope, limits and rank are inherited or LEAST()'d — a delegation is never wider than the
  -- authority it substitutes for, and its expiry is mandatory.
  insert into hr.approval_authority
    (organization_id, holder_kind, holder_id, action_type, scope_kind, scope_id,
     scope_employment_ids, limits, rank, effective_from, effective_to, source,
     delegated_from_id, delegation_id, granted_by_user_id, reason)
  values (a.organization_id, 'employment', d.delegate_employment_id::text, a.action_type,
          a.scope_kind, a.scope_id, a.scope_employment_ids, a.limits,
          greatest(a.rank, 100), d.effective_from,
          least(d.effective_to, coalesce(a.effective_to, d.effective_to)), 'delegated',
          a.id, d.id, v_uid, d.reason)
  returning id into v_new;

  update hr.approval_delegation
     set state = 'accepted', responded_at = now(), materialized_authority_id = v_new
   where id = p_delegation_id;

  v_audit := hr._record_access_audit(
    p_organization_id => d.organization_id, p_action => 'write',
    p_target_token => 'hr_approval_authority', p_purpose => 'governance', p_basis => 'authority',
    p_granted => true, p_target_ids => ARRAY[v_new], p_sensitivity_tier => 'directory',
    p_subject_employment_id => d.delegate_employment_id, p_justification => d.reason,
    p_request_context => jsonb_build_object('delegation_id', d.id, 'delegated_from', a.id));

  return jsonb_build_object('granted', true, 'authority_id', v_new, 'delegation_id', d.id,
                            'audit_id', v_audit);
end
$fn$;

-- ---------------------------------------------------------------- hr_authority_delegation_end
create or replace function public.hr_authority_delegation_end(p_delegation_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_uid uuid := auth.uid(); d hr.approval_delegation%rowtype; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr_authority_delegation_end: no authenticated caller' using errcode = '42501';
  end if;
  select * into d from hr.approval_delegation where id = p_delegation_id;
  if not found then
    raise exception 'hr_authority_delegation_end: no hr.approval_delegation with id %', p_delegation_id using errcode = 'P0002';
  end if;

  if not (d.delegator_employment_id = any(hr.employments_of(v_uid))
          or d.delegate_employment_id = any(hr.employments_of(v_uid))
          or hr.capability(v_uid, 'authority.grant', d.delegator_employment_id)) then
    return hr._governance_refusal(d.organization_id, 'hr_approval_delegation', 'no_capability',
      'only the delegator, the delegate, or an authority.grant holder may end a delegation',
      d.delegate_employment_id, ARRAY[p_delegation_id]);
  end if;

  perform set_config('hr.privileged_write','on',true);
  -- ending writes effective_to (and is_active where the end is immediate), NEVER a delete — the
  -- immutable-history rule (AD-8)
  if d.materialized_authority_id is not null then
    update hr.approval_authority
       set effective_to = least(coalesce(effective_to, current_date), current_date),
           is_active = false
     where id = d.materialized_authority_id;
  end if;
  update hr.approval_delegation
     set state = 'revoked', revoked_at = now(), revoked_reason = p_reason
   where id = p_delegation_id;

  v_audit := hr._record_access_audit(
    p_organization_id => d.organization_id, p_action => 'write',
    p_target_token => 'hr_approval_delegation', p_purpose => 'governance', p_basis => 'authority',
    p_granted => true, p_target_ids => ARRAY[p_delegation_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => d.delegate_employment_id, p_justification => p_reason,
    p_request_context => '{"op":"end"}'::jsonb);

  return jsonb_build_object('granted', true, 'delegation_id', p_delegation_id, 'audit_id', v_audit);
end
$fn$;

-- ============================================================ §1.1 the activation bootstrap
-- 🚨 THE ONE BOUNDED STANDING CONFERRAL IN THE DOMAIN. A role assignment needs an employment_id,
-- and an org that has just enabled HR has zero employments — so under §1.1's three-sources rule
-- nobody could ever create the first employee. This is the named, bounded resolution, and it
-- grants no reach the caller did not already have: the gate is org owner/admin, who can already
-- read every row in the org through the kernel's org-admin arm.
-- IT IS NOT A LANE. hr.capability() never consults org role. Activation WRITES a role assignment;
-- it does not BECOME one, so there is no standing org-admin path into HR data afterwards.
create or replace function public.hr_activate_employer(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_org  uuid := nullif(p_payload ->> 'organization_id','')::uuid;
  v_nominee_user uuid := nullif(p_payload ->> 'nominee_user_id','')::uuid;
  v_prof uuid; v_loc uuid; v_dept uuid; v_emp uuid; v_empl uuid; v_ra uuid;
  v_party uuid; v_audit uuid; v_jur uuid;
begin
  if v_uid is null then
    raise exception 'hr_activate_employer: no authenticated caller' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'hr_activate_employer: organization_id is required' using errcode = '22023';
  end if;

  -- ---- THE GATE: org owner or admin of the TARGET org
  if not exists (select 1 from iam.organization_member om
                  where om.organization_id = v_org and om.user_id = v_uid
                    and om.role in ('owner','admin')) then
    return hr._governance_refusal(v_org, 'hr_employer_profile', 'not_org_owner_or_admin',
      'activation is gated on org ownership or administration of the target organization (SPEC-ACCESS §1.1)');
  end if;

  -- ---- ONE SHOT MEANS ONE SHOT. Live OR historical: a second HR owner is an ordinary
  --      hr_role_assign call made by the first.
  if exists (select 1 from hr.role_assignment ra
              where ra.organization_id = v_org and ra.role_key = 'hr_owner') then
    return hr._governance_refusal(v_org, 'hr_employer_profile', 'already_activated',
      'this organization already has an hr_owner assignment, live or historical; a second HR owner is an ordinary hr_role_assign call made by the first');
  end if;

  v_nominee_user := coalesce(v_nominee_user, v_uid);
  if not exists (select 1 from iam.organization_member om
                  where om.organization_id = v_org and om.user_id = v_nominee_user) then
    return hr._governance_refusal(v_org, 'hr_employer_profile', 'nominee_not_a_member',
      'the nominee must be a member of the organization');
  end if;

  perform set_config('hr.privileged_write','on',true);

  -- the employer of record
  insert into hr.employer_profile (organization_id, legal_name, ein)
  values (v_org,
          coalesce(p_payload ->> 'legal_name', 'Employer'),
          coalesce(p_payload ->> 'ein', '00-0000000'))
  returning id into v_prof;

  -- 🚨 the first LOCATION, without which nothing can be scheduled or stamped: address + IANA
  -- timezone + jurisdiction are what every downstream record is stamped from (AR 1.4 / AR2 LOCK 4)
  v_jur := nullif(p_payload ->> 'jurisdiction_id','')::uuid;
  if v_jur is null then
    select j.id into v_jur from hr.jurisdiction j where j.level = 'federal' limit 1;
  end if;
  if v_jur is null then
    raise exception 'hr_activate_employer: no hr.jurisdiction is seeded; activation cannot stamp a location'
      using errcode = 'P0001',
            hint = 'HRB-009 seeds the jurisdiction tree. A location with no jurisdiction cannot lawfully stamp anything downstream.';
  end if;
  insert into hr.location (organization_id, name, tz, jurisdiction_id)
  values (v_org, coalesce(p_payload ->> 'location_name','Head office'),
          coalesce(p_payload ->> 'tz','America/Los_Angeles'), v_jur)
  returning id into v_loc;

  insert into hr.department (organization_id, name)
  values (v_org, coalesce(p_payload ->> 'department_name','General'))
  returning id into v_dept;

  -- the nominee's person, via crm.ensure_user_party
  v_party := crm.ensure_user_party(v_nominee_user, v_org);

  insert into hr.employee (organization_id, party_id, employee_number, legal_first_name,
                           legal_last_name, display_name, login_user_id, primary_location_id)
  values (v_org, v_party,
          coalesce(p_payload ->> 'employee_number', 'EMP-00001'),
          coalesce(p_payload ->> 'legal_first_name','First'),
          coalesce(p_payload ->> 'legal_last_name','Last'),
          coalesce(p_payload ->> 'display_name',
                   coalesce(p_payload ->> 'legal_first_name','First') || ' ' ||
                   coalesce(p_payload ->> 'legal_last_name','Last')),
          v_nominee_user, v_loc)
  returning id into v_emp;

  -- RECORDED DECISION 4: created_by is the NOMINEE's login, not the caller's
  insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status,
                             created_by)
  values (v_org, v_emp, v_prof,
          coalesce(nullif(p_payload ->> 'hire_date','')::date, current_date), 'active',
          v_nominee_user)
  returning id into v_empl;

  insert into hr.role_assignment
    (organization_id, employment_id, role_key, scope_kind, effective_from,
     granted_by_user_id, reason)
  values (v_org, v_empl, 'hr_owner', 'org', current_date, v_uid,
          'Employer activation (SPEC-ACCESS §1.1) — the one bounded standing conferral')
  returning id into v_ra;

  -- ---- ACTIVATION IS THE SINGLE HIGHEST-PRIVILEGE EVENT IN THE DOMAIN'S LIFE AND IT MUST BE
  --      VISIBLE FOREVER (§1.1). basis='activation', actor_type='org_owner', naming the nominee.
  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_employer_profile',
    p_purpose => 'governance', p_basis => 'activation', p_granted => true,
    p_target_ids => ARRAY[v_prof, v_emp, v_empl, v_ra], p_sensitivity_tier => 'directory',
    p_subject_employment_id => v_empl, p_actor_type => 'org_owner',
    p_justification => 'Employer activation: created the employer profile, the first location and department, the nominee''s person and spell, and the first hr_owner role assignment.',
    p_request_context => jsonb_build_object('nominee_user_id', v_nominee_user,
                                            'employer_profile_id', v_prof,
                                            'location_id', v_loc, 'department_id', v_dept));

  return jsonb_build_object(
    'granted', true, 'employer_profile_id', v_prof, 'location_id', v_loc,
    'department_id', v_dept, 'employee_id', v_emp, 'employment_id', v_empl,
    'role_assignment_id', v_ra, 'audit_id', v_audit);
end
$fn$;

-- ============================================================ grants
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'public.hr_role_assign(uuid, text, text, uuid, uuid[], date, date, text)',
    'public.hr_role_revoke(uuid, text)',
    'public.hr_authority_grant(text, text, text, text, uuid, uuid[], jsonb, integer, date, date, text, uuid)',
    'public.hr_authority_revoke(uuid, text)',
    'public.hr_authority_delegation_request(uuid, uuid, date, date, text)',
    'public.hr_authority_delegate(uuid)',
    'public.hr_authority_delegation_end(uuid, text)',
    'public.hr_activate_employer(jsonb)'] loop
    -- 🚨 REVOKING FROM `public` IS NOT ENOUGH. Supabase sets ALTER DEFAULT PRIVILEGES granting
    -- EXECUTE on new functions in `public` to anon/authenticated/service_role, so every function
    -- created here arrives with an EXPLICIT anon grant that a `from public` revoke does not touch.
    -- §9 T-34 is exact: the only anon EXECUTE grants in this domain are hr_kiosk_* and outsider_*.
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ DDL guard acknowledgement
-- The three CHECK corrections above are ALTERs on a table an earlier file created, and an ALTER
-- re-fires the guard (the lesson file 04 of the schema build recorded). Log-driven and scoped to
-- the ONE rule, so a genuinely new finding under any other rule still fails the migration.
do $$
declare r record;
begin
  for r in select distinct object_ref from platform.ddl_guard_log
            where acknowledged_at is null and object_ref like 'hr.%'
              and rule = 'org_not_null_no_backstop' loop
    perform platform.ddl_guard_ack(
      p_reason => 'HR is org-explicit by the 2026-08-21 NO-NULL-ORG ruling; no assignment trigger by design (SPEC-DATA-MODEL 1.3)',
      p_by     => 'hr-domain-migration hr_c3_04',
      p_rule   => 'org_not_null_no_backstop',
      p_object_ref => r.object_ref);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v_bad integer; v_rules text;
begin
  if not iam.canonical_certify_ok('hr','access_audit','hr_access_audit') then
    raise exception 'hr_c3_04: hr.access_audit stopped certifying after the CHECK corrections';
  end if;

  -- the widened vocabularies really are widened
  if (select pg_get_constraintdef(oid) from pg_constraint where conname='access_audit_action_check'
       and conrelid='hr.access_audit'::regclass) not like '%write%' then
    raise exception 'hr_c3_04: action CHECK still cannot express a governance write';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname='access_audit_actor_type_check'
       and conrelid='hr.access_audit'::regclass) not like '%anonymous_reporter%' then
    raise exception 'hr_c3_04: actor_type CHECK is not SPEC-ACCESS §6.1''s taxonomy';
  end if;

  -- 🚨 THE CLIENT-CALLABLE RPCs LIVE IN `public`, and that is the whole reason SPEC-ACCESS spells
  -- them `hr_role_assign` rather than `hr.role_assign`: PostgREST exposes `public`, the `hr`
  -- schema is not exposed, and a definer RPC reached through PostgREST *is* direct-to-Supabase, so
  -- the workspace data-path law is satisfied. Same shape as public.admin_manage_organization_membership.
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_role_assign','hr_role_revoke','hr_authority_grant','hr_authority_revoke',
                       'hr_authority_delegation_request','hr_authority_delegate',
                       'hr_authority_delegation_end','hr_activate_employer');
  if v_bad <> 8 then
    raise exception 'hr_c3_04: expected 8 public governance RPCs, found %', v_bad;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = '_governance_refusal') then
    raise exception 'hr_c3_04: hr._governance_refusal is missing';
  end if;

  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_role_assign','hr_role_revoke','hr_authority_grant','hr_authority_revoke',
                       'hr_authority_delegation_request','hr_authority_delegate',
                       'hr_authority_delegation_end','hr_activate_employer')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_c3_04: % governance RPCs are executable by anon (§9 T-34)', v_bad;
  end if;

  select count(*), string_agg(distinct rule, ', ') into v_bad, v_rules
    from platform.ddl_guard_log where acknowledged_at is null and object_ref like 'hr.%';
  if v_bad > 0 then
    raise exception 'hr_c3_04: % unacked hr.%% DDL guard rows remain under rule(s): %', v_bad, v_rules;
  end if;
end $$;
