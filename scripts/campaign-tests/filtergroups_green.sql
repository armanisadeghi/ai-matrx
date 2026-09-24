-- LANE S2-PRIME FILTER-GROUPS — THE GREEN SUITE. A dispatcher's nested view, the same jobs
-- through the grid, the board and the aggregate, and a Rule's members a signed-in person can read.
--
-- THE USE CASE (_filtergroups_dispatch.sql): Rosa Delgado (test@test.com) dispatches for Topa Topa
-- Plumbing & Rooter. Her morning view is
--   (status is Open OR status is Scheduled) AND (city is Ojai OR technician is Maria)
--   AND NOT priority is Low
-- The owner, Hector Morales (admin@admin.com), shares every job with dispatch except two warranty
-- call-backs he keeps to himself.
--
-- RUN IT (from matrx-frontend):
--   "$PSQL" "<clone or branch DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/filtergroups_green.sql
--
-- WHAT MAKES IT FAIL — one clause per part:
--   0  a signed-in person holds no EXECUTE on custom.rule_members_visible or the filtered board
--      (the chair-step grant is missing) — judged BEFORE the fixture, which re-opens doors inside
--      its own transaction and would hide it.
--   1  the grid (read_records_matching) reads the nested view as a flat map, or evaluates AND / OR /
--      NOT differently from custom.rule_eval → not the six jobs Rosa may see, in either spelling
--      (typed labels "Open" … or the stored keys "open" …).
--   2  the board's headings ignore the view → Open 3 / $1,255 and Scheduled 3 / $1,980 become the
--      whole company's counts.
--   3  the aggregate (count + total on her dashboard) disagrees with the grid.
--   4  custom.rule_members_visible answers a job she may not see, an unmasked stored row, another
--      organization's Rule, a stranger, or a different set from the grid; or it does not page.
--   5  with every job visible (the owner), the compiled set differs from the evaluator's own
--      answer — custom.rule_members, the server lane's loop over custom.rule_eval.
--   6  a node a list cannot ask (sibling_count) is silently ignored instead of refused by name;
--      a field of another table is accepted; the flat compiler silently reads a Rule as a map.
--   7  the Rule shape guard stops checking seven groups down.
-- RED before the lane's files (doors absent), GREEN after. Its red twin is filtergroups_red.sql.

\set ON_ERROR_STOP on
\timing off
\set suite 'filtergroups_green.sql'
\set requires 'function:custom.read_records_matching'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

-- ══ 0. THE GRANT, BEFORE THE FIXTURE ══
do $g$ begin
  if to_regprocedure('custom.rule_members_visible(uuid, uuid, integer, integer)') is null
     or to_regprocedure('custom.pipeline_board(uuid, uuid, text, jsonb)') is null then
    raise exception 'S2-0: custom.rule_members_visible / the four-argument custom.pipeline_board are not on this database — apply filtergroups_a_views_nested_question_is_one_where_clause.sql';
  end if;
  if not has_function_privilege('authenticated', 'custom.rule_members_visible(uuid, uuid, integer, integer)', 'execute')
     or not has_function_privilege('authenticated', 'custom.pipeline_board(uuid, uuid, text, jsonb)', 'execute') then
    raise exception 'S2-0: a signed-in person holds no EXECUTE on custom.rule_members_visible / the filtered custom.pipeline_board — apply filtergroups_a_signed_in_person_may_read_a_rules_members.sql';
  end if;
  if has_function_privilege('authenticated', 'custom.rule_members(uuid, uuid)', 'execute') then
    raise exception 'S2-0: custom.rule_members is granted to a signed-in person — it loops the whole table with no visibility check and must stay server-only';
  end if;
  raise notice 'S2 part 0 PASS — a signed-in person may call rule_members_visible and the filtered board; rule_members stays server-only.';
end $g$;

\i scripts/campaign-tests/_filtergroups_dispatch.sql

do $t$
declare
  c_admin_j    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid; v_jobs uuid; v_rule uuid;
  f_status text; f_city text; f_tech text; f_priority text; f_amount text; f_job text;
  e_labels jsonb; e_keys jsonb;
  v_grid text[]; v_grid_keys text[]; v_members text[]; v_page1 text[]; v_page2 text[]; v_all text[];
  v_expect_dana constant text[] := array['TT-4101','TT-4102','TT-4104','TT-4112','TT-4115','TT-4116'];
  v_expect_all  constant text[] := array['TT-4101','TT-4102','TT-4104','TT-4108','TT-4112','TT-4115','TT-4116','TT-4117'];
  v_board jsonb; v_agg record; v_n integer; v_caught text; v_doc jsonb; v_server text[];
  v_other_rule uuid; v_deep jsonb; i integer;
begin
  select v into v_org from fg where k = 'org'; select v into v_jobs from fg where k = 'jobs';
  select v::text into f_status from fg where k = 'f_status'; select v::text into f_city from fg where k = 'f_city';
  select v::text into f_tech from fg where k = 'f_tech'; select v::text into f_priority from fg where k = 'f_priority';
  select v::text into f_amount from fg where k = 'f_amount'; select v::text into f_job from fg where k = 'f_job';

  -- What the condition builder writes: the words Rosa typed.
  e_labels := jsonb_build_object('op','and','args', jsonb_build_array(
    jsonb_build_object('op','or','args', jsonb_build_array(
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_status), jsonb_build_object('const','Open'))),
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_status), jsonb_build_object('const','Scheduled'))))),
    jsonb_build_object('op','or','args', jsonb_build_array(
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_city), jsonb_build_object('const','Ojai'))),
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_tech), jsonb_build_object('const','Maria'))))),
    jsonb_build_object('op','not','args', jsonb_build_array(
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_priority), jsonb_build_object('const','Low')))))));
  -- The same question with the stored keys — what custom.rule_eval compares against.
  e_keys := replace(replace(replace(replace(e_labels::text, '"Open"', '"open"'), '"Scheduled"', '"scheduled"'),
                            '"Maria"', '"maria"'), '"Low"', '"low"')::jsonb;

  -- A live Rule of ANOTHER organization (the wall must read it as absent). Read before the seat.
  select r.id into v_other_rule from custom.record r
   where r.organization_id <> v_org and r.table_id = custom.rule_kernel_id() and r.deleted_at is null limit 1;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception 'S2: this suite did not take the seat'; end if;

  -- The owner saves Rosa's view as a membership Rule (a Rule is the table's shape: admin).
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_rule := custom.rule_declare(v_org, jsonb_build_object(
    'name', 'Rosa''s morning board', 'kind', 'predicate', 'uses', jsonb_build_array('membership'),
    'scope_table_id', v_jobs::text, 'applies_to_types', '[]'::jsonb, 'expr', e_keys));

  -- ══ 1. THE GRID ══
  perform set_config('request.jwt.claims', c_dana_j, true);
  select array_agg(m.document ->> 'job_no' order by m.document ->> 'job_no') into v_grid
    from custom.read_records_matching(v_org, v_jobs, e_labels) m;
  select array_agg(m.document ->> 'job_no' order by m.document ->> 'job_no') into v_grid_keys
    from custom.read_records_matching(v_org, v_jobs, e_keys) m;
  if v_grid is distinct from v_expect_dana or v_grid_keys is distinct from v_expect_dana then
    raise exception 'S2-1: the grid answered % (labels) / % (keys); Rosa''s view is %', v_grid, v_grid_keys, v_expect_dana;
  end if;
  -- TT-4111 (Ojai, Scheduled, no priority yet) is NOT in it: "not (priority is Low)" of an unanswered
  -- priority is undecided, exactly as custom.rule_eval answers it (part 5 proves the evaluator agrees).
  raise notice 'S2 part 1 PASS — the grid answers Rosa''s six jobs (TT-4101, 4102, 4104, 4112, 4115, 4116) in both spellings; the two call-backs she was not given are not among them.';

  -- ══ 2. THE BOARD ══
  select jsonb_object_agg(b.stage_key, jsonb_build_object('cards', b.cards, 'total', b.total)) into v_board
    from custom.pipeline_board(v_org, v_jobs, 'amount', e_labels) b;
  if (v_board #>> '{open,cards}')::int <> 3 or (v_board #>> '{open,total}')::numeric <> 1255
     or (v_board #>> '{scheduled,cards}')::int <> 3 or (v_board #>> '{scheduled,total}')::numeric <> 1980
     or (v_board #>> '{in_progress,cards}')::int <> 0 or (v_board #>> '{completed,cards}')::int <> 0
     or (v_board #>> '{invoiced,cards}')::int <> 0 then
    raise exception 'S2-2: the board''s headings under Rosa''s view were %', v_board;
  end if;
  -- And the three-argument board still counts every job she may see (16 = 18 less the two call-backs).
  select sum(b.cards)::int into v_n from custom.pipeline_board(v_org, v_jobs, 'amount') b;
  if v_n <> 16 then raise exception 'S2-2b: the unfiltered board counts % jobs for Rosa, not 16', v_n; end if;
  raise notice 'S2 part 2 PASS — the board under her view: Open 3 / $1,255, Scheduled 3 / $1,980, the rest 0; the old three-argument board still counts all 16 she may see.';

  -- ══ 3. THE AGGREGATE ══
  select a.row_count, a.measures into v_agg
    from custom.record_aggregate(v_org, v_jobs, '[]'::jsonb,
           '[{"op":"sum","key":"amount"}]'::jsonb, null, e_labels) a;
  if v_agg.row_count <> 6 or (v_agg.measures ->> 'sum_amount')::numeric <> 3235 then
    raise exception 'S2-3: the aggregate under Rosa''s view counted % jobs worth % (want 6, 3235)', v_agg.row_count, v_agg.measures;
  end if;
  raise notice 'S2 part 3 PASS — her dashboard number: 6 jobs, $3,235 — the grid''s six and the board''s 3 + 3.';

  -- ══ 4. THE RULE'S MEMBERS, WALLED AND PAGED ══
  select array_agg(m.document ->> 'job_no' order by m.document ->> 'job_no') into v_members
    from custom.rule_members_visible(v_org, v_rule) m;
  if v_members is distinct from v_expect_dana then
    raise exception 'S2-4a: rule_members_visible answered % for Rosa (want %)', v_members, v_expect_dana;
  end if;
  -- The documents are the read door's: masked documents, never the stored row (no `_values`).
  select m.document into v_doc from custom.rule_members_visible(v_org, v_rule) m limit 1;
  if v_doc ? '_values' or not (v_doc ? 'job_no') then
    raise exception 'S2-4b: a member came back as a stored row, not the read door''s document: %', v_doc;
  end if;
  -- Paged: two pages of three are the six, with nothing twice.
  select array_agg(m.document ->> 'job_no') into v_page1 from custom.rule_members_visible(v_org, v_rule, 3, 0) m;
  select array_agg(m.document ->> 'job_no') into v_page2 from custom.rule_members_visible(v_org, v_rule, 3, 3) m;
  if cardinality(v_page1) <> 3 or cardinality(v_page2) <> 3 or v_page1 && v_page2
     or (select array_agg(x order by x) from unnest(v_page1 || v_page2) x) is distinct from v_expect_dana then
    raise exception 'S2-4c: pages % and % are not the six members once each', v_page1, v_page2;
  end if;
  -- A stranger is refused at the wall.
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform 1 from custom.rule_members_visible(v_org, v_rule) m;
    raise exception 'S2-4d: a stranger read Rosa''s view';
  exception when insufficient_privilege then null;
  end;
  -- Another organization's Rule reads exactly as an invented id.
  perform set_config('request.jwt.claims', c_dana_j, true);
  for i in 1..2 loop
    begin
      perform 1 from custom.rule_members_visible(v_org, case when i = 1 then v_other_rule else gen_random_uuid() end) m;
      raise exception 'S2-4e: rule_members_visible answered for a Rule that is not this organization''s';
    exception when foreign_key_violation then
      if sqlerrm <> 'that rule is not there' then raise; end if;
    end;
  end loop;
  -- And the server-only door is still refused from her seat.
  begin
    perform 1 from custom.rule_members(v_org, v_rule);
    raise exception 'S2-4f: the server-only rule_members answered a signed-in person';
  exception when insufficient_privilege then null;
  end;
  raise notice 'S2 part 4 PASS — rule_members_visible: her six, masked documents, two pages of three, a stranger refused, another organization''s Rule and an invented id answered alike ("that rule is not there"), rule_members refused from her seat.';

  -- ══ 5. THE COMPILER AND THE EVALUATOR AGREE (the owner sees every job) ══
  perform set_config('request.jwt.claims', c_admin_j, true);
  select array_agg(m.document ->> 'job_no' order by m.document ->> 'job_no') into v_all
    from custom.rule_members_visible(v_org, v_rule, 500, 0) m;
  if v_all is distinct from v_expect_all then
    raise exception 'S2-5a: the owner''s members were % (want %)', v_all, v_expect_all;
  end if;
end
$t$;

-- The evaluator's own loop is a server-lane door: asked as the role that owns the store.
reset role;
do $t5$
declare
  v_rule uuid; v_org uuid; v_server text[];
begin
  select v into v_org from fg where k = 'org';
  select r.id into v_rule from custom.record r where r.organization_id = v_org and r.table_id = custom.rule_kernel_id()
     and r.data ->> 'name' = 'Rosa''s morning board';
  select array_agg(m.data ->> 'job_no' order by m.data ->> 'job_no') into v_server from custom.rule_members(v_org, v_rule) m;
  if v_server is distinct from array['TT-4101','TT-4102','TT-4104','TT-4108','TT-4112','TT-4115','TT-4116','TT-4117'] then
    raise exception 'S2-5b: custom.rule_members (the evaluator, row by row) answered %, the compiled filter the eight', v_server;
  end if;
  raise notice 'S2 part 5 PASS — with every job visible, the compiled WHERE clause and custom.rule_eval row by row answer the same eight jobs (TT-4111, priority unanswered, is out of both).';
end
$t5$;

do $t6$
declare
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_jobs uuid; v_foreign text; v_caught text; v_deep jsonb; v_rule uuid; i integer;
  f_status text; f_city text;
begin
  select v into v_org from fg where k = 'org'; select v into v_jobs from fg where k = 'jobs';
  select v::text into f_status from fg where k = 'f_status'; select v::text into f_city from fg where k = 'f_city';
  select f.id::text into v_foreign from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid is distinct from v_jobs limit 1;

  -- ══ 6. REFUSED BY NAME, NEVER IGNORED ══
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform 1 from custom.read_records_matching(v_org, v_jobs,
      jsonb_build_object('op','gte','args', jsonb_build_array(
        jsonb_build_object('op','sibling_count','same', jsonb_build_array(f_city)), jsonb_build_object('const', 1))));
    raise exception 'S2-6a: a sibling_count filter was not refused';
  exception when feature_not_supported then
    if sqlerrm not like 'a filter cannot ask "sibling_count"%' then raise; end if;
  end;
  if v_foreign is not null then
    begin
      perform 1 from custom.read_records_matching(v_org, v_jobs,
        jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_foreign))));
      raise exception 'S2-6b: a field of another table was accepted in a filter';
    exception when foreign_key_violation then null;
    end;
  end if;
  reset role;
  begin
    perform custom.record_filter_sql(jsonb_build_object('op','and','args','[]'::jsonb));
    raise exception 'S2-6c: the flat compiler read a Rule expression as a flat map';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'S2 part 6 PASS — sibling_count refused by name (0A000), another table''s field refused (23503), the flat compiler refuses a Rule expression rather than matching nothing.';

  -- ══ 7. THE SHAPE GUARD, SEVEN GROUPS DOWN ══
  -- Seven nested ALL groups with a field id that is not one of Jobs' fields at the bottom.
  v_deep := jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', gen_random_uuid()::text)));
  for i in 1..7 loop v_deep := jsonb_build_object('op','and','args', jsonb_build_array(v_deep)); end loop;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  begin
    v_rule := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'Seven groups down', 'kind', 'predicate', 'uses', jsonb_build_array('membership'),
      'scope_table_id', v_jobs::text, 'applies_to_types', '[]'::jsonb, 'expr', v_deep));
    raise exception 'S2-7: a Rule whose field seven groups down is not one of the table''s fields was stored';
  exception when check_violation then
    if sqlerrm not like '%points at a field that is not one of that table''s fields%' then raise; end if;
  end;
  -- … and the same depth with a REAL field is stored, and compiles.
  v_deep := jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_city), jsonb_build_object('const','Ojai')));
  for i in 1..7 loop v_deep := jsonb_build_object('op', case when i % 2 = 0 then 'and' else 'or' end, 'args', jsonb_build_array(v_deep)); end loop;
  v_rule := custom.rule_declare(v_org, jsonb_build_object(
    'name', 'Ojai, seven groups down', 'kind', 'predicate', 'uses', jsonb_build_array('membership'),
    'scope_table_id', v_jobs::text, 'applies_to_types', '[]'::jsonb, 'expr', v_deep));
  select count(*) into i from custom.rule_members_visible(v_org, v_rule, 500, 0);
  if i <> 9 then raise exception 'S2-7b: seven groups deep, "city is Ojai" answered % jobs for the owner (want 9)', i; end if;
  raise notice 'S2 part 7 PASS — the shape guard refuses a bad field id seven groups down and stores a real one; the compiled filter answers the nine Ojai jobs through seven groups.';
end
$t6$;

rollback;
\echo 'filtergroups_green.sql: ALL PARTS PASS'
