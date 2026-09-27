-- LANE DATA-V2-BASICS — A FILTER THAT IS NOT A SET OF CONDITIONS IS REFUSED (BREAKER-1 F12).
--
-- THE USE CASE: an agent reading the "September service board — Camarillo" table (admin@admin.com's
-- Workspace) sends `p_filter = "Completed"` meaning "the completed jobs". The door answered EVERY
-- row, as if no filter had been asked. What must hold, from the signed-in person's seat:
--   A. a string, a number or a list as the filter is refused by name (22023), nothing read;
--   B. an object filter is still answered, and {} is the same question as no filter.
-- RUN IT (clone; always rolled back):
--   psql-17 "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/databasics_a_filter_that_is_not_conditions_is_refused.sql
-- ITS RED: on the body before the campaign file it fails at A (the string answers every row).

\set ON_ERROR_STOP on
\timing off

\set suite 'databasics_a_filter_that_is_not_conditions_is_refused.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '120s';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics04"}', true);

do $t$
declare
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  c_board constant uuid := '3260bbbe-aaa8-4148-a4d9-7ad880e7976d';  -- September service board — Camarillo
  v_bad   jsonb;
  v_all   integer;
  v_page  jsonb;
begin
  foreach v_bad in array array['"Completed"'::jsonb, '42'::jsonb, '["Completed"]'::jsonb] loop
    begin
      v_page := custom.read_records_page(c_ws, c_board, v_bad, null, '[]'::jsonb, null, false, 5, 0);
      raise exception 'A: the filter % was read as no filter (% rows)', v_bad, v_page ->> 'total';
    exception when invalid_parameter_value then
      if sqlerrm not like 'A filter is a set of column conditions%' then
        raise exception 'A: the refusal does not say what a filter is: %', sqlerrm;
      end if;
    end;
  end loop;
  -- B. an empty object and no filter at all are the same question, and both are answered.
  v_page := custom.read_records_page(c_ws, c_board, '{}'::jsonb, null, '[]'::jsonb, null, false, 5, 0);
  v_all := (v_page ->> 'total')::integer;
  if v_all is null or v_all is distinct from (custom.read_records_page(c_ws, c_board, null, null, '[]'::jsonb, null, false, 5, 0) ->> 'total')::integer then
    raise exception 'B: {} and no filter answer differently (%).', v_page;
  end if;
  v_page := custom.read_records_page(c_ws, c_board, '{"status": "Completed"}'::jsonb, null, '[]'::jsonb, null, false, 5, 0);
  if v_page ->> 'total' is null then
    raise exception 'B: an object filter is no longer answered (%).', v_page;
  end if;
  raise notice 'GREEN: A B — a filter that is not a set of conditions is refused; {} still reads % rows', v_all;
end
$t$;

rollback;
