-- expect: branch=refuse:branch-needs-target-header production=accept autocommit=yes
--
-- THE POSITIVE CONTROL, and the behaviour that must NOT change: a real top-level
-- CREATE INDEX CONCURRENTLY. It cannot run inside a transaction, so `pnpm db:apply` refuses it
-- by name and sends the author to the aidream runner, which applies such a file statement by
-- statement in an autocommit session. A stripper that blanked too much would lose exactly this.
--
create index concurrently if not exists zz_judgment_idx
  on public.zz_judgment_ordinary (id);
