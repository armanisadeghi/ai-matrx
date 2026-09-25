-- target: branch,production
-- additive: yes
--   It REPLACES one function body with its existing signature, security, search_path and grants
--   (custom.read_record). Nothing else. (The door row's signature text is corrected by the chair
--   step storereadperf2_the_door_row_says_its_whole_signature.sql.)
-- guard: custom/system_enabled
-- lane: STORE-READ-PERF-2
-- lock: custom
--
-- WHY. storereadperf2_the_rung_is_asked_once_per_class.sql made custom.read_record a one-line
-- call of custom._read_record_with. The answer did not move, but the DECISION stopped being
-- readable off the door (check:store-doors-decide census 1 and 5: a client door taking an
-- organization id must itself ask custom.assert_client_may_reach, and a declared definer door
-- must itself reach the one ladder). A door whose access decision cannot be read off it is one
-- refactor away from a door that does not make one. So the door asks the wall, resolves the merge
-- redirect and asks custom.has_visibility in its own body — the same three questions, in the
-- same order, with the same refusal — and hands the answered rung to custom._read_record_with.
-- The ladder is asked exactly as often as before (has_visibility once, effective_level once).
--
-- Inverse: migrations/inverse/storereadperf2_the_read_door_decides_in_its_own_body_down.sql.
-- based-on: custom.read_record(uuid, uuid, boolean) edc23e15bec399d6dd6c407354db60f40841d9ff2af52e19741195c597d4eaea

set local lock_timeout = '30s';

create or replace function custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me  uuid := auth.uid();
  v_now uuid;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- ARGS-RULED (2026-09-21). THE WALL IS DECIDED FIRST (REC-29).
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  -- AND THE LADDER BEFORE EXISTENCE: a record you may not open and a record that is not there
  -- answer the same thing (custom.has_visibility is false for an id that is not there).
  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an agent, not an export. Ask somebody who holds it to share it with you.';
  end if;

  -- DOOR-1. The rest of the door — existence, the one mask at the rung this person holds on the
  -- record, the choice words, the whole-value pointers, the alternates and the retired values —
  -- is custom._read_record_with, handed the two answers this body has just worked out.
  return (select w.o_doc
            from custom._read_record_with(p_organization_id, p_record_id, p_by_id,
                   jsonb_build_object(v_now::text, jsonb_build_object(
                     's', true, 'l', custom.effective_level(v_me, null, v_now))),
                   '{}'::jsonb) w);
end;
$function$;

