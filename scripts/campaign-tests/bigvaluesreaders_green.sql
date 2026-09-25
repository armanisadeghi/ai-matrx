-- LANE BIG-VALUES-READERS — A VALUE KEPT AS A FILE READS AS ITS WHOLE TEXT, measured RED then GREEN
-- on the dev clone (bigvaluesreaders_an_agent_and_a_grid_get_the_whole_text_of_a_value_kept_as_a_file.sql).
--
-- THE USE CASES (admin@admin.com's own data on the clone, nothing written that survives):
--   * Heat Pump Field Research (admin's Workspace): the research agent's raw search text for one
--     topic is 566 KB, so the move kept it as a file (5bf2070f…) and the cell holds 1000 chars.
--   * Castellano & Reyes, LLP (admin's test firm): the official QME report of one matter is a
--     139,950-character text kept as a file; the matter's QME report PDF is a relation to a File
--     record, where the current context system holds a file reference fence.
--
-- WHAT MAKES IT FAIL (RED before the file, GREEN after):
--   R1  the grid's door (read_records_matching) carries the pointer: `_values.<key>.src` and
--       `_sources.<ptr>` naming the file — and never the old store, row id or provenance
--   R2  the record panel's door (read_record) and read_records / read_records_by_ids carry it too
--   A1  the agent's context door (resolve_context), knob off: the value names the file, says it is
--       the start, and `whole_value` asks the store's client to expand it (expand = true)
--   A2  the organization caps one value at 400 bytes: the value is at most 400 bytes of words plus
--       the announced reference to the file, and expand = false (the agent opens the file)
--   A3  a relation to files is handed as the same file reference fence the old side holds,
--       byte for byte (qme_report)
-- Rolled back; the knob override in A2 is written inside the rolled-back transaction.

\set ON_ERROR_STOP on
\timing off
\set suite 'bigvaluesreaders_green.sql'
\set expect 'clone'
\set requires 'function:custom.resolve_context|function:custom.read_records_matching'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $bvr$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  o_ws      constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  t_heat    constant uuid := '5d1c7e2a-4b6f-4c1d-9a2e-8f0b3c5d7e91';   -- Heat Pump Field Research
  r_heat    constant uuid := 'e58a717b-d991-5aae-a978-e0871eeafcab';
  f_heat    constant text := '5bf2070f-0e08-5857-8d78-010b88612885';
  s_matter  constant uuid := '2645730c-97a9-4080-9471-2546d0ce2b66';   -- Castellano & Reyes matter
  v_doc  jsonb;
  v_ctx  jsonb;
  v_var  jsonb;
  v_old  text;
  v_fails text[] := '{}';
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  -- R1 — the grid's door
  select m.document into v_doc from custom.read_records_matching(o_ws, t_heat, '{}'::jsonb, false, 200, 0) m
   where m.id = r_heat;
  if v_doc is null then
    v_fails := v_fails || 'R1: the Heat Pump row did not come back through read_records_matching'::text;
  elsif coalesce(v_doc -> '_sources' -> (v_doc -> '_values' -> 'knowledge_search_results' ->> 'src') ->> 'file_id', '') <> f_heat then
    v_fails := v_fails || format('R1 RED: read_records_matching carries no pointer for knowledge_search_results (_values %s, _sources %s)',
                                 coalesce(v_doc -> '_values', 'null'), left(coalesce(v_doc -> '_sources', 'null')::text, 200));
  elsif (v_doc -> '_sources') ? 's1' or v_doc::text like '%udt_dataset_rows%' then
    v_fails := v_fails || 'R1: the pointer carried more than the file fields (old store / other provenance)'::text;
  else
    raise notice 'R1 GREEN: read_records_matching carries _values.knowledge_search_results.src -> _sources file %', f_heat;
  end if;

  -- R2 — the record panel's door, the page door and the by-ids door
  v_doc := custom.read_record(o_ws, r_heat, false);
  if coalesce(v_doc -> '_sources' -> (v_doc -> '_values' -> 'knowledge_search_results' ->> 'src') ->> 'file_id', '') <> f_heat then
    v_fails := v_fails || 'R2 RED: read_record carries no pointer'::text;
  else
    raise notice 'R2 GREEN: read_record carries the pointer';
  end if;
  select m.document into v_doc from custom.read_records(o_ws, t_heat, false, 200, 0) m where m.id = r_heat;
  if coalesce(v_doc -> '_sources' -> (v_doc -> '_values' -> 'knowledge_search_results' ->> 'src') ->> 'file_id', '') <> f_heat then
    v_fails := v_fails || 'R2 RED: read_records carries no pointer'::text;
  else
    raise notice 'R2 GREEN: read_records carries the pointer';
  end if;
  select m.document into v_doc from custom.read_records_by_ids(o_ws, t_heat, array[r_heat], false) m;
  if coalesce(v_doc -> '_sources' -> (v_doc -> '_values' -> 'knowledge_search_results' ->> 'src') ->> 'file_id', '') <> f_heat then
    v_fails := v_fails || 'R2 RED: read_records_by_ids carries no pointer'::text;
  else
    raise notice 'R2 GREEN: read_records_by_ids carries the pointer';
  end if;

  -- A1 — the agent's context, no cap (the default)
  v_ctx := custom.resolve_context('task', gen_random_uuid(), array[r_heat], null);
  v_var := v_ctx -> 'variables' -> 'knowledge_search_results';
  if v_var is null then
    v_fails := v_fails || format('A1: resolve_context handed no knowledge_search_results (checks %s)', left((v_ctx -> 'checks')::text, 300));
  elsif coalesce(v_var -> 'whole_value' ->> 'file_id', '') <> f_heat
        or coalesce((v_var -> 'whole_value' ->> 'expand')::boolean, false) is not true
        or position(f_heat in v_var ->> 'value') = 0 then
    v_fails := v_fails || format('A1 RED: resolve_context hands %s chars and names no file (whole_value %s)',
                                 length(v_var ->> 'value'), coalesce(v_var -> 'whole_value', 'null'));
  elsif coalesce((v_var -> 'cells' -> 0 -> 'whole_value' ->> 'expand')::boolean, false) is not true then
    v_fails := v_fails || 'A1: the cell does not carry the whole_value pointer the variable carries'::text;
  else
    raise notice 'A1 GREEN: resolve_context names file % for the whole text, expand = true (value: % chars)',
      f_heat, length(v_var ->> 'value');
  end if;

  -- A3 — a relation to files is the old side's file reference, byte for byte
  select v.value_text into v_old
    from context.context_item_values v join context.context_items ci on ci.id = v.context_item_id
   where v.scope_id = s_matter and v.is_current and ci.key = 'qme_report';
  v_ctx := custom.resolve_context('task', gen_random_uuid(), array[s_matter], null);
  v_var := v_ctx -> 'variables' -> 'qme_report';
  if v_var is null or v_old is null then
    v_fails := v_fails || format('A3: no qme_report on one side (new %s, old %s)', v_var is not null, v_old is not null);
  elsif (v_var ->> 'value') is distinct from v_old then
    v_fails := v_fails || format('A3 RED: qme_report is handed as %s, the old side as a file reference', left(v_var ->> 'value', 120));
  else
    raise notice 'A3 GREEN: qme_report is the same file reference fence as the old side (% chars)', length(v_old);
  end if;
  -- The report itself: kept as a file (production since 2026-09-25 09:12Z) the door names the file
  -- to expand; still whole in its cell (an older clone) the agent gets every character of it.
  v_var := v_ctx -> 'variables' -> 'official_qme_report';
  select v.value_text into v_old
    from context.context_item_values v join context.context_items ci on ci.id = v.context_item_id
   where v.scope_id = s_matter and v.is_current and ci.key = 'official_qme_report';
  if v_var -> 'whole_value' is not null then
    if coalesce((v_var -> 'whole_value' ->> 'expand')::boolean, false) is not true
       or (v_var -> 'whole_value' ->> 'chars')::int <> length(v_old) then
      v_fails := v_fails || format('A1 RED (Castellano): official_qme_report does not name its whole text (whole_value %s)', v_var -> 'whole_value');
    else
      raise notice 'A1 GREEN (Castellano): official_qme_report names file % (% chars, the old side''s %), expand = true',
        v_var -> 'whole_value' ->> 'file_id', v_var -> 'whole_value' ->> 'chars', length(v_old);
    end if;
  elsif (v_var ->> 'value') is distinct from v_old then
    v_fails := v_fails || format('A1 RED (Castellano): official_qme_report is %s chars, the old side %s', length(v_var ->> 'value'), length(v_old));
  else
    raise notice 'A1 GREEN (Castellano): official_qme_report is held whole in its cell here and handed whole (% chars)', length(v_old);
  end if;

  perform set_config('role', 'none', true);
  if array_length(v_fails, 1) > 0 then
    raise exception E'bigvaluesreaders_green: % failed:\n%', array_length(v_fails, 1), array_to_string(v_fails, E'\n');
  end if;
end;
$bvr$;
rollback;

-- A2 — the organization caps one value at 400 bytes (its own transaction: the knob is memoised)
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';
do $bvr2$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  o_ws      constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  r_heat    constant uuid := 'e58a717b-d991-5aae-a978-e0871eeafcab';
  f_heat    constant text := '5bf2070f-0e08-5857-8d78-010b88612885';
  v_var jsonb;
  v_words text;
begin
  if not exists (select 1 from platform.feature_knob where feature = 'custom' and key = 'agent_context_value_cap_bytes') then
    raise exception 'A2 RED: there is no knob custom/agent_context_value_cap_bytes to cap a context value with';
  end if;
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'agent_context_value_cap_bytes', 'organization', o_ws, o_ws, '400'::jsonb,
          'bigvaluesreaders_green A2 (rolled back): Heat Pump Field Research caps one context value at 400 bytes');
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  v_var := custom.resolve_context('task', gen_random_uuid(), array[r_heat], null) -> 'variables' -> 'knowledge_search_results';
  perform set_config('role', 'none', true);
  v_words := split_part(v_var ->> 'value', E'…\n\n[', 1);
  if coalesce((v_var -> 'whole_value' ->> 'expand')::boolean, true) is not false
     or octet_length(v_words) > 400
     or position('limit of 400 bytes' in v_var ->> 'value') = 0
     or position(f_heat in v_var ->> 'value') = 0 then
    raise exception 'A2 RED: capped at 400 bytes the agent is handed % bytes of words (whole_value %)',
      octet_length(v_words), coalesce(v_var -> 'whole_value', 'null');
  end if;
  raise notice 'A2 GREEN: capped at 400 bytes: % bytes of words, the limit and file % announced, expand = false',
    octet_length(v_words), f_heat;
end;
$bvr2$;
rollback;
\echo 'bigvaluesreaders_green: PASS'
