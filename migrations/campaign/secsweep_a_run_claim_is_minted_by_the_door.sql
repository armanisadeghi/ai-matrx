-- lane: SECURITY-SWEEP
-- allows: revoke scheduler
-- Chair ruling 2, the last genuinely client-WRITTEN credential in the 233:
-- `scheduler.sch_run.claim_token`.
--
-- WHAT IT IS. A run's claim token is a LEASE: `completeRun`, `failRun` and `markRunRunning`
-- all gate their UPDATE on `... and claim_token = <token>`, so holding the token IS holding
-- the run. Today a signed-in browser mints it itself (`crypto.randomUUID()` in
-- `matrx-frontend/lib/scheduler-client/claim.ts`, its verbatim mirror in
-- `matrx-extend/src/lib/scheduler-client/claim.ts`, and a second implementation in
-- `matrx-extend/src/lib/agenda/queries.ts::claimRun`) and INSERTs it. A client that chooses
-- the token can write one it already knows onto a run it does not own, and then finish,
-- fail or re-point somebody else's scheduled work.
--
-- WHY A DOOR **PLUS** A TRIGGER, AND NOT `client_excluded_columns`. Withholding the column
-- would also withhold SELECT, and four live readers do `select("*")` on `sch_run`
-- (`features/scheduling/service/queries.ts` ×2, `matrx-extend/src/lib/agenda/queries.ts`, and
-- the admin service's head-counts). More importantly the rule here is not "a client may never
-- touch this column" — a client MUST be able to CLEAR it, because clearing it is how a run is
-- finished (`completeRun`/`failRun`/`finishRun` all set `claim_token = null`), and
-- `markRunRunning` must be able to leave it exactly as it found it. A policy cannot express
-- that: `WITH CHECK` sees only the new row. A trigger sees OLD and NEW.
--
-- So the rule is stated where it can be stated truthfully:
--   * a client may never INSERT a row carrying a token,
--   * a client may never CHANGE a token to a new value,
--   * a client MAY set it to NULL (finishing) or leave it untouched (markRunRunning).
-- and the ONLY way to obtain one is `scheduler.sch_run_claim`, which mints it.
--
-- The trigger is `SECURITY DEFINER` and keyed on `current_user`, which under PostgREST is
-- literally `authenticated` or `anon`. The Python scanner (matrx-orm, `service_role`/
-- `postgres`) and the door itself (SECURITY DEFINER, so `current_user` is the owner) are
-- untouched — the same shape `seckeys_a_key_may_only_carry_a_minted_identity.sql` used.
--
-- THE DOOR REPRODUCES `matrx_scheduler/queries.py::claim_task` EXACTLY, because the Python
-- scanner and this door claim the same rows and must not disagree:
--   * the TASK is the authoritative organization source (the client stops sending it),
--   * `metadata.claim_protocol = 2` — the two CHECK constraints
--     `sch_run_claim_protocol_chk` and `sch_run_claim_protocol_by_claimed_at_chk` refuse any
--     claim without it, which is how a stale client generation is physically unable to claim,
--   * `due_at = task.next_due_at ?? now()`, `queue` from the argument or the task,
--   * the partial unique index `sch_run_unique_active_per_task` decides the race, and the
--     `23505` is allowed to PROPAGATE so the clients' existing `isClaimRaceLoss` classifier
--     still turns it into `TaskClaimRaceError`. A door that swallowed the race would silently
--     run one task twice.
--
-- THE GRANT IS NOT WITHDRAWN HERE and the trigger's INSERT arm is what closes the hole; the
-- callers in BOTH repos move to the door in the same push. `revoke ... from public, anon` on
-- the new function is what makes it signed-in-only.
--
-- Inverse: migrations/inverse/secsweep_a_run_claim_is_minted_by_the_door.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` — `scheduler.sch_run|…|claim_token` leaves the
-- baseline once the write is refused.

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
  if not iam.has_org_access(v_task.organization_id) then
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

comment on function scheduler.sch_run_claim(uuid, text, uuid, text, integer) is
  'Atomically claims a scheduled task and MINTS its lease token, returning the sch_run row. SECURITY-SWEEP 2026-09-21: the browser used to mint claim_token with crypto.randomUUID() and INSERT it, and holding that token IS holding the run (completeRun/failRun/markRunRunning all gate on it). Mirrors matrx_scheduler/queries.py::claim_task, including claim_protocol 2 and letting the unique-violation race propagate as 23505.';

-- ── The rule the policy cannot state ────────────────────────────────────────────────────────
create or replace function scheduler._claim_token_is_minted_by_the_door()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  -- Only a CLIENT role is constrained. Under PostgREST `current_user` is literally
  -- `authenticated` or `anon`; the Python scanner runs as `service_role`/`postgres`, and
  -- scheduler.sch_run_claim is SECURITY DEFINER so inside it `current_user` is the owner.
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

  -- UPDATE. Clearing the token is how a run is FINISHED, and leaving it alone is what
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
  'SECURITY-SWEEP 2026-09-21. A client may CLEAR a run''s claim_token (that is how a run finishes) and may leave it untouched (markRunRunning), but may never INSERT one or change one to a new value. A WITH CHECK sees only the new row and cannot tell those apart; a trigger sees OLD and NEW.';

-- Created conditionally rather than DROP-then-CREATE: this file names production, and the
-- runner's allow-list refuses a DROP there by name — correctly, since a DROP of a live guard
-- is exactly the shape nobody should be able to slip past it. The trigger is new.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'scheduler.sch_run'::regclass
       and tgname = 'sch_run_claim_token_is_minted'
       and not tgisinternal
  ) then
    create trigger sch_run_claim_token_is_minted
      before insert or update on scheduler.sch_run
      for each row execute function scheduler._claim_token_is_minted_by_the_door();
  end if;
end $$;

-- db-rules §6d-4: the register row comes BEFORE the GRANT.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   gate_predicate, anonymous_callers, signed_in_callers)
values
  ('scheduler', 'sch_run_claim',
   'p_task_id uuid, p_surface text, p_trigger_id uuid, p_queue text, p_lease_seconds integer',
   'SECURITY-SWEEP',
   'Signed-in door. SECURITY DEFINER; atomically claims a scheduled task and mints its lease token, replacing a client-generated claim_token INSERTed over PostgREST. The caller is resolved inside the body by auth.uid() and must be a member of the organization that owns the task; anon holds no EXECUTE.',
   'auth.uid()', false, true)
on conflict do nothing;

revoke all on function scheduler.sch_run_claim(uuid, text, uuid, text, integer) from public, anon;
grant execute on function scheduler.sch_run_claim(uuid, text, uuid, text, integer) to authenticated;
