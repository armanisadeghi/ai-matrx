-- platform_visible_user_identity_dd137c1 — THE TWO THINGS THE INVOKER CONVERSION NEEDS FIRST
-- (DD-137c, step 1; VISIBILITY-BY-CLASS §3.3 chair R2).
--
-- WHY THIS FILE EXISTS, AND WHY IT IS SEPARATE FROM THE CONVERSION
-- ---------------------------------------------------------------
-- §3.3 says the eleven `%_list_scoped` RPCs become `SECURITY INVOKER` so that RLS is their ceiling
-- instead of eleven disagreeing hand-written predicates. Measured live before writing a line of
-- that conversion, two things make a plain flip fail outright — not subtly, but with
-- `42501 permission denied` on the first row:
--
--   1. SEVEN of the eleven (agx, cvx, ivw, seo_rank_target, shx, trx, wfx) and
--      `public.edu_library_scope_rows` LEFT JOIN `auth.users` to show the row owner's email.
--      `has_table_privilege('authenticated','auth.users','SELECT')` is **false**. Running as their
--      definer hid that; running as the caller cannot.
--   2. NINE of them call `platform.entity_default_list_scope(text)` — the registry read DD-137b7
--      wired in as their default. `has_function_privilege('authenticated', …, 'EXECUTE')` is
--      **false**, for the same reason: nothing has ever called it as a signed-in person.
--
-- So the conversion needs one platform primitive and one grant, and they land here — before the
-- conversion, in their own file, with their own proof — rather than as two lines smuggled into a
-- 130 KB function rewrite where nobody would ever see them.
--
-- 🚨 THIS IS A NARROWING, AND IT IS THE POINT. Today a definer list RPC prints the creator's email
-- for every row it returns, including — on the `public` and `shared` scopes — the email of somebody
-- the caller shares no organization with. `platform.visible_user_identity` answers with an email
-- only when the viewer is that person, shares a real (non-personal) organization with them, or is a
-- platform administrator. On the `orgs` and `mine` scopes that is exactly what was shown before; on
-- `public` and `shared` it is strictly less, and the column reads NULL instead of a stranger's
-- address. That is a fix, not a regression, and it is named here so nobody discovers it as a
-- surprise.
--
-- 🚨 WHY A VIEW AND NOT A FUNCTION. A definer FUNCTION returning an email takes a user id from the
-- caller and is a probe by construction ("is this id a peer of mine?" answers yes/no for every id
-- on the platform). A view carries its predicate in its own WHERE clause, joins like a table, and
-- cannot be asked about an id the query did not already have in hand. db-rules §6d-4 wants every
-- client-callable definer door declared; this one is declared in `platform.client_callable_door`
-- below even though it is a view, because the register's job is to list what runs with borrowed
-- rights, not to list what is shaped like a function.

-- ═══════════════════════════════════════════════════ 1. the peer-scoped identity of a row's owner
create or replace view platform.visible_user_identity as
  select u.id, u.email::text as email
    from auth.users u
   where u.id = auth.uid()
      or public.is_platform_admin()
      or u.id in (
           select them.user_id
             from iam.organization_member me
             join iam.organization_member them on them.organization_id = me.organization_id
             join iam.organizations o          on o.id = me.organization_id
            where me.user_id = auth.uid()
              and o.is_personal is not true
         );

comment on view platform.visible_user_identity is
  'DD-137c (VISIBILITY-BY-CLASS §3.3). The identity of a row''s owner, as much of it as the viewer '
  'is entitled to: themselves, anyone who shares a real organization with them, and — for a '
  'platform administrator — everyone. It exists because the list RPCs became SECURITY INVOKER and '
  '`authenticated` has no SELECT on auth.users; it replaces seven separate LEFT JOINs to auth.users '
  'that ran with borrowed rights and printed a stranger''s email on the public and shared scopes.';

revoke all on platform.visible_user_identity from public;
grant select on platform.visible_user_identity to authenticated, service_role;

-- ═══════════════════════════════════════════════════ 2. the registry read the RPCs already make
-- `platform.entity_default_list_scope(token)` returns one word from `platform.entity_types` and
-- nothing else. Nine list RPCs already call it (DD-137b7); as definers they could. As invokers they
-- cannot without this grant, and a screen that cannot read where it should open is the exact defect
-- this axis exists to end.
grant execute on function platform.entity_default_list_scope(text) to authenticated;

-- ═══════════════════════════════════════════════════ 3. declare the door (db-rules §6d-4)
insert into platform.client_callable_door(schema_name, function_name, identity_args, declared_by, reason)
select 'platform', 'visible_user_identity', '(view)', 'DD-137c',
       'Peer-scoped owner identity for the SECURITY INVOKER list RPCs. Runs with the view owner''s '
       'rights over auth.users, which `authenticated` cannot read at all, and narrows to: yourself, '
       'a member of a non-personal organization you also belong to, or a platform administrator. '
       'Classes touched: the identity of a person (confidential), never their content.'
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'platform' and d.function_name = 'visible_user_identity');

-- ═══════════════════════════════════════════════════ 4. PROOF — live, real identities, rolled back
-- The view is worth nothing unless it shows a peer and refuses a stranger. Both are asserted here
-- against real rows, as the real `authenticated` role, so the WHERE clause is measured rather than
-- read. A shortage of material (no two-org pair on this database) is raised, never skipped: an
-- unmeasured proof is a failure, not a pass.
do $$
declare
  v_a uuid; v_b uuid; v_stranger uuid;
  v_n int; v_email text;
begin
  -- A and B: two DIFFERENT people who share one non-personal organization.
  select ma.user_id, mb.user_id into v_a, v_b
    from iam.organization_member ma
    join iam.organization_member mb on mb.organization_id = ma.organization_id
                                   and mb.user_id <> ma.user_id
    join iam.organizations o on o.id = ma.organization_id and o.is_personal is not true
    join auth.users ua on ua.id = ma.user_id
    join auth.users ub on ub.id = mb.user_id
   where not public.is_platform_admin_for(ma.user_id)
   limit 1;

  if v_a is null then
    raise exception 'dd137c1: no two members of one real organization on this database — the peer '
                    'half of this view cannot be measured, so it is refused rather than assumed.';
  end if;

  -- A stranger: somebody who shares NO non-personal organization with A.
  select u.id into v_stranger
    from auth.users u
   where u.id <> v_a
     and not exists (
       select 1 from iam.organization_member ma
       join iam.organization_member mu on mu.organization_id = ma.organization_id
       join iam.organizations o on o.id = ma.organization_id and o.is_personal is not true
       where ma.user_id = v_a and mu.user_id = u.id)
   limit 1;

  if v_stranger is null then
    raise exception 'dd137c1: every account on this database shares an organization with %, so the '
                    'refusal half of this view cannot be measured.', v_a;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- (a) A sees themselves.
  select count(*) into v_n from platform.visible_user_identity v where v.id = v_a;
  if v_n <> 1 then
    execute 'reset role';
    raise exception 'dd137c1: a person cannot see their own identity through the view (% rows)', v_n;
  end if;

  -- (b) A sees a peer, WITH the email.
  select v.email into v_email from platform.visible_user_identity v where v.id = v_b;
  if v_email is null then
    execute 'reset role';
    raise exception 'dd137c1: an organization peer''s identity is not visible — the list RPCs would '
                    'lose the owner-email column they have always shown on the orgs scope.';
  end if;

  -- (c) A does NOT see a stranger.
  select count(*) into v_n from platform.visible_user_identity v where v.id = v_stranger;
  if v_n <> 0 then
    execute 'reset role';
    raise exception 'dd137c1: % can read the identity of %, who shares no organization with them — '
                    'the view does not narrow and must not ship.', v_a, v_stranger;
  end if;

  -- (d) the registry read works as the caller, which is the other half of this file.
  perform platform.entity_default_list_scope('conversation');

  execute 'reset role';

  -- (e) anonymous sees nobody at all.
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  select count(*) into v_n from platform.visible_user_identity;
  execute 'reset role';
  if v_n <> 0 then
    raise exception 'dd137c1: anonymous can read % identities through the view', v_n;
  end if;

  raise notice 'dd137c1 PROVEN: % sees themselves and their peer %, cannot see the stranger %, and '
               'anonymous sees nobody.', v_a, v_b, v_stranger;
exception when others then
  begin execute 'reset role'; exception when others then null; end;
  raise;
end $$;
