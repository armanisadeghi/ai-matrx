-- edu_age_band_grandfather_existing_adults.sql
--
-- DATA migration, applied live 2026-08-22 via Supabase MCP (service_role, which
-- the users._guard_age_band_change trigger permits). Arman's ruling 2026-08-22:
-- grandfather every existing signed-in account with no declared age band as
-- `adult` so the post-sign-in age prompt stops asking established users and the
-- COPPA rollout is finished for the installed base. New signups are unaffected —
-- they still get FirstSignInAgeGateMount once per session until they answer.
--
-- Scope: non-anonymous auth.users with a users.profiles row and age_band IS NULL.
-- Guests (is_anonymous) are untouched — they remain gated (guest_age_undeclared).
-- Accounts with no profiles row are untouched (profiles.organization_id is NOT
-- NULL with no default; the gate already ALLOWS a signed-in null band, so they
-- are not blocked — they will simply be asked once).
--
-- Audit: one education.data_rights_event row per grandfathered user, mirroring
-- edu_set_age_band's shape, with via='grandfather_existing_adults'.
-- Idempotent: re-running touches no rows (age_band is no longer NULL).
-- The write arms the same transaction-local guard edu_set_age_band uses.

select set_config('app.age_band_rpc_guard', 'on', true);

with targets as (
  select p.id
  from users.profiles p
  join auth.users u on u.id = p.id
  where p.age_band is null
    and coalesce(u.is_anonymous, false) = false
),
upd as (
  update users.profiles p
     set age_band = 'adult', updated_at = now()
    from targets t
   where p.id = t.id
  returning p.id
)
insert into education.data_rights_event (user_id, action, detail)
select id, 'age_band_change',
       jsonb_build_object(
         'old_band', null,
         'new_band', 'adult',
         'via', 'grandfather_existing_adults',
         'ruled_by', 'arman_2026-08-22',
         'review_signal', false
       )
  from upd;

select set_config('app.age_band_rpc_guard', 'off', true);
