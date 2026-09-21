-- lane: SECURITY-SWEEP
-- based-on: scheduler.sch_run_claim(uuid, text, uuid, text, integer) 8b4eff14a5c3b43ab485722c15bd522d1995dad5b4853a6533d04599af64108b
-- based-on: scheduler._claim_token_is_minted_by_the_door() 08be0cab1fad723b31862fde8c595fe05095306684682f7c9a7356f3d573f0d2
--
-- TWO DEFECTS IN `secsweep_a_run_claim_is_minted_by_the_door.sql`, BOTH FOUND BY CALLING IT
-- OVER HTTP WITH A REAL JWT. It applied clean, it was judged, it type-checked, and it did
-- nothing.
--
-- 1 — 🚨 THE GUARD COULD NOT SEE THE CLIENT. The trigger function was written `SECURITY
--     DEFINER` and keyed on `current_user in ('authenticated','anon')`. Inside a SECURITY
--     DEFINER function `current_user` IS THE OWNER, always — so the test read `postgres` on
--     every call, took the early return, and a browser INSERT carrying
--     `claim_token = '1111…'` came back **201 Created**. The guard was a comment.
--
--     A trigger function that only RAISES needs no elevated privilege, and the role it must
--     be able to see is precisely the one `SECURITY DEFINER` hides. So it is `SECURITY
--     INVOKER` (the default), which is what makes `current_user` the PostgREST role —
--     `authenticated` or `anon` — while the Python scanner still reads `service_role` and the
--     claim door, being SECURITY DEFINER itself, still reads its owner. `search_path` stays
--     pinned.
--
-- 2 — THE DOOR WAS STRICTER THAN THE PLATFORM. It admitted only
--     `iam.has_org_access(task.organization_id)`, so a platform admin — who can read the task
--     and whom every generated policy in this database admits through a leading
--     `is_platform_admin()` arm — was refused with "You are not a member of the organization
--     that owns that task." The old client path had no such refusal: it checked only that the
--     task carried a valid organization and let RLS decide. Adding an admin lane to a door
--     that replaced a *less* restrictive path is not loosening it; leaving it out would have
--     made the door a regression for the one seat that operates the scheduler.
--
-- Nothing else moves: the mint, `claim_protocol = 2`, `due_at`, `queue`, the propagated 23505
-- race and the returned row are unchanged.
--
-- Inverse: migrations/inverse/secsweep_the_claim_guard_can_actually_see_the_client.inverse.sql
-- Guard: the proof script re-run — a client-chosen token must come back 42501 naming the door.

create or replace function scheduler._claim_token_is_minted_by_the_door()
returns trigger
language plpgsql
-- 🚨 SECURITY INVOKER, DELIBERATELY. See defect 1 above: under SECURITY DEFINER,
-- `current_user` is the owner and this guard can never see a client. It needs no privilege of
-- its own — it only raises.
set search_path = pg_catalog, public
as $fn$
begin
  -- Under PostgREST `current_user` is literally `authenticated` or `anon`. The Python scanner
  -- runs as `service_role`/`postgres`, and `scheduler.sch_run_claim` is SECURITY DEFINER so
  -- inside it `current_user` is the owner — all three pass straight through.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.claim_token is not null then
      raise exception
        'A run claim is minted by scheduler.sch_run_claim, never chosen by a client. Claim the task through that door and use the token it returns.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE. Clearing the token is how a run FINISHES, and leaving it alone is what
  -- markRunRunning does; only inventing or swapping one is refused.
  if new.claim_token is not null
     and new.claim_token is distinct from old.claim_token then
    raise exception
      'A run''s lease token cannot be set or changed by a client. It is minted by scheduler.sch_run_claim and cleared when the run finishes.'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

comment on function scheduler._claim_token_is_minted_by_the_door() is
  'SECURITY-SWEEP 2026-09-21. A client may CLEAR a run''s claim_token (that is how a run finishes) and may leave it untouched (markRunRunning), but may never INSERT one or change one to a new value. A WITH CHECK sees only the new row and cannot tell those apart; a trigger sees OLD and NEW. SECURITY INVOKER on purpose: under SECURITY DEFINER current_user is the owner, so the first version of this guard read `postgres` on every call and a browser INSERT carrying a chosen token returned 201.';

create or replace function scheduler.sch_run_claim(
  p_task_id        uuid,
  p_surface        text,
  p_trigger_id     uuid default null,
  p_queue          text default null,
  p_lease_seconds  integer default 600
) returns scheduler.sch_run
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_task record;
  v_now timestamptz := now();
  v_lease integer := greatest(1, coalesce(p_lease_seconds, 600));
  v_row scheduler.sch_run;
begin
  if v_uid is null then
    raise exception 'You must be signed in to claim scheduled work.' using errcode = '42501';
  end if;

  select t.id, t.user_id, t.organization_id, t.next_due_at, t.queue
    into v_task
    from scheduler.sch_task t
   where t.id = p_task_id and t.deleted_at is null;

  if v_task.id is null then
    raise exception 'That scheduled task no longer exists.' using errcode = 'P0002';
  end if;
  -- "refusing to claim task %: task has no valid organization_id" — the same refusal both
  -- clients and the Python scanner already make, moved to where it cannot be skipped.
  if v_task.organization_id is null then
    raise exception 'Refusing to claim task %: it has no organization.', p_task_id
      using errcode = '23514';
  end if;
  -- The platform-admin arm leads, exactly as it does in every policy iam.apply_rls generates.
  -- Without it this door is stricter than the client write it replaced.
  if not ((select public.is_platform_admin()) or iam.has_org_access(v_task.organization_id)) then
    raise exception 'You are not a member of the organization that owns that task.'
      using errcode = '42501';
  end if;

  insert into scheduler.sch_run (
    task_id, trigger_id, user_id, organization_id, status, surface, queue,
    due_at, claimed_at, claim_token, claim_expires_at, metadata
  ) values (
    v_task.id,
    p_trigger_id,
    v_task.user_id,
    v_task.organization_id,
    'claimed',
    p_surface,
    coalesce(p_queue, v_task.queue),
    coalesce(v_task.next_due_at, v_now),
    v_now,
    -- THE MINT. The only place a claim token comes from.
    extensions.gen_random_uuid(),
    v_now + make_interval(secs => v_lease),
    jsonb_build_object('claim_protocol', 2)
  ) returning * into v_row;
  -- No exception handler on purpose: `sch_run_unique_active_per_task` must reach the caller
  -- as 23505 so the existing race classifier still works.

  return v_row;
end;
$fn$;
