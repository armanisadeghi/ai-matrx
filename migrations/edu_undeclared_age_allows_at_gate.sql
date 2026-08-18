-- edu_undeclared_age_allows_at_gate.sql
--
-- RECORD of a corrective change applied live to Supabase (txzxabzwovsujtloxrus)
-- on 2026-08-17 via the Supabase MCP. Idempotent (CREATE OR REPLACE).
--
-- INCIDENT + FIX. `edu_coppa_gate_applies.sql` (same day) made an UNDECLARED age
-- band hard-refuse generation. Because 276 of 277 profiles were NULL and signup
-- collects no age, that instantly blocked ~232 real accounts from ALL education
-- AI generation, with no built path to declare an age (the declaration dialog
-- existed only inside the per-action gate; there was no signup collection and no
-- proactive prompt). Users hit a raw server error, not a friendly prompt.
--
-- Failing an established account's request because it predates the age field is
-- OVER-TIGHTENING a legitimate user -- which the platform's own security law
-- (db-rules §6) calls as serious a defect as letting an intruder in. The server
-- cannot distinguish "adult who never declared" from "child who never declared",
-- so a hard refusal on "I don't know your age" is wrong for an established
-- account.
--
-- CORRECTION: undeclared -> ALLOW at the generation boundary (reason kept as
-- 'age_undeclared' so the UI can still nudge). Declaration is enforced UP FRONT
-- (a neutral age screen at signup + a proactive prompt for existing users),
-- never by failing a generation request. The real protection is UNCHANGED: a
-- DECLARED under_13 without a VERIFIED guardian is still refused, anonymous
-- sessions are still allowed, and the under_13->adult self-declaration hard
-- block, the verified-guardian route, and every escape-hatch fix stay in place.

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
    -- Undeclared -> ALLOW. Only a KNOWN unconsented under_13 is refused.
    'ai_allowed', case
      when r.no_subject or r.is_anonymous then true
      when r.age_band = 'under_13' then r.has_verified_guardian
      else true
    end,
    'reason', case
      when r.no_subject or r.is_anonymous then 'allowed'
      when r.age_band = 'under_13' and r.has_verified_guardian then 'allowed'
      when r.age_band = 'under_13' and r.has_active_guardian then 'guardian_verification_pending'
      when r.age_band = 'under_13' then 'guardian_consent_required'
      when r.age_band is null then 'age_undeclared'
      else 'allowed'
    end
  ) from r;
$function$;
