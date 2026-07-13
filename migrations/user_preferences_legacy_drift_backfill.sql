-- user_preferences_legacy_drift_backfill
--
-- THE PROBLEM (class of bug, not a one-off): the userPreferences blob shape
-- changed — legacy hardcoded `defaultModel` seed constants became `null`
-- ("platform default", resolved from the AI catalog), and the free-text
-- `videoConference.defaultMicrophone` / `defaultSpeaker` fields were folded
-- into the canonical `audioDevices` module and deleted from the shape — but NO
-- backfill ran. The frontend strips these stale values at every load boundary
-- with a LOUD `console.warn` ("...self-heals on the next save"), so affected
-- users' consoles flood on every page load and dormant users never heal at all.
-- 25 of 26 live rows carried at least one stale value when this was written.
--
-- THE FIX (source of truth, reaches every user incl. dormant ones):
--   1. `users.normalize_preferences_jsonb(jsonb)` — ONE pure, immutable
--      definition of "normalize the known legacy drift". The FE strip logic
--      (lib/redux/preferences/userPreferencesSlice.ts) mirrors these exact
--      frozen sentinels; when the FE adds a new shape migration it adds a
--      matching rule HERE in the SAME change (that discipline is the whole
--      point of this system).
--   2. `users.heal_user_preferences_drift()` — SECURITY DEFINER reaper that
--      rewrites every drifted row through the normalizer. Run once now (the
--      backfill) and weekly by pg_cron (ongoing consistency). NOT granted to
--      authenticated — cron / admin only, like reap_stale_study_sessions.
--   3. Remaining drift is surfaced in the admin data-integrity dashboard
--      (lib/integrity/checks.ts → "user-preferences-legacy-drift"), so "the
--      system reports all drift for all users" is a first-class admin view.
--
-- Idempotent (CREATE OR REPLACE + named cron job + a normalizer that is a
-- no-op on already-clean rows), so re-applying is safe.

-- ─── 1. the pure normalizer — single source of truth for "what is stale" ─────
--
-- Frozen legacy sentinels (these constants are historical and will never
-- change; a FUTURE shape migration adds a NEW rule, it does not edit these):
--   prompts.defaultModel        = '548126f2-714a-4562-9001-0c31cbeea375' → null
--   aiModels.defaultModel       = '548126f2-714a-4562-9001-0c31cbeea375' → null
--   textGeneration.defaultModel = 'GPT-4o'                               → null
--   imageGeneration.defaultModel= 'standard'                            → null
--   videoConference.defaultMicrophone / .defaultSpeaker                 → dropped
create or replace function users.normalize_preferences_jsonb(p jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  out jsonb := p;
begin
  if out is null then
    return out;
  end if;

  -- legacy hardcoded defaultModel seed constants → null (= platform default)
  if out #>> '{prompts,defaultModel}' = '548126f2-714a-4562-9001-0c31cbeea375' then
    out := jsonb_set(out, '{prompts,defaultModel}', 'null'::jsonb, false);
  end if;
  if out #>> '{aiModels,defaultModel}' = '548126f2-714a-4562-9001-0c31cbeea375' then
    out := jsonb_set(out, '{aiModels,defaultModel}', 'null'::jsonb, false);
  end if;
  if out #>> '{textGeneration,defaultModel}' = 'GPT-4o' then
    out := jsonb_set(out, '{textGeneration,defaultModel}', 'null'::jsonb, false);
  end if;
  if out #>> '{imageGeneration,defaultModel}' = 'standard' then
    out := jsonb_set(out, '{imageGeneration,defaultModel}', 'null'::jsonb, false);
  end if;

  -- superseded videoConference audio fields (canonical home is audioDevices)
  if (out #> '{videoConference}') ? 'defaultMicrophone' then
    out := out #- '{videoConference,defaultMicrophone}';
  end if;
  if (out #> '{videoConference}') ? 'defaultSpeaker' then
    out := out #- '{videoConference,defaultSpeaker}';
  end if;

  return out;
end;
$$;

comment on function users.normalize_preferences_jsonb(jsonb) is
  'Pure normalizer for legacy userPreferences drift. Single SQL source of '
  'truth mirrored by the FE strip logic (userPreferencesSlice.ts). A row is '
  '"drifted" iff this function changes it. Add a rule here in the SAME change '
  'as any FE preferences shape migration.';

-- ─── 2. the healer / backfill (SECURITY DEFINER, cron+admin only) ────────────
create or replace function users.heal_user_preferences_drift()
returns integer
language plpgsql
security definer
set search_path = users, public
as $$
declare
  n integer;
begin
  update users.user_preferences up
  set preferences = users.normalize_preferences_jsonb(up.preferences),
      updated_at = now()
  where up.preferences is distinct from users.normalize_preferences_jsonb(up.preferences);
  get diagnostics n = row_count;
  if n > 0 then
    raise notice 'heal_user_preferences_drift: normalized % drifted row(s)', n;
  end if;
  return n;
end;
$$;

revoke all on function users.heal_user_preferences_drift() from public;

comment on function users.heal_user_preferences_drift() is
  'Rewrites every drifted users.user_preferences row through '
  'normalize_preferences_jsonb. Run once as a backfill and weekly by pg_cron. '
  'Not granted to authenticated (cron/admin only).';

-- ─── 3. one-time backfill (runs now, as part of this migration) ──────────────
select users.heal_user_preferences_drift();

-- ─── 4. weekly consistency cron (Mondays 03:20 UTC; upsert by job name) ──────
select cron.schedule(
  'heal-user-preferences-drift',
  '20 3 * * 1',
  $$select users.heal_user_preferences_drift()$$
);
