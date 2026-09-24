-- target: branch,production
-- additive: yes
--   It ADDS two functions, `custom.pipeline_move_many(uuid, jsonb)` and
--   `custom.work_decide_many(uuid, jsonb)`, their two `platform.client_callable_door` rows and
--   one `platform.feature_knob` row (`custom/batch_items_max`). Nothing existing is replaced, dropped
--   or revoked; no table, column, trigger, policy or grant is touched; no row of anybody's data
--   is rewritten by this file. The inverse is
--   `migrations/inverse/uichamp_s4_a_selection_moves_and_decides_in_one_call_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
--
-- LANE S4 (UI-CHAMPIONS-PLAN rev 2, row 2) — BATCH DOORS WITH A VERSION PER CARD.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- "MOVE THESE SIX TO SCHEDULED" IS ONE CALL, AND EVERY CARD GETS ITS OWN ANSWER
-- ════════════════════════════════════════════════════════════════════════════════════════
-- A dispatcher at Harbor Point Plumbing & Drain selects six service calls on Monday morning and
-- moves them to Scheduled. One has no service address yet, and the stage will not take a call it
-- cannot send a van to. Five land; the sixth stays where it was and says which column it needs.
-- An office manager opens her inbox to eight technician expenses and decides them at once.
--
-- CENSUS (what already existed, read from the clone's catalog on 2026-09-23):
--   · `custom.pipeline_move(org, record, to, also, expected_version)` — ONE card; judged by the
--     stage Rules inside `custom.record_update`; a `require_approval` gate files a wait and
--     answers `needs_approval`; a stale version raises PT409 and writes nothing.
--   · `custom.work_approval_decide(org, approval, approve, note)` — ONE decision; applies the
--     change as the person deciding, in the same transaction.
--   · `custom.action_run(org, action, record_ids[])` (G2) — MANY records, but ALL-OR-NOTHING
--     ("the selection is one change"), one declared action, and no version per record. It is
--     the right answer for "Check in these twelve" and the wrong one for a board: one card that
--     a stage refuses must not hold the other five back.
--   · `custom.record_write_many(org, table, rows[], ids[])` — bulk EDIT; no stage verdicts.
--   There was no batch move and no batch decide (UI-CHAMPIONS-PLAN-ATTACK §1, "S4: True").
--
-- WHAT THESE TWO DOORS ARE:
--   · ONE transaction per call. Each item is its own write inside its own savepoint: an item the
--     store refuses rolls back to that savepoint and writes NOTHING, and every other item still
--     lands. The call answers one verdict per item, in the order they were sent.
--   · Each item is judged by the SINGLE door, called as it is — no second rule engine, no second
--     wording. `pipeline_move_many` calls `custom.pipeline_move`; `work_decide_many` calls
--     `custom.work_approval_decide`. A verdict's `sentence` is that door's own sentence.
--   · A VERSION PER CARD, AND IT IS REQUIRED. The single move door lets a caller omit the
--     version (last write wins, its opt-in posture). A batch over a board a person loaded minutes
--     ago is exactly where that silently overwrites somebody's change, so here a move without
--     `expected_version` is refused BY ITEM ("changed_since_loaded" is only possible when the
--     version is sent). The attack's hole: "a bulk move over a stale board would overwrite
--     silently". This removes that door rather than warning beside it.
--   · The cap is a knob, `custom/batch_items_max` (500): past it the whole call is refused 54000 and
--     nothing is judged.
--
-- VERDICTS
--   pipeline_move_many → moved · needs_approval · needs_fields · changed_since_loaded ·
--                        no_right · refused
--   work_decide_many   → approved · declined · already_decided · no_right · refused
--   Every verdict carries `sentence` (the store's words). `needs_fields` carries `needs[]`
--   ({field_id, key, label}) read from `custom.pipeline_transition_refusal` for the card as it
--   stands after the refused write rolled back; `changed_since_loaded` carries
--   `current_version`; `moved` carries `version`; `needs_approval` carries `approval_id`.
--
-- LOCKS. create function / insert / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'batch_items_max', '500'::jsonb, '500'::jsonb, 'integer',
   'Most cards or decisions one batch takes',
   'The ceiling on one custom.pipeline_move_many or custom.work_decide_many call. Each item is judged by the single door in its own savepoint inside one transaction, so a batch this size is a few seconds; past it, select fewer and go again.',
   'agent', 'Lane S4 2026-09-23: UI-CHAMPIONS-PLAN rev 2 names 500 — ten full board columns or a month of one team''s approvals.',
   date '2026-12-23', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.pipeline_move_many(org, moves[{record_id, stage, expected_version, also?}])
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.pipeline_move_many(p_organization_id uuid, p_moves jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_max       integer;
  v_n         integer;
  v_move      jsonb;
  v_i         integer := 0;
  v_rid       uuid;
  v_to        text;
  v_also      jsonb;
  v_expected  integer;
  v_seen      uuid[] := '{}';
  v_out       jsonb;
  v_ref       jsonb;
  v_needs     jsonb;
  v_one       jsonb;
  v_results   jsonb := '[]'::jsonb;
  v_msg       text;
  v_state     text;
  v_detail    text;
  v_moved     integer := 0;
  v_waiting   integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.pipeline_move_many');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_move_many');

  if p_moves is null or jsonb_typeof(p_moves) <> 'array' then
    raise exception 'A batch of moves is a list of cards, each with the stage it goes to, and this was %.',
      coalesce(jsonb_typeof(p_moves), 'nothing')
      using errcode = '22023',
            hint = 'Send [{"record_id": …, "stage": …, "expected_version": …}, …]. Nothing was moved.';
  end if;
  v_n := jsonb_array_length(p_moves);
  if v_n = 0 then
    raise exception 'No cards were selected, so nothing was moved.'
      using errcode = '22023', hint = 'Select the cards to move, then choose where they go.';
  end if;
  v_max := coalesce((platform.knob_resolve('custom', 'batch_items_max', p_organization_id) #>> '{}')::integer, 500);
  if v_n > v_max then
    raise exception 'At most % cards move in one go, and % were selected.', v_max, v_n
      using errcode = '54000',
            hint = 'Move them in parts. The ceiling is the organization knob custom/batch_items_max. Nothing was moved.';
  end if;

  for v_move in select value from jsonb_array_elements(p_moves) loop
    v_i := v_i + 1;
    v_rid := null; v_to := null; v_expected := null;
    if jsonb_typeof(v_move) = 'object' then
      begin
        v_rid := nullif(v_move ->> 'record_id', '')::uuid;
      exception when invalid_text_representation then
        v_rid := null;
      end;
      v_to := nullif(btrim(coalesce(v_move ->> 'stage', '')), '');
      if jsonb_typeof(v_move -> 'expected_version') = 'number' then
        v_expected := (v_move ->> 'expected_version')::numeric::integer;
      end if;
    end if;
    v_also := case when jsonb_typeof(v_move -> 'also') = 'object' then v_move -> 'also' else '{}'::jsonb end;

    -- THE SHAPE OF ONE ITEM, judged by item and never by the whole call.
    if v_rid is null or v_to is null then
      v_results := v_results || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'index', v_i, 'record_id', v_move ->> 'record_id', 'stage', v_to, 'verdict', 'refused',
        'sentence', 'This move names no card or no stage, so it was not tried.')));
      continue;
    end if;
    if v_rid = any(v_seen) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_i, 'record_id', v_rid, 'stage', v_to, 'verdict', 'refused',
        'sentence', 'This card is already in this batch once, so the second move was not tried.'));
      continue;
    end if;
    v_seen := v_seen || v_rid;
    if v_expected is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_i, 'record_id', v_rid, 'stage', v_to, 'verdict', 'refused',
        'sentence', 'This card was sent without the version the board loaded, so moving it could overwrite a newer change. Reload the board and move it again.'));
      continue;
    end if;

    -- THE SINGLE DOOR, AS IT IS. Its own savepoint: a refusal rolls back this card only.
    begin
      v_out := custom.pipeline_move(p_organization_id, v_rid, v_to, v_also, v_expected);
      if v_out ->> 'outcome' = 'needs_approval' then
        v_waiting := v_waiting + 1;
        v_one := jsonb_build_object(
          'index', v_i, 'record_id', v_rid, 'stage', v_to, 'verdict', 'needs_approval',
          'sentence', coalesce(v_out ->> 'what_happens', v_out ->> 'why'),
          'rule', v_out ->> 'rule', 'approval_id', v_out ->> 'approval_id',
          'approvers', v_out -> 'approvers', 'version', v_out -> 'version');
      else
        v_moved := v_moved + 1;
        v_one := jsonb_build_object(
          'index', v_i, 'record_id', v_rid, 'stage', v_to, 'verdict', 'moved',
          'sentence', format('Moved to %s.', v_to),
          'version', v_out -> 'version',
          'warnings', case when jsonb_array_length(coalesce(v_out -> 'warnings', '[]'::jsonb)) > 0
                           then v_out -> 'warnings' end);
      end if;
    exception
      when sqlstate 'PT409' then
        get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
        v_one := jsonb_build_object(
          'index', v_i, 'record_id', v_rid, 'stage', v_to, 'verdict', 'changed_since_loaded',
          'sentence', v_msg, 'code', 'PT409',
          'expected_version', v_expected,
          'current_version', (nullif(v_detail, '')::jsonb) -> 'current_version');
      when insufficient_privilege then
        get stacked diagnostics v_msg = message_text;
        v_one := jsonb_build_object(
          'index', v_i, 'record_id', v_rid, 'stage', v_to, 'verdict', 'no_right',
          'sentence', v_msg, 'code', '42501');
      when others then
        get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
        -- WHICH COLUMNS THE STAGE ASKS FOR, read on the card as it stands now (the refused
        -- write rolled back). Columns the move itself sent in `also` are not asked again.
        v_needs := '[]'::jsonb;
        v_ref := null;
        begin
          v_ref := custom.pipeline_transition_refusal(p_organization_id, v_rid, v_to);
        exception when others then
          v_ref := null;
        end;
        if v_ref is not null and v_ref ->> 'outcome' = 'refused' then
          select coalesce(jsonb_agg(m), '[]'::jsonb) into v_needs
            from jsonb_array_elements(coalesce(v_ref -> 'missing', '[]'::jsonb)) m
           where not (v_also ? (m ->> 'key'));
        end if;
        v_one := jsonb_build_object(
          'index', v_i, 'record_id', v_rid, 'stage', v_to,
          'verdict', case when jsonb_array_length(v_needs) > 0 then 'needs_fields' else 'refused' end,
          'sentence', v_msg, 'code', v_state,
          'rule', case when v_ref ->> 'outcome' = 'refused' then v_ref ->> 'rule' end,
          'needs', v_needs);
    end;
    v_results := v_results || jsonb_build_array(jsonb_strip_nulls(v_one));
  end loop;

  return jsonb_build_object(
    'asked',          v_n,
    'moved',          v_moved,
    'needs_approval', v_waiting,
    'not_moved',      v_n - v_moved - v_waiting,
    'results',        v_results);
end
$fn$;

comment on function custom.pipeline_move_many(uuid, jsonb) is
  'Lane S4. Moves many cards in ONE call: p_moves = [{record_id, stage, expected_version, also?}]. Each card is judged by custom.pipeline_move exactly as it judges one, in its own savepoint; a refused card writes nothing and the others still land. expected_version is REQUIRED per card (a stale card answers changed_since_loaded, never overwrites). Answers {asked, moved, needs_approval, not_moved, results[{index, record_id, stage, verdict: moved|needs_approval|needs_fields|changed_since_loaded|no_right|refused, sentence, needs[], version, current_version, approval_id}]}. Cap: knob custom/batch_items_max.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.work_decide_many(org, decisions[{item, decision: approve|decline, note?}])
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.work_decide_many(p_organization_id uuid, p_decisions jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_max       integer;
  v_n         integer;
  v_dec       jsonb;
  v_i         integer := 0;
  v_item      uuid;
  v_word      text;
  v_note      text;
  v_seen      uuid[] := '{}';
  v_out       jsonb;
  v_one       jsonb;
  v_results   jsonb := '[]'::jsonb;
  v_msg       text;
  v_state     text;
  v_approved  integer := 0;
  v_declined  integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_decide_many');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_decide_many');

  if p_decisions is null or jsonb_typeof(p_decisions) <> 'array' then
    raise exception 'A batch of decisions is a list of inbox items, each approved or declined, and this was %.',
      coalesce(jsonb_typeof(p_decisions), 'nothing')
      using errcode = '22023',
            hint = 'Send [{"item": …, "decision": "approve" | "decline", "note": …}, …]. Nothing was decided.';
  end if;
  v_n := jsonb_array_length(p_decisions);
  if v_n = 0 then
    raise exception 'No items were selected, so nothing was decided.'
      using errcode = '22023', hint = 'Select the items, then approve or decline them.';
  end if;
  v_max := coalesce((platform.knob_resolve('custom', 'batch_items_max', p_organization_id) #>> '{}')::integer, 500);
  if v_n > v_max then
    raise exception 'At most % items are decided in one go, and % were selected.', v_max, v_n
      using errcode = '54000',
            hint = 'Decide them in parts. The ceiling is the organization knob custom/batch_items_max. Nothing was decided.';
  end if;

  for v_dec in select value from jsonb_array_elements(p_decisions) loop
    v_i := v_i + 1;
    v_item := null; v_word := null; v_note := null;
    if jsonb_typeof(v_dec) = 'object' then
      begin
        v_item := nullif(v_dec ->> 'item', '')::uuid;
      exception when invalid_text_representation then
        v_item := null;
      end;
      v_word := lower(btrim(coalesce(v_dec ->> 'decision', '')));
      v_note := nullif(btrim(coalesce(v_dec ->> 'note', '')), '');
    end if;

    if v_item is null or v_word not in ('approve', 'decline') then
      v_results := v_results || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'index', v_i, 'item', v_dec ->> 'item', 'decision', nullif(v_word, ''), 'verdict', 'refused',
        'sentence', 'This decision names no item, or says neither approve nor decline, so it was not tried.')));
      continue;
    end if;
    if v_item = any(v_seen) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_i, 'item', v_item, 'decision', v_word, 'verdict', 'refused',
        'sentence', 'This item is already in this batch once, so the second decision was not tried.'));
      continue;
    end if;
    v_seen := v_seen || v_item;

    -- THE SINGLE DOOR, AS IT IS. Its own savepoint: a refused decision leaves that item
    -- waiting, exactly as it was, and every other decision still stands.
    begin
      v_out := custom.work_approval_decide(p_organization_id, v_item, v_word = 'approve', v_note);
      if v_word = 'approve' then v_approved := v_approved + 1; else v_declined := v_declined + 1; end if;
      v_one := jsonb_build_object(
        'index', v_i, 'item', v_item, 'decision', v_word,
        'verdict', v_out ->> 'state',
        'sentence', v_out ->> 'message',
        'subject_id', v_out -> 'subject_id',
        'version', v_out -> 'version',
        'record_ids', v_out -> 'record_ids');
    exception
      when insufficient_privilege then
        get stacked diagnostics v_msg = message_text;
        v_one := jsonb_build_object('index', v_i, 'item', v_item, 'decision', v_word,
          'verdict', 'no_right', 'sentence', v_msg, 'code', '42501');
      when unique_violation then
        get stacked diagnostics v_msg = message_text;
        v_one := jsonb_build_object('index', v_i, 'item', v_item, 'decision', v_word,
          'verdict', 'already_decided', 'sentence', v_msg, 'code', '23505');
      when others then
        get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
        v_one := jsonb_build_object('index', v_i, 'item', v_item, 'decision', v_word,
          'verdict', 'refused', 'sentence', v_msg, 'code', v_state);
    end;
    v_results := v_results || jsonb_build_array(jsonb_strip_nulls(v_one));
  end loop;

  return jsonb_build_object(
    'asked',       v_n,
    'approved',    v_approved,
    'declined',    v_declined,
    'not_decided', v_n - v_approved - v_declined,
    'results',     v_results);
end
$fn$;

comment on function custom.work_decide_many(uuid, jsonb) is
  'Lane S4. Decides many inbox items in ONE call: p_decisions = [{item, decision: approve|decline, note?}]. Each is judged by custom.work_approval_decide exactly as it judges one, in its own savepoint; a refused decision leaves that item waiting and the others still stand. Answers {asked, approved, declined, not_decided, results[{index, item, decision, verdict: approved|declined|already_decided|no_right|refused, sentence, subject_id, version}]}. Cap: knob custom/batch_items_max.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The two client doors. Their EXECUTE is issued by the chair-step grant file
-- (uichamp_s4_a_signed_in_person_may_move_and_decide_many.sql), because the ddl guard takes a
-- new definer's client grant back at birth.
-- ─────────────────────────────────────────────────────────────────────────────────────────

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'pipeline_move_many', 'p_organization_id uuid, p_moves jsonb', array['uuid'::regtype, 'jsonb'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach before anything is read. Every card is moved only through custom.pipeline_move, which reads it under organization_id = arg1 and writes it only through custom.record_update (custom.assert_client_may_change on that record, the stage Rules, the version compare-and-swap). A card the caller may not change is answered no_right; one outside the organization answers exactly as an invented id.',
   'uichamp_s4_a_selection_moves_and_decides_in_one_call.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'uichamp_s4_a_selection_moves_and_decides_in_one_call.sql',
     'declared_at', '2026-09-23 lane S4',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-23 lane S4 — written with this body'),
       'p_moves', jsonb_build_object('type', 'jsonb', 'position', 2, 'entity', 'custom_record',
         'check', 'each item''s record_id is handed only to custom.pipeline_move(arg1, record_id, stage, also, expected_version), which reads it with organization_id = arg1 and writes it only through custom.record_update — custom.assert_client_may_change on that record at the editor rung, then the stage Rules. Nothing here reads or writes a row itself.',
         'foreign', jsonb_build_object('note', 'another organization''s record and an invented id both answer refused with "there is no such record here", byte-identically.', 'not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-23 lane S4 — written with this body')))),
  ('custom', 'work_decide_many', 'p_organization_id uuid, p_decisions jsonb', array['uuid'::regtype, 'jsonb'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach before anything is read. Every decision goes only through custom.work_approval_decide, which reads the approval under organization_id = arg1 and asks custom.work_approval_may_decide before it applies anything. An item the caller may not decide is answered no_right; one outside the organization answers exactly as an invented id.',
   'uichamp_s4_a_selection_moves_and_decides_in_one_call.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'uichamp_s4_a_selection_moves_and_decides_in_one_call.sql',
     'declared_at', '2026-09-23 lane S4',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-23 lane S4 — written with this body'),
       'p_decisions', jsonb_build_object('type', 'jsonb', 'position', 2, 'entity', 'custom_record',
         'check', 'each item id is handed only to custom.work_approval_decide(arg1, item, approve, note), which reads the work_approval record with organization_id = arg1 and asks custom.work_approval_may_decide before it applies or records anything.',
         'foreign', jsonb_build_object('note', 'another organization''s approval and an invented id both answer refused with "There is no such approval in this organization.", byte-identically.', 'not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-23 lane S4 — written with this body'))))
on conflict do nothing;
