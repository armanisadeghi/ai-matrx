-- expect: branch=refuse:branch-needs-target-header production=accept
--
-- The phrase as an ordinary single-quoted VALUE: data this migration stores, not a statement
-- it runs. Written with `''` doubling, so the stripper has to walk the literal rather than
-- stop at the first quote it sees.
--
insert into public.zz_judgment_notes (body)
  values ('deferred: build it with CREATE INDEX CONCURRENTLY, then ''REINDEX INDEX CONCURRENTLY'' every quarter');
