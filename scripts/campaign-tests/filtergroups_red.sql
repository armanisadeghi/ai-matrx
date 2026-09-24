-- LANE S2-PRIME FILTER-GROUPS — THE RED TWIN. It runs the REAL BYTES of this lane's inverses
-- inside one transaction that ends in ROLLBACK, and asserts each defect exactly as it stood before
-- the lane, on Topa Topa Plumbing & Rooter's Jobs (_filtergroups_dispatch.sql). It PASSES when the
-- inverses put the defects back; filtergroups_green.sql is the same use case after the fix.
--
--   R1  ViewSwitcher's membership door: custom.rule_members holds no EXECUTE for a signed-in person
--       and there is no walled door beside it, so a view with a membership Rule cannot load.
--   R2  Rosa's nested view handed to the list door is read as a FLAT MAP — `op = 'and' and args = …`
--       — and silently answers NO jobs, with no error.
--   R3  The board takes no filter: its headings count all 16 jobs she may see under any view.
--   R5  (chair ruling 2026-09-24) "NOT priority is Low" leaves TT-4111, a job with no priority yet,
--       out of the view — custom.rule_eval's NOT kept an unanswered value undecided for a filter too.
--   R4  The shape guard stops at twelve JSON steps: a field id that is not one of Jobs' fields,
--       seven groups down, is STORED.

\set ON_ERROR_STOP on
\timing off
\set suite 'filtergroups_red.sql'
\set requires 'function:custom.rule_members_visible'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
\i migrations/inverse/filtergroups_not_of_an_unanswered_value_includes_it_in_a_filter_down.sql
-- ON TOP OF LANE S3 the main inverse refuses (restoring the eight-argument aggregate beside S3's
-- nine-argument one would make every call ambiguous), so the undo runs in the real order: this
-- lane's follow-up, then S3's own two inverses, inside this rolled-back transaction.
select to_regprocedure('custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb)') is not null as fg_s3 \gset
\if :fg_s3
\i migrations/inverse/filtergroups_the_compared_aggregate_asks_the_one_fragment_down.sql
\i migrations/inverse/uichamp_s3_a_signed_in_person_may_compare_periods_down.sql
\i migrations/inverse/uichamp_s3_a_number_knows_last_month_and_its_target_down.sql
\endif
\i migrations/inverse/filtergroups_a_signed_in_person_may_read_a_rules_members_down.sql
\i migrations/inverse/filtergroups_a_views_nested_question_is_one_where_clause_down.sql
\i migrations/inverse/filtergroups_the_rule_guard_checks_every_depth_down.sql
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $r1$ begin
  if has_function_privilege('authenticated', 'custom.rule_members(uuid, uuid)', 'execute') then
    raise exception 'R1 did not reproduce: a signed-in person may call custom.rule_members';
  end if;
  if to_regprocedure('custom.rule_members_visible(uuid, uuid, integer, integer)') is not null then
    raise exception 'R1 did not reproduce: the walled membership door is still there';
  end if;
  raise notice 'R1 reproduced — no signed-in EXECUTE on custom.rule_members and no walled door: a view''s membership Rule cannot load in a browser.';
end $r1$;

\i scripts/campaign-tests/_filtergroups_dispatch.sql

do $r$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_jobs uuid; v_expr jsonb; v_n integer; v_deep jsonb; v_rule uuid; i integer;
  f_status text; f_city text; f_tech text; f_priority text; v_j11 jsonb; v_r5 boolean;
begin
  select r.data into v_j11 from custom.record r join fg on fg.v = r.id and fg.k = 'j11';
  select v into v_org from fg where k = 'org'; select v into v_jobs from fg where k = 'jobs';
  select v::text into f_status from fg where k = 'f_status'; select v::text into f_city from fg where k = 'f_city';
  select v::text into f_tech from fg where k = 'f_tech'; select v::text into f_priority from fg where k = 'f_priority';
  v_expr := jsonb_build_object('op','and','args', jsonb_build_array(
    jsonb_build_object('op','or','args', jsonb_build_array(
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_status), jsonb_build_object('const','Open'))),
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_status), jsonb_build_object('const','Scheduled'))))),
    jsonb_build_object('op','or','args', jsonb_build_array(
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_city), jsonb_build_object('const','Ojai'))),
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_tech), jsonb_build_object('const','Maria'))))),
    jsonb_build_object('op','not','args', jsonb_build_array(
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_priority), jsonb_build_object('const','Low')))))));

  -- R5, on the evaluator as it was, asked as membership asks (a filter), before the seat.
  v_r5 := custom.rule_truth(custom.rule_eval(v_org, jsonb_build_object('op','not','args', jsonb_build_array(
            jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_priority), jsonb_build_object('const','low'))))),
            v_j11, jsonb_build_object('purpose','filter')));
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_n from custom.read_records_matching(v_org, v_jobs, v_expr);
  if v_n <> 0 then raise exception 'R2 did not reproduce: the list door answered % jobs for a nested view', v_n; end if;
  raise notice 'R2 reproduced — Rosa''s nested view, handed to the list door, silently answers 0 jobs (want 6).';

  if to_regprocedure('custom.pipeline_board(uuid, uuid, text, jsonb)') is not null then
    raise exception 'R3 did not reproduce: the board takes a filter';
  end if;
  select sum(b.cards)::int into v_n from custom.pipeline_board(v_org, v_jobs, 'amount') b;
  if v_n <> 16 then raise exception 'R3: the board counted % jobs', v_n; end if;
  raise notice 'R3 reproduced — the board has no filter argument; its headings count all 16 jobs under any view (want 6).';

  v_deep := jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', gen_random_uuid()::text)));
  for i in 1..7 loop v_deep := jsonb_build_object('op','and','args', jsonb_build_array(v_deep)); end loop;
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_rule := custom.rule_declare(v_org, jsonb_build_object(
    'name', 'Seven groups down', 'kind', 'predicate', 'uses', jsonb_build_array('membership'),
    'scope_table_id', v_jobs::text, 'applies_to_types', '[]'::jsonb, 'expr', v_deep));
  if v_rule is null then raise exception 'R4: nothing stored'; end if;
  if v_r5 is not null then
    raise exception 'R5 did not reproduce: NOT of TT-4111''s unanswered priority was decided';
  end if;
  raise notice 'R5 reproduced — for a filter, NOT (priority is Low) of TT-4111''s unanswered priority is undecided, so the job is left out.';
  raise notice 'R4 reproduced — a Rule whose field seven groups down is not one of Jobs'' fields was stored (%).', v_rule;
end
$r$;

rollback;
\echo 'filtergroups_red.sql: ALL DEFECTS REPRODUCED'
