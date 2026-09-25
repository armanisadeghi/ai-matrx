-- SUITE-TAIL-3 finding 1's inverse — the T10 census exactly as STORE-REL 4 left it, before it
-- learned the where_id_opens / _where_id_may_open vocabulary. Restores production body
-- 49f358dd7cce96f5a7f0d90d608ee24b byte-for-byte.

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
     -- census's business: the question was asked, whatever the wording.
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         !~ '(assert_may_know_table|assert_client_may_change\([^;]{0,160}table_id|assert_client_may_open\([^;]{0,160}table_id|has_visibility\([^;]{0,160}table_id)'
     and p.proname <> 'tables_described_without_asking'
   order by 1;
$function$;

comment on function custom.tables_described_without_asking() is
  'VIS-5 / T10. Every client door that describes a Table without asking whether the caller may know it exists. Empty is the only passing answer.';
