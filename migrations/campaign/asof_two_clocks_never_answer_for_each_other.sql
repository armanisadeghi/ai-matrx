-- STORE-ASOF (2 of 4) — THE TWO CLOCKS ARE TWO QUESTIONS (T6, rule 10).
--
-- T6's last clause: *"A contract valid 2027-2029 is storable today and absent from every
-- as-of query before 2027."* Measured on the main database, 2026-09-19, by reading the
-- bodies and then asking them with a real document:
--
--   history.value_in_document(doc, 'terms', null)        -> "gold"          <- ANSWERS AS TODAY
--   history.value_in_document(doc, 'terms', '2026-09-19')-> (nothing)
--   history.value_in_document(doc, 'terms', '2027-03-01')-> "gold"
--   history.value_in_document(doc, 'name',  '2027-03-01')-> (nothing)       <- THE NAME VANISHES
--
-- So the store already knows both answers and the DOOR conflates them. `custom.query_record_as_of`
-- takes a world date and, when it is not given, falls through to `p_data -> p_key` — the plain
-- key, which for a field whose only period starts in 2027 holds the 2027 value. A contract that
-- does not take effect for sixteen months reads today as the record's present terms. And when a
-- world date IS given, every UNDATED key comes back empty, because `value_in_document` answers
-- null for a field that has no world clock at all — so asking "what did this say on that date"
-- deletes the record's own name from its own answer. Both halves are one mistake: the valid-time
-- question (what was TRUE then) is being answered with the transaction-time document (what is
-- STORED now), and vice versa.
--
-- WHAT THIS FILE LANDS
--
--   · `history.value_in_force(document, key, on_date)` — the honest per-key answer, as jsonb:
--     `dated` (does this field have a world clock at all), `state` (`undated`, `in_force`,
--     `not_yet`, `no_longer`, `none`), `value`, `from`, `to`. It is a pure function over the
--     document, IMMUTABLE like its neighbour, and it ADDS to `history.value_in_document`
--     rather than replacing it: that function has other callers and its contract — "an undated
--     field has no world clock" — is correct for what it is, a single value lookup.
--
--   · `custom.query_record_as_of` rewritten over it. Three changes, each the fix to one lie:
--       1. THE WORLD CLOCK ALWAYS RUNS. With no world date asked for, the date is TODAY, so a
--          dated field answers with the period in force NOW and a 2027 contract answers with
--          nothing — instead of leaking a future value as the present one.
--       2. AN UNDATED KEY IS NEVER BLANKED. It has no world clock, so the world date cannot
--          change it, and the record keeps its own name in every as-of answer.
--       3. `_effective` — one entry per dated key saying `state`, `from` and `to`. This is
--          "visible now with its effective date": today the contract answers `not_yet` with
--          `from: 2027-01-01`, and as of 2027-03-01 it answers `in_force` with the terms.
--     The `_values` envelope is passed through untouched, so nothing a caller could read
--     before disappears.
--
-- THE TRANSACTION CLOCK IS NOT TOUCHED. `p_recorded_at` still selects the document through
-- `history.record_at`, and the world clock is then applied INSIDE whichever document that
-- chose. Two clocks, asked in that order, neither recovering the other.
--
-- ADDITIVE: one new function, one CREATE OR REPLACE of a function this campaign wrote, no
-- signature change, no grant or door row change.
--
-- INVERSE: migrations/inverse/asof_two_clocks_never_answer_for_each_other_down.sql

-- based-on: custom.query_record_as_of(uuid, uuid, timestamp with time zone, date, text) 4db01435a41bb4a8758fee7273d634c7cebfcc882253fd3b517083cd1c5e6313

set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function history.value_in_force(p_data jsonb, p_key text, p_world_on date)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_env     jsonb := p_data -> '_values' -> p_key;
  v_periods jsonb := v_env -> 'dated';
  v_p       jsonb;
  v_from    date;
  v_to      date;
  v_next    date;
  v_last    date;
  v_seen    boolean := false;
begin
  -- AN UNDATED FIELD HAS NO WORLD CLOCK, and that is an answer rather than a blank. Its value
  -- is what the document says, on every date, because the document is the only thing that ever
  -- said anything about it.
  if v_periods is null or jsonb_typeof(v_periods) <> 'array' then
    return jsonb_build_object('dated', false, 'state', 'undated', 'value', p_data -> p_key);
  end if;

  for v_p in select value from jsonb_array_elements(v_periods) loop
    v_seen := true;
    v_from := nullif(v_p ->> 'from', '')::date;
    v_to   := nullif(v_p ->> 'to', '')::date;
    if (v_from is null or p_world_on >= v_from)
       and (v_to is null or p_world_on < v_to) then
      -- THE PERIOD IN FORCE. `from` and `to` come back with it so a screen can say since when
      -- and until when, which is the difference between an answer and a bare value.
      return jsonb_build_object('dated', true, 'state', 'in_force', 'value', v_p -> 'value',
                                'from', v_from, 'to', v_to);
    end if;
    if v_from is not null and v_from > p_world_on and (v_next is null or v_from < v_next) then
      v_next := v_from;
    end if;
    if v_to is not null and v_to <= p_world_on and (v_last is null or v_to > v_last) then
      v_last := v_to;
    end if;
  end loop;

  -- NOTHING WAS TRUE ON THAT DATE, and the store knows WHICH kind of nothing it is. A field
  -- whose next period has not started yet is `not_yet` and carries the date it starts; one
  -- whose last period has ended is `no_longer` and carries the date it ended. Saying only
  -- "null" is what let a future-effective value be mistaken for a present one.
  if not v_seen then
    return jsonb_build_object('dated', true, 'state', 'none', 'value', null);
  end if;
  if v_next is not null then
    return jsonb_build_object('dated', true, 'state', 'not_yet', 'value', null, 'from', v_next);
  end if;
  if v_last is not null then
    return jsonb_build_object('dated', true, 'state', 'no_longer', 'value', null, 'to', v_last);
  end if;
  return jsonb_build_object('dated', true, 'state', 'none', 'value', null);
end;
$fn$;

comment on function history.value_in_force(jsonb, text, date) is
  'T6 / HIS-5: what one key was TRUE on one date, and when — dated / state (undated, in_force, not_yet, no_longer, none) / value / from / to. The valid-time half of the two clocks, told apart from the transaction-time document it lives in.';

create or replace function custom.query_record_as_of(p_organization_id uuid, p_record_id uuid,
                                                    p_recorded_at timestamptz default null,
                                                    p_world_on date default null,
                                                    p_required text default 'viewer')
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc jsonb;
  v_out jsonb := '{}'::jsonb;
  v_eff jsonb := '{}'::jsonb;
  v_key text;
  v_ans jsonb;
  v_on  date;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_record_as_of');
  -- Visibility first and through the same helper: history is not a side door into rows the
  -- principal may not read today.
  if not custom.query_can_see(p_organization_id, p_record_id, p_required) then
    return null;
  end if;

  -- CLOCK ONE, the system clock: what the store SAID at that moment.
  if p_recorded_at is null then
    select r.data into v_doc from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  else
    v_doc := history.record_at(p_organization_id, p_record_id, p_recorded_at);
    v_doc := coalesce(v_doc -> 'data', v_doc);
  end if;
  if v_doc is null then
    return null;
  end if;

  -- CLOCK TWO, the world clock: what was TRUE on that date, inside the document clock one just
  -- chose. IT ALWAYS RUNS. Leaving it off for "no date given" is what let a period starting in
  -- 2027 answer as the record's present value, because the fall-through read the plain key.
  v_on := coalesce(p_world_on, current_date);

  for v_key in select jsonb_object_keys(v_doc) loop
    continue when v_key = '_values';        -- the envelope itself, passed through below
    v_ans := history.value_in_force(v_doc, v_key, v_on);
    v_out := v_out || jsonb_build_object(v_key, v_ans -> 'value');
    if (v_ans ->> 'dated')::boolean then
      v_eff := v_eff || jsonb_build_object(v_key, v_ans - 'dated' - 'value');
    end if;
  end loop;

  if v_doc ? '_values' then
    v_out := v_out || jsonb_build_object('_values', v_doc -> '_values');
  end if;
  if v_eff <> '{}'::jsonb then
    -- VISIBLE NOW, WITH ITS EFFECTIVE DATE. One entry per dated key: whether it is in force on
    -- the date asked about, and the date it starts or stopped being true.
    v_out := v_out || jsonb_build_object('_effective', v_eff);
  end if;
  return v_out;
end;
$fn$;

comment on function custom.query_record_as_of(uuid, uuid, timestamptz, date, text) is
  'T6 / HIS-5 / HIS-6: the record as the store SAID it (p_recorded_at) and as it was TRUE (p_world_on, defaulting to today). Undated keys survive every as-of read; dated keys answer only for the date asked about and carry their effective dates in _effective.';
