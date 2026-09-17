-- expect: branch=refuse:branch-needs-target-header production=accept
--
-- THE DEFECT, measured 2026-09-17: the words `CREATE INDEX CONCURRENTLY` here are HINT TEXT
-- inside a `$$ … $$` function body — prose an author reads, not DDL the migration executes.
-- The autocommit detector read them off comment-only-stripped text and refused the whole file,
-- sending its author to the other runner for a statement that is not in it.
--
create function public.zz_judgment_hint_dollar() returns void language plpgsql as $$
begin
  raise exception 'public.zz_judgment_ordinary is a hot table'
    using hint = 'build it with CREATE INDEX CONCURRENTLY; VACUUM the table afterwards';
end
$$;
