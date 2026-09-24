-- chair-step: this restores the 1 live bodies in platform.knob_archive that errorshonest_s7_the_knob_archive_says_not_found.sql replaced, byte-for-byte as read from production on 2026-09-24. Undoing it returns each of their not-found refusals to HTTP 500 through PostgREST; called directly nothing changes either way.
-- lane: ERRORS-HONEST
-- based-on: platform.knob_archive(text, text, text, text) eabd59efcca631f337f5a41ed51c583703aff30f58ebf9fa8a86f232b77bd038

CREATE OR REPLACE FUNCTION platform.knob_archive(p_feature text, p_key text, p_reason text, p_lane text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'public'
AS $function$
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
