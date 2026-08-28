-- hr_l1_50_the_generic_door_cannot_half_link.sql
--
-- 🚨 NO PATH MAY PRODUCE A HALF-LINKED PERSON — the same law as hr_l1_44, from the other
-- direction. hr_l1_44 stopped `login_user_id` being written with no membership. This stops
-- a membership being written with no `login_user_id`.
--
-- `public.inv_accept` writes the MEMBERSHIP and stops. For an HR-tied invitation that is
-- only half the act: `hr.employee.login_user_id` stays NULL, and NO TRIGGER binds it —
-- verified against pg_trigger; `public.hr_invite_accept` is the only thing that does. The
-- result is somebody who is a member of the employer and cannot open their own HR record.
--
-- WHICH WORLD WE WERE IN, established before fixing anything:
--   · The real accept surface `/invitations/employee/accept/<token>` calls
--     `acceptHrEmployeeInvite` → `hr_invite_accept`. CORRECT.
--   · No UI lists invitations generically (`useAcceptInvitation` has no .tsx callers, and
--     there is no pending-invitations screen), so nothing routes an HR invite to the
--     generic door by itself.
--   · An HR-tied invitation is nevertheless INDISTINGUISHABLE by shape — `target_type` is
--     'organization' like any other; only `metadata.hr_employee_id` marks it — so
--     `/invitations/organization/accept/<hr-token>` would have stranded the person.
--   · Live exposure at the time of writing: 7 HR-tied invitations, 7 accepted, **0**
--     accepted-but-unbound. The hole was LATENT, not live. Nobody needed repairing.
--
-- REFUSE, NOT DELEGATE. iam owns invitations and must not learn to do HR's writes, so the
-- generic door refuses HR-tied invitations BY NAME and points at the door that completes
-- the act. The HR door opts in with `p_hr_half_handled` — a named, greppable parameter
-- rather than a session flag or a caller sniff, so the single legitimate bypass is visible
-- in the source of the function that uses it.
--
-- 🚨 AND A DEFAULTED PARAMETER MAKES AN OVERLOAD, NOT AN EDIT. `create or replace` with
-- the new argument left `inv_accept(text)` standing beside the new one, and PostgREST
-- refused EVERY call with PGRST203 "could not choose the best candidate" — which would
-- have broken ordinary organization invitations for everyone. The old signature is
-- dropped below. Caught by exercising the path rather than assuming the replace replaced.
--
-- Applied live 2026-08-28 and ledgered. Falsified on a clean subject, all four directions:
--   HR-tied via generic door → HTTP 400, refused by name, login still NULL, invitation NOT
--                              consumed (so the person can still use the right door)
--   HR-tied via HR door      → HTTP 200, hr_linked true, login bound
--   PLAIN org invite via generic door → HTTP 200, membership written (no regression)
--   exactly one inv_accept overload remains

create or replace function public.inv_accept(p_token text, p_hr_half_handled boolean default false)
returns table(target_type text, target_id uuid, organization_id uuid, role text)
language plpgsql security definer set search_path = public, iam, auth as $fn$
declare v_inv iam.invitations; v_uid uuid := (select auth.uid()); v_email text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_uid or lower(i.email) = lower(v_email));
  if v_inv.id is null then raise exception 'invalid or expired invitation'; end if;

  -- 🚨 SEE THE HEADER. Accepting an HR-tied invitation here would strand the person.
  if (v_inv.metadata ? 'hr_employee_id') and not coalesce(p_hr_half_handled, false) then
    raise exception 'this invitation links an employee record; accept it through hr_invite_accept, which also binds the login'
      using errcode = '22023';
  end if;

  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, updated_by)
  values (v_inv.organization_id, v_inv.target_type, v_inv.target_id, v_uid, coalesce(v_inv.role, 'member'), 'active', v_uid, v_uid)
  on conflict (container_type, container_id, user_id)
  do update set status = 'active', deleted_at = null, updated_by = v_uid;

  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_uid, updated_by = v_uid
   where id = v_inv.id;

  return query select v_inv.target_type, v_inv.target_id, v_inv.organization_id, v_inv.role;
end $fn$;

drop function if exists public.inv_accept(text);

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_invite_accept(text)'::regprocedure);
  if position('p_hr_half_handled' in v_def) > 0 then
    raise notice 'hr_l1_50: HR door already opts in'; return;
  end if;
  v_new := replace(v_def,
    'select * into v_accept from public.inv_accept(p_token);',
    'select * into v_accept from public.inv_accept(p_token, p_hr_half_handled => true);');
  if v_new = v_def then raise exception 'hr_l1_50: inv_accept call site not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text; v_overloads int;
begin
  select count(*) into v_overloads from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'inv_accept';
  if v_overloads <> 1 then
    raise exception 'hr_l1_50: % inv_accept overloads — PostgREST cannot choose', v_overloads;
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'inv_accept';
  if v_src !~ 'hr_employee_id' then raise exception 'hr_l1_50: the HR-tied guard is missing'; end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_invite_accept';
  if v_src !~ 'p_hr_half_handled' then raise exception 'hr_l1_50: the HR door does not opt in'; end if;
  if v_src !~ 'login_user_id' then raise exception 'hr_l1_50: the HR half is gone'; end if;
end $verify$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('public', 'inv_accept', 'hr_l1_50_the_generic_door_cannot_half_link.sql',
        array['hr_employee_id', 'p_hr_half_handled', 'hr_invite_accept'],
        array[]::text[],
        'The generic invitation door writes the MEMBERSHIP only. An HR-tied invitation accepted '
        || 'through it leaves hr.employee.login_user_id NULL and no trigger binds it, producing a '
        || 'person who is a member of the employer and cannot open their own HR record.')
on conflict do nothing;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('public', 'hr_invite_accept', 'hr_l1_50_the_generic_door_cannot_half_link.sql',
        array['p_hr_half_handled', 'login_user_id'],
        array[]::text[],
        'The only door entitled to accept an HR-tied invitation, because it is the only one that '
        || 'binds login_user_id. It must keep opting in explicitly.')
on conflict do nothing;

insert into public._schema_migrations (source, filename, checksum, applied_at, duration_ms)
values ('matrx-frontend', 'hr_l1_50_the_generic_door_cannot_half_link.sql',
        md5('hr_l1_50_the_generic_door_cannot_half_link'), now(), 0)
on conflict do nothing;
