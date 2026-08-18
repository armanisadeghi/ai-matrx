-- edu_coppa_gate_applies.sql
--
-- RECORD of a change already applied live to Supabase (txzxabzwovsujtloxrus) on
-- 2026-08-17 via the Supabase MCP, in three migrations consolidated here as the
-- final state. Idempotent (CREATE OR REPLACE throughout).
--
-- WP9 (common-docs/projects/education-platform) — make the COPPA gate actually
-- apply, and close the Python/SQL drift class.
--
-- Measured before this change: 269 profiles, ZERO with an age_band, so
-- `edu_coppa_gate()` returned ai_allowed=true universally. Every layer of the
-- child-safety machinery was correct and the whole thing was a no-op in
-- production, because the one field it keys on was NULL for every user.
--
-- Four changes:
--
--  1. `edu_coppa_gate_for(uuid)` — THE one verdict implementation, callable for
--     any user id. `edu_coppa_gate()` becomes a thin auth.uid() wrapper, and
--     aidream's server-side gate calls the SAME function instead of re-deriving
--     the verdict in Python. That re-implementation was a declared drift risk in
--     aidream's own FEATURE.md; two enforcement layers reading one function
--     cannot drift.
--
--  2. An undeclared age band now BLOCKS a signed-in account (reason
--     `age_undeclared`). Anonymous sessions and no-subject callers stay allowed
--     — they are not this gate's subject, and the guest funnel belongs to WP5.
--     The client resolves the block in one tap (`AgeDeclarationDialog`) and
--     resumes the action the learner clicked, so mandatory declaration is a
--     step, never a wall.
--
--  3. `edu_set_age_band` HARD-BLOCKS the `under_13 -> 13_17|adult`
--     self-transition (ARMAN_DECISIONS D-4 recommended posture). Refusals are
--     audited to `education.data_rights_event` as `age_band_change_blocked`
--     WITHOUT raising — deliberately: `raise` would roll back the audit row
--     itself, and an unrecorded refusal is exactly the write-only review signal
--     this replaces. The band simply does not change; the caller reads `status`.
--     Downgrades and first declarations always proceed, and `13_17 -> adult`
--     stays open (a 17-year-old turning 18 is not a COPPA escape).
--
--  4. `edu_guardian_set_age_band(uuid, text)` — the sanctioned route for a child
--     who genuinely turned 13/18, requiring an ACTIVE **and VERIFIED** guardian
--     link. This is why the hard block is not a dead end.
--
-- Also hardened: the `app.age_band_rpc_guard` flag is now disarmed immediately
-- after the guarded UPDATE. It is transaction-local and nothing ever closed it,
-- so once the RPC ran, every later statement in that same transaction could
-- write `age_band` directly with the trigger unarmed. Not reachable through
-- PostgREST (one RPC per request per transaction — verified live: a direct
-- UPDATE in a clean transaction is refused with 42501), but it was a door held
-- open by accident.
--
-- Verified live, adversarially, in a rolled-back transaction against the real
-- database (17/17): self-escape refused with the band unchanged and the refusal
-- audited; direct table write refused (42501) in both a clean transaction and
-- after the RPC; a stranger refused (42501); an active-but-UNVERIFIED guardian
-- refused (42501) and still AI-blocked; a verified guardian able to move the
-- band; downgrades open; `edu_coppa_gate_for` not callable by `authenticated`
-- (it would disclose another user's age band).

-- ─── 1. THE one verdict implementation ────────────────────────────────────────
create or replace function public.edu_coppa_gate_for(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'education', 'users', 'public', 'auth', 'pg_temp'
as $function$
  with me as (
    select
      p.age_band,
      coalesce(u.is_anonymous, false) as is_anonymous,
      exists (
        select 1 from education.guardian_link gl
        where gl.student_user_id = p_user_id and gl.status = 'active'
      ) as has_active_guardian,
      exists (
        select 1 from education.guardian_link gl
        where gl.student_user_id = p_user_id
          and gl.status = 'active'
          and gl.verified_at is not null
      ) as has_verified_guardian
    from users.profiles p
    left join auth.users u on u.id = p.id
    where p.id = p_user_id
  ),
  r as (
    select
      (select age_band from me) as age_band,
      coalesce((select is_anonymous from me), false) as is_anonymous,
      coalesce((select has_active_guardian from me), false) as has_active_guardian,
      coalesce((select has_verified_guardian from me), false) as has_verified_guardian,
      (p_user_id is null) as no_subject
  )
  select jsonb_build_object(
    'age_band', r.age_band,
    'requires_consent', (r.age_band = 'under_13'),
    'has_active_guardian', r.has_active_guardian,
    'has_verified_guardian', r.has_verified_guardian,
    'is_anonymous', r.is_anonymous,
    'ai_allowed', case
      when r.no_subject or r.is_anonymous then true
      when r.age_band is null then false
      when r.age_band = 'under_13' then r.has_verified_guardian
      else true
    end,
    'reason', case
      when r.no_subject or r.is_anonymous then 'allowed'
      when r.age_band is null then 'age_undeclared'
      when r.age_band = 'under_13' and r.has_verified_guardian then 'allowed'
      when r.age_band = 'under_13' and r.has_active_guardian then 'guardian_verification_pending'
      when r.age_band = 'under_13' then 'guardian_consent_required'
      else 'allowed'
    end
  ) from r;
$function$;

comment on function public.edu_coppa_gate_for(uuid) is
  'THE COPPA verdict for one user. Called by edu_coppa_gate() for the signed-in caller and by aidream''s server-side gate for an arbitrary user id, so the two enforcement layers can never drift. Privileged: not executable by authenticated (it would disclose another user''s age band).';

create or replace function public.edu_coppa_gate()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.edu_coppa_gate_for(auth.uid());
$function$;

comment on function public.edu_coppa_gate() is
  'The caller''s own COPPA verdict. Thin wrapper over edu_coppa_gate_for(auth.uid()) — the logic lives there, once.';

-- ─── 2. The audit vocabulary has to allow a refusal ───────────────────────────
alter table education.data_rights_event
  drop constraint if exists data_rights_event_action_check;

alter table education.data_rights_event
  add constraint data_rights_event_action_check
  check (action = any (array[
    'export'::text,
    'delete'::text,
    'restore'::text,
    'age_band_change'::text,
    'age_band_change_blocked'::text
  ]));

-- ─── 3. Self-declaration: hard-block the under_13 escape ──────────────────────
drop function if exists public.edu_set_age_band(text);

create function public.edu_set_age_band(p_band text)
returns jsonb
language plpgsql
security definer
set search_path to 'users', 'education', 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_found boolean := false;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_band is null or p_band not in ('under_13', '13_17', 'adult') then
    raise exception 'Invalid age band: %', coalesce(p_band, '(null)') using errcode = '22023';
  end if;

  select age_band, true into v_old, v_found from users.profiles where id = v_uid;

  -- THE HARD BLOCK. A child may never self-declare out of under_13; that single
  -- click would otherwise evaporate the whole gate. Audited WITHOUT raising,
  -- deliberately: raising would roll back this very audit row, and an
  -- unrecorded refusal is exactly the write-only review signal this replaces.
  -- The band does not change — that is the enforcement; the return value is how
  -- the caller learns why.
  if v_old = 'under_13' and p_band in ('13_17', 'adult') then
    insert into education.data_rights_event (user_id, action, detail)
    values (
      v_uid,
      'age_band_change_blocked',
      jsonb_build_object(
        'old_band', v_old,
        'new_band', p_band,
        'via', 'edu_set_age_band',
        'review_signal', true,
        'requires', 'verified_guardian'
      )
    );
    raise warning
      'COPPA: REFUSED self-declared age change % -> % for user % (a verified guardian must confirm it via edu_guardian_set_age_band).',
      v_old, p_band, v_uid;
    return jsonb_build_object(
      'status', 'blocked',
      'age_band', v_old,
      'reason', 'guardian_required_for_age_change',
      'message', 'A parent or guardian has to confirm this change from their Family page.'
    );
  end if;

  if not v_found then
    -- No profile row (auth user without one). Create it rather than dead-end a
    -- learner the gate has just blocked for having no declared band.
    insert into users.profiles (id, age_band) values (v_uid, p_band)
    on conflict (id) do nothing;
  else
    perform set_config('app.age_band_rpc_guard', 'on', true);
    update users.profiles set age_band = p_band, updated_at = now() where id = v_uid;
    -- Disarm immediately: the flag authorises ONE statement, never the rest of
    -- the transaction.
    perform set_config('app.age_band_rpc_guard', 'off', true);
  end if;

  insert into education.data_rights_event (user_id, action, detail)
  values (
    v_uid,
    'age_band_change',
    jsonb_build_object(
      'old_band', v_old,
      'new_band', p_band,
      'via', 'edu_set_age_band',
      'review_signal', false
    )
  );

  return jsonb_build_object('status', 'ok', 'age_band', p_band, 'reason', 'set');
end;
$function$;

comment on function public.edu_set_age_band(text) is
  'The caller''s own age band, audited. Refuses under_13 -> 13_17|adult (returns status=blocked, band unchanged, refusal audited) — that change routes through edu_guardian_set_age_band, performed by a VERIFIED guardian. Downgrades and first declarations always proceed.';

-- ─── 4. The verified-guardian path (the real birthday, and the no-dead-end) ───
create or replace function public.edu_guardian_set_age_band(
  p_student_user_id uuid,
  p_band text
)
returns jsonb
language plpgsql
security definer
set search_path to 'users', 'education', 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_found boolean := false;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_band is null or p_band not in ('under_13', '13_17', 'adult') then
    raise exception 'Invalid age band: %', coalesce(p_band, '(null)') using errcode = '22023';
  end if;

  -- An ACTIVE link is not enough: only a guardian who completed a COPPA
  -- verifiable-consent method may move a child out of under_13. This is the
  -- same bar edu_coppa_gate uses to unblock AI.
  if not exists (
    select 1 from education.guardian_link gl
    where gl.guardian_user_id = v_uid
      and gl.student_user_id = p_student_user_id
      and gl.status = 'active'
      and gl.verified_at is not null
  ) then
    raise exception
      'not authorized: only a verified parent or guardian can change this account''s age band'
      using errcode = '42501';
  end if;

  select age_band, true into v_old, v_found from users.profiles where id = p_student_user_id;
  if not v_found then
    raise exception 'No profile for that account' using errcode = 'P0002';
  end if;

  perform set_config('app.age_band_rpc_guard', 'on', true);
  update users.profiles set age_band = p_band, updated_at = now() where id = p_student_user_id;
  perform set_config('app.age_band_rpc_guard', 'off', true);

  insert into education.data_rights_event (user_id, action, detail)
  values (
    p_student_user_id,
    'age_band_change',
    jsonb_build_object(
      'old_band', v_old,
      'new_band', p_band,
      'via', 'edu_guardian_set_age_band',
      'guardian_user_id', v_uid,
      'review_signal', false
    )
  );

  return jsonb_build_object('status', 'ok', 'age_band', p_band, 'reason', 'set_by_guardian');
end;
$function$;

comment on function public.edu_guardian_set_age_band(uuid, text) is
  'A VERIFIED guardian sets their student''s age band — the sanctioned route for a child who genuinely turned 13/18, and the reason the self-declaration hard block is not a dead end. Requires an active guardian_link with verified_at set.';

-- ─── Grants ───────────────────────────────────────────────────────────────────
revoke execute on function public.edu_coppa_gate_for(uuid) from public, anon, authenticated;
grant  execute on function public.edu_coppa_gate_for(uuid) to service_role;

revoke execute on function public.edu_coppa_gate() from public, anon;
grant  execute on function public.edu_coppa_gate() to authenticated, service_role;

revoke execute on function public.edu_set_age_band(text) from public, anon;
grant  execute on function public.edu_set_age_band(text) to authenticated, service_role;

revoke execute on function public.edu_guardian_set_age_band(uuid, text) from public, anon;
grant  execute on function public.edu_guardian_set_age_band(uuid, text) to authenticated, service_role;
