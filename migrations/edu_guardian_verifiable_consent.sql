-- edu_guardian_verifiable_consent.sql
--
-- VERIFIABLE PARENTAL CONSENT (COPPA §312.5) on the EXISTING guardian system.
--
-- WHY: the guardian system captures consent ("a parent said yes" = an active
-- guardian_link), but COPPA requires a *verifiable* method (credit-card
-- transaction, signed form, or gov-ID/KBA) proving the consenting party is an
-- adult BEFORE an under-13's data is collected / AI is used. This migration adds
-- the verification state to the SAME link (columns, never a forked consent table)
-- and flips the COPPA gate so an under-13 is unblocked only by a *verified* link.
--
-- THE FLOW: under-13 (or a guardian request) → an active guardian_link →
-- the guardian completes a verifiable step (card auth-and-void / signed form /
-- vendor) → `guardian_confirm_verification` (SERVICE-ONLY: the Stripe webhook or
-- an admin/service path, NEVER the child) stamps verified_at + consent_method +
-- verification_ref → edu_coppa_gate now allows the child. Revoke re-blocks.
--
-- A CHILD CAN NEVER SELF-VERIFY: guardian_confirm_verification is revoked from
-- anon+authenticated and granted only to service_role (the webhook's admin client
-- and secret-token admin routes). Verification is confirmed server-side, never a
-- client claim.
--
-- BEHAVIOR CHANGE (intended, COPPA-correct): an under-13 previously unblocked by a
-- mere active link is now blocked until that link is VERIFIED (reason
-- 'guardian_verification_pending'). 13-17 and adult accounts are unaffected.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP...IF EXISTS.

-- ─── 1. Verification state on the link (columns, not a new table) ─────────────
alter table education.guardian_link
  add column if not exists consent_method text
    check (consent_method is null or consent_method in ('card', 'signed_form', 'vendor_id')),
  add column if not exists verified_at      timestamptz,
  add column if not exists verification_ref text;

comment on column education.guardian_link.consent_method is
  'COPPA verifiable-consent method that verified this link: card (refundable/auth-and-void charge) | signed_form | vendor_id (gov-ID/KBA). Null = consent captured but NOT yet verifiable.';
comment on column education.guardian_link.verified_at is
  'When a verifiable-consent method completed (server-confirmed). Null = pending verification. An under-13 is COPPA-unblocked only when an ACTIVE link has verified_at set.';
comment on column education.guardian_link.verification_ref is
  'Opaque reference to the verification artifact: Stripe PaymentIntent id (card), uploaded signed-form file id, or vendor verification id.';

create index if not exists idx_guardian_link_student_verified
  on education.guardian_link (student_user_id, status, verified_at);

-- ─── 2. edu_coppa_gate — VERIFIED link is the under-13 unblock ────────────────
-- Adds has_verified_guardian + the 'guardian_verification_pending' reason (active
-- link, not yet verified). ai_allowed for under-13 now requires VERIFICATION, not
-- just an active link. aidream's server-side COPPA enforcement reads this verdict
-- (or education.guardian_link directly): "verified" = an active link with
-- verified_at IS NOT NULL.
create or replace function public.edu_coppa_gate()
returns jsonb
language sql
security definer
set search_path = education, users, public, pg_temp
as $$
  with me as (
    select p.age_band,
           exists (
             select 1 from education.guardian_link gl
             where gl.student_user_id = auth.uid() and gl.status = 'active'
           ) as has_active_guardian,
           exists (
             select 1 from education.guardian_link gl
             where gl.student_user_id = auth.uid()
               and gl.status = 'active'
               and gl.verified_at is not null
           ) as has_verified_guardian
    from users.profiles p
    where p.id = auth.uid()
  ),
  resolved as (
    select
      coalesce((select age_band from me), null) as age_band,
      coalesce((select has_active_guardian from me), false) as has_active_guardian,
      coalesce((select has_verified_guardian from me), false) as has_verified_guardian
  )
  select jsonb_build_object(
    'age_band', r.age_band,
    'requires_consent', (r.age_band = 'under_13'),
    'has_active_guardian', r.has_active_guardian,
    'has_verified_guardian', r.has_verified_guardian,
    'ai_allowed', case
      when r.age_band = 'under_13' then r.has_verified_guardian
      else true
    end,
    'reason', case
      when r.age_band = 'under_13' and r.has_verified_guardian then 'allowed'
      when r.age_band = 'under_13' and r.has_active_guardian then 'guardian_verification_pending'
      when r.age_band = 'under_13' then 'guardian_consent_required'
      when r.age_band is null then 'age_undeclared'
      else 'allowed'
    end
  )
  from resolved r;
$$;
revoke execute on function public.edu_coppa_gate() from public, anon;
grant  execute on function public.edu_coppa_gate() to authenticated;

-- ─── 3. guardian_grant — reset verification on a FRESH (re)grant ──────────────
-- Re-CREATE of the D52 neutral/rate-limited grant, adding: when the conflict row
-- was NOT already active (a fresh link, or a re-grant after a revoke), the new
-- consent starts UNVERIFIED — verification must be re-earned (COPPA: a revoked +
-- re-established consent needs fresh verification). An already-active link keeps
-- its verification on an idempotent refresh.
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
          -- Fresh/re-established consent (was not already active) → verification resets.
          verified_at      = case when education.guardian_link.status = 'active' then education.guardian_link.verified_at else null end,
          consent_method   = case when education.guardian_link.status = 'active' then education.guardian_link.consent_method else null end,
          verification_ref = case when education.guardian_link.status = 'active' then education.guardian_link.verification_ref else null end,
          updated_at   = now();
  end if;

  return jsonb_build_object('status', 'granted');
end;
$$;
revoke execute on function public.guardian_grant(text, text) from public, anon;
grant  execute on function public.guardian_grant(text, text) to authenticated;

-- ─── 4. guardian_list_links — carry verification state + student age band ─────
-- Adds verified_at, consent_method, and student_age_band so the guardian UI knows
-- which linked children are under-13 and still need verification, and can show a
-- "consent verified" badge. student_age_band is the age band of the link's STUDENT
-- (the child when the caller is the guardian; the caller themselves otherwise) —
-- privacy-safe: a guardian on an active link may know their own child needs consent.
drop function if exists public.guardian_list_links();
create function public.guardian_list_links()
returns table (
  id                   uuid,
  guardian_user_id     uuid,
  student_user_id      uuid,
  status               text,
  relationship         text,
  requested_by         text,
  created_at           timestamptz,
  reviewed_at          timestamptz,
  role                 text,
  counterpart_user_id  uuid,
  counterpart_email    text,
  counterpart_name     text,
  verified_at          timestamptz,
  consent_method       text,
  student_age_band     text
)
language sql
security definer
set search_path = education, users, public, pg_temp
as $$
  select
    l.id, l.guardian_user_id, l.student_user_id, l.status, l.relationship,
    l.requested_by, l.created_at, l.reviewed_at,
    case when l.guardian_user_id = auth.uid() then 'guardian' else 'student' end as role,
    case when l.guardian_user_id = auth.uid() then l.student_user_id else l.guardian_user_id end as counterpart_user_id,
    u.email::text as counterpart_email,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as counterpart_name,
    l.verified_at,
    l.consent_method,
    sp.age_band as student_age_band
  from education.guardian_link l
  join auth.users u
    on u.id = case when l.guardian_user_id = auth.uid() then l.student_user_id else l.guardian_user_id end
  left join users.profiles sp
    on sp.id = l.student_user_id
  where (l.guardian_user_id = auth.uid() or l.student_user_id = auth.uid())
    and l.status <> 'revoked'
  order by l.status, l.created_at desc;
$$;
revoke execute on function public.guardian_list_links() from public, anon;
grant  execute on function public.guardian_list_links() to authenticated;

-- ─── 5. guardian_confirm_verification — the SERVICE-ONLY verified write path ──
-- The single server-side write that marks a link verifiably-consented. Called by
-- the Stripe webhook (card auth-and-void completed) and secret-token admin routes
-- (signed-form review) via the service_role admin client. NEVER granted to
-- authenticated/anon — a child (or the guardian in-browser) can never self-verify.
-- Only stamps an ACTIVE link; a revoked/pending link is not verifiable.
create or replace function public.guardian_confirm_verification(
  p_link_id uuid,
  p_method  text,
  p_ref     text
)
returns education.guardian_link
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
declare
  v_row education.guardian_link;
begin
  if p_method is null or p_method not in ('card', 'signed_form', 'vendor_id') then
    raise exception 'Invalid consent method: %', coalesce(p_method, '(null)') using errcode = '22023';
  end if;
  update education.guardian_link
    set verified_at      = now(),
        consent_method   = p_method,
        verification_ref = p_ref,
        updated_at       = now()
  where id = p_link_id
    and status = 'active'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'No active guardian link % to verify', p_link_id using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;
revoke execute on function public.guardian_confirm_verification(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.guardian_confirm_verification(uuid, text, text) to service_role;
