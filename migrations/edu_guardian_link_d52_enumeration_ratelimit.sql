-- edu_guardian_link_d52_enumeration_ratelimit.sql
--
-- FOUND_DEFECTS D52 fix — close the email-enumeration oracle in the two public
-- guardian consent RPCs and add a per-requester rate limit so a stranger can't
-- spam a real user's consent inbox.
--
-- THE LEAK (before): `guardian_grant` / `guardian_request_student` resolved the
-- target email and `raise exception 'No account found for %'` (P0002) when it
-- didn't match a row, but inserted/returned a row when it did — so any
-- authenticated user could distinguish "account exists" from "no account" by the
-- response, harvesting which emails have AI Matrx accounts.
--
-- THE FIX (school-safe / COPPA-FERPA hardening):
--   1. Both RPCs now return an IDENTICAL neutral response — `{"status":"sent"}`
--      / `{"status":"granted"}` — whether or not the email resolves to an
--      account. A link is created only when the email resolves; when it doesn't,
--      the RPC no-ops and returns the SAME shape (never confirming existence).
--      The ONLY error either RPC raises is the caller's OWN-email case, which
--      leaks nothing (everyone knows their own address), plus the rate-limit
--      block (raised BEFORE the email is resolved, so it is existence-blind).
--   2. A per-requester, per-minute rate limit (reusing the generic
--      `public.check_file_rate_limit` bucket primitive, bucket_kind
--      `edu_guardian_consent`) caps rapid consent requests. Checked first, so it
--      is identical for existent and nonexistent targets.
--
-- The return TYPE changes from `education.guardian_link` to `jsonb`, so both
-- functions must be DROPped and recreated (Postgres can't CREATE OR REPLACE a
-- return-type change). Idempotent: DROP ... IF EXISTS + CREATE.
--
-- Doctrine: protected-resources / least-privilege — these stay `authenticated`
-- only (anon revoked here again, self-contained), all writes via the definer RPC.

-- ─── Rate-limit cap (per requester, per minute) ──────────────────────────────
-- 8/min is generous for a human adding a parent/child but throttles scripted
-- inbox-spam / enumeration sweeps. Reuses files.rate_limit_buckets via
-- public.check_file_rate_limit (a generic per-actor per-minute counter).

-- ─── guardian_request_student — GUARDIAN requests access to a student ─────────
drop function if exists public.guardian_request_student(text, text);
create function public.guardian_request_student(
  p_student_email text,
  p_relationship  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
declare
  v_student uuid;
  v_rl      jsonb;
begin
  -- Rate limit FIRST — existence-blind (same for real + fake emails). D52.
  v_rl := public.check_file_rate_limit(auth.uid(), 'edu_guardian_consent', 8);
  if not coalesce((v_rl->>'allowed')::boolean, true) then
    raise exception 'Too many consent requests. Please wait a minute and try again.'
      using errcode = 'P0001';
  end if;

  v_student := public.guardian_find_user_by_email(p_student_email);

  -- Only the caller's OWN email is a safe error (leaks nothing). NEVER branch the
  -- response on whether SOMEONE ELSE's email resolves — that was the D52 oracle.
  if v_student is not null and v_student = auth.uid() then
    raise exception 'You cannot request access to your own account' using errcode = '22023';
  end if;

  -- Create the pending request only if the email resolves; otherwise no-op. The
  -- RETURN below is identical either way, so the caller can't tell the difference.
  if v_student is not null then
    insert into education.guardian_link
      (guardian_user_id, student_user_id, status, relationship, requested_by, created_by)
    values
      (auth.uid(), v_student, 'pending', p_relationship, 'guardian', auth.uid())
    on conflict (guardian_user_id, student_user_id) do update
      -- Re-requesting after a revoke re-opens a pending request; an already-active
      -- link is left untouched.
      set status       = case when education.guardian_link.status = 'active' then 'active' else 'pending' end,
          relationship = coalesce(excluded.relationship, education.guardian_link.relationship),
          requested_by = 'guardian',
          revoked_at   = null,
          updated_at   = now();
  end if;

  return jsonb_build_object('status', 'sent');
end;
$$;

-- ─── guardian_grant — STUDENT grants a guardian read access immediately ───────
drop function if exists public.guardian_grant(text, text);
create function public.guardian_grant(
  p_guardian_email text,
  p_relationship   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
declare
  v_guardian uuid;
  v_rl       jsonb;
begin
  v_rl := public.check_file_rate_limit(auth.uid(), 'edu_guardian_consent', 8);
  if not coalesce((v_rl->>'allowed')::boolean, true) then
    raise exception 'Too many consent requests. Please wait a minute and try again.'
      using errcode = 'P0001';
  end if;

  v_guardian := public.guardian_find_user_by_email(p_guardian_email);

  if v_guardian is not null and v_guardian = auth.uid() then
    raise exception 'You cannot add yourself as a guardian' using errcode = '22023';
  end if;

  if v_guardian is not null then
    insert into education.guardian_link
      (guardian_user_id, student_user_id, status, relationship, requested_by, created_by, reviewed_at)
    values
      (v_guardian, auth.uid(), 'active', p_relationship, 'student', auth.uid(), now())
    on conflict (guardian_user_id, student_user_id) do update
      set status       = 'active',
          relationship = coalesce(excluded.relationship, education.guardian_link.relationship),
          reviewed_at  = now(),
          revoked_at   = null,
          updated_at   = now();
  end if;

  return jsonb_build_object('status', 'granted');
end;
$$;

-- ─── Grants (self-contained; authenticated only, anon/public revoked) ─────────
revoke execute on function public.guardian_request_student(text, text) from public, anon;
revoke execute on function public.guardian_grant(text, text)           from public, anon;
grant  execute on function public.guardian_request_student(text, text) to authenticated;
grant  execute on function public.guardian_grant(text, text)           to authenticated;
