-- LANE DRILL-CUSTOM-PARITY — PARITY WITH THE SHARED DOOR (DRILL-DOWN-DESIGN D1).
--
-- THE USE CASE. Cedar Ridge Physical Therapy's clinic owner (admin@admin.com) asks the ONE read
-- door (`platform.drill_describe` / `platform.drill_ask`, lane D1) about the clinic's real
-- "Visits" table — a custom Table — and the answer must be the store's own: the definition
-- `custom.table_dimensions` gives, in the same shape a standard source's definition has, and the
-- same numbers `custom.record_aggregate` gives when asked by Dimension and Measure names.
--
-- It SKIPS by name until lane D1's door is on the database it runs on.

\set ON_ERROR_STOP on
\timing off
\set suite 'drillcustom_parity_green.sql'
\set requires 'function:platform.drill_ask|function:platform.drill_describe|function:custom.table_dimensions|function:platform.drill_declared'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '60s';
set local statement_timeout = '180s';

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_org     constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy
  c_visits  constant uuid := 'b79ba573-fb65-46f9-be54-e37d11ee4206';   -- its "Visits" table
  v_mine jsonb; v_door jsonb; v_std jsonb; v_key text; v_missing text[];
  v_a jsonb; v_b jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ P1. describe through the shared door IS the store's own definition ══
  v_mine := custom.table_dimensions(c_org, c_visits);
  v_door := platform.drill_describe(c_org, jsonb_build_object('kind', 'table', 'id', c_visits));
  if (v_door - 'source') <> (v_mine - 'source') then
    raise exception 'PAR-1: the shared door''s definition of Visits differs from custom.table_dimensions';
  end if;

  -- ══ P2. the definition has the standard source's shape: every part a standard definition
  --        carries (bar the parts only a declared fact has: fact, mode, joins, lane_columns) ══
  select x into v_std from jsonb_array_elements(platform.drill_declared_all()) x limit 1;
  if v_std is null then
    raise exception 'PAR-2: the shared door declares no standard definition to compare with';
  end if;
  select array_agg(k) into v_missing
    from jsonb_object_keys(v_std) k
   where k not in ('fact', 'mode', 'joins', 'lane_columns', 'rollup') and not (v_mine ? k);
  if v_missing is not null then
    raise exception 'PAR-2: Visits'' definition lacks the parts % that a standard definition carries', v_missing;
  end if;
  foreach v_key in array array['key', 'label', 'from', 'kind'] loop
    if exists (select 1 from jsonb_array_elements(v_mine -> 'dimensions') d where not (d ? v_key)) then
      raise exception 'PAR-3: a Visits dimension lacks "%"', v_key;
    end if;
  end loop;
  foreach v_key in array array['key', 'label', 'op', 'additive'] loop
    if exists (select 1 from jsonb_array_elements(v_mine -> 'measures') d where not (d ? v_key)) then
      raise exception 'PAR-4: a Visits measure lacks "%"', v_key;
    end if;
  end loop;

  -- ══ P3. ask through the shared door = the store asked by the same names ══
  select coalesce(jsonb_agg(jsonb_build_object('g', a.groups, 'm', a.measures, 'n', a.row_count) order by a.groups::text), '[]'::jsonb)
    into v_a
    from platform.drill_ask(c_org, jsonb_build_object('kind', 'table', 'id', c_visits),
                            '{"by": ["status"], "show": ["count", "sum_duration_minutes"]}'::jsonb) a;
  select coalesce(jsonb_agg(jsonb_build_object('g', r.groups, 'm', r.measures, 'n', r.row_count) order by r.groups::text), '[]'::jsonb)
    into v_b
    from custom.record_aggregate(c_org, c_visits, '["status"]'::jsonb, '["count", "sum_duration_minutes"]'::jsonb) r;
  if v_a <> v_b or jsonb_array_length(v_a) = 0 then
    raise exception 'PAR-5: the shared door answered % ; the store by name answered %', v_a, v_b;
  end if;
  raise notice 'PARITY GREEN — the shared door describes Visits as the store does, in the standard shape, and answers its numbers: %', v_a;
end $t$;
rollback;
