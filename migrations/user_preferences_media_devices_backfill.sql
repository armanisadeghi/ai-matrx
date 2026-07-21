-- user_preferences_media_devices_backfill
--
-- Media-capture plan Phase 4: the audio-only `audioDevices` preference module
-- was superseded by the unified `mediaDevices` module (mic + speaker + camera
-- + preferred facing mode), and the placeholder-enum
-- `videoConference.defaultCamera` field was deleted (never wired to real
-- enumerateDevices ids — dropped with no mapping).
--
-- This migration ADDS the matching rules to the DB-side normalizer,
-- `users.normalize_preferences_jsonb`. Per the frozen-rules law of
-- user_preferences_legacy_drift_backfill.sql, prior rules are NEVER edited —
-- this is a CREATE OR REPLACE carrying every existing rule verbatim plus the
-- new ones. The FE mirror is `liftLegacyAudioDevicesToMediaDevices` in
-- lib/redux/preferences/userPreferencesSlice.ts (same change, same semantics).
--
-- New rules:
--   audioDevices (module)            → lifted into mediaDevices (audio fields
--                                      copied; video fields seeded "") when
--                                      mediaDevices is absent/empty, then the
--                                      audioDevices key is removed either way
--   videoConference.defaultCamera    → dropped (placeholder enum, no mapping)
--
-- The healer (`users.heal_user_preferences_drift()`), weekly pg_cron job, and
-- admin drift surfaces all key off this normalizer, so they pick the new rules
-- up automatically; the drift report function is re-created below so its
-- drifted_fields listing names the new rules too.
--
-- Idempotent (CREATE OR REPLACE + a normalizer that is a no-op on
-- already-clean rows), so re-applying is safe.

-- ─── 1. the pure normalizer — single source of truth for "what is stale" ─────
--
-- Frozen legacy sentinels (historical, never edited; new shape migrations add
-- NEW rules below the existing ones):
--   prompts.defaultModel        = '548126f2-714a-4562-9001-0c31cbeea375' → null
--   aiModels.defaultModel       = '548126f2-714a-4562-9001-0c31cbeea375' → null
--   textGeneration.defaultModel = 'GPT-4o'                               → null
--   imageGeneration.defaultModel= 'standard'                             → null
--   videoConference.defaultMicrophone / .defaultSpeaker                  → dropped
--   videoConference.defaultCamera                                        → dropped
--   audioDevices                                     → lifted → mediaDevices
create or replace function users.normalize_preferences_jsonb(p jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  out jsonb := p;
  legacy_audio jsonb;
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

  -- superseded videoConference audio fields (canonical home is mediaDevices).
  -- The jsonb_typeof(...)='object' guard keeps this TOTAL: `?` is array-
  -- membership too, so an array videoConference containing the sentinel string
  -- would pass `?` and then `#-` would throw on the array (non-integer path
  -- element), aborting the whole set-based heal for one poisoned row.
  if jsonb_typeof(out #> '{videoConference}') = 'object' then
    if (out #> '{videoConference}') ? 'defaultMicrophone' then
      out := out #- '{videoConference,defaultMicrophone}';
    end if;
    if (out #> '{videoConference}') ? 'defaultSpeaker' then
      out := out #- '{videoConference,defaultSpeaker}';
    end if;
    -- 2026-07 (media-capture Phase 4): placeholder-enum camera field —
    -- dropped, no mapping (it never held a real deviceId).
    if (out #> '{videoConference}') ? 'defaultCamera' then
      out := out #- '{videoConference,defaultCamera}';
    end if;
  end if;

  -- 2026-07 (media-capture Phase 4): the audio-only audioDevices module was
  -- superseded by the unified mediaDevices module. Lift the stored audio
  -- fields into mediaDevices ONLY when mediaDevices is absent/empty (a real
  -- mediaDevices choice always wins); remove the audioDevices key either way.
  if jsonb_typeof(out #> '{audioDevices}') = 'object' then
    legacy_audio := out #> '{audioDevices}';
    if out #> '{mediaDevices}' is null
       or out #> '{mediaDevices}' = '{}'::jsonb then
      out := jsonb_set(
        out,
        '{mediaDevices}',
        jsonb_build_object(
          'audioInputDeviceId',
            coalesce(legacy_audio ->> 'audioInputDeviceId', ''),
          'audioInputDeviceLabel',
            coalesce(legacy_audio ->> 'audioInputDeviceLabel', ''),
          'audioOutputDeviceId',
            coalesce(legacy_audio ->> 'audioOutputDeviceId', ''),
          'audioOutputDeviceLabel',
            coalesce(legacy_audio ->> 'audioOutputDeviceLabel', ''),
          'videoInputDeviceId', '',
          'videoInputDeviceLabel', '',
          'preferredFacingMode', ''
        ),
        true
      );
    end if;
    out := out - 'audioDevices';
  elsif out ? 'audioDevices' then
    -- Non-object poison (null/array/string) — just drop the key.
    out := out - 'audioDevices';
  end if;

  return out;
end;
$$;

comment on function users.normalize_preferences_jsonb(jsonb) is
  'Pure normalizer for legacy userPreferences drift. Single SQL source of '
  'truth mirrored by the FE strip logic (userPreferencesSlice.ts). A row is '
  '"drifted" iff this function changes it. Add a rule here in the SAME change '
  'as any FE preferences shape migration.';

-- ─── 2. drift report — re-created so drifted_fields names the new rules ─────
create or replace function users.user_preferences_drift_report()
returns table (
  user_id uuid,
  organization_id uuid,
  updated_at timestamptz,
  drifted_fields text
)
language sql
security definer
set search_path = users, public
as $$
  select
    up.user_id,
    up.organization_id,
    up.updated_at,
    array_to_string(array_remove(array[
      case when up.preferences #>> '{prompts,defaultModel}'
                = '548126f2-714a-4562-9001-0c31cbeea375'
           then 'prompts.defaultModel' end,
      case when up.preferences #>> '{aiModels,defaultModel}'
                = '548126f2-714a-4562-9001-0c31cbeea375'
           then 'aiModels.defaultModel' end,
      case when up.preferences #>> '{textGeneration,defaultModel}' = 'GPT-4o'
           then 'textGeneration.defaultModel' end,
      case when up.preferences #>> '{imageGeneration,defaultModel}' = 'standard'
           then 'imageGeneration.defaultModel' end,
      case when jsonb_typeof(up.preferences #> '{videoConference}') = 'object'
                and (up.preferences #> '{videoConference}') ? 'defaultMicrophone'
           then 'videoConference.defaultMicrophone' end,
      case when jsonb_typeof(up.preferences #> '{videoConference}') = 'object'
                and (up.preferences #> '{videoConference}') ? 'defaultSpeaker'
           then 'videoConference.defaultSpeaker' end,
      case when jsonb_typeof(up.preferences #> '{videoConference}') = 'object'
                and (up.preferences #> '{videoConference}') ? 'defaultCamera'
           then 'videoConference.defaultCamera' end,
      case when up.preferences ? 'audioDevices'
           then 'audioDevices (superseded by mediaDevices)' end
    ], null), ', ')
  from users.user_preferences up
  where up.deleted_at is null
    and up.preferences is distinct from users.normalize_preferences_jsonb(up.preferences)
  order by up.updated_at desc;
$$;

revoke all on function users.user_preferences_drift_report() from public;
grant execute on function users.user_preferences_drift_report() to service_role;

comment on function users.user_preferences_drift_report() is
  'Per-user legacy preferences drift for the admin Users > Preferences tab. '
  'Filter reuses normalize_preferences_jsonb; SECURITY DEFINER, service-role only.';

-- ─── 3. one-time backfill (runs now, as part of this migration) ──────────────
-- The healer + weekly cron from user_preferences_legacy_drift_backfill.sql are
-- unchanged; they key off the normalizer and pick up the new rules for free.
select users.heal_user_preferences_drift();
