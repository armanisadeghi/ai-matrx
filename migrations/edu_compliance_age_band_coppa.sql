-- edu_compliance_age_band_coppa.sql
--
-- School-safe compliance (COPPA age gate). Captures a user's AGE BAND and exposes
-- the authoritative COPPA gate the client checks before any AI generation /
-- data collection.
--
-- WHY a column, not a new table: an age band is a single per-user attribute with
-- no lifecycle of its own — it belongs on the canonical per-user row
-- (`users.profiles`, PK = the user's id), per reuse-first DB rules. Nullable so
-- existing users are "unknown" until they self-declare (nudged, not hard-blocked).
--
-- THE GATE (reuses the existing guardian-consent system — NO parallel consent
-- store): an `under_13` account may use AI only while it has an ACTIVE inbound
-- guardian link (a parent approved via the guardian_* RPCs). `edu_coppa_gate()`
-- resolves this server-side (guardian_link is RLS-guarded, so only a definer RPC
-- can read "does this student have an active guardian"). The client renders the
-- "a parent must approve" state from this verdict — never a silent failure.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE.

-- ─── Age band on the canonical profile ───────────────────────────────────────
alter table users.profiles
  add column if not exists age_band text
    check (age_band is null or age_band in ('under_13', '13_17', 'adult'));

comment on column users.profiles.age_band is
  'COPPA age band: under_13 | 13_17 | adult (null = undeclared). under_13 gates AI/data collection behind an active guardian link — see public.edu_coppa_gate().';

-- ─── Set the caller''s OWN age band (validated single path) ───────────────────
create or replace function public.edu_set_age_band(p_band text)
returns text
language plpgsql
security definer
set search_path = users, public, pg_temp
as $$
begin
  if p_band is null or p_band not in ('under_13', '13_17', 'adult') then
    raise exception 'Invalid age band: %', coalesce(p_band, '(null)') using errcode = '22023';
  end if;
  update users.profiles
    set age_band = p_band, updated_at = now()
  where id = auth.uid();
  if not found then
    raise exception 'No profile for the current user' using errcode = 'P0002';
  end if;
  return p_band;
end;
$$;

-- ─── The authoritative COPPA AI/data gate for the current user ────────────────
-- Returns a stable verdict shape. `ai_allowed=false` + reason
-- 'guardian_consent_required' is the ONLY block; the client renders a clear
-- "a parent must approve" state (never a silent failure). An undeclared band is
-- allowed (existing users aren''t broken) but flagged so the UI can nudge.
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
           ) as has_active_guardian
    from users.profiles p
    where p.id = auth.uid()
  ),
  -- Fall back to a synthetic row if the caller has no profile yet.
  resolved as (
    select
      coalesce((select age_band from me), null) as age_band,
      coalesce((select has_active_guardian from me), false) as has_active_guardian
  )
  select jsonb_build_object(
    'age_band', r.age_band,
    'requires_consent', (r.age_band = 'under_13'),
    'has_active_guardian', r.has_active_guardian,
    'ai_allowed', case
      when r.age_band = 'under_13' then r.has_active_guardian
      else true
    end,
    'reason', case
      when r.age_band = 'under_13' and not r.has_active_guardian then 'guardian_consent_required'
      when r.age_band is null then 'age_undeclared'
      else 'allowed'
    end
  )
  from resolved r;
$$;

-- ─── Grants (authenticated only; anon/public revoked) ─────────────────────────
revoke execute on function public.edu_set_age_band(text) from public, anon;
revoke execute on function public.edu_coppa_gate()       from public, anon;
grant  execute on function public.edu_set_age_band(text) to authenticated;
grant  execute on function public.edu_coppa_gate()       to authenticated;
