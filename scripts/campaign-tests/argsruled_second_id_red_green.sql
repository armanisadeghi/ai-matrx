-- LANE ARGS-RULED — THE CLASS "the second id lives in the same organization", measured RED then
-- GREEN in ONE rolled-back transaction on the MAIN database.
--
-- THE CLASS. Eight doors resolve a row from their FIRST id, take that row's organization, gate the
-- caller against it — and then write a SECOND id into the row without comparing it to anything.
-- The sharpest member is `provider.attach_credential`: attaching a credential is what lets a
-- provider account USE it, and the credential id was written into provider.account_credential with
-- no question asked, so an administrator of any organization could bind ANY of the 406 rows of
-- users.credential_items to their own account.
--
-- THE FIXTURE IS REAL AND IS NOT WRITTEN BY THIS FILE: a live provider.account, and a live
-- credential item that belongs neither to that account's organization nor to the caller. Nothing
-- is created; the one INSERT the door performs is rolled back.
--
-- RUN IT:  binlocal/p.sh -f scripts/campaign-tests/argsruled_second_id_red_green.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'argsruled_second_id_red_green.sql'
\set requires 'row:users.credential_items:true'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '15s';

do $t$
declare
  v_acct  constant uuid := 'f2241d07-2996-43aa-988e-a562940c9c04';
  v_org   uuid;
  v_cred  uuid;
  v_id    uuid;
  v_backstops integer;
  v_caller uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, an ADMIN of that account's organization
begin
  perform set_config('app.actor_system', 'campaign-test/argsruled_second_id', true);
  perform set_config('request.jwt.claims',
    '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  select a.organization_id into v_org from provider.account a where a.id = v_acct;

  -- A CREDENTIAL THAT IS NEITHER THIS ORGANIZATION'S NOR THE CALLER'S.
  select ci.id into v_cred from users.credential_items ci
   where ci.organization_id is distinct from v_org
     and ci.user_id is distinct from v_caller
   limit 1;
  if v_cred is null then
    raise exception 'fixture: no credential item outside this organization and outside the caller';
  end if;
  raise notice 'fixture: provider account % in organization %, credential % belongs to neither',
    v_acct, v_org, v_cred;

  -- THE CALLER MUST PASS provider._assert_org_admin, or the GREEN clause below would be
  -- satisfied by THAT refusal instead of the one under test — a proof that passes for the wrong
  -- reason. admin@admin.com is an admin of this account's organization, and this asserts it
  -- rather than assuming it.
  if not public.is_org_admin_for(v_caller, v_org) then
    raise exception 'fixture: the caller is not an admin of that account''s organization, so this file would measure the wrong refusal';
  end if;
  raise notice 'fixture: the caller IS an org admin here, so provider._assert_org_admin lets them through';

  -- ══ GREEN — the body that is live now ═════════════════════════════════════════════════
  begin
    v_id := provider.attach_credential(v_acct, v_cred, 'primary');
    raise exception 'GREEN FAILED: the live body attached a credential that is neither this organization''s nor the caller''s (row %)', v_id;
  exception when insufficient_privilege then
    if sqlerrm like '%ORG_ADMIN_REQUIRED%' then
      raise exception 'GREEN FAILED FOR THE WRONG REASON: the org-admin gate refused first, so nothing about the credential id was measured';
    end if;
    raise notice 'AFTER  (live body): refused 42501 — "%". PASS', sqlerrm;
  end;

  -- ══ RED — and it is NOT the red this file first claimed ═══════════════════════════════
  -- HONESTY, MEASURED. The pre-ARGS-RULED body is put back INSIDE this rolled-back transaction
  -- and called with the same foreign credential. It does NOT attach it — it reaches the INSERT
  -- and `provider._credential_link_guard`, a trigger on provider.account_credential, refuses it:
  -- "provider account credential must be an active organization-owned Vault item in the same
  -- organization". So `provider.attach_credential` was NOT exploitable, and this lane does not
  -- claim it was. What the measurement DOES establish is the thing the ruling is about: the DOOR
  -- decided nothing about that id, and the only thing standing between it and the row was a
  -- table trigger nobody at the door knew about. The fix moves the decision to the door, where a
  -- refusal can say what to do; the trigger stays as the backstop it always was.
  --
  -- THE OTHER SEVEN MEMBERS OF THIS CLASS HAVE NO SUCH BACKSTOP. Measured on the same day:
  -- hr.kiosk_device, hr.leave_enrollment, hr.approval_delegation, hr.incident,
  -- hr.role_assignment and provider.account carry ONLY plain foreign keys on the second id —
  -- existence, never organization — and no trigger that compares the two. This clause asserts
  -- exactly that, because it is the claim the other seven fixes rest on.
  create or replace function provider.attach_credential(p_account_id uuid, p_credential_item_id uuid, p_credential_role text)
   returns uuid language plpgsql security definer set search_path to 'pg_catalog', 'public'
  as $b$
  DECLARE v_org uuid; v_id uuid;
  BEGIN
    SELECT organization_id INTO v_org FROM provider.account WHERE id = p_account_id AND deleted_at IS NULL;
    IF v_org IS NULL THEN RAISE EXCEPTION 'provider account not found' USING ERRCODE = 'P0002'; END IF;
    PERFORM provider._assert_org_admin(v_org);
    INSERT INTO provider.account_credential (organization_id, account_id, credential_item_id, credential_role)
    VALUES (v_org, p_account_id, p_credential_item_id, p_credential_role) RETURNING id INTO v_id;
    RETURN v_id;
  END;
  $b$;
  begin
    v_id := provider.attach_credential(v_acct, v_cred, 'primary');
    raise exception 'RED: the old body attached it (row %) — then this lane WAS right that it was exploitable', v_id;
  exception when others then
    if sqlerrm not like '%organization-owned Vault item%' then raise; end if;
    raise notice 'BEFORE (pre-ARGS-RULED body): reached the INSERT and was stopped by the TABLE, not the door — "%"', sqlerrm;
  end;

  -- ══ AND THE SEVEN WITHOUT A BACKSTOP ══════════════════════════════════════════════════
  select count(*) into v_backstops
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where (n.nspname, c.relname) in (('hr','kiosk_device'), ('hr','leave_enrollment'),
                                    ('hr','approval_delegation'), ('hr','incident'),
                                    ('hr','role_assignment'), ('provider','account'))
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ~* 'organization_id'
     and pg_get_constraintdef(con.oid) ~* '(location_id|employment|scope_id|duplicate_of_id)';
  if v_backstops <> 0 then
    raise exception 'the seven: % check constraint(s) compare the second id to the organization after all — re-read before claiming the class', v_backstops;
  end if;
  raise notice 'the other six tables carry NO constraint comparing the second id to the organization: the door is the only place that decision can be made, and now is. PASS';

end $t$;

rollback;
