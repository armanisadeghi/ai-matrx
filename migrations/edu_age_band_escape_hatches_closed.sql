-- edu_age_band_escape_hatches_closed.sql
--
-- RECORD of changes already applied live to Supabase (txzxabzwovsujtloxrus) on
-- 2026-08-17 via the Supabase MCP, in three parts (function bodies; the trigger
-- swap + REVOKE, retried under a short lock_timeout because users.profiles is a
-- hot table; the guardian functions). Idempotent.
--
-- WP9 — four holes found by an ADVERSARIAL REVIEW of the same day's work. Three
-- of them let a child out of the under-13 protections entirely.
--
-- H1  DELETE-AND-REINSERT. The write guard was BEFORE UPDATE only, and RLS lets
--     a user delete their own profile (std_delete: created_by = auth.uid()).
--     So: delete the row -> insert it again with age_band='adult' -> the gate
--     says allowed, and NOTHING is audited. Proven live; 76 of 269 profiles had
--     created_by = id and were exploitable. Blocking only the INSERT is not
--     enough either: deleting the row makes the band NULL, and a fresh
--     declaration then reads as a legitimate FIRST declaration.
--     Three layers, each sufficient alone:
--       (a) the guard fires BEFORE INSERT and BEFORE DELETE as well as UPDATE;
--       (b) DELETE on users.profiles is revoked from `authenticated` (nothing
--           in the app deletes a profile as the user — account deletion goes
--           through auth/GoTrue and the data-rights flow);
--       (c) edu_set_age_band consults the AUDIT LEDGER, not just the current
--           row: a user who was EVER under_13 cannot declare upward even with
--           no profile row at all. A user can (could) delete the row; they can
--           never write or delete a data_rights_event.
--
-- M1  `select ... into v_old, v_found` sets EVERY target to NULL when no row
--     matches, so v_found was NULL (falsy) and the no-profile branch was dead
--     code. The guarded UPDATE hit 0 rows and the function returned
--     {"status":"ok"} and wrote an age_band_change audit row for a write that
--     never happened — a falsified audit trail, and a permanent "ask your
--     parent" dead end for any user with no profile row. Fixed with `found`.
--
-- M2  A WITHDRAWN parental consent came back VERIFIED. guardian_unlink left
--     verified_at populated, and guardian_request_student never reset it (only
--     guardian_grant did). revoke -> re-request -> respond produced
--     status='active' AND verified_at IS NOT NULL with no new card
--     authorization, which both edu_coppa_gate_for and edu_guardian_set_age_band
--     read as verified consent. Fixed at both ends.
--
-- Re-verified live after the fix (rolled-back transaction, 7/7): DELETE refused
-- 42501; INSERT carrying an age_band refused 42501; the ledger blocks the
-- upgrade with no profile row and creates no adult profile; a user with no
-- profile row CAN make a first declaration (the dead branch is alive); unlink
-- clears the verification; a re-link does not inherit one.

CREATE OR REPLACE FUNCTION users._guard_age_band_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'users', 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then
    -- Deleting the row deletes the age band with it. That IS the escape:
    -- afterwards the band is NULL and a fresh declaration reads as a legitimate
    -- first declaration.
    if old.age_band is not null
       and coalesce(current_setting('app.age_band_rpc_guard', true), '') <> 'on'
       and coalesce(auth.role(), '') <> 'service_role'
    then
      raise exception
        'a profile carrying an age_band cannot be deleted (COPPA: deleting it would clear the under-13 protections -- WP9)'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.age_band is not null
       and coalesce(current_setting('app.age_band_rpc_guard', true), '') <> 'on'
       and coalesce(auth.role(), '') <> 'service_role'
    then
      raise exception
        'age_band can only be set via public.edu_set_age_band() (COPPA audit trail; a direct INSERT carrying an age_band is blocked -- WP9)'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.age_band is distinct from old.age_band then
    if coalesce(current_setting('app.age_band_rpc_guard', true), '') <> 'on'
       and coalesce(auth.role(), '') <> 'service_role'
    then
      raise exception
        'age_band can only be changed via public.edu_set_age_band() (COPPA audit trail; direct writes are blocked -- FOUND_DEFECTS D57)'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.edu_set_age_band(p_band text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'users', 'education', 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_found boolean;
  v_ever_under_13 boolean;
  v_effective_old text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_band is null or p_band not in ('under_13', '13_17', 'adult') then
    raise exception 'Invalid age band: %', coalesce(p_band, '(null)') using errcode = '22023';
  end if;

  select age_band into v_old from users.profiles where id = v_uid;
  -- `found` is the ONLY reliable signal: SELECT INTO sets every target to NULL
  -- on no match, so a `true` sentinel comes back NULL, not false (M1).
  v_found := found;

  select exists (
    select 1 from education.data_rights_event
    where user_id = v_uid
      and action in ('age_band_change', 'age_band_change_blocked')
      and (detail->>'old_band' = 'under_13' or detail->>'new_band' = 'under_13')
  ) into v_ever_under_13;

  v_effective_old := coalesce(v_old, case when v_ever_under_13 then 'under_13' end);

  -- THE HARD BLOCK. Audited WITHOUT raising, deliberately: raising would roll
  -- back this very audit row.
  if v_effective_old = 'under_13' and p_band in ('13_17', 'adult') then
    insert into education.data_rights_event (user_id, action, detail)
    values (
      v_uid,
      'age_band_change_blocked',
      jsonb_build_object(
        'old_band', v_effective_old,
        'new_band', p_band,
        'via', 'edu_set_age_band',
        'review_signal', true,
        'requires', 'verified_guardian',
        'profile_row_present', coalesce(v_found, false)
      )
    );
    raise warning
      'COPPA: REFUSED self-declared age change % -> % for user % (a verified guardian must confirm it via edu_guardian_set_age_band).',
      v_effective_old, p_band, v_uid;
    return jsonb_build_object(
      'status', 'blocked',
      'age_band', v_effective_old,
      'reason', 'guardian_required_for_age_change',
      'message', 'A parent or guardian has to confirm this change from their Family page.'
    );
  end if;

  perform set_config('app.age_band_rpc_guard', 'on', true);
  if coalesce(v_found, false) then
    update users.profiles set age_band = p_band, updated_at = now() where id = v_uid;
  else
    insert into users.profiles (id, age_band) values (v_uid, p_band)
    on conflict (id) do update set age_band = excluded.age_band, updated_at = now();
  end if;
  perform set_config('app.age_band_rpc_guard', 'off', true);

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
$function$
;

CREATE OR REPLACE FUNCTION public.guardian_unlink(p_guardian_user_id uuid, p_student_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
begin
  update education.guardian_link
    set status           = 'revoked',
        revoked_at       = now(),
        updated_at       = now(),
        -- Withdrawing consent withdraws the VERIFICATION with it.
        verified_at      = null,
        consent_method   = null,
        verification_ref = null
  where guardian_user_id = p_guardian_user_id and student_user_id = p_student_user_id
    and (guardian_user_id = auth.uid() or student_user_id = auth.uid()) and status <> 'revoked';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guardian_request_student(p_student_email text, p_relationship text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
declare
  v_student uuid;
  v_rl      jsonb;
begin
  v_rl := public.check_file_rate_limit(auth.uid(), 'edu_guardian_consent', 8);
  if not coalesce((v_rl->>'allowed')::boolean, true) then
    raise exception 'Too many consent requests. Please wait a minute and try again.'
      using errcode = 'P0001';
  end if;

  v_student := public.guardian_find_user_by_email(p_student_email);

  if v_student is not null and v_student = auth.uid() then
    raise exception 'You cannot request access to your own account' using errcode = '22023';
  end if;

  if v_student is not null then
    insert into education.guardian_link
      (guardian_user_id, student_user_id, status, relationship, requested_by, created_by)
    values
      (auth.uid(), v_student, 'pending', p_relationship, 'guardian', auth.uid())
    on conflict (guardian_user_id, student_user_id) do update
      set status       = case when education.guardian_link.status = 'active' then 'active' else 'pending' end,
          relationship = coalesce(excluded.relationship, education.guardian_link.relationship),
          requested_by = 'guardian',
          revoked_at   = null,
          -- A re-link NEVER inherits a previous verification. Only a fresh
          -- verifiable act (guardian_confirm_verification, service-only) may set
          -- these — matching what guardian_grant already did.
          verified_at      = case when education.guardian_link.status = 'active'
                                  then education.guardian_link.verified_at else null end,
          consent_method   = case when education.guardian_link.status = 'active'
                                  then education.guardian_link.consent_method else null end,
          verification_ref = case when education.guardian_link.status = 'active'
                                  then education.guardian_link.verification_ref else null end,
          updated_at   = now();
  end if;

  return jsonb_build_object('status', 'sent');
end;
$function$
;

drop trigger if exists _guard_age_band on users.profiles;
create trigger _guard_age_band
  before insert or update or delete on users.profiles
  for each row execute function users._guard_age_band_change();

revoke delete on users.profiles from authenticated;

revoke execute on function public.edu_set_age_band(text) from public, anon;
grant  execute on function public.edu_set_age_band(text) to authenticated, service_role;
revoke execute on function public.guardian_unlink(uuid, uuid) from public, anon;
grant  execute on function public.guardian_unlink(uuid, uuid) to authenticated, service_role;
revoke execute on function public.guardian_request_student(text, text) from public, anon;
grant  execute on function public.guardian_request_student(text, text) to authenticated, service_role;
