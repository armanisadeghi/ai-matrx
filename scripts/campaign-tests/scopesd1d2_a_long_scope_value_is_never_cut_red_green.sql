-- LANE 9 SCOPES-ON-THE-STORE, sublane D1 — A LONG SCOPE VALUE IS NEVER ANSWERED CUT, measured RED then
-- GREEN on the dev clone (scopesd1d2_the_values_read_never_cuts_a_long_value_and_reads_only_what_holds_one.sql).
--
-- THE USE CASE (admin@admin.com's test firm on the clone, nothing written survives): Castellano & Reyes,
-- LLP keeps a workers' compensation matter (Doe, John v. CSV Pharmacy) as a scope.
--   Q  its official QME report, 139,950 characters, is over the store's 100,000-byte ceiling for one
--      value, so the store keeps it as a file and the cell holds its first 1000 characters (real data).
--   P  planted in this transaction: the subpoenaed Kaiser records chronology (560 visits, ~139 KB),
--      kept the same way — the cell holds 1000 characters and names its file.
--   W  planted: the treating facility's discharge narrative (~120 KB), WRITTEN but still waiting for
--      its file (the follower attaches it within seconds): the cell holds 1000 characters and the
--      whole text sits in custom.whole_value_parked.
--   N  the QME discrepancy analysis, 3,694 characters, held whole in its cell (the control).
-- Every expected length and hash comes from outside the door under test: Q from the old scope table
-- (context.context_item_values), P and W from the text this file generates.
--
-- WHAT MAKES IT FAIL:
--   C1  custom.context_values (every scope screen's values read) answers Q and P as 1000 characters
--       with no `whole_value` naming the file, or answers W as its first words, or N as anything but
--       its whole text with no `whole_value`.
--   C2  custom.context_resolve (the merge-field resolver's one call for a turn's bound cells) hands Q
--       or P as the first words without the file named (`whole_value` + the file id in the text),
--       W as anything but its whole text, or changes N.
--   C3  custom.resolve_context (the agent's hand-off; the control that was already right) stops
--       naming Q's file with expand = true.
-- RED on the bodies of 2026-10-02 (C1 Q, C1 P, C1 W, C2 Q, C2 P, C2 W); GREEN after. Rolled back.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesd1d2_a_long_scope_value_is_never_cut_red_green.sql'
\set expect 'clone'
\set requires 'function:custom.context_values|function:custom.context_resolve|function:custom.resolve_context'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $d1$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  o_cr      constant uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';   -- Castellano & Reyes, LLP
  s_matter  constant uuid := '2645730c-97a9-4080-9471-2546d0ce2b66';   -- Doe, John v. CSV Pharmacy
  i_qme     constant uuid := '054c12b6-fac9-45b3-a022-5cedc24ed2b2';   -- official_qme_report
  f_plant   constant text := '6f1d2c3b-4a5e-5f60-8172-93a4b5c6d7e8';   -- the planted chronology's file
  v_qme_old text;  v_qme_file text;  v_file text;
  v_p text;  v_w text;  v_n_len int;
  v_rows jsonb;  v_row jsonb;  v_ctx jsonb;  v_b jsonb;
  v_tbl uuid;  v_vis platform.visibility;  v_owner uuid;
  v_fails text[] := '{}';
  k text;
begin
  -- THE ORACLES, from outside the doors under test.
  select v.value_text into v_qme_old from context.context_item_values v
   where v.scope_id = s_matter and v.context_item_id = i_qme and v.is_current;
  if coalesce(length(v_qme_old), 0) <= 1000 then
    raise exception 'scopesd1d2: precondition — the old table no longer holds the whole QME report (% chars); the suite has no oracle', length(v_qme_old);
  end if;
  select r.data -> '_sources' -> (r.data -> '_values' -> 'official_qme_report' ->> 'src') ->> 'file_id', r.table_id, r.visibility, r.created_by
    into v_qme_file, v_tbl, v_vis, v_owner
    from custom.record r where r.organization_id = o_cr and r.id = s_matter;
  if v_qme_file is null then
    raise exception 'scopesd1d2: precondition — the QME report is not kept as a file in the store on this copy';
  end if;
  select string_agg(format('%s — Visit %s, Kaiser Permanente Fontana, Dr. Elena Ruiz (PM&R): lumbar spine L4-L5 tenderness, straight-leg raise positive at %s degrees on the right, Norco 5/325 continued, modified duty with no lifting over %s lb, follow up in %s weeks.',
           (date '2023-01-02' + g)::text, g, 30 + g % 40, 10 + g % 15, 2 + g % 4), E'\n' order by g)
    into v_p from generate_series(1, 560) g;
  select string_agg(format('Day %s — San Bernardino Physical Rehabilitation Center, discharge narrative: patient ambulated %s feet with a single-point cane, lumbar flexion %s degrees, pain 6/10 at rest and 8/10 after the home program; plan: continue aquatic therapy twice weekly and reassess work tolerance for warehouse picking.',
           g, 120 + g * 5, 35 + g % 30), E'\n' order by g)
    into v_w from generate_series(1, 470) g;
  select length(r.data ->> 'qme_discrepancy_analysis') into v_n_len from custom.record r where r.organization_id = o_cr and r.id = s_matter;

  -- THE PLANTS (P: a value kept as a file; W: a value written and still waiting for its file),
  -- in the exact shape the store's mover leaves them (matrx_records.big_values / custom.whole_value_source).
  update custom.record r set data = r.data || jsonb_build_object(
      'body_parts_in_records', left(v_p, 1000), 'treating_facility', left(v_w, 1000), '_actor', 'system',
      '_sources', coalesce(r.data -> '_sources', '{}'::jsonb) || jsonb_build_object(
        's900', jsonb_build_object('kind', 'whole_value_in_file', 'mime', 'text/plain; charset=utf-8',
                  'bytes', octet_length(v_p), 'chars', length(v_p), 'sha256', encode(sha256(convert_to(v_p, 'UTF8')), 'hex'),
                  'file_id', f_plant, 'file_record', '7a2e3d4c-5b6f-4071-8293-a4b5c6d7e8f9', 'shown_chars', 1000),
        's901', jsonb_build_object('kind', 'whole_value_in_file', 'pending', true, 'mime', 'text/plain; charset=utf-8',
                  'bytes', octet_length(v_w), 'chars', length(v_w), 'sha256', encode(sha256(convert_to(v_w, 'UTF8')), 'hex'),
                  'shown_chars', 1000)))
   where r.organization_id = o_cr and r.id = s_matter;
  update custom.record r set data = jsonb_set(jsonb_set(r.data, '{_values,body_parts_in_records,src}', '"s900"'),
                                              '{_values,treating_facility,src}', '"s901"') || '{"_actor": "system"}'
   where r.organization_id = o_cr and r.id = s_matter;
  insert into custom.whole_value_parked (organization_id, table_id, record_id, field_key, pointer, value_version, whole_text,
                                         sha256, bytes, chars, owner_id, record_visibility)
  values (o_cr, v_tbl, s_matter, 'treating_facility', 's901', 1, v_w, encode(sha256(convert_to(v_w, 'UTF8')), 'hex'),
          octet_length(v_w), length(v_w), v_owner, v_vis);

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  -- C1 — the scope screens' values read
  v_rows := custom.context_values(array[s_matter]);
  foreach k in array array['official_qme_report', 'body_parts_in_records', 'treating_facility', 'qme_discrepancy_analysis'] loop
    select x into v_row from jsonb_array_elements(v_rows) x where x ->> 'key' = k;
    if v_row is null then
      v_fails := v_fails || format('C1: %s did not come back through custom.context_values', k);
    elsif k = 'official_qme_report' then
      if v_row -> 'whole_value' ->> 'file_id' is distinct from v_qme_file or (v_row -> 'whole_value' ->> 'chars')::int is distinct from length(v_qme_old) then
        v_fails := v_fails || format('C1 RED (Q): official_qme_report answered %s chars and whole_value %s — the old side holds %s chars in file %s',
                                     length(v_row ->> 'value'), coalesce(v_row -> 'whole_value', 'null'), length(v_qme_old), v_qme_file);
      else raise notice 'C1 GREEN (Q): official_qme_report names file % (% chars)', v_qme_file, length(v_qme_old); end if;
    elsif k = 'body_parts_in_records' then
      if v_row -> 'whole_value' ->> 'file_id' is distinct from f_plant or (v_row -> 'whole_value' ->> 'chars')::int is distinct from length(v_p)
         or v_row -> 'whole_value' ->> 'sha256' is distinct from encode(sha256(convert_to(v_p, 'UTF8')), 'hex') then
        v_fails := v_fails || format('C1 RED (P): the chronology answered %s chars and whole_value %s — it is %s chars in file %s',
                                     length(v_row ->> 'value'), coalesce(v_row -> 'whole_value', 'null'), length(v_p), f_plant);
      else raise notice 'C1 GREEN (P): the chronology names file % (% chars, its sha256)', f_plant, length(v_p); end if;
    elsif k = 'treating_facility' then
      if (v_row ->> 'value') is distinct from v_w then
        v_fails := v_fails || format('C1 RED (W): the waiting discharge narrative answered %s chars — it is %s', length(v_row ->> 'value'), length(v_w));
      else raise notice 'C1 GREEN (W): the waiting narrative is answered whole (% chars), whole_value %', length(v_w), v_row -> 'whole_value'; end if;
    else
      if length(v_row ->> 'value') is distinct from v_n_len or v_row ? 'whole_value' then
        v_fails := v_fails || format('C1 RED (N): the discrepancy analysis answered %s chars (whole_value %s) — it is %s held whole',
                                     length(v_row ->> 'value'), coalesce(v_row -> 'whole_value', 'null'), v_n_len);
      else raise notice 'C1 GREEN (N): the discrepancy analysis is answered whole (% chars), no whole_value', v_n_len; end if;
    end if;
  end loop;

  -- C2 — the merge-field resolver's one call
  v_ctx := custom.context_resolve(jsonb_build_array(
    jsonb_build_object('key', 'qme', 'scope_id', s_matter, 'field_key', 'official_qme_report'),
    jsonb_build_object('key', 'chronology', 'scope_id', s_matter, 'field_key', 'body_parts_in_records'),
    jsonb_build_object('key', 'discharge', 'scope_id', s_matter, 'field_key', 'treating_facility'),
    jsonb_build_object('key', 'discrepancy', 'scope_id', s_matter, 'field_key', 'qme_discrepancy_analysis')));
  for v_b in select b from jsonb_array_elements(v_ctx -> 'bindings') b loop
    if v_b ->> 'key' = 'qme' or v_b ->> 'key' = 'chronology' then
      v_file := (case when v_b ->> 'key' = 'qme' then v_qme_file else f_plant end);
      if v_b -> 'whole_value' ->> 'file_id' is distinct from v_file
         or coalesce((v_b -> 'whole_value' ->> 'expand')::boolean, false) is not true
         or position(v_file in v_b ->> 'value') = 0
         or (v_ctx -> 'records' -> s_matter::text -> (v_b ->> 'field_key') -> 'whole_value') is null then
        v_fails := v_fails || format('C2 RED (%s): handed %s chars, the file not named (whole_value %s)',
                                     v_b ->> 'key', length(v_b ->> 'value'), coalesce(v_b -> 'whole_value', 'null'));
      else raise notice 'C2 GREEN (%): the first words with file % named, expand = true', v_b ->> 'key', v_b -> 'whole_value' ->> 'file_id'; end if;
    elsif v_b ->> 'key' = 'discharge' then
      if (v_b ->> 'value') is distinct from v_w then
        v_fails := v_fails || format('C2 RED (W): the waiting narrative handed as %s chars — it is %s', length(v_b ->> 'value'), length(v_w));
      else raise notice 'C2 GREEN (W): the waiting narrative handed whole (% chars)', length(v_w); end if;
    else
      if length(v_b ->> 'value') is distinct from v_n_len or v_b ? 'whole_value' then
        v_fails := v_fails || format('C2 RED (N): the discrepancy analysis handed as %s chars (whole_value %s)', length(v_b ->> 'value'), coalesce(v_b -> 'whole_value', 'null'));
      else raise notice 'C2 GREEN (N): the discrepancy analysis handed whole (% chars)', v_n_len; end if;
    end if;
  end loop;
  if jsonb_array_length(coalesce(v_ctx -> 'bindings', '[]'::jsonb)) <> 4 then
    v_fails := v_fails || format('C2: %s bindings came back, not 4 (unresolved %s)', jsonb_array_length(coalesce(v_ctx -> 'bindings', '[]'::jsonb)), v_ctx -> 'unresolved');
  end if;

  -- C3 — the agent's hand-off (the control)
  v_row := custom.resolve_context('project', gen_random_uuid(), array[s_matter], null, '{}'::text[]) -> 'variables' -> 'official_qme_report';
  if v_row -> 'whole_value' ->> 'file_id' is distinct from v_qme_file or coalesce((v_row -> 'whole_value' ->> 'expand')::boolean, false) is not true then
    v_fails := v_fails || format('C3 RED: resolve_context no longer names the QME file (whole_value %s)', coalesce(v_row -> 'whole_value', 'null'));
  else raise notice 'C3 GREEN: resolve_context names file %, expand = true', v_qme_file; end if;

  perform set_config('role', 'none', true);
  if array_length(v_fails, 1) > 0 then
    raise exception E'scopesd1d2: % failed:\n%', array_length(v_fails, 1), array_to_string(v_fails, E'\n');
  end if;
end;
$d1$;
rollback;
\echo 'scopesd1d2_a_long_scope_value_is_never_cut_red_green: PASS'
