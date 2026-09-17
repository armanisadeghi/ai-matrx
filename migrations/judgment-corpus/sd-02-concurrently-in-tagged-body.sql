-- expect: branch=refuse:branch-needs-target-header production=accept
--
-- The same prose in a TAGGED body, `$doc$ … $doc$`. A detector that only knew `$$` would read
-- this one as DDL; the stripper skips a dollar body whatever its tag.
--
create function public.zz_judgment_hint_tagged() returns text language sql as $doc$
  select 'CREATE INDEX CONCURRENTLY is how this index was built; REINDEX INDEX CONCURRENTLY renews it'::text
$doc$;
