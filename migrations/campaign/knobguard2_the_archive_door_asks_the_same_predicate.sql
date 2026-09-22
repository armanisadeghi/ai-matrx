-- additive: yes
-- based-on: platform.knob_archive(text, text, text, text) 8159fb54197f68467bcc09626dba503c4905aadccdba37641ed8a9c7dc4785cc
-- supersedes-function: platform.knob_archive
--
-- KNOB-GUARD-2 — THE ARCHIVE DOOR ASKS THE SAME PREDICATE AS THE DELETE TRIGGER.
--
-- `knobguard_a_key_is_a_pair_not_a_word.sql` (2026-09-22, landed on production
-- 17:19:39Z) fixed `platform.knob_delete_refuses_a_live_reader()` and added the
-- ONE shared predicate `platform.knob_live_readers(feature, key)` — a body counts
-- as a live reader only when it names BOTH the feature and the key together, not
-- merely the bare key as a word (18 unrelated bodies contained `'enabled'`).
--
-- `platform.knob_archive` (landed separately, `settings3_a_retired_knob_is_archived_
-- not_deleted.sql`, applied to production 2026-09-22 10:08:11Z — BEFORE the delete
-- trigger's fix existed) still carries its OWN copy of the old, dishonest query
-- inline. A misdirected edit to that already-ledgered file was reverted in this same
-- lane rather than landed as a drift; this file is the correct route: a NEW
-- migration that replaces ONLY the body of `platform.knob_archive`, based-on the
-- exact bytes currently live on production, to call the shared function instead.
--
-- Nothing else about the door changes: same signature, same admin check, same
-- reason/lane requirements, same idempotent already-archived branch, same update.
-- Only the readers census is now `platform.knob_live_readers(p_feature, p_key)`.
--
-- The inverse is
-- migrations/inverse/knobguard2_the_archive_door_asks_the_same_predicate_down.sql.

set lock_timeout = '4s';

create or replace function platform.knob_archive(
  p_feature text,
  p_key     text,
  p_reason  text,
  p_lane    text
) returns jsonb
language plpgsql
security definer
set search_path to 'platform', 'public'
as $function$
declare
  v_readers text;
  v_row     platform.feature_knob%rowtype;
begin
  if not public.is_admin() then
    raise exception 'platform.knob_archive: retiring a registration is a platform-admin act'
      using errcode = '42501';
  end if;

  select * into v_row from platform.feature_knob where feature = p_feature and key = p_key;
  if v_row.feature is null then
    raise exception 'platform.knob_archive: %.% is not a registered knob', p_feature, p_key
      using errcode = 'P0002',
            hint = 'Check the address. Archiving a row that does not exist would report success for nothing.';
  end if;

  if v_row.archived_at is not null then
    return jsonb_build_object(
      'outcome', 'already_archived',
      'feature', p_feature, 'key', p_key,
      'archived_at', v_row.archived_at,
      'archived_reason', v_row.archived_reason,
      'archived_by', v_row.archived_by);
  end if;

  if p_reason is null or length(btrim(p_reason)) < 20 then
    raise exception 'platform.knob_archive: %.% needs a REASON, in a sentence', p_feature, p_key
      using errcode = '22023',
            hint = 'Say what decides this now instead, or why nothing does. A retired registration nobody can explain is the same lie in a different place.';
  end if;
  if p_lane is null or length(btrim(p_lane)) = 0 then
    raise exception 'platform.knob_archive: %.% needs the lane or person retiring it', p_feature, p_key
      using errcode = '22023',
            hint = 'So a retired registration always has somebody to ask.';
  end if;

  -- The SAME predicate platform.knob_delete_refuses_a_live_reader runs, through the
  -- ONE shared function platform.knob_live_readers(feature, key)
  -- (migrations/campaign/knobguard_a_key_is_a_pair_not_a_word.sql, 2026-09-22): a
  -- body counts as a reader only when it names BOTH the feature and the key
  -- together, not merely the bare key as a word. A knob a database function still
  -- reads is not orphaned: archiving it would take the control off every screen
  -- while the function went on obeying the stored value, which is the lie this
  -- whole system exists to prevent, pointing the other way.
  v_readers := platform.knob_live_readers(p_feature, p_key);

  if v_readers is not null then
    raise exception 'platform.knob_archive: %.% is still read by %', p_feature, p_key, v_readers
      using errcode = '23503',
            hint = 'An archived knob is not offered on any screen. Retiring one those functions read would leave them obeying a value nobody can see or change. Repoint or remove the readers first.';
  end if;

  update platform.feature_knob
     set archived_at     = now(),
         archived_reason = btrim(p_reason),
         archived_by     = btrim(p_lane),
         updated_at      = now()
   where feature = p_feature and key = p_key;

  return jsonb_build_object(
    'outcome', 'archived',
    'feature', p_feature, 'key', p_key,
    'archived_at', now(),
    'archived_reason', btrim(p_reason),
    'archived_by', btrim(p_lane));
end;
$function$;

comment on function platform.knob_archive(text, text, text, text) is
  'THE ARCHIVE DOOR for a knob registration. Soft, reversible (platform.knob_unarchive), and compulsory about its reason and its lane. Refuses a key any database function still reads, through the SAME platform.knob_live_readers(feature, key) predicate the hard-delete trigger runs — a body counts only when it names both the feature and the key together, not merely the key as a word.';
