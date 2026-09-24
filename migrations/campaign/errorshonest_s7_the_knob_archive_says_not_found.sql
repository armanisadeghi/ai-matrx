-- chair-step: this REPLACES the bodies of 1 live functions in platform.knob_archive, changing ONE kind of statement and nothing else: every `raise exception … using errcode = 'P0002'` (1 of them) becomes `perform platform.refuse_not_found(<the same sentence>, <the same hint>, <the same detail>)`. Called directly (the server, every suite, every other function) the refusal is byte-for-byte what it was: SQLSTATE P0002, same message, hint and detail. Called through PostgREST it answers HTTP 404 with error code P0002 instead of HTTP 500. No table, column, policy, trigger or grant is touched; nothing is written. Needs errorshonest_s1_one_way_to_say_not_found.sql first. Inverse: migrations/inverse/errorshonest_s7_the_knob_archive_says_not_found_down.sql restores every body verbatim.
-- lane: ERRORS-HONEST
-- based-on: platform.knob_archive(text, text, text, text) f8b49b740e1928f7593d293dfa7d70687bc0ff919aa501e0d4e5eae29c869e32
--
-- BASED ON PRODUCTION'S BODY, which already carries knobguard2_the_archive_door_asks_the_same_
-- predicate.sql (production ledger 2026-09-22 17:24:41Z). The dev clone and the rehearsal branch
-- hold the OLDER body although their ledgers list knobguard2 as applied — a drift recorded in
-- PROGRESS-ERRORS-HONEST.md. On them this file is refused by its based-on line until they are levelled.
--
-- LANE ERRORS-HONEST — A THING THAT IS NOT THERE, OR NOT YOURS, ANSWERS "NOT FOUND", NEVER A SERVER FAULT.
--
-- THE USE CASE. Alex Hart (test@test.com) opens a link a teammate sent her to something she was
-- never given, or that was archived since. The door is right to refuse, and says so with SQLSTATE
-- P0002 — which PostgREST answers as HTTP 500, a server FAULT, so every client page shows the
-- "something broke" screen instead of the honest not-found / no-access one.
--
-- THE CONVENTION (errorshonest_s1_one_way_to_say_not_found.sql): a not-found is raised ONE way,
-- `perform platform.refuse_not_found(message, hint, detail)`. Inside a PostgREST request it raises
-- PostgREST's own error shape (SQLSTATE PGRST: body {code: P0002, message, details, hint},
-- status 404); everywhere else it raises exactly the P0002 it replaces. `pnpm check:not-found-is-honest`
-- fails on any function in the database that still raises P0002 itself.
--
-- Function by function (census 2026-09-24, production, read-only):
--   platform.knob_archive(text, text, text, text): 1 not-found raise

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
    perform platform.refuse_not_found(format('platform.knob_archive: %s.%s is not a registered knob', p_feature, p_key), 'Check the address. Archiving a row that does not exist would report success for nothing.');
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
