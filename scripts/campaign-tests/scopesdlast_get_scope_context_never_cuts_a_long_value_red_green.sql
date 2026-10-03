-- LANE 9 SCOPES-ON-THE-STORE, sublane D-LAST — THE AGENT CONTEXT READ (public.get_scope_context) NEVER HANDS A
-- LONG SCOPE VALUE CUT, measured RED then GREEN on the dev clone
-- (migrations/campaign/scopesdlast_the_agent_context_read_never_cuts_a_long_value.sql).
--
-- THE USE CASE (admin@admin.com's test firm on the clone, nothing written survives): Castellano & Reyes,
-- LLP's workers' compensation matter (Doe, John v. CSV Pharmacy). aidream's agent Tier-B context
-- (scope_system/context_source.py) reads the matter's values through public.get_scope_context.
--   Q  the official QME report, 139,950 characters, kept by the store as a file (real data).
--   P  planted: the Kaiser records chronology (~139 KB) kept as a file the same way.
--   W  planted: the discharge narrative (~120 KB) written and still waiting for its file.
--   N  the QME discrepancy analysis, 3,694 characters, held whole (the control).
-- Oracles from outside the door: Q from context.context_item_values, P and W from the text generated here.
--
-- WHAT MAKES IT FAIL (store path: custom/scope_readers_read_the_store ON for this transaction only):
--   G1  Q or P handed as value_text without the file NAMED in the text and a `whole_value` naming the
--       file with expand = true and the whole length (and, for P, its SHA-256).
--   G2  W handed as anything but its whole text.
--   G3  N handed as anything but its whole text, or with a `whole_value`.
--   G4  the same answer elsewhere: where the file is live, a hash of get_scope_context(include_empty) over
--       the first 5000 store scopes holding a value (cells of a value kept as a file left out), taken with the
--       new body and again with the inverse applied in this transaction, must be equal.
-- RED on the body of 2026-10-02 (G1 Q, G1 P, G2 W); GREEN after. Rolled back.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesdlast_get_scope_context_never_cuts_a_long_value_red_green.sql'
\set expect 'clone'
\set requires 'function:public.get_scope_context|function:custom.context_values'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';
select platform.feature_knob_set('custom', 'scope_readers_read_the_store', 'true'::jsonb) \g /dev/null

create temp table g4_scopes on commit drop as
  select r.id from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.deleted_at is null and t.table_id = custom.table_kernel_id() and t.deleted_at is null
     and t.data ->> 'kept_for' = 'context'
     and jsonb_typeof(r.data -> '_values') = 'object' and r.data -> '_values' <> '{}'::jsonb
   order by r.id limit 5000;
-- One hash of every cell the door answers for those scopes, as service_role, leaving out only the
-- cells of a value kept as a file (the cells this file changes on purpose).
create temp table g4_hash (body text, hash text, scopes int, cells int) on commit drop;
create or replace function pg_temp.g4(p_body text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into g4_hash
  select p_body, md5(string_agg(c.cell::text, '|' order by s.id, c.ord)), count(distinct s.id), count(*)
    from g4_scopes s
    join custom.record r on r.id = s.id
    cross join lateral jsonb_array_elements(public.get_scope_context(s.id, null, true)) with ordinality c(cell, ord)
   where coalesce(r.data -> '_sources' -> (r.data -> '_values' -> (c.cell ->> 'key') ->> 'src') ->> 'kind', '') <> 'whole_value_in_file';
  perform set_config('request.jwt.claims', '', true);
end $f$;
select position('SCOPES-D-LAST' in pg_get_functiondef('public.get_scope_context(uuid,uuid[],boolean)'::regprocedure)) > 0 as file_is_live \gset
\if :file_is_live
select pg_temp.g4('new') \g /dev/null
\echo 'G4: the file is live here: its inverse is applied in this transaction, hashed, and the file applied again'
\i migrations/inverse/scopesdlast_the_agent_context_read_never_cuts_a_long_value_down.sql
select pg_temp.g4('old') \g /dev/null
\i migrations/campaign/scopesdlast_the_agent_context_read_never_cuts_a_long_value.sql
do $g4$
declare v_new record; v_old record;
begin
  select * into v_new from g4_hash where body = 'new';
  select * into v_old from g4_hash where body = 'old';
  if v_new.hash is distinct from v_old.hash or v_new.cells is distinct from v_old.cells then
    raise exception 'G4 RED: every other cell must be the same — old body % (% cells), new body % (% cells) over % scopes',
                    v_old.hash, v_old.cells, v_new.hash, v_new.cells, v_new.scopes;
  end if;
  raise notice 'G4 GREEN: old and new bodies answer the same % cells over % scopes (hash %)', v_new.cells, v_new.scopes, v_new.hash;
end;
$g4$;
\else
select pg_temp.g4('old') \g /dev/null
select format('G4: the file is not live here; old-body hash %s over %s scopes / %s cells', hash, scopes, cells) as g4 from g4_hash \gset
\echo :g4
\endif

do $g$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  o_cr      constant uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';   -- Castellano & Reyes, LLP
  s_matter  constant uuid := '2645730c-97a9-4080-9471-2546d0ce2b66';   -- Doe, John v. CSV Pharmacy
  i_qme     constant uuid := '054c12b6-fac9-45b3-a022-5cedc24ed2b2';   -- official_qme_report
  f_plant   constant text := '6f1d2c3b-4a5e-5f60-8172-93a4b5c6d7e8';   -- the planted chronology's file
  v_qme_old text;  v_qme_file text;  v_file text;  v_len int;  v_sha text;
  v_p text;  v_w text;  v_n_len int;
  v_rows jsonb;  v_row jsonb;
  v_tbl uuid;  v_vis platform.visibility;  v_owner uuid;
  v_fails text[] := '{}';
  k text;
begin
  -- THE ORACLES, from outside the doors under test.
  select v.value_text into v_qme_old from context.context_item_values v
   where v.scope_id = s_matter and v.context_item_id = i_qme and v.is_current;
  if coalesce(length(v_qme_old), 0) <= 1000 then
    raise exception 'scopesdlast: precondition — the old table no longer holds the whole QME report (% chars); the suite has no oracle', length(v_qme_old);
  end if;
  select r.data -> '_sources' -> (r.data -> '_values' -> 'official_qme_report' ->> 'src') ->> 'file_id', r.table_id, r.visibility, r.created_by
    into v_qme_file, v_tbl, v_vis, v_owner
    from custom.record r where r.organization_id = o_cr and r.id = s_matter;
  if v_qme_file is null then
    raise exception 'scopesdlast: precondition — the QME report is not kept as a file in the store on this copy';
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

  v_rows := public.get_scope_context(s_matter, null, true);
  foreach k in array array['official_qme_report', 'body_parts_in_records', 'treating_facility', 'qme_discrepancy_analysis'] loop
    select x into v_row from jsonb_array_elements(v_rows) x where x ->> 'key' = k;
    if v_row is null then
      v_fails := v_fails || format('%s did not come back through public.get_scope_context', k);
    elsif k in ('official_qme_report', 'body_parts_in_records') then
      v_file := case when k = 'official_qme_report' then v_qme_file else f_plant end;
      v_len  := case when k = 'official_qme_report' then length(v_qme_old) else length(v_p) end;
      v_sha  := case when k = 'body_parts_in_records' then encode(sha256(convert_to(v_p, 'UTF8')), 'hex') end;
      if v_row -> 'whole_value' ->> 'file_id' is distinct from v_file
         or coalesce((v_row -> 'whole_value' ->> 'expand')::boolean, false) is not true
         or (v_row -> 'whole_value' ->> 'chars')::int is distinct from v_len
         or (v_sha is not null and v_row -> 'whole_value' ->> 'sha256' is distinct from v_sha)
         or position(v_file in coalesce(v_row ->> 'value_text', '')) = 0 then
        v_fails := v_fails || format('G1 RED (%s): handed %s chars of value_text, file named in text: %s, whole_value %s — it is %s chars in file %s',
                                     k, length(v_row ->> 'value_text'), position(v_file in coalesce(v_row ->> 'value_text', '')) > 0,
                                     coalesce(v_row -> 'whole_value', 'null'), v_len, v_file);
      else raise notice 'G1 GREEN (%): the first words with file % named, whole_value expand = true, % chars', k, v_file, v_len; end if;
    elsif k = 'treating_facility' then
      if (v_row ->> 'value_text') is distinct from v_w then
        v_fails := v_fails || format('G2 RED (W): the waiting narrative handed as %s chars — it is %s', length(v_row ->> 'value_text'), length(v_w));
      else raise notice 'G2 GREEN (W): the waiting narrative handed whole (% chars), whole_value %', length(v_w), v_row -> 'whole_value'; end if;
    else
      if length(v_row ->> 'value_text') is distinct from v_n_len or v_row ? 'whole_value' then
        v_fails := v_fails || format('G3 RED (N): the discrepancy analysis handed as %s chars (whole_value %s) — it is %s held whole',
                                     length(v_row ->> 'value_text'), coalesce(v_row -> 'whole_value', 'null'), v_n_len);
      else raise notice 'G3 GREEN (N): the discrepancy analysis handed whole (% chars), no whole_value', v_n_len; end if;
    end if;
  end loop;

  perform set_config('role', 'none', true);
  if array_length(v_fails, 1) > 0 then
    raise exception E'scopesdlast: % failed:\n%', array_length(v_fails, 1), array_to_string(v_fails, E'\n');
  end if;
end;
$g$;
rollback;
\echo 'scopesdlast_get_scope_context_never_cuts_a_long_value_red_green: PASS'
