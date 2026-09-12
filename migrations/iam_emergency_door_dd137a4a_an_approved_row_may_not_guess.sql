-- iam_emergency_door_dd137a4a — AN `approved` ROW MAY NOT GUESS WHO HELD THE KEY (DD-137a).
--
-- 🚨 dd137a4's backfill was wrong for exactly the rows it existed to fix, and the assertion that
-- was supposed to catch it could not: it joined `iam.emergency_door_request`, and the verifier had
-- already deleted those request rows at cleanup (V-38 §7 — correctly; a verifier leaves no grants
-- or requests behind). With no request to read, the fallback `granted_to_user_id = actor_user_id`
-- fired on the one `approved` row in the table and re-asserted the very thing V-38 found false:
-- that the approver was the reader.
--
-- The class, not the instance:
--   1. On the two-person path the grantee is NEVER derivable from the actor. Where the request is
--      gone, the honest value is NULL — "we no longer know who held this key" — and the screen
--      says that, rather than naming somebody. A guess in an audit ledger is worse than a gap.
--   2. `iam._record_access_audit` now REFUSES to write an `approved` row without an explicit
--      grantee, so the fallback can never reach that action again.
--   3. The assertion is rewritten so it cannot pass vacuously: it checks the rows themselves, not
--      a join to a table that may be empty.

-- ── (0) 🚨 TWO FUNCTIONS WHERE THERE MUST BE ONE. dd137a4 added `p_granted_to_user_id` with a
-- DEFAULT, so `create or replace` did not replace anything — it created a SECOND overload beside
-- the 17-argument original. Every named-argument call that omits the new parameter — which is
-- every call in `public.hr_break_glass` and in the door itself — then resolves to
-- `42725 function ... is not unique` and RAISES. The HR door and the platform door were both one
-- call away from failing outright; nothing had exercised that path in the twenty minutes between
-- the two migrations. The old signature is dropped, and the assertion below proves exactly one
-- remains.
drop function if exists iam._record_access_audit(
  uuid, text, text, text, text, text, boolean, uuid[], integer, uuid, text, text, uuid, uuid,
  timestamptz, boolean, uuid);

-- ── (1) undo the guess
update iam.access_audit a
   set granted_to_user_id = null
 where a.action = 'approved'
   and a.granted_to_user_id = a.actor_user_id
   and not exists (select 1 from iam.emergency_door_request q
                    where q.id = a.request_id and q.requested_by = a.actor_user_id);

-- ── (2) the fallback may never reach an approval again
create or replace function iam._record_access_audit(
  p_organization_id uuid, p_action text, p_target_token text, p_data_class text,
  p_purpose text, p_basis text, p_granted boolean,
  p_target_ids uuid[] default '{}'::uuid[], p_row_count integer default null,
  p_subject_user_id uuid default null, p_justification text default null,
  p_denial_reason text default null, p_request_id uuid default null,
  p_permission_id uuid default null, p_grant_expires_at timestamptz default null,
  p_is_emergency_door boolean default true, p_actor_user_id uuid default null,
  p_granted_to_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'iam', 'public'
as $fn$
declare v_id uuid; v_actor uuid := coalesce(p_actor_user_id, auth.uid());
begin
  -- 🚨 THE TWO-PERSON ACTION MUST SAY WHO THE KEY IS FOR. `approved` is the only action whose
  -- actor and grantee are different people by construction, so the convenience default is a
  -- LIE there and is refused rather than silently taken.
  if p_action = 'approved' and p_granted_to_user_id is null then
    raise exception 'iam._record_access_audit: an `approved` row must name the person the key was minted FOR — the approver is not the reader'
      using errcode = '22023',
            hint = 'Pass p_granted_to_user_id (the requester). Defaulting it to the actor is what told a subject the wrong name on her own access page (V-38, 2026-09-12).';
  end if;

  insert into iam.access_audit
    (organization_id, action, target_token, target_ids, row_count, subject_user_id, data_class,
     purpose, basis, justification, is_emergency_door, granted, denial_reason, request_id,
     permission_id, grant_expires_at, actor_user_id, granted_to_user_id, created_by, visibility)
  values
    (p_organization_id, p_action, p_target_token, coalesce(p_target_ids, '{}'::uuid[]), p_row_count,
     p_subject_user_id, p_data_class, p_purpose, p_basis, p_justification, p_is_emergency_door,
     p_granted, p_denial_reason, p_request_id, p_permission_id, p_grant_expires_at, v_actor,
     coalesce(p_granted_to_user_id, v_actor),
     v_actor, 'personal'::platform.visibility)
  returning id into v_id;
  return v_id;
end $fn$;

revoke execute on function iam._record_access_audit(uuid, text, text, text, text, text, boolean, uuid[], integer, uuid, text, text, uuid, uuid, timestamptz, boolean, uuid, uuid) from public, anon, authenticated;

-- ── (3) assertions that cannot pass vacuously
do $$
declare v_n integer;
begin
  select count(*) into v_n from iam.access_audit
   where action = 'approved' and granted_to_user_id = actor_user_id
     and not exists (select 1 from iam.emergency_door_request q
                      where q.id = request_id and q.requested_by = actor_user_id);
  if v_n > 0 then
    raise exception 'dd137a4a: % approved row(s) still name the approver as the key holder', v_n;
  end if;

  -- the guard itself, proven RED then GREEN inside this migration
  begin
    perform iam._record_access_audit(
      p_organization_id => (select id from iam.organizations limit 1),
      p_action => 'approved'::text, p_target_token => 'conversation'::text,
      p_data_class => 'private'::text, p_purpose => 'audit'::text,
      p_basis => 'emergency_door'::text, p_granted => true);
    raise exception 'dd137a4a: an approved row with no grantee was ACCEPTED — the guard is dead';
  exception when sqlstate '22023' then
    null;   -- refused, as designed
  end;

  -- exactly ONE recorder, so no named call can go ambiguous again
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = '_record_access_audit';
  if v_n <> 1 then
    raise exception 'dd137a4a: % overloads of iam._record_access_audit exist; every named call is ambiguous', v_n;
  end if;

  -- and the two doors that call it by name still resolve
  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hr_break_glass'
      and p.prosrc like '%iam._record_access_audit%';
  if not found then
    raise exception 'dd137a4a: hr_break_glass no longer calls the platform recorder';
  end if;

  raise notice 'dd137a4a: assertions passed';
end $$;
