-- edu_coppa_gate_guest_declaration.sql
--
-- RECORD of a change applied live to Supabase (txzxabzwovsujtloxrus) on
-- 2026-08-19 via the platform DB connection. Idempotent (CREATE OR REPLACE).
--
-- WP9 / D-4b (common-docs/projects/education-platform/CHILD_SAFETY_AND_SCHOOL_HANDOFF.md):
-- GATE GUEST (anonymous) SESSIONS for the education path.
--
-- THE HOLE this closes: `edu_coppa_gate_for` auto-ALLOWED every anonymous
-- (guest) session (`ai_allowed=true, reason='allowed'`). A child blocked as a
-- signed-in under-13 (or who simply wants to skip the age screen) could sign
-- out, continue as a guest, and reach every education AI feature with NO age
-- gate at all. Measured live 2026-08-19: 49 anonymous users, all undeclared,
-- all allowed.
--
-- THE FIX (one verdict function, so all three enforcement layers inherit it —
-- the FE client gate `edu_coppa_gate()`, aidream's `enforce_education_coppa`,
-- and the Next.js `serverCoppaGate`): a guest with NO declared age band is now
-- treated as an undeclared account that must DECLARE before AI generation
-- (`ai_allowed=false, reason='guest_age_undeclared'`). It is a one-tap step
-- (`AgeDeclarationDialog`), not a wall — declaring 13-17/adult unblocks and
-- resumes the action; declaring under-13 routes to the guardian-consent flow
-- exactly like a signed-in child. The guest funnel (WP5) shows the same prompt.
--
-- WHAT DELIBERATELY DID NOT CHANGE (guarded against re-creating the outage):
--  * A SIGNED-IN undeclared account still ALLOWS (reason `age_undeclared`, only
--    nudges). Hard-blocking undeclared signed-in accounts broke ~232 real users
--    on 2026-08-17; that fix stays. The guest block is distinguished by
--    `is_anonymous AND age_band IS NULL`, so an established account is untouched.
--  * A guest who DECLARES 13-17/adult is allowed; a guest who declares under-13
--    needs a VERIFIED guardian — identical to any signed-in learner.
--  * The universal child-safety guard (`enforce_child_safety_at_generation`)
--    keys on `age_band = 'under_13'`, which a guest never has, so platform-wide
--    (non-education) guest AI is NOT affected. Only the education-scoped gate,
--    which keys on `ai_allowed`, refuses a guest.
--
-- ALSO: the verdict CTE now reads `is_anonymous` by driving from `auth.users`
-- (left join `users.profiles`) instead of the reverse. Previously a guest with
-- no profile row would read `is_anonymous=false` and slip through as a signed-in
-- undeclared account (allowed). Driving from `auth.users` reads the real
-- anonymity flag for every subject, so the guest block cannot be dodged by the
-- absence of a profile row. (All 49 live guests currently DO have a profile row,
-- so this is hole-prevention, not a live-data fix.)
--
-- Verified live (adversarial, 2026-08-19): guest-undeclared -> blocked
-- (guest_age_undeclared); guest-declared-adult -> allowed; guest-declared-
-- under_13 -> guardian_consent_required; signed-in-undeclared -> allowed
-- (age_undeclared, UNCHANGED); signed-in under_13 no guardian -> refused
-- (UNCHANGED); adult -> allowed (UNCHANGED).

create or replace function public.edu_coppa_gate_for(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'education', 'users', 'public', 'auth', 'pg_temp'
as $function$
  with me as (
    -- Driven by auth.users so is_anonymous is read for every subject, even one
    -- with no profile row yet (a guest before first declaration).
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
    from auth.users u
    left join users.profiles p on p.id = u.id
    where u.id = p_user_id
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
    -- Undeclared SIGNED-IN -> ALLOW (nudge only; do not re-break established
    -- accounts). Undeclared GUEST -> BLOCK (must declare; the guest can't be an
    -- established account and can't have consent). Only a KNOWN unconsented
    -- under_13 is otherwise refused.
    'ai_allowed', case
      when r.no_subject then true
      when r.is_anonymous and r.age_band is null then false
      when r.age_band = 'under_13' then r.has_verified_guardian
      else true
    end,
    'reason', case
      when r.no_subject then 'allowed'
      when r.is_anonymous and r.age_band is null then 'guest_age_undeclared'
      when r.age_band = 'under_13' and r.has_verified_guardian then 'allowed'
      when r.age_band = 'under_13' and r.has_active_guardian then 'guardian_verification_pending'
      when r.age_band = 'under_13' then 'guardian_consent_required'
      when r.age_band is null then 'age_undeclared'
      else 'allowed'
    end
  ) from r;
$function$;

comment on function public.edu_coppa_gate_for(uuid) is
  'THE COPPA verdict for one user. Called by edu_coppa_gate() for the signed-in caller and by aidream''s server-side gate for an arbitrary user id, so the enforcement layers can never drift. A GUEST (anonymous) session with no declared age band is refused (reason guest_age_undeclared) so it must declare before education AI; a signed-in undeclared account still allows (nudge only). Privileged: not executable by authenticated (it would disclose another user''s age band).';
