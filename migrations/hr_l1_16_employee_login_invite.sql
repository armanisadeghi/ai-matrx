-- HR domain L1 — migration 16 (register item HRB-013, lane l1-employees).
--
-- 🚨 THE EMPLOYEE LOGIN INVITE — the constraint that outranked the whole bug list.
-- `public.hr_employee_invite` and `public.hr_invite_accept`.
--
-- Applied live as `hr_l1_16_employee_login_invite`. Idempotent.
-- Authority: SPEC-EMPLOYEES §4.1 nodes L/L1/L2, §9 (`hr.people.invited`);
-- G2-VERIFICATION-2026-08-26 § RE-RUN (seven L1 targets unrunnable for want of this).
--
-- ===================================================================================
-- WHY THIS IS THE ONE THAT MATTERED.
--
-- The re-run's per-target summary: *"T-L1-4, 5, 6, 7, 8, 9, 12 FAIL (unrunnable): every one needs
-- either a non-admin employee login or the four-viewer comparison, and no employee login can be
-- created through the product — the hire form's platform account is optional and there is no
-- invite path, so the only login-bearing employee in the system is the admin."* Every access
-- claim this lane makes — the §2.3.1 four-viewer matrix, the subject-exclusion veto, self-service,
-- "absent from the DOM" — is unprovable without a second real person who can sign in.
--
-- 🚨 THE PRIMITIVE ALREADY EXISTS AND IS NOT REBUILT HERE. `iam.invitations` +
-- `public.inv_create` / `inv_accept` / `inv_get_by_token` / `inv_resend` / `inv_revoke` is the
-- platform's canonical invitation system, with a live accept route at
-- `/invitations/organization/accept/[token]` and `features/organizations/service/invitationsService.ts`
-- describing itself as *"THE SOLE CHOKEPOINT for canonical invitations."* Two things were
-- considered and rejected:
--
--   · **Widening `inv_create` to accept an `hr_employee` target type** — it would mean editing
--     `inv_create`, `inv_accept` AND `iam._container_authz`, three functions belonging to the
--     access/iam lane, to add a fourth container kind. But an HR employee is not a container:
--     nobody is a *member of a person*. The thing an employee actually needs is exactly what the
--     existing `organization` target already grants.
--   · **An HR-owned invitations table** — a second invite system, which is the defect the platform
--     spent a chokepoint file preventing.
--
-- So this ships **two thin RPCs over the existing rails**: issuance delegates to `inv_create` with
-- `target_type = 'organization'` (which is the truth — the person is joining the workspace), and
-- the HR-specific half lives where it belongs. The employee linkage rides in
-- `iam.invitations.metadata`, a column that already exists.
--
-- 🚨 THE ACCEPTANCE HALF IS THE PART THE SPEC ASSUMED AND NOBODY BUILT. §4.1 node L2 says *"On
-- acceptance a trigger sets `hr.employee.login_user_id` and re-derives grants."* Read live: the
-- **re-derive half exists and is correct** — `_zzz_derive_grants` fires `AFTER UPDATE OF
-- login_user_id` and calls `hr.derive_grants_bulk`. The **set half does not exist anywhere**:
-- `inv_accept` writes `iam.memberships` and has no knowledge of `hr.employee`, and every writer of
-- `login_user_id` sets it at INSERT time (so the trigger never fires for them). `hr_invite_accept`
-- performs that UPDATE, which is what makes the existing trigger do its job for the first time.
--
-- 🚨 AN AUTHZ MISMATCH BETWEEN THE SPEC AND THE PLATFORM, SURFACED RATHER THAN PAPERED OVER.
-- `inv_create` refuses a non-service caller whose `iam._container_authz` role is not
-- `owner`/`admin`. SPEC-EMPLOYEES §4.1 puts the invite inside the HR admin's hire flow, and
-- SPEC-ACCESS makes HR standing `identity.write` — which is NOT an org role, deliberately
-- (§1.1: "nothing else confers HR standing"). So an HR admin who is not also an org owner/admin
-- cannot issue a platform login, and **that is arguably correct**: a login is access to the whole
-- workspace, not to HR. This lane does not widen the platform's rule on its own authority. The
-- refusal is caught and named (`org_role_required_for_login`) with a sentence saying who can do
-- it, instead of leaking a raw 42501.
-- **→ coordinator: SPEC-EMPLOYEES §4.1 owes one line — either the invite is an org-owner act, or
-- the platform owes HR standing a lane into `inv_create`.**
--
-- 🚨 THE LINK IS RETURNED TO THE ADMIN, ON PURPOSE. Invite email goes through Resend
-- (`lib/email/client.ts`), which cannot deliver in local development, and
-- `app/api/organizations/invite/route.ts` never returns the token to its caller. A login flow that
-- can only be completed if email works is a login flow nobody can verify. `hr_employee_invite`
-- therefore returns the token and the accept path to the HR admin who issued it — the
-- admin-visible activation link the coordinator authorised as the spec-supported alternative. It
-- is the same token the email would carry, is single-use, expires, and is only ever returned to a
-- caller who already passed the `identity.write` gate.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ issuance

create or replace function public.hr_employee_invite(
  p_employee_id uuid,
  p_email text default null,
  p_expires_at timestamptz default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_gate jsonb; v_email text;
  v_login uuid; v_display text; v_emp uuid; v_inv iam.invitations; v_expires timestamptz;
begin
  select e.organization_id, e.login_user_id, e.display_name,
         coalesce(nullif(btrim(p_email), ''), e.work_email)
    into v_org, v_login, v_display, v_email
    from hr.employee e where e.id = p_employee_id and e.deleted_at is null;

  if v_org is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;

  v_emp := (hr.employment_as_of(p_employee_id, current_date)).id;
  v_gate := hr._l1_write_gate(v_org, 'identity.write', v_emp, 'hr_employee', 'invite', 'login');
  if v_gate is not null then return v_gate; end if;

  -- §4.1 node L1: kiosk-only staff are first class and nothing may assume a login. Inviting
  -- somebody who already has one is a caller mistake, not a refusal of access.
  if v_login is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_has_login',
      'detail', format('%s already signs in here. There is nothing to invite them to.', v_display),
      'door', '/hr/people/' || p_employee_id || '/personal');
  end if;

  if v_email is null or btrim(v_email) = '' then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'email',
      'detail', 'An invite needs an email address. Add a work email, or type one for this invite.',
      'door', '/hr/people/' || p_employee_id || '/personal');
  end if;

  v_expires := coalesce(p_expires_at, now() + interval '7 days');

  -- delegate to the canonical primitive; do not reimplement it
  begin
    v_inv := public.inv_create(
      p_target_type => 'organization',
      p_target_id => v_org,
      p_email => v_email,
      p_role => 'member',
      p_org_id => v_org,
      p_invited_user_id => null,
      p_expires_at => v_expires);
  exception
    when insufficient_privilege then
      -- `inv_create` requires an org owner/admin. HR standing is not an org role, by design.
      return jsonb_build_object('ok', false, 'reason', 'org_role_required_for_login',
        'detail', 'A platform login is access to the whole workspace, so an owner or administrator '
               || 'of this organization has to issue it. Ask one of them to invite '
               || coalesce(v_email, 'this person') || '.',
        'door', '/organizations');
    when others then
      return jsonb_build_object('ok', false, 'reason', 'invite_failed',
        'detail', sqlerrm, 'sqlstate', sqlstate);
  end;

  -- the HR linkage rides on the invitation's own metadata; no second table, no second system
  update iam.invitations
     set metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('hr_employee_id', p_employee_id,
                                          'hr_invite', true,
                                          'hr_organization_id', v_org)
   where id = v_inv.id
  returning * into v_inv;

  perform hr._l1_write_audit(v_org, 'hr_employee', 'invite', ARRAY[p_employee_id], v_emp, 'login');

  return jsonb_build_object(
    'ok', true,
    'employee_id', p_employee_id,
    'display_name', v_display,
    'invitation_id', v_inv.id,
    'email', v_inv.email,
    'expires_at', v_inv.expires_at,
    -- 🚨 returned to the ISSUING ADMIN because Resend cannot deliver locally and the platform's
    -- own invite route never exposes the token. Single-use, expiring, and only ever handed to a
    -- caller who already passed the identity.write gate.
    'token', v_inv.token,
    'accept_path', '/invitations/employee/accept/' || v_inv.token,
    'invitee_must_have_an_account', true,
    'notice', 'The invite email is sent where email is configured. The link below is the same '
           || 'one it carries — the person needs an account with this email address to use it.');
end
$fn$;

-- ============================================================ acceptance

create or replace function public.hr_invite_accept(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_inv iam.invitations; v_employee uuid; v_org uuid;
  v_existing uuid; v_accept record;
begin
  if v_uid is null then
    raise exception 'hr_invite_accept: no authenticated caller' using errcode = '42501';
  end if;

  -- accept through the canonical primitive: it validates the token, the expiry, the email match,
  -- and writes the membership. Everything below is only the HR half.
  begin
    select * into v_accept from public.inv_accept(p_token);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'invitation_not_usable',
      'detail', 'That invitation is not valid for this account. It may have expired, been used '
             || 'already, or been issued to a different email address.');
  end;

  select * into v_inv from iam.invitations i where i.token = p_token;
  v_employee := nullif(v_inv.metadata ->> 'hr_employee_id','')::uuid;
  v_org := coalesce(nullif(v_inv.metadata ->> 'hr_organization_id','')::uuid, v_inv.organization_id);

  -- a plain org invitation accepted through this door is not an error; it simply has no HR half.
  if v_employee is null then
    return jsonb_build_object('ok', true, 'hr_linked', false,
      'organization_id', v_inv.organization_id,
      'detail', 'You have joined the organization. This invitation was not tied to an employee record.');
  end if;

  select e.login_user_id into v_existing from hr.employee e where e.id = v_employee;

  -- somebody else already claimed this record: never silently repoint a person's login.
  if v_existing is not null and v_existing is distinct from v_uid then
    return jsonb_build_object('ok', false, 'reason', 'employee_already_linked',
      'organization_id', v_org,
      'detail', 'That employee record is already linked to a different account. An HR '
             || 'administrator needs to sort this out before it can be linked to yours.');
  end if;

  if v_existing is null then
    perform hr.arm_write();
    -- 🚨 THIS UPDATE IS THE POINT. `_zzz_derive_grants` fires `AFTER UPDATE OF login_user_id` and
    -- re-derives every grant for this person's spells — the half of §4.1 node L2 that already
    -- existed and had never once run, because every other writer sets the column at INSERT.
    update hr.employee set login_user_id = v_uid where id = v_employee;
  end if;

  perform hr._l1_write_audit(v_org, 'hr_employee', 'invite_accepted', ARRAY[v_employee],
                             (hr.employment_as_of(v_employee, current_date)).id, 'login');

  return jsonb_build_object(
    'ok', true, 'hr_linked', true,
    'employee_id', v_employee,
    'organization_id', v_org,
    'login_user_id', v_uid,
    'grants_rederived', true,
    'door', '/hr/me');
end
$fn$;

-- ============================================================ grants

do $$ declare f text; begin
  foreach f in array ARRAY[
    'public.hr_employee_invite(uuid, text, timestamptz)',
    'public.hr_invite_accept(text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions

do $$
declare v_bad int;
begin
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_employee_invite','hr_invite_accept');
  if v_bad <> 2 then
    raise exception 'hr_l1_16: expected both invite RPCs, found %', v_bad;
  end if;

  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_employee_invite','hr_invite_accept')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_16: % invite RPC(s) executable by anon', v_bad;
  end if;

  -- 🚨 THE PRIMITIVE IS REUSED, NOT REBUILT. If either of these ever stops delegating, somebody
  -- has grown a second invitation system beside the platform's chokepoint.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_employee_invite') not like '%inv_create%' then
    raise exception 'hr_l1_16: hr_employee_invite no longer delegates to inv_create';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_invite_accept') not like '%inv_accept%' then
    raise exception 'hr_l1_16: hr_invite_accept no longer delegates to inv_accept';
  end if;

  -- and no HR-owned invitations table may have appeared
  if exists (select 1 from information_schema.tables
              where table_schema = 'hr' and table_name ilike '%invitation%'
                and table_name <> 'survey_invitation') then
    raise exception 'hr_l1_16: an HR-owned invitations table exists — the platform already has one';
  end if;

  -- the trigger this whole design depends on must still be armed
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'hr' and c.relname = 'employee'
                   and t.tgname = '_zzz_derive_grants' and not t.tgisinternal) then
    raise exception 'hr_l1_16: hr.employee._zzz_derive_grants is gone — accepting an invite would '
                    'link the login and derive no grants';
  end if;

  select count(*) into v_bad from hr.stable_doors_that_write();
  if v_bad > 0 then
    raise exception 'hr_l1_16: % non-volatile door(s) can reach a writer', v_bad;
  end if;
end $$;
