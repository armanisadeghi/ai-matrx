-- chair-step: one `create or replace function`, no GRANT, no REVOKE, no DROP, nothing deleted.
-- guard: custom/system_enabled
--
-- based-on: custom.tables_described_without_asking() 49f358dd7cce96f5a7f0d90d608ee24b
--
-- SUITE-TAIL-3 finding 1 — THE T10 CENSUS LEARNS THE WHERE-ID-OPENS VOCABULARY.
--
-- THE DEFECT. `custom.tables_described_without_asking()` (STORE-REL 4 / T10, the census
-- `scripts/campaign-tests/storerel_green.sql` clause 4j runs) recognizes a door as having
-- "asked whether the caller may know the table exists" only when its body contains
-- `assert_may_know_table`, `assert_client_may_open(...table_id`, `assert_client_may_change(
-- ...table_id` or `has_visibility(...table_id`. Lane SC-1' (`custom.table_move`,
-- `custom.table_home`, migrations/campaign/sc1p_a_table_says_where_it_lives_and_its_owner_can_
-- move_it.sql) answers the SAME question through a newer, honest-not-found gate:
-- `custom.where_id_opens` calling `custom._where_id_may_open`. The census never learned that
-- vocabulary, so it flags `custom.table_move` as undescribed even though it refuses exactly
-- the way T10 requires — clause 4j is RED on the dev clone today (1 door: custom.table_move)
-- though the door is correct.
--
-- THE RULING (chair). The census learns the new vocabulary; the doors stay. Nothing about
-- `custom.table_move` / `custom.table_home` / `custom.where_id_opens` /
-- `custom._where_id_may_open` changes here — only the census's recognized-gate regex grows
-- two more alternatives.
--
-- INVERSE: migrations/inverse/suitetail3_the_t10_census_knows_the_where_id_opens_gate_down.sql

set lock_timeout = '3s';
set statement_timeout = '5min';

create or replace function custom.tables_described_without_asking()
returns table(function_name text, identity_args text, why text)
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'takes a Table and describes it - its Fields, its Homes, its columns or how many '
         'records it holds - without asking whether the caller may know that Table exists '
         '(VIS-5 / T10)'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and pg_get_function_identity_arguments(p.oid) ~ '(p_table_id uuid|p_home_ids uuid\[\])'
     -- THE CODE, NOT THE PROSE: comments are stripped first, so a sentence promising the
     -- check can never pass this census and a sentence describing the old behaviour can
     -- never fail it.
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~ '(custom\.applicable_fields|custom\.field_kernel_id|custom\.home[^_a-z]|custom\.home_relations|custom\.agg_sql|count\(\*\))'
     -- A door that decides the TABLE by any of the shapes this store uses is not this
     -- census's business: the question was asked, whatever the wording. SUITE-TAIL-3 adds
     -- `custom.where_id_opens` and `custom._where_id_may_open` — the newer honest-not-found
     -- gate SC-1' doors (`custom.table_move`, `custom.table_home`) ask through — to the
     -- vocabulary this census already recognized.
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         !~ '(assert_may_know_table|assert_client_may_change\([^;]{0,160}table_id|assert_client_may_open\([^;]{0,160}table_id|has_visibility\([^;]{0,160}table_id|where_id_opens\(|_where_id_may_open\()'
     and p.proname <> 'tables_described_without_asking'
   order by 1;
$function$;

comment on function custom.tables_described_without_asking() is
  'VIS-5 / T10. Every client door that describes a Table without asking whether the caller may know it exists. Empty is the only passing answer. Recognizes assert_may_know_table, assert_client_may_open/_may_change(...table_id, has_visibility(...table_id, and the where_id_opens / _where_id_may_open gate (SUITE-TAIL-3).';
